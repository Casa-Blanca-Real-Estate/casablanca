// Small pieces the walkthrough's steps share: labelled fields that record each
// value as an Entry (when, estimate or not, sample or not), and the tags that
// mark sample and estimated values wherever they show.
import { useEffect, useState, type ReactNode } from 'react';
import type { Entry } from '../../../workspace/state.ts';
import { useBuildNotes } from './buildNotes.tsx';
import { Info } from '../newcomp/Frame.tsx';

// `show` is required: a value's flag is often undefined, and undefined must never show the tag.
// A sample report has one banner (the workspace's); the per-value mark is a build note.
export function SampleTag({ show }: { show: boolean | undefined }) {
  const notes = useBuildNotes();
  return show && notes ? <span className="tag tag-sample" title="Filled in from the sample (100 Barclay #17L). Not a real value.">Sample</span> : null;
}

export function EstimateTag({ show }: { show: boolean | undefined }) {
  return show ? <span className="tag tag-estimate" title="Your estimate: it counts in “with estimates” only.">Estimate</span> : null;
}

/** What's still to come, for admins with build notes on. */
export function StubTag({ children = 'Stubbed' }: { children?: ReactNode }) {
  return useBuildNotes() ? <span className="tag tag-stub">{children}</span> : null;
}

/** A decision behind something on screen, for admins with build notes on. */
export function DecisionTag({ id, children }: { id: string; children?: ReactNode }) {
  return useBuildNotes()
    ? <span className="tag tag-decision" title={`Decision ${id} — see docs/decisions.md`}>{id}{children ? <> · {children}</> : null}</span>
    : null;
}

/** A line only admins with build notes on see: what's stubbed, and why. */
export function BuildNote({ children }: { children: ReactNode }) {
  return useBuildNotes() ? <p className="build-note small">{children}</p> : null;
}

/** A new entry, typed by the agent: never a sample, dated today. */
export function entry<T>(value: T, today: string, estimate?: boolean): Entry<T> {
  return { value, asOf: today, ...(estimate ? { estimate: true } : {}) };
}

/** A value read from the home's StreetEasy page: marked until the agent changes it. */
export function ListingTag({ show }: { show: boolean | undefined }) {
  return show ? <span className="field-hint from-listing" title="Read from the home’s StreetEasy page. Change it and it’s yours.">From StreetEasy</span> : null;
}

interface FieldProps {
  label: string;
  hint?: string;
  sample?: boolean | undefined;
  estimate?: boolean | undefined;
  /** Filled from the home's StreetEasy page. */
  from?: boolean | undefined;
  children: ReactNode;
  wide?: boolean;
  /** An ⓘ beside the label: what the field is for, in a line. */
  info?: string;
}

export function Field({ label, hint, sample, estimate, from, children, wide, info }: FieldProps) {
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <span className="field-label">
        {label}{info && <span className="fi-info"> <Info label={`About ${label.toLowerCase()}`} text={info} align="left" /></span>} <SampleTag show={sample} /> <EstimateTag show={estimate} />
      </span>
      {children}
      <ListingTag show={from} />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

function parseNumber(raw: string, integer: boolean): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  if (integer && !Number.isInteger(n)) return null;
  return n;
}

/** A number as the agent types it: "2.", "1,850" and "$2,650" stay as typed while the value behind them is kept. */
export function NumberInput({ label, value, onChange, today, integer = true, disabled, placeholder, prefix }: {
  label: string;
  value: Entry<number> | undefined;
  onChange: (next: Entry<number> | undefined) => void;
  today: string;
  integer?: boolean;
  disabled?: boolean | undefined;
  placeholder?: string;
  prefix?: string;
}) {
  const shown = (v: Entry<number> | undefined) => (v ? v.value.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '');
  const [text, setText] = useState(() => shown(value));
  // A value set from elsewhere (the sample, another step) replaces what's typed.
  useEffect(() => {
    const typed = parseNumber(text, integer);
    if (typed !== (value?.value ?? null)) setText(shown(value));
  }, [value?.value]);
  const invalid = text.trim() !== '' && parseNumber(text, integer) === null;
  return (
    <span className="input-wrap">
      {prefix && <span className="input-prefix">{prefix}</span>}
      <input
        aria-label={label}
        aria-invalid={invalid || undefined}
        inputMode={integer ? 'numeric' : 'decimal'}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim() === '') {
            if (value) onChange(undefined);
            return;
          }
          const n = parseNumber(e.target.value, integer);
          if (n !== null && n !== value?.value) onChange(entry(n, today, value?.estimate));
        }}
      />
      {invalid && <span className="field-hint error">{integer ? 'A whole number' : 'Not a number'}</span>}
    </span>
  );
}

export function TextInput({ label, value, onChange, today, disabled, placeholder, multiline, rows = 2 }: {
  label: string;
  rows?: number;
  value: Entry<string> | undefined;
  onChange: (next: Entry<string> | undefined) => void;
  today: string;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  const props = {
    'aria-label': label,
    value: value?.value ?? '',
    placeholder,
    disabled,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value === '' ? undefined : entry(e.target.value, today)),
  };
  return multiline ? <textarea rows={rows} {...props} /> : <input {...props} />;
}

export function ChoiceInput<T extends string>({ label, value, choices, onChange, today, disabled, blank = 'Not given' }: {
  label: string;
  value: Entry<T> | undefined;
  choices: { value: T; label: string; disabled?: boolean }[];
  onChange: (next: Entry<T> | undefined) => void;
  today: string;
  disabled?: boolean;
  blank?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value?.value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === '' ? undefined : entry(e.target.value as T, today))}
    >
      <option value="">{blank}</option>
      {choices.map((c) => <option key={c.value} value={c.value} disabled={c.disabled}>{c.label}</option>)}
    </select>
  );
}

export function YesNoInput({ label, value, onChange, today, disabled }: {
  label: string;
  value: Entry<boolean> | undefined;
  onChange: (next: Entry<boolean> | undefined) => void;
  today: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={value === undefined ? '' : value.value ? 'yes' : 'no'}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === '' ? undefined : entry(e.target.value === 'yes', today))}
    >
      <option value="">Unknown</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}
