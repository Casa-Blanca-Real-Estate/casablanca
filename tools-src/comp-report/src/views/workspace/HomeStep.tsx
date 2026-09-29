// Step 1, the home (intake, §3 step 1): the subject, the brief, a target and
// deal terms. Progressive and skippable: every field is optional, and each
// value is recorded with when it was given and whether it's the agent's
// estimate (input confidence, §6.1).
import { useEffect, useState } from 'react';
import type { LaundryState } from '../../../engine/index.ts';
import type { Audience, DealTermsState, Entry, Intake, OutdoorChoice } from '../../../workspace/state.ts';
import { ChoiceInput, DecisionTag, Field, NumberInput, StubTag, TextInput, YesNoInput, entry } from './bits.tsx';
import { splitTitle, type StepProps } from './model.ts';

const LAUNDRY: { value: LaundryState; label: string }[] = [
  { value: 'installed', label: 'Washer/dryer in the unit' },
  { value: 'permitted', label: 'Allowed, none installed' },
  { value: 'prohibited', label: 'Not allowed' },
  { value: 'none_listed', label: 'None in the unit (not known if allowed)' },
];

const OUTDOOR: { value: OutdoorChoice; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'balcony', label: 'Balcony' },
  { value: 'terrace', label: 'Terrace' },
  { value: 'roof_deck', label: 'Private roof deck' },
  { value: 'garden', label: 'Garden' },
  { value: 'patio', label: 'Patio' },
  { value: 'outdoor_space', label: 'Other private outdoor space' },
];

export function HomeStep({ ws }: StepProps) {
  const { intake, today, readOnly: off } = ws;
  const set = <K extends keyof Intake>(key: K) => (value: Intake[K] | undefined) => {
    const next = { ...intake };
    if (value === undefined) delete next[key];
    else next[key] = value;
    ws.setIntake(next);
  };
  const seed = !intake.address && splitTitle(ws.report.title);

  return (
    <div className="home">
      <fieldset className="group">
        <legend>The subject</legend>
        <div className="grid">
          <Field label="Address" sample={intake.address?.sample} wide>
            <TextInput label="Address" value={intake.address} onChange={set('address')} today={today} disabled={off} placeholder="e.g. 100 Barclay Street, New York, NY" />
            {seed && !off && (
              <span className="field-hint">
                From the report title: {seed.address}{seed.unit ? ` · ${seed.unit}` : ''}{' '}
                <button
                  type="button"
                  className="link"
                  onClick={() => ws.setIntake({
                    ...intake,
                    address: entry(seed.address, today),
                    ...(seed.unit && !intake.unit ? { unit: entry(seed.unit, today) } : {}),
                  })}
                >
                  Use it
                </button>
              </span>
            )}
          </Field>
          <Field label="Unit" sample={intake.unit?.sample}>
            <TextInput label="Unit" value={intake.unit} onChange={set('unit')} today={today} disabled={off} placeholder="#17L" />
          </Field>
          <Field label="Property type" hint="Co-ops come later: same engine, with unit rates switched off (§6.3).">
            <select aria-label="Property type" value="condo" disabled={off} onChange={() => undefined}>
              <option value="condo">Condo</option>
              <option value="coop" disabled>Co-op (later)</option>
            </select>
          </Field>
          <Field
            label="Interior size (sq ft)"
            sample={intake.areaSqft?.sample}
            estimate={intake.areaSqft?.estimate}
            hint="Input confidence (§6.1): marked as your estimate, it counts in “with estimates” only, and “on the facts” says the size is missing (§6.4)."
          >
            <NumberInput label="Interior size in square feet" value={intake.areaSqft} onChange={set('areaSqft')} today={today} disabled={off} placeholder="e.g. 1,850" />
            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(intake.areaSqft?.estimate)}
                disabled={off || !intake.areaSqft}
                onChange={(e) => intake.areaSqft && set('areaSqft')({ ...intake.areaSqft, estimate: e.target.checked || undefined } as Entry<number>)}
              />
              This is my estimate
            </label>
          </Field>
          <Field label="Bedrooms" sample={intake.beds?.sample}>
            <NumberInput label="Bedrooms" value={intake.beds} onChange={set('beds')} today={today} disabled={off} />
          </Field>
          <Field label="Bathrooms" sample={intake.baths?.sample}>
            <NumberInput label="Bathrooms" value={intake.baths} onChange={set('baths')} today={today} disabled={off} integer={false} placeholder="e.g. 2.5" />
          </Field>
          <Field label="Floor" sample={intake.floor?.sample}>
            <NumberInput label="Floor" value={intake.floor} onChange={set('floor')} today={today} disabled={off} />
          </Field>
          <Field label="Common charges (monthly)" sample={intake.commonCharges?.sample}>
            <NumberInput label="Common charges per month" value={intake.commonCharges} onChange={set('commonCharges')} today={today} disabled={off} prefix="$" />
          </Field>
          <Field label="Taxes (monthly)" sample={intake.taxes?.sample}>
            <NumberInput label="Taxes per month" value={intake.taxes} onChange={set('taxes')} today={today} disabled={off} prefix="$" />
          </Field>
          <Field label="Central air" sample={intake.centralAir?.sample}>
            <YesNoInput label="Central air" value={intake.centralAir} onChange={set('centralAir')} today={today} disabled={off} />
          </Field>
          <Field label="Dishwasher" sample={intake.dishwasher?.sample}>
            <YesNoInput label="Dishwasher" value={intake.dishwasher} onChange={set('dishwasher')} today={today} disabled={off} />
          </Field>
          <Field label="Working fireplace" sample={intake.fireplace?.sample} hint="Wood-burning or gas; a decorative one doesn’t count.">
            <YesNoInput label="Working fireplace" value={intake.fireplace} onChange={set('fireplace')} today={today} disabled={off} />
          </Field>
          <Field label="Laundry" sample={intake.laundry?.sample}>
            <ChoiceInput label="Laundry" value={intake.laundry} choices={LAUNDRY} onChange={set('laundry')} today={today} disabled={off} blank="Unknown" />
          </Field>
          <Field label="Private outdoor space" sample={intake.outdoorKind?.sample}>
            <ChoiceInput
              label="Private outdoor space"
              value={intake.outdoorKind}
              choices={OUTDOOR}
              onChange={(v) => {
                const next = { ...intake };
                if (v === undefined) delete next.outdoorKind;
                else next.outdoorKind = v;
                if (!v || v.value === 'none') delete next.outdoorSqft;
                ws.setIntake(next);
              }}
              today={today}
              disabled={off}
              blank="Unknown"
            />
          </Field>
          {intake.outdoorKind && intake.outdoorKind.value !== 'none' && (
            <Field label="Outdoor size (sq ft), if known" sample={intake.outdoorSqft?.sample}>
              <NumberInput label="Outdoor size in square feet" value={intake.outdoorSqft} onChange={set('outdoorSqft')} today={today} disabled={off} />
            </Field>
          )}
          <Field label="Views" sample={intake.views?.sample} hint="Comma-separated: city, water, park…" wide>
            <ViewsInput value={intake.views} onChange={set('views')} today={today} disabled={off} />
          </Field>
        </div>
        <p className="muted small">
          <StubTag>CR-3</StubTag> Prefill from a StreetEasy link (the existing Firecrawl import) comes with CR-3.
        </p>
      </fieldset>

      <fieldset className="group">
        <legend>The brief</legend>
        <div className="grid">
          <Field label="The question" sample={ws.brief.question?.sample} wide>
            <TextInput
              label="The question"
              multiline
              value={ws.brief.question}
              onChange={(v) => ws.setBrief(withField(ws.brief, 'question', v))}
              today={today}
              disabled={off}
              placeholder="What is the client asking? e.g. What range can we defend, and where should it list?"
            />
          </Field>
          <Field label="Audience" sample={ws.brief.audience?.sample}>
            <ChoiceInput<Audience>
              label="Audience"
              value={ws.brief.audience}
              choices={[{ value: 'seller', label: 'Seller' }, { value: 'buyer', label: 'Buyer' }]}
              onChange={(v) => ws.setBrief(withField(ws.brief, 'audience', v))}
              today={today}
              disabled={off}
            />
          </Field>
          <Field label="A short client note" sample={ws.brief.clientNote?.sample} wide hint="What matters to them. The full client profile (§8.6) comes with CR-3.">
            <TextInput
              label="Client note"
              multiline
              value={ws.brief.clientNote}
              onChange={(v) => ws.setBrief(withField(ws.brief, 'clientNote', v))}
              today={today}
              disabled={off}
            />
          </Field>
        </div>
      </fieldset>

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

/** Views as the agent types them ("City, Water"), kept as a list. */
function ViewsInput({ value, onChange, today, disabled }: {
  value: Entry<string[]> | undefined;
  onChange: (next: Entry<string[]> | undefined) => void;
  today: string;
  disabled: boolean;
}) {
  const external = value?.value.join(', ') ?? '';
  const [text, setText] = useState(external);
  const parse = (t: string) => t.split(',').map((v) => v.trim()).filter(Boolean);
  // A value set from elsewhere (the sample) replaces what's typed; the agent's own typing stays as typed.
  useEffect(() => {
    if (parse(text).join(', ') !== external) setText(external);
  }, [external]);
  return (
    <input
      aria-label="Views"
      value={text}
      disabled={disabled}
      placeholder="e.g. City, Water"
      onChange={(e) => {
        setText(e.target.value);
        const views = parse(e.target.value);
        if (views.join(', ') !== external) onChange(views.length ? entry(views, today) : undefined);
      }}
    />
  );
}
