// The two results (§6.4), the lead, base and range (§6.5), and the rules that
// keep them honest: evidence classes, like for like, inputs called out rather
// than assumed, what-ifs kept apart, and determinism.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../util/canonical-json.ts';
import { compute, EngineInputError, verifyOutputHash, type EngineInput } from '../index.ts';
import { agentFact, ANALYSIS_DATE, comps, hannah, input, KEY, SUBJECT_IDENTITY, subjectFacts } from './helpers.ts';

const SOLD_RATE = {
  chambers: 4_650_000 / 2_201, laight: 4_600_000 / 3_000, hudson: 2_240_000 / 1_935, franklin: 4_175_000 / 1_840, leonard66: 5_700_000 / 2_319,
};

test('the base defaults to the median, labelled as the default pending Noble', () => {
  const r = compute(input()).results.on_facts;
  assert.equal(r.lead.indicator, 'unit_rate.median');
  assert.equal(r.lead.chosen_by, 'default');
  assert.match(r.lead.label, /default method, pending Noble/);
  assert.equal(r.base!.value, Math.round(SOLD_RATE.chambers * 2000)); // $4,225,352
  assert.equal(r.base!.unit, 'usd');
  assert.equal(r.base!.source, 'engine');
});

test('the range runs from the lowest to the highest implied value among primary sold comps', () => {
  const r = compute(input()).results.on_facts;
  assert.equal(r.range!.low.value, Math.round(SOLD_RATE.hudson * 2000));
  assert.equal(r.range!.high.value, Math.round(SOLD_RATE.leonard66 * 2000));
  assert.equal(r.range!.narrowed, false);
  assert.deepEqual([...r.range!.comp_ids].sort(), [KEY.chambers, KEY.laight, KEY.hudson, KEY.franklin, KEY.leonard66].sort());
  // Tiering the ground floors out narrows it to what's left.
  const upper = compute(input({ comps: comps({ laight: 'excluded', hudson: 'secondary' }) })).results.on_facts;
  assert.equal(upper.range!.low.value, Math.round(SOLD_RATE.chambers * 2000));
  assert.deepEqual(upper.indicators.unit_rate.median.comp_ids.length, 3);
});

test('the agent picks the lead from the indicators shown side by side', () => {
  const anchored = comps().map((c) => (c.id === KEY.franklin ? { ...c, anchor: true } : c));
  const out = compute(input({ comps: anchored, method: { lead: { indicator: 'unit_rate.anchor', reason: 'same line, two floors down' } } }));
  const r = out.results.on_facts;
  assert.equal(r.lead.chosen_by, 'agent');
  assert.equal(r.lead.reason, 'same line, two floors down');
  assert.equal(r.base!.value, Math.round(SOLD_RATE.franklin * 2000));
  assert.equal(r.base!.confidence, 'approx'); // 5 Franklin's area is approximate
  const mean = (Object.values(SOLD_RATE).reduce((a, b) => a + b) / 5) * 2000;
  assert.equal(r.indicators.unit_rate.mean.implied_value!.value, Math.round(mean));
  assert.equal(r.indicators.adjusted_price.median.implied_value!.value, 4_600_000);
  assert.equal(r.indicators.adjusted_price.mean.implied_value!.value, 4_273_000);
  assert.equal(r.indicators.adjusted_price.anchor.implied_value!.value, 4_175_000);
});

test('an anchor that is not a primary sold comp gives no anchor indicator, and says why', () => {
  const activeAnchor = comps().map((c) => (c.id === KEY.barclay11f ? { ...c, anchor: true } : c));
  const out = compute(input({ comps: activeAnchor, method: { lead: { indicator: 'unit_rate.anchor' } } }));
  const r = out.results.on_facts;
  assert.equal(r.indicators.unit_rate.anchor.status, 'unavailable');
  assert.match(r.indicators.unit_rate.anchor.reason!, /isn't a sold comp/);
  assert.equal(r.base, null);
  assert.ok(out.gaps.some((g) => g.code === 'base_unavailable'));
  assert.ok(out.warnings.some((w) => w.code === 'anchor_not_sold'));
  // No silent fallback to another indicator.
  assert.notEqual(r.base, r.indicators.unit_rate.median.implied_value);
});

test('a missing subject area is called out, not assumed', () => {
  const out = compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: {} } }));
  const r = out.results.on_facts;
  assert.equal(r.base, null);
  assert.equal(r.range, null);
  assert.match(r.range_unavailable_because!, /subject's interior area/);
  assert.equal(r.indicators.unit_rate.median.per_sqft!.value, SOLD_RATE.chambers); // the rate is still shown
  assert.equal(r.indicators.adjusted_price.median.implied_value!.value, 4_600_000);
  assert.ok(out.gaps.some((g) => g.code === 'subject_area_missing' && g.results.length === 2));
});

test("an estimated subject area is in \"with estimates\" only — and the gap shows the divergence", () => {
  const out = compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ area_sqft: agentFact(2000, 'guesstimate') }) } }));
  assert.equal(out.results.on_facts.base, null);
  assert.equal(out.results.with_estimates.base!.value, Math.round(SOLD_RATE.chambers * 2000));
  assert.equal(out.results.with_estimates.base!.confidence, 'guesstimate');
  assert.ok(out.results.with_estimates.estimates_used.some((e) => e.kind === 'stated_fact' && e.what === 'area_sqft'));
  assert.ok(out.gaps.some((g) => g.code === 'subject_area_estimate_only' && g.results[0] === 'on_facts'));
  assert.equal(out.divergence.same, false);
  assert.equal(out.divergence.base.difference, null);
});

test('a narrowing is the agent’s estimate: "with estimates" only, and inside the bracket', () => {
  const narrowing = { low: 3_900_000, high: 4_700_000, reason: 'the ground-floor sales are a different product', as_of: ANALYSIS_DATE };
  const out = compute(input({ method: { narrowing } }));
  assert.equal(out.results.on_facts.range!.narrowed, false);
  const r = out.results.with_estimates;
  assert.equal(r.range!.narrowed, true);
  assert.equal(r.range!.low.value, 3_900_000);
  assert.equal(r.range!.low.confidence, 'guesstimate');
  assert.equal(r.bracket!.low.value, out.results.on_facts.range!.low.value); // the bracket is kept
  assert.ok(r.estimates_used.some((e) => e.kind === 'narrowing'));
  const outside = compute(input({ method: { narrowing: { ...narrowing, high: 9_000_000 } } }));
  assert.equal(outside.results.with_estimates.range!.narrowed, false);
  assert.ok(outside.warnings.some((w) => w.code === 'narrowing_outside_bracket'));
});

test('one primary sold comp is a point, and a range is never a point', () => {
  const out = compute(input({ comps: comps({ laight: 'excluded', hudson: 'excluded', franklin: 'excluded', leonard66: 'excluded' }) }));
  const r = out.results.on_facts;
  assert.equal(r.base!.value, Math.round(SOLD_RATE.chambers * 2000));
  assert.equal(r.range, null);
  assert.match(r.range_unavailable_because!, /never a point/);
  assert.ok(out.gaps.some((g) => g.code === 'range_unavailable'));
});

test('a recency window applies to both results and says what it dropped', () => {
  const out = compute(input({ method: { recency: { since: '2026-09-01', reason: 'rates moved in August' } } }));
  const r = out.results.on_facts;
  // Sold on or after 1 September: 181 Hudson (9/17), 5 Franklin (9/15), 66 Leonard (9/2).
  assert.deepEqual([...r.indicators.unit_rate.median.comp_ids].sort(), [KEY.hudson, KEY.franklin, KEY.leonard66].sort());
  const chambers = out.comps.find((c) => c.id === KEY.chambers)!;
  assert.equal(chambers.flags.outside_recency_window, true);
  assert.match(chambers.per_result.with_estimates.not_included_because[0]!, /^sold 2026-08-27, before the recency window opens \(2026-09-01\)$/);
  // In-contract comps count by their contract date: all three went into contract before September.
  assert.equal(r.evidence.in_contract.counts.included, 0);
  const moore = out.comps.find((c) => c.id === KEY.moore)!;
  assert.equal(moore.flags.outside_recency_window, true);
  assert.deepEqual(moore.per_result.on_facts.not_included_because, ['went into contract 2026-04-13, before the recency window opens (2026-09-01)']);
  // Active asks are current evidence: exempt.
  assert.equal(r.evidence.active.counts.included, 3);
  // Three months back from 2026-09-24 opens on 2026-06-24: both Leonard contracts (7/22, 7/28) are in, 25 N Moore (4/13) is out.
  const quarter = compute(input({ method: { recency: { months: 3 } } })).results.on_facts;
  assert.deepEqual([...quarter.evidence.in_contract.price_per_sqft!.comp_ids].sort(), [KEY.leonard101, KEY.leonard108].sort());
  // One month back from 2026-09-24 opens the window on 2026-08-24; 79 Laight, sold that day, is inside.
  const month = compute(input({ method: { recency: { months: 1 } } })).results.on_facts;
  assert.equal(month.indicators.unit_rate.median.n, 5);
  const dayLater = compute(input({ method: { recency: { since: '2026-08-25' } } })).results.on_facts;
  assert.equal(dayLater.indicators.unit_rate.median.n, 4);
  assert.ok(!dayLater.indicators.unit_rate.median.comp_ids.includes(KEY.laight));
});

test('an in-contract comp needs a contract date inside the window; an estimated one is disclosed', () => {
  const window = { recency: { months: 3 } };
  // No contract date: it can't be tested, so it's out — and says why.
  const undated = comps().map((c) => (c.id === KEY.leonard108
    ? { ...c, record: { ...c.record, facts: { ...c.record.facts, status_date: undefined } } }
    : c));
  const out = compute(input({ comps: undated, method: window }));
  assert.deepEqual(out.comps.find((c) => c.id === KEY.leonard108)!.per_result.on_facts.not_included_because,
    ['no contract date to test against the recency window']);
  // The agent's guess at an earlier contract date takes 108 Leonard out of "with estimates" only.
  const guessed = compute(input({
    method: window,
    stated_facts: [{ id: 'contract', target: { comp_id: KEY.leonard108 }, field: 'status_date', value: agentFact('2026-05-01', 'guesstimate') }],
  }));
  assert.equal(guessed.results.on_facts.evidence.in_contract.counts.included, 2);
  assert.equal(guessed.results.with_estimates.evidence.in_contract.counts.included, 1);
  assert.ok(guessed.results.with_estimates.estimates_used.some((e) => e.id === 'contract' && e.target === KEY.leonard108));
  assert.equal(guessed.results.with_estimates.evidence.in_contract.price_per_sqft!.median.confidence, 'guesstimate');
  assert.equal(guessed.results.on_facts.evidence.in_contract.price_per_sqft!.median.confidence, 'exact');
  assert.equal(guessed.divergence.same, true); // asks don't make the base or the range
});

test('like for like: a co-op in a condo report never enters a statistic', () => {
  const mixed = comps().map((c) => (c.id === KEY.chambers
    ? { ...c, record: { ...c.record, facts: { ...c.record.facts, property_type: { ...c.record.facts.property_type!, value: 'coop' as const } } } }
    : c));
  const out = compute(input({ comps: mixed }));
  const c = out.comps.find((x) => x.id === KEY.chambers)!;
  assert.equal(c.flags.property_type_mismatch, true);
  assert.equal(c.per_result.on_facts.included, false);
  assert.equal(out.results.on_facts.evidence.sold.counts.included, 4);
  assert.ok(out.warnings.some((w) => w.code === 'property_type_mismatch'));
});

test('co-ops switch $/sqft off everywhere and lead on adjusted prices', () => {
  const coopComps = comps().map((c) => ({ ...c, record: { ...c.record, facts: { ...c.record.facts, property_type: { ...c.record.facts.property_type!, value: 'coop' as const } } } }));
  const out = compute(input({
    property_type: 'coop', comps: coopComps, prices: [{ id: 'p', label: 'List', kind: 'list', price: 4_500_000 }],
    subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ maintenance_monthly: agentFact(6_000) }) },
  }));
  const r = out.results.on_facts;
  assert.equal(r.indicators.unit_rate.status, 'off');
  assert.equal(r.indicators.unit_rate.median.status, 'unavailable');
  assert.equal(r.lead.indicator, 'adjusted_price.median');
  assert.equal(r.base!.value, 4_600_000);
  assert.equal(r.range!.low.value, 2_240_000);
  assert.equal(r.range!.high.value, 5_700_000);
  // No $/sqft figure anywhere — square footage is unreliable for co-ops (§6.3).
  for (const cls of ['sold', 'in_contract', 'active'] as const) assert.equal(r.evidence[cls].price_per_sqft, null);
  assert.equal(r.asks_vs_sold.sold_band, null);
  assert.equal(r.carry.subject_per_sqft, null);
  assert.equal(r.carry.comp_median_per_sqft, null);
  assert.equal(out.prices[0]!.per_result.on_facts.per_sqft, null);
  for (const c of out.comps) {
    const pr = c.per_result.on_facts;
    assert.equal(pr.price_per_sqft, null);
    assert.equal(pr.adjusted_price_per_sqft, null);
    assert.equal(pr.implied_value, null);
    assert.equal(pr.carry_per_sqft, null);
    assert.match(pr.no_unit_rate_because!, /co-op/);
  }
});

test("trust but verify: a stated fact is used, and a contradiction with the export is flagged", () => {
  const out = compute(input({
    stated_facts: [{ id: 's1', target: { comp_id: KEY.leonard101 }, field: 'floor', value: agentFact(5) },
      { id: 's2', target: { comp_id: KEY.chambers }, field: 'area_sqft', value: agentFact(2_250) }],
  }));
  const five = out.comps.find((c) => c.id === KEY.leonard101)!;
  assert.equal(five.flags.floor_missing, false); // filled by the agent: no contradiction, nothing to verify against
  const chambers = out.comps.find((c) => c.id === KEY.chambers)!;
  assert.equal(chambers.per_result.on_facts.area_sqft!.value, 2_250);
  assert.equal(chambers.per_result.on_facts.area_sqft!.source, 'agent');
  const w = out.warnings.filter((x) => x.code === 'contradiction');
  assert.equal(w.length, 1);
  assert.match(w[0]!.message, /area_sqft: the agent stated 2250 \(s2\); the export says 2201/);
  assert.deepEqual(w[0]!.results, ['on_facts', 'with_estimates']);
});

test('inferred values are in neither result until confirmed', () => {
  const lookup = subjectFacts({ area_sqft: agentFact(2000, 'inferred', 'listing') });
  const out = compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: lookup } }));
  assert.equal(out.results.on_facts.base, null);
  assert.equal(out.results.with_estimates.base, null);
  assert.ok(out.pending_confirmation.some((p) => p.target === 'subject' && p.what === 'area_sqft' && p.source === 'listing'));
  const confirmed = compute(input({
    subject: { identity: SUBJECT_IDENTITY, facts: lookup },
    stated_facts: [{ id: 'c1', target: 'subject', field: 'area_sqft', value: agentFact(2000) }],
  }));
  assert.equal(confirmed.results.on_facts.base!.value, Math.round(SOLD_RATE.chambers * 2000));
  assert.ok(!confirmed.pending_confirmation.some((p) => p.what === 'area_sqft'));
});

test('what-ifs are the agent’s, and never mixed into either result', () => {
  const hypothetical = [{ id: 'h1', target: 'subject' as const, field: 'area_sqft' as const, value: agentFact(2400, 'exact', 'hypothetical') }];
  const report = compute(input({ stated_facts: hypothetical }));
  assert.equal(report.results.on_facts.base!.value, Math.round(SOLD_RATE.chambers * 2000));
  assert.ok(report.warnings.some((w) => w.code === 'hypothetical_ignored'));
  const whatIf = compute(input({ stated_facts: hypothetical }), { mode: 'what_if' });
  assert.equal(whatIf.meta.mode, 'what_if');
  assert.equal(whatIf.results.on_facts.base!.value, Math.round(SOLD_RATE.chambers * 2400));
});

test('named prices — a target, a call — are evaluated against the results and never change them', () => {
  const plain = compute(input());
  const priced = compute(input({ prices: [{ id: 't', label: "Seller's target", kind: 'target', price: 11_500_000 }, { id: 'c', label: "Agent's call", kind: 'call', price: 4_535_000 }] }));
  assert.deepEqual(priced.results, plain.results);
  assert.deepEqual(priced.comps, plain.comps);
  assert.equal(priced.prices[0]!.per_result.on_facts.vs_range!.position, 'above');
});

test('deterministic: the same input gives the same output and hash; comp order does not matter', () => {
  const a = compute(input());
  const b = compute(input());
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(a.meta.output_hash, b.meta.output_hash);
  assert.ok(verifyOutputHash(a));
  const reversed = compute(input({ comps: comps().reverse() }));
  assert.equal(reversed.meta.inputs_hash, a.meta.inputs_hash);
  assert.equal(reversed.meta.output_hash, a.meta.output_hash);
  const tampered = structuredClone(a);
  tampered.results.on_facts.base!.value += 1;
  assert.equal(verifyOutputHash(tampered), false);
  assert.match(a.meta.inputs_hash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.meta.engine_version, '0.5.0');
  assert.deepEqual(a.meta.parser_versions, ['0.5.0']);
});

test('the hash changes with anything that changes the answer', () => {
  const a = compute(input());
  const b = compute(input({ comps: comps({ hudson: 'secondary' }) }));
  const c = compute(input({ as_of: '2026-09-25' }));
  assert.notEqual(a.meta.inputs_hash, b.meta.inputs_hash);
  assert.notEqual(a.meta.inputs_hash, c.meta.inputs_hash);
  assert.notEqual(a.meta.output_hash, b.meta.output_hash);
});

test('a malformed input is refused with every problem listed', () => {
  const bad = {
    ...input(),
    as_of: '24/09/2026',
    comps: [...comps(), { ...comps()[0]!, tier: 'maybe' }],
    agent_adjustments: [{ id: 'x', factor: 'charm', value: { percent: 5 }, as_of: ANALYSIS_DATE }, { id: 'y', factor: 'views', value: { percent: 500 }, as_of: ANALYSIS_DATE }],
    stated_facts: [{ id: 'z', target: 'subject', field: 'area_sqft', value: agentFact(1999.5) }],
  } as unknown as EngineInput;
  const error = (() => { try { compute(bad); } catch (e) { return e; } return null; })();
  assert.ok(error instanceof EngineInputError);
  const issues = (error as EngineInputError).issues.join('\n');
  assert.match(issues, /as_of must be a YYYY-MM-DD date/);
  assert.match(issues, /is used twice/);
  assert.match(issues, /tier must be primary, secondary or excluded/);
  assert.match(issues, /charm is not an adjustable factor line/);
  assert.match(issues, /percentages are written as percent/);
  assert.match(issues, /whole square feet/);
});

test('an estimate that takes a comp out of "with estimates" is disclosed, and what rests on it is labelled', () => {
  const out = compute(input({
    stated_facts: [{ id: 'type', target: { comp_id: KEY.leonard66 }, field: 'property_type', value: agentFact('coop', 'guesstimate') }],
  }));
  const [a, b] = [out.results.on_facts, out.results.with_estimates];
  assert.equal(a.evidence.sold.counts.included, 5);
  assert.equal(b.evidence.sold.counts.included, 4);
  assert.notEqual(b.base!.value, a.base!.value);
  assert.ok(b.estimates_used.some((e) => e.id === 'type' && e.target === KEY.leonard66));
  assert.equal(out.divergence.same, false);
  // Every remaining sold comp is exact or approximate — but which comps count rests on the estimate.
  assert.equal(b.base!.confidence, 'guesstimate');
  assert.equal(b.range!.high.confidence, 'guesstimate');
  assert.equal(b.evidence.sold.price_per_sqft!.median.confidence, 'guesstimate');
  assert.equal(b.evidence.in_contract.price_per_sqft!.median.confidence, 'exact'); // untouched class
  assert.notEqual(a.base!.confidence, 'guesstimate');
});

test('identical implied values are a point, not a range', () => {
  const [first] = comps().filter((c) => c.id === KEY.chambers);
  const twin = { ...first!, id: 'twin', record: { ...first!.record, identity: { ...first!.record.identity, key: 'twin' } } };
  const out = compute(input({ comps: [first!, twin] }));
  assert.equal(out.results.on_facts.bracket, null);
  assert.equal(out.results.on_facts.range, null);
  assert.match(out.results.on_facts.range_unavailable_because!, /all imply the same value/);
  assert.equal(out.results.on_facts.base!.value, Math.round(SOLD_RATE.chambers * 2000));
});

test("agent values are magnitudes: negatives are refused, except the market's own movement", () => {
  const refused = (() => {
    try { compute(input({ agent_adjustments: [{ id: 'neg', factor: 'views', value: { percent: -5 }, as_of: ANALYSIS_DATE }] })); }
    catch (e) { return e; }
    return null;
  })();
  assert.ok(refused instanceof EngineInputError);
  assert.match((refused as EngineInputError).issues.join(), /must not be negative — the comparison says which way/);
  // A falling market is negative, and allowed.
  const falling = compute(input({ agent_adjustments: [{ id: 'mkt', factor: 'recency_market', value: { percent_per_unit: -0.5 }, as_of: ANALYSIS_DATE }] }));
  const line = falling.comps.find((c) => c.id === KEY.chambers)!.per_result.with_estimates.adjustments.find((l) => l.line === 'recency_market')!;
  assert.ok(line.dollars! < 0);
});

test("each missing subject fact is a gap that names the field to ask for", () => {
  const out = compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: { area_sqft: agentFact(2000) } } }));
  const fields = out.gaps.filter((g) => g.code === 'subject_fact_missing').map((g) => g.field);
  for (const field of ['floor', 'beds', 'baths', 'views', 'outdoor_private', 'service', 'parking', 'common_charges_monthly']) {
    assert.ok(fields.includes(field), field);
  }
  assert.ok(!fields.includes('area_sqft'));
  assert.equal(new Set(fields).size, fields.length);
});

test('input the engine can’t trust is refused cleanly, never a crash', () => {
  const issues = (i: EngineInput) => { try { compute(i); } catch (e) { return e instanceof EngineInputError ? e.issues.join('\n') : `not an EngineInputError: ${e}`; } return ''; };
  assert.match(issues(input({ financing: { price: 'base', down_payment: { percent: 20 }, annual_rate_percent: NaN, term_years: 30 } })), /annual_rate_percent/);
  assert.match(issues(input({ method: { narrowing: { reason: 'tighter', as_of: ANALYSIS_DATE } } })), /needs a low, a high or both/);
  const odd = comps().map((c, i) => (i === 0 ? { ...c, record: { ...c.record, engagement: { page_views: NaN, saves: 1, shares: 1 } } } : c));
  assert.match(issues(input({ comps: odd })), /JSON can't/);
});

test("a carry that's only an estimate is a gap for \"on the facts\" alone", () => {
  const out = compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ common_charges_monthly: agentFact(3_600, 'guesstimate'), taxes_monthly: agentFact(3_300) }) } }));
  const gap = out.gaps.find((g) => g.code === 'subject_carry_missing')!;
  assert.deepEqual(gap.results, ['on_facts']);
  assert.match(gap.message, /only an estimate/);
});

test('the parsed export goes straight in', () => {
  const parsed = hannah();
  const out = compute({ as_of: ANALYSIS_DATE, property_type: 'condo', subject: { identity: SUBJECT_IDENTITY, facts: {} }, comps: comps({}, parsed) });
  assert.equal(out.comps.length, 11);
  assert.equal(out.meta.property_type, 'condo');
});
