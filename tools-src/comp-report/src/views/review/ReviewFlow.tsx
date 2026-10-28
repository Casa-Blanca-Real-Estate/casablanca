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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
const TIER_WORD: Record<Tier, string> = { primary: '1st', secondary: '2nd', excluded: 'Out' };
// What a take says of the tier it would give.
const WOULD: Record<Tier, string> = { primary: 'would tier 1st', secondary: 'would tier 2nd', excluded: 'would leave it out' };
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
  /** One comp back or on, from the arrows in the head or the keyboard: never past either end. */
  const step = (by: -1 | 1) => {
    const to = i + by;
    if (saving || to < 0 || to >= steps.length) return;
    void go(to);
  };
  const stepRef = useRef(step);
  stepRef.current = step;

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
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') void closeRef.current();
      // ← and → step through the comps, except while typing (Kimani's notebook, 2026-10-27).
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]');
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        stepRef.current(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      removeEventListener('keydown', onKey);
    };
  }, []);

  const doneCount = steps.filter((r) => stepDone(r.c, ws.level)).length;

  const back = <button type="button" className="link rv-back" disabled={saving} onClick={() => void go(i - 1)}>← Back</button>;
  const next = i < steps.length - 1
    ? <button type="button" className="btn primary" disabled={saving} onClick={() => void go(i + 1)}>Next →</button>
    : <button type="button" className="btn primary" disabled={saving} onClick={() => void close()}>Done</button>;

  return (
    <div className="rv-scrim">
      <div className="rv-modal" role="dialog" aria-modal="true" aria-label="Review comps" tabIndex={-1} ref={dialog}>
        <div className="rv-head">
          <span className="rv-title">Review comps</span>
          <span className="rv-arrows">
            <button type="button" className="rv-arrow" aria-label="Previous comp" title="Previous comp (←)" disabled={saving || i <= 0} onClick={() => step(-1)}>‹</button>
            <span className="rv-count" aria-live="polite" title={`${doneCount} of ${steps.length} reviewed`}>{steps.length ? `${i + 1} / ${steps.length}` : '0'}</span>
            <button type="button" className="rv-arrow" aria-label="Next comp" title="Next comp (→)" disabled={saving || i >= steps.length - 1} onClick={() => step(1)}>›</button>
          </span>
          <span className="rv-progress" aria-hidden="true">
            {steps.map((r, k) => (
              <span key={r.rcId} className={`${k === i ? 'here' : ''}${stepDone(r.c, ws.level) ? ' done' : ''}`} />
            ))}
          </span>
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
            nav={{ back: i > 0 ? back : <span />, next, error }}
          />
        ) : (
          <>
            <p className="rv-empty">Every comp here has been taken out of the report.</p>
            <div className="rv-foot"><span className="rv-foot-r">{next}</span></div>
          </>
        )}
      </div>
    </div>
  );
}

function Step({ ws, row, out, draft, onDraft, save, saving, opened, onOpened, nav }: {
  ws: Workspace;
  row: Row;
  out: CompOut | undefined;
  draft: Draft;
  onDraft: (d: Draft) => void;
  save: (extra?: { tier?: Tier; anchor?: boolean }) => Promise<boolean>;
  saving: boolean;
  opened: boolean;
  onOpened: () => void;
  /** Back and Next, from the flow: the footer holds them beside the tier. */
  nav: { back: ReactNode; next: ReactNode; error: string | null };
}) {
  const c = row.c;
  const j = c.judgment!;
  const rcId = row.rcId!;
  const practice = ws.level === 'practice';
  const home = homeName(ws.intake, ws.report.title);
  const [tagsOpen, setTagsOpen] = useState(() => !draft.tags.length && !ws.readOnly);
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
  const tierHint = practice && (!noteSaved || !tagsSaved) ? 'Save your note and tags first: they’re how you decide its tier.' : undefined;

  const facts: [string, string][] = [
    [PRICE_LABEL[row.group], shortPrice(row.price)],
    ...(ws.sf ? [['$/SF', psf(row.ppsf)], ['Size', sizeText(row)]] as [string, string][] : []),
    ['Floor', countText(row.floor)],
    ['Date', monthYear(row.date)],
    ['DOM', countText(row.dom)],
    ...(distance?.kind === 'miles' ? [['Distance', distance.label]] as [string, string][] : []),
    ...(distance?.kind === 'same_building' ? [['Distance', 'Same bldg']] as [string, string][] : []),
  ];
  // 'None' and 'Other' say nothing on a chip without their group: the checks carry what matters.
  const picked = groups.map((g) => ({ g, opts: (features[g.key] ?? []).filter((o) => o !== 'None' && o !== 'Other') })).filter((x) => x.opts.length);

  return (
    <>
      <div className="rv-body">
        <section className="rv-comp" aria-label={row.address}>
          <div className="rv-hero">
            <Photos photos={j.photos ?? []} address={row.address} editing={false} />
            <div className="rv-hero-cap">
              <span className="rv-badges">
                {status && <span className={`rv-badge ${status}`}>{STATUS_LABEL[status]}</span>}
                {row.tier && <span className={`rv-badge tier ${row.tier}`}>{TIER_WORD[row.tier]}</span>}
                {row.anchor && <span className="rv-badge star">★ main</span>}
              </span>
              <h2 className="rv-addr">{row.address}</h2>
            </div>
          </div>
          <dl className="rv-facts">
            {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {picked.length > 0 && (
            <ul className="rv-feats" aria-label="Features">
              {picked.flatMap(({ g, opts }) => opts.map((o) => (
                <li key={`${g.key}-${o}`} className={ws.homeFeatures[g.key]?.includes(o) ? 'shared' : ''} title={`${g.label}${ws.homeFeatures[g.key]?.includes(o) ? ', shared with the home' : ''}`}>{o}</li>
              )))}
            </ul>
          )}
          {checks.length > 0 && (
            <ul className="rv-checks" aria-label="The house’s checks">
              {checks.map((k) => <li key={k.code} title={[k.message, k.suggestion].filter(Boolean).join(' · ')}><span className="so-need-sq" aria-hidden="true" />{k.label}</li>)}
            </ul>
          )}
        </section>

        <section className="rv-work">
          <div className={`rv-notebox${canEdit ? '' : ' ro'}`}>
            <textarea
              className="rv-note"
              aria-label="Why it’s a comp"
              rows={4}
              maxLength={2000}
              value={draft.note}
              disabled={!canEdit}
              placeholder={practice ? `Why is it a comp for ${home}, or not? Write yours first.` : `Why is it a comp for ${home}, or not?`}
              onChange={(e) => onDraft({ ...draft, note: e.target.value })}
            />
            <div className="rv-notebar">
              <span className="rv-tagline">
                {!(tagsOpen && canEdit) && draft.tags.map((t) => <span key={t} className="so-tag">{t}</span>)}
                {canEdit && (
                  <button type="button" className="link rv-tagtoggle" aria-expanded={tagsOpen} onClick={() => setTagsOpen(!tagsOpen)}>
                    {tagsOpen ? 'Done' : draft.tags.length ? 'Edit tags' : '+ Tags'}
                  </button>
                )}
                <Info text={TAG_INFO} label="What a tag is" align="left" />
              </span>
              {canEdit && (
                <span className="rv-notebar-r">
                  {practice && !showTake && (
                    <button
                      type="button"
                      className="link"
                      disabled={!unlocked || busy !== null || saving}
                      title={unlocked ? undefined : 'Unlocks after one round of feedback'}
                      onClick={() => (take ? onOpened() : void ask('take'))}
                    >
                      {busy === 'take' ? 'Looking…' : 'Hubert’s take'}
                    </button>
                  )}
                  <button type="button" className={`btn small${practice ? ' primary' : ''}`} disabled={busy !== null || saving} onClick={() => void ask('feedback')}>
                    {busy === 'feedback' ? 'Reading…' : feedback ? 'Feedback again' : 'Get feedback'}
                  </button>
                </span>
              )}
            </div>
            {tagsOpen && canEdit && (
              <div className="rv-tags">
                <TagPicker value={draft.tags} onChange={(tags) => onDraft({ ...draft, tags })} label="Tags" suggested={ws.tagSuggestions[rcId] ?? []} />
              </div>
            )}
          </div>
          {problem && <p className="rv-err" role="alert">{problem}</p>}

          {(weak || feedback || showTake || busy === 'take') && (
            <div className="rv-hubert" aria-live="polite">
              {weak && (
                <p className="rv-weak" title="Your call: the flag never changes the tier.">
                  <span><strong>Looks weak:</strong> {weak.reason}</span>
                  {canEdit && row.tier !== 'excluded' && !c.unconfirmed && (
                    <button type="button" className="link" disabled={busy !== null} onClick={() => void pickTier('excluded')}>✕ Exclude</button>
                  )}
                </p>
              )}
              {busy === 'take' && !showTake && <p className="rv-quiet">Hubert is looking at this comp…</p>}
              {showTake && take && (
                <Round
                  entry={take}
                  title="Hubert’s take"
                  aside={take.tier ? <span className="rv-would" title={take.tierWhy}>{WOULD[take.tier]}</span> : null}
                  action={canEdit ? (
                    <button type="button" className="link" onClick={() => onDraft({ ...draft, note: draft.note.trim() ? `${draft.note.trim()}\n${take.text}` : take.text })}>Copy to note</button>
                  ) : null}
                />
              )}
              {showTake && take && canEdit && !practice && (
                <div className="rv-ask">
                  <input
                    className="rv-ask-input"
                    aria-label="Tell Hubert what he’s missing"
                    maxLength={1000}
                    value={asks}
                    placeholder="What’s he missing? “It was gut renovated.”"
                    onChange={(e) => setAsks(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && asks.trim() && busy === null) void ask('take', asks); }}
                  />
                  <button type="button" className="btn small" disabled={busy !== null || !asks.trim()} onClick={() => void ask('take', asks)}>Ask again</button>
                </div>
              )}
              {feedback && <Round entry={feedback} title="Feedback on yours" />}
              <Earlier review={review} shown={[feedback, showTake ? take : null]} practice={practice} opened={opened} />
            </div>
          )}
        </section>
      </div>

      <div className="rv-foot">
        {nav.back}
        <span className="rv-foot-mid">
          {c.unconfirmed ? (
            ws.readOnly ? <span className="rv-quiet">To confirm</span> : (
              <span className="rv-confirm" title="Check it against its listing first: until then it counts in neither result.">
                <button type="button" className="so-confirm-btn" disabled={busy !== null} onClick={() => void confirm(false)}>Confirm</button>
                <button type="button" className="link" disabled={busy !== null} onClick={() => void confirm(true)}>Remove</button>
              </span>
            )
          ) : (
            <span className="so-seg rv-seg" role="group" aria-label={`Tier for ${row.address}`} title={tierHint ?? TIER_INFO}>
              <button type="button" className={`star${row.anchor ? ' on' : ''}`} aria-pressed={row.anchor} aria-label="Main comp" disabled={tierLocked || busy !== null} onClick={() => void star()}>★</button>
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
          )}
          {tierHint && <span className="rv-quiet rv-tierhint">{tierHint}</span>}
        </span>
        {nav.error && <p className="rv-err" role="alert">{nav.error}</p>}
        <span className="rv-foot-r">{nav.next}</span>
      </div>
    </>
  );
}

/** One round, as Hubert said it: "What holds up:" and "Look again:" lines head their points. */
function Round({ entry, title, aside, action }: { entry: ReviewEntry; title: string; aside?: ReactNode; action?: ReactNode }) {
  const lines = entry.text.split('\n');
  return (
    <div className={`rv-round ${entry.kind}`}>
      <p className="rv-round-h" title={new Date(entry.at).toLocaleString()}>
        {title}
        {aside}
        {entry.sample && <span className="rv-sample">Sample</span>}
        {action && <span className="rv-round-act">{action}</span>}
      </p>
      {entry.kind === 'take' ? <p className="rv-round-text">{entry.text}</p> : (
        <div className="rv-round-text">
          {lines.map((l, k) => (/^[-•]\s/.test(l)
            ? <p key={k} className="rv-point">{l.replace(/^[-•]\s*/, '')}</p>
            : <p key={k} className="rv-sub">{l.replace(/:$/, '')}</p>))}
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
