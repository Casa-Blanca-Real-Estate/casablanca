// Adjustments — turning a comparison into dollars, or saying why it can't be
// (§6.6). "No invented numbers": a comparison becomes dollars only when its
// magnitude is determined — by the house method (every value null in
// production) or stated by the agent (in "with estimates" only). Otherwise the
// line is "considered, not calculated" and moves no number.
//
// Adjustments move a comp toward the subject: a comp worse than the subject
// adjusts up, a better one down. Percentages are of the comp's own price and
// don't compound. Each line is rounded to whole dollars.
//
// Interactions (Appendix A.5): substitutes take the larger adjustment, never
// the sum (when they pull the same way; opposite pulls net, which is no double
// count); other related pairs warn when both carry values; complements get an
// interaction line whose value is undetermined.

import { findLine, lineId, OUTDOOR_WEIGHT_KEYS, type MagnitudeShape } from '../catalog/factors.ts';
import { INTERACTIONS, interactionPairs, memberCovers, type InteractionDefinition } from '../catalog/interactions.ts';
import type { HouseMethod } from '../house-method/load.ts';
import { roundHalfAway } from '../util/numbers.ts';
import type { AgentAdjustment, AgentValue, Confidence, OutdoorKind, PropertyFacts } from '../types.ts';
import { weakest } from './facts.ts';
import type { AdjustmentOut, ComparisonOut, ResultKind } from './output.ts';

type Facts = Partial<PropertyFacts>;

export interface AdjustContext {
  kind: ResultKind;
  houseMethod: HouseMethod;
  agentAdjustments: readonly AgentAdjustment[];
}

/** An adjustment before interactions are resolved. */
export interface RawLine {
  line: string;
  factor: string;
  facet: string | null;
  name: string;
  direction: ComparisonOut['direction'];
  degree: ComparisonOut['degree'];
  units: number | null;
  status: AdjustmentOut['status'];
  dollars: number | null;
  source: 'house_method' | 'agent' | null;
  agent_adjustment_id: string | null;
  why_not: string | null;
  applies_to_unit_rate: boolean;
  basis: string;
  /** As sure as what it rests on: the comparison's inputs, and an agent's value if it's theirs. */
  confidence: Confidence;
}

export const NOT_DETERMINED = 'value not yet determined';
export const ANALYST_ONLY = 'analyst view only (§14): a recognised steering signal, so it moves neither result';

function sign(direction: ComparisonOut['direction']): 1 | -1 | null {
  return direction === 'comp_inferior' ? 1 : direction === 'comp_superior' ? -1 : null;
}

/** The sign for numeric factors: the judgment's direction if there is one, else the difference itself. */
function numericSign(c: ComparisonOut): number {
  const s = sign(c.direction);
  if (s !== null) return s;
  return c.units === null ? 0 : c.units > 0 ? 1 : c.units < 0 ? -1 : 0;
}

/** A difference computed from the facts, turned the way a judgment says when there is one. */
function directed(raw: number, c: ComparisonOut): number {
  const s = sign(c.direction);
  return s === null ? raw : s * Math.abs(raw);
}

/** Private outdoor area counted at its weight; 0 when it has none; null when that can't be known. */
function effectiveOutdoor(facts: Facts, weightOf: (kind: OutdoorKind) => number | null | undefined): number | null {
  const has = facts.outdoor_private?.value;
  if (has === false) return 0;
  if (has !== true) return null;
  const area = facts.outdoor_area_sqft?.value;
  const kinds = (facts.outdoor_kinds?.value ?? []) as OutdoorKind[];
  if (area === undefined || kinds.length !== 1) return null; // several kinds: the area can't be split between them
  const w = weightOf(kinds[0]!);
  return w === null || w === undefined ? null : (area as number) * w;
}

interface Computed { dollars: number | null; why: string | null; basis: string }

function fromHouseMethod(
  shape: MagnitudeShape, values: Record<string, number | null>, c: ComparisonOut,
  price: number, compArea: number | null, subjectArea: number | null, subject: Facts, comp: Facts,
): Computed {
  switch (shape.shape) {
    case 'by_degree': {
      const s = sign(c.direction);
      // An undetermined magnitude is the headline reason; anything else it would need is noted after it.
      const needs = [...(s === null ? ['which side is better'] : []), ...(c.degree ? [] : ['how much it differs'])];
      const anyValue = ['small', 'moderate', 'large'].some((k) => values[k] !== null && values[k] !== undefined);
      if (!anyValue) {
        return { dollars: null, why: needs.length ? `${NOT_DETERMINED}; it would also need a judgment of ${needs.join(' and ')}` : NOT_DETERMINED, basis: '' };
      }
      if (s === null) return { dollars: null, why: 'which side is better needs a judgment', basis: '' };
      if (!c.degree) return { dollars: null, why: 'how much it differs needs a judgment (Jev or the agent)', basis: '' };
      const m = values[c.degree];
      if (m === null || m === undefined) return { dollars: null, why: NOT_DETERMINED, basis: '' };
      const amount = shape.unit === 'percent' ? (price * m) / 100 : m;
      return { dollars: s * amount, why: null, basis: `${c.degree} difference at ${shape.unit === 'percent' ? `${m}% of the price` : `$${m}`}` };
    }
    case 'per_unit': {
      const m = values['per_unit'];
      if (m === null || m === undefined) return { dollars: null, why: NOT_DETERMINED, basis: '' };
      if (c.units === null) return { dollars: null, why: 'the difference is unknown', basis: '' };
      const units = shape.per === 'month' ? c.units : numericSign(c) * Math.abs(c.units);
      const amount = shape.unit === 'percent' ? (price * m * units) / 100 : m * units;
      return { dollars: amount, why: null, basis: `${round2(units)} ${shape.per}${Math.abs(units) === 1 ? '' : 's'} at ${shape.unit === 'percent' ? `${m}%` : `$${m}`} per ${shape.per}` };
    }
    case 'size_elasticity': {
      const e = values['elasticity'];
      if (e === null || e === undefined) return { dollars: null, why: NOT_DETERMINED, basis: '' };
      if (subjectArea === null || compArea === null) return { dollars: null, why: 'needs both interior areas', basis: '' };
      return { dollars: directed((subjectArea - compArea) * (price / compArea) * e, c), why: null, basis: `${subjectArea - compArea} sqft at ${e} × the comp's $/sqft` };
    }
    case 'effective_area': {
      const weight = (k: OutdoorKind) => values[`weight_${k}`];
      const es = effectiveOutdoor(subject, weight);
      const ec = effectiveOutdoor(comp, weight);
      if (es !== null && ec !== null && compArea !== null) {
        return { dollars: directed((es - ec) * (price / compArea), c), why: null, basis: `effective outdoor area ${round2(es)} against ${round2(ec)} sqft at the comp's $/sqft` };
      }
      const byDegree = fromHouseMethod({ shape: 'by_degree', unit: 'percent' }, values, c, price, compArea, subjectArea, subject, comp);
      if (byDegree.dollars === null && !byDegree.why?.startsWith(NOT_DETERMINED)) {
        return { ...byDegree, why: `${byDegree.why} — or outdoor sizes for both` };
      }
      return byDegree;
    }
    case 'capitalized': {
      const m = values['multiplier'];
      if (m === null || m === undefined) return { dollars: null, why: NOT_DETERMINED, basis: '' };
      if (c.units === null) return { dollars: null, why: 'the carry difference is unknown', basis: '' };
      return { dollars: directed(c.units * m, c), why: null, basis: `$${c.units}/month × ${m}` };
    }
    case 'none':
      return { dollars: null, why: 'not an adjustment', basis: '' };
  }
}

function fromAgent(
  shape: MagnitudeShape, value: AgentValue, c: ComparisonOut, factor: string,
  price: number, compArea: number | null, subjectArea: number | null, subject: Facts, comp: Facts,
): Computed {
  const recency = factor === 'recency_market';
  if ('percent' in value || 'dollars' in value) {
    // A flat value per comp, signed by the comparison. For recency the agent's sign is the market's.
    const s = recency ? 1 : shape.shape === 'per_unit' || shape.shape === 'size_elasticity' || shape.shape === 'capitalized' ? numericSign(c) || null : sign(c.direction);
    if (s === null) return { dollars: null, why: 'which side is better needs a judgment before the agent\'s value can apply', basis: '' };
    const amount = 'percent' in value ? (price * value.percent) / 100 : value.dollars;
    return { dollars: s * amount, why: null, basis: 'percent' in value ? `the agent's ${value.percent}% of the price` : `the agent's $${value.dollars}` };
  }
  if ('percent_per_unit' in value || 'dollars_per_unit' in value) {
    if (shape.shape !== 'per_unit') return { dollars: null, why: 'a per-unit value needs a per-unit factor', basis: '' };
    return fromHouseMethod(
      { shape: 'per_unit', unit: 'percent_per_unit' in value ? 'percent' : 'dollars', per: shape.per },
      { per_unit: 'percent_per_unit' in value ? value.percent_per_unit : value.dollars_per_unit }, c, price, compArea, subjectArea, subject, comp,
    );
  }
  if ('elasticity' in value) return fromHouseMethod(shape, { elasticity: value.elasticity }, c, price, compArea, subjectArea, subject, comp);
  if ('multiplier' in value) return fromHouseMethod(shape, { multiplier: value.multiplier }, c, price, compArea, subjectArea, subject, comp);
  const weights: Record<string, number | null> = { small: null, moderate: null, large: null };
  for (const key of OUTDOOR_WEIGHT_KEYS) weights[key] = value.weights[key.slice('weight_'.length) as OutdoorKind] ?? null;
  const r = fromHouseMethod(shape, weights, c, price, compArea, subjectArea, subject, comp);
  return r.dollars === null ? { ...r, why: "the agent's weights don't cover these outdoor spaces, or their sizes are unknown" } : r;
}

function round2(x: number): number {
  return roundHalfAway(x * 100) / 100;
}

/** The latest agent value for a line that applies to this comp (latest date; the later one on the same date). */
export function agentValueFor(adjustments: readonly AgentAdjustment[], factor: string, facet: string | null, compId: string): AgentAdjustment | null {
  let best: AgentAdjustment | null = null;
  for (const a of adjustments) {
    if (a.factor !== factor || (a.facet ?? null) !== facet) continue;
    if (a.comp_ids && !a.comp_ids.includes(compId)) continue;
    // Input order breaks ties, so ">=" lets a later statement on the same date win.
    if (!best || a.as_of >= best.as_of) best = a;
  }
  return best;
}

/** Every adjustment line for one sold comp in one result, before interactions. */
export function adjustmentLines(
  compId: string, comparisons: readonly ComparisonOut[], price: number, compArea: number | null,
  subjectArea: number | null, subject: Facts, comp: Facts, ctx: AdjustContext,
): RawLine[] {
  const lines: RawLine[] = [];
  for (const c of comparisons) {
    if (c.status !== 'compared' || c.direction === 'similar') continue;
    const found = findLine(c.factor, c.facet);
    if (!found) continue;
    const shape = found.line.magnitude;
    const id = lineId(c.factor, c.facet);
    const hm = ctx.houseMethod.lines[id];
    const agent = ctx.kind === 'with_estimates' ? agentValueFor(ctx.agentAdjustments, c.factor, c.facet, compId) : null;
    const houseValue = (): Computed => (hm ? fromHouseMethod(shape, hm.values, c, price, compArea, subjectArea, subject, comp) : { dollars: null, why: NOT_DETERMINED, basis: '' });
    let computed: Computed;
    let source: RawLine['source'] = null;
    let agentId: string | null = null;
    let note = '';
    if (!found.factor.client_visible) {
      // School zone is analyst view only (§14): it never moves a result that can reach a client.
      computed = { dollars: null, why: ANALYST_ONLY, basis: '' };
    } else if (agent) {
      computed = fromAgent(shape, agent.value, c, c.factor, price, compArea, subjectArea, subject, comp);
      agentId = agent.id;
      if (computed.dollars !== null) source = 'agent';
      else {
        // "With estimates" is the facts plus the estimates — never less: fall back to the house method.
        const fallback = houseValue();
        if (fallback.dollars !== null) {
          note = `the agent's value (${agent.id}) couldn't apply here — ${computed.why} — so the house method's is used`;
          computed = fallback;
          source = 'house_method';
          agentId = null;
        }
      }
    } else {
      computed = houseValue();
      source = computed.dollars === null ? null : 'house_method';
    }
    const dollars = computed.dollars === null ? null : roundHalfAway(computed.dollars);
    lines.push({
      line: id, factor: c.factor, facet: c.facet, name: c.name, direction: c.direction, degree: c.degree, units: c.units,
      status: dollars === null ? 'considered_not_calculated' : source === 'agent' ? 'agent_estimate' : 'calculated',
      dollars,
      source,
      agent_adjustment_id: agentId,
      why_not: dollars === null ? computed.why : null,
      applies_to_unit_rate: c.factor !== 'interior_size',
      basis: [c.basis, computed.basis, note].filter(Boolean).join('; '),
      confidence: weakest(c.confidence, source === 'agent' ? 'guesstimate' : 'exact'),
    });
  }
  return lines;
}

export interface Resolution {
  /** Sum of applied adjustments, for adjusted prices. */
  forPrice: number;
  /** Sum excluding interior size, for adjusted $/sqft. */
  forUnitRate: number;
  applied: Map<string, { applied: boolean; superseded_by: string | null }>;
}

/** Applies A.5's substitute rule and sums what's left. `excluded` lines are left out entirely (for leave-one-out). */
export function resolveLines(lines: readonly RawLine[], excluded: ReadonlySet<string> = new Set()): Resolution {
  const applied = new Map<string, { applied: boolean; superseded_by: string | null }>();
  const active = lines.filter((l) => l.dollars !== null && !excluded.has(l.line));
  for (const l of active) applied.set(l.line, { applied: true, superseded_by: null });
  for (const def of INTERACTIONS) {
    if (def.v1_behaviour !== 'larger_not_sum') continue;
    for (const [a, b] of interactionPairs(def)) {
      const la = active.find((l) => memberCovers(a, l.factor, l.facet) && applied.get(l.line)!.applied);
      const lb = active.find((l) => memberCovers(b, l.factor, l.facet) && applied.get(l.line)!.applied);
      if (!la || !lb || la.dollars === 0 || lb.dollars === 0) continue;
      if (Math.sign(la.dollars!) !== Math.sign(lb.dollars!)) continue; // opposite pulls net
      // The larger stands; the smaller is superseded (on a tie, the first member stands).
      const drop = Math.abs(lb.dollars!) > Math.abs(la.dollars!) ? la : lb;
      applied.set(drop.line, { applied: false, superseded_by: def.id });
    }
  }
  let forPrice = 0;
  let forUnitRate = 0;
  for (const l of active) {
    if (!applied.get(l.line)!.applied) continue;
    forPrice += l.dollars!;
    if (l.applies_to_unit_rate) forUnitRate += l.dollars!;
  }
  for (const l of lines) if (!applied.has(l.line)) applied.set(l.line, { applied: false, superseded_by: null });
  return { forPrice, forUnitRate, applied };
}

export interface InteractionFinding {
  def: InteractionDefinition;
  /** For warnings: the two lines that both carry values. */
  lines: [RawLine, RawLine] | null;
}

/** Double-counting risks and complement lines for one comp. */
export function interactionFindings(lines: readonly RawLine[]): InteractionFinding[] {
  const findings: InteractionFinding[] = [];
  for (const def of INTERACTIONS) {
    for (const [a, b] of interactionPairs(def)) {
      const la = lines.filter((l) => memberCovers(a, l.factor, l.facet));
      const lb = lines.filter((l) => memberCovers(b, l.factor, l.facet));
      if (la.length === 0 || lb.length === 0) continue;
      if (def.v1_behaviour === 'warn_double_counting') {
        const va = la.find((l) => l.dollars !== null && l.dollars !== 0);
        const vb = lb.find((l) => l.dollars !== null && l.dollars !== 0);
        if (va && vb) findings.push({ def, lines: [va, vb] });
      } else if (def.v1_behaviour === 'undetermined_interaction_line') {
        findings.push({ def, lines: null });
      }
    }
  }
  return findings;
}
