// New comp — 2 · The details (`02-screens.md`): what the numbers and the
// comparisons need to know about the home. The size is the one must; beds,
// baths, floor, the ask, the charges and the notes show; the rest folds away.
// Values read from the home's StreetEasy page carry a "From StreetEasy" mark
// until the agent changes them.
import { useEffect, useState } from 'react';
import type { LaundryState } from '../../../engine/index.ts';
import type { Condition, Entry, Intake, OutdoorChoice } from '../../../workspace/state.ts';
import { ChoiceInput, entry, Field, NumberInput, TextInput, YesNoInput } from '../workspace/bits.tsx';
import type { Workspace } from '../workspace/model.ts';

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

const CONDITION: { value: Condition; label: string }[] = [
  { value: 'renovated', label: 'Renovated' },
  { value: 'good', label: 'Good' },
  { value: 'needs_work', label: 'Needs work' },
];

export function HomeDetails({ ws }: { ws: Workspace }) {
  const { intake, today, readOnly: off } = ws;
  const set = <K extends keyof Intake>(key: K) => (value: Intake[K] | undefined) => {
    const next = { ...intake };
    if (value === undefined) delete next[key];
    else next[key] = value;
    ws.setIntake(next);
  };
  const from = (k: keyof Intake) => intake[k]?.from === 'listing';
  const num = (key: 'beds' | 'baths' | 'floor' | 'askingPrice' | 'commonCharges' | 'taxes' | 'outdoorSqft' | 'yearBuilt', label: string, opts: { prefix?: string; integer?: boolean; placeholder?: string } = {}) => (
    <Field label={label} sample={intake[key]?.sample} from={from(key)}>
      <NumberInput
        label={label}
        value={intake[key]}
        onChange={set(key)}
        today={today}
        disabled={off}
        integer={opts.integer ?? true}
        {...(opts.prefix ? { prefix: opts.prefix } : {})}
        {...(opts.placeholder ? { placeholder: opts.placeholder } : {})}
      />
    </Field>
  );
  const moreFilled = (['outdoorKind', 'views', 'exposure', 'corner', 'condition', 'laundry', 'dishwasher', 'centralAir', 'fireplace', 'yearBuilt', 'newDevelopment'] as const)
    .filter((k) => intake[k] !== undefined).length;

  return (
    <div className="details">
      <div className="grid">
        <Field
          label="Interior size (sq ft)"
          sample={intake.areaSqft?.sample}
          estimate={intake.areaSqft?.estimate}
          from={from('areaSqft')}
          hint={intake.areaSqft ? undefined : 'Without it there’s no $/sq ft value for the home.'}
        >
          <NumberInput label="Interior size in square feet" value={intake.areaSqft} onChange={set('areaSqft')} today={today} disabled={off} placeholder="e.g. 1,850" />
          <label className="check" title="Your estimate counts in “with estimates” only, and the email says so.">
            <input
              type="checkbox"
              checked={Boolean(intake.areaSqft?.estimate)}
              disabled={off || !intake.areaSqft}
              onChange={(e) => intake.areaSqft && set('areaSqft')({ ...intake.areaSqft, estimate: e.target.checked || undefined, from: undefined } as Entry<number>)}
            />
            My estimate
          </label>
        </Field>
        {num('beds', 'Bedrooms')}
        {num('baths', 'Bathrooms', { integer: false, placeholder: 'e.g. 2.5' })}
        {num('floor', 'Floor')}
        {num('askingPrice', 'Asking price', { prefix: '$' })}
        {num('commonCharges', 'Common charges (monthly)', { prefix: '$' })}
        {num('taxes', 'Taxes (monthly)', { prefix: '$' })}
        <Field label="Notes: what stands out?" sample={intake.notes?.sample} wide>
          <TextInput
            label="Notes about the home"
            multiline
            value={intake.notes}
            onChange={set('notes')}
            today={today}
            disabled={off}
            placeholder="Light, views, condition, layout, storage: a line or three."
          />
        </Field>
      </div>

      <details className="more">
        <summary>More about the home{moreFilled ? ` (${moreFilled} filled)` : ''}</summary>
        <div className="grid">
          <Field label="Private outdoor space" sample={intake.outdoorKind?.sample} from={from('outdoorKind')}>
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
          {intake.outdoorKind && intake.outdoorKind.value !== 'none' && num('outdoorSqft', 'Outdoor size (sq ft)')}
          <Field label="Views" sample={intake.views?.sample} from={from('views')} hint="Comma-separated: city, water, park…">
            <ViewsInput value={intake.views} onChange={set('views')} today={today} disabled={off} />
          </Field>
          <Field label="Exposure" sample={intake.exposure?.sample}>
            <TextInput label="Exposure" value={intake.exposure} onChange={set('exposure')} today={today} disabled={off} placeholder="e.g. South and west" />
          </Field>
          <Field label="Corner unit" sample={intake.corner?.sample}>
            <YesNoInput label="Corner unit" value={intake.corner} onChange={set('corner')} today={today} disabled={off} />
          </Field>
          <Field label="Condition" sample={intake.condition?.sample}>
            <ChoiceInput label="Condition" value={intake.condition} choices={CONDITION} onChange={set('condition')} today={today} disabled={off} blank="Not said" />
          </Field>
          <Field label="Laundry" sample={intake.laundry?.sample} from={from('laundry')}>
            <ChoiceInput label="Laundry" value={intake.laundry} choices={LAUNDRY} onChange={set('laundry')} today={today} disabled={off} blank="Unknown" />
          </Field>
          <Field label="Dishwasher" sample={intake.dishwasher?.sample} from={from('dishwasher')}>
            <YesNoInput label="Dishwasher" value={intake.dishwasher} onChange={set('dishwasher')} today={today} disabled={off} />
          </Field>
          <Field label="Central air" sample={intake.centralAir?.sample} from={from('centralAir')}>
            <YesNoInput label="Central air" value={intake.centralAir} onChange={set('centralAir')} today={today} disabled={off} />
          </Field>
          <Field label="Working fireplace" sample={intake.fireplace?.sample} from={from('fireplace')} hint="Wood-burning or gas; a decorative one doesn’t count.">
            <YesNoInput label="Working fireplace" value={intake.fireplace} onChange={set('fireplace')} today={today} disabled={off} />
          </Field>
          {num('yearBuilt', 'Year built')}
          <Field label="New development or resale" sample={intake.newDevelopment?.sample} from={from('newDevelopment')}>
            <select
              aria-label="New development or resale"
              value={intake.newDevelopment === undefined ? '' : intake.newDevelopment.value ? 'new' : 'resale'}
              disabled={off}
              onChange={(e) => set('newDevelopment')(e.target.value === '' ? undefined : entry(e.target.value === 'new', today))}
            >
              <option value="">Unknown</option>
              <option value="resale">Resale</option>
              <option value="new">New development</option>
            </select>
          </Field>
        </div>
      </details>
    </div>
  );
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
  // A value set from elsewhere (the page, the sample) replaces what's typed; the agent's own typing stays as typed.
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
