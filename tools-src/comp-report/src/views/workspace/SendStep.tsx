// Send (Dispatch 14, 18, 26; the design pass's Send, 2026-11-06,
// docs/comp-report/design-pass/send.md). The email is the product, so the page
// is built around it: a left rail beside the email's preview, everything the
// agent does to send it in reach without scrolling.
//
//   The rail: Before you send (QA's issues, numbered and marked on the
//   preview, each with Hide/Show in the email and, where the words are the fix,
//   Fix in place; the client's words still to write; Ask Hubert to review),
//   1 · Email subject (the subject, Copy & open in Gmail, copy only, Gmail
//   draft · soon, the plain-text fallbacks), 2 · Text msg (opens once the
//   email is out).
//
//   The preview: the designed email, filling the window's height and
//   scrolling inside. The agent's words are editable in place (NW-079 b) and
//   save to the same fields the client's-words step writes; figures never are.
//
//   The step button, one component in two places (the progress row, and
//   sticky at the preview's foot): Read the full email ↓, then Copy & open in
//   Gmail, then Mark as sent ✓ →. Reading is the gate.
//
// Everything CR-5 built stays: Hubert (the writer) drafts in the background,
// the template stands in when it fails, an out-of-date draft says so, every
// copy is logged with QA's checks and the agent's answers, and Hubert's edits
// to the email apply here with Undo.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ResultKind } from '../../../engine/index.ts';
import { clientProgress, clientSteps, lineBy } from '../../../workspace/client-words.ts';
import { ClientFlow } from '../send/ClientFlow.tsx';
import { HeadlineDrafts } from '../send/ClientOverview.tsx';
import type { SendIssue } from '../send/issues.ts';
import { useSendEmail, type SendModel } from '../send/useSendEmail.ts';
import type { Acknowledgment } from '../../../workspace/qa.ts';
import '../../styles/send.css';
import { entry } from './bits.tsx';
import type { StepProps, Workspace } from './model.ts';

const ANSWER_LABEL: Record<Acknowledgment['how'], string> = {
  attributed: 'It’s mine or the client’s',
  acknowledged: 'Keep it',
};

const HUBERT_REVIEW = 'Review the email on Send before I send it: anything a client could misread, anything that doesn’t match the report, and anything worth saying better. List what to fix first.';

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" />
      <path d="M10.5 3.5V2.5H2.5V10.5H3.5" />
    </svg>
  );
}

/** Where the email stands, for the step button and the rail. */
interface Flow {
  read: boolean;
  out: boolean;
  copyOpen: () => void;
  copyOnly: () => void;
}

export function SendStep({ ws }: StepProps) {
  const m = useSendEmail(ws, { format: 'designed' });
  // The client step (Dispatch 26): open at a step, or closed. It opens by itself the first time Send does.
  const [writing, setWriting] = useState<{ at: string | null } | null>(null);
  useEffect(() => {
    if (!m.ready || ws.readOnly || m.send.clientFlowSeen) return;
    m.setSend({ clientFlowSeen: true });
    setWriting({ at: null });
  }, [m.ready]);

  // Reading is the gate: the preview scrolled to its end (or a report already copied once).
  const [read, setRead] = useState(() => Boolean(ws.send.copiedAt));
  const [outNow, setOutNow] = useState(false);
  const out = outNow || Boolean(ws.send.copiedAt);

  // What Send shows, written down for Hubert (get_email): Designed, the Full draft's plain text.
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

  // The progress row's slot for the step button (shell/WorkspaceHeader.tsx).
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById('sh-step-slot'));
  }, []);

  if (!m.revealed) {
    return (
      <div className="se-wait panel">
        <p>The email quotes what the comps say, so it waits for your number on Findings.</p>
        <button type="button" className="btn primary" onClick={() => ws.go('findings')}>Go to Findings</button>
      </div>
    );
  }
  if (!m.ready) return <p className="notice error-notice">The engine couldn’t compute{ws.engineError ? `: ${ws.engineError}` : '.'}</p>;

  const flow: Flow = {
    read,
    out,
    // Copy, then Gmail's compose window in a new tab, in the same click: the clipboard and the pop-up both need it.
    copyOpen: () => {
      if (!read || !m.copyable) return;
      void m.copy('designed').then((ok) => {
        if (ok) ws.toast('Email copied. Gmail opened in a new tab: paste it in (⌘V).');
      });
      window.open(m.gmailUrl, '_blank', 'noopener');
      setOutNow(true);
    },
    copyOnly: () => {
      if (!read || !m.copyable) return;
      void m.copy('designed').then((ok) => {
        if (ok) setOutNow(true);
      });
    },
  };

  return (
    <div className="se2">
      {slot && createPortal(<StepButton m={m} ws={ws} flow={flow} />, slot)}
      <div className="se2-cols">
        <aside className="se2-rail" aria-label="Sending the email">
          <BeforeYouSend ws={ws} m={m} onWrite={(at) => setWriting({ at })} />
          <EmailCard ws={ws} m={m} flow={flow} onWrite={() => setWriting({ at: null })} />
          <TextCard m={m} out={out} />
          {m.both && <WhichResult m={m} />}
        </aside>
        <Preview ws={ws} m={m} onRead={() => setRead(true)} stepButton={<StepButton m={m} ws={ws} flow={flow} />} />
      </div>
      {writing && <ClientFlow ws={ws} m={m} startAt={writing.at} onClose={() => setWriting(null)} />}
    </div>
  );
}

/** The step after Send, one component in two places: read, then copy and open, then mark as sent. */
function StepButton({ m, ws, flow }: { m: SendModel; ws: Workspace; flow: Flow }) {
  if (!flow.read) {
    return <button type="button" className="btn se2-step se2-lock" aria-disabled="true" title="Scroll the email to its end">Read the full email ↓</button>;
  }
  if (!flow.out) {
    return (
      <button
        type="button"
        className="btn primary se2-step"
        disabled={!m.copyable}
        title={m.copyable ? 'Copies the email and opens Gmail with the subject filled in' : 'Fix what’s listed first'}
        onClick={flow.copyOpen}
      >
        Copy &amp; open in Gmail
      </button>
    );
  }
  if (m.off) return null;
  return <button type="button" className="btn primary se2-step" onClick={() => { m.markSent(); ws.toast('Marked as sent.'); }}>Mark as sent ✓ →</button>;
}

// ─── The rail ───────────────────────────────────────────────────────────────

/**
 * Before you send: QA's issues, numbered as the preview marks them, then the
 * client's words still to write, then Ask Hubert to review. Empty: all good.
 */
function BeforeYouSend({ ws, m, onWrite }: { ws: Workspace; m: SendModel; onWrite: (at: string | null) => void }) {
  const steps = clientSteps(m.o, m.result, ws.comps);
  const p = clientProgress(m.send, steps);
  const wordsLeft = !p.overview || p.written < p.total;
  const [asked, setAsked] = useState(false);
  const busyHubert = asked && ws.hubertQuestion !== null;
  const canChange = !m.off;
  const fixable = m.issues.filter((i) => i.fix);
  return (
    <section className="se2-card" aria-label="Before you send">
      <span className="se2-head">Before you send</span>
      {m.issues.length === 0 && !wordsLeft && (
        <p className="se2-good"><span className="se2-tick" aria-hidden="true">✓</span>All good. Ready to send.</p>
      )}
      {m.issues.length > 0 && (
        <ol className="se2-issues">
          {m.issues.map((i) => <IssueRow key={i.key} i={i} m={m} canChange={canChange} />)}
        </ol>
      )}
      {canChange && fixable.length > 1 && (
        <button type="button" className="lk se2-fixall" onClick={() => m.fix()}>✦ Fix the {fixable.length} QA can fix</button>
      )}
      {wordsLeft && (
        <div className="se2-issue">
          <span className="se2-n words" aria-hidden="true">✎</span>
          <div className="se2-issue-body">
            <span>
              The client’s words: {p.overview ? 'the overview is done' : 'the overview isn’t written'}, {p.written} of {p.total} comp{p.total === 1 ? '' : 's'} written.
            </span>
            <span className="se2-links">
              <button type="button" className="lk" onClick={() => onWrite(null)}>{m.off ? 'Read them' : p.overview || p.written ? 'Keep writing' : 'Write them'}</button>
            </span>
          </div>
        </div>
      )}
      {!m.off && (
        <button
          type="button"
          className="lk se2-hubert"
          disabled={busyHubert}
          onClick={() => {
            setAsked(true);
            ws.askHubert(HUBERT_REVIEW);
          }}
        >
          {busyHubert ? '✦ Hubert is reading the email…' : asked ? '✦ Ask Hubert to review again' : '✦ Ask Hubert to review'}
        </button>
      )}
      {asked && !busyHubert && <p className="se2-note">His notes are in his panel, beside the email.</p>}
    </section>
  );
}

/** Whether the preview shows the issues' marks: one switch for every issue (Hide / Show in the email). */
const usePreviewMarks = (() => {
  let on = true;
  const listeners = new Set<() => void>();
  return {
    get: () => on,
    set: (v: boolean) => {
      on = v;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
})();

function useMarksOn(): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    const off = usePreviewMarks.subscribe(() => bump((n) => n + 1));
    return () => {
      off();
    };
  }, []);
  return usePreviewMarks.get();
}

/** Where an issue's words are in the preview: its first mark, else the piece it's about. */
function issueElement(i: SendIssue): HTMLElement | null {
  const mark = document.querySelector<HTMLElement>(`.se2-preview mark[data-issue="${CSS.escape(i.key)}"]`);
  if (mark) return mark;
  if (i.target === 'headline' || i.headline.length) return document.querySelector<HTMLElement>('.se2-preview [data-edit="headline"]');
  if (i.target === 'subject') return document.getElementById('se-subject');
  return null;
}

function IssueRow({ i, m, canChange }: { i: SendIssue; m: SendModel; canChange: boolean }) {
  const on = useMarksOn();
  const [fixing, setFixing] = useState(false);
  const inWords = i.body.length > 0 || i.headline.length > 0 || i.target === 'headline';
  const fixInPlace = () => {
    const el = issueElement(i);
    if (!fixing) {
      usePreviewMarks.set(true);
      setFixing(true);
      const target = el?.closest<HTMLElement>('[data-edit]') ?? el;
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.focus({ preventScroll: true });
      }
      return;
    }
    setFixing(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  return (
    <li className="se2-issue">
      <span className={`se2-n${i.blocking ? '' : ' note'}`} aria-label={`Issue ${i.n}`}>{i.n}</span>
      <div className="se2-issue-body">
        <span>{i.text}</span>
        <span className="se2-links">
          {inWords && (
            <button
              type="button"
              className="lk"
              onClick={() => {
                usePreviewMarks.set(!on);
                if (!on) window.setTimeout(() => issueElement(i)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
              }}
            >
              {on ? 'Hide in the email' : 'Show in the email'}
            </button>
          )}
          {canChange && i.fix && <button type="button" className="lk" onClick={() => m.fix(i)}>✦ Fix it</button>}
          {canChange && inWords && !i.fix && (
            <button type="button" className="lk" onClick={fixInPlace}>{fixing ? 'Done: mark it fixed' : 'Fix in place'}</button>
          )}
          {canChange && i.answers.map((how) => (
            <button key={how} type="button" className="lk" onClick={() => m.answer(i, how)}>{ANSWER_LABEL[how]}</button>
          ))}
        </span>
      </div>
    </li>
  );
}

/** 1 · Email subject: the subject, Copy & open in Gmail, copy only, Gmail draft · soon, and the plain text. */
function EmailCard({ ws, m, flow, onWrite }: { ws: Workspace; m: SendModel; flow: Flow; onWrite: () => void }) {
  const [tip, setTip] = useState(false);
  const [draftTip, setDraftTip] = useState(false);
  const [plain, setPlain] = useState(false);
  const locked = !flow.read;
  const blocked = !m.copyable;
  const lockTitle = locked ? 'Read the full email first' : blocked ? 'Fix what’s listed first' : undefined;
  return (
    <section className="se2-card" aria-label="The email">
      <span className="se2-head">1 · Email subject</span>
      <div className="se2-subject-row">
        <textarea
          id="se-subject"
          aria-label="Email subject"
          className="se2-subject"
          rows={2}
          value={m.shown.subject}
          readOnly={m.off}
          onChange={(e) => m.editSubject(e.target.value.replace(/\n/g, ' '))}
        />
        <button type="button" className="se2-ic" aria-label="Copy the subject" title="Copy the subject" onClick={() => void m.copySubject()}><CopyIcon /></button>
      </div>
      <div className="se2-copy-row">
        <button
          type="button"
          className={`btn primary se2-open${locked ? ' se2-lock' : ''}`}
          aria-disabled={locked || blocked || undefined}
          disabled={!locked && blocked}
          title={lockTitle}
          onClick={flow.copyOpen}
        >
          {flow.out ? 'Copy & open Gmail again' : 'Copy & open in Gmail'}
        </button>
        <button
          type="button"
          className={`se2-ic${locked || blocked ? ' off' : ''}`}
          aria-label="Copy the email only"
          aria-disabled={locked || blocked || undefined}
          title={lockTitle ?? 'Copy the email only'}
          onClick={flow.copyOnly}
        >
          <CopyIcon />
        </button>
      </div>
      <div className="se2-help">
        <span>Then paste it into the message (⌘V).</span>
        <button type="button" className="se2-tip" aria-label="How Copy and open works" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)} onFocus={() => setTip(true)} onBlur={() => setTip(false)}>?</button>
        {tip && (
          <span role="tooltip" className="se2-tipcard">
            Copies the designed email and opens a new Gmail message{m.client ? ` to ${m.client}` : ''} with the subject filled in. A Gmail link can’t carry a formatted email, so you paste it into the body.
          </span>
        )}
      </div>
      <div className="se2-help">
        <button type="button" className="se2-soon" aria-disabled="true" onMouseEnter={() => setDraftTip(true)} onMouseLeave={() => setDraftTip(false)} onFocus={() => setDraftTip(true)} onBlur={() => setDraftTip(false)}>
          Gmail draft · soon
        </button>
        {draftTip && (
          <span role="tooltip" className="se2-tipcard">
            Coming: puts the finished email straight into your Gmail drafts, formatted and addressed, with nothing to paste. It needs Casa’s Google sign-in first.
          </span>
        )}
      </div>
      <button type="button" className="lk se2-plain-link" onClick={() => setPlain(!plain)}>{plain ? 'Hide plain text' : 'Plain text (Full · Short)'}</button>
      {plain && (
        <div className="se2-plain">
          <button type="button" className="btn" disabled={blocked} title={blocked ? 'Fix what’s listed first' : undefined} onClick={() => void m.copy('full')}>Copy full</button>
          <button type="button" className="btn" onClick={() => void m.copy('short')}>Copy short</button>
        </div>
      )}
      <Writer ws={ws} m={m} onWrite={onWrite} />
    </section>
  );
}

/** The writer's line: drafting, drafted or the template, Redraft, and the notices CR-5 shows. */
function Writer({ ws, m, onWrite }: { ws: Workspace; m: SendModel; onWrite: () => void }) {
  const back = m.usesWriter ? 'draft' : 'template';
  return (
    <div className="se2-writer">
      <span className="se2-writer-line" role="status">
        <span className="se-star" aria-hidden="true">✦</span>
        {m.writing
          ? `Hubert is drafting the email${m.writing.progress ? ` (${m.writing.progress.toLocaleString('en-US')} characters so far)` : ''}…`
          : `${m.usesWriter ? 'Drafted by Hubert' : 'The template'}${m.draftHere ? ' · edited by you' : ''}`}
        {!m.off && !m.writing && (
          <button type="button" className="lk" title="Hubert writes it again from the comps and your lines" onClick={() => void m.writeIt()}>
            {m.everWritten ? 'Redraft' : 'Write it'}
          </button>
        )}
        <button type="button" className="lk" onClick={onWrite}>The client’s words</button>
      </span>
      <span className="se2-writer-line">
        <span className="se2-mini">Lead-in</span>
        <HeadlineDrafts m={m} />
      </span>
      {m.failed && !m.writing && (
        <p className="se2-note">
          {m.done && !m.send.useTemplate
            ? `The newest draft didn’t come through, so this is the one before it. ${m.failed.errorMessage ?? ''}`
            : `Hubert couldn’t draft this one, so this is the template. ${m.failed.errorMessage ?? ''}`}
        </p>
      )}
      {(m.writeError || m.loadError) && <p className="se2-note error">{m.writeError ?? m.loadError}</p>}
      {m.draftOutOfDate && !m.writing && <p className="se2-note">The numbers or your lines changed since Hubert drafted this. Redraft it to pick them up.</p>}
      {m.stale && (
        <p className="se2-note">
          The numbers, your lines or the draft changed since you edited this email.{' '}
          {!m.off && <button type="button" className="lk" onClick={m.discard}>Back to the {back}</button>}
        </p>
      )}
      {!m.off && m.draftHere && !m.stale && <button type="button" className="lk" onClick={m.discard}>Back to the {back}</button>}
      {ws.level === 'practice' && <p className="se2-note">Practice: write the client’s words first; Hubert gives feedback in that step.</p>}
    </div>
  );
}

/** 2 · Text msg: a short text for after the email, open once it's out. */
function TextCard({ m, out }: { m: SendModel; out: boolean }) {
  // The text without the disclaimer, which copies with it: the bubble shows what the agent writes.
  return (
    <section className="se2-card" aria-label="The text message">
      <span className={`se2-head${out ? '' : ' muted'}`}>2 · Text msg</span>
      {out ? (
        <>
          <textarea
            className="se2-bubble"
            aria-label="Text message"
            value={m.textMessage}
            readOnly={m.off}
            rows={Math.min(10, Math.max(3, Math.ceil(m.textMessage.length / 34)))}
            onChange={(e) => m.editText(e.target.value)}
          />
          <button type="button" className="btn" onClick={() => void m.copy('text')}>Copy the text</button>
        </>
      ) : (
        <p className="se2-note">A short text for after the email. It opens here once you’ve copied or opened the email.</p>
      )}
    </section>
  );
}

const RESULT_WORDS: { id: ResultKind; label: string }[] = [
  { id: 'on_facts', label: 'On the facts' },
  { id: 'with_estimates', label: 'With your estimates' },
];

/** When the agent's estimates change the answer, which result the email uses (§6.4). */
function WhichResult({ m }: { m: SendModel }) {
  return (
    <section className="se2-card" aria-label="Which result">
      <span className="se2-head">The email uses</span>
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
      <p className="se2-note">{m.result === 'with_estimates' ? 'Uses your estimates: the email says so.' : 'On the facts: no estimate of yours in it.'}</p>
    </section>
  );
}

// ─── The preview: the email, editable in place ──────────────────────────────

/** Wraps each place an issue's words appear in the preview in a mark, its number before the first. */
function paintMarks(root: HTMLElement, issues: SendIssue[], body: string, headline: string) {
  for (const i of issues) {
    const needles = [
      ...i.body.map((s) => body.slice(s.start, s.end)),
      ...i.headline.map((s) => headline.slice(s.start, s.end)),
    ].map((t) => t.trim()).filter((t) => t.length >= 2);
    let first = true;
    for (const needle of new Set(needles)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const hits: Text[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes(needle)) hits.push(n as Text);
      for (const node of hits.slice(0, 3)) {
        const at = node.data.indexOf(needle);
        const rest = node.splitText(at);
        rest.splitText(needle.length);
        const mark = document.createElement('mark');
        mark.className = `se2-mark${i.blocking ? '' : ' note'}`;
        mark.dataset['issue'] = i.key;
        if (first) {
          const badge = document.createElement('span');
          badge.className = 'se2-badge';
          badge.textContent = String(i.n);
          badge.contentEditable = 'false';
          mark.appendChild(badge);
          first = false;
        }
        rest.parentNode!.replaceChild(mark, rest);
        mark.appendChild(rest);
      }
    }
  }
}

/** A short fingerprint of a string, for a React key. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}.${(h >>> 0).toString(36)}`;
}

/** The text of an edited piece, as typed: the badges left out. */
function textOf(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.se2-badge').forEach((b) => b.remove());
  // innerText needs the element laid out; the clone isn't, so read the line breaks from <br> and blocks.
  copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return (copy.textContent ?? '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

function Preview({ ws, m, onRead, stepButton }: { ws: Workspace; m: SendModel; onRead: () => void; stepButton: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [hint, setHint] = useState(false);
  const marksOn = useMarksOn();
  const box = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const html = m.designed(undefined, { editable: !m.off });
  const issueKey = m.issues.map((i) => `${i.key}:${i.n}`).join('|');
  // Re-mounted when the email, the issues or the marks change, so the marks are painted on a fresh copy.
  const mountKey = useMemo(() => `${hash(html)}:${marksOn}:${hash(issueKey)}`, [html, marksOn, issueKey]);
  const original = useRef(new WeakMap<HTMLElement, string>());

  useLayoutEffect(() => {
    const root = host.current;
    // Once per mount: React runs layout effects twice in development, and marks painted twice show twice.
    if (!root || root.dataset['painted']) return;
    root.dataset['painted'] = '1';
    root.querySelectorAll<HTMLElement>('[data-edit]').forEach((el) => {
      el.classList.add('se2-ed');
      if (!m.off) {
        try {
          el.contentEditable = 'plaintext-only';
        } catch {
          el.contentEditable = 'true';
        }
        el.spellcheck = true;
        const max = Number(el.dataset['max'] ?? 0);
        if (max) el.dataset['count'] = `${textOf(el).length}/${max}`;
      }
    });
    if (marksOn) paintMarks(root, m.issues, m.shown.text, m.send.headline?.value ?? '');
  }, [mountKey]);

  // The email shorter than the window: nothing to scroll, so it's read.
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight <= el.clientHeight + 16) onRead();
  }, [mountKey]);

  /** Saves an edited piece to the field it came from, or into the Full draft's text. */
  const save = (el: HTMLElement, before: string, after: string) => {
    if (m.off || before === after) return;
    const kind = el.dataset['edit'];
    const inBody = () => {
      const body = m.shown.text;
      if (!body.includes(before)) {
        ws.toast('That couldn’t be saved here: the words changed. Edit them in the client’s words.');
        return;
      }
      m.edit(body.replace(before, () => after));
    };
    const hasDraft = Boolean(m.drafts.full);
    if (kind === 'headline') {
      m.setHeadline(after);
      return;
    }
    if (kind === 'comp') {
      const id = el.dataset['comp'];
      const comp = ws.comps.find((c) => c.judgment?.reportCompId === id);
      if (!id || !comp?.judgment) return;
      const saved = comp.judgment.clientLine ?? null;
      void ws.editComp(id, { clientLine: after ? { text: after, by: lineBy(after, null, saved?.by) } : null }).catch((e) => ws.toast(`Not saved: ${e instanceof Error ? e.message : String(e)}`));
      if (hasDraft && m.shown.text.includes(before.replace(/\n/g, ' '))) m.edit(m.shown.text.replace(before.replace(/\n/g, ' '), () => after.replace(/\n/g, ' ')));
      return;
    }
    if (kind === 'closing') {
      if (hasDraft) return inBody();
      const lines = after.split('\n').map((l) => l.trim()).filter(Boolean);
      const closing = lines.length > 1 ? lines[0]! : '';
      const name = lines.length > 1 ? lines.slice(1).join(' ') : lines[0] ?? '';
      const next = { ...m.send };
      if (closing) next.closing = entry(closing, ws.today);
      else delete next.closing;
      if (name) next.signOff = entry(name, ws.today);
      else delete next.signOff;
      ws.setSend(next);
      return;
    }
    if (kind === 'para' && !hasDraft) {
      const fields = (['chosen', 'consider', 'nextStep'] as const).filter((k) => m.send[k]?.value.trim() === before);
      if (fields.length) {
        const next = { ...m.send };
        const k = fields[0]!;
        if (after) next[k] = entry(after, ws.today);
        else delete next[k];
        ws.setSend(next);
        return;
      }
    }
    inBody();
  };

  const onFocusIn = (e: React.FocusEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-edit]');
    if (el) original.current.set(el, textOf(el));
  };
  const onFocusOut = (e: React.FocusEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-edit]');
    if (!el) return;
    const before = original.current.get(el);
    if (before === undefined) return;
    original.current.delete(el);
    save(el, before, textOf(el));
  };
  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-edit]');
    const max = Number(el?.dataset['max'] ?? 0);
    if (el && max) el.dataset['count'] = `${textOf(el).length}/${max}`;
  };
  const onBeforeInput = (e: React.FormEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-edit]');
    const max = Number(el?.dataset['max'] ?? 0);
    const ev = e.nativeEvent as InputEvent;
    if (el && max && (ev.inputType ?? 'insertText').startsWith('insert') && textOf(el).length >= max) e.preventDefault();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-edit]');
    if (!el) return;
    // Enter ends a one-line piece; Escape puts it back as it was.
    if (e.key === 'Escape') {
      const before = original.current.get(el);
      if (before !== undefined) {
        original.current.delete(el);
        el.blur();
        setEditing(false);
        ws.toast('Put back as it was.');
        // The fresh render on the next change restores it; force one now.
        el.textContent = before;
      }
    } else if (e.key === 'Enter' && (el.dataset['edit'] === 'headline' || el.dataset['edit'] === 'greeting')) {
      e.preventDefault();
      el.blur();
    }
  };

  return (
    <section
      ref={box}
      className="se2-preview"
      aria-label="Email preview"
      onScroll={(e) => {
        const t = e.currentTarget;
        if (t.scrollTop + t.clientHeight >= t.scrollHeight - 16) onRead();
      }}
    >
      <div className="se2-sticky-top">
        <div className="se2-tools">
          <span className="se2-preview-label">Email preview</span>
          {!m.off && (
            <button
              type="button"
              className={`btn${editing ? ' primary' : ''} se2-edit`}
              aria-pressed={editing}
              onClick={() => setEditing(!editing)}
              onMouseEnter={() => setHint(true)}
              onMouseLeave={() => setHint(false)}
              onFocus={() => setHint(true)}
              onBlur={() => setHint(false)}
            >
              {editing ? '✓ Done' : '✎ Edit'}
            </button>
          )}
          {hint && !editing && (
            <span role="tooltip" className="se2-tipcard static">
              Click any words you wrote to change them, right in the email. Prices, sizes and dates come from the report; change those on Sort.
            </span>
          )}
        </div>
      </div>
      <div
        key={mountKey}
        ref={host}
        className={`se2-email${editing ? ' outlined' : ''}`}
        onFocus={onFocusIn}
        onBlur={onFocusOut}
        onInput={onInput}
        onBeforeInput={onBeforeInput}
        onKeyDown={onKeyDown}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <div className="se2-sticky-foot">{stepButton}</div>
    </section>
  );
}
