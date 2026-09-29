// Step 6, send it (§3 steps 5–6, stubbed): a placeholder client email from a
// fixed template, the one QA check that's a regex today, and the client report's
// placeholder. The writer and the rest of QA come in CR-5, the PDF in CR-6.
import { useRef, useState } from 'react';
import type { ResultKind } from '../../../engine/index.ts';
import { appraisalFindings, placeholderEmail } from '../../../workspace/email.ts';
import { DecisionTag, Field, StubTag, TextInput } from './bits.tsx';
import { fingerprint, type StepProps } from './model.ts';

const RESULT_LABEL: Record<ResultKind, string> = { on_facts: 'On the facts', with_estimates: 'With estimates' };

export function SendStep({ ws }: StepProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const o = ws.output;
  const send = ws.send;
  const off = ws.readOnly;

  if (!ws.revealed) {
    return (
      <div className="send">
        <p className="muted">The draft quotes the range, so it waits for your call.</p>
        <button type="button" className="btn" onClick={() => ws.go('reveal')}>Go to step 4</button>
        <ClientReport />
      </div>
    );
  }
  if (!o) return <p className="notice error-notice">The engine couldn’t compute{ws.engineError ? `: ${ws.engineError}` : '.'}</p>;

  const result: ResultKind = send.result ?? (o.results.on_facts.range ? 'on_facts' : 'with_estimates');
  const subjectLine = [ws.intake.address?.value, ws.intake.unit?.value].filter(Boolean).join(' ') || ws.report.title;
  const template = placeholderEmail({
    subjectLine,
    audience: ws.brief.audience?.value ?? null,
    output: o,
    result,
    comps: ws.comps,
    agentName: send.signOff?.value ?? ws.agentName,
    clientName: send.clientName?.value,
    sample: ws.report.sampleData,
  });
  const basedOn = fingerprint(`${template.subject}\n${template.body}`);
  const draft = send.draft;
  const shown = draft ?? template;
  const stale = Boolean(draft && draft.basedOn !== basedOn);
  const findings = appraisalFindings(`${shown.subject}\n${shown.body}`);
  const blocked = findings.length > 0;

  const edit = (change: { subject?: string; body?: string }) =>
    ws.setSend({ ...send, draft: { subject: shown.subject, body: shown.body, ...change, basedOn: draft?.basedOn ?? basedOn, at: new Date().toISOString() } });

  async function copy() {
    const text = `Subject: ${shown.subject}\n\n${shown.body}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      bodyRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(new Date().toLocaleTimeString());
    if (!off) ws.setSend({ ...send, copiedAt: new Date().toISOString() });
  }

  return (
    <div className="send">
      <div className="card email">
        <div className="row wrap">
          <span className="label" style={{ margin: 0 }}>Client email</span>
          <StubTag>Placeholder — the writer comes in CR-5</StubTag>
        </div>
        <div className="grid">
          <Field label="Which result">
            <select
              aria-label="Which result the email uses"
              value={result}
              disabled={off}
              onChange={(e) => ws.setSend({ ...send, result: e.target.value as ResultKind })}
            >
              {(['on_facts', 'with_estimates'] as const).map((k) => (
                <option key={k} value={k}>{RESULT_LABEL[k]}{o.results[k].range ? '' : ' (no range)'}</option>
              ))}
            </select>
          </Field>
          <Field label="To" sample={send.clientName?.sample}>
            <TextInput
              label="Client name"
              value={send.clientName}
              onChange={(v) => ws.setSend({ ...send, clientName: v })}
              today={ws.today}
              disabled={off}
              placeholder="Client name"
            />
          </Field>
          <Field label="Signed" sample={send.signOff?.sample}>
            <TextInput
              label="Signed"
              value={send.signOff}
              onChange={(v) => ws.setSend({ ...send, signOff: v })}
              today={ws.today}
              disabled={off}
              placeholder={ws.agentName || 'Your name'}
            />
          </Field>
        </div>
        {result === 'with_estimates' && <p className="muted small">“With estimates” lists your estimates in the email, as client copy must (§9.5). <DecisionTag id="D-3">wording</DecisionTag></p>}
        {stale && (
          <p className="notice">
            The numbers changed since you edited this draft.{' '}
            <button type="button" className="link" onClick={() => ws.setSend({ ...send, draft: undefined })}>Back to the template</button> to pick them up.
          </p>
        )}
        <label className="field">
          <span className="field-label">Subject</span>
          <input aria-label="Email subject" value={shown.subject} readOnly={off} onChange={(e) => edit({ subject: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Body</span>
          <textarea ref={bodyRef} aria-label="Email body" className="email-body" value={shown.body} readOnly={off} rows={18} onChange={(e) => edit({ body: e.target.value })} />
        </label>
        <div className="row wrap">
          <button type="button" className="btn primary" disabled={blocked} onClick={() => void copy()}>
            {blocked ? 'Blocked by QA' : 'Copy the email'}
          </button>
          {draft && !off && <button type="button" className="btn" onClick={() => ws.setSend({ ...send, draft: undefined })}>Back to the template</button>}
          {copied && <span className="muted small" aria-live="polite">Copied at {copied}.</span>}
          {draft && <span className="muted small">Your edits are kept with the report.</span>}
        </div>
      </div>

      <div className="card qa">
        <div className="row wrap">
          <span className="label" style={{ margin: 0 }}>QA — the checks before it goes out (§9)</span>
          <DecisionTag id="D-2">compliance the only hard block</DecisionTag>
        </div>
        <ul className="plain checks">
          <li className={blocked ? 'fail' : 'pass'}>
            <strong>“Appraisal” and “appraised value”</strong> — {blocked
              ? <>Blocked: {findings.map((f) => `“${f.match}”`).join(', ')}. A comparative market analysis is never an appraisal (§9.3).</>
              : 'Pass: neither appears.'}
            <span className="muted small"> Live, on the text above.</span>
          </li>
          <li className={ws.report.sampleData ? 'warn' : 'pass'}>
            <strong>Sample data</strong> — {ws.report.sampleData ? 'This report used sample data, so the draft is labelled as a sample. Not for clients.' : 'None used.'}
          </li>
          <li className="coming"><strong>Every number traceable to the engine</strong> <StubTag>Coming in CR-5</StubTag></li>
          <li className="coming"><strong>Range language and the estimates disclosure</strong> <StubTag>Coming in CR-5</StubTag></li>
          <li className="coming"><strong>Fair housing</strong> <StubTag>Coming in CR-5</StubTag></li>
        </ul>
        <p className="muted small">The disclaimer in the draft is a placeholder until it’s approved. <DecisionTag id="D-13">disclaimer</DecisionTag></p>
      </div>

      <ClientReport />
      <p className="muted small"><StubTag>CR-3</StubTag> Drafting will pin the numbers as a version (v1, v2 …).</p>
    </div>
  );
}

function ClientReport() {
  return (
    <div className="card placeholder">
      <span className="label" style={{ margin: 0 }}>Client report (PDF)</span>
      <p><StubTag>Placeholder</StubTag> Kimani designs the template (CR-6).</p>
    </div>
  );
}
