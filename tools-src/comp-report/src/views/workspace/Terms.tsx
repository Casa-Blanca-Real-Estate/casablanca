// The target price and the pricing details, in Findings' accordions (the
// handoff, screen 8; `02-screens.md`, Findings, items 7 and 8). The target is
// editable here (D-4): it never enters a number, Hubert gets it only after the
// math is done, and it isn't in the email (§8.4). Whose target it is sets its
// label (NW-070), and once the range has moved since the reveal, the section
// says how far toward or away from it (§8.4's backstop). Pricing details shows
// only rows with data, in plain sentences (NW-071 a, NW-072), then the deal
// terms behind them (§6.7, D-10): the report side's template only (NW-073 a),
// with cash or a mortgage and the pre-approval (NW-074 a). Your client
// (2026-10-29) shows the financing, the pre-approval, the pace and what's
// moving them, set against the range and the ask (workspace/client.ts).
import type { EngineOutput, ResultKind } from '../../../engine/index.ts';
import { clientPrice, isoDay, pct, psf, usd } from '../../../workspace/format.ts';
import { answerResult } from '../../../workspace/reading.ts';
import { TARGET_OWNERS, type DealTermsState, type TargetOwner } from '../../../workspace/state.ts';
import { daysOnMarketLine, movedLine, saleToAskLine } from '../findings/findings.ts';
import { MoneyInput } from '../findings/MoneyInput.tsx';
import { clientRows } from '../../../workspace/client.ts';
import { ClientFields } from './ClientFields.tsx';
import { targetLabel as labelFor } from '../newcomp/Home.tsx';
import { DecisionTag, entry, Field, NumberInput, TextInput } from './bits.tsx';
import type { StepProps, Workspace } from './model.ts';

const AGAINST = { below: 'below the true estimate', within: 'inside the true estimate', above: 'above the true estimate' } as const;

/** Where a price sits against a result's range, in words, or null without a range. */
export function againstEstimate(output: EngineOutput | null, kind: ResultKind, price: number): string | null {
  const r = output?.results[kind].range;
  if (!r) return null;
  return price < r.low.value ? AGAINST.below : price > r.high.value ? AGAINST.above : AGAINST.within;
}

/** The target's label: one scheme, by whose it is and the side (NW-070; `Home.tsx`). */
export function targetLabel(ws: Workspace): string {
  return labelFor(ws.side, ws.target?.owner);
}

const OWNER_WORD: Record<TargetOwner, string> = { client: 'Client’s', agent: 'Yours', both: 'Both' };

/** The target: the agent's price goal, and where it sits against the true estimate. */
export function TargetSection({ ws }: StepProps) {
  const { today, readOnly: off, output } = ws;
  const kind: ResultKind = output ? answerResult(output) : 'on_facts';
  const price = ws.target?.price.value ?? null;
  const evaluation = output?.prices.find((p) => p.id === 'target');
  const where = price !== null ? againstEstimate(output, kind, price) : null;
  const rate = ws.sf ? evaluation?.per_result[kind].per_sqft?.value ?? null : null;
  const note = price === null ? null
    : where ? `${rate !== null ? `${psf(rate)} / SF · ${where}` : where.charAt(0).toUpperCase() + where.slice(1)}`
      : 'No true estimate to set it against yet';
  const range = output?.results[kind].range;
  const moved = movedLine(ws.reveal, range ? { low: range.low.value, high: range.high.value } : null, price, targetLabel(ws));
  const owner = ws.target?.owner ?? 'client';
  return (
    <div className="fi-target">
      <div className="fi-target-row">
        <label className="fi-target-field" htmlFor="fi-target-price">
          <span className="fi-k">{targetLabel(ws)} <DecisionTag id="D-4" /></span>
          <MoneyInput
            id="fi-target-price"
            className="fi-target-input"
            value={price}
            keepOnInvalid
            disabled={off}
            placeholder="—"
            onChange={(n) => ws.setTarget(n === null ? null : { ...ws.target, price: entry(n, today) })}
          />
        </label>
        {note && <span className="fi-target-note">{note}</span>}
      </div>
      {moved && <p className="fi-moved">{moved}</p>}
      {(ws.target || !off) && (
        <div className="fi-target-row">
        <div className="fi-owner" role="radiogroup" aria-label="Whose target">
          <span className="fi-k">Whose</span>
          <div className="seg small">
            {TARGET_OWNERS.map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={owner === o}
                className={owner === o ? 'on' : undefined}
                disabled={off || !ws.target}
                onClick={() => ws.target && ws.setTarget({ ...ws.target, owner: o })}
              >
                {OWNER_WORD[o]}
              </button>
            ))}
          </div>
        </div>
        <label className="fi-target-whose" htmlFor="fi-target-whose">
          <span className="fi-k">Whose, and why <span className="fi-opt">(optional)</span></span>
          <input
            id="fi-target-whose"
            className="fi-line-input"
            value={ws.target?.note?.value ?? ''}
            maxLength={500}
            disabled={off || !ws.target}
            placeholder={ws.target ? (ws.side === 'buyer' ? 'e.g. What the buyers hope to pay' : 'e.g. The owners’ hoped-for price') : 'Give a target first'}
            onChange={(e) => {
              if (!ws.target) return;
              const { note: _drop, ...rest } = ws.target;
              ws.setTarget(e.target.value ? { ...rest, note: entry(e.target.value, today) } : rest);
            }}
          />
        </label>
        </div>
      )}
      <p className="fi-only">Only you see this. Hubert never sees it, and it isn’t in the email.</p>
    </div>
  );
}

export interface DetailRow {
  k: string;
  v: string;
}

/**
 * Pricing details' rows: only the ones with data. The asking price against the
 * true estimate, monthly charges against the comps, how sales closed against
 * their asks and how long they took; then the deal terms' own figures.
 */
export function pricingRows(ws: Workspace, kind: ResultKind): DetailRow[] {
  const o = ws.output;
  const rows: DetailRow[] = [];
  if (!o) return rows;
  const r = o.results[kind];
  const t = ws.dealTerms;
  const ask = ws.intake.askingPrice?.value;
  if (ask) {
    const where = againstEstimate(o, kind, ask);
    rows.push({ k: 'Asking price', v: `${usd(ask)}${where ? ` · ${where}` : ''}` });
  }
  if (t?.template === 'seller_pricing') {
    if (t.timing?.value) rows.push({ k: 'Seller’s timing', v: t.timing.value });
    if (t.flexibility?.value) rows.push({ k: 'Strategy', v: t.flexibility.value });
  }
  if (t?.template === 'buyer_traditional') {
    if (t.targetClosing?.value) rows.push({ k: 'Buyer’s closing', v: isoDay(t.targetClosing.value) });
    if (t.timing?.value) rows.push({ k: 'Buyer’s timing', v: t.timing.value });
    if (t.flexibility?.value) rows.push({ k: 'Flexibility', v: t.flexibility.value });
    // Financing and the pre-approval are in Your client now (ClientSection), set against the range.
  }
  const carry = r.carry;
  if (carry.subject && carry.comp_median) {
    const d = carry.subject_vs_median_percent?.value ?? 0;
    const word = Math.abs(d) < 2 ? 'In line with the comps' : d < 0 ? 'Below the comps' : 'Above the comps';
    rows.push({ k: 'Monthly charges', v: `${word}: ${usd(carry.subject.value)}/mo against a median of ${usd(carry.comp_median.value)}/mo` });
  }
  const sta = r.sale_to_ask;
  if (sta) {
    rows.push({ k: 'Sales against ask', v: saleToAskLine(sta) });
    // For a buyer: the comps' typical discount, on this home's ask — where an offer has room.
    if (ws.side === 'buyer' && ask) {
      rows.push({ k: 'Room on price', v: `At the comps’ median (${pct(sta.median.value)}), the ${clientPrice(ask)} ask points to a sale near ${clientPrice(ask * (1 + sta.median.value / 100))}` });
    }
  }
  const dom = r.days_on_market.sold;
  if (dom) rows.push({ k: 'Days on market', v: daysOnMarketLine(dom) });
  const dt = o.deal_terms;
  for (const p of dt?.price_evaluations ?? []) {
    const where = againstEstimate(o, kind, p.price);
    rows.push({ k: p.label, v: `${usd(p.price)}${where ? ` · ${where}` : ''}` });
  }
  const m = dt?.monthly_cost?.[kind];
  if (m) rows.push({ k: 'Monthly cost', v: `${usd(m.mortgage_payment)} mortgage on ${usd(m.price)}${m.housing_cash_outflow !== null ? `, ${usd(m.housing_cash_outflow)} a month in all` : ''}` });
  return rows;
}

/** The deal terms (D-10), as before the port: a template, then its fields. */
export function DealTerms({ ws }: StepProps) {
  const { dealTerms: terms, today, readOnly: off } = ws;
  const setTerm = <K extends keyof DealTermsState>(key: K) => (value: DealTermsState[K] | undefined) =>
    terms && ws.setDealTerms(withField(terms, key, value));
  const num = (key: 'price' | 'depositPercent' | 'downPaymentPercent' | 'ratePercent' | 'termYears' | 'sellerTarget' | 'preApprovalAmount', label: string, opts: { prefix?: string; integer?: boolean; hint?: string } = {}) => (
    <Field label={label} sample={terms?.[key]?.sample} {...(opts.hint ? { hint: opts.hint } : {})}>
      <NumberInput
        label={label}
        value={terms?.[key]}
        onChange={setTerm(key)}
        today={today}
        disabled={off}
        integer={opts.integer ?? true}
        {...(opts.prefix ? { prefix: opts.prefix } : {})}
      />
    </Field>
  );
  const text = (key: 'timing' | 'flexibility', label: string, placeholder: string, opts: { wide?: boolean; info?: string } = {}) => (
    <Field label={label} sample={terms?.[key]?.sample} {...(opts.wide ? { wide: true } : {})} {...(opts.info ? { info: opts.info } : {})}>
      <TextInput label={label} value={terms?.[key]} onChange={setTerm(key)} today={today} disabled={off} placeholder={placeholder} />
    </Field>
  );
  const t = ws.output?.deal_terms ?? null;
  // Only the report side's template (NW-073 a); one stored from the other side still shows, so it can be cleared.
  const mine: DealTermsState['template'] = ws.side === 'buyer' ? 'buyer_traditional' : 'seller_pricing';
  const offered = [mine, ...(terms && terms.template !== mine ? [terms.template] : [])];
  const cash = terms?.financing?.value === 'cash';

  return (
    <div className="fi-terms">
      <div className="fi-terms-head">
        <span className="fi-k">Terms <DecisionTag id="D-10" /></span>
        <select
          aria-label="Deal terms template"
          className="fi-select"
          value={terms?.template ?? ''}
          disabled={off}
          onChange={(e) => {
            const next = e.target.value as DealTermsState['template'] | '';
            if (!next) ws.setDealTerms(null);
            else if (next !== terms?.template) ws.setDealTerms({ template: next });
          }}
        >
          <option value="">None</option>
          {offered.map((o) => <option key={o} value={o}>{TEMPLATE_LABEL[o]}</option>)}
        </select>
      </div>
      {terms?.template === 'buyer_traditional' && (
        <div className="grid">
          {num('price', 'Price', { prefix: '$' })}
          {num('depositPercent', 'Deposit (%)', { integer: false })}
          <Field label="Financing" sample={terms.financing?.sample}>
            <select
              aria-label="Financing"
              value={terms.financing?.value ?? ''}
              disabled={off}
              onChange={(e) => setTerm('financing')(e.target.value ? entry(e.target.value as 'cash' | 'mortgage', today) : undefined)}
            >
              <option value="">—</option>
              <option value="mortgage">Mortgage</option>
              <option value="cash">Cash</option>
            </select>
          </Field>
          {/* Cash hides the mortgage, and the engine computes none (dealTermsInput) even with these still stored. */}
          {!cash && num('downPaymentPercent', 'Down payment (%)', { integer: false })}
          {!cash && num('ratePercent', 'Interest rate (%)', { integer: false })}
          {!cash && num('termYears', 'Term (years)')}
          {!cash && (
            <Field label="Pre-approved" sample={terms.preApproved?.sample}>
              <select
                aria-label="Pre-approved"
                value={terms.preApproved ? (terms.preApproved.value ? 'yes' : 'no') : ''}
                disabled={off}
                onChange={(e) => setTerm('preApproved')(e.target.value ? entry(e.target.value === 'yes', today) : undefined)}
              >
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">Not yet</option>
              </select>
            </Field>
          )}
          {!cash && terms.preApproved?.value && num('preApprovalAmount', 'Pre-approved for', { prefix: '$' })}
          <Field label="Buyer’s closing" sample={terms.targetClosing?.sample}>
            <input
              type="date"
              aria-label="Buyer’s closing"
              value={terms.targetClosing?.value ?? ''}
              disabled={off}
              onChange={(e) => setTerm('targetClosing')(e.target.value ? entry(e.target.value, today) : undefined)}
            />
          </Field>
          {text('timing', 'Buyer’s timing', 'e.g. Wants to be in by spring')}
          {text('flexibility', 'Flexibility', 'e.g. Can stretch for the right outdoor space', { wide: true })}
        </div>
      )}
      {terms?.template === 'seller_pricing' && (
        <div className="grid">
          {num('sellerTarget', 'Seller’s target', { prefix: '$' })}
          {text('timing', 'Seller’s timing', 'e.g. List in October', { info: 'When your client plans to list.' })}
          {text('flexibility', 'Flexibility', 'e.g. Near the top, with room for a quick, clean close', { wide: true })}
        </div>
      )}
      {t && t.not_computed_in_v1.length > 0 && <p className="fi-quiet">Kept, not calculated yet: {t.not_computed_in_v1.join('; ')}.</p>}
    </div>
  );
}

const TEMPLATE_LABEL: Record<DealTermsState['template'], string> = { buyer_traditional: 'Buyer’s terms', seller_pricing: 'Seller’s terms' };

/** Your client: the facts set against the range, the ask and how the comps sold, then the fields. */
export function ClientSection({ ws, kind }: { ws: Workspace; kind: ResultKind }) {
  const r = ws.output?.results[kind] ?? null;
  const rows = clientRows({
    side: ws.side,
    client: ws.brief.client,
    terms: ws.dealTerms,
    range: r?.range ? { low: r.range.low.value, high: r.range.high.value } : null,
    ask: ws.intake.askingPrice?.value ?? null,
    sold: { saleToAsk: r?.sale_to_ask ?? null, daysOnMarket: r?.days_on_market.sold ?? null },
  });
  return (
    <div>
      {rows.length > 0 && (
        <div className="fi-rows cl-rows">
          {rows.map((row) => (
            <div key={row.k} className="fi-row">
              <span className="fi-k">{row.k}</span>
              <span>{row.v}</span>
            </div>
          ))}
        </div>
      )}
      <ClientFields ws={ws} />
    </div>
  );
}

/** Pricing details: the rows with data, then the terms. */
export function PricingDetails({ ws, kind }: { ws: Workspace; kind: ResultKind }) {
  const rows = pricingRows(ws, kind);
  return (
    <div className="fi-rows">
      {rows.map((row) => (
        <div key={`${row.k}:${row.v}`} className="fi-row">
          <span className="fi-k">{row.k}</span>
          <span>{row.v}</span>
        </div>
      ))}
      {!rows.length && <p className="fi-quiet">Nothing to show yet: an asking price, the home’s monthly charges or deal terms fill this in.</p>}
      <DealTerms ws={ws} />
    </div>
  );
}

function withField<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): T {
  const next = { ...obj };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}
