// Send (Dispatch 14, item 10; the handoff's screens 9 and 10; Dispatch 18).
// Left, what QA found: "N to fix", numbered as the email marks them, each with
// Show, and "✦ Fix both" for the fixes QA can make itself. Right, the email:
// the tabs Designed, Full, Short and Text; the subject, its own field with its
// own Copy; the headline (D-21: Copy waits for it), which is also the email's
// first line, with its drafts; the plain-text body the agent edits, the source
// of truth, with the issues painted over it; Designed, the Full draft laid out
// as the branded email; then Copy, and Mark as sent beside it, copied or not.
//
// Everything CR-5 built stays: Hubert (the writer) drafts the headline and the
// email in the house voice in the background, the template stands in when it
// fails, the agent's lines feed both, an out-of-date draft says so, and every
// copy is logged with QA's checks and the agent's answers.
//
// The agent's lines come first (dev note dn_mviipah6rs3v, 2026-10-21): they're
// how the email is written, so they lead the main column, open, with Hubert's
// help beside them — draft the empty ones from the agent's notes, tidy the
// wording, ask him for feedback — and Undo. And Hubert reads the email and
// changes its words when asked: Send writes down what it shows (send.seen),
// and applies his checked edits here, as the agent's own typing would be.
import { useEffect, useRef, useState } from 'react';
import { ApiError, linesApi } from '../../api.ts';
import type { ResultKind } from '../../../engine/index.ts';
import type { Entry, SendState } from '../../../workspace/state.ts';
import { AnnotatedText, revealMark, type TextMark } from '../send/AnnotatedText.tsx';
import { COPY_LABEL, FORMATS, LENGTH_WORD, sentDay } from '../send/copy.ts';
import { footOf } from '../send/drafts.ts';
import { IssuesPanel } from '../send/IssuesPanel.tsx';
import type { SendIssue } from '../send/issues.ts';
import { useSendEmail, type SendModel } from '../send/useSendEmail.ts';
import '../../styles/send.css';
import { BuildNote, entry, StubTag, TextInput } from './bits.tsx';
import type { StepProps, Workspace } from './model.ts';

const marksOf = (issues: SendIssue[], where: 'body' | 'headline'): TextMark[] =>
  issues.flatMap((i) => i[where].map((s) => ({ start: s.start, end: s.end, issue: i.key, n: i.n, blocking: i.blocking })));

/** Show: the issue's mark, flashed and selected; or, with none, the field it's about. */
function reveal(i: SendIssue) {
  if (revealMark(i.key)) return;
  const id = i.target === 'headline' ? 'se-headline' : i.target === 'subject' ? 'se-subject' : i.target === 'end' ? 'se-body' : null;
  const el = id ? document.getElementById(id) as HTMLTextAreaElement | HTMLInputElement | null : null;
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.focus({ preventScroll: true });
  if (i.target === 'end') el.setSelectionRange(el.value.length, el.value.length);
}

export function SendStep({ ws }: StepProps) {
  const m = useSendEmail(ws);
  const [pending, setPending] = useState<SendIssue | null>(null);
  const format = m.ready ? m.format : null;

  // What Send shows, written down for Hubert (get_email): the open tab and its plain text.
  const seenKey = m.ready && !m.off ? JSON.stringify([m.format, m.length, m.shown.subject, m.send.headline?.value ?? '', m.shown.text]) : null;
  useEffect(() => {
    if (!seenKey || !m.ready) return;
    const s = m.send.seen;
    if (s && JSON.stringify([s.format, s.length, s.subject, s.headline, s.text]) === seenKey) return;
    m.setSend({ seen: { format: m.format, length: m.length, subject: m.shown.subject, headline: m.send.headline?.value ?? '', text: m.shown.text, at: new Date().toISOString() } });
  }, [seenKey]);

  // Hubert's edits, applied as they arrive (or when Send opens after he made them), with Undo.
  const edits = ws.hubertEdits;
  useEffect(() => {
    if (!edits.length || !m.ready) return;
    ws.takeHubertEdits(edits.length);
    const before = ws.send;
    const { applied, missed } = m.applyHubert(edits);
    if (applied) ws.toast(missed.length ? `Hubert changed the email. ${missed[0]}` : 'Hubert changed the email.', { label: 'Undo', run: () => ws.setSend(before) });
    else if (missed.length) ws.toast(missed[0]!);
  }, [edits, m.ready]);

  // Show from Designed (or for the headline from Short or Text) opens Full first, then finds the mark.
  useEffect(() => {
    if (!pending || format !== 'full') return;
    const i = pending;
    setPending(null);
    window.setTimeout(() => reveal(i), 60);
  }, [pending, format]);

  if (!m.revealed) {
    return (
      <div className="se-wait panel">
        <p>The email quotes what the comps say, so it waits for your number on Findings.</p>
        <button type="button" className="btn primary" onClick={() => ws.go('findings')}>Go to Findings</button>
      </div>
    );
  }
  if (!m.ready) return <p className="notice error-notice">The engine couldn’t compute{ws.engineError ? `: ${ws.engineError}` : '.'}</p>;

  const show = (i: SendIssue) => {
    const inFull = m.format === 'full';
    const needsFull = m.format === 'designed' || (!inFull && (i.target === 'headline' || (i.headline.length > 0 && !i.body.length)));
    if (needsFull) {
      m.pickFormat('full');
      setPending(i);
      return;
    }
    reveal(i);
  };

  return (
    <div className="se-send">
      <div className="se-grid">
        <div className="se-side">
          <IssuesPanel issues={m.issues} canChange={!m.off} onShow={show} onFix={() => m.fix()} onAnswer={m.answer} />
          {m.both && <WhichResult m={m} />}
        </div>

        <div className="se-main">
        <YourLines ws={ws} m={m} />

        <section className="panel se-card" aria-label="The email">
          <header className="se-card-head">
            <div className="se-sec"><span className="se-sec-n">02</span>Email</div>
            <span className="se-status" role="status">
              <span className="se-star" aria-hidden="true">✦</span>
              {m.writing
                ? `Hubert is drafting the ${LENGTH_WORD[m.writing.length]}${m.writing.length === 'text' ? '' : ' email'}${m.writing.progress ? ` (${m.writing.progress.toLocaleString('en-US')} characters so far)` : ''}…`
                : `${m.usesWriter ? 'Drafted' : 'Template'}${m.draftHere ? ' · edited by you' : ''}`}
            </span>
            {!m.off && m.everWritten && !m.writing && (
              <button type="button" className="link se-rewrite" title="Hubert writes it again from the comps and your lines" onClick={() => void m.writeIt()}>Redraft</button>
            )}
            <div className="se-tabs" role="group" aria-label="Format">
              {FORMATS.map((f) => (
                <button key={f.id} type="button" aria-pressed={m.format === f.id} className={m.format === f.id ? 'on' : ''} onClick={() => m.pickFormat(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </header>

          <Notices m={m} />

          {m.format === 'full' && <FullBody m={m} />}
          {m.format === 'short' && <><Subject m={m} /><PlainBody m={m} label="Body · short" /></>}
          {m.format === 'text' && <TextBody m={m} />}
          {m.format === 'designed' && <DesignedBody m={m} />}

          <Foot m={m} />
          <BuildNote>
            <StubTag>CR-5</StubTag> The writer runs in a background function; each draft is pinned to its numbers (<code>narratives</code>).
            QA’s fixes are deterministic (<code>workspace/qa.ts</code>); Designed reads the Full draft’s plain text back (<code>send/designed.ts</code>).
          </BuildNote>
        </section>
        </div>
      </div>
    </div>
  );
}

/** Copy, then Mark as sent on its right (NW-101 a); after a copy, Mark as sent leads (NW-086 a). */
function Foot({ m }: { m: SendModel }) {
  const foot = footOf({ off: m.off, copiedAt: m.send.copiedAt, sentAt: m.send.sentAt, sentDay: m.send.sentAt ? sentDay(m.send.sentAt) : '' });
  return (
    <footer className="se-foot">
      {foot.note && <span className="se-foot-note" role="status">{foot.note}</span>}
      <div className="se-foot-actions">
        <span className="se-copy">
          <span className="se-tip" role="tooltip">{m.copyable ? 'Double-check before sending' : 'Fix what’s listed first'}</span>
          <button type="button" className={foot.primary === 'copy' ? 'btn primary' : 'btn'} disabled={!m.copyable} onClick={() => void m.copy()}>
            {COPY_LABEL[m.format]}
          </button>
        </span>
        {foot.markSent && (
          <button type="button" className={foot.primary === 'sent' ? 'btn primary se-sent' : 'btn se-sent'} onClick={m.markSent}>
            Mark as sent
          </button>
        )}
      </div>
    </footer>
  );
}

// ─── The card's notices: the writer, an out-of-date draft, edits on another tab ──

function Notices({ m }: { m: SendModel }) {
  const back = m.usesWriter ? 'draft' : 'template';
  return (
    <>
      {!m.off && !m.everWritten && !m.writing && (
        <div className="se-writer">
          <button type="button" className="btn primary se-write" onClick={() => void m.writeIt()}>
            <span className="se-star" aria-hidden="true">✦</span>Write it
          </button>
        </div>
      )}
      {m.failed && !m.writing && (
        <p className="se-notice">
          {m.done && !m.send.useTemplate
            ? `The newest draft didn’t come through, so this is the one before it. ${m.failed.errorMessage ?? ''}`
            : `Hubert couldn’t draft this one, so this is the template. ${m.failed.errorMessage ?? ''} Edit it, or write it again.`}
        </p>
      )}
      {(m.writeError || m.loadError) && <p className="se-notice error">{m.writeError ?? m.loadError}</p>}
      {m.draftOutOfDate && !m.writing && (
        <p className="se-notice">The numbers or your lines changed since Hubert drafted this. Redraft it to pick them up.</p>
      )}
      {m.stale && (
        <p className="se-notice">
          The numbers, your lines or the draft changed since you edited this email.{' '}
          {!m.off && <button type="button" className="link" onClick={m.discard}>Back to the {back}</button>}
          {!m.off && ' to pick them up.'}
        </p>
      )}
    </>
  );
}

// ─── The four formats ────────────────────────────────────────────────────────

function HeadlineDrafts({ m }: { m: SendModel }) {
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

/** The subject: its own field on Designed, Full and Short (not Text), with its own Copy (NW-083 a). */
function Subject({ m }: { m: SendModel }) {
  return (
    <div className="se-block se-subject-block">
      <div className="se-subject-row">
        <label className="se-label" htmlFor="se-subject">Subject</label>
        <input
          id="se-subject"
          className="se-subject"
          value={m.shown.subject}
          readOnly={m.off}
          onChange={(e) => m.editSubject(e.target.value)}
        />
        <button type="button" className="btn small-btn se-copy-subject" onClick={() => void m.copySubject()}>Copy subject</button>
      </div>
    </div>
  );
}

function BackToDraft({ m }: { m: SendModel }) {
  if (m.off || !m.draftHere || m.stale) return null;
  return (
    <button type="button" className="link se-undo" onClick={m.discard}>
      Back to the {m.usesWriter ? 'draft' : 'template'}
    </button>
  );
}

function FullBody({ m }: { m: SendModel }) {
  return (
    <>
      <Subject m={m} />
      <div className="se-block se-head-block">
        <div className="se-labelrow">
          <label className="se-label" htmlFor="se-headline">Headline <span className="se-label-note">· also the email’s first line</span></label>
          <HeadlineDrafts m={m} />
        </div>
        <AnnotatedText
          id="se-headline"
          label="Headline"
          className="se-headline"
          value={m.send.headline?.value ?? ''}
          onChange={m.setHeadline}
          marks={marksOf(m.issues, 'headline')}
          readOnly={m.off}
          spellCheck={false}
          placeholder="One sentence, yours: what the comps show"
        />
      </div>
      <PlainBody m={m} label="Body" />
    </>
  );
}

function PlainBody({ m, label }: { m: SendModel; label: string }) {
  return (
    <div className="se-block">
      <div className="se-labelrow">
        <label className="se-label" htmlFor="se-body">{label}</label>
        <BackToDraft m={m} />
      </div>
      <AnnotatedText
        id="se-body"
        label="Email body"
        className="se-body"
        value={m.shown.text}
        onChange={m.edit}
        marks={marksOf(m.issues, 'body')}
        readOnly={m.off}
      />
    </div>
  );
}

function TextBody({ m }: { m: SendModel }) {
  return (
    <div className="se-block">
      <div className="se-labelrow">
        <label className="se-label" htmlFor="se-body">Text message</label>
        <span className="se-label se-count">{m.shown.text.length.toLocaleString('en-US')} characters</span>
      </div>
      <div className="se-text-stage">
        <AnnotatedText
          id="se-body"
          label="Text message"
          className="se-bubble"
          value={m.shown.text}
          onChange={m.edit}
          marks={marksOf(m.issues, 'body')}
          readOnly={m.off}
        />
      </div>
      <div className="se-labelrow">
        <span className="se-label">Copies as plain text. The disclaimer goes with it.</span>
        <BackToDraft m={m} />
      </div>
    </div>
  );
}

function DesignedBody({ m }: { m: SendModel }) {
  return (
    <>
    <Subject m={m} />
    <div className="se-block se-designed">
      <div className="se-labelrow wrap">
        <span className="se-label">Designed · Casa Blanca branded</span>
        <span className="se-label se-right">Same findings as Full, laid out for the client</span>
      </div>
      <div className="se-stage">
        <div className="se-designed-card" dangerouslySetInnerHTML={{ __html: m.designed() }} />
      </div>
      <span className="se-label">
        Copies as HTML for Gmail, with the Full email’s words. Photos come later: the gray blocks hold their place.
      </span>
    </div>
    </>
  );
}

// ─── The left column's other panels ──────────────────────────────────────────

const RESULT_WORDS: { id: ResultKind; label: string }[] = [
  { id: 'on_facts', label: 'On the facts' },
  { id: 'with_estimates', label: 'With your estimates' },
];

/** When the agent's estimates change the answer, which result the email uses (§6.4). */
function WhichResult({ m }: { m: SendModel }) {
  return (
    <section className="panel se-panel" aria-label="Which result">
      <span className="fh">The email uses</span>
      <div className="seg small" role="group" aria-label="Which result the email uses">
        {RESULT_WORDS.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={m.result === r.id}
            className={m.result === r.id ? 'on' : ''}
            disabled={m.off || (r.id === 'on_facts' && !m.o.results.on_facts.range)}
            onClick={() => m.setSend({ result: r.id })}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="se-hint">{m.result === 'with_estimates' ? 'Uses your estimates: the email says so.' : 'On the facts: no estimate of yours in it.'}</p>
    </section>
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

/** The message "Ask Hubert" sends: the agent's own lines, for feedback only. */
export function feedbackAsk(send: SendState): string {
  const lines = LINE_KEYS.map((k) => (send[k]?.value.trim() ? `${LINE_NAME[k]}: ${send[k]!.value.trim()}` : null)).filter(Boolean);
  return [
    'How do my lines for the email read? Feedback only, please: don’t change anything yet.',
    ...(lines.length ? ['', ...lines] : []),
  ].join('\n');
}

/**
 * The agent's own lines, first-class (dn_mviipah6rs3v): the email is written
 * from them, so they lead, open. Hubert helps on request: drafts the empty
 * ones from the agent's notes, tidies the wording (clarity and grammar, the
 * same points and numbers), or gives feedback in the drawer. Each of his
 * changes can be undone, and a line he wrote says so until the agent edits it.
 */
function YourLines({ ws, m }: { ws: Workspace; m: SendModel }) {
  const off = m.off;
  const [busy, setBusy] = useState<'draft' | 'rewrite' | null>(null);
  const [offered, setOffered] = useState<Offered | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const written = LINE_KEYS.filter((k) => m.send[k]?.value.trim());
  const locked = off || busy !== null;

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
      const r = await linesApi.ask(ws.reportId, job, m.result);
      const keys = LINE_KEYS.filter((k) => r.lines[k]);
      const kept = r.dropped.length ? ` ${r.dropped.map((k) => LINE_NAME[k]).join(' and ')} would have needed a figure you haven’t given, so it’s left to you.` : '';
      if (!keys.length) {
        setNote({ text: (job === 'draft' ? 'Your notes don’t say enough to draft these. They’re yours to write.' : 'Your lines already read well: nothing to change.') + kept });
        return;
      }
      const before: Offered['before'] = { chosen: m.send.chosen, consider: m.send.consider, nextStep: m.send.nextStep };
      const next: SendState = { ...m.send };
      for (const k of keys) next[k] = entry(r.lines[k]!, ws.today);
      ws.setSend(next);
      setOffered({ job, lines: r.lines, before });
      const names = keys.map((k) => `“${LINE_NAME[k]}”`).join(keys.length === 2 ? ' and ' : ', ');
      setNote({ text: `${job === 'draft' ? `Drafted from your notes: ${names}.` : `Tidied: ${names}.`} Read it over: it’s yours to change.${kept}` });
    } catch (e) {
      setNote({ text: e instanceof ApiError || e instanceof Error ? e.message : String(e), error: true });
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
    <section className="panel se-lines" aria-label="Your lines">
      {/* A div, not a header: the studio's nav styles every header:first-of-type. */}
      <div className="se-lines-head">
        <div>
          <div className="se-sec"><span className="se-sec-n">01</span>Your lines</div>
          <p className="se-hint">The email is written from these, in your words. Write them, or have Hubert draft them from your notes and tidy them after.</p>
        </div>
        {!off && (
          <div className="se-lines-actions">
            <button type="button" className="btn small-btn se-help" disabled={locked || written.length === LINE_KEYS.length} title={written.length === LINE_KEYS.length ? 'Every line is already yours' : 'Fills the empty lines from your tiers, tags and notes'} onClick={() => void help('draft')}>
              <span className="se-star" aria-hidden="true">✦</span>{busy === 'draft' ? 'Drafting…' : 'Draft from my notes'}
            </button>
            <button type="button" className="btn small-btn se-help" disabled={locked || !written.length} title={written.length ? 'Clarity and grammar only: the same points and numbers' : 'Write a line first'} onClick={() => void help('rewrite')}>
              <span className="se-star" aria-hidden="true">✦</span>{busy === 'rewrite' ? 'Tidying…' : 'Tidy the wording'}
            </button>
            <button type="button" className="btn small-btn" disabled={!written.length} title={written.length ? 'Opens Hubert with your lines: feedback, no changes' : 'Write a line first'} onClick={() => ws.askHubert(feedbackAsk(m.send))}>
              Ask Hubert for feedback
            </button>
          </div>
        )}
      </div>

      {note && (
        <p className={`se-lines-note${note.error ? ' error' : ''}`} role="status">
          {note.text}
          {offered && !note.error && <>{' '}<button type="button" className="link" onClick={undo}>Undo</button></>}
        </p>
      )}

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
