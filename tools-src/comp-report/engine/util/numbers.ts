// Arithmetic helpers. The engine uses only +, −, ×, ÷, comparisons and
// rounding — operations IEEE 754 pins exactly — so a browser and a Netlify
// function compute bit-identical figures. Math.pow, the ** operator, exp and
// log are implementation-approximated by the language spec, so they're not
// used anywhere in the engine (the purity test enforces it).

/** Round half away from zero to a whole number (money is whole dollars). */
export function roundHalfAway(x: number): number {
  const r = x < 0 ? -Math.round(-x) : Math.round(x);
  return r === 0 ? 0 : r; // never -0
}

/** Integer power by repeated squaring — exact operations, same result everywhere. */
export function powInt(base: number, exponent: number): number {
  if (!Number.isInteger(exponent)) throw new Error('powInt: exponent must be an integer');
  if (exponent < 0) return 1 / powInt(base, -exponent);
  let result = 1;
  let b = base;
  let e = exponent;
  while (e > 0) {
    if (e % 2 === 1) result *= b;
    b *= b;
    e = Math.floor(e / 2);
  }
  return result;
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Arithmetic mean; values are summed in the order given, so callers pass a canonical order. */
export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

/** Median; the mean of the middle two when the count is even. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function minOf(values: readonly number[]): number | null {
  let m: number | null = null;
  for (const v of values) if (m === null || v < m) m = v;
  return m;
}

export function maxOf(values: readonly number[]): number | null {
  let m: number | null = null;
  for (const v of values) if (m === null || v > m) m = v;
  return m;
}

export function isWholeDollars(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
}

/** Code-unit string comparison — never localeCompare, whose order depends on the machine. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
