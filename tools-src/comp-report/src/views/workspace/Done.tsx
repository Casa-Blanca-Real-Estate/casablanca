// Done (the design pass, "6 · Done", 2026-11-06; first Dispatch 14, item 11): a black block that says it went
// out — when, to whom, the range against the agent's own number — then What's next (two ticks the agent
// keeps), Back to reports and Open the report. Below, kept from before: "How did it go?" (the list price or
// offer, the contract and the sale, typed in for now: D-19's manual fallback), copying the email again, and
// Reopen, which takes the report back to Send.
import { useEffect, useState } from 'react';
import { clientPrice, psf, usd } from '../../../workspace/format.ts';
import { fact } from '../../../workspace/reading.ts';
import type { Entry, Outcomes } from '../../../workspace/state.ts';
import { formatOf, outcomeFields, parseAmount, sentDay, sentLine } from '../send/copy.ts';
import { homeName } from './screens.ts';
import { countWord } from '../../../workspace/format.ts';
import { useSendEmail } from '../send/useSendEmail.ts';
import '../../styles/send.css';
import { entry } from './bits.tsx';
import type { StepProps } from './model.ts';
import { nextText, WHATS_NEXT } from '../../../workspace/next-steps.ts';

function Amount({ id, label, hint, value, onChange, today, disabled }: {
  id: string;
  label: string;
  hint: string;
  value: Entry<number> | undefined;
  onChange: (next: Entry<number> | undefined) => void;
  today: string;
  disabled: boolean;
}) {
  const [text, setText] = useState(() => (value ? usd(value.value) : ''));
  // A value set from elsewhere replaces what's typed.
  useEffect(() => {
    if (parseAmount(text) !== (value?.value ?? null)) setText(value ? usd(value.value) : '');
  }, [value?.value]);
  const invalid = text.trim() !== '' && parseAmount(text) === null;
  return (
    <div className="se-outcome">
      <label className="se-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="se-amount"
        inputMode="decimal"
        placeholder="$ —"
        value={text}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value.trim()) {
            if (value) onChange(undefined);
            return;
          }
          const n = parseAmount(e.target.value);
          if (n !== null && n !== value?.value) onChange(entry(n, today));
        }}
        onBlur={() => {
          const n = parseAmount(text);
          if (n !== null) setText(usd(n));
        }}
      />
      <span className={`se-hint${invalid ? ' error' : ''}`}>{invalid ? 'A dollar amount, like $4,450,000' : hint}</span>
    </div>
  );
}


/** "Jordan and Sam have the comps for 17L."; "Dana has …"; without a client, "The comps for 17L are out." */
export function doneHeadline(client: string | undefined, home: string): string {
  const who = client?.trim();
  if (!who) return `The comps for ${home} are out.`;
  return `${who} ${/\band\b|&|,/i.test(who) ? 'have' : 'has'} the comps for ${home}.`;
}

/** "Sent · Today", "Sent · Nov 4, 2026". */
function sentWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString() ? 'Today' : sentDay(iso);
}

export function Done({ ws }: StepProps) {
  const format = formatOf(ws.send);
  const m = useSendEmail(ws, { format });
  const sentAt = ws.send.sentAt;
  const off = ws.readOnly;

  const reopen = () => {
    if (off) return;
    const { sentAt: _sent, ...rest } = ws.send;
    ws.setSend(rest);
    ws.go('send');
  };

  if (!sentAt) {
    return (
      <div className="panel se-done se-done-empty">
        <p className="se-done-headline">This report isn’t marked as sent yet.</p>
        <p className="se-hint">Copy the email on Send, send it, then mark it as sent.</p>
        <div className="se-done-actions">
          <button type="button" className="btn primary" onClick={() => ws.go('send')}>Go to Send</button>
        </div>
      </div>
    );
  }

  const o = ws.output;
  const result = m.ready ? m.result : null;
  const r = o && result ? o.results[result] : null;
  const range = r?.range ?? null;
  const h = o && result ? o.headline_facts[result] : null;
  const lowSf = h ? fact(h, 'range.low_per_sqft') : null;
  const highSf = h ? fact(h, 'range.high_per_sqft') : null;
  const call = ws.call;
  const outcomes = ws.outcomes;
  const setOutcome = (key: keyof Outcomes) => (v: Entry<number> | undefined) => {
    const next = { ...outcomes };
    if (v) next[key] = v;
    else delete next[key];
    ws.setOutcomes(next);
  };
  const client = ws.brief.clientName?.value ?? ws.send.clientName?.value;
  const headline = ws.send.headline?.value;

  const home = homeName(ws.intake, ws.report.title);
  const n = range?.comp_ids.length ?? 0;
  const yours = call?.skipped ? null : call?.low !== undefined && call.high !== undefined ? `${clientPrice(call.low)} – ${clientPrice(call.high)}` : null;
  const summary = [
    range ? `${clientPrice(range.low.value)} – ${clientPrice(range.high.value)} from ${countWord(n)} ${n === 1 ? 'sale' : 'sales'}${ws.sf && lowSf && highSf ? ` (${psf(lowSf.value)} – ${psf(highSf.value)} / SF)` : ''}.` : null,
    yours ? `Your number was ${yours}.` : call?.skipped ? 'You skipped your number.' : null,
    'The report is saved, and locked as sent: reopen it to change the email.',
  ].filter(Boolean).join(' ');
  const checks = ws.doneChecks;

  return (
    <div className="se-done2">
      <section className="se-done-block" aria-label="Sent">
        <span className="se-done-eyebrow">Sent · {sentWhen(sentAt)}</span>
        <h2 className="se-done-title">{doneHeadline(client, home)}</h2>
        <p className="se-done-summary">{summary}</p>
        <span className="se-done-meta">{sentLine({ client, sentAt, format })}{headline ? ` · “${headline}”` : ''}</span>
      </section>

      <section className="se-next" aria-label="What’s next">
        <span className="se-next-title">What’s next</span>
        {WHATS_NEXT.map((item) => {
          const on = Boolean(checks[item.key]);
          return (
            <button
              key={item.key}
              type="button"
              role="checkbox"
              aria-checked={on}
              className="se-next-item"
              disabled={off}
              onClick={() => ws.setDoneChecks({ ...checks, [item.key]: !on })}
            >
              <span className={`se-next-box${on ? ' on' : ''}`} aria-hidden="true">{on ? '✓' : ''}</span>
              <span>{nextText(item.key, ws.side)}</span>
            </button>
          );
        })}
      </section>

      <div className="se-done-actions">
        <button type="button" className="btn primary" onClick={ws.back}>Back to reports</button>
        <button type="button" className="btn" onClick={() => ws.go('findings')}>Open the report</button>
      </div>

      <section className="se-outcomes se-done-card" aria-label="How did it go?">
        <div className="se-outcomes-title"><span className="sq yellow" aria-hidden="true" />How did it go?</div>
        <div className="se-outcome-grid">
          {outcomeFields(ws.side).map((f) => (
            <Amount
              key={f.key}
              id={`se-outcome-${f.key}`}
              label={f.label}
              hint={f.hint}
              value={outcomes[f.key]}
              onChange={setOutcome(f.key)}
              today={ws.today}
              disabled={off}
            />
          ))}
        </div>
        <p className="se-hint">Type them in as they happen. Filling these from Casa Blanca’s deal records comes later.</p>
      </section>

      <div className="se-done-more">
        <button
          type="button"
          className="link"
          disabled={!m.ready || !m.copyable}
          title={m.ready && !m.copyable ? 'Something changed since it was sent: reopen it to see what QA found.' : undefined}
          onClick={() => {
            if (m.ready) void m.copy();
          }}
        >
          {format === 'text' ? 'Copy the text again' : 'Copy the email again'}
        </button>
        {!off && <button type="button" className="link se-reopen" onClick={reopen}>Reopen to edit</button>}
      </div>
    </div>
  );
}
