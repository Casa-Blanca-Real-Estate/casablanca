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
      finishes: ex(['central air']), policies: ex(['pets allowed']), unit_type: ex([]),
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
      finishes: agent(['central air']), policies: agent(['pets allowed']), unit_type: agent([]),
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
