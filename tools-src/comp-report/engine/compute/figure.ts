// A figure the engine computed, with its provenance (§4.7).

import type { Confidence, IsoDate } from '../types.ts';
import type { Figure, FigureUnit } from './output.ts';

export function figure(value: number, unit: FigureUnit, confidence: Confidence, derivation: string, asOf: IsoDate): Figure {
  return { value, unit, source: 'engine', as_of: asOf, confidence, derivation };
}

/**
 * Dollars for a sentence — "$150", "−$1,240" — truncated to whole dollars as
 * StreetEasy shows $/sqft (§6.1), with separators written the same on every
 * machine (never toLocaleString).
 */
export function dollarsText(x: number): string {
  const whole = Math.trunc(x);
  const digits = String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${whole < 0 ? '−' : ''}$${digits}`;
}
