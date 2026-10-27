// Write it for the client (Dispatch 26, D-29): the client step on Send, a modal
// flow like Sort's review. The overview first, then one step per comp the
// email shows (countedComps), the anchor first. Each comp's step shows its box
// as the Designed email will (photo, address, price, $/sq ft, status, and the
// paragraph as it's typed), beside the agent's Sort note and Hubert's take on
// Sort, then the paragraph for the client.
//
// The human drives, as on Sort. A practice agent writes the paragraph, asks for
// feedback (what's unclear, unsupported or off-voice, and the fair-housing
// list), and only after one round can see the writer's version: they keep
// theirs, revise it, or take his. A full agent gets the writer's draft when
// they first open a comp, and edits or approves it; they can tell him what to
// change and redraft. The paragraph is saved on the comp (clientLine) as they
// leave each step, with who wrote it: the agent, the writer, or both.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  clientSteps, latestRound, lineBy, MAX_CLIENT_LINE, OVERVIEW, overviewDone, versionUnlocked, type ClientRound,
} from '../../../workspace/client-words.ts';
import { countedComps } from '../../../workspace/email.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { latest } from '../../../workspace/review.ts';
import { noteOf } from '../../../workspace/state.ts';
import type { Workspace } from '../workspace/model.ts';
import { YourLines } from './ClientOverview.tsx';
import { ClientRounds, RoundText } from './ClientRounds.tsx';
import { compBox, designedComps, NO_PARSED, type DesignedComp } from './designed.ts';
import type { SendModel } from './useSendEmail.ts';
import '../../styles/review.css';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A comp's unsaved paragraph, and the draft of Hubert's it started from (who wrote it follows from that). */
interface Draft {
  text: string;
  from: string | null;
}

export function ClientFlow({ ws, m, startAt, onClose }: { ws: Workspace; m: SendModel; startAt: string | null; onClose: () => void }) {
  const comps = useMemo(() => clientSteps(m.o, m.result, ws.comps), [m.o, m.result, ws.comps]);
  // The order is set when the flow opens.
  const [order] = useState<string[]>(() => [OVERVIEW, ...comps.map((c) => c.judgment!.reportCompId)]);
  const byId = useMemo(() => new Map(comps.map((c) => [c.judgment!.reportCompId, c])), [comps]);
  const steps = order.filter((id) => id === OVERVIEW || byId.has(id));
  const done = (id: string) => (id === OVERVIEW ? overviewDone(m.send) : Boolean(byId.get(id)?.judgment?.clientLine?.text.trim()));
  const [at, setAt] = useState(() => {
    const i = startAt ? steps.indexOf(startAt) : steps.findIndex((id) => !done(id));
    return Math.max(0, i);
  });
  const i = Math.min(at, steps.length - 1);
  const id = steps[i]!;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every comp's box, as the Designed email lays it out: by report comp id.
  const boxes = useMemo(() => {
    const outById = new Map(m.o.comps.map((c) => [c.id, c]));
    const { anchor, others } = designedComps(countedComps(m.o, m.result, ws.comps), {
      parsed: NO_PARSED,
      homeStreet: ws.intake.address?.value ?? null,
      sf: ws.sf,
      rate: (c) => outById.get(c.id)?.per_result[m.result].price_per_sqft?.value ?? null,
    });
    return new Map([anchor, ...others].filter((b): b is DesignedComp => Boolean(b?.id)).map((b) => [b.id!, { box: b, anchor: b === anchor }]));
  }, [m.o, m.result, ws.comps, ws.intake.address?.value, ws.sf]);

  const draftOf = useCallback((rcId: string): Draft => {
    const c = byId.get(rcId);
    const saved = c?.judgment?.clientLine;
    return drafts[rcId] ?? { text: saved?.text ?? '', from: saved?.by === 'writer' ? saved.text : null };
  }, [drafts, byId]);

  /** Saves a comp's paragraph, if it changed. */
  const save = useCallback(async (rcId: string): Promise<boolean> => {
    if (ws.readOnly || rcId === OVERVIEW) return true;
    const d = drafts[rcId];
    const c = byId.get(rcId);
    if (!d || !c?.judgment) return true;
    const saved = c.judgment.clientLine ?? null;
    const text = d.text.trim();
    if (text === (saved?.text ?? '')) return true;
    setSaving(true);
    setError(null);
    try {
      await ws.editComp(rcId, { clientLine: text ? { text, by: lineBy(text, d.from, saved?.by) } : null });
      setDrafts((all) => {
        const { [rcId]: _done, ...rest } = all;
        return rest;
      });
      return true;
    } catch (e) {
      setError(`Not saved: ${message(e)}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [drafts, byId, ws]);

  const close = useCallback(async () => {
    if (!(await save(id))) return;
    onClose();
  }, [id, save, onClose]);
  const closeRef = useRef(close);
  closeRef.current = close;

  const go = async (next: number) => {
    if (!(await save(id))) return;
    setError(null);
    setAt(next);
  };

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

  const back = i > 0 ? <button type="button" className="link rv-back" disabled={saving} onClick={() => void go(i - 1)}>← Back</button> : <span />;
  const next = i < steps.length - 1
    ? <button type="button" className="btn primary" disabled={saving} onClick={() => void go(i + 1)}>Next →</button>
    : <button type="button" className="btn primary" disabled={saving} onClick={() => void close()}>See the email</button>;
  const nav = { back, next, error };

  return (
    <div className="rv-scrim">
      <div className="rv-modal cw-modal" role="dialog" aria-modal="true" aria-label="Write it for the client" tabIndex={-1} ref={dialog}>
        <div className="rv-head">
          <span className="rv-title">Write it for the client</span>
          <span className="rv-count" aria-live="polite">{i === 0 ? 'Overview' : `Comp ${i} of ${steps.length - 1}`}</span>
          <span className="rv-progress" aria-hidden="true">
            {steps.map((s, k) => <span key={s} className={`${k === i ? 'here' : ''}${done(s) ? ' done' : ''}`} />)}
          </span>
          <button type="button" className="rv-x" aria-label="Close: what you wrote is kept" title="Close (Esc): what you wrote is kept" onClick={() => void close()}>✕</button>
        </div>
        {id === OVERVIEW ? (
          <>
            <div className="cw-body-overview">
              <YourLines ws={ws} m={m} />
            </div>
            <Foot nav={nav} />
          </>
        ) : (
          <CompStep
            key={id}
            ws={ws}
            m={m}
            comp={byId.get(id)!}
            box={boxes.get(id) ?? null}
            draft={draftOf(id)}
            onDraft={(d) => setDrafts((all) => ({ ...all, [id]: d }))}
            save={() => save(id)}
            saving={saving}
            nav={nav}
          />
        )}
      </div>
    </div>
  );
}

function Foot({ nav, mid }: { nav: { back: ReactNode; next: ReactNode; error: string | null }; mid?: ReactNode }) {
  return (
    <div className="rv-foot">
      {nav.back}
      <span className="rv-foot-mid">{mid}</span>
      {nav.error && <p className="rv-err" role="alert">{nav.error}</p>}
      <span className="rv-foot-r">{nav.next}</span>
    </div>
  );
}

function CompStep({ ws, m, comp, box, draft, onDraft, save, saving, nav }: {
  ws: Workspace;
  m: SendModel;
  comp: WorkspaceComp;
  box: { box: DesignedComp; anchor: boolean } | null;
  draft: Draft;
  onDraft: (d: Draft) => void;
  save: () => Promise<boolean>;
  saving: boolean;
  nav: { back: ReactNode; next: ReactNode; error: string | null };
}) {
  const j = comp.judgment!;
  const rcId = j.reportCompId;
  const practice = ws.level === 'practice';
  const canEdit = !ws.readOnly;
  const rounds: ClientRound[] = ws.clientRounds[rcId] ?? [];
  const lastDraft = latestRound(rounds, 'draft');
  const unlocked = versionUnlocked(rounds, ws.level);
  const take = latest(j.review, 'take');
  const sortNote = noteOf(j);
  const [busy, setBusy] = useState<'feedback' | 'draft' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asks, setAsks] = useState('');
  // A practice agent's look at the writer's version, this time through.
  const [showVersion, setShowVersion] = useState(!practice);
  const hasText = draft.text.trim().length > 0;

  async function ask(job: 'feedback' | 'draft', words?: string) {
    setProblem(null);
    if (job === 'feedback' && !hasText) return setProblem('Write your paragraph first: Hubert gives feedback on your words.');
    setBusy(job);
    try {
      if (!(await save())) return;
      const r = await ws.askClientWords(rcId, job, { result: m.result, ...(words ? { asks: words } : {}) });
      if (job === 'draft') {
        setShowVersion(true);
        setAsks('');
        // An empty paragraph, or one still as his last draft left it, takes the new draft; otherwise it's offered beside it.
        const current = draft.text.trim();
        if (!current || (lastDraft && current === lastDraft.text.trim())) onDraft({ text: r.round.text, from: r.round.text });
      }
    } catch (e) {
      setProblem(message(e));
    } finally {
      setBusy(null);
    }
  }

  // A full agent gets the writer's draft when they first open a comp with nothing written.
  const asked = useRef(false);
  useEffect(() => {
    if (practice || !canEdit || lastDraft || asked.current || draft.text.trim()) return;
    asked.current = true;
    void ask('draft');
  }, [practice, canEdit, lastDraft]);

  const preview: DesignedComp | null = box ? { ...box.box, paragraph: draft.text.trim() || null } : null;
  const versionDiffers = lastDraft && lastDraft.text.trim() !== draft.text.trim();

  return (
    <>
      <div className="rv-body cw-body">
        <section className="rv-comp cw-box" aria-label={preview?.name ?? 'The comp'}>
          <p className="cw-label">As the client will see it</p>
          {preview && <div className="cw-email" dangerouslySetInnerHTML={{ __html: compBox(preview, box!.anchor) }} />}
        </section>

        <section className="rv-work">
          <div className="cw-context">
            <div className="cw-ctx">
              <p className="cw-label">Your note on Sort</p>
              <p className="cw-ctx-text">{sortNote ?? <span className="rv-quiet">No note.</span>}</p>
            </div>
            {take && (
              <div className="cw-ctx">
                <p className="cw-label">Hubert’s take on Sort{take.sample && <span className="rv-sample">Sample</span>}</p>
                <p className="cw-ctx-text">{take.text}</p>
              </div>
            )}
          </div>

          <div className={`rv-notebox${canEdit ? '' : ' ro'}`}>
            <textarea
              className="rv-note cw-para"
              aria-label="For the client"
              rows={5}
              maxLength={MAX_CLIENT_LINE}
              value={draft.text}
              disabled={!canEdit}
              placeholder={practice
                ? 'Write it for the client: how this home compares to theirs, and what it says about the price. Yours first.'
                : busy === 'draft' ? 'Hubert is drafting it…' : 'How this home compares to theirs, and what it says about the price.'}
              onChange={(e) => onDraft({ ...draft, text: e.target.value })}
            />
            {canEdit && (
              <div className="rv-notebar">
                <span className="rv-tagline cw-who">{whoLine(draft, j.clientLine?.by)}</span>
                <span className="rv-notebar-r">
                  {practice && !(showVersion && lastDraft) && (
                    <button
                      type="button"
                      className="link"
                      disabled={!unlocked || busy !== null || saving}
                      title={unlocked ? undefined : 'Opens after one round of feedback'}
                      onClick={() => (lastDraft ? setShowVersion(true) : void ask('draft'))}
                    >
                      {busy === 'draft' ? 'Writing…' : 'Hubert’s version'}
                    </button>
                  )}
                  <button type="button" className={`btn small${practice ? ' primary' : ''}`} disabled={busy !== null || saving} onClick={() => void ask('feedback')}>
                    {busy === 'feedback' ? 'Reading…' : latestRound(rounds, 'feedback') ? 'Feedback again' : 'Get feedback'}
                  </button>
                </span>
              </div>
            )}
          </div>
          {problem && <p className="rv-err" role="alert">{problem}</p>}

          {(busy === 'draft' || (showVersion && lastDraft)) && (
            <div className="rv-hubert" aria-live="polite">
              {busy === 'draft' && !(showVersion && lastDraft) && <p className="rv-quiet">Hubert is writing his version…</p>}
              {showVersion && lastDraft && (
                <RoundText
                  round={lastDraft}
                  title={practice ? 'Hubert’s version' : 'Hubert’s draft'}
                  action={canEdit && versionDiffers ? (
                    <button type="button" className="link" onClick={() => onDraft({ text: lastDraft.text, from: lastDraft.text })}>{practice ? 'Use his' : 'Use this'}</button>
                  ) : null}
                />
              )}
              {showVersion && lastDraft && canEdit && (
                <div className="rv-ask">
                  <input
                    className="rv-ask-input"
                    aria-label="Tell Hubert what to change"
                    maxLength={1000}
                    value={asks}
                    placeholder="What should change? “Mention it faces the park.”"
                    onChange={(e) => setAsks(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && asks.trim() && busy === null) void ask('draft', asks); }}
                  />
                  <button type="button" className="btn small" disabled={busy !== null || !asks.trim()} onClick={() => void ask('draft', asks)}>Redraft</button>
                </div>
              )}
            </div>
          )}
          <ClientRounds rounds={rounds} />
        </section>
      </div>
      <Foot nav={nav} />
    </>
  );
}

/** Who the paragraph is by, as it stands. */
function whoLine(d: Draft, saved: 'agent' | 'writer' | 'both' | undefined): string {
  if (!d.text.trim()) return '';
  const by = lineBy(d.text, d.from, saved);
  return by === 'writer' ? '✦ Hubert’s draft, as he wrote it' : by === 'both' ? '✦ Hubert’s draft, edited by you' : 'Yours';
}
