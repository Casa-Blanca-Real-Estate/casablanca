// One result — "on the facts" or "with estimates" (§6.4): the evidence by
// class, the indicators and the subject values they imply (§6.3), the lead
// and base, the range (§6.5), the bridge, and the market signals.
//
// Sold, in-contract and active comps never share a statistic. Only primary
// sold comps make the base and the range; in-contract and active asks are
// context, shown against the sold band.

import { FACTOR_BY_ID } from '../catalog/factors.ts';
import { INTERACTIONS } from '../catalog/interactions.ts';
import { maxOf, mean, median, minOf, roundHalfAway } from '../util/numbers.ts';
import type {
  CompInput, Confidence, EvidenceClass, IsoDate, LeadIndicator, MethodSettings, PropertyFacts,
  ReportPropertyType, Sourced,
} from '../types.ts';
import { interactionFindings, NOT_DETERMINED, resolveLines, type RawLine } from './adjust.ts';
import { monthlyCarry } from './compare.ts';
import { weakest } from './facts.ts';
import type {
  Bridge, BridgeLine, CarrySummary, ClassSummary, ComparisonOut, EstimateUse, Figure, FigureUnit,
  Indicator, IndicatorFamily, RangeOut, Result, ResultKind, StatSummary, Warning,
} from './output.ts';

export interface CompState {
  input: CompInput;
  id: string;
  evidence_class: EvidenceClass | null;
  facts: Partial<PropertyFacts>;
  included: boolean;
  not_included_because: string[];
  price: Sourced<number> | null;
  area: Sourced<number> | null;
  unit_rate: number | null;
  unit_rate_confidence: Confidence | null;
  no_unit_rate_because: string | null;
  comparisons: ComparisonOut[];
  lines: RawLine[];
}

export interface ResultContext {
  kind: ResultKind;
  asOf: IsoDate;
  reportType: ReportPropertyType;
  method: MethodSettings;
  subjectFacts: Partial<PropertyFacts>;
  estimates: EstimateUse[];
  /** Evidence classes whose membership the agent's estimates changed ("with estimates" only). */
  estimateAffected?: ReadonlySet<EvidenceClass>;
}

export const LABELS: Record<LeadIndicator, string> = {
  'unit_rate.median': 'Median $/sqft of the primary sold comps',
  'unit_rate.mean': 'Mean $/sqft of the primary sold comps',
  'unit_rate.anchor': "The anchor comp's $/sqft",
  'adjusted_price.median': 'Median adjusted price of the primary sold comps',
  'adjusted_price.mean': 'Mean adjusted price of the primary sold comps',
  'adjusted_price.anchor': "The anchor comp's adjusted price",
};

export function figure(value: number, unit: FigureUnit, confidence: Confidence, derivation: string, asOf: IsoDate): Figure {
  return { value, unit, source: 'engine', as_of: asOf, confidence, derivation };
}

/**
 * Median, mean, lowest and highest. `floor` weakens every figure's confidence —
 * for a set whose membership rests on an estimate.
 */
export function statSummary(
  entries: { id: string; value: number; confidence: Confidence }[], unit: FigureUnit, what: string, asOf: IsoDate, money = false,
  floor: Confidence | null = null,
): StatSummary | null {
  if (entries.length === 0) return null;
  const values = entries.map((e) => e.value);
  const conf = weakest(floor, ...entries.map((e) => e.confidence));
  const r = (x: number) => (money ? roundHalfAway(x) : x);
  const ids = entries.map((e) => e.id);
  const byValue = (target: number) => entries.find((e) => e.value === target)!;
  const lo = minOf(values)!;
  const hi = maxOf(values)!;
  return {
    n: entries.length,
    comp_ids: ids,
    median: figure(r(median(values)!), unit, conf, `median ${what} of ${entries.length} comp${entries.length === 1 ? '' : 's'}`, asOf),
    mean: figure(r(mean(values)!), unit, conf, `mean ${what} of ${entries.length} comp${entries.length === 1 ? '' : 's'}`, asOf),
    min: figure(lo, unit, weakest(floor, byValue(lo).confidence), `lowest ${what} (${byValue(lo).id})`, asOf),
    max: figure(hi, unit, weakest(floor, byValue(hi).confidence), `highest ${what} (${byValue(hi).id})`, asOf),
  };
}

// ─── Indicator families ──────────────────────────────────────────────────────

interface Entry {
  id: string;
  /** Adjusted $/sqft (unit-rate family) or adjusted price. */
  value: number;
  /** The subject value it implies — whole dollars — or null without the subject's area. */
  implied: number | null;
  /** How sure the value is: its price, its area, and what its applied adjustments rest on. */
  confidence: Confidence;
  /** How sure the implied value is: the above, and the subject's area. */
  implied_confidence: Confidence;
}

type Family = 'unit_rate' | 'adjusted_price';

/** How sure a comp's applied adjustments are — the weakest of what each applied line rests on. */
export function adjustmentConfidence(lines: readonly RawLine[], family: Family, excluded: ReadonlySet<string> = new Set()): Confidence {
  const r = resolveLines(lines, excluded);
  const applied = lines.filter((l) => l.dollars !== null && !excluded.has(l.line) && r.applied.get(l.line)?.applied &&
    (family === 'adjusted_price' || l.applies_to_unit_rate));
  return weakest(...applied.map((l) => l.confidence));
}

/** Primary sold comps' adjusted values in one family. One adjusted to zero or below can't indicate a price, so it's left out. */
function familyEntries(
  states: readonly CompState[], family: Family, subjectArea: Sourced<number> | null, excluded: ReadonlySet<string>,
): Entry[] {
  const entries: Entry[] = [];
  for (const s of states) {
    if (!s.included || s.evidence_class !== 'sold' || !s.price) continue;
    const r = resolveLines(s.lines, excluded);
    const adjConf = adjustmentConfidence(s.lines, family, excluded);
    if (family === 'unit_rate') {
      if (s.unit_rate === null || !s.area) continue;
      const value = (s.price.value + r.forUnitRate) / s.area.value;
      if (value <= 0) continue;
      const confidence = weakest(s.price.confidence, s.area.confidence, adjConf);
      entries.push({
        id: s.id, value,
        implied: subjectArea ? roundHalfAway(value * subjectArea.value) : null,
        confidence,
        implied_confidence: weakest(confidence, subjectArea?.confidence),
      });
    } else {
      const value = s.price.value + r.forPrice;
      if (value <= 0) continue;
      const confidence = weakest(s.price.confidence, adjConf);
      entries.push({ id: s.id, value, implied: value, confidence, implied_confidence: confidence });
    }
  }
  return entries;
}

function indicatorValue(entries: readonly Entry[], which: 'median' | 'mean' | 'anchor', anchorId: string | null): number | null {
  if (which === 'anchor') {
    const a = entries.find((e) => e.id === anchorId);
    return a ? a.value : null;
  }
  const values = entries.map((e) => e.value);
  return which === 'median' ? median(values) : mean(values);
}

function impliedFrom(family: Family, value: number | null, subjectArea: Sourced<number> | null): number | null {
  if (value === null) return null;
  if (family === 'adjusted_price') return roundHalfAway(value);
  return subjectArea ? roundHalfAway(value * subjectArea.value) : null;
}

// ─── The result ──────────────────────────────────────────────────────────────

export function buildResult(states: readonly CompState[], ctx: ResultContext, warnings: Warning[]): Result {
  const { kind, asOf } = ctx;
  const floorFor = (cls: EvidenceClass): Confidence | null => (ctx.estimateAffected?.has(cls) ? 'guesstimate' : null);
  const soldFloor = floorFor('sold');
  const subjectArea = (ctx.subjectFacts.area_sqft as Sourced<number> | undefined) ?? null;
  const unitRateOn = ctx.reportType === 'condo';
  const anchorState = states.find((s) => s.input.anchor) ?? null;
  const anchorId = anchorState && anchorState.included && anchorState.evidence_class === 'sold' ? anchorState.id : null;
  const anchorWhyNot = !anchorState ? 'no comp is marked as the anchor'
    : anchorState.evidence_class !== 'sold' ? `the anchor (${anchorState.id}) isn't a sold comp`
      : !anchorState.included ? `the anchor (${anchorState.id}) isn't a primary comp in this result`
        : null;

  // Evidence classes, never mixed.
  const evidence = {} as Record<EvidenceClass, ClassSummary>;
  for (const cls of ['sold', 'in_contract', 'active'] as const) {
    const inClass = states.filter((s) => s.evidence_class === cls);
    const included = inClass.filter((s) => s.included);
    const basis = cls === 'sold' ? 'sale' : 'ask';
    const withRate = included.filter((s) => s.unit_rate !== null);
    evidence[cls] = {
      evidence_class: cls,
      basis,
      counts: {
        total: inClass.length,
        primary: inClass.filter((s) => s.input.tier === 'primary').length,
        secondary: inClass.filter((s) => s.input.tier === 'secondary').length,
        excluded: inClass.filter((s) => s.input.tier === 'excluded').length,
        included: included.length,
        with_unit_rate: withRate.length,
      },
      price_per_sqft: statSummary(withRate.map((s) => ({ id: s.id, value: s.unit_rate!, confidence: s.unit_rate_confidence! })), 'usd_per_sqft', `$/sqft (${basis} basis)`, asOf, false, floorFor(cls)),
      price: statSummary(included.filter((s) => s.price).map((s) => ({ id: s.id, value: s.price!.value, confidence: s.price!.confidence })), 'usd', `${basis === 'sale' ? 'sale' : 'asking'} price`, asOf, true, floorFor(cls)),
    };
  }

  // Indicator families over primary sold comps.
  const allLineIds = new Set<string>();
  for (const s of states) if (s.included && s.evidence_class === 'sold') for (const l of s.lines) if (l.dollars !== null) allLineIds.add(l.line);
  const none = new Set<string>();

  const buildFamily = (family: Family): IndicatorFamily => {
    const off = family === 'unit_rate' && !unitRateOn;
    const entries = off ? [] : familyEntries(states, family, subjectArea, none);
    const make = (which: 'median' | 'mean' | 'anchor'): Indicator => {
      const id = `${family}.${which}` as LeadIndicator;
      const base: Indicator = { id, label: LABELS[id], status: 'unavailable', reason: null, per_sqft: null, implied_value: null, n: 0, comp_ids: [] };
      if (off) return { ...base, reason: 'unit-rate indicators are off for co-ops — square footage is unreliable there' };
      const used = which === 'anchor' ? entries.filter((e) => e.id === anchorId) : entries;
      if (which === 'anchor' && anchorWhyNot) return { ...base, reason: anchorWhyNot };
      if (used.length === 0) {
        const anchorLacks = !anchorState?.price ? 'the anchor has no sale price' : "the anchor has no interior area, so no $/sqft";
        return {
          ...base,
          reason: which === 'anchor' ? anchorLacks
            : family === 'unit_rate' ? 'no primary sold comp has both a price and an area' : 'no primary sold comp has a price',
        };
      }
      const value = indicatorValue(used, which, anchorId)!;
      const conf = weakest(soldFloor, ...used.map((e) => e.confidence));
      const what = which === 'anchor' ? `the anchor, ${anchorId}` : `${which} of ${used.length} primary sold comp${used.length === 1 ? '' : 's'}`;
      const implied = impliedFrom(family, value, subjectArea);
      return {
        ...base,
        status: 'ok',
        reason: family === 'unit_rate' && implied === null ? "no implied value without the subject's interior area" : null,
        per_sqft: family === 'unit_rate' ? figure(value, 'usd_per_sqft', conf, `adjusted $/sqft, ${what}`, asOf) : null,
        implied_value: implied === null ? null : figure(implied, 'usd', family === 'unit_rate' ? weakest(conf, subjectArea?.confidence) : conf,
          family === 'unit_rate' ? `${what}: adjusted $/sqft × subject's ${subjectArea!.value} sqft` : `${what}: adjusted price`, asOf),
        n: used.length,
        comp_ids: used.map((e) => e.id),
      };
    };
    return { status: off ? 'off' : 'on', reason: off ? 'co-ops have no reliable square footage (§6.3)' : null, median: make('median'), mean: make('mean'), anchor: make('anchor') };
  };
  const indicators = { unit_rate: buildFamily('unit_rate'), adjusted_price: buildFamily('adjusted_price') };
  const belowZero = states.filter((s) => s.included && s.evidence_class === 'sold' && s.price &&
    s.price.value + resolveLines(s.lines).forPrice <= 0);
  if (belowZero.length > 0) {
    warnings.push({
      code: 'adjusted_value_not_positive',
      message: `the adjustments take ${belowZero.map((s) => s.id).join(', ')} to zero or below — check their values; ${belowZero.length === 1 ? 'it is' : 'they are'} left out of the indicators`,
      comp_ids: belowZero.map((s) => s.id), results: [kind],
    });
  }

  // The lead and the base.
  const defaultLead: LeadIndicator = unitRateOn ? 'unit_rate.median' : 'adjusted_price.median';
  const leadId = ctx.method.lead?.indicator ?? defaultLead;
  const chosenBy = ctx.method.lead ? 'agent' : 'default';
  const [leadFamily, leadWhich] = leadId.split('.') as [Family, 'median' | 'mean' | 'anchor'];
  const leadIndicator = indicators[leadFamily][leadWhich];
  const lead = {
    indicator: leadId,
    chosen_by: chosenBy as 'default' | 'agent',
    label: chosenBy === 'default' ? `${LABELS[leadId]} — the default method, pending Noble` : `${LABELS[leadId]} — chosen by the agent`,
    reason: ctx.method.lead?.reason ?? null,
  };
  const base = leadIndicator.implied_value;

  const leadValue = (excluded: ReadonlySet<string>): { value: number; confidence: Confidence } | null => {
    if (leadFamily === 'unit_rate' && !unitRateOn) return null;
    const entries = familyEntries(states, leadFamily, subjectArea, excluded);
    const pool = leadWhich === 'anchor' ? entries.filter((e) => e.id === anchorId) : entries;
    if (pool.length === 0) return null;
    const value = impliedFrom(leadFamily, indicatorValue(pool, leadWhich, anchorId), subjectArea);
    return value === null ? null : { value, confidence: weakest(soldFloor, ...pool.map((e) => e.implied_confidence)) };
  };

  // The bracket: lowest to highest implied value among primary sold comps, in the lead's family.
  const leadEntries = leadFamily === 'unit_rate' && !unitRateOn ? [] : familyEntries(states, leadFamily, subjectArea, none);
  const withImplied = leadEntries.filter((e) => e.implied !== null);
  const soldIncludedCount = evidence.sold.counts.included;
  const lo = withImplied.length > 0 ? withImplied.reduce((a, b) => (b.implied! < a.implied! ? b : a)) : null;
  const hi = withImplied.length > 0 ? withImplied.reduce((a, b) => (b.implied! > a.implied! ? b : a)) : null;
  const rangeWhyNot = leadFamily === 'unit_rate' && !unitRateOn ? 'unit-rate indicators are off for co-ops'
    : soldIncludedCount === 0 ? 'no primary sold comps'
      : leadEntries.length === 0 ? 'no primary sold comp can give this indicator'
        : withImplied.length === 0 ? "no implied values without the subject's interior area"
          : soldIncludedCount === 1 ? 'a range needs at least two primary sold comps — one comp is a point, and a range is never a point'
            : withImplied.length === 1 ? `only one of the ${soldIncludedCount} primary sold comps gives this indicator (the others lack ${leadFamily === 'unit_rate' ? 'an area or ' : ''}a price, or adjust to zero or below) — and a range is never a point`
              : lo!.implied === hi!.implied ? 'the primary sold comps all imply the same value — a range is never a point'
                : null;
  let bracket: RangeOut | null = null;
  if (rangeWhyNot === null && lo && hi) {
    const how = leadFamily === 'unit_rate' ? "its adjusted $/sqft × the subject's area" : 'its adjusted price';
    bracket = {
      low: figure(lo.implied!, 'usd', weakest(soldFloor, lo.implied_confidence), `lowest implied value among ${withImplied.length} primary sold comps: ${lo.id}, ${how}`, asOf),
      high: figure(hi.implied!, 'usd', weakest(soldFloor, hi.implied_confidence), `highest implied value among ${withImplied.length} primary sold comps: ${hi.id}, ${how}`, asOf),
      comp_ids: withImplied.map((e) => e.id),
    };
  }

  // The agent's narrowing is a number, so it's an estimate: "with estimates" only.
  let range: Result['range'] = bracket ? { ...bracket, narrowed: false, narrowing_reason: null } : null;
  const narrowing = ctx.method.narrowing;
  if (narrowing && kind === 'with_estimates') {
    if (!bracket) {
      warnings.push({ code: 'narrowing_not_applied', message: 'the agent narrowed the range, but there is no range to narrow yet', comp_ids: [], results: [kind] });
    } else {
      const low = narrowing.low ?? bracket.low.value;
      const high = narrowing.high ?? bracket.high.value;
      if (low < bracket.low.value || high > bracket.high.value || low >= high) {
        warnings.push({
          code: 'narrowing_outside_bracket',
          message: `the agent's narrowing ($${low}–$${high}) must sit inside the comps' bracket ($${bracket.low.value}–$${bracket.high.value}); not applied`,
          comp_ids: [], results: [kind],
        });
      } else {
        const why = `narrowed by the agent: ${narrowing.reason}`;
        range = {
          low: narrowing.low !== undefined ? figure(low, 'usd', 'guesstimate', why, asOf) : bracket.low,
          high: narrowing.high !== undefined ? figure(high, 'usd', 'guesstimate', why, asOf) : bracket.high,
          comp_ids: bracket.comp_ids, narrowed: true, narrowing_reason: narrowing.reason,
        };
        ctx.estimates.push({ kind: 'narrowing', id: 'method.narrowing', target: 'range', what: 'range', note: `range narrowed to $${low}–$${high}: ${narrowing.reason}` });
      }
    }
  }
  if (base && range && (base.value < range.low.value || base.value > range.high.value)) {
    warnings.push({ code: 'base_outside_range', message: `the base ($${base.value}) sits outside the range ($${range.low.value}–$${range.high.value})`, comp_ids: [], results: [kind] });
  }

  const bridge = buildBridge(states, leadFamily, base, leadValue, allLineIds, asOf, kind, warnings);

  // Market signals.
  const soldIncluded = states.filter((s) => s.included && s.evidence_class === 'sold');
  const saleToAsk = statSummary(
    soldIncluded.flatMap((s) => {
      const sale = s.facts.sale_price;
      const ask = s.facts.list_price;
      return sale && ask ? [{ id: s.id, value: (sale.value / ask.value - 1) * 100, confidence: weakest(sale.confidence, ask.confidence) }] : [];
    }),
    'percent', 'sale-to-last-ask', asOf, false, soldFloor,
  );
  const days_on_market = {} as Record<EvidenceClass, StatSummary | null>;
  for (const cls of ['sold', 'in_contract', 'active'] as const) {
    days_on_market[cls] = statSummary(
      states.filter((s) => s.included && s.evidence_class === cls && s.facts.days_on_market)
        .map((s) => ({ id: s.id, value: s.facts.days_on_market!.value, confidence: s.facts.days_on_market!.confidence })),
      'days', `days on market (${cls.replace('_', ' ')})`, asOf, false, floorFor(cls),
    );
  }
  const soldRates = evidence.sold.price_per_sqft;
  const sold_band = soldRates ? { low: soldRates.min, median: soldRates.median, high: soldRates.max } : null;
  const classMedian = (cls: 'in_contract' | 'active') => {
    const rates = evidence[cls].price_per_sqft;
    if (!rates || !sold_band) return null;
    const pct = (rates.median.value / sold_band.median.value - 1) * 100;
    return {
      median: rates.median,
      versus_sold_median_percent: figure(pct, 'percent', weakest(rates.median.confidence, sold_band.median.confidence), `${cls.replace('_', ' ')} median ask $/sqft against the sold median $/sqft`, asOf),
    };
  };

  return {
    kind,
    label: kind === 'on_facts' ? 'On the facts' : 'With estimates',
    evidence,
    indicators,
    lead,
    base,
    bracket,
    range,
    range_unavailable_because: range ? null : rangeWhyNot,
    bridge,
    sale_to_ask: saleToAsk,
    days_on_market,
    asks_vs_sold: { sold_band, class_medians: { in_contract: classMedian('in_contract'), active: classMedian('active') } },
    carry: carrySummary(states, ctx),
    estimates_used: kind === 'with_estimates' ? dedupeEstimates(ctx.estimates) : [],
  };
}

function dedupeEstimates(list: EstimateUse[]): EstimateUse[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const key = `${e.kind}|${e.id}|${e.target}|${e.what}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function carrySummary(states: readonly CompState[], ctx: ResultContext): CarrySummary {
  const { asOf, reportType } = ctx;
  const subject = monthlyCarry(ctx.subjectFacts, reportType);
  const subjectArea = ctx.subjectFacts.area_sqft;
  const comps = states.filter((s) => s.included).flatMap((s) => {
    const c = monthlyCarry(s.facts, reportType);
    return c ? [{ id: s.id, carry: c, area: s.facts.area_sqft ?? null }] : [];
  });
  const med = median(comps.map((c) => c.carry.value));
  // Per square foot only for condos: co-op square footage is unreliable (§6.3).
  const bySqft = reportType === 'condo' ? comps.filter((c) => c.area) : [];
  const medPsf = median(bySqft.map((c) => c.carry.value / c.area!.value));
  const floor = ctx.estimateAffected && ctx.estimateAffected.size > 0 ? 'guesstimate' : null;
  const compConf = weakest(floor, ...comps.map((c) => c.carry.confidence));
  const psfConf = weakest(floor, ...bySqft.map((c) => weakest(c.carry.confidence, c.area!.confidence)));
  const what = reportType === 'coop' ? 'maintenance' : 'common charges + taxes';
  return {
    subject: subject ? figure(subject.value, 'usd_per_month', subject.confidence, `subject's ${what}`, asOf) : null,
    subject_per_sqft: subject && subjectArea && reportType === 'condo' ? figure(subject.value / subjectArea.value, 'usd_per_sqft_per_month', weakest(subject.confidence, subjectArea.confidence), `subject's ${what} ÷ its area`, asOf) : null,
    comp_median: med === null ? null : figure(roundHalfAway(med), 'usd_per_month', compConf, `median ${what} of ${comps.length} primary comps (all statuses — carry isn't price evidence)`, asOf),
    comp_median_per_sqft: medPsf === null ? null : figure(medPsf, 'usd_per_sqft_per_month', psfConf, `median ${what} per sqft of ${bySqft.length} primary comps`, asOf),
    comp_ids: comps.map((c) => c.id),
    subject_vs_median_percent: subject && med ? figure((subject.value / med - 1) * 100, 'percent', weakest(subject.confidence, compConf), `subject's ${what} against the comp median`, asOf) : null,
  };
}

function buildBridge(
  states: readonly CompState[], family: Family, base: Figure | null,
  leadValue: (excluded: ReadonlySet<string>) => { value: number; confidence: Confidence } | null,
  allLineIds: ReadonlySet<string>, asOf: IsoDate, kind: ResultKind, warnings: Warning[],
): Bridge {
  const sold = states.filter((s) => s.included && s.evidence_class === 'sold' && s.price);
  const byLine = new Map<string, { raw: RawLine; comp: CompState }[]>();
  for (const s of sold) {
    for (const l of s.lines) {
      if (family === 'unit_rate' && !l.applies_to_unit_rate) continue;
      const list = byLine.get(l.line) ?? [];
      list.push({ raw: l, comp: s });
      byLine.set(l.line, list);
    }
  }
  const startValue = leadValue(allLineIds);
  const lines: BridgeLine[] = [];
  const order = (id: string) => {
    const [factor] = id.split('.');
    return FACTOR_BY_ID.get(factor!)?.number ?? 99;
  };
  for (const id of [...byLine.keys()].sort((a, b) => order(a) - order(b) || (a < b ? -1 : a > b ? 1 : 0))) {
    const items = byLine.get(id)!;
    const first = items[0]!.raw;
    const factor = FACTOR_BY_ID.get(first.factor)!;
    const statuses = items.map((i) => i.raw.status);
    const status = statuses.includes('calculated') ? 'calculated' : statuses.includes('agent_estimate') ? 'agent_estimate' : 'considered_not_calculated';
    const allUndetermined = items.every((i) => i.raw.why_not?.startsWith(NOT_DETERMINED));
    const hasValue = items.some((i) => i.raw.dollars !== null);
    let effect: Figure | null = null;
    if (hasValue && base) {
      const without = leadValue(new Set([id]));
      if (without !== null) {
        effect = figure(base.value - without.value, 'usd', weakest(base.confidence, ...items.map((i) => i.raw.confidence)),
          `the base with this line, less the base without it`, asOf);
      }
    }
    lines.push({
      kind: 'factor', id, name: first.name, factor: first.factor, facet: first.facet, status,
      label: status === 'calculated' ? 'house method' : status === 'agent_estimate' ? "agent's estimate" : allUndetermined ? NOT_DETERMINED : 'not calculated — see each comp',
      client_visible: factor.client_visible,
      comps: items.map(({ raw, comp }) => {
        const applied = resolveLines(comp.lines).applied.get(raw.line);
        return {
          comp_id: comp.id, direction: raw.direction, degree: raw.degree, units: raw.units, dollars: raw.dollars,
          applied: applied?.applied ?? false, status: raw.status, why_not_calculated: raw.why_not,
        };
      }),
      effect_on_base: effect,
      interaction: null,
    });
  }

  // Interactions: complement lines, and double-counting warnings.
  const complements = new Map<string, string[]>();
  const risks = new Map<string, { comps: Set<string>; sources: Set<string>; names: Set<string> }>();
  for (const s of sold) {
    for (const f of interactionFindings(s.lines)) {
      if (f.def.v1_behaviour === 'undetermined_interaction_line') {
        complements.set(f.def.id, [...(complements.get(f.def.id) ?? []), s.id]);
      } else if (f.lines) {
        const key = f.def.id;
        const r = risks.get(key) ?? { comps: new Set<string>(), sources: new Set<string>(), names: new Set<string>() };
        r.comps.add(s.id);
        for (const l of f.lines) {
          r.sources.add(l.source === 'agent' ? "the agent's estimate" : 'the house method');
          r.names.add(l.name.toLowerCase());
        }
        risks.set(key, r);
      }
    }
  }
  for (const def of INTERACTIONS) {
    const comps = complements.get(def.id);
    if (comps) {
      lines.push({
        kind: 'interaction', id: def.id, name: def.members.map((m) => FACTOR_BY_ID.get(m.factor)!.name).join(' × '),
        factor: null, facet: null, status: 'considered_not_calculated', label: `interaction ${NOT_DETERMINED}`, client_visible: true,
        comps: [...new Set(comps)].map((comp_id) => ({ comp_id, direction: null, degree: null, units: null, dollars: null, applied: false, status: 'considered_not_calculated' as const, why_not_calculated: `interaction ${NOT_DETERMINED}` })),
        effect_on_base: null,
        interaction: { relationship: def.relationship, why: def.why, members: def.members.map((m) => (m.facet ? `${m.factor}.${m.facet}` : m.factor)) },
      });
    }
    const risk = risks.get(def.id);
    if (risk) {
      const names = [...risk.names];
      const listed = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      warnings.push({
        code: 'double_counting_risk',
        message: `${listed} ${names.length === 2 ? 'both' : 'all'} carry values (${[...risk.sources].join(' and ')}) — ${def.relationship.replace('_', ' ')}: ${def.why}${def.condition ? ` (if ${def.condition})` : ''}`,
        comp_ids: [...risk.comps],
        results: [kind],
      });
    }
  }

  return {
    family,
    start: startValue === null ? null : figure(startValue.value, 'usd', startValue.confidence, 'the lead indicator before any adjustment', asOf),
    lines,
    end: base,
    note: 'Each line’s effect is the base with it, less the base without it. With a median, and where substitutes take the larger adjustment, the effects need not add up to the total.',
  };
}
