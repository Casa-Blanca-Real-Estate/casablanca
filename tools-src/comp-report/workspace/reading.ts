// What the comps say, in words (`02-screens.md`, Findings): the tool's neutral
// one-sentence reading, and the agent's number against it — the teaching moment
// (§8.4). Both read the engine's headline facts (§10.2), the only figures a
// headline may cite: the reading from `facts`, the agent's number from
// `agent_number`, which only Findings shows. This only words them. The agent's
// own headline is written on Send.
import type { AgentNumberPosition, EngineOutput, HeadlineFact, HeadlineFacts, ResultKind } from '../engine/index.ts';
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

/** One headline fact, by its id ("range.low", "anchor.per_sqft"), or null. */
export function fact(h: HeadlineFacts, id: string): HeadlineFact | null {
  return h.facts.find((f) => f.id === id) ?? null;
}

/**
 * The reading from the headline facts alone, e.g. "The three closest sales put
 * 17L at $2,112–$2,457 a sq ft — about $4.23M–$4.92M." "Closest" because
 * they're the sales the agent counted as primary: the comps most like the home.
 * Null without a range.
 */
export function readingFromFacts(h: HeadlineFacts, homeName: string): string | null {
  const low = fact(h, 'range.low');
  const high = fact(h, 'range.high');
  const n = fact(h, 'range.comps');
  if (!low || !high || !n) return null;
  const who = n.value === 1 ? 'The closest sale puts' : `The ${countWord(n.value)} closest sales put`;
  const home = homeName || 'the home';
  const prices = low.value === high.value ? `about ${clientPrice(low.value)}` : `about ${clientPrice(low.value)}–${clientPrice(high.value)}`;
  const lowRate = fact(h, 'range.low_per_sqft');
  const highRate = fact(h, 'range.high_per_sqft');
  if (!lowRate || !highRate) return `${who} ${home} at ${prices}.`;
  const perFoot = psf(lowRate.value) === psf(highRate.value) ? `${psf(lowRate.value)} a sq ft` : `${psf(lowRate.value)}–${psf(highRate.value)} a sq ft`;
  return `${who} ${home} at ${perFoot} — ${prices}.`;
}

/** The neutral reading for a result, or why there's none yet. */
export function neutralReading(output: EngineOutput, kind: ResultKind, homeName: string): string {
  return readingFromFacts(output.headline_facts[kind], homeName)
    ?? `The comps don’t give a range yet: ${output.results[kind].range_unavailable_because ?? 'the analysis needs more to go on.'}`;
}

const POSITION_WORDS: Record<AgentNumberPosition, string> = {
  below: 'sits below what the sales support',
  within: 'sits inside what the sales support',
  above: 'sits above what the sales support',
  overlaps_low: 'starts below what the sales support and ends inside it',
  overlaps_high: 'starts inside what the sales support and runs above it',
  spans: 'is wider than what the sales support, on both sides',
};

/**
 * The agent's number against the range, from the engine's `agent_number`:
 * "Your $3.4M–$4.2M sits below what the sales support, by about $25.4K." Only
 * Findings says it; no draft headline uses it. Null when there's no number
 * (skipped) or no range to compare.
 */
export function numberAgainstIt(output: EngineOutput, kind: ResultKind): string | null {
  const a = output.headline_facts[kind].agent_number;
  if (!a?.position) return null;
  const low = a.facts.find((f) => f.id === 'agent.low');
  const high = a.facts.find((f) => f.id === 'agent.high');
  if (!low || !high) return null;
  const yours = low.value === high.value ? `Your ${clientPrice(low.value)}` : `Your ${clientPrice(low.value)}–${clientPrice(high.value)}`;
  const gap = a.facts.find((f) => f.id === 'agent.below_range_by' || f.id === 'agent.above_range_by');
  return `${yours} ${POSITION_WORDS[a.position]}${gap ? `, by about ${clientPrice(gap.value)}` : ''}.`;
}

/** "17L" from "#17L", else the street: how the sentence names the home. */
export function homeName(unit: string | null | undefined, street: string | null | undefined): string {
  const u = unit?.trim().replace(/^#/, '');
  return u || street?.trim() || 'the home';
}
