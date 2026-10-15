// Done (Dispatch 14, item 11; the handoff's screen 11): the email went out —
// when, and as what — its headline, the range against the agent's own guess,
// and "How did it go?": the list price or offer, the contract and the sale,
// typed in for now (D-19's manual fallback; filling them from Casa Blanca's
// deal records comes later). Reopen takes the report back to Send.
import { useEffect, useState } from 'react';
import { clientPrice, psf, usd } from '../../../workspace/format.ts';
import { fact } from '../../../workspace/reading.ts';
import type { Entry, Outcomes } from '../../../workspace/state.ts';
import { formatOf, outcomeFields, parseAmount, sentLine } from '../send/copy.ts';
import { useSendEmail } from '../send/useSendEmail.ts';
import '../../styles/send.css';
import { entry } from './bits.tsx';
import type { StepProps } from './model.ts';

/** Back to the reports list: the app follows the address (App.tsx listens for popstate). */
function backToReports() {
  history.pushState(null, '', location.pathname);
  dispatchEvent(new PopStateEvent('popstate'));
}

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
  const guess = call?.skipped
    ? 'Skipped'
    : call?.low !== undefined && call.high !== undefined ? `${clientPrice(call.low)} – ${clientPrice(call.high)}` : '—';
  const tiles: { label: string; value: string; guess?: boolean }[] = [
    { label: 'What the sales support', value: range ? `${clientPrice(range.low.value)} – ${clientPrice(range.high.value)}` : 'No range' },
    ...(ws.sf && lowSf && highSf ? [{ label: 'Per sq ft', value: `${psf(lowSf.value)} – ${psf(highSf.value)}` }] : []),
    { label: 'Your guess', value: guess, guess: true },
  ];
  const outcomes = ws.outcomes;
  const setOutcome = (key: keyof Outcomes) => (v: Entry<number> | undefined) => {
    const next = { ...outcomes };
    if (v) next[key] = v;
    else delete next[key];
    ws.setOutcomes(next);
  };
  const client = ws.brief.clientName?.value ?? ws.send.clientName?.value;
  const headline = ws.send.headline?.value;

  return (
    <div className="panel se-done">
      <div className="se-confirm">
        <span className="se-check" aria-hidden="true">✓</span>
        <div className="se-confirm-text">
          <h2 className="se-sent-title">Sent</h2>
          <span className="se-sent-sub">{sentLine({ client, sentAt, format })}</span>
        </div>
      </div>

      {headline && <p className="se-done-headline">{headline}</p>}

      <div className="se-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="se-tile">
            <span className="se-tile-label">{t.label}</span>
            <span className={`se-tile-value${t.guess ? ' guess' : ''}`}>{t.value}</span>
          </div>
        ))}
      </div>

      <section className="se-outcomes" aria-label="How did it go?">
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

      <div className="se-done-actions">
        <button type="button" className="btn primary" onClick={backToReports}>Back to reports</button>
        <button
          type="button"
          className="btn"
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
