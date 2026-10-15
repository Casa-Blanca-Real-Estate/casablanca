// The modal's own inputs (Dispatch 14): a number as the agent types it, kept as
// an intake entry, styled by the line it sits in (the big 26px size, the
// field tiles' 15px values, Year built's 14px).
import { useEffect, useState } from 'react';
import type { Entry } from '../../../workspace/state.ts';
import { entry } from '../workspace/bits.tsx';

function parseNumber(raw: string, integer: boolean): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  if (integer && !Number.isInteger(n)) return null;
  return n;
}

/** "$2,650"; a year or a floor without the comma ("2016"). */
const format = (n: number, prefix = '', plain = false) => `${prefix}${n.toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: !plain })}`;
const shown = (v: Entry<number> | undefined, prefix = '', plain = false) => (v ? format(v.value, prefix, plain) : '');

/** "2.", "1,850" and "$2,650" stay as typed while the value behind them is kept. A change makes it the agent's. */
export function NrNumber({ label, value, onChange, today, integer = true, disabled, placeholder, className = '', prefix, suffix, plain, estimate, autoFocus, onFocus, onBlur }: {
  label: string;
  value: Entry<number> | undefined;
  onChange: (next: Entry<number> | undefined) => void;
  today: string;
  integer?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** "$": the value shows with it once it's typed. */
  prefix?: string;
  /** "/ mo", "sq ft", shown once there's a value. */
  suffix?: string;
  /** No thousands separator: a year, a floor. */
  plain?: boolean;
  /** A new value is the agent's estimate (the size's "+ Add an estimate"). */
  estimate?: boolean;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const [text, setText] = useState(() => shown(value, prefix, plain));
  // A value set from elsewhere (the home's page, the sample) replaces what's typed.
  useEffect(() => {
    if (parseNumber(text, integer) !== (value?.value ?? null)) setText(shown(value, prefix, plain));
  }, [value?.value]);
  const invalid = text.trim() !== '' && parseNumber(text, integer) === null;
  const filled = text.trim() !== '';
  return (
    <span className={`nr-num ${className}${invalid ? ' invalid' : ''}`}>
      <input
        aria-label={label}
        aria-invalid={invalid || undefined}
        inputMode={integer ? 'numeric' : 'decimal'}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        size={Math.max(2, (text || placeholder || '').length + 1)}
        onFocus={onFocus}
        onBlur={() => {
          const n = parseNumber(text, integer);
          if (n !== null) setText(format(n, prefix, plain));
          onBlur?.();
        }}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim() === '') {
            if (value) onChange(undefined);
            return;
          }
          const n = parseNumber(e.target.value, integer);
          if (n !== null && n !== value?.value) onChange(entry(n, today, estimate ?? value?.estimate));
        }}
      />
      {suffix && filled && <span className="nr-affix suf" aria-hidden="true">{suffix}</span>}
      {invalid && <span className="nr-invalid" role="alert">{integer ? 'A whole number' : 'A number'}</span>}
    </span>
  );
}
