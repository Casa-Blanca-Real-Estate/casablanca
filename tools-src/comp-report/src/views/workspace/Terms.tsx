// The target price and the offer details (`02-screens.md`, Findings, items 7
// and 8): after the reveal, on Findings (D-4). The target never enters a
// number, and the assistant never sees it (§8.4). Offer details fold away:
// for a buyer, the offer price and terms; for a seller, pricing (§6.7, D-10).
import type { EngineOutput, ResultKind } from '../../../engine/index.ts';
import { answerResult } from '../../../workspace/reading.ts';
import { clientPrice, pct, usd } from '../../../workspace/format.ts';
import type { DealTermsState } from '../../../workspace/state.ts';
import { DecisionTag, entry, Field, NumberInput, TextInput } from './bits.tsx';
import type { StepProps } from './model.ts';

const POSITION = { below: 'below what the sales support', within: 'inside what the sales support', above: 'above what the sales support' } as const;

/** The target: a price goal, and where it sits against the range. */
export function TargetSection({ ws }: StepProps) {
  const { today, readOnly: off, output } = ws;
  const evaluation = output?.prices.find((p) => p.id === 'target');
  const kind: ResultKind | null = output ? answerResult(output) : null;
  const where = evaluation && kind ? evaluation.per_result[kind].vs_range : null;
  return (
    <section className="target" aria-label="The target price">
      <div className="label">The target price <DecisionTag id="D-4" /></div>
      <div className="grid">
        <Field label={ws.brief.audience?.value === 'seller' ? 'The seller’s target' : 'The buyer’s ceiling or goal'} sample={ws.target?.price.sample}>
          <NumberInput
            label="Target price"
            prefix="$"
            value={ws.target?.price}
            onChange={(v) => ws.setTarget(v ? { ...ws.target, price: v } : null)}
            today={today}
            disabled={off}
          />
        </Field>
        <Field label="Whose, and why" sample={ws.target?.note?.sample} wide>
          <TextInput
            label="Target note"
            value={ws.target?.note}
            onChange={(v) => ws.target && ws.setTarget(withField(ws.target, 'note', v))}
            today={today}
            disabled={off || !ws.target}
            placeholder={ws.target ? 'e.g. The seller’s number from the listing meeting' : 'Give a target first'}
          />
        </Field>
      </div>
      {ws.target && where && evaluation && (
        <p>
          {clientPrice(evaluation.price)} sits {POSITION[where.position]}
          {evaluation.per_result[kind!].vs_base ? ` (${pct(evaluation.per_result[kind!].vs_base!.percent)} against the base)` : ''}.
        </p>
      )}
      <p className="muted small">It never enters the numbers, and the assistant never sees it. Path to target comes later.</p>
    </section>
  );
}

/** Offer details, folded: the deal terms and what the engine can compute on them. */
export function OfferDetails({ ws }: StepProps) {
  const t = ws.output?.deal_terms ?? null;
  return (
    <details className="offer-details">
      <summary>{ws.brief.audience?.value === 'seller' ? 'Pricing details' : 'Offer details'}</summary>
      <DealTerms ws={ws} />
      {t && ws.output && <DealTermsOut output={ws.output} />}
    </details>
  );
}

function DealTermsOut({ output }: { output: EngineOutput }) {
  const t = output.deal_terms!;
  const kind = answerResult(output);
  return (
    <div className="sub">
      {t.price_evaluations.length > 0 && (
        <ul className="plain small">
          {t.price_evaluations.map((p) => (
            <li key={p.id}>
              <strong>{p.label}</strong> {usd(p.price)}: {p.per_result[kind].vs_range ? POSITION[p.per_result[kind].vs_range!.position] : 'no range to compare with'}
            </li>
          ))}
        </ul>
      )}
      {t.monthly_cost?.[kind] && (
        <p className="small">
          Monthly cost: {usd(t.monthly_cost[kind]!.mortgage_payment)} mortgage on {usd(t.monthly_cost[kind]!.price)}
          {t.monthly_cost[kind]!.housing_cash_outflow !== null && `, ${usd(t.monthly_cost[kind]!.housing_cash_outflow)} a month in all`}.
        </p>
      )}
      {t.not_computed_in_v1.length > 0 && <p className="muted small">Kept, not calculated yet: {t.not_computed_in_v1.join('; ')}.</p>}
    </div>
  );
}

function withField<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): T {
  const next = { ...obj };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function DealTerms({ ws }: StepProps) {
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

  return (
    <fieldset className="group">
      <legend>Terms <DecisionTag id="D-10" /></legend>
      <div className="grid">
        <Field label="Template" sample={anySampleTerm(terms)}>
          <select
            aria-label="Deal terms template"
            value={terms?.template ?? ''}
            disabled={off}
            onChange={(e) => {
              const t = e.target.value as DealTermsState['template'] | '';
              if (!t) ws.setDealTerms(null);
              else if (t !== terms?.template) ws.setDealTerms({ template: t });
            }}
          >
            <option value="">None</option>
            <option value="buyer_traditional">Buyer — traditional purchase</option>
            <option value="seller_pricing">Seller — pricing</option>
          </select>
        </Field>
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
            <TextInput label="Flexibility" value={terms.flexibility} onChange={setTerm('flexibility')} today={today} disabled={off} />
          </Field>
        </div>
      )}
    </fieldset>
  );
}

function anySampleTerm(terms: DealTermsState | null): boolean {
  if (!terms) return false;
  return Object.values(terms).some((v) => typeof v === 'object' && v !== null && (v as { sample?: boolean }).sample);
}

