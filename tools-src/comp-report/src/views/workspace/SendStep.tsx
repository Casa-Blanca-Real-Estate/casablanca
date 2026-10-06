// Send (`02-screens.md`; §9, §10.2). The headline first: one sentence, the
// agent's, required before the email can be copied (D-21), with drafts drawn
// only from the engine's headline facts. Then the email around it, in Frankie's
// order — still the fixed template until the writer (CR-5) — in three lengths,
// with QA as one status line that opens to the checks. The client's name comes
// from the new-comp modal (D-22).
import { useMemo, useRef, useState } from 'react';
import type { ResultKind } from '../../../engine/index.ts';
import { buildEmail, emailChecks, headlineDrafts, htmlFromText, qaStatus, type EmailLength } from '../../../workspace/email.ts';
import { answerResult, estimatesChangeTheAnswer } from '../../../workspace/reading.ts';
import type { Entry, SendState } from '../../../workspace/state.ts';
import { BuildNote, entry, Field, StubTag, TextInput } from './bits.tsx';
import { fingerprint, type StepProps } from './model.ts';

const LENGTHS: { id: EmailLength; label: string }[] = [
  { id: 'full', label: 'Full' },
  { id: 'short', label: 'Short' },
  { id: 'text', label: 'Text message' },
];

export function SendStep({ ws }: StepProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [openChecks, setOpenChecks] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const o = ws.output;
  const send = ws.send;
  const off = ws.readOnly;
  const setSend = (patch: Partial<SendState>) => ws.setSend({ ...send, ...patch });
  const setText = (key: 'headline' | 'chosen' | 'consider' | 'nextStep') => (v: Entry<string> | undefined) => {
    const next = { ...send };
    if (v) next[key] = v;
    else delete next[key];
    ws.setSend(next);
  };

  const both = o ? estimatesChangeTheAnswer(o) : false;
  const result: ResultKind = o ? (both ? send.result ?? answerResult(o) : answerResult(o)) : 'on_facts';
  const drafts = useMemo(() => (o && ws.revealed ? headlineDrafts(o.headline_facts[result]) : []), [o, ws.revealed, result]);

  if (!ws.revealed) {
    return (
      <div className="send">
        <p className="muted">The email quotes what the comps say, so it waits for your number on Findings.</p>
        <button type="button" className="btn" onClick={() => ws.go('findings')}>Go to Findings</button>
      </div>
    );
  }
  if (!o) return <p className="notice error-notice">The engine couldn’t compute{ws.engineError ? `: ${ws.engineError}` : '.'}</p>;

  const length = send.length ?? 'full';
  const homeLine = [ws.intake.address?.value.split(',')[0], ws.intake.unit?.value].filter(Boolean).join(' ') || ws.report.title;
  const template = buildEmail({
    homeLine,
    audience: ws.brief.audience?.value ?? null,
    output: o,
    result,
    comps: ws.comps,
    agentName: send.signOff?.value ?? ws.agentName,
    clientName: ws.brief.clientName?.value ?? send.clientName?.value,
    headline: send.headline?.value,
    chosen: send.chosen?.value,
    consider: send.consider?.value,
    nextStep: send.nextStep?.value,
    length,
    sample: ws.report.sampleData,
  });
  const basedOn = fingerprint(`${template.subject}\n${template.text}`);
  const draft = send.draft;
  const shown = draft ? { subject: draft.subject, text: draft.body } : template;
  const stale = Boolean(draft && draft.basedOn !== basedOn);
  const checks = emailChecks({ text: `${shown.subject}\n${shown.text}`, headline: send.headline?.value, result, output: o, sample: ws.report.sampleData });
  const status = qaStatus(checks);

  const edit = (change: { subject?: string; body?: string }) =>
    setSend({ draft: { subject: shown.subject, body: shown.text, ...change, basedOn: draft?.basedOn ?? basedOn, at: new Date().toISOString() } });

  async function copy() {
    if (!status.ready) return;
    const text = shown.text;
    const html = draft ? htmlFromText(text) : template.html;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      bodyRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(new Date().toLocaleTimeString());
    if (!off) setSend({ copiedAt: new Date().toISOString() });
  }

  return (
    <div className="send">
      <section className="headline" aria-label="The headline">
        <div className="label">The headline</div>
        <TextInput
          label="Your headline"
          multiline
          value={send.headline}
          onChange={setText('headline')}
          today={ws.today}
          disabled={off}
          placeholder="One sentence, yours: what the comps show"
        />
        {!off && drafts.length > 0 && (
          <div className="drafts">
            <span className="muted small">Drafts from the numbers — pick one, then make it yours:</span>
            <ul className="plain">
              {drafts.map((d) => (
                <li key={d}>
                  <button type="button" className="link small" onClick={() => setText('headline')(entry(d, ws.today))}>{d}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <BuildNote>
          The drafts cite only <code>headline_facts</code> and its names, never the agent’s number (§8.4); QA warns on a headline number that matches none of them.{' '}
          <StubTag>CR-5</StubTag> The assistant’s own drafts, and QA’s full numeric grounding.
        </BuildNote>
      </section>

      <div className="card email">
        <div className="grid">
          <Field label="How you chose the comps" wide>
            <TextInput label="How you chose the comps" value={send.chosen} onChange={setText('chosen')} today={ws.today} disabled={off} placeholder="e.g. I focused on lower floors and homes close in size." />
          </Field>
          <Field label="Things to consider" wide>
            <TextInput label="Things to consider" multiline value={send.consider} onChange={setText('consider')} today={ws.today} disabled={off} placeholder="Buildings that trade higher or lower, carrying costs, recent activity in the building" />
          </Field>
          <Field label="The next step" wide>
            <TextInput
              label="The next step"
              multiline
              value={send.nextStep}
              onChange={setText('nextStep')}
              today={ws.today}
              disabled={off}
              placeholder={ws.brief.audience?.value === 'seller' ? 'Where you’d list it, and why' : 'What you’d offer, and on what terms'}
            />
          </Field>
          <Field label="Signed">
            <TextInput label="Signed" value={send.signOff} onChange={(v) => setSend({ signOff: v })} today={ws.today} disabled={off} placeholder={ws.agentName || 'Your name'} />
          </Field>
          <Field label="To">
            <TextInput
              label="Client name"
              value={ws.brief.clientName ?? send.clientName}
              onChange={(v) => {
                const brief = { ...ws.brief };
                if (v) brief.clientName = v;
                else delete brief.clientName;
                ws.setBrief(brief);
              }}
              today={ws.today}
              disabled={off}
              placeholder="Client name"
            />
          </Field>
          <Field label="About the client (for you)" wide hint="What matters to them. It isn’t quoted in the email.">
            <TextInput
              label="Client note"
              value={ws.brief.clientNote}
              onChange={(v) => {
                const brief = { ...ws.brief };
                if (v) brief.clientNote = v;
                else delete brief.clientNote;
                ws.setBrief(brief);
              }}
              today={ws.today}
              disabled={off}
            />
          </Field>
          <div className="field">
            <span className="field-label">Length</span>
            <div className="segmented" role="radiogroup" aria-label="Length">
              {LENGTHS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={length === l.id} className={length === l.id ? 'on' : ''} disabled={off} onClick={() => setSend({ length: l.id })}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          {both && (
            <Field label="Which result" hint={result === 'with_estimates' ? 'Uses your estimates — the email says so.' : 'On the facts: no estimate of yours in it.'}>
              <select aria-label="Which result the email uses" value={result} disabled={off} onChange={(e) => setSend({ result: e.target.value as ResultKind })}>
                <option value="on_facts" disabled={!o.results.on_facts.range}>On the facts{o.results.on_facts.range ? '' : ' (no range)'}</option>
                <option value="with_estimates">With your estimates</option>
              </select>
            </Field>
          )}
        </div>

        {stale && (
          <p className="notice">
            The numbers or your lines changed since you edited this draft.{' '}
            <button type="button" className="link" onClick={() => setSend({ draft: undefined })}>Back to the template</button> to pick them up.
          </p>
        )}
        <label className="field">
          <span className="field-label">Subject</span>
          <input aria-label="Email subject" value={shown.subject} readOnly={off} onChange={(e) => edit({ subject: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <textarea ref={bodyRef} aria-label="Email body" className="email-body" value={shown.text} readOnly={off} rows={length === 'text' ? 8 : 22} onChange={(e) => edit({ body: e.target.value })} />
        </label>

        <div className="qa">
          <button type="button" className={`link qa-line ${status.ready ? 'ready' : 'fix'}`} aria-expanded={openChecks} onClick={() => setOpenChecks((x) => !x)}>
            {status.line}
          </button>
          {openChecks && (
            <ul className="plain checks">
              {checks.map((c) => <li key={c.id} className={c.state}>{c.message}</li>)}
            </ul>
          )}
        </div>
        <div className="row wrap">
          <button type="button" className="btn primary" disabled={!status.ready} onClick={() => void copy()} title={status.ready ? 'Copies it as rich text, with the comps as links' : 'Fix what QA found first'}>
            Copy the email
          </button>
          {draft && !off && <button type="button" className="btn" onClick={() => setSend({ draft: undefined })}>Back to the template</button>}
          {copied && <span className="muted small">Copied at {copied}.</span>}
        </div>
        <BuildNote><StubTag>CR-6</StubTag> The client report and its PDF come with Kimani’s template.</BuildNote>
      </div>
    </div>
  );
}
