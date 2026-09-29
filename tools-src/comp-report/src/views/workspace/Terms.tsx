// The target price and deal terms (§2, §6.7, §8.4): after the reveal, on the
// call-and-reveal step (Dispatch 09 moved them out of the start; phase 2 places
// them on Findings, D-4). The target never enters a number, and the assistant
// never sees it.
import type { DealTermsState } from '../../../workspace/state.ts';
import { DecisionTag, entry, Field, NumberInput, TextInput } from './bits.tsx';
import type { StepProps } from './model.ts';

export function TargetAndTerms({ ws }: StepProps) {
  const { today, readOnly: off } = ws;
  return (
    <>
      <fieldset className="group">
        <legend>A target price <DecisionTag id="D-4">recommendation A</DecisionTag></legend>
        <p className="muted small">
          The client’s price goal. It never goes into the numbers, and it’s kept out of the assistant’s context
          while it helps with the valuation (§8.4). After the reveal it shows against the range.
        </p>
        <div className="grid">
          <Field label="Target" sample={ws.target?.price.sample}>
            <NumberInput
              label="Target price"
              prefix="$"
              value={ws.target?.price}
              onChange={(v) => ws.setTarget(v ? { ...ws.target, price: v } : null)}
              today={today}
              disabled={off}
            />
          </Field>
          <Field label="Note" sample={ws.target?.note?.sample} wide>
            <TextInput
              label="Target note"
              value={ws.target?.note}
              onChange={(v) => ws.target && ws.setTarget(withField(ws.target, 'note', v))}
              today={today}
              disabled={off || !ws.target}
              placeholder={ws.target ? 'Whose goal, and why' : 'Give a target first'}
            />
          </Field>
        </div>
      </fieldset>
      <DealTerms ws={ws} />
    </>
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
      <legend>Deal terms <DecisionTag id="D-10">recommendation B</DecisionTag></legend>
      <p className="muted small">Optional. Two templates in v1: a buyer’s traditional purchase and a seller’s pricing (§6.7).</p>
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
            <option value="">None — skip deal terms</option>
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
      {terms && (
        <p className="muted small">
          The engine evaluates these prices against both results after the reveal, and, with financing, a monthly cost.
          Rent credits and the closing timeline are captured, not calculated, until full offer modelling.
        </p>
      )}
    </fieldset>
  );
}

function anySampleTerm(terms: DealTermsState | null): boolean {
  if (!terms) return false;
  return Object.values(terms).some((v) => typeof v === 'object' && v !== null && (v as { sample?: boolean }).sample);
}

