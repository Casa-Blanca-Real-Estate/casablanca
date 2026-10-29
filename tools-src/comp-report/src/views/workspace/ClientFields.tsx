// Your client (Kimani, 2026-10-29): the client's facts an agent fills as they
// know them, on Details (folded under "Your client") and in Findings' Your
// client. Buyers: cash or a mortgage, pre-approved and for how much; everyone:
// how soon, and what's moving them. They save as they're typed. The
// pre-approval is the deal terms' (Terms shows the same fields); the rest is
// the brief's (workspace/client.ts). Rudimentary on purpose: Claude Design
// places it (NW-074 b).
import { useEffect, useState } from 'react';
import { PACE_LABEL, withBuyerFinance } from '../../../workspace/client.ts';
import { fairHousingFindings } from '../../../workspace/fair-housing.ts';
import { CLIENT_PACES, type ClientFacts, type DealTermsState, type Entry } from '../../../workspace/state.ts';
import { NrNumber } from '../newcomp/inputs.tsx';
import { entry } from './bits.tsx';
import type { Workspace } from './model.ts';
import '../../styles/client.css';

export const CLIENT_NOTE = 'Optional: fill in what you know. None of it changes the true estimate. Hubert reads it once the range is revealed; your client never sees it.';

export function ClientFields({ ws }: { ws: Workspace }) {
  const { today, readOnly: off, side } = ws;
  const client = ws.brief.client ?? {};
  const terms = ws.dealTerms;
  const setClient = (next: ClientFacts) => {
    const brief = { ...ws.brief };
    if (Object.keys(next).length) brief.client = next;
    else delete brief.client;
    ws.setBrief(brief);
  };
  const setPace = (pace: (typeof CLIENT_PACES)[number] | undefined) => {
    const { pace: _drop, ...urgency } = client.urgency ?? {};
    const nextUrgency = pace ? { ...urgency, pace: entry(pace, today) } : urgency;
    const { urgency: _u, ...rest } = client;
    setClient(Object.keys(nextUrgency).length ? { ...rest, urgency: nextUrgency } : rest);
  };
  const setMotivations = (v: Entry<string> | undefined) => {
    const { motivations: _m, ...rest } = client;
    setClient(v ? { ...rest, motivations: v } : rest);
  };
  const finance = (change: Pick<DealTermsState, 'financing' | 'preApproved' | 'preApprovalAmount'>) => ws.setDealTerms(withBuyerFinance(terms, change));
  // A seller's template stored on a buyer's report (the side changed) holds no pre-approval: one tap swaps it for a buyer's.
  const otherTemplate = side === 'buyer' && terms?.template === 'seller_pricing';
  const buyer = terms?.template === 'buyer_traditional' ? terms : null;
  const cash = buyer?.financing?.value === 'cash';

  return (
    <div className="cl-fields">
      {side === 'buyer' && !otherTemplate && (
        <>
          <Chips
            label="Financing"
            value={buyer?.financing?.value}
            options={[{ value: 'mortgage', label: 'Mortgage' }, { value: 'cash', label: 'All cash' }]}
            disabled={off}
            onChange={(v) => finance({ financing: v ? entry(v, today) : undefined })}
          />
          {!cash && (
            <Chips
              label="Pre-approved"
              value={buyer?.preApproved ? (buyer.preApproved.value ? 'yes' : 'no') : undefined}
              options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not yet' }]}
              disabled={off}
              onChange={(v) => finance({ preApproved: v ? entry(v === 'yes', today) : undefined })}
            />
          )}
          {!cash && buyer?.preApproved?.value && (
            <label className="cl-row">
              <span className="cl-k">Pre-approved for</span>
              <span className="cl-line">
                <NrNumber
                  label="Pre-approved for"
                  value={buyer.preApprovalAmount}
                  onChange={(v) => finance({ preApprovalAmount: v })}
                  today={today}
                  disabled={off}
                  placeholder="The price on the letter"
                  prefix="$"
                />
              </span>
            </label>
          )}
        </>
      )}
      {otherTemplate && (
        <p className="cl-note cl-switch">
          <span>This buyer’s report holds a seller’s terms, so there’s no pre-approval to give yet.</span>
          {!off && <button type="button" className="link" onClick={() => ws.setDealTerms({ template: 'buyer_traditional' })}>Use buyer’s terms</button>}
        </p>
      )}
      <Chips
        label="How soon"
        value={client.urgency?.pace?.value}
        options={CLIENT_PACES.map((p) => ({ value: p, label: PACE_LABEL[p] }))}
        disabled={off}
        onChange={setPace}
      />
      <ScreenedText
        label="What’s moving them"
        value={client.motivations}
        onChange={setMotivations}
        today={today}
        disabled={off}
        placeholder={side === 'buyer' ? 'e.g. Lease ends in March; wants a room to work from home' : 'e.g. Relocating for work; buying a bigger place uptown'}
      />
      <p className="cl-note">{CLIENT_NOTE}</p>
    </div>
  );
}

function Chips<T extends string>({ label, value, options, onChange, disabled }: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (next: T | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cl-row" role="group" aria-label={label}>
      <span className="cl-k">{label}</span>
      <span className="chips small">
        {options.map((o) => (
          <button key={o.value} type="button" className={`chip${value === o.value ? ' on' : ''}`} aria-pressed={value === o.value} disabled={disabled} onClick={() => onChange(value === o.value ? undefined : o.value)}>
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

/** Free text, screened as it's typed (§8.6): a hard fair-housing term isn't saved, and says why. */
function ScreenedText({ label, value, onChange, today, disabled, placeholder }: {
  label: string;
  value: Entry<string> | undefined;
  onChange: (next: Entry<string> | undefined) => void;
  today: string;
  disabled?: boolean;
  placeholder: string;
}) {
  const [text, setText] = useState(value?.value ?? '');
  useEffect(() => {
    if ((value?.value ?? '') !== text && !hardTerm(text)) setText(value?.value ?? '');
  }, [value?.value]);
  const hard = hardTerm(text);
  return (
    <label className="cl-row cl-row-text">
      <span className="cl-k">{label}</span>
      <span className="cl-text">
        <input
          aria-label={label}
          className="cl-input"
          value={text}
          maxLength={500}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={hard ? true : undefined}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            if (!hardTerm(next)) onChange(next.trim() ? entry(next, today) : undefined);
          }}
        />
        {hard && <span className="cl-warn" role="alert">“{hard.term}” can’t be saved: it reads as a preference on {hard.basis} (fair housing).</span>}
      </span>
    </label>
  );
}

function hardTerm(text: string) {
  return fairHousingFindings(text).find((f) => f.level === 'hard') ?? null;
}
