// How the walkthrough shows the engine's figures. Presentation only: the
// engine returns exact values, and every rounding here happens on the way to
// the screen (§6.1).
import type { EstimateUse } from '../engine/index.ts';

/** Whole dollars: $4,650,000. */
export function usd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const whole = Math.round(value);
  return `${whole < 0 ? '−' : ''}$${Math.abs(whole).toLocaleString('en-US')}`;
}

/** $/sqft, truncated to whole dollars as StreetEasy shows it — rounding would put figures $1 off (§6.1). */
export function psf(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `$${Math.trunc(value).toLocaleString('en-US')}`;
}

/** Percent in percent (−3.02 means −3.02%), to one decimal, signed. */
export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const r = Math.round(value * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)}%`;
}

/** A price for clients, to three significant figures: $4.23M, $950K (§6.1). */
export function clientPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return '—';
  const three = Number(value.toPrecision(3));
  if (three >= 1_000_000) return `$${Number((three / 1_000_000).toPrecision(3))}M`;
  if (three >= 1_000) return `$${Number((three / 1_000).toPrecision(3))}K`;
  return `$${three}`;
}

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** A small count as a sentence says it: "the two closest sales". */
export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** A sale against its last ask, in words: "3.5% below its last ask", "at its last ask". */
export function againstAsk(percent: number, whose = 'its'): string {
  const r = Math.round(percent * 10) / 10;
  const ask = `${whose ? `${whose} ` : ''}last ask`;
  if (r === 0) return `at ${ask}`;
  return `${Math.abs(r).toFixed(1)}% ${r < 0 ? 'below' : 'above'} ${ask}`;
}

/** A range, low to high. */
export function usdRange(low: number | null | undefined, high: number | null | undefined, format = usd): string {
  return `${format(low)} – ${format(high)}`;
}

/** Square feet: 2,201 sq ft, with ~ when approximate at its source. */
export function sqft(value: number | null | undefined, approx = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${approx ? '~' : ''}${Math.round(value).toLocaleString('en-US')} sq ft`;
}

/** 2026-08-27 → Aug 27, 2026. Dates without a clock: no time zone can shift the day. */
export function isoDay(date: string | null | undefined): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return '—';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number) as [number, number, number];
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `${month} ${d}, ${y}`;
}

export const EVIDENCE_LABEL = { sold: 'Sold', in_contract: 'In contract', active: 'Active' } as const;
export const TIER_LABEL = { primary: 'Primary', secondary: 'Secondary', excluded: 'Excluded' } as const;

/** The subject facts the walkthrough collects, in words. */
const FACT_WORDS: Record<string, string> = {
  area_sqft: 'interior size',
  beds: 'bedroom count',
  baths: 'bathroom count',
  floor: 'floor',
  common_charges_monthly: 'common charges',
  taxes_monthly: 'taxes',
  central_air: 'central air',
  dishwasher: 'dishwasher',
  fireplace: 'fireplace',
  laundry: 'laundry',
  outdoor_private: 'outdoor space',
  outdoor_kinds: 'outdoor space',
  outdoor_area_sqft: 'outdoor space’s size',
  views: 'views',
};

/**
 * One estimate a result used, in words: "The home’s interior size is our
 * estimate." The engine names the field; the writer (CR-5) and D-3 settle the
 * client wording. Anything the walkthrough can't word falls back to the engine's note.
 */
export function estimateWords(e: EstimateUse): string {
  if (e.kind === 'stated_fact' && e.target === 'subject' && FACT_WORDS[e.what]) return `The home’s ${FACT_WORDS[e.what]} is our estimate.`;
  return e.note;
}
