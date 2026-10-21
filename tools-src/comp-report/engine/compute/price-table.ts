// The price table (§6.5): the home's price at $/sqft steps across the range,
// as in Frankie's email — "$880 – $638K · $900 – $652,500 …". Each row is the
// home's interior size times a step. The steps are the primary sold comps' own
// rates, which include both ends of the range, and round steps between them.
//
// A round step suits the price level: the largest of $5, $10, $20, $25, $50,
// $100 … that's no more than 2.5% of the range's low end — $20 at $880, as
// Frankie steps. It widens until no more than ten steps fall inside the range,
// and narrows until at least two do. The increment is presentation: every row
// is exact arithmetic, and nothing in the table moves a number.
//
// Beside those rows, five evenly spaced ones (NW-065 a): the low and high ends,
// a quarter, the middle and three-quarters of the way between, so Findings has
// a table it can explain in one sentence.

import { roundHalfAway } from '../util/numbers.ts';
import type { Confidence, IsoDate, ReportPropertyType, Sourced } from '../types.ts';
import { weakest } from './facts.ts';
import { dollarsText, figure } from './figure.ts';
import type { Figure, PriceTable, PriceTableFiveRow, PriceTableRow, Result } from './output.ts';

const INCREMENTS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
/** The largest increment no more than this share of the low end, in percent. */
const LEVEL_PERCENT = 2.5;
const MOST_STEPS = 10;
const FEWEST_STEPS = 2;

/** A primary sold comp's $/sqft — adjusted where an adjustment applies, else its own. */
export interface RateEntry {
  id: string;
  label: string;
  value: number;
  own: boolean;
  confidence: Confidence;
}

function stepsInside(low: number, high: number, increment: number): number {
  return Math.max(0, Math.floor(high / increment) - Math.ceil(low / increment) + 1);
}

/** The round increment for a span of $/sqft: one that suits its level, with between two and ten steps inside it where it can. */
export function incrementFor(low: number, high: number): number {
  let i = 0;
  for (let k = 0; k < INCREMENTS.length; k++) if (INCREMENTS[k]! * 100 <= low * LEVEL_PERCENT) i = k;
  while (i < INCREMENTS.length - 1 && stepsInside(low, high, INCREMENTS[i]!) > MOST_STEPS) i++;
  while (i > 0 && stepsInside(low, high, INCREMENTS[i]!) < FEWEST_STEPS) i--;
  return INCREMENTS[i]!;
}

export function priceTable(args: {
  reportType: ReportPropertyType;
  subjectArea: Sourced<number> | null;
  entries: readonly RateEntry[];
  leadFamily: 'unit_rate' | 'adjusted_price';
  range: Result['range'];
  asOf: IsoDate;
}): { table: PriceTable | null; unavailable_because: string | null } {
  const { subjectArea: area, entries, range, asOf } = args;
  const none = (why: string) => ({ table: null, unavailable_because: why });
  if (args.reportType === 'coop') return none("co-op reports don't use $/sqft — square footage is unreliable there (§6.3)");
  if (!area) return none("it needs the home's interior size");
  if (entries.length < 2) return none('it needs at least two primary sold comps with a $/sqft');
  const sorted = [...entries].sort((a, b) => a.value - b.value);
  const lowest = sorted[0]!;
  const highest = sorted[sorted.length - 1]!;
  if (lowest.value === highest.value) return none('the primary sold comps all have the same $/sqft — a range is never a point');

  // The span: the comps' own lowest and highest rates, or an end of the agent's narrowed range.
  const sqft = area.value;
  const ends: { low: number; high: number; lowEnd: Figure | null; highEnd: Figure | null } = { low: lowest.value, high: highest.value, lowEnd: null, highEnd: null };
  if (args.leadFamily === 'unit_rate' && range?.narrowed) {
    if (range.low.value !== roundHalfAway(lowest.value * sqft)) { ends.low = range.low.value / sqft; ends.lowEnd = range.low; }
    if (range.high.value !== roundHalfAway(highest.value * sqft)) { ends.high = range.high.value / sqft; ends.highEnd = range.high; }
  }
  const increment = incrementFor(ends.low, ends.high);
  const priceOf = (rate: number, what: string, confidence: Confidence) =>
    figure(roundHalfAway(rate * sqft), 'usd', weakest(confidence, area.confidence), `the home's ${sqft} sq ft × ${what}`, asOf);

  const rows = new Map<number, PriceTableRow>();
  for (const [end, which] of [[ends.lowEnd, 'low'], [ends.highEnd, 'high']] as const) {
    if (!end) continue;
    const rate = end.value / sqft;
    rows.set(rate, {
      per_sqft: figure(rate, 'usd_per_sqft', end.confidence, `the ${which} end of the agent's narrowed range ÷ the home's ${sqft} sq ft`, asOf),
      price: end, kind: 'range_end', comp_ids: [],
    });
  }
  for (const e of sorted) {
    if (e.value < ends.low || e.value > ends.high) continue;
    const existing = rows.get(e.value);
    if (existing?.kind === 'comp') { existing.comp_ids.push(e.id); continue; }
    if (existing) continue;
    const whose = `${e.label}'s ${e.own ? 'own' : 'adjusted'} $/sqft`;
    rows.set(e.value, { per_sqft: figure(e.value, 'usd_per_sqft', e.confidence, whose, asOf), price: priceOf(e.value, whose, e.confidence), kind: 'comp', comp_ids: [e.id] });
  }
  for (let k = Math.ceil(ends.low / increment); k * increment <= ends.high; k++) {
    const step = k * increment;
    if (rows.has(step)) continue;
    rows.set(step, {
      per_sqft: figure(step, 'usd_per_sqft', 'exact', `a round step of ${dollarsText(increment)}/sq ft`, asOf),
      price: priceOf(step, `${dollarsText(step)}/sq ft`, 'exact'),
      kind: 'step', comp_ids: [],
    });
  }
  const ordered = [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
  for (const row of ordered) row.comp_ids.sort();
  const span = (rate: number, end: Figure | null, which: 'lowest' | 'highest', comp: RateEntry) => end
    ? figure(rate, 'usd_per_sqft', end.confidence, `the ${which === 'lowest' ? 'low' : 'high'} end of the agent's narrowed range ÷ the home's ${sqft} sq ft`, asOf)
    : figure(rate, 'usd_per_sqft', comp.confidence, `the ${which} $/sqft among ${entries.length} primary sold comps: ${comp.label}`, asOf);
  const low = span(ends.low, ends.lowEnd, 'lowest', lowest);
  const high = span(ends.high, ends.highEnd, 'highest', highest);

  // The five-row table (NW-065 a): the ends are the range's own, exactly; the three rows between are
  // evenly spaced rates, each to the whole dollar, times the home's size.
  const rangeEnd = (end: Figure | null, rate: number, which: 'low' | 'high') => {
    if (end) return end;
    const own = range && args.leadFamily === 'unit_rate' ? range[which] : null;
    return own && own.value === roundHalfAway(rate * sqft) ? own : null;
  };
  const endRow = (step: 'low' | 'high', rate: Figure, end: Figure | null, comp: RateEntry): PriceTableFiveRow => ({
    step, per_sqft: rate,
    price: rangeEnd(end, rate.value, step) ?? priceOf(rate.value, `${comp.label}'s ${comp.own ? 'own' : 'adjusted'} $/sqft`, comp.confidence),
    comp_ids: end ? [] : sorted.filter((e) => e.value === comp.value).map((e) => e.id).sort(),
  });
  const between = ([['quarter', 1, 'a quarter'], ['middle', 2, 'halfway'], ['three_quarter', 3, 'three-quarters of the way']] as const).map(([step, quarters, words]): PriceTableFiveRow => {
    const rate = roundHalfAway(ends.low + (quarters / 4) * (ends.high - ends.low));
    const confidence = weakest(low.confidence, high.confidence);
    return {
      step,
      per_sqft: figure(rate, 'usd_per_sqft', confidence, `${words} from the lowest $/sqft to the highest, to the whole dollar`, asOf),
      price: priceOf(rate, `${dollarsText(rate)}/sq ft`, confidence),
      comp_ids: [],
    };
  });
  const fiveRows = [endRow('low', low, ends.lowEnd, lowest), ...between, endRow('high', high, ends.highEnd, highest)];

  return {
    table: {
      rows: ordered,
      five_rows: fiveRows,
      increment,
      low,
      high,
      subject_area: area,
      basis: `The home's ${sqft} sq ft × each step: the ${entries.length} primary sold comps' own $/sqft, and round steps of ${dollarsText(increment)} between the lowest and the highest${args.leadFamily === 'adjusted_price' ? '. The range leads with adjusted prices, so the table spans the same comps\' $/sqft instead' : ''}${ends.lowEnd || ends.highEnd ? ", inside the agent's narrowed range" : ''}.`,
    },
    unavailable_because: null,
  };
}
