// compute() — inputs in, results out. Pure: no clock, no network, no DOM;
// the same inputs give byte-identical output (and the same output hash) in the
// browser and in a Netlify function.
//
// It runs the analysis twice — "on the facts" and "with estimates" (§6.4) —
// and assembles every comp, both results, where they diverge, the price
// evaluations, the monthly cost estimate and the deal terms, with every gap,
// warning and pending confirmation called out rather than assumed.

import { assertUsable, productionHouseMethod, type HouseMethod } from '../house-method/load.ts';
import { sameBuilding, sameUnit } from '../parser/property-key.ts';
import { canonicalJson } from '../util/canonical-json.ts';
import { addMonths, daysBetween, type IsoDate } from '../util/dates.ts';
import { compareStrings, roundHalfAway } from '../util/numbers.ts';
import { sha256Tag } from '../util/sha256.ts';
import { ENGINE_VERSION } from '../version.ts';
import type { CompInput, EngineInput, PropertyFacts, PropertyType, Sourced, StatedFact } from '../types.ts';
import { adjustmentLines, resolveLines } from './adjust.ts';
import { compareComp, monthlyCarry } from './compare.ts';
import { resolveFacts, weakest, type ResolvedFacts } from './facts.ts';
import { dealTerms, evaluatePrices, monthlyCosts } from './money.ts';
import { buildResult, figure, type CompState } from './results.ts';
import { validateInput } from './validate.ts';
import type {
  AdjustmentOut, CompOut, CompResultOut, Divergence, EngineOutput, EstimateUse, Gap, PendingItem, Result, ResultKind, Warning,
} from './output.ts';

export { EngineInputError } from './validate.ts';

export interface ComputeOptions {
  /** Defaults to the production house method. */
  houseMethod?: HouseMethod;
  /** "what_if" lets hypothetical values in; the whole output is then a what-if (§8.3, rule 4). */
  mode?: 'report' | 'what_if';
}

const KINDS: ResultKind[] = ['on_facts', 'with_estimates'];

const TYPE_WORDS: Record<PropertyType, string> = {
  condo: 'condo', coop: 'co-op', condop: 'condop', townhouse: 'townhouse', multi_family: 'multi-family building', other: 'property of another type',
};

function label(c: CompInput): string {
  const street = c.record.identity.address.street;
  const unit = c.record.identity.unit.raw;
  return street ? `${street}${unit ? ` ${unit.startsWith('#') ? unit : `#${unit}`}` : ''}` : c.id;
}

function statedFor(stated: readonly StatedFact[], target: 'subject' | string): StatedFact[] {
  return stated.filter((s) => (target === 'subject' ? s.target === 'subject' : typeof s.target === 'object' && s.target.comp_id === target));
}

export function compute(input: EngineInput, options: ComputeOptions = {}): EngineOutput {
  const houseMethod = options.houseMethod ?? productionHouseMethod();
  assertUsable(houseMethod);
  validateInput(input);
  const mode = options.mode ?? 'report';
  const asOf = input.as_of;
  const reportType = input.property_type;
  const method = input.method ?? {};
  const stated = input.stated_facts ?? [];
  const assessments = input.assessments ?? [];
  const agentAdjustments = input.agent_adjustments ?? [];
  // Comp order carries no meaning, so it's canonical: by id.
  const comps = [...input.comps].sort((a, b) => compareStrings(a.id, b.id));
  const inputsHash = sha256Tag(canonicalJson({
    engine_version: ENGINE_VERSION, house_method: houseMethod.hash, mode, input: { ...input, comps },
  }));

  const warnings: Warning[] = [];
  const gaps: Gap[] = [];
  const pending: PendingItem[] = [];
  const windowStart: IsoDate | null = method.recency
    ? ('months' in method.recency ? addMonths(asOf, -method.recency.months) : method.recency.since)
    : null;

  const subjectFacts = {} as Record<ResultKind, Partial<PropertyFacts>>;
  const subjectResolved = {} as Record<ResultKind, ResolvedFacts>;
  const statesByKind = {} as Record<ResultKind, CompState[]>;
  const compResolved = {} as Record<ResultKind, Map<string, ResolvedFacts>>;
  const results = {} as Record<ResultKind, Result>;

  for (const kind of KINDS) {
    const ctx = { kind, mode };
    const estimates: EstimateUse[] = [];
    const subject = resolveFacts('subject', input.subject.facts, statedFor(stated, 'subject'), ctx);
    subjectResolved[kind] = subject;
    subjectFacts[kind] = subject.facts as Partial<PropertyFacts>;
    estimates.push(...subject.estimates);
    compResolved[kind] = new Map();

    const states: CompState[] = comps.map((c) => {
      const resolved = resolveFacts(c.id, c.record.facts, statedFor(stated, c.id), ctx);
      compResolved[kind].set(c.id, resolved);
      const facts = resolved.facts as Partial<PropertyFacts>;
      const cls = c.record.status.evidence_class;
      const reasons: string[] = [];
      if (c.tier !== 'primary') reasons.push(c.tier === 'secondary' ? 'tiered secondary' : `excluded${c.tier_reason ? `: ${c.tier_reason}` : ''}`);
      if (!cls) reasons.push(`status "${c.record.status.raw ?? ''}" isn't sold, in contract or active`);
      const type = facts.property_type?.value;
      if (type && type !== reportType) reasons.push(`a ${TYPE_WORDS[type]}, and this is a ${TYPE_WORDS[reportType]} report — like for like only`);
      if (cls === 'sold' && windowStart) {
        const date = facts.status_date?.value as string | undefined;
        if (!date) reasons.push('no sale date to test against the recency window');
        else if (date < windowStart) reasons.push(`sold ${date}, before the recency window opens (${windowStart})`);
      }
      const price = (cls === 'sold' ? facts.sale_price : facts.list_price) as Sourced<number> | undefined;
      const area = facts.area_sqft as Sourced<number> | undefined;
      const unitRate = price && area ? price.value / area.value : null;
      const noRate = cls === null ? 'no evidence class'
        : !area ? "no interior area — it can't give a $/sqft"
          : !price ? `no ${cls === 'sold' ? 'sale' : 'asking'} price` : null;
      const compared = compareComp(c.id, subject.facts as Partial<PropertyFacts>, facts, cls, assessments, { kind, mode, reportType, asOf });
      pending.push(...compared.pending);
      const included = reasons.length === 0;
      if (included) estimates.push(...resolved.estimates, ...compared.estimates);
      const lines = cls === 'sold' && price
        ? adjustmentLines(c.id, compared.comparisons, price.value, area?.value ?? null, (subject.facts.area_sqft as Sourced<number> | undefined)?.value ?? null,
          subject.facts as Partial<PropertyFacts>, facts, { kind, houseMethod, agentAdjustments })
        : [];
      if (included) {
        for (const l of lines) {
          if (l.source !== 'agent' || l.dollars === null) continue;
          estimates.push({ kind: 'agent_adjustment', id: l.agent_adjustment_id!, target: c.id, what: l.line, note: `${l.name}: ${l.dollars >= 0 ? '+' : '−'}$${Math.abs(l.dollars)} on ${label(c)} (the agent's estimate)` });
          const bounds = houseMethod.lines[l.line];
          const pct = (l.dollars / price!.value) * 100;
          if (bounds && ((bounds.min_percent !== null && pct < bounds.min_percent) || (bounds.max_percent !== null && pct > bounds.max_percent))) {
            const reason = agentAdjustments.find((a) => a.id === l.agent_adjustment_id)?.reason;
            warnings.push({
              code: 'outside_house_bounds',
              message: `${l.name} on ${label(c)} is ${pct.toFixed(1)}% of its price, outside the house limits (${bounds.min_percent ?? '−∞'}% to ${bounds.max_percent ?? '+∞'}%) — ${reason ? `the agent's reason: ${reason}` : "it needs the agent's reason"}`,
              comp_ids: [c.id], results: [kind],
            });
          }
        }
      }
      return {
        input: c, id: c.id, evidence_class: cls, facts, included, not_included_because: reasons,
        price: price ?? null, area: area ?? null, unit_rate: unitRate,
        unit_rate_confidence: price && area ? weakest(price.confidence, area.confidence) : null,
        no_unit_rate_because: noRate, comparisons: compared.comparisons, lines,
      };
    });
    statesByKind[kind] = states;
    results[kind] = buildResult(states, { kind, asOf, reportType, method, subjectFacts: subjectFacts[kind], estimates }, warnings);
  }

  // ── Comps ──
  const compsOut: CompOut[] = comps.map((c, i) => {
    const onFacts = statesByKind.on_facts[i]!;
    const facts = onFacts.facts;
    const perResult = {} as Record<ResultKind, CompResultOut>;
    for (const kind of KINDS) {
      const s = statesByKind[kind][i]!;
      const resolution = resolveLines(s.lines);
      const band = results[kind].asks_vs_sold.sold_band;
      const carry = monthlyCarry(s.facts, reportType);
      const adjustments: AdjustmentOut[] = s.lines.map((l) => ({
        line: l.line, factor: l.factor, facet: l.facet, name: l.name, direction: l.direction, degree: l.degree, status: l.status,
        dollars: l.dollars, percent_of_price: l.dollars === null || !s.price ? null : (l.dollars / s.price.value) * 100,
        applied: resolution.applied.get(l.line)?.applied ?? false,
        superseded_by: resolution.applied.get(l.line)?.superseded_by ?? null,
        applies_to_unit_rate: l.applies_to_unit_rate, source: l.source, agent_adjustment_id: l.agent_adjustment_id,
        why_not_calculated: l.why_not, basis: l.basis,
      }));
      const adjConf = s.lines.some((l) => l.source === 'agent' && resolution.applied.get(l.line)?.applied) ? 'guesstimate' : 'exact';
      const subjectArea = subjectFacts[kind].area_sqft as Sourced<number> | undefined;
      const adjustedRate = s.evidence_class === 'sold' && s.price && s.area ? (s.price.value + resolution.forUnitRate) / s.area.value : null;
      perResult[kind] = {
        included: s.included,
        not_included_because: s.not_included_because,
        price: s.price,
        area_sqft: s.area,
        price_per_sqft: s.unit_rate === null ? null
          : figure(s.unit_rate, 'usd_per_sqft', s.unit_rate_confidence!, `${s.evidence_class === 'sold' ? 'sale' : 'asking'} price ÷ interior area`, asOf),
        no_unit_rate_because: s.unit_rate === null ? s.no_unit_rate_because : null,
        comparisons: s.comparisons,
        adjustments,
        adjusted_price: s.evidence_class === 'sold' && s.price
          ? figure(s.price.value + resolution.forPrice, 'usd', weakest(s.price.confidence, adjConf), 'sale price plus applied adjustments', asOf) : null,
        adjusted_price_per_sqft: adjustedRate === null ? null
          : figure(adjustedRate, 'usd_per_sqft', weakest(s.unit_rate_confidence, adjConf), 'sale price plus applied adjustments (interior size aside) ÷ interior area', asOf),
        implied_value: adjustedRate !== null && subjectArea
          ? figure(roundHalfAway(adjustedRate * subjectArea.value), 'usd', weakest(s.unit_rate_confidence, adjConf, subjectArea.confidence), `adjusted $/sqft × subject's ${subjectArea.value} sqft`, asOf) : null,
        monthly_carry: carry ? figure(carry.value, 'usd_per_month', carry.confidence, carry.basis, asOf) : null,
        carry_per_sqft: carry && s.area ? figure(carry.value / s.area.value, 'usd_per_sqft_per_month', weakest(carry.confidence, s.area.confidence), `${carry.basis} ÷ interior area`, asOf) : null,
        ask_vs_sold: s.evidence_class !== 'sold' && s.unit_rate !== null && band
          ? {
            position: s.unit_rate < band.low.value ? 'below' : s.unit_rate > band.high.value ? 'above' : 'within',
            versus_sold_median_percent: figure((s.unit_rate / band.median.value - 1) * 100, 'percent', weakest(s.unit_rate_confidence, band.median.confidence), 'its ask $/sqft against the sold median $/sqft', asOf),
          }
          : null,
      };
    }
    const statusDate = facts.status_date?.value as string | undefined;
    const sale = facts.sale_price as Sourced<number> | undefined;
    const ask = facts.list_price as Sourced<number> | undefined;
    const type = facts.property_type?.value;
    return {
      id: c.id,
      identity: c.record.identity,
      building_name: c.record.building_name,
      evidence_class: c.record.status.evidence_class,
      status_raw: c.record.status.raw,
      basis: c.record.status.evidence_class === null ? null : c.record.status.evidence_class === 'sold' ? 'sale' : 'ask',
      tier: c.tier,
      tier_reason: c.tier_reason ?? null,
      anchor: c.anchor ?? false,
      flags: {
        closing_record: c.record.flags.closing_record,
        approx_area: facts.area_sqft?.confidence === 'approx',
        area_missing: !facts.area_sqft,
        price_missing: !onFacts.price,
        floor_missing: !facts.floor,
        same_building_as_subject: sameBuilding(input.subject.identity, c.record.identity),
        same_unit_as_subject: sameUnit(input.subject.identity, c.record.identity),
        property_type_mismatch: Boolean(type && type !== reportType),
        unrecognised_status: c.record.status.evidence_class === null,
        outside_recency_window: onFacts.not_included_because.some((r) => r.includes('recency window')),
      },
      status_date: statusDate ?? null,
      age_days: statusDate ? daysBetween(statusDate, asOf) : null,
      days_on_market: (facts.days_on_market?.value as number | undefined) ?? null,
      sale_to_ask_percent: sale && ask && c.record.status.evidence_class === 'sold'
        ? figure((sale.value / ask.value - 1) * 100, 'percent', weakest(sale.confidence, ask.confidence), '(sale price ÷ last asking price − 1) × 100', asOf)
        : null,
      engagement: c.record.engagement,
      per_result: perResult,
    };
  });

  // ── Warnings about the comps ──
  for (const c of compsOut) {
    const name = label(comps.find((x) => x.id === c.id)!);
    if (c.flags.closing_record) {
      warnings.push({ code: 'closing_record', message: `${name} is a public-record closing: no asking price, days on market or listing details, so its condition can't be checked`, comp_ids: [c.id], results: [...KINDS] });
    }
    if (c.flags.approx_area) {
      warnings.push({ code: 'approx_area', message: `${name}'s area is approximate at its source, so its $/sqft is too`, comp_ids: [c.id], results: [...KINDS] });
    }
    if (c.flags.same_unit_as_subject) {
      warnings.push({ code: 'same_unit_as_subject', message: `${name} is the subject unit itself — an earlier sale of it`, comp_ids: [c.id], results: [...KINDS] });
    } else if (c.flags.same_building_as_subject) {
      warnings.push({ code: 'same_building_as_subject', message: `${name} is in the subject's building — in NYC practice the strongest kind of comp`, comp_ids: [c.id], results: [...KINDS] });
    }
    if (c.flags.property_type_mismatch) {
      warnings.push({ code: 'property_type_mismatch', message: `${name} isn't a ${reportType === 'coop' ? 'co-op' : 'condo'}, so it's kept out of every statistic — like for like only`, comp_ids: [c.id], results: [...KINDS] });
    }
    if (c.flags.unrecognised_status) {
      warnings.push({ code: 'unrecognised_status', message: `${name}'s status "${c.status_raw ?? ''}" isn't sold, in contract or active, so it can't enter any statistic`, comp_ids: [c.id], results: [...KINDS] });
    }
    if (c.anchor && c.evidence_class !== 'sold') {
      warnings.push({ code: 'anchor_not_sold', message: `${name} is marked the anchor, but the anchor must be a sold comp`, comp_ids: [c.id], results: [...KINDS] });
    } else if (c.anchor && c.tier !== 'primary') {
      warnings.push({ code: 'anchor_not_primary', message: `${name} is marked the anchor but isn't primary`, comp_ids: [c.id], results: [...KINDS] });
    }
  }

  // ── Contradictions and ignored hypotheticals ──
  const contradictions = new Map<string, Warning>();
  const hypotheticals = new Map<string, Warning>();
  for (const kind of KINDS) {
    const all: [string, ResolvedFacts][] = [['subject', subjectResolved[kind]], ...[...compResolved[kind].entries()]];
    for (const [target, r] of all) {
      for (const x of r.contradictions) {
        const key = `${target}|${x.field}|${x.stated_id}`;
        const existing = contradictions.get(key);
        if (existing) { existing.results.push(kind); continue; }
        contradictions.set(key, {
          code: 'contradiction',
          message: `${target} ${x.field}: the agent stated ${JSON.stringify(x.stated)} (${x.stated_id}); the ${x.record_source === 'se_export' ? 'export' : x.record_source} says ${JSON.stringify(x.record)}. The agent's value is used — check it`,
          comp_ids: target === 'subject' ? [] : [target], results: [kind],
        });
      }
      for (const h of r.hypotheticals_ignored) {
        if (!hypotheticals.has(h)) {
          hypotheticals.set(h, { code: 'hypothetical_ignored', message: `${h} is hypothetical — used in what-ifs only, never in either result`, comp_ids: target === 'subject' ? [] : [target], results: [...KINDS] });
        }
      }
    }
  }
  warnings.push(...contradictions.values(), ...hypotheticals.values());

  // ── Gaps ──
  // One gap per distinct problem; a problem in both results lists both.
  const gapFor = (code: string, message: string, target: string | null, field: string | null, kinds: ResultKind[]) => {
    const same = gaps.find((g) => g.code === code && g.message === message && g.target === target && g.field === field);
    if (same) same.results = KINDS.filter((k) => same.results.includes(k) || kinds.includes(k));
    else gaps.push({ code, message, target, field, results: [...kinds] });
  };
  const missingSubjectArea = KINDS.filter((k) => !subjectFacts[k].area_sqft);
  if (missingSubjectArea.length === 2) {
    gapFor('subject_area_missing', "The subject's interior area isn't known — it isn't in the export. Without it there are no $/sqft implied values, so no base or range from the unit-rate indicators. The listing or the agent can supply it.", 'subject', 'area_sqft', missingSubjectArea);
  } else if (missingSubjectArea.length === 1) {
    gapFor('subject_area_estimate_only', "The subject's interior area is only the agent's estimate, so \"on the facts\" has no $/sqft implied values.", 'subject', 'area_sqft', missingSubjectArea);
  }
  for (const kind of KINDS) {
    const r = results[kind];
    if (r.evidence.sold.counts.included === 0) gapFor('no_primary_sold_comps', 'No primary sold comp — the base and range need sold evidence.', null, null, [kind]);
    const [family, which] = r.lead.indicator.split('.') as ['unit_rate' | 'adjusted_price', 'median' | 'mean' | 'anchor'];
    const leadInd = r.indicators[family][which];
    if (!r.base) gapFor('base_unavailable', `No base: ${leadInd.label.charAt(0).toLowerCase()}${leadInd.label.slice(1)} gives no subject value — ${leadInd.reason ?? 'it has nothing to work from'}.`, null, null, [kind]);
    if (!r.range && r.range_unavailable_because) gapFor('range_unavailable', `No range: ${r.range_unavailable_because}.`, null, null, [kind]);
  }
  for (const c of compsOut) {
    const name = label(comps.find((x) => x.id === c.id)!);
    if (c.flags.area_missing && c.evidence_class) gapFor('comp_area_missing', `${name} has no interior area, so it contributes no unit-rate indication.`, c.id, 'area_sqft', [...KINDS]);
    if (c.flags.price_missing && c.evidence_class) gapFor('comp_price_missing', `${name} has no ${c.evidence_class === 'sold' ? 'sale' : 'asking'} price.`, c.id, c.evidence_class === 'sold' ? 'sale_price' : 'list_price', [...KINDS]);
    if (c.flags.floor_missing) gapFor('comp_floor_missing', `${name} has no floor, so floors can't be compared for it.`, c.id, 'floor', [...KINDS]);
  }
  // Subject facts the comparisons need — each gap names the field to ask for.
  const subjectNeeds = new Map<string, { label: string; kinds: Set<ResultKind> }>();
  for (const kind of KINDS) {
    for (const s of statesByKind[kind]) {
      if (!s.included) continue;
      for (const cmp of s.comparisons) for (const m of cmp.missing) if (m.side === 'subject') {
        const need = subjectNeeds.get(m.field) ?? { label: m.label, kinds: new Set<ResultKind>() };
        need.kinds.add(kind);
        subjectNeeds.set(m.field, need);
      }
    }
  }
  for (const [field, need] of [...subjectNeeds.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    gapFor('subject_fact_missing', `${need.label.charAt(0).toUpperCase()}${need.label.slice(1)} would let the engine compare it with the comps.`, 'subject', field, [...need.kinds]);
  }
  if (!monthlyCarry(subjectFacts.with_estimates, reportType)) {
    gapFor('subject_carry_missing', `The subject's ${reportType === 'coop' ? 'maintenance' : 'common charges and taxes'} aren't known, so its carry can't be compared.`, 'subject', reportType === 'coop' ? 'maintenance_monthly' : 'common_charges_monthly', [...KINDS]);
  }

  // ── Divergence ──
  const a = results.on_facts;
  const b = results.with_estimates;
  const diff = (x: number | null, y: number | null) => (x === null || y === null ? null : y - x);
  const divergence: Divergence = {
    same: b.estimates_used.length === 0,
    base: {
      on_facts: a.base?.value ?? null, with_estimates: b.base?.value ?? null,
      difference: diff(a.base?.value ?? null, b.base?.value ?? null),
      difference_percent: a.base && b.base ? (b.base.value / a.base.value - 1) * 100 : null,
    },
    range_low: { on_facts: a.range?.low.value ?? null, with_estimates: b.range?.low.value ?? null, difference: diff(a.range?.low.value ?? null, b.range?.low.value ?? null) },
    range_high: { on_facts: a.range?.high.value ?? null, with_estimates: b.range?.high.value ?? null, difference: diff(a.range?.high.value ?? null, b.range?.high.value ?? null) },
  };

  // ── Pending confirmations, deduplicated ──
  const pendingSeen = new Set<string>();
  const pendingOut = pending.filter((p) => {
    const key = `${p.kind}|${p.id}|${p.target}|${p.what}`;
    if (pendingSeen.has(key)) return false;
    pendingSeen.add(key);
    return true;
  });
  for (const r of [subjectResolved.on_facts, ...compResolved.on_facts.values()]) {
    for (const p of r.pending) {
      const key = `${p.kind}|${p.id}|${p.target}|${p.what}`;
      if (!pendingSeen.has(key)) { pendingSeen.add(key); pendingOut.push(p); }
    }
  }

  const prices = evaluatePrices(input.prices ?? [], results, subjectFacts, asOf);
  const output: EngineOutput = {
    meta: {
      engine_version: ENGINE_VERSION,
      house_method: { id: houseMethod.id, kind: houseMethod.kind, version: houseMethod.version, hash: houseMethod.hash, all_null: houseMethod.all_null },
      property_type: reportType,
      as_of: asOf,
      mode,
      parser_versions: [...new Set(comps.map((c) => c.record.origin?.parser_version).filter((v): v is string => Boolean(v)))].sort(),
      inputs_hash: inputsHash,
      output_hash: '',
    },
    subject: {
      identity: input.subject.identity,
      facts: { on_facts: subjectResolved.on_facts.facts, with_estimates: subjectResolved.with_estimates.facts },
    },
    comps: compsOut,
    results,
    divergence,
    prices,
    monthly_cost: input.financing ? monthlyCosts(input.financing, input.prices ?? [], results, subjectFacts, reportType) : null,
    deal_terms: input.deal_terms ? dealTerms(input.deal_terms, results, subjectFacts, reportType, asOf) : null,
    gaps,
    warnings: sortWarnings(warnings),
    pending_confirmation: pendingOut,
  };
  output.meta.output_hash = sha256Tag(canonicalJson(output));
  return output;
}

function sortWarnings(warnings: Warning[]): Warning[] {
  for (const w of warnings) w.results = KINDS.filter((k) => w.results.includes(k));
  return warnings;
}

