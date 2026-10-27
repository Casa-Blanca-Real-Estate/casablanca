// Send (Dispatch 14, item 10; the handoff's screens 9 and 10; Dispatch 18;
// Dispatch 26). Left, what QA found: "N to fix", numbered as the email marks
// them, each with Show, and "✦ Fix both" for the fixes QA can make itself.
// Right, first the client's words: the overview and a paragraph per comp,
// written for the client in their own step (send/ClientFlow.tsx), which opens
// by itself the first time. Then the email: Designed leads, the piece the agent
// sends; Text beside it, "Then text them", the next thing to send; Full and
// Short under "Plain-text fallback", for a mail app that mangles the HTML.
// Each has the subject, its own field with its own Copy; Full has the headline
// (D-21: Copy waits for it) and the plain-text body the agent edits, the source
// of truth QA reads, with the issues painted over it. Then Copy, and Mark as
// sent beside it, copied or not.
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
import { useEffect, useState } from 'react';
import type { ResultKind } from '../../../engine/index.ts';
import { clientProgress, clientSteps } from '../../../workspace/client-words.ts';
import { AnnotatedText, revealMark, type TextMark } from '../send/AnnotatedText.tsx';
import { ClientFlow } from '../send/ClientFlow.tsx';
import { HeadlineDrafts } from '../send/ClientOverview.tsx';
import { COPY_LABEL, FALLBACK_FORMATS, LEAD_FORMATS, LENGTH_WORD, sentDay } from '../send/copy.ts';
import { footOf } from '../send/drafts.ts';
import { IssuesPanel } from '../send/IssuesPanel.tsx';
import type { SendIssue } from '../send/issues.ts';
import { useSendEmail, type SendModel } from '../send/useSendEmail.ts';
import '../../styles/send.css';
import { BuildNote, StubTag } from './bits.tsx';
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
  // The client step (Dispatch 26): open at a step, or closed. It opens by itself the first time Send does.
  const [writing, setWriting] = useState<{ at: string | null } | null>(null);
  useEffect(() => {
    if (!m.ready || ws.readOnly || m.send.clientFlowSeen) return;
    m.setSend({ clientFlowSeen: true });
    setWriting({ at: null });
  }, [m.ready]);

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
        <ClientCard ws={ws} m={m} onOpen={(at) => setWriting({ at })} />

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
              {LEAD_FORMATS.map((f) => (
                <button key={f.id} type="button" aria-pressed={m.format === f.id} className={m.format === f.id ? 'on' : ''} onClick={() => m.pickFormat(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </header>
          <Fallback m={m} />

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
      {writing && <ClientFlow ws={ws} m={m} startAt={writing.at} onClose={() => setWriting(null)} />}
    </div>
  );
}

/**
 * The client's words, first on Send (Dispatch 26): how far they are, and the
 * way into the client step. The email below is built from them.
 */
function ClientCard({ ws, m, onOpen }: { ws: Workspace; m: SendModel; onOpen: (at: string | null) => void }) {
  const steps = clientSteps(m.o, m.result, ws.comps);
  const p = clientProgress(m.send, steps);
  const complete = p.overview && p.written === p.total;
  return (
    <section className="panel se-lines cw-card" aria-label="The client’s words">
      <div className="se-lines-head">
        <div className="se-sec se-lines-title"><span className="se-sec-n">01</span>The client’s words</div>
        <button type="button" className={`btn small-btn${complete ? '' : ' primary'}`} onClick={() => onOpen(null)}>
          {m.off ? 'Read them' : complete ? 'Edit them' : p.overview || p.written ? 'Keep writing' : 'Write it for the client'}
        </button>
      </div>
      <p className="cw-progress">
        <span className={p.overview ? 'on' : ''}>{p.overview ? '✓' : '○'} The overview</span>
        <span className={p.total && p.written === p.total ? 'on' : ''}>{p.total && p.written === p.total ? '✓' : '○'} {p.written} of {p.total} comp{p.total === 1 ? '' : 's'} written for the client</span>
      </p>
      <p className="se-hint">
        {ws.level === 'practice'
          ? 'An overview, then a paragraph for each comp the email shows, in your words. Hubert gives feedback; his version shows after that.'
          : 'An overview, then a paragraph for each comp the email shows. Hubert drafts each one; edit it or approve it.'}
      </p>
    </section>
  );
}

/** Full and Short, the plain-text fallbacks (Dispatch 26): for a mail app that mangles the designed email. */
function Fallback({ m }: { m: SendModel }) {
  const inFallback = m.format === 'full' || m.format === 'short';
  return (
    <details className="se-fallback" open={inFallback}>
      <summary>Plain-text fallback</summary>
      <div className="se-fallback-row">
        <span className="se-hint">If their mail mangles the designed email, send one of these instead.</span>
        <div className="se-tabs" role="group" aria-label="Plain-text fallback">
          {FALLBACK_FORMATS.map((f) => (
            <button key={f.id} type="button" aria-pressed={m.format === f.id} className={m.format === f.id ? 'on' : ''} onClick={() => m.pickFormat(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </details>
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
        <span className="se-label se-right">What you send: the overview, then a box per comp</span>
      </div>
      <div className="se-stage">
        <div className="se-designed-card" dangerouslySetInnerHTML={{ __html: m.designed() }} />
      </div>
      <span className="se-label">
        Copies as HTML for Gmail, with Casa’s copies of the photos. Send the text next.
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

