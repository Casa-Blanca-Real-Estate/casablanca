// What the comps say, in words (`02-screens.md`, Findings): the tool's neutral
// one-sentence reading, and the agent's number against it — the teaching moment
// (§8.4). Every figure comes from the engine's output; this only words them. The
// agent's own headline is written on Send.
import type { CompOut, EngineOutput, PriceEvaluation, Result, ResultKind } from '../engine/index.ts';
import { clientPrice, countWord, psf } from './format.ts';

/** The result the one sentence reads: "on the facts" when it has a range, else "with estimates". */
export function answerResult(output: EngineOutput): ResultKind {
  return output.results.on_facts.range ? 'on_facts' : 'with_estimates';
}

/** True when the agent's estimates change the answer, so both results show side by side. */
export function estimatesChangeTheAnswer(output: EngineOutput): boolean {
  const on = output.results.on_facts.range;
  const est = output.results.with_estimates.range;
  if (Boolean(on) !== Boolean(est)) return true;
  return !output.divergence.same;
}

/** The unit rates the range rests on: each range comp's adjusted $/sq ft, lowest to highest. */
function rangeRates(r: Result, comps: CompOut[]): { low: number; high: number } | null {
  if (!r.range) return null;
  const byId = new Map(comps.map((c) => [c.id, c]));
  const rates: number[] = [];
  for (const id of r.range.comp_ids) {
    const pr = byId.get(id)?.per_result[r.kind];
    const rate = pr?.adjusted_price_per_sqft?.value ?? pr?.price_per_sqft?.value;
    if (rate === undefined || rate === null) return null; // an adjusted-price range: no unit rates to quote
    rates.push(rate);
  }
  return rates.length ? { low: Math.min(...rates), high: Math.max(...rates) } : null;
}

/**
 * The neutral reading, e.g. "The three closest sales put 17L at $2,112–$2,457 a
 * sq ft — about $4.65M–$5.41M." "Closest" because they're the sales the agent
 * counted as primary: the comps most like the home.
 */
export function neutralReading(output: EngineOutput, kind: ResultKind, homeName: string): string {
  const r = output.results[kind];
  if (!r.range) return `The comps don’t give a range yet: ${r.range_unavailable_because ?? 'the analysis needs more to go on.'}`;
  const n = r.range.comp_ids.length;
  const who = n === 1 ? 'The closest sale puts' : `The ${countWord(n)} closest sales put`;
  const home = homeName || 'the home';
  const low = r.range.low.value;
  const high = r.range.high.value;
  const prices = low === high ? `about ${clientPrice(low)}` : `about ${clientPrice(low)}–${clientPrice(high)}`;
  const rates = rangeRates(r, output.comps);
  if (!rates) return `${who} ${home} at ${prices}.`;
  const perFoot = rates.low === rates.high ? `${psf(rates.low)} a sq ft` : `${psf(rates.low)}–${psf(rates.high)} a sq ft`;
  return `${who} ${home} at ${perFoot} — ${prices}.`;
}

type Position = 'below' | 'within' | 'above';

/**
 * The agent's number against the range: "Your $3.4M–$4.2M sits below what the
 * sales support." Null when there's no number (skipped) or no range to compare.
 */
export function numberAgainstIt(output: EngineOutput, kind: ResultKind): string | null {
  const low = output.prices.find((p) => p.id === 'call_low');
  const high = output.prices.find((p) => p.id === 'call_high');
  if (!low || !high) return null;
  const pos = (p: PriceEvaluation): Position | null => p.per_result[kind].vs_range?.position ?? null;
  const a = pos(low);
  const b = pos(high);
  if (!a || !b) return null;
  const yours = `Your ${clientPrice(low.price)}–${clientPrice(high.price)}`;
  if (a === b) return `${yours} sits ${a === 'within' ? 'inside' : a} what the sales support.`;
  if (a === 'below' && b === 'within') return `${yours} starts below what the sales support and ends inside it.`;
  if (a === 'within' && b === 'above') return `${yours} starts inside what the sales support and runs above it.`;
  return `${yours} is wider than what the sales support, on both sides.`;
}

/** "17L" from "#17L", else the street: how the sentence names the home. */
export function homeName(unit: string | null | undefined, street: string | null | undefined): string {
  const u = unit?.trim().replace(/^#/, '');
  return u || street?.trim() || 'the home';
}
