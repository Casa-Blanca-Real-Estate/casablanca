// The headline's facts (§10.2): the only figures a headline may cite, per
// result. The report builds to one sentence — "The three closest sales put
// #517 at $880–$925 a square foot — about $640K–$670K." — and QA's numeric
// grounding (CR-5) checks every number in it against this set. So each fact is
// one number with a stable id, its unit and its provenance. The names a
// headline may use sit beside them, so a "#517" or a "200 Chambers" isn't taken
// for a figure. The agent's own number is kept apart: the assistant never sees
// it while it helps with the neutral valuation (§8.4).
//
// Display rounding is presentation (§6.1): a fact holds the exact value, and a
// headline shows $/sqft truncated and prices rounded — "about $640K".

import { EVIDENCE_CLASSES, type EvidenceClass, type IsoDate, type NamedPrice, type PropertyFacts, type PropertyIdentity, type ReportPropertyType, type Sourced } from '../types.ts';
import { weakest } from './facts.ts';
import { dollarsText } from './figure.ts';
import type { AgentNumberPosition, CompOut, Figure, HeadlineFact, HeadlineFacts, Result, ResultKind } from './output.ts';

const STATUS_WORDS: Record<EvidenceClass, { name: string; price: string }> = {
  sold: { name: 'the sales', price: 'sale price' },
  in_contract: { name: 'the in-contract listings', price: 'last ask' },
  active: { name: 'the active listings', price: 'ask' },
  off_market: { name: "the listings that didn't sell", price: 'last ask' },
};

export interface HeadlineContext {
  kind: ResultKind;
  asOf: IsoDate;
  reportType: ReportPropertyType;
  subject: { identity: PropertyIdentity; facts: Partial<PropertyFacts> };
  comps: readonly CompOut[];
  prices: readonly NamedPrice[];
}

function fromFigure(id: string, label: string, f: Figure, compIds: readonly string[]): HeadlineFact {
  return { id, label, value: f.value, unit: f.unit, source: f.source, as_of: f.as_of, confidence: f.confidence, derivation: f.derivation, comp_ids: [...compIds] };
}

function count(id: string, label: string, value: number, derivation: string, compIds: readonly string[], asOf: IsoDate): HeadlineFact {
  return { id, label, value, unit: 'count', source: 'engine', as_of: asOf, confidence: 'exact', derivation, comp_ids: [...compIds] };
}

export function headlineFacts(result: Result, ctx: HeadlineContext): HeadlineFacts {
  const { kind, asOf } = ctx;
  const facts: HeadlineFact[] = [];
  const missing: string[] = [];
  const byId = new Map(ctx.comps.map((c) => [c.id, c]));
  const rate = (id: string) => byId.get(id)?.per_result[kind].adjusted_price_per_sqft ?? null;
  const area = ctx.subject.facts.area_sqft as Sourced<number> | undefined;
  const unitRates = ctx.reportType === 'condo';

  // The range, as a price and as $/sqft.
  const range = result.range;
  if (range) {
    const bracket = result.bracket!;
    const unitRateLead = result.lead.indicator.startsWith('unit_rate');
    for (const end of ['low', 'high'] as const) {
      const f = range[end];
      const narrowed = range.narrowed && f.value !== bracket[end].value;
      // The comp at this end of the bracket: the lowest or highest $/sqft (unit-rate lead) or price.
      const atEnd = narrowed ? null : range.comp_ids.find((id) => {
        const pr = byId.get(id)?.per_result[kind];
        return (unitRateLead ? pr?.implied_value?.value : pr?.adjusted_price?.value) === f.value;
      }) ?? null;
      facts.push(fromFigure(`range.${end}`, `the ${end} end of the range, as a price`, f, atEnd ? [atEnd] : []));
      if (!unitRates) continue;
      if (unitRateLead && narrowed && area) {
        facts.push({
          id: `range.${end}_per_sqft`, label: `the ${end} end of the range, in $/sqft`, value: f.value / area.value, unit: 'usd_per_sqft',
          source: 'engine', as_of: asOf, confidence: weakest(f.confidence, area.confidence),
          derivation: `the agent's narrowed ${end} end ÷ the home's ${area.value} sq ft`, comp_ids: [],
        });
      } else if (unitRateLead && atEnd && rate(atEnd)) {
        facts.push(fromFigure(`range.${end}_per_sqft`, `the ${end} end of the range, in $/sqft`, rate(atEnd)!, [atEnd]));
      }
    }
    if (unitRates && !unitRateLead) {
      // A range led by adjusted prices: the same comps' $/sqft span, said as that.
      const sold = result.evidence.sold.price_per_sqft;
      if (sold) {
        facts.push(fromFigure('range.low_per_sqft', "the lowest $/sqft among the primary sold comps (the range leads with prices)", sold.min, sold.comp_ids));
        facts.push(fromFigure('range.high_per_sqft', "the highest $/sqft among the primary sold comps (the range leads with prices)", sold.max, sold.comp_ids));
      }
    }
    facts.push(count('range.comps', 'the sales the range spans', range.comp_ids.length, `primary sold comps with an implied value for the home`, range.comp_ids, asOf));
  } else {
    missing.push(`no range: ${result.range_unavailable_because ?? 'nothing to make one from'}`);
  }

  // The base.
  if (result.base) {
    const lead = result.indicators[result.lead.indicator.split('.')[0] as 'unit_rate' | 'adjusted_price'][result.lead.indicator.split('.')[1] as 'median' | 'mean' | 'anchor'];
    facts.push(fromFigure('base', `the base: ${result.lead.label.charAt(0).toLowerCase()}${result.lead.label.slice(1)}`, result.base, lead.comp_ids));
    if (lead.per_sqft) facts.push(fromFigure('base.per_sqft', 'the base, in $/sqft', lead.per_sqft, lead.comp_ids));
  } else {
    missing.push('no base: the lead indicator gives no value for the home');
  }

  // How many primary sales there are.
  const soldIds = result.evidence.sold.price?.comp_ids ?? [];
  facts.push(count('sold.count', 'primary sales in the numbers', result.evidence.sold.counts.included, 'primary sold comps in this result', soldIds, asOf));

  // The closest comp, the anchor, when the agent has marked one.
  const anchor = ctx.comps.find((c) => c.anchor && c.evidence_class === 'sold' && c.per_result[kind].included) ?? null;
  if (anchor) {
    const pr = anchor.per_result[kind];
    if (pr.price) {
      facts.push({
        id: 'anchor.price', label: "the closest comp's sale price", value: pr.price.value, unit: 'usd', source: pr.price.source, as_of: pr.price.as_of,
        confidence: pr.price.confidence, derivation: `the sale price of the closest comp, as the agent marked it`, comp_ids: [anchor.id],
      });
    }
    if (pr.price_per_sqft) facts.push(fromFigure('anchor.per_sqft', "the closest comp's $/sqft", pr.price_per_sqft, [anchor.id]));
    if (pr.implied_value) facts.push(fromFigure('anchor.implied', "the home at the closest comp's $/sqft", pr.implied_value, [anchor.id]));
  } else {
    missing.push('no closest comp: the agent marks one sold primary comp as the anchor');
  }

  // A summary by status: never mixed.
  for (const cls of EVIDENCE_CLASSES) {
    const e = result.evidence[cls];
    if (e.counts.included === 0) continue;
    const words = STATUS_WORDS[cls];
    const ids = e.price?.comp_ids ?? [];
    if (cls !== 'sold') facts.push(count(`${cls}.count`, `${words.name} in the numbers`, e.counts.included, `primary ${cls.replace('_', ' ')} comps in this result`, ids, asOf));
    if (e.price_per_sqft) facts.push(fromFigure(`${cls}.median_per_sqft`, `the median $/sqft of ${words.name} (${e.basis} basis)`, e.price_per_sqft.median, e.price_per_sqft.comp_ids));
    if (e.price) facts.push(fromFigure(`${cls}.median_price`, `the median ${words.price} of ${words.name}`, e.price.median, e.price.comp_ids));
    if (cls === 'sold' && result.sale_to_ask) {
      facts.push(fromFigure('sold.median_sale_to_ask', 'the median sale against last ask, in percent', result.sale_to_ask.median, result.sale_to_ask.comp_ids));
    }
    if (cls !== 'sold') {
      const vs = result.asks_vs_sold.class_medians[cls];
      if (vs) facts.push(fromFigure(`${cls}.vs_sold_median`, `the median $/sqft of ${words.name} against the sold median, in percent`, vs.versus_sold_median_percent, e.price_per_sqft?.comp_ids ?? ids));
    }
    if (cls === 'off_market') {
      const ceiling = result.asks_vs_sold.ceiling;
      if (ceiling) facts.push(fromFigure('off_market.lowest_per_sqft', "the lowest ask that didn't sell, in $/sqft — a ceiling signal", ceiling.lowest, [ceiling.comp_id]));
      if (e.price) facts.push(fromFigure('off_market.lowest_price', "the lowest ask that didn't sell", e.price.min, e.price.comp_ids));
    }
    const dom = result.days_on_market[cls];
    if (dom) facts.push(fromFigure(`${cls}.median_days_on_market`, `the median days on market of ${words.name}`, dom.median, dom.comp_ids));
  }

  // The home itself.
  if (area) {
    facts.push({
      id: 'home.area_sqft', label: "the home's interior size", value: area.value, unit: 'sqft', source: area.source, as_of: area.as_of,
      confidence: area.confidence, derivation: "the home's interior size, as the result uses it", comp_ids: [],
    });
  }
  const ask = ctx.subject.facts.list_price as Sourced<number> | undefined;
  if (ask) {
    facts.push({
      id: 'home.ask', label: "the home's asking price", value: ask.value, unit: 'usd', source: ask.source, as_of: ask.as_of,
      confidence: ask.confidence, derivation: "the home's asking price, as the result uses it", comp_ids: [],
    });
  }

  // The agent's own number, kept apart (§8.4).
  const calls = ctx.prices.filter((p) => p.kind === 'call').map((p) => p.price).sort((a, b) => a - b);
  let agentNumber: HeadlineFacts['agent_number'] = null;
  if (calls.length > 0) {
    const low = calls[0]!;
    const high = calls[calls.length - 1]!;
    const own = (id: string, label: string, value: number): HeadlineFact => ({
      id, label, value, unit: 'usd', source: 'agent', as_of: asOf, confidence: 'exact', derivation: "the agent's own number, given before the reveal", comp_ids: [],
    });
    const agentFacts = [own('agent.low', "the low end of the agent's number", low), own('agent.high', "the high end of the agent's number", high)];
    let position: AgentNumberPosition | null = null;
    if (range) {
      const lo = range.low.value;
      const hi = range.high.value;
      position = high < lo ? 'below' : low > hi ? 'above' : low >= lo && high <= hi ? 'within' : low < lo && high > hi ? 'spans' : low < lo ? 'overlaps_low' : 'overlaps_high';
      const gap = position === 'below' ? { value: lo - high, what: `the range's low end (${dollarsText(lo)}) less the agent's high end` }
        : position === 'above' ? { value: low - hi, what: `the agent's low end less the range's high end (${dollarsText(hi)})` } : null;
      if (gap) {
        agentFacts.push({
          id: position === 'below' ? 'agent.below_range_by' : 'agent.above_range_by',
          label: `how far the agent's number sits ${position} the range`, value: gap.value, unit: 'usd', source: 'engine', as_of: asOf,
          confidence: position === 'below' ? range.low.confidence : range.high.confidence, derivation: gap.what, comp_ids: [],
        });
      }
    }
    agentNumber = { position, facts: agentFacts };
  }

  // Names: the home, and every comp a fact rests on.
  const named = new Set(facts.flatMap((f) => f.comp_ids));
  const names: HeadlineFacts['names'] = [
    { id: 'subject', address: ctx.subject.identity.address.street, unit: ctx.subject.identity.unit.raw },
    ...ctx.comps.filter((c) => named.has(c.id)).map((c) => ({ id: c.id, address: c.identity.address.street, unit: c.identity.unit.raw })),
  ];
  return { kind, facts, agent_number: agentNumber, names, missing };
}
