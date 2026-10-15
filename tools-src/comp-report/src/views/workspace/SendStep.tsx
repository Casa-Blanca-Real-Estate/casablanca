// Send (Dispatch 14, item 10; the handoff's screens 9 and 10). Left, what QA
// found: "N to fix", numbered as the email marks them, each with Show, and
// "✦ Fix both" for the fixes QA can make itself. Right, the email: the tabs
// Full, Designed, Short and Text; the headline (D-21: Copy waits for it) with
// its drafts; the plain-text body the agent edits, the source of truth, with
// the issues painted over it; Designed, the Full draft laid out as the
// branded email; then Mark as sent (after a copy) and Copy.
//
// Everything CR-5 built stays: Hubert (the writer) drafts the headline and the
// email in the house voice in the background, the template stands in when it
// fails, the agent's lines feed both, an out-of-date draft says so, and every
// copy is logged with QA's checks and the agent's answers.
import { useEffect, useRef, useState } from 'react';
import type { ResultKind } from '../../../engine/index.ts';
import type { Entry } from '../../../workspace/state.ts';
import { AnnotatedText, revealMark, type TextMark } from '../send/AnnotatedText.tsx';
import { COPY_LABEL, FORMATS, LENGTH_WORD, sentDay } from '../send/copy.ts';
import { IssuesPanel } from '../send/IssuesPanel.tsx';
import type { SendIssue } from '../send/issues.ts';
import { useSendEmail, type SendModel } from '../send/useSendEmail.ts';
import '../../styles/send.css';
import { BuildNote, StubTag, TextInput } from './bits.tsx';
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
          <IssuesPanel issues={m.issues} canChange={!m.off && !m.editedElsewhere} onShow={show} onFix={() => m.fix()} onAnswer={m.answer} />
          {m.both && <WhichResult m={m} />}
          <YourLines ws={ws} m={m} />
        </div>

        <section className="panel se-card" aria-label="The email">
          <header className="se-card-head">
            <div className="se-sec"><span className="se-sec-n">01</span>Email</div>
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
          {m.format === 'short' && <PlainBody m={m} label="Body · short" />}
          {m.format === 'text' && <TextBody m={m} />}
          {m.format === 'designed' && <DesignedBody m={m} />}

          <footer className="se-foot">
            {m.send.sentAt
              ? <span className="se-foot-note">Marked as sent {sentDay(m.send.sentAt)}.</span>
              : !m.off && !m.send.copiedAt && <span className="se-foot-note">Copy it, send it, then mark it as sent.</span>}
            <div className="se-foot-actions">
              {!m.off && (
                <button type="button" className="btn se-sent" disabled={!m.send.copiedAt} title={m.send.copiedAt ? undefined : 'Copy it first'} onClick={m.markSent}>
                  Mark as sent
                </button>
              )}
              <span className="se-copy">
                <span className="se-tip" role="tooltip">{m.copyable ? 'Double-check before sending' : 'Fix what’s listed first'}</span>
                <button type="button" className="btn primary" disabled={!m.copyable} onClick={() => void m.copy()}>
                  {COPY_LABEL[m.format]}
                </button>
              </span>
            </div>
          </footer>
          <BuildNote>
            <StubTag>CR-5</StubTag> The writer runs in a background function; each draft is pinned to its numbers (<code>narratives</code>).
            QA’s fixes are deterministic (<code>workspace/qa.ts</code>); Designed reads the Full draft’s plain text back (<code>send/designed.ts</code>).
          </BuildNote>
        </section>
      </div>
    </div>
  );
}

// ─── The card's notices: the writer, an out-of-date draft, edits on another tab ──

function Notices({ m }: { m: SendModel }) {
  const back = m.usesWriter ? 'draft' : 'template';
  return (
    <>
      {!m.off && !m.everWritten && !m.writing && (
        <div className="se-writer">
          <p>Hubert drafts the headline and the email from the comps that count, in the house voice. Or edit the template below.</p>
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
          {!m.off && <button type="button" className="link" onClick={() => m.setSend({ draft: undefined })}>Back to the {back}</button>}
          {!m.off && ' to pick them up.'}
        </p>
      )}
      {m.editedElsewhere && (
        <p className="se-notice">
          Your edits are on the {LENGTH_WORD[m.editedElsewhere]}{m.editedElsewhere === 'text' ? '' : ' email'}, so this one shows as drafted.{' '}
          {!m.off && (
            <button type="button" className="link" onClick={() => m.setSend({ draft: undefined })}>
              Edit this one instead
            </button>
          )}
          {!m.off && ' (your edits there go).'}
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

function Subject({ m }: { m: SendModel }) {
  return (
    <div className="se-subject-row">
      <label className="se-label" htmlFor="se-subject">Subject</label>
      <input
        id="se-subject"
        className="se-subject"
        value={m.shown.subject}
        readOnly={m.off || Boolean(m.editedElsewhere)}
        onChange={(e) => m.edit({ subject: e.target.value })}
      />
    </div>
  );
}

function BackToDraft({ m }: { m: SendModel }) {
  if (m.off || !m.draftHere || m.stale) return null;
  return (
    <button type="button" className="link se-undo" onClick={() => m.setSend({ draft: undefined })}>
      Back to the {m.usesWriter ? 'draft' : 'template'}
    </button>
  );
}

function FullBody({ m }: { m: SendModel }) {
  return (
    <>
      <div className="se-block se-head-block">
        <div className="se-labelrow">
          <label className="se-label" htmlFor="se-headline">Headline</label>
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
      <Subject m={m} />
      <div className="se-labelrow">
        <label className="se-label" htmlFor="se-body">{label}</label>
        <BackToDraft m={m} />
      </div>
      <AnnotatedText
        id="se-body"
        label="Email body"
        className="se-body"
        value={m.shown.text}
        onChange={(body) => m.edit({ body })}
        marks={marksOf(m.issues, 'body')}
        readOnly={m.off || Boolean(m.editedElsewhere)}
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
          onChange={(body) => m.edit({ body })}
          marks={marksOf(m.issues, 'body')}
          readOnly={m.off || Boolean(m.editedElsewhere)}
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

/** The agent's own lines: the template's words, and what the writer works from. Folded. */
function YourLines({ ws, m }: { ws: Workspace; m: SendModel }) {
  const off = m.off;
  const setText = (key: 'chosen' | 'consider' | 'nextStep' | 'signOff') => (v: Entry<string> | undefined) => {
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
  return (
    <details className="panel se-panel se-lines">
      <summary>Your lines for the email</summary>
      <p className="se-hint">The template uses them as they are; Hubert drafts from them and keeps your next step’s meaning and numbers.</p>
      <label className="se-field">
        <span className="fh">To</span>
        <TextInput label="Client name" value={ws.brief.clientName ?? m.send.clientName} onChange={setBrief('clientName')} today={ws.today} disabled={off} placeholder="Client name" />
      </label>
      <label className="se-field">
        <span className="fh">How you chose the comps</span>
        <TextInput label="How you chose the comps" multiline value={m.send.chosen} onChange={setText('chosen')} today={ws.today} disabled={off} placeholder="e.g. I focused on lower floors and homes close in size." />
      </label>
      <label className="se-field">
        <span className="fh">Things to consider</span>
        <TextInput label="Things to consider" multiline value={m.send.consider} onChange={setText('consider')} today={ws.today} disabled={off} placeholder="Buildings that trade higher or lower, carrying costs, recent activity in the building" />
      </label>
      <label className="se-field">
        <span className="fh">The next step</span>
        <TextInput
          label="The next step"
          multiline
          value={m.send.nextStep}
          onChange={setText('nextStep')}
          today={ws.today}
          disabled={off}
          placeholder={ws.side === 'seller' ? 'Where you’d list it, and why' : 'What you’d offer, and on what terms'}
        />
      </label>
      <label className="se-field">
        <span className="fh">Signed</span>
        <TextInput label="Signed" value={m.send.signOff} onChange={setText('signOff')} today={ws.today} disabled={off} placeholder={ws.agentName || 'Your name'} />
      </label>
      <label className="se-field">
        <span className="fh">About the client <span className="opt">(for you)</span></span>
        <TextInput label="Client note" value={ws.brief.clientNote} onChange={setBrief('clientNote')} today={ws.today} disabled={off} />
        <span className="se-hint">What matters to them. It isn’t quoted in the email, and Hubert doesn’t see it.</span>
      </label>
      {!off && m.done && !m.writing && (
        <button type="button" className="link" onClick={() => m.setSend({ useTemplate: !m.send.useTemplate, draft: undefined })}>
          {m.send.useTemplate ? 'Use Hubert’s draft' : 'Use the template instead'}
        </button>
      )}
    </details>
  );
}
