// Adjustments (§6.6, Appendix A.5) on a small, hand-built comp set, so every
// figure can be checked by hand. Magnitudes come from the test-only house
// method (made-up round numbers) or from the agent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compute, identify, loadHouseMethod, productionHouseMethod, type AgentAdjustment, type CompInput, type CompRecord, type EngineInput,
  type EngineOutput, type FactorAssessment, type PropertyFacts, type ResultKind, type Sourced,
} from '../index.ts';
import testValues from './fixtures/house-method.test-only.json' with { type: 'json' };

const TEST_HM = loadHouseMethod(testValues);
const AS_OF = '2026-09-24';

const ex = <T>(value: T): Sourced<T> => ({ value, source: 'se_export', as_of: '2026-09-23', confidence: 'exact' });
const agent = <T>(value: T, confidence: Sourced<T>['confidence'] = 'exact'): Sourced<T> => ({ value, source: 'agent', as_of: AS_OF, confidence });

/** A sold comp with plain, neutral facts unless told otherwise. */
function comp(id: string, price: number, area: number, facts: Partial<PropertyFacts> = {}, extra: Partial<CompInput> = {}): CompInput {
  const record: CompRecord = {
    identity: identify({ address: `${id} Test Street, New York, NY`, unit: '#1' }),
    status: { raw: 'SOLD', evidence_class: 'sold' },
    facts: {
      property_type: ex('condo'), sale_price: ex(price), list_price: ex(price), area_sqft: ex(area),
      status_date: ex('2026-09-24'), floor: ex(20), beds: ex(3), baths: ex(2),
      views: ex(['park']), outdoor_private: ex(false), outdoor_kinds: ex([]), outdoor_shared: ex(false),
      service: ex({ doorman: 'full_time', concierge: true }), parking: ex([]), amenities: ex(['gym']),
      central_air: ex(true), dishwasher: ex(true), fireplace: ex(false), laundry: ex('installed'),
      finishes: ex(['hardwood floors']), policies: ex(['pets allowed']), unit_type: ex([]),
      common_charges_monthly: ex(3000), taxes_monthly: ex(2000), building_units: ex(100), building_stories: ex(30),
      ...facts,
    },
    engagement: null, building_name: null, neighborhood: 'Tribeca', agent_commentary: null,
    tags: { features: [], amenities: [], policies: [] }, ignored_export_price_per_sqft: null,
    flags: { closing_record: false, approx_area: false }, origin: null,
  };
  return { id, record, tier: 'primary', ...extra };
}

function subject(facts: Partial<PropertyFacts> = {}): EngineInput['subject'] {
  return {
    identity: identify({ address: '1 Subject Street, New York, NY', unit: '#20A' }),
    facts: {
      area_sqft: agent(2000), floor: agent(20), beds: agent(3), baths: agent(2),
      views: agent(['park']), outdoor_private: agent(false), outdoor_kinds: agent([]), outdoor_shared: agent(false),
      service: agent({ doorman: 'full_time', concierge: true }), parking: agent([]), amenities: agent(['gym']),
      central_air: agent(true), dishwasher: agent(true), fireplace: agent(false), laundry: agent('installed'),
      finishes: agent(['hardwood floors']), policies: agent(['pets allowed']), unit_type: agent([]),
      common_charges_monthly: agent(3000), taxes_monthly: agent(2000), building_units: agent(100), building_stories: agent(30),
      ...facts,
    },
  };
}

function run(parts: Partial<EngineInput>, houseMethod = TEST_HM): EngineOutput {
  return compute({ as_of: AS_OF, property_type: 'condo', subject: subject(), comps: [], ...parts }, { houseMethod });
}

const line = (out: EngineOutput, compId: string, lineId: string, kind: ResultKind = 'on_facts') =>
  out.comps.find((c) => c.id === compId)!.per_result[kind].adjustments.find((a) => a.line === lineId);

test('production: every applicable factor is considered, not calculated, and moves no number', () => {
  const out = run({
    subject: subject({ floor: agent(25), views: agent(['park', 'river']), outdoor_private: agent(true), outdoor_kinds: agent(['terrace']) }),
    comps: [comp('A', 4_000_000, 2_000), comp('B', 3_000_000, 1_500, { floor: ex(10) })],
    agent_adjustments: [],
  }, productionHouseMethod());
  for (const kind of ['on_facts', 'with_estimates'] as const) {
    const r = out.results[kind];
    assert.ok(r.bridge.lines.length > 0);
    for (const l of r.bridge.lines) {
      assert.equal(l.status, 'considered_not_calculated');
      assert.match(l.label, /value not yet determined/);
      assert.equal(l.effect_on_base, null);
      for (const c of l.comps) assert.equal(c.dollars, null);
    }
    assert.equal(r.bridge.start!.value, r.bridge.end!.value);
    for (const c of out.comps) {
      assert.equal(c.per_result[kind].adjusted_price!.value, c.per_result[kind].price!.value);
    }
  }
  assert.ok(!out.warnings.some((w) => w.code === 'double_counting_risk'));
  assert.ok(out.results.on_facts.bridge.lines.some((l) => l.id === 'floor'));
  assert.ok(out.results.on_facts.bridge.lines.some((l) => l.kind === 'interaction' && l.id === 'outdoor_space*views'));
});

test('a per-unit magnitude: floor, at 0.5% per floor', () => {
  const out = run({ comps: [comp('A', 4_000_000, 2_000, { floor: ex(10) })] });
  // Ten floors below the subject: 10 × 0.5% × $4,000,000.
  const l = line(out, 'A', 'floor')!;
  assert.equal(l.status, 'calculated');
  assert.equal(l.dollars, 200_000);
  assert.equal(l.direction, 'comp_inferior');
  assert.equal(line(out, 'A', 'floor', 'with_estimates')!.dollars, 200_000);
  assert.equal(out.comps[0]!.per_result.on_facts.adjusted_price!.value, 4_200_000);
  assert.equal(out.comps[0]!.per_result.on_facts.adjusted_price_per_sqft!.value, 2_100);
  assert.equal(out.results.on_facts.base!.value, 4_200_000); // $2,100 × the subject's 2,000 sqft
});

test('a by-degree magnitude needs a degree — from a confirmed judgment, never an unconfirmed one', () => {
  const comps = [comp('A', 4_000_000, 2_000, { views: ex([]) })];
  const none = run({ comps });
  assert.equal(line(none, 'A', 'views')!.status, 'considered_not_calculated');
  assert.match(line(none, 'A', 'views')!.why_not_calculated!, /how much it differs/);

  const jev = (confidence: FactorAssessment['confidence']): FactorAssessment[] => [{
    id: 'j1', comp_id: 'A', factor: 'views', direction: 'comp_inferior', degree: 'large', source: 'jev', confidence, probability: 0.91, as_of: AS_OF,
  }];
  const unconfirmed = run({ comps, assessments: jev('inferred') });
  assert.equal(line(unconfirmed, 'A', 'views')!.dollars, null);
  assert.ok(unconfirmed.pending_confirmation.some((p) => p.kind === 'assessment' && p.id === 'j1'));

  const confirmed = run({ comps, assessments: jev('exact') });
  assert.equal(line(confirmed, 'A', 'views')!.dollars, 240_000); // large: 6% of $4,000,000
  assert.equal(line(confirmed, 'A', 'views')!.degree, 'large');
  assert.ok(!confirmed.pending_confirmation.some((p) => p.id === 'j1'));
});

test("the agent's value lands in \"with estimates\" only, labelled as theirs", () => {
  const out = run({
    comps: [comp('A', 4_000_000, 2_000, { views: ex([]) })],
    agent_adjustments: [{ id: 'a1', factor: 'views', value: { percent: 3 }, as_of: AS_OF, reason: 'the park view' }],
  });
  assert.equal(line(out, 'A', 'views', 'on_facts')!.dollars, null);
  const l = line(out, 'A', 'views', 'with_estimates')!;
  assert.equal(l.status, 'agent_estimate');
  assert.equal(l.source, 'agent');
  assert.equal(l.dollars, 120_000);
  assert.equal(l.agent_adjustment_id, 'a1');
  assert.equal(out.results.on_facts.base!.value, 4_000_000);
  assert.equal(out.results.with_estimates.base!.value, 4_120_000);
  assert.equal(out.results.with_estimates.base!.confidence, 'guesstimate');
  assert.ok(out.results.with_estimates.estimates_used.some((e) => e.kind === 'agent_adjustment' && e.id === 'a1'));
  assert.deepEqual(out.results.on_facts.estimates_used, []);
  assert.equal(out.divergence.same, false);
  assert.equal(out.divergence.base.difference, 120_000);
  const bridgeLine = out.results.with_estimates.bridge.lines.find((x) => x.id === 'views')!;
  assert.equal(bridgeLine.label, "agent's estimate");
  assert.equal(bridgeLine.effect_on_base!.value, 120_000);
});

test("an agent's value can't apply without a direction, and can be limited to named comps", () => {
  const out = run({
    comps: [
      comp('A', 4_000_000, 2_000, { views: ex(['river']) }), // different, not fewer: needs a judgment
      comp('B', 4_000_000, 2_000, { views: ex([]) }),
      comp('C', 4_000_000, 2_000, { views: ex([]) }),
    ],
    agent_adjustments: [{ id: 'a1', factor: 'views', value: { percent: 3 }, comp_ids: ['A', 'B'], as_of: AS_OF }],
  });
  assert.equal(line(out, 'A', 'views', 'with_estimates')!.dollars, null);
  assert.match(line(out, 'A', 'views', 'with_estimates')!.why_not_calculated!, /which side is better/);
  assert.equal(line(out, 'B', 'views', 'with_estimates')!.dollars, 120_000);
  assert.equal(line(out, 'C', 'views', 'with_estimates')!.source, null); // not named: the house method, which needs a degree
});

test('substitutes take the larger adjustment, never the sum', () => {
  const out = run({
    subject: subject({ outdoor_private: agent(true), outdoor_kinds: agent(['terrace']), outdoor_shared: agent(true) }),
    comps: [comp('A', 4_000_000, 2_000)], // neither private nor shared outdoor space
    agent_adjustments: [
      { id: 'terrace', factor: 'outdoor_space', value: { percent: 5 }, as_of: AS_OF },
      { id: 'roof', factor: 'amenities', facet: 'shared_outdoor', value: { percent: 2 }, as_of: AS_OF },
    ],
  });
  const terrace = line(out, 'A', 'outdoor_space', 'with_estimates')!;
  const roof = line(out, 'A', 'amenities.shared_outdoor', 'with_estimates')!;
  assert.equal(terrace.dollars, 200_000);
  assert.equal(roof.dollars, 80_000);
  assert.equal(terrace.applied, true);
  assert.equal(roof.applied, false);
  assert.equal(roof.superseded_by, 'outdoor_space~shared_outdoor');
  assert.equal(out.comps[0]!.per_result.with_estimates.adjusted_price!.value, 4_200_000); // +5%, not +7%
});

test('substitutes pulling opposite ways net — that is no double count', () => {
  const out = run({
    subject: subject({ outdoor_private: agent(true), outdoor_kinds: agent(['terrace']), outdoor_shared: agent(false) }),
    comps: [comp('A', 4_000_000, 2_000, { outdoor_shared: ex(true) })], // a roof deck, no terrace
    agent_adjustments: [
      { id: 'terrace', factor: 'outdoor_space', value: { percent: 5 }, as_of: AS_OF },
      { id: 'roof', factor: 'amenities', facet: 'shared_outdoor', value: { percent: 2 }, as_of: AS_OF },
    ],
  });
  assert.equal(line(out, 'A', 'outdoor_space', 'with_estimates')!.dollars, 200_000);
  assert.equal(line(out, 'A', 'amenities.shared_outdoor', 'with_estimates')!.dollars, -80_000);
  assert.equal(out.comps[0]!.per_result.with_estimates.adjusted_price!.value, 4_120_000);
});

test('overlapping factors warn about double counting when both carry values', () => {
  const comps = [comp('A', 4_000_000, 2_000, { floor: ex(10), views: ex([]) })];
  const floorOnly: AgentAdjustment[] = [{ id: 'f', factor: 'floor', value: { percent_per_unit: 0.4 }, as_of: AS_OF }];
  const both: AgentAdjustment[] = [...floorOnly, { id: 'v', factor: 'views', value: { percent: 3 }, as_of: AS_OF }];
  const oneValue = run({ comps, agent_adjustments: floorOnly });
  assert.ok(!oneValue.warnings.some((w) => w.code === 'double_counting_risk' && w.results.includes('with_estimates') && /floor and views/.test(w.message)));
  const twoValues = run({ comps, agent_adjustments: both });
  const w = twoValues.warnings.find((x) => x.code === 'double_counting_risk' && x.results.includes('with_estimates') && /floor and views/.test(x.message));
  assert.ok(w, 'a floor × views warning');
  assert.match(w!.message, /a high floor often is the view/i);
  assert.deepEqual(w!.comp_ids, ['A']);
  // Both still apply — the warning is for the agent to act on.
  assert.equal(line(twoValues, 'A', 'floor', 'with_estimates')!.dollars, 160_000); // 10 floors × 0.4%
  assert.equal(line(twoValues, 'A', 'views', 'with_estimates')!.dollars, 120_000);
});

test('complements get an interaction line whose value is undetermined', () => {
  const out = run({
    subject: subject({ outdoor_private: agent(true), outdoor_kinds: agent(['terrace']), views: agent(['park', 'skyline']) }),
    comps: [comp('A', 4_000_000, 2_000, { views: ex([]) })],
  });
  const interaction = out.results.on_facts.bridge.lines.find((l) => l.kind === 'interaction')!;
  assert.equal(interaction.id, 'outdoor_space*views');
  assert.equal(interaction.status, 'considered_not_calculated');
  assert.equal(interaction.interaction!.relationship, 'complement');
  assert.deepEqual(interaction.comps.map((c) => c.comp_id), ['A']);
  assert.equal(interaction.comps[0]!.dollars, null);
});

test('interior size adjusts adjusted prices only; unit rates already scale by area', () => {
  // The comp is 200 sqft smaller at $2,000/sqft: 200 × $2,000 × 0.5 elasticity = +$200,000.
  const out = run({ comps: [comp('A', 3_600_000, 1_800)] });
  const l = line(out, 'A', 'interior_size')!;
  assert.equal(l.dollars, 200_000);
  assert.equal(l.applies_to_unit_rate, false);
  const r = out.comps[0]!.per_result.on_facts;
  assert.equal(r.adjusted_price!.value, 3_800_000);
  assert.equal(r.adjusted_price_per_sqft!.value, 2_000);
  assert.ok(!out.results.on_facts.bridge.lines.some((x) => x.id === 'interior_size')); // the lead is unit-rate
  const byPrice = compute({ as_of: AS_OF, property_type: 'condo', subject: subject(), comps: [comp('A', 3_600_000, 1_800)], method: { lead: { indicator: 'adjusted_price.median' } } }, { houseMethod: TEST_HM });
  assert.equal(byPrice.results.on_facts.bridge.lines.find((x) => x.id === 'interior_size')!.effect_on_base!.value, 200_000);
});

test('counts, carry, outdoor area and recency', () => {
  const out = run({
    subject: subject({ outdoor_private: agent(true), outdoor_kinds: agent(['terrace']), outdoor_area_sqft: agent(200) }),
    comps: [comp('A', 4_000_000, 2_000, {
      beds: ex(2), baths: ex(1.5),
      common_charges_monthly: ex(3500), taxes_monthly: ex(2500), // $1,000 a month more than the subject
      status_date: ex('2026-06-26'), // 90 days before the analysis date
    })],
  });
  assert.equal(line(out, 'A', 'beds_baths.bedrooms')!.dollars, 100_000);
  assert.equal(line(out, 'A', 'beds_baths.bathrooms')!.dollars, 25_000);
  assert.equal(line(out, 'A', 'carrying_costs')!.dollars, 100_000); // $1,000 × 100
  // A 200 sqft terrace at a 0.25 weight is 50 effective sqft, at the comp's $2,000/sqft.
  assert.equal(line(out, 'A', 'outdoor_space')!.dollars, 100_000);
  // 90 days is 2.957 months, at 0.2% a month of $4,000,000.
  assert.equal(line(out, 'A', 'recency_market')!.dollars, Math.round((90 / 30.436875) * 0.002 * 4_000_000));
});

test("an agent's value outside the house limits is flagged, with or without a reason", () => {
  const comps = [comp('A', 4_000_000, 2_000, { floor: ex(10) })];
  const noReason = run({ comps, agent_adjustments: [{ id: 'f', factor: 'floor', value: { percent_per_unit: 1 }, as_of: AS_OF }] });
  const w = noReason.warnings.find((x) => x.code === 'outside_house_bounds')!;
  assert.match(w.message, /10\.0% of its price, outside the house limits \(-5% to 5%\)/);
  assert.match(w.message, /needs the agent's reason/);
  const reasoned = run({ comps, agent_adjustments: [{ id: 'f', factor: 'floor', value: { percent_per_unit: 1 }, as_of: AS_OF, reason: 'the view opens up above 15' }] });
  assert.match(reasoned.warnings.find((x) => x.code === 'outside_house_bounds')!.message, /the view opens up above 15/);
});

test("a judgment of \"similar\" removes the engine's difference", () => {
  const out = run({
    comps: [comp('A', 4_000_000, 2_000, { floor: ex(18) })],
    assessments: [{ id: 'j', comp_id: 'A', factor: 'floor', direction: 'similar', source: 'agent', confidence: 'exact', as_of: AS_OF, note: 'same line, same views' }],
  });
  assert.equal(line(out, 'A', 'floor'), undefined);
  const cmp = out.comps[0]!.per_result.on_facts.comparisons.find((c) => c.line === 'floor')!;
  assert.equal(cmp.direction, 'similar');
  assert.equal(cmp.source, 'agent');
  assert.equal(cmp.units, 2); // the facts are still shown
});

test("each bridge line's effect is the base with it less the base without it", () => {
  const out = run({
    comps: [comp('A', 4_000_000, 2_000, { floor: ex(10) }), comp('B', 3_000_000, 1_500, { floor: ex(16) })],
    method: { lead: { indicator: 'unit_rate.mean' } },
  });
  // Floor lines: A +10 floors → +$200,000 ($100/sqft); B +4 floors → +$60,000 ($40/sqft). Mean +$70/sqft × 2,000 sqft.
  const floor = out.results.on_facts.bridge.lines.find((l) => l.id === 'floor')!;
  assert.equal(floor.effect_on_base!.value, 140_000);
  assert.equal(out.results.on_facts.bridge.start!.value, 4_000_000);
  assert.equal(out.results.on_facts.bridge.end!.value, 4_140_000);
});

// ── Regressions from the independent review ─────────────────────────────────

test("when the agent's value can't apply, the house method's stands — \"with estimates\" is never less than the facts", () => {
  const out = run({
    subject: subject({ outdoor_private: agent(true), outdoor_kinds: agent(['terrace']) }), // no size
    comps: [comp('A', 4_000_000, 2_000)],
    assessments: [{ id: 'j', comp_id: 'A', factor: 'outdoor_space', direction: 'comp_inferior', degree: 'moderate', source: 'agent', confidence: 'exact', as_of: AS_OF }],
    agent_adjustments: [{ id: 'w', factor: 'outdoor_space', value: { weights: { terrace: 0.3 } }, as_of: AS_OF }], // needs sizes
  });
  const facts = line(out, 'A', 'outdoor_space', 'on_facts')!;
  const estimates = line(out, 'A', 'outdoor_space', 'with_estimates')!;
  assert.equal(facts.dollars, 240_000); // moderate: 6% of $4,000,000
  assert.equal(estimates.dollars, 240_000);
  assert.equal(estimates.source, 'house_method');
  assert.match(estimates.basis, /agent's value \(w\) couldn't apply here/);
  assert.deepEqual(out.results.with_estimates.estimates_used, []);
  assert.equal(out.divergence.same, true);
});

test("a judgment's direction turns every kind of adjustment, not just some", () => {
  const out = run({
    subject: subject({ outdoor_private: agent(true), outdoor_kinds: agent(['terrace']), outdoor_area_sqft: agent(200) }),
    comps: [comp('A', 4_000_000, 2_000, {
      outdoor_private: ex(true), outdoor_kinds: ex(['terrace']), outdoor_area_sqft: ex(300), // bigger — but it faces an air shaft
      common_charges_monthly: ex(3_500), taxes_monthly: ex(2_500), // $1,000 a month more…
    })],
    assessments: [
      { id: 'o', comp_id: 'A', factor: 'outdoor_space', direction: 'comp_inferior', degree: 'moderate', source: 'agent', confidence: 'exact', as_of: AS_OF, note: 'faces an air shaft' },
      { id: 'c', comp_id: 'A', factor: 'carrying_costs', direction: 'comp_superior', source: 'agent', confidence: 'exact', as_of: AS_OF, note: 'the charges include heat and hot water' },
    ],
  });
  assert.equal(line(out, 'A', 'outdoor_space')!.dollars, 50_000); // 25 effective sqft at $2,000, turned the judgment's way
  assert.equal(line(out, 'A', 'carrying_costs')!.dollars, -100_000);
});

test('an estimate behind a house-method adjustment labels what it moves', () => {
  const out = run({
    subject: subject({ floor: agent(30, 'guesstimate') }),
    comps: [comp('A', 4_000_000, 2_000, { floor: ex(10) }), comp('B', 4_000_000, 2_000, { floor: ex(12) })],
  });
  assert.equal(line(out, 'A', 'floor', 'on_facts'), undefined); // no subject floor on the facts
  const l = line(out, 'A', 'floor', 'with_estimates')!;
  assert.equal(l.source, 'house_method');
  assert.equal(out.results.with_estimates.base!.confidence, 'guesstimate');
  assert.equal(out.comps.find((c) => c.id === 'A')!.per_result.with_estimates.adjusted_price!.confidence, 'guesstimate');
  assert.equal(out.results.on_facts.base!.confidence, 'exact');
});

test('a comp adjusted to zero or below is left out of the indicators, with a warning', () => {
  const judge = (factor: string): FactorAssessment => ({ id: `judged-${factor}`, comp_id: 'A', factor, direction: 'comp_superior', degree: 'large', source: 'agent', confidence: 'exact', as_of: AS_OF });
  const out = run({
    comps: [comp('A', 4_000_000, 2_000), comp('B', 4_000_000, 2_000), comp('C', 4_200_000, 2_000)],
    assessments: ['condition', 'layout_efficiency', 'micro_location'].map(judge),
    agent_adjustments: ['condition', 'layout_efficiency', 'micro_location'].map((factor, i) => ({ id: factor, factor, value: { percent: [60, 50, 40][i]! }, comp_ids: ['A'], as_of: AS_OF })),
    method: { lead: { indicator: 'adjusted_price.median' } },
  });
  const r = out.results.with_estimates;
  assert.equal(out.comps.find((c) => c.id === 'A')!.per_result.with_estimates.adjusted_price!.value, -2_000_000);
  assert.deepEqual([...r.indicators.adjusted_price.median.comp_ids].sort(), ['B', 'C']);
  assert.equal(r.range!.low.value, 4_000_000);
  assert.ok(out.warnings.some((w) => w.code === 'adjusted_value_not_positive' && w.comp_ids.includes('A')));
});

test('school zone is analyst view only: it moves neither result, whoever gives it a value', () => {
  const out = run({
    comps: [comp('A', 4_000_000, 2_000)],
    assessments: [{ id: 's', comp_id: 'A', factor: 'school_zone', direction: 'comp_inferior', degree: 'large', source: 'agent', confidence: 'exact', as_of: AS_OF }],
    agent_adjustments: [{ id: 'sz', factor: 'school_zone', value: { percent: 2 }, as_of: AS_OF }],
  });
  for (const kind of ['on_facts', 'with_estimates'] as const) {
    const l = line(out, 'A', 'school_zone', kind)!;
    assert.equal(l.dollars, null);
    assert.match(l.why_not_calculated!, /analyst view only/);
    assert.equal(out.results[kind].bridge.lines.find((b) => b.id === 'school_zone')!.client_visible, false);
  }
  assert.equal(out.results.with_estimates.base!.value, 4_000_000);
  assert.deepEqual(out.results.with_estimates.estimates_used, []);
  assert.ok(out.warnings.some((w) => w.code === 'analyst_only_factor'));
});

test("only estimates that move the lead are disclosed", () => {
  const superseded = run({
    subject: subject({ outdoor_private: agent(true), outdoor_kinds: agent(['terrace']), outdoor_shared: agent(true) }),
    comps: [comp('A', 4_000_000, 2_000), comp('B', 4_100_000, 2_000)],
    agent_adjustments: [
      { id: 'terrace', factor: 'outdoor_space', value: { percent: 5 }, as_of: AS_OF },
      { id: 'roof', factor: 'amenities', facet: 'shared_outdoor', value: { percent: 2 }, as_of: AS_OF },
    ],
  });
  const ids = superseded.results.with_estimates.estimates_used.map((e) => e.id);
  assert.ok(ids.includes('terrace'));
  assert.ok(!ids.includes('roof')); // superseded by the larger substitute
  const size = run({
    comps: [comp('A', 3_600_000, 1_800), comp('B', 4_000_000, 2_000)],
    agent_adjustments: [{ id: 'size', factor: 'interior_size', value: { elasticity: 0.4 }, as_of: AS_OF }],
  });
  // The lead is $/sqft, which interior size doesn't touch.
  assert.deepEqual(size.results.with_estimates.estimates_used, []);
  assert.equal(size.divergence.same, true);
});

test('the overlap warning names the factors that carry values, not the whole row', () => {
  const out = run({
    subject: subject({ unit_type: agent(['penthouse']), floor: agent(30) }),
    comps: [comp('A', 4_000_000, 2_000, { floor: ex(20) })],
    agent_adjustments: [
      { id: 'ph', factor: 'unit_type', value: { percent: 4 }, as_of: AS_OF },
      { id: 'fl', factor: 'floor', value: { percent_per_unit: 0.3 }, as_of: AS_OF },
    ],
  });
  const w = out.warnings.find((x) => x.code === 'double_counting_risk' && x.results.includes('with_estimates') && /penthouse premium/.test(x.message))!;
  assert.match(w.message, /^unit type and floor both carry values/);
});

test('tags compare whatever their case or wording', () => {
  const out = run({
    subject: subject({ amenities: agent(['Gym']), policies: agent(['Pets allowed']), views: agent(['Park view']), parking: agent(['Garage parking']) }),
    comps: [comp('A', 4_000_000, 2_000, { parking: ex(['garage']) })],
  });
  const cmp = out.comps[0]!.per_result.on_facts.comparisons;
  for (const lineId of ['amenities.general', 'policies', 'views', 'parking']) {
    assert.equal(cmp.find((c) => c.line === lineId)!.direction, 'similar', lineId);
  }
});

// ─── CR-2.1: design v0.4 ─────────────────────────────────────────────────────

/** A tag the export didn't list: "none listed", approximate (§6.2). */
const unlisted = <T>(value: T): Sourced<T> => ({ value, source: 'se_export', as_of: '2026-09-23', confidence: 'approx' });
const judged = (id: string, comp_id: string, factor: string, direction: FactorAssessment['direction'], degree: FactorAssessment['degree'], facet?: string): FactorAssessment =>
  ({ id, comp_id, factor, ...(facet ? { facet } : {}), direction, degree, source: 'agent', confidence: 'exact', as_of: AS_OF });
const comparison = (out: EngineOutput, compId: string, lineId: string, kind: ResultKind = 'on_facts') =>
  out.comps.find((c) => c.id === compId)!.per_result[kind].comparisons.find((c) => c.line === lineId);

test('"none listed" still lets a value apply, and what it feeds is approximate', () => {
  const comps = [comp('A', 4_000_000, 2_000, { outdoor_private: unlisted(false), outdoor_kinds: unlisted([]) })];
  const withTerrace = subject({ outdoor_private: agent(true), outdoor_kinds: agent(['terrace']) });
  // The agent's +5% for the terrace applies to a comp whose tags list none.
  const agentValue = run({ subject: withTerrace, comps, agent_adjustments: [{ id: 't', factor: 'outdoor_space', value: { percent: 5 }, as_of: AS_OF }] });
  assert.equal(line(agentValue, 'A', 'outdoor_space', 'with_estimates')!.dollars, 200_000);
  // Through a confirmed judgment, the house method's value applies on the facts — and the judgment
  // builds on the "none listed", so everything it feeds carries approx.
  const out = run({ subject: withTerrace, comps, assessments: [judged('j', 'A', 'outdoor_space', 'comp_inferior', 'moderate')] });
  assert.equal(comparison(out, 'A', 'outdoor_space')!.confidence, 'approx');
  assert.equal(line(out, 'A', 'outdoor_space')!.dollars, 240_000); // moderate: 6% (test values)
  assert.equal(out.comps[0]!.per_result.on_facts.adjusted_price!.confidence, 'approx');
  assert.equal(out.results.on_facts.base!.confidence, 'approx');
  // A judgment that overrides the facts stands alone: the agent knows the comp has the better terrace.
  const overridden = run({ subject: withTerrace, comps, assessments: [judged('j', 'A', 'outdoor_space', 'comp_superior', 'small')] });
  assert.equal(comparison(overridden, 'A', 'outdoor_space')!.confidence, 'exact');
});

test("a difference that rests on a tag one side doesn't list is approximate", () => {
  const out = run({
    subject: subject({ amenities: agent(['gym', 'pool']) }),
    comps: [comp('A', 4_000_000, 2_000), comp('B', 4_000_000, 2_000, { amenities: ex(['gym', 'pool', 'spa']) })],
  });
  // A "lacks" the pool only because its building's tags don't list one.
  assert.deepEqual([comparison(out, 'A', 'amenities.general')!.direction, comparison(out, 'A', 'amenities.general')!.confidence], ['comp_inferior', 'approx']);
  // B has more than the subject, whose amenities the agent stated: exact.
  assert.deepEqual([comparison(out, 'B', 'amenities.general')!.direction, comparison(out, 'B', 'amenities.general')!.confidence], ['comp_superior', 'exact']);
});

test("factor 9's systems compare as yes or no, and laundry by its three states", () => {
  const out = run({
    subject: subject({ central_air: agent(true), dishwasher: agent(true), fireplace: agent(true), laundry: agent('permitted') }),
    comps: [
      comp('A', 4_000_000, 2_000, { central_air: ex(true), dishwasher: unlisted(false), fireplace: ex(true), laundry: ex('installed') }),
      comp('B', 4_000_000, 2_000, { laundry: ex('prohibited') }),
      comp('C', 4_000_000, 2_000, { laundry: unlisted('none_listed') }),
    ],
  });
  const pick = (id: string, lineId: string) => {
    const c = comparison(out, id, lineId)!;
    return [c.status, c.direction, c.confidence];
  };
  assert.deepEqual(pick('A', 'finishes_systems.central_air'), ['compared', 'similar', 'exact']);
  assert.deepEqual(pick('A', 'finishes_systems.dishwasher'), ['compared', 'comp_inferior', 'approx']);
  assert.equal(comparison(out, 'A', 'finishes_systems.dishwasher')!.basis, 'subject has a dishwasher; comp lists no dishwasher');
  assert.deepEqual(pick('A', 'finishes_systems.laundry'), ['compared', 'comp_superior', 'exact']); // installed beats permitted
  assert.deepEqual(pick('B', 'finishes_systems.laundry'), ['compared', 'comp_inferior', 'exact']); // prohibited loses to permitted
  // None listed against permitted can't be ranked until the agent says whether the comp's building allows one.
  assert.deepEqual(pick('C', 'finishes_systems.laundry'), ['unknown', null, null]);
  assert.deepEqual(comparison(out, 'C', 'finishes_systems.laundry')!.missing, [
    { side: 'comp', field: 'laundry', label: "whether the comp's building permits a washer/dryer" },
  ]);
  // Against installed, though, none listed loses.
  const installed = run({ subject: subject({ laundry: agent('installed') }), comps: [comp('C', 4_000_000, 2_000, { laundry: unlisted('none_listed') })] });
  assert.deepEqual([comparison(installed, 'C', 'finishes_systems.laundry')!.direction, comparison(installed, 'C', 'finishes_systems.laundry')!.confidence], ['comp_inferior', 'approx']);
  // Quality and en-suite bathrooms take a judgment: no comparison until there is one, then the house method's value.
  assert.equal(comparison(out, 'A', 'finishes_systems.quality'), undefined);
  const graded = run({ comps: [comp('A', 4_000_000, 2_000)], assessments: [judged('q', 'A', 'finishes_systems', 'comp_superior', 'large', 'quality'), judged('e', 'A', 'finishes_systems', 'comp_inferior', 'small', 'en_suite')] });
  assert.equal(line(graded, 'A', 'finishes_systems.quality')!.dollars, -120_000); // large: 3%
  assert.equal(line(graded, 'A', 'finishes_systems.en_suite')!.dollars, 40_000); // small: 1%
});

test('distance is a selection rule, finishes names its line, and floor has a second line', () => {
  const comps = [comp('A', 4_000_000, 2_000, { floor: ex(10) })];
  assert.throws(() => run({ comps, assessments: [judged('d', 'A', 'distance', 'comp_inferior', 'small')] }),
    /distance is a selection rule, not an adjustment/);
  assert.throws(() => run({ comps, agent_adjustments: [{ id: 'd', factor: 'distance', value: { percent: 1 }, as_of: AS_OF }] }),
    /distance is a selection rule, not an adjustment/);
  assert.throws(() => run({ comps, agent_adjustments: [{ id: 'f', factor: 'finishes_systems', value: { percent: 2 }, as_of: AS_OF }] }),
    /finishes_systems has several lines — name one: quality, central_air, dishwasher, en_suite, fireplace, laundry/);
  // "floor" still names the per-floor line; the height against neighbouring buildings is its own, by judgment.
  const out = run({ comps, assessments: [judged('n', 'A', 'floor', 'comp_inferior', 'large', 'neighbours')] });
  assert.equal(line(out, 'A', 'floor')!.dollars, 200_000); // 10 floors × 0.5%
  assert.equal(line(out, 'A', 'floor.neighbours')!.dollars, 120_000); // large: 3%
  assert.equal(comparison(out, 'A', 'floor.neighbours')!.name, 'Height against neighbouring buildings');
});

test("v0.4's new overlaps warn when both sides carry values", () => {
  const out = run({
    comps: [comp('A', 4_000_000, 2_000, { dishwasher: ex(false), common_charges_monthly: ex(3500) })],
    assessments: [
      judged('dw', 'A', 'finishes_systems', 'comp_inferior', 'small', 'dishwasher'),
      judged('c', 'A', 'condition', 'comp_inferior', 'moderate'),
      judged('tx', 'A', 'tax_abatements', 'comp_superior', 'small'),
    ],
  });
  const overlaps = out.warnings.filter((w) => w.code === 'double_counting_risk' && w.results.includes('on_facts')).map((w) => w.message);
  assert.ok(overlaps.some((m) => /^dishwasher and condition both carry values \(the house method\) — overlap: A renovation shows up in both$/.test(m)), overlaps.join('\n'));
  assert.ok(overlaps.some((m) => /^tax exemptions and abatements and carrying costs both carry values .* An exemption is lower taxes, already in the carry$/.test(m)), overlaps.join('\n'));
});

test('factors 37–39 are adjustments by judgment, all null in production', () => {
  const comps = [comp('A', 4_000_000, 2_000)];
  const assessments = [
    judged('f', 'A', 'financing_terms', 'comp_inferior', 'small'),
    judged('t', 'A', 'tenant_in_place', 'comp_inferior', 'moderate'),
    judged('n', 'A', 'non_realty_items', 'comp_superior', 'small'),
  ];
  const out = run({ comps, assessments });
  assert.equal(line(out, 'A', 'financing_terms')!.dollars, 40_000); // small: 1%
  assert.equal(line(out, 'A', 'tenant_in_place')!.dollars, 80_000); // moderate: 2%
  assert.equal(line(out, 'A', 'non_realty_items')!.dollars, -25_000); // the furniture in its price: small, $25,000
  const production = run({ comps, assessments }, productionHouseMethod());
  for (const id of ['financing_terms', 'tenant_in_place', 'non_realty_items']) {
    const l = line(production, 'A', id)!;
    assert.deepEqual([l.status, l.dollars], ['considered_not_calculated', null], id);
  }
});
