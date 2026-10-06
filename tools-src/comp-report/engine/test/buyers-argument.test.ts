// The engine for a buyer's argument (CR-2.2 phase 2): "didn't sell" as a
// fourth evidence status, the differences between comps (§6.6), the price
// table (§6.5) and the headline's facts (§10.2). None of it moves a number the
// engine already gives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compRecordFromManual, compute, type CompInput, type CompOut, type EngineOutput, type NamedPrice, type PairOut, type PropertyFacts,
} from '../index.ts';
import { incrementFor } from '../compute/price-table.ts';
import { agentFact, allNumbers, comps, input, KEY, subjectFacts, SUBJECT_IDENTITY } from './helpers.ts';

const READ_ON = '2026-09-29';

function typed(id: string, fields: Parameters<typeof compRecordFromManual>[0], extra: Partial<PropertyFacts> = {}, tier: CompInput['tier'] = 'primary'): CompInput {
  const { record } = compRecordFromManual(fields, { as_of: READ_ON });
  return { id, record: { ...record, facts: { ...record.facts, ...extra } }, tier };
}
const comp = (out: EngineOutput, id: string): CompOut => out.comps.find((c) => c.id === id)!;

// ─── Didn't sell ─────────────────────────────────────────────────────────────

/** Two listings that came off the market unsold: one asking inside the sold band, one above it. */
function unsold(): CompInput[] {
  return [
    typed('unsold-20A', { address: '120 Test Street, New York, NY', unit: '#20A', status: 'off_market', price: 4_400_000, date: '6/15/2026', area_sqft: 2000, floor: 18 }),
    typed('unsold-21A', { address: '120 Test Street, New York, NY', unit: '#21A', status: 'off_market', price: 5_200_000, date: '8/20/2026', area_sqft: 2000, floor: 19 }),
  ];
}

test("didn't sell is its own evidence status: ask basis, its own statistics, never mixed with sales", () => {
  const plain = compute(input()).results.on_facts;
  const r = compute(input({ comps: [...comps(), ...unsold()] })).results.on_facts;
  const e = r.evidence.off_market;
  assert.deepEqual([e.evidence_class, e.basis, e.counts.total, e.counts.included, e.counts.with_unit_rate], ['off_market', 'ask', 2, 2, 2]);
  assert.equal(e.price_per_sqft!.median.value, 2400);
  assert.equal(e.price_per_sqft!.min.value, 2200);
  assert.match(e.price_per_sqft!.median.derivation, /ask basis/);
  // The sales, the base and the range are untouched.
  assert.deepEqual(r.evidence.sold, plain.evidence.sold);
  assert.deepEqual([r.base, r.range], [plain.base, plain.range]);
  assert.ok(!r.range!.comp_ids.some((id) => id.startsWith('unsold')));
  // Shown against the sold band: the class median, and the lowest ask that didn't sell as a ceiling signal.
  const soldMedian = r.asks_vs_sold.sold_band!.median.value;
  assert.equal(r.asks_vs_sold.class_medians.off_market!.versus_sold_median_percent.value, (2400 / soldMedian - 1) * 100);
  const ceiling = r.asks_vs_sold.ceiling!;
  assert.deepEqual([ceiling.comp_id, ceiling.lowest.value, ceiling.position], ['unsold-20A', 2200, 'within']);
  assert.equal(ceiling.versus_sold_median_percent.value, (2200 / soldMedian - 1) * 100);
  assert.equal(plain.asks_vs_sold.ceiling, null);
});

test("a didn't-sell comp: an ask, a ceiling against the sold band, and a recency window by the day it came off", () => {
  const out = compute(input({ comps: [...comps(), ...unsold()] }));
  const c = comp(out, 'unsold-20A');
  assert.deepEqual([c.evidence_class, c.basis, c.flags.off_market, c.flags.unrecognised_status], ['off_market', 'ask', true, false]);
  assert.deepEqual(c.market_date, { date: '2026-06-15', basis: 'off_market_date', age_days: 101 });
  assert.equal(c.per_result.on_facts.ask_vs_sold!.position, 'within');
  assert.equal(comp(out, 'unsold-21A').per_result.on_facts.ask_vs_sold!.position, 'above');
  assert.equal(c.sale_to_ask_percent, null);
  const windowed = compute(input({ comps: [...comps(), ...unsold()], method: { recency: { since: '2026-07-01' } } }));
  assert.deepEqual(comp(windowed, 'unsold-20A').per_result.on_facts.not_included_because, ['came off the market 2026-06-15, before the recency window opens (2026-07-01)']);
  assert.equal(windowed.results.on_facts.evidence.off_market.counts.included, 1);
  // Its age is flagged from the same day.
  const age = comp(compute(input({ comps: unsold(), as_of: '2027-01-10' })), 'unsold-20A').checks.find((k) => k.code === 'sale_age')!;
  assert.equal(age.message, 'Came off the market 2026-06-15, over 6 months ago: old for a comp');
  // A record from parser 0.3.0 — didn't sell kept only as its listing status — reads the same.
  const old = unsold()[0]!;
  const legacy = { ...old, record: { ...old.record, status: { ...old.record.status, evidence_class: null } } };
  assert.equal(comp(compute(input({ comps: [legacy] })), 'unsold-20A').evidence_class, 'off_market');
});

// ─── Pairs ───────────────────────────────────────────────────────────────────

/**
 * Four sales in one building, each apart from the next by one factor or one
 * close group of them. Their charges differ, as a building's do from floor to
 * floor — and one building's carrying costs are one factor, not a difference.
 */
function building(): CompInput[] {
  const sale = (unit: string, floor: number, price: number, date: string, extra: Partial<PropertyFacts>) =>
    typed(unit, {
      address: '10 Test Street, New York, NY', unit, status: 'sold', price, date, area_sqft: 1000, floor, beds: 2, baths: 2, property_type: 'Condo',
      common_charges_monthly: 1000 + 10 * floor, taxes_monthly: 900 + 10 * floor,
    }, { outdoor_private: agentFact(false), views: agentFact([] as string[]), ...extra });
  return [
    sale('A', 5, 1_500_000, '9/1/2026', {}),
    sale('B', 8, 1_560_000, '8/1/2026', {}),
    sale('C', 5, 1_650_000, '7/1/2026', { outdoor_private: agentFact(true), outdoor_kinds: agentFact(['terrace' as const]) }),
    sale('D', 9, 1_700_000, '6/1/2026', { views: agentFact(['city']) }),
  ];
}
const pair = (out: EngineOutput, a: string, b: string): PairOut =>
  out.results.on_facts.pairs.pairs.find((p) => (p.higher === a && p.lower === b) || (p.higher === b && p.lower === a))!;

test('pairs: the gap and the factors that differ; clean when one factor, or one overlap group, differs', () => {
  const out = compute(input({ comps: building() }));
  const pairs = out.results.on_facts.pairs.pairs;
  assert.equal(pairs.length, 6);
  const ab = pair(out, 'A', 'B');
  assert.deepEqual([ab.higher, ab.lower, ab.ordered_by, ab.price_gap.value, ab.price_per_sqft_gap!.value, ab.same_building], ['B', 'A', 'price_per_sqft', 60_000, 60, true]);
  assert.deepEqual(ab.differences.map((d) => [d.line, d.direction, d.difference]), [['floor', 'higher_better', 3]]);
  assert.deepEqual([ab.clean, ab.isolates], [true, { kind: 'factor', key: 'floor', name: 'Floor' }]);
  assert.equal(ab.differences[0]!.basis, '10 Test Street #B floor 8, 10 Test Street #A floor 5');
  assert.equal(ab.months_apart, 1);
  // The building's own factors are alike by definition; what neither side says is listed, not guessed.
  assert.ok(ab.alike.includes('carrying_costs') && ab.alike.includes('service_level') && ab.alike.includes('recency_market'));
  assert.ok(ab.unknown.some((u) => u.line === 'unit_type'));

  const ac = pair(out, 'A', 'C');
  assert.deepEqual([ac.higher, ac.price_per_sqft_gap!.value, ac.isolates!.key], ['C', 150, 'outdoor_space']);
  // Floor and views overlap (A.5): a pair apart in both is still clean, on the group.
  const ad = pair(out, 'A', 'D');
  assert.deepEqual([ad.clean, ad.isolates], [true, { kind: 'overlap_group', key: 'floor*views', name: 'Floor and views' }]);
  const bc = pair(out, 'B', 'C');
  assert.deepEqual([bc.higher, bc.clean, bc.not_clean_because], ['C', false, '2 factors differ: floor and outdoor space']);
  assert.deepEqual(bc.differences.map((d) => [d.line, d.direction, d.difference]), [['floor', 'lower_better', -3], ['outdoor_space', 'higher_better', null]]);
  assert.equal(pair(out, 'C', 'D').not_clean_because, '3 factors differ: floor, views and outdoor space');
});

test("clean pairs, summarised factor by factor: evidence of what a factor adds here — and nothing moves a number", () => {
  const out = compute(input({ comps: building() }));
  const evidence = out.results.on_facts.pairs.clean_pair_evidence;
  assert.deepEqual(evidence.map((e) => [e.key, e.n, e.summary]), [
    ['floor', 1, 'Floor: about $60/sq ft, from 1 clean pair'],
    ['floor*views', 2, 'Floor and views: about $170/sq ft, from 2 clean pairs'],
    ['outdoor_space', 1, 'Outdoor space: about $150/sq ft, from 1 clean pair'],
  ]);
  const group = evidence[1]!;
  assert.deepEqual([group.per_sqft_gap!.min.value, group.per_sqft_gap!.max.value, group.price_gap!.median.value], [140, 200, 170_000]);
  assert.deepEqual(group.pairs, [{ higher: 'D', lower: 'A' }, { higher: 'D', lower: 'B' }]);
  // Evidence, never a value: every factor is still "considered, not calculated", and the base is the comps' own median.
  const r = out.results.on_facts;
  assert.ok(r.bridge.lines.every((l) => l.status === 'considered_not_calculated' && l.effect_on_base === null));
  assert.equal(r.base!.value, Math.round(((1560 + 1650) / 2) * 2000));
  // Judgment factors can't be compared comp against comp, and the output says which.
  assert.ok(r.pairs.not_compared.includes('Condition') && r.pairs.not_compared.includes('Exposure and light'));
  assert.match(r.pairs.note, /nothing here moves a number/);
});

test('pairs stay within a status, sold first; time counts past "old for a comp"', () => {
  const extra = [
    // The same as A, eight months earlier: apart only in time.
    typed('E', { address: '10 Test Street, New York, NY', unit: 'E', status: 'sold', price: 1_400_000, date: '1/1/2026', area_sqft: 1000, floor: 5, beds: 2, baths: 2, property_type: 'Condo' },
      { outdoor_private: agentFact(false), views: agentFact([] as string[]) }),
    typed('F', { address: '10 Test Street, New York, NY', unit: 'F', status: 'in_contract', price: 1_600_000, date: '9/1/2026', area_sqft: 1000, floor: 6 }),
    typed('G', { address: '10 Test Street, New York, NY', unit: 'G', status: 'in_contract', price: 1_700_000, date: '9/10/2026', area_sqft: 1000, floor: 6 }),
    typed('H', { address: '10 Test Street, New York, NY', unit: 'H', status: 'sold', price: 9_000_000, date: '9/1/2026', area_sqft: 1000, floor: 6 }, {}, 'secondary'),
  ];
  const out = compute(input({ comps: [...building(), ...extra] }));
  const pairs = out.results.on_facts.pairs.pairs;
  assert.deepEqual([...new Set(pairs.map((p) => p.evidence_class))], ['sold', 'in_contract']);
  assert.ok(!pairs.some((p) => p.higher === 'H' || p.lower === 'H')); // secondary: not in the numbers, not in a pair
  assert.ok(!pairs.some((p) => [p.higher, p.lower].includes('F') && [p.higher, p.lower].some((id) => 'ABCDE'.includes(id))));
  const ae = pair(out, 'A', 'E');
  assert.deepEqual([ae.higher, ae.months_apart, ae.isolates], ['A', 8, { kind: 'factor', key: 'recency_market', name: 'Recency and market movement' }]);
  assert.deepEqual(ae.differences.map((d) => [d.line, d.direction, d.difference]), [['recency_market', 'differs', 8]]);
  const time = out.results.on_facts.pairs.clean_pair_evidence.find((e) => e.key === 'recency_market')!;
  assert.equal(time.summary, 'Recency and market movement: the later one about $100/sq ft higher, from 1 clean pair');
  const fg = pair(out, 'F', 'G');
  assert.deepEqual([fg.basis, fg.clean, fg.not_clean_because], ['ask', false, "nothing the engine compares differs — the gap lies in what it can't compare: condition, layout, light and the rest"]);
});

test("Hannah's comps: sixteen pairs, none clean — different buildings differ in their building's factors", () => {
  const out = compute(input());
  const pairs = out.results.on_facts.pairs.pairs;
  assert.equal(pairs.length, 10 + 3 + 3);
  assert.ok(pairs.every((p) => !p.clean && p.not_clean_because !== null));
  assert.deepEqual(out.results.on_facts.pairs.clean_pair_evidence, []);
  // No area, no $/sqft: 100 Barclay #11F's pairs are ordered by price.
  for (const p of pairs.filter((x) => x.higher === KEY.barclay11f || x.lower === KEY.barclay11f)) {
    assert.deepEqual([p.ordered_by, p.price_per_sqft_gap], ['price', null]);
  }
  const ch = pair(out, KEY.chambers, KEY.hudson);
  assert.deepEqual([ch.higher, ch.price_gap.value, Math.trunc(ch.price_per_sqft_gap!.value)], [KEY.chambers, 2_410_000, 955]);
  assert.deepEqual(ch.differences.find((d) => d.line === 'carrying_costs')!.direction, 'lower_better');
});

// ─── The price table ─────────────────────────────────────────────────────────

test("the price table reproduces Frankie's for #517: $880 – $638K · $900 – $652,500 …", () => {
  const sale = (id: string, price: number) => typed(id, { address: '111 Fulton Street, New York, NY', unit: id, status: 'sold', price, date: '7/1/2026', area_sqft: 1000, floor: 5 });
  const out = compute(input({
    subject: { identity: SUBJECT_IDENTITY, facts: { area_sqft: agentFact(725) } },
    comps: [sale('880', 880_000), sale('915', 915_000), sale('925', 925_000)],
  }));
  const table = out.results.on_facts.price_table!;
  assert.equal(table.increment, 20);
  assert.deepEqual(table.rows.map((r) => [r.kind, r.per_sqft.value, r.price.value]), [
    ['comp', 880, 638_000], ['step', 900, 652_500], ['comp', 915, 663_375], ['step', 920, 667_000], ['comp', 925, 670_625],
  ]);
  // Its ends are the range's.
  const range = out.results.on_facts.range!;
  assert.deepEqual([table.rows[0]!.price.value, table.rows.at(-1)!.price.value], [range.low.value, range.high.value]);
  for (const row of table.rows) {
    for (const f of [row.per_sqft, row.price]) assert.deepEqual([f.source, f.as_of, typeof f.derivation], ['engine', '2026-09-24', 'string']);
  }
  assert.match(table.rows[1]!.price.derivation, /the home's 725 sq ft × \$900\/sq ft/);
  assert.match(table.rows[0]!.per_sqft.derivation, /111 Fulton Street #880's own \$\/sqft/);
});

test("Hannah's table: round steps that suit the level, and her comps' own rates", () => {
  const out = compute(input());
  const table = out.results.on_facts.price_table!;
  assert.equal(table.increment, 200);
  assert.deepEqual(table.rows.map((r) => [r.kind, Math.trunc(r.per_sqft.value)]), [
    ['comp', 1157], ['step', 1200], ['step', 1400], ['comp', 1533], ['step', 1600], ['step', 1800], ['step', 2000],
    ['comp', 2112], ['step', 2200], ['comp', 2269], ['step', 2400], ['comp', 2457],
  ]);
  assert.equal(table.rows.find((r) => r.kind === 'step' && r.per_sqft.value === 2200)!.price.value, 4_400_000);
  for (const [low, high, increment] of [[880, 925, 20], [1157.6, 2457.9, 200], [2112, 2140, 20], [2112, 2457, 50], [150, 180, 5]] as const) {
    assert.equal(incrementFor(low, high), increment, `${low}–${high}`);
  }
});

test("the table follows each result's range — the agent's narrowing too — and says when it can't be made", () => {
  const narrowed = compute(input({ method: { narrowing: { low: 3_000_000, reason: 'the first floors are a different product', as_of: '2026-09-24' } } }));
  const facts = narrowed.results.on_facts.price_table!;
  const est = narrowed.results.with_estimates.price_table!;
  assert.equal(facts.rows[0]!.price.value, narrowed.results.on_facts.range!.low.value); // on the facts: not narrowed
  assert.deepEqual([est.rows[0]!.kind, est.rows[0]!.per_sqft.value, est.rows[0]!.price.value], ['range_end', 1500, 3_000_000]);
  assert.ok(!est.rows.some((r) => r.comp_ids.includes(KEY.hudson)));
  assert.match(est.basis, /inside the agent's narrowed range/);
  const why = (out: EngineOutput) => out.results.on_facts.price_table_unavailable_because;
  assert.match(why(compute(input({ property_type: 'coop' })))!, /co-op reports don't use \$\/sqft/);
  assert.equal(why(compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: {} } }))), "it needs the home's interior size");
  assert.equal(why(compute(input({ comps: comps({ laight: 'excluded', hudson: 'excluded', franklin: 'excluded', leonard66: 'excluded' }) }))),
    'it needs at least two primary sold comps with a $/sqft');
});

// ─── The headline's facts ────────────────────────────────────────────────────

const CALL = (low: number, high: number): NamedPrice[] => [
  { id: 'call_low', label: 'Your call, low', kind: 'call', price: low }, { id: 'call_high', label: 'Your call, high', kind: 'call', price: high },
];

test("headline facts: every figure a headline may cite, each with its provenance — and the agent's number kept apart", () => {
  const anchored = comps().map((c) => (c.id === KEY.chambers ? { ...c, anchor: true } : c));
  const out = compute(input({ comps: anchored, prices: CALL(3_400_000, 4_200_000) }));
  const h = out.headline_facts.on_facts;
  const r = out.results.on_facts;
  assert.deepEqual(h.facts.map((f) => f.id), [
    'range.low', 'range.low_per_sqft', 'range.high', 'range.high_per_sqft', 'range.comps', 'base', 'base.per_sqft', 'sold.count',
    'anchor.price', 'anchor.per_sqft', 'anchor.implied',
    'sold.median_per_sqft', 'sold.median_price', 'sold.median_sale_to_ask', 'sold.median_days_on_market',
    'in_contract.count', 'in_contract.median_per_sqft', 'in_contract.median_price', 'in_contract.vs_sold_median', 'in_contract.median_days_on_market',
    'active.count', 'active.median_per_sqft', 'active.median_price', 'active.vs_sold_median', 'active.median_days_on_market',
    'home.area_sqft',
  ]);
  const fact = (id: string) => h.facts.find((f) => f.id === id)!;
  assert.deepEqual([fact('range.low').value, fact('range.high').value, fact('base').value], [r.range!.low.value, r.range!.high.value, r.base!.value]);
  assert.deepEqual([fact('range.low').comp_ids, fact('range.low_per_sqft').comp_ids], [[KEY.hudson], [KEY.hudson]]);
  assert.equal(fact('range.low_per_sqft').value, 2_240_000 / 1935);
  assert.deepEqual([fact('range.comps').value, fact('sold.count').value, fact('range.comps').unit], [5, 5, 'count']);
  assert.deepEqual([fact('anchor.price').value, fact('anchor.price').source, fact('anchor.implied').value], [4_650_000, 'se_export', 4_225_352]);
  assert.deepEqual([fact('home.area_sqft').value, fact('home.area_sqft').source], [2000, 'agent']);
  // Every engine figure here is one the output already carries: QA can trace each to its source.
  const carried = new Set(allNumbers({ results: out.results, comps: out.comps }).map((n) => n.value));
  for (const f of h.facts) if (f.source === 'engine' && f.unit !== 'count') assert.ok(carried.has(f.value), f.id);
  // The agent's number is theirs, apart from the facts the assistant may see (§8.4).
  assert.ok(!h.facts.some((f) => f.source === 'agent' && f.id.startsWith('agent')));
  assert.deepEqual(h.agent_number, {
    position: 'within',
    facts: [
      { id: 'agent.low', label: "the low end of the agent's number", value: 3_400_000, unit: 'usd', source: 'agent', as_of: '2026-09-24', confidence: 'exact', derivation: "the agent's own number, given before the reveal", comp_ids: [] },
      { id: 'agent.high', label: "the high end of the agent's number", value: 4_200_000, unit: 'usd', source: 'agent', as_of: '2026-09-24', confidence: 'exact', derivation: "the agent's own number, given before the reveal", comp_ids: [] },
    ],
  });
  // Names a headline may use: "#17L" and "200 Chambers" aren't figures.
  assert.deepEqual(h.names[0], { id: 'subject', address: '100 Barclay Street', unit: '#17L' });
  const named = new Set(h.names.map((n) => n.id));
  for (const f of h.facts) for (const id of f.comp_ids) assert.ok(named.has(id), id);
  assert.deepEqual(h.missing, []);
});

test("where the agent's number sits: below, above, overlapping, spanning or within the range — and by how much", () => {
  const at = (low: number, high: number) => compute(input({ prices: CALL(low, high) })).headline_facts.on_facts.agent_number!;
  // Hannah's range with every comp primary: $2,315,245 to $4,915,912.
  const below = at(1_900_000, 2_200_000);
  assert.equal(below.position, 'below');
  assert.deepEqual(below.facts.at(-1)!.id, 'agent.below_range_by');
  assert.equal(below.facts.at(-1)!.value, 2_315_245 - 2_200_000);
  const above = at(5_000_000, 5_500_000);
  assert.deepEqual([above.position, above.facts.at(-1)!.id, above.facts.at(-1)!.value], ['above', 'agent.above_range_by', 5_000_000 - 4_915_912]);
  assert.equal(at(2_000_000, 3_000_000).position, 'overlaps_low');
  assert.equal(at(4_500_000, 5_200_000).position, 'overlaps_high');
  assert.equal(at(2_000_000, 5_500_000).position, 'spans');
  assert.equal(compute(input()).headline_facts.on_facts.agent_number, null);
});

test('headline facts per result, and what a headline can\'t say yet', () => {
  const narrowed = compute(input({ method: { narrowing: { low: 3_000_000, reason: 'the first floors are a different product', as_of: '2026-09-24' } } }));
  const est = narrowed.headline_facts.with_estimates.facts.find((f) => f.id === 'range.low_per_sqft')!;
  assert.deepEqual([est.value, est.confidence, est.comp_ids], [1500, 'guesstimate', []]);
  assert.equal(narrowed.headline_facts.on_facts.facts.find((f) => f.id === 'range.low_per_sqft')!.comp_ids[0], KEY.hudson);
  const one = compute(input({ comps: comps({ laight: 'excluded', hudson: 'excluded', franklin: 'excluded', leonard66: 'excluded' }) })).headline_facts.on_facts;
  assert.ok(!one.facts.some((f) => f.id.startsWith('range.')));
  assert.ok(one.missing.some((m) => m.startsWith('no range: a range needs at least two primary sold comps')));
  assert.ok(one.missing.includes('no closest comp: the agent marks one sold primary comp as the anchor'));
  const coop = compute(input({ property_type: 'coop' })).headline_facts.on_facts;
  assert.ok(!coop.facts.some((f) => f.unit === 'usd_per_sqft'));
  // Didn't sell has its own line, with the lowest ask the market didn't meet.
  const unsoldOut = compute(input({ comps: [...comps(), ...unsold()] })).headline_facts.on_facts;
  const fact = (id: string) => unsoldOut.facts.find((f) => f.id === id)!;
  assert.deepEqual([fact('off_market.count').value, fact('off_market.median_per_sqft').value, fact('off_market.lowest_per_sqft').value, fact('off_market.lowest_price').value],
    [2, 2400, 2200, 4_400_000]);
});
