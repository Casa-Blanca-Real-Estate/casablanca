// What a decision call costs, at each provider's own price (Dispatch 10 phase 1
// step 6). MindBinder's first ledger priced Jev at its fallback's rate, 71× too
// high; Jev gets its own row here and nothing else resolves to it.

import { JEV_MODEL } from './jev.ts';

export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

interface Price {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

/** Jev: $0.042 per million input tokens, output free, no cache (handoff §1.3). */
export const JEV_PRICE: Price = { input: 0.042, output: 0 };
/** Claude Haiku 4.5: $1 / $5 per million. */
export const HAIKU_PRICE: Price = { input: 1, output: 5 };

/** The price row for a served model string, or null for one this layer doesn't call. */
export function priceFor(model: string | null): Price | null {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m === JEV_MODEL || m.startsWith(`${JEV_MODEL}-`) || m.startsWith(`${JEV_MODEL}@`) || m === 'jev' || /^jev-\d/.test(m)) return JEV_PRICE;
  if (m === HAIKU_MODEL || m === 'claude-haiku-4-5') return HAIKU_PRICE;
  return null;
}

/**
 * USD, unrounded — the usage table keeps six places, so a single Jev call
 * rounds there, and the readout sums tokens rather than rounded rows. Null
 * when the model has no price row.
 */
export function costUsd(model: string | null, inputTokens: number, outputTokens: number): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
