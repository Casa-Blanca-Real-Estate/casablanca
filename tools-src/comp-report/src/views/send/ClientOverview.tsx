// The overview, the client step's first (Dispatch 26): what used to be Send's
// "Your lines" (#89: the agent's lines first, Draft from notes, Tidy), moved
// into the flow with the headline, since together they're the overview at the
// top of the Designed email. The human drives (D-29): a practice agent writes
// it and asks Hubert for feedback before "Draft from notes" opens (the server
// holds the same rule); a full agent can draft it straight away. Tidy is
// always there: it edits the agent's own words for clarity only.
import { useRef, useState } from 'react';
import { ApiError, linesApi } from '../../api.ts';
import { latestRound, OVERVIEW, versionUnlocked } from '../../../workspace/client-words.ts';
import type { Entry, SendState } from '../../../workspace/state.ts';
import { Info } from '../newcomp/Frame.tsx';
import { entry, TextInput } from '../workspace/bits.tsx';
import type { Workspace } from '../workspace/model.ts';
import { ClientRounds } from './ClientRounds.tsx';
import type { SendModel } from './useSendEmail.ts';

/** The headline's drafts: the writer's, or the numbers' own. Pick one, then make it yours. */
export function HeadlineDrafts({ m }: { m: SendModel }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const picks = m.headlinePicks;
  if (m.off || !picks.length) return null;
  return (
    <details className="se-drafts" ref={ref}>
      <summary>{picks.length} draft{picks.length === 1 ? '' : 's'} ▾</summary>
      <div className="se-drafts-menu">
        <span className="se-drafts-title">{m.written ? 'Hubert’s drafts' : 'Drafts from the numbers'}: pick one, then make it yours</span>
        {picks.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              m.setHeadline(d);
              if (ref.current) ref.current.open = false;
            }}
          >
            {d}
          </button>
        ))}
      </div>
    </details>
  );
}


type LineKey = 'chosen' | 'consider' | 'nextStep';
const LINE_KEYS: LineKey[] = ['chosen', 'consider', 'nextStep'];
const LINE_NAME: Record<LineKey, string> = { chosen: 'How I chose the comps', consider: 'Things to consider', nextStep: 'The next step' };

/** What Hubert last put in the lines, for Undo and the mark beside each one he wrote. */
interface Offered {
  job: 'draft' | 'rewrite';
  lines: Partial<Record<LineKey, string>>;
  before: Pick<SendState, LineKey>;
}

/**
 * The agent's own lines, first-class (dn_mviipah6rs3v): the email is written
 * from them, so they lead, open. Hubert helps on request: drafts the empty
 * ones from the agent's notes (at the top), and tidies the wording once
 * they're written (at the bottom: clarity and grammar, the same points and
 * numbers). Each of his changes can be undone, and a line he wrote says so
 * until the agent edits it. On the client step it carries the headline too,
 * and Hubert's feedback on the whole overview (Dispatch 26).
 */
export function YourLines({ ws, m }: { ws: Workspace; m: SendModel }) {
  const off = m.off;
  const [busy, setBusy] = useState<'draft' | 'rewrite' | null>(null);
  const [offered, setOffered] = useState<Offered | null>(null);
  const [note, setNote] = useState<{ job: 'draft' | 'rewrite'; text: string; error?: boolean } | null>(null);
  const written = LINE_KEYS.filter((k) => m.send[k]?.value.trim());
  const locked = off || busy !== null;
  const practice = ws.level === 'practice';
  const rounds = ws.clientRounds[OVERVIEW] ?? [];
  const draftOpen = versionUnlocked(rounds, ws.level);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function feedback() {
    if (locked || asking) return;
    setProblem(null);
    if (!m.send.headline?.value.trim() && !written.length) return setProblem('Write your headline and how you chose the comps first: Hubert gives feedback on your words.');
    setAsking(true);
    try {
      await ws.askClientWords(OVERVIEW, 'feedback', { result: m.result });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }

  const setText = (key: LineKey | 'signOff') => (v: Entry<string> | undefined) => {
    const next = { ...m.send };
    if (v) next[key] = v;
    else delete next[key];
    ws.setSend(next);
  };
  const setBrief = (key: 'clientName' | 'clientNote') => (v: Entry<string> | undefined) => {
    const brief = { ...ws.brief };
    if (v) brief[key] = v;
    else delete brief[key];
    ws.setBrief(brief);
  };

  async function help(job: 'draft' | 'rewrite') {
    if (locked) return;
    setBusy(job);
    setNote(null);
    try {
      await ws.flush(); // the server reads the lines the agent sees
      const r = await linesApi.ask(ws.reportId, job, m.result, practice);
      const keys = LINE_KEYS.filter((k) => r.lines[k]);
      const kept = r.dropped.length ? ` ${r.dropped.map((k) => LINE_NAME[k]).join(' and ')} would have needed a figure you haven’t given, so it’s left to you.` : '';
      if (!keys.length) {
        setNote({ job, text: (job === 'draft' ? 'Your notes don’t say enough to draft these. They’re yours to write.' : 'Your lines already read well: nothing to change.') + kept });
        return;
      }
      const before: Offered['before'] = { chosen: m.send.chosen, consider: m.send.consider, nextStep: m.send.nextStep };
      const next: SendState = { ...m.send };
      for (const k of keys) next[k] = entry(r.lines[k]!, ws.today);
      ws.setSend(next);
      setOffered({ job, lines: r.lines, before });
      const names = keys.map((k) => `“${LINE_NAME[k]}”`).join(keys.length === 2 ? ' and ' : ', ');
      setNote({ job, text: `${job === 'draft' ? `Drafted from your notes: ${names}.` : `Tidied: ${names}.`} Read it over: it’s yours to change.${kept}` });
    } catch (e) {
      setNote({ job, text: e instanceof ApiError || e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  }

  function undo() {
    if (!offered || off) return;
    const next: SendState = { ...m.send };
    for (const k of LINE_KEYS) {
      if (!(k in offered.lines)) continue;
      const was = offered.before[k];
      if (was) next[k] = was;
      else delete next[k];
    }
    ws.setSend(next);
    setOffered(null);
    setNote(null);
  }

  const mark = (k: LineKey) => (offered && offered.lines[k] && m.send[k]?.value === offered.lines[k]
    ? <span className="se-line-mark"><span className="se-star" aria-hidden="true">✦</span>{offered.job === 'draft' ? 'Drafted from your notes' : 'Tidied'}</span>
    : null);

  const line = (k: LineKey, placeholder: string, rows: number) => (
    <label className="se-field se-line">
      <span className="se-line-head"><span className="fh">{LINE_NAME[k]}</span>{mark(k)}</span>
      <TextInput label={LINE_NAME[k]} multiline rows={rows} value={m.send[k]} onChange={setText(k)} today={ws.today} disabled={locked} placeholder={placeholder} />
    </label>
  );

  return (
    <section className="se-lines cw-overview" aria-label="The overview">
      {/* A div, not a header: the studio's nav styles every header:first-of-type. */}
      <div className="se-lines-head">
        <div className="se-sec se-lines-title">
          The overview
          <Info label="About the overview" align="left" text={practice
            ? 'It sits at the top of the email, under the range: your headline, how you chose the comps, things to consider and the next step. Write it, ask Hubert for feedback, then Draft from notes opens.'
            : 'It sits at the top of the email, under the range: your headline, how you chose the comps, things to consider and the next step. Write it, or have Hubert draft it from your notes, then tidy the wording.'} />
        </div>
        {!off && (
          <div className="se-lines-actions">
            <button
              type="button"
              className="btn small-btn se-help"
              disabled={locked || written.length === LINE_KEYS.length || !draftOpen}
              title={!draftOpen ? 'Opens after Hubert’s feedback on yours' : written.length === LINE_KEYS.length ? 'Every line is already yours' : 'Fills the empty lines from your tiers, tags and notes'}
              onClick={() => void help('draft')}
            >
              <span className="se-star" aria-hidden="true">✦</span>{busy === 'draft' ? 'Drafting…' : 'Draft from notes'}
            </button>
          </div>
        )}
      </div>

      <div className="se-field se-line">
        <span className="se-line-head">
          <label className="fh" htmlFor="cw-headline">Headline <span className="opt">· the email’s first line</span></label>
          <HeadlineDrafts m={m} />
        </span>
        <textarea
          id="cw-headline"
          className="cw-headline"
          rows={2}
          value={m.send.headline?.value ?? ''}
          readOnly={off}
          disabled={locked}
          placeholder="One sentence, yours: what the comps show"
          onChange={(e) => m.setHeadline(e.target.value)}
        />
      </div>

      {note?.job === 'draft' && <LinesNote note={note} onUndo={offered ? undo : null} />}

      <div className="se-lines-grid">
        <label className="se-field">
          <span className="fh">To</span>
          <TextInput label="Client name" value={ws.brief.clientName ?? m.send.clientName} onChange={setBrief('clientName')} today={ws.today} disabled={locked} placeholder="Client name" />
        </label>
        <label className="se-field">
          <span className="fh">Signed</span>
          <TextInput label="Signed" value={m.send.signOff} onChange={setText('signOff')} today={ws.today} disabled={locked} placeholder={ws.agentName || 'Your name'} />
        </label>
      </div>
      {line('chosen', 'e.g. I focused on lower floors and homes close in size.', 2)}
      {line('consider', 'Buildings that trade higher or lower, carrying costs, recent activity in the building. One a line.', 3)}
      {line('nextStep', ws.side === 'seller' ? 'Where you’d list it, and why' : 'What you’d offer, and on what terms', 3)}

      {!off && (
        <div className="se-lines-actions se-lines-tidy">
          <button type="button" className="btn small-btn se-help" disabled={locked || !written.length} title={written.length ? 'Clarity and grammar only: the same points and numbers' : 'Write a line first'} onClick={() => void help('rewrite')}>
            <span className="se-star" aria-hidden="true">✦</span>{busy === 'rewrite' ? 'Tidying…' : 'Tidy the wording'}
          </button>
        </div>
      )}
      {note?.job === 'rewrite' && <LinesNote note={note} onUndo={offered ? undo : null} />}

      {!off && (
        <div className="cw-ask">
          <button type="button" className={`btn small-btn${practice ? ' primary' : ''}`} disabled={locked || asking} onClick={() => void feedback()}>
            {asking ? 'Reading…' : latestRound(rounds, 'feedback') ? 'Feedback again' : 'Get Hubert’s feedback'}
          </button>
          <span className="cw-quiet">{practice && !draftOpen ? 'What’s unclear, unsupported or off-voice. Draft from notes opens after it.' : 'What’s unclear, unsupported or off-voice, for the client.'}</span>
        </div>
      )}
      {problem && <p className="rv-err" role="alert">{problem}</p>}
      <ClientRounds rounds={rounds} />

      <div className="se-lines-foot">
        <label className="se-field se-client-note">
          <span className="fh">About the client <span className="opt">(for you)</span></span>
          <TextInput label="Client note" value={ws.brief.clientNote} onChange={setBrief('clientNote')} today={ws.today} disabled={locked} />
          <span className="se-hint">What matters to them. It isn’t quoted in the email, and Hubert doesn’t see it.</span>
        </label>
        {!off && m.done && !m.writing && (
          <button type="button" className="link" onClick={() => m.setSend({ useTemplate: !m.send.useTemplate, draft: undefined, drafts: undefined })}>
            {m.send.useTemplate ? 'Use Hubert’s draft' : 'Use the template instead'}
          </button>
        )}
      </div>
    </section>
  );
}

/** What Draft or Tidy did, beside the button that did it, with Undo. */
function LinesNote({ note, onUndo }: { note: { text: string; error?: boolean }; onUndo: (() => void) | null }) {
  return (
    <p className={`se-lines-note${note.error ? ' error' : ''}`} role="status">
      {note.text}
      {onUndo && !note.error && <>{' '}<button type="button" className="link" onClick={onUndo}>Undo</button></>}
    </p>
  );
}
