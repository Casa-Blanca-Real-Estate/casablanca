// A dollar amount as agents type it, for the Gate and the target: "4.2M",
// "4,200,000", "$4.2M", "850K" (readPrice, as the comp form reads prices).
// What's typed stays as typed; on blur it settles to "$4,200,000".
import { useEffect, useState } from 'react';
import { usd } from '../../../workspace/format.ts';
import { readPrice } from '../comp/CompForm.tsx';

/** Whole dollars the server takes: positive, under $10B. */
export function moneyFrom(text: string): number | null {
  const n = readPrice(text);
  return n !== null && Number.isSafeInteger(n) && n > 0 && n < 10_000_000_000 ? n : null;
}

const shown = (n: number | null) => (n === null ? '' : usd(n));

export function MoneyInput({ id, value, onChange, className, placeholder, disabled, label, keepOnInvalid }: {
  id?: string;
  value: number | null;
  onChange: (next: number | null) => void;
  className: string;
  placeholder?: string;
  disabled?: boolean;
  /** For an input without a visible <label>. */
  label?: string;
  /** Half-typed text ("4.") keeps the last good value rather than clearing it: the target, whose note goes with it. */
  keepOnInvalid?: boolean;
}) {
  const [text, setText] = useState(() => shown(value));
  // A value set from elsewhere (the server, a sample) replaces what's typed.
  useEffect(() => {
    if (moneyFrom(text) !== value) setText(shown(value));
  }, [value]);
  const invalid = text.trim() !== '' && moneyFrom(text) === null;
  return (
    <input
      id={id}
      className={className}
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const empty = e.target.value.trim() === '';
        const n = empty ? null : moneyFrom(e.target.value);
        if (n === null && !empty && keepOnInvalid) return;
        if (n !== value) onChange(n);
      }}
      onBlur={() => {
        const n = moneyFrom(text);
        if (n !== null) setText(shown(n));
      }}
    />
  );
}
