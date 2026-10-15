// The target price and the pricing details, in Findings' accordions (the
// handoff, screen 8; `02-screens.md`, Findings, items 7 and 8). The target is
// editable here (D-4): it never enters a number, Hubert gets it only after the
// math is done, and it isn't in the email (§8.4). Pricing details shows only
// rows with data, then the deal terms behind them (§6.7, D-10).
import type { EngineOutput, ResultKind } from '../../../engine/index.ts';
import { againstAsk, clientPrice, pct, psf, usd } from '../../../workspace/format.ts';
import { answerResult } from '../../../workspace/reading.ts';
import type { DealTermsState } from '../../../workspace/state.ts';
import { MoneyInput } from '../findings/MoneyInput.tsx';
import { DecisionTag, entry, Field, NumberInput, TextInput } from './bits.tsx';
import type { StepProps, Workspace } from './model.ts';

const AGAINST = { below: 'below the true estimate', within: 'inside the true estimate', above: 'above the true estimate' } as const;

/** Where a price sits against a result's range, in words, or null without a range. */
export function againstEstimate(output: EngineOutput | null, kind: ResultKind, price: number): string | null {
  const r = output?.results[kind].range;
  if (!r) return null;
  return price < r.low.value ? AGAINST.below : price > r.high.value ? AGAINST.above : AGAINST.within;
}

/** "Offer target" for a buyer, "Target list price" for a seller (renderVals). */
export function targetLabel(ws: Workspace): string {
  return ws.side === 'buyer' ? 'Offer target' : 'Target list price';
}

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
      {(ws.target || !off) && (
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
    if (t.timing?.value) rows.push({ k: 'Timing', v: t.timing.value });
    if (t.flexibility?.value) rows.push({ k: 'Strategy', v: t.flexibility.value });
  }
  const carry = r.carry;
  if (carry.subject && carry.comp_median) {
    const d = carry.subject_vs_median_percent?.value ?? 0;
    const word = Math.abs(d) < 2 ? 'In line with the comps' : d < 0 ? 'Below the comps' : 'Above the comps';
    rows.push({ k: 'Monthly charges', v: `${word}: ${usd(carry.subject.value)}/mo against a median of ${usd(carry.comp_median.value)}/mo` });
  }
  const sta = r.sale_to_ask;
  if (sta) {
    rows.push({ k: 'Sales against ask', v: `A median ${againstAsk(sta.median.value, '')}, across ${sta.n} sale${sta.n === 1 ? '' : 's'}` });
    // For a buyer: the comps' typical discount, on this home's ask — where an offer has room.
    if (ws.side === 'buyer' && ask) {
      rows.push({ k: 'Room on price', v: `At the comps’ median (${pct(sta.median.value)}), the ${clientPrice(ask)} ask points to a sale near ${clientPrice(ask * (1 + sta.median.value / 100))}` });
    }
  }
  const dom = r.days_on_market.sold;
  if (dom) rows.push({ k: 'Days on market', v: `Sales took a median of ${Math.round(dom.median.value)} days` });
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
  const num = (key: 'price' | 'depositPercent' | 'downPaymentPercent' | 'ratePercent' | 'termYears' | 'sellerTarget', label: string, opts: { prefix?: string; integer?: boolean; hint?: string } = {}) => (
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
  const t = ws.output?.deal_terms ?? null;

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
          <option value="buyer_traditional">Buyer — traditional purchase</option>
          <option value="seller_pricing">Seller — pricing</option>
        </select>
      </div>
      {terms?.template === 'buyer_traditional' && (
        <div className="grid">
          {num('price', 'Price', { prefix: '$' })}
          {num('depositPercent', 'Deposit (%)', { integer: false })}
          {num('downPaymentPercent', 'Down payment (%)', { integer: false })}
          {num('ratePercent', 'Interest rate (%)', { integer: false })}
          {num('termYears', 'Term (years)')}
          <Field label="Target closing" sample={terms.targetClosing?.sample}>
            <input
              type="date"
              aria-label="Target closing"
              value={terms.targetClosing?.value ?? ''}
              disabled={off}
              onChange={(e) => setTerm('targetClosing')(e.target.value ? entry(e.target.value, today) : undefined)}
            />
          </Field>
        </div>
      )}
      {terms?.template === 'seller_pricing' && (
        <div className="grid">
          {num('sellerTarget', 'Seller’s target', { prefix: '$' })}
          <Field label="Timing" sample={terms.timing?.sample}>
            <TextInput label="Timing" value={terms.timing} onChange={setTerm('timing')} today={today} disabled={off} placeholder="e.g. List in October" />
          </Field>
          <Field label="Flexibility" sample={terms.flexibility?.sample} wide>
            <TextInput label="Flexibility" value={terms.flexibility} onChange={setTerm('flexibility')} today={today} disabled={off} placeholder="e.g. Near the top, with room for a quick, clean close" />
          </Field>
        </div>
      )}
      {t && t.not_computed_in_v1.length > 0 && <p className="fi-quiet">Kept, not calculated yet: {t.not_computed_in_v1.join('; ')}.</p>}
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
