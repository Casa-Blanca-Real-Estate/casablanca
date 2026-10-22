// Review comps (Dispatch 25, D-29): a modal flow over Sort, one comp per step,
// for every comp in the report, untiered ones first and Sort's order otherwise.
// Each step is one focused screen: the comp (photo, address, the facts Sort
// shows, its features and the house's checks), the agent's reasoning (the
// comp's Sort note and tags, the same fields the card edits), Hubert's area,
// and the tier. Back and Next, "3 of 11", and Escape closes keeping what was
// written. It's a step, not a chat: what Hubert says here is about this comp.
//
// The human drives. A practice agent writes their note and picks tags, asks
// for feedback (as often as they like), and only then can show Hubert's own
// take beside theirs; the server refuses his take before a feedback round. A
// full agent sees his take on first opening a comp, can copy it into their
// note or tell him what he's missing and ask again. Either way the agent sets
// the tier: his is a suggestion, and his weak flag never changes it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CompOut, Tier } from '../../../engine/index.ts';
import { compDistance } from '../../../workspace/distance.ts';
import { groupsFor, isTag } from '../../../workspace/features.ts';
import { psf } from '../../../workspace/format.ts';
import { latest, reviewOrder, stepDone, takeUnlocked, weakFlag, type ReviewEntry } from '../../../workspace/review.ts';
import { TagPicker } from '../comp/Pickers.tsx';
import { Info } from '../newcomp/Frame.tsx';
import { compFeatures, Photos } from '../sort/CompCard.tsx';
import { countText, groupRows, monthYear, PRICE_LABEL, shortPrice, sizeText, TAG_INFO, toRow, type Row } from '../sort/rows.ts';
import { compStatus, STATUS_LABEL } from '../workspace/comps.tsx';
import type { Workspace } from '../workspace/model.ts';
import { homeName } from '../workspace/screens.ts';
import '../../styles/review.css';

const TIERS: { tier: Tier; label: string; name: string }[] = [
  { tier: 'primary', label: '1st', name: '1st tier' },
  { tier: 'secondary', label: '2nd', name: '2nd tier' },
  { tier: 'excluded', label: '✕', name: 'Excluded' },
];
const TIER_WORD: Record<Tier, string> = { primary: '1st', secondary: '2nd', excluded: '✕ (out)' };
const TIER_INFO = '1st: counts. Only 1st-tier comps set the range. 2nd: context, shown but not counted. ✕: out of every figure. ★: the main comp; the email leads with it.';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface Draft {
  note: string;
  tags: string[];
}

export function ReviewFlow({ ws, startAt, onClose }: { ws: Workspace; startAt: string | null; onClose: () => void }) {
  const outById = useMemo(() => new Map<string, CompOut>((ws.output?.comps ?? []).map((c) => [c.id, c])), [ws.output]);
  const rows = useMemo(
    () => groupRows(ws.comps.map((c) => toRow(c, outById.get(c.id), ws.level))).flatMap((g) => g.rows).filter((r) => r.group !== 'unsortable' && r.rcId),
    [ws.comps, outById, ws.level],
  );
  // The order is set when the flow opens: tiering a comp doesn't move it under the agent's feet.
  const [order] = useState<string[]>(() => reviewOrder(rows).map((r) => r.rcId!));
  const steps = order.map((id) => rows.find((r) => r.rcId === id)).filter((r): r is Row => Boolean(r));
  const [at, setAt] = useState(() => {
    const i = startAt ? order.indexOf(startAt) : order.findIndex((id) => {
      const r = rows.find((x) => x.rcId === id);
      return r ? !stepDone(r.c, ws.level) : false;
    });
    return Math.max(0, i);
  });
  const i = Math.min(at, Math.max(0, steps.length - 1));
  const row = steps[i];
  // The agent's unsaved words, by comp: kept while they move between steps, saved as they leave each.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Practice agents' takes they've opened, this time through.
  const [opened, setOpened] = useState<Set<string>>(() => new Set());

  const draftOf = useCallback((r: Row): Draft => drafts[r.rcId!] ?? { note: r.note ?? '', tags: r.tags }, [drafts]);
  const dirty = (r: Row) => {
    const d = drafts[r.rcId!];
    return Boolean(d) && (d!.note.trim() !== (r.note ?? '') || !same(d!.tags, r.tags));
  };

  /** Saves the step's note and tags, if they changed, with any other edit (a tier). */
  const save = useCallback(async (r: Row, extra: { tier?: Tier; anchor?: boolean } = {}): Promise<boolean> => {
    if (ws.readOnly || !r.rcId) return true;
    const d = drafts[r.rcId];
    const edit: Parameters<Workspace['editComp']>[1] = { ...extra };
    if (d && d.note.trim() !== (r.note ?? '')) edit.note = d.note.trim() || null;
    if (d && !same(d.tags, r.tags)) edit.tags = d.tags;
    if (!Object.keys(edit).length) return true;
    setSaving(true);
    setError(null);
    try {
      await ws.editComp(r.rcId, edit);
      setDrafts((all) => {
        const { [r.rcId!]: _done, ...rest } = all;
        return rest;
      });
      return true;
    } catch (e) {
      setError(`Not saved: ${message(e)}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [drafts, ws]);

  const close = useCallback(async () => {
    if (row && dirty(row) && !(await save(row))) return;
    onClose();
  }, [row, save, onClose]);
  const closeRef = useRef(close);
  closeRef.current = close;

  const go = async (next: number) => {
    if (row && !(await save(row))) return;
    setError(null);
    setAt(next);
  };

  // Opening a comp in the flow is reviewing it, as opening its row is.
  useEffect(() => {
    const j = row?.c.judgment;
    if (j && row?.rcId && !j.reviewedAt && !ws.readOnly) ws.editComp(row.rcId, { reviewed: true }).catch(() => undefined);
  }, [row?.rcId]);

  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) void closeRef.current();
    };
    addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      removeEventListener('keydown', onKey);
    };
  }, []);

  const doneCount = steps.filter((r) => stepDone(r.c, ws.level)).length;

  return (
    <div className="rv-scrim">
      <div className="rv-modal" role="dialog" aria-modal="true" aria-label="Review comps" tabIndex={-1} ref={dialog}>
        <div className="rv-head">
          <span className="rv-title">Review comps</span>
          <span className="rv-count" aria-live="polite">{steps.length ? `${i + 1} of ${steps.length}` : 'No comps'}</span>
          <span className="rv-progress" aria-hidden="true">
            {steps.map((r, k) => (
              <span key={r.rcId} className={`${k === i ? 'here' : ''}${stepDone(r.c, ws.level) ? ' done' : ''}`} />
            ))}
          </span>
          <span className="rv-donecount">{doneCount} of {steps.length} reviewed</span>
          <button type="button" className="rv-x" aria-label="Close: what you wrote is kept" title="Close (Esc): what you wrote is kept" onClick={() => void close()}>✕</button>
        </div>
        {row ? (
          <Step
            key={row.rcId}
            ws={ws}
            row={row}
            out={outById.get(row.c.id)}
            draft={draftOf(row)}
            onDraft={(d) => setDrafts((all) => ({ ...all, [row.rcId!]: d }))}
            save={(extra) => save(row, extra)}
            saving={saving}
            opened={opened.has(row.rcId!)}
            onOpened={() => setOpened((s) => new Set(s).add(row.rcId!))}
          />
        ) : (
          <p className="rv-empty">Every comp here has been taken out of the report.</p>
        )}
        <div className="rv-foot">
          <button type="button" className="link rv-back" disabled={i === 0 || saving} onClick={() => void go(i - 1)}>← Back</button>
          {error && <p className="rv-err" role="alert">{error}</p>}
          <span className="rv-foot-r">
            {i < steps.length - 1 ? (
              <button type="button" className="btn primary" disabled={saving} onClick={() => void go(i + 1)}>Next comp →</button>
            ) : (
              <button type="button" className="btn primary" disabled={saving} onClick={() => void close()}>Done</button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function Step({ ws, row, out, draft, onDraft, save, saving, opened, onOpened }: {
  ws: Workspace;
  row: Row;
  out: CompOut | undefined;
  draft: Draft;
  onDraft: (d: Draft) => void;
  save: (extra?: { tier?: Tier; anchor?: boolean }) => Promise<boolean>;
  saving: boolean;
  opened: boolean;
  onOpened: () => void;
}) {
  const c = row.c;
  const j = c.judgment!;
  const rcId = row.rcId!;
  const practice = ws.level === 'practice';
  const home = homeName(ws.intake, ws.report.title);
  const review = j.review ?? [];
  const feedback = latest(review, 'feedback');
  const take = latest(review, 'take');
  const unlocked = takeUnlocked(review, ws.level);
  const showTake = Boolean(take) && (!practice || opened);
  const weak = weakFlag(review, ws.level, opened);
  const [busy, setBusy] = useState<'feedback' | 'take' | 'tier' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asks, setAsks] = useState('');
  const status = compStatus(c);
  const features = useMemo(() => compFeatures(row), [row]);
  const groups = useMemo(() => groupsFor(c.record.facts.property_type?.value ?? ws.propertyType), [c.record.facts.property_type?.value, ws.propertyType]);
  const homeId = ws.output?.subject.identity;
  const distance = homeId ? compDistance(homeId, c.record.identity, out?.distance_miles ?? null, ws.locations, ws.geocodes) : null;
  const checks = (out?.checks ?? []).filter((k) => k.status === 'flagged');
  const canEdit = !ws.readOnly;
  const noteSaved = Boolean(row.note);
  const tagsSaved = row.tags.some(isTag);
  const hasNote = draft.note.trim().length > 0;
  const hasTags = draft.tags.length > 0;

  async function ask(job: 'feedback' | 'take', words?: string) {
    setProblem(null);
    if (job === 'feedback' && !hasNote) return setProblem('Write why it’s a comp first: Hubert gives feedback on your reasoning.');
    if (job === 'feedback' && practice && !hasTags) return setProblem('Pick its tags too: Hubert reviews your note and tags together.');
    setBusy(job);
    try {
      if (!(await save())) return;
      await ws.askReview(rcId, job, words);
      if (job === 'take') {
        onOpened();
        setAsks('');
      }
    } catch (e) {
      setProblem(message(e));
    } finally {
      setBusy(null);
    }
  }

  // A full agent sees Hubert's take when they first open a comp: asked for once, if he hasn't given one.
  const asked = useRef(false);
  useEffect(() => {
    if (practice || ws.readOnly || take || asked.current || c.unconfirmed) return;
    asked.current = true;
    void ask('take');
  }, [practice, ws.readOnly, take, c.unconfirmed]);

  async function pickTier(t: Tier) {
    if (!canEdit || t === row.tier) return;
    setBusy('tier');
    setProblem(null);
    try {
      await save({ tier: t });
    } finally {
      setBusy(null);
    }
  }

  async function star() {
    if (!canEdit) return;
    setBusy('tier');
    try {
      await save({ anchor: !row.anchor });
    } finally {
      setBusy(null);
    }
  }

  async function confirm(remove: boolean) {
    setBusy('tier');
    try {
      await ws.editComp(rcId, remove ? { removed: true } : { confirmed: true });
      if (remove) ws.toast(`${row.address} is out of the report.`, { label: 'Undo', run: () => void ws.editComp(rcId, { removed: false }).catch(() => undefined) });
    } catch (e) {
      setProblem(message(e));
    } finally {
      setBusy(null);
    }
  }

  // Practice agents tier once their reasoning is saved (NB-8): the reasoning is how they decide the tier.
  const tierLocked = !canEdit || (practice && (!noteSaved || !tagsSaved));
  const tierHint = practice && (!noteSaved || !tagsSaved) ? 'Your note and tags first: they’re how you decide its tier.' : null;

  return (
    <div className="rv-body">
      <section className="rv-comp" aria-label={row.address}>
        <Photos photos={j.photos ?? []} address={row.address} editing={false} />
        <div className="rv-comp-head">
          <h2 className="rv-addr">{row.address}</h2>
          <span className="rv-status">
            {status ? <><span className={`so-sw ${status}`} aria-hidden="true" />{STATUS_LABEL[status]}</> : null}
            {row.tier && <span className={`rv-tierchip ${row.tier}`}>{TIER_WORD[row.tier]}</span>}
            {row.anchor && <span className="rv-tierchip star">★ main comp</span>}
          </span>
        </div>
        <div className="so-metrics rv-metrics">
          <Fact label={PRICE_LABEL[row.group]} value={shortPrice(row.price)} />
          {ws.sf && <Fact label="$/SF" value={psf(row.ppsf)} />}
          {ws.sf && <Fact label="Size" value={sizeText(row)} />}
          <Fact label="Floor" value={countText(row.floor)} />
          <Fact label="Date" value={monthYear(row.date)} />
          <Fact label="Days on market" value={countText(row.dom)} />
          {distance?.kind === 'miles' && <Fact label="Distance" value={distance.label} />}
          {distance?.kind === 'same_building' && <Fact label="Distance" value="Same building" />}
        </div>
        <div className="rv-feats">
          {groups.map((g) => {
            const picked = features[g.key] ?? [];
            return picked.length ? (
              <div key={g.key} className="so-frow">
                <span className="so-flabel">{g.label}</span>
                <span className="so-fopts">
                  {picked.map((o) => <span key={o} className={`so-fchip${ws.homeFeatures[g.key]?.includes(o) ? ' shared' : ''}`}>{o}</span>)}
                </span>
              </div>
            ) : null;
          })}
        </div>
        {checks.length > 0 && (
          <ul className="rv-checks" aria-label="The house’s checks">
            {checks.map((k) => <li key={k.code} title={k.message}><span className="so-need-sq" aria-hidden="true" />{k.label}{k.suggestion ? <span className="rv-check-s"> · {k.suggestion}</span> : null}</li>)}
          </ul>
        )}
      </section>

      <section className="rv-work">
        <div className="rv-yours">
          <h3 className="rv-h">Your reasoning</h3>
          <p className="rv-help">{practice
            ? `Why is it a comp for ${home}, or not? Write it first: Hubert gives feedback on it, then you can see his own take.`
            : `Why is it a comp for ${home}, or not? Hubert’s take is beside it: use it, change it, or write your own.`}</p>
          <textarea
            className="rv-note"
            aria-label="Why it’s a comp"
            rows={5}
            maxLength={2000}
            value={draft.note}
            disabled={!canEdit}
            placeholder={`What makes it comparable to ${home}, or not`}
            onChange={(e) => onDraft({ ...draft, note: e.target.value })}
          />
          <div className="rv-tags">
            <span className="rv-label">Tags <Info text={TAG_INFO} label="What a tag is" align="left" /></span>
            <TagPicker value={draft.tags} onChange={(tags) => onDraft({ ...draft, tags })} label="Tags" disabled={!canEdit} suggested={ws.tagSuggestions[rcId] ?? []} />
          </div>
          {canEdit && (
            <div className="rv-actions">
              <button type="button" className={`btn${practice ? ' primary' : ''}`} disabled={busy !== null || saving} onClick={() => void ask('feedback')}>
                {busy === 'feedback' ? 'Hubert is reading…' : feedback ? 'Get feedback again' : 'Get feedback'}
              </button>
              {practice && (
                showTake ? null : (
                  <button
                    type="button"
                    className="btn"
                    disabled={!unlocked || busy !== null || saving}
                    title={unlocked ? undefined : 'His take shows after one round of feedback on yours.'}
                    onClick={() => (take ? onOpened() : void ask('take'))}
                  >
                    {busy === 'take' ? 'Hubert is looking…' : 'Show Hubert’s take'}
                  </button>
                )
              )}
              {practice && !unlocked && <span className="rv-quiet">His take unlocks after one round of feedback.</span>}
            </div>
          )}
          {problem && <p className="rv-err" role="alert">{problem}</p>}
        </div>

        <div className="rv-hubert" aria-live="polite">
          <h3 className="rv-h">Hubert</h3>
          {weak && (
            <div className="rv-weak">
              <span><strong>Looks weak:</strong> {weak.reason}.</span>
              {canEdit && row.tier !== 'excluded' && !c.unconfirmed && (
                <button type="button" className="link" disabled={busy !== null} onClick={() => void pickTier('excluded')}>✕ Exclude it</button>
              )}
              <span className="rv-quiet">Your call: the flag never changes the tier.</span>
            </div>
          )}
          {feedback && <Round entry={feedback} title="Feedback on your reasoning" />}
          {showTake && take && (
            <div className="rv-take">
              <Round entry={take} title="Hubert’s take" />
              {take.tier && <p className="rv-would">He’d tier it <strong>{TIER_WORD[take.tier]}</strong>{take.tierWhy ? `: ${take.tierWhy}` : '.'}</p>}
              {canEdit && (
                <div className="rv-take-actions">
                  <button
                    type="button"
                    className="link"
                    onClick={() => onDraft({ ...draft, note: draft.note.trim() ? `${draft.note.trim()}\n${take.text}` : take.text })}
                  >
                    Copy into my note
                  </button>
                </div>
              )}
              {canEdit && !practice && (
                <div className="rv-ask">
                  <textarea
                    className="rv-ask-input"
                    aria-label="Tell Hubert what he’s missing"
                    rows={2}
                    maxLength={1000}
                    value={asks}
                    placeholder="Tell him what he’s missing: “he’s comparing a renovated unit to an original one”"
                    onChange={(e) => setAsks(e.target.value)}
                  />
                  <button type="button" className="btn" disabled={busy !== null || !asks.trim()} onClick={() => void ask('take', asks)}>
                    {busy === 'take' ? 'Hubert is looking…' : 'Ask again'}
                  </button>
                </div>
              )}
            </div>
          )}
          {!feedback && !showTake && (
            <p className="rv-quiet">{busy === 'take' ? 'Hubert is looking at this comp…' : practice
              ? 'Write your reasoning and pick tags, then ask for feedback.'
              : ws.readOnly ? 'Hubert hasn’t looked at this comp.' : 'Hubert’s take shows here.'}</p>
          )}
          <Earlier review={review} shown={[feedback, showTake ? take : null]} practice={practice} opened={opened} />
        </div>

        <div className="rv-tier">
          <span className="rv-label">Your tier <Info text={TIER_INFO} label="What the tiers mean" align="left" /></span>
          {c.unconfirmed ? (
            ws.readOnly ? <span className="rv-quiet">To confirm</span> : (
              <span className="rv-confirm">
                <button type="button" className="so-confirm-btn" disabled={busy !== null} onClick={() => void confirm(false)}>Confirm</button>
                <button type="button" className="link" disabled={busy !== null} onClick={() => void confirm(true)}>Remove</button>
                <span className="rv-quiet">Check it against its listing first: until then it counts in neither result.</span>
              </span>
            )
          ) : (
            <>
              <span className="so-seg rv-seg" role="group" aria-label={`Tier for ${row.address}`}>
                <button type="button" className={`star${row.anchor ? ' on' : ''}`} aria-pressed={row.anchor} aria-label="Main comp" title="The main comp you’re comparing to. The email leads with it." disabled={tierLocked || busy !== null} onClick={() => void star()}>★</button>
                {TIERS.map((t) => (
                  <button
                    key={t.tier}
                    type="button"
                    className={`${t.tier}${row.tier === t.tier ? ' on' : ''}`}
                    aria-pressed={row.tier === t.tier}
                    aria-label={t.name}
                    disabled={tierLocked || busy !== null}
                    onClick={() => void pickTier(t.tier)}
                  >
                    {t.label}
                  </button>
                ))}
              </span>
              {tierHint && <span className="rv-quiet">{tierHint}</span>}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="so-metric">
      <span className="so-metric-label">{label}</span>
      <span className="so-metric-val">{value}</span>
    </div>
  );
}

/** One round, as Hubert said it: "What holds up:" and "Look again:" lines head their points. */
function Round({ entry, title }: { entry: ReviewEntry; title: string }) {
  const lines = entry.text.split('\n');
  return (
    <div className={`rv-round ${entry.kind}`}>
      <p className="rv-round-h">
        {title}
        {entry.sample && <span className="rv-sample">Sample</span>}
        <span className="rv-when">{new Date(entry.at).toLocaleDateString()}</span>
      </p>
      {entry.kind === 'take' ? <p className="rv-round-text">{entry.text}</p> : (
        <div className="rv-round-text">
          {lines.map((l, k) => (/^[-•]\s/.test(l)
            ? <p key={k} className="rv-point">{l.replace(/^[-•]\s*/, '')}</p>
            : <p key={k} className="rv-sub">{l}</p>))}
        </div>
      )}
    </div>
  );
}

/** The earlier rounds on this comp, folded: the learning trail a mentor can follow. */
function Earlier({ review, shown, practice, opened }: { review: ReviewEntry[]; shown: (ReviewEntry | null)[]; practice: boolean; opened: boolean }) {
  const rest = review.filter((e) => !shown.includes(e) && (!practice || opened || e.kind === 'feedback'));
  if (!rest.length) return null;
  return (
    <details className="rv-earlier">
      <summary>Earlier rounds ({rest.length})</summary>
      {[...rest].reverse().map((e) => (
        <div key={`${e.at}-${e.kind}-${e.text.length}`}>
          {e.kind === 'feedback' && e.note && <p className="rv-was">Your note then: “{e.note}”</p>}
          {e.asked && <p className="rv-was">You told him: “{e.asked}”</p>}
          <Round entry={e} title={e.kind === 'feedback' ? 'Feedback' : `Take${e.tier ? ` · ${TIER_WORD[e.tier]}` : ''}`} />
        </div>
      ))}
    </details>
  );
}
