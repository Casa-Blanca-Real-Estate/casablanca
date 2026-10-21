// The engine for Findings (CR-2.4, Dispatch 19): the five-row price table
// (NW-065 a), no $/sqft gaps on a co-op (NW-066 a), and gaps an agent can act
// on (NW-077 b). None of it moves the range.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute, type EngineOutput } from '../index.ts';
import { agentFact, comps, input, KEY, subjectFacts, SUBJECT_IDENTITY } from './helpers.ts';

const five = (out: EngineOutput, kind: 'on_facts' | 'with_estimates' = 'on_facts') => out.results[kind].price_table!.five_rows;

test('five rows: the range’s ends exactly, and evenly spaced whole-dollar rates between them', () => {
  const out = compute(input());
  const rows = five(out);
  const range = out.results.on_facts.range!;
  assert.deepEqual(rows.map((r) => r.step), ['low', 'quarter', 'middle', 'three_quarter', 'high']);
  assert.equal(rows[0]!.price, range.low);
  assert.equal(rows[4]!.price, range.high);
  const [low, high] = [rows[0]!.per_sqft.value, rows[4]!.per_sqft.value];
  for (const [i, q] of [[1, 1], [2, 2], [3, 3]] as const) {
    const rate = rows[i]!.per_sqft.value;
    assert.equal(rate, Math.round(low + (q / 4) * (high - low)));
    assert.equal(rows[i]!.price.value, rate * 2000);
    assert.deepEqual(rows[i]!.comp_ids, []);
  }
  // The middle is the midpoint, not the median comp (the base).
  assert.notEqual(rows[2]!.price.value, out.results.on_facts.base!.value);
  // Each end is named by its comp.
  const table = out.results.on_facts.price_table!;
  assert.deepEqual(rows[0]!.comp_ids, table.rows[0]!.comp_ids);
  assert.deepEqual(rows[4]!.comp_ids, table.rows.at(-1)!.comp_ids);
  // The old rows stay, for the email, the writer and QA.
  assert.ok(table.rows.length > 5);
});

test('a narrowed end is the agent’s, named by no comp', () => {
  const out = compute(input({ method: { narrowing: { low: 3_000_000, reason: 'the first floors are a different product', as_of: '2026-09-24' } } }));
  const rows = five(out, 'with_estimates');
  assert.equal(rows[0]!.price.value, 3_000_000);
  assert.equal(rows[0]!.per_sqft.value, 1500);
  assert.deepEqual(rows[0]!.comp_ids, []);
  assert.equal(rows[4]!.price, out.results.with_estimates.range!.high);
  assert.equal(rows[2]!.per_sqft.value, Math.round(1500 + (rows[4]!.per_sqft.value - 1500) / 2));
});

test('no five rows where there is no table: a co-op, or no size', () => {
  assert.equal(compute(input({ property_type: 'coop' })).results.on_facts.price_table, null);
  assert.equal(compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: {} } })).results.on_facts.price_table, null);
});

test('a co-op report raises no gap about interior size', () => {
  const out = compute(input({ property_type: 'coop', subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ area_sqft: agentFact(2000, 'guesstimate') }) } }));
  const none = compute(input({ property_type: 'coop', subject: { identity: SUBJECT_IDENTITY, facts: {} } }));
  for (const o of [out, none]) {
    const codes = o.gaps.map((g) => g.code);
    for (const code of ['subject_area_missing', 'subject_area_estimate_only', 'comp_area_missing']) assert.ok(!codes.includes(code), code);
    assert.ok(!o.gaps.some((g) => g.field === 'area_sqft'));
  }
  // The condo report still asks.
  const condo = compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ area_sqft: agentFact(2000, 'guesstimate') }) } }));
  assert.ok(condo.gaps.some((g) => g.code === 'subject_area_estimate_only'));
});

test('a comp’s gaps only where the comp counts', () => {
  assert.ok(compute(input()).gaps.some((g) => g.code === 'comp_floor_missing' && g.target === KEY.leonard101));
  for (const tier of ['secondary', 'excluded'] as const) {
    const out = compute(input({ comps: comps({ leonard101: tier }) }));
    assert.ok(!out.gaps.some((g) => g.target === KEY.leonard101), tier);
  }
});

test('the home’s size is asked once, and each gap says whether the agent can fill it', () => {
  const out = compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ area_sqft: agentFact(2000, 'guesstimate'), unit_type: undefined }) } }));
  assert.equal(out.gaps.filter((g) => g.field === 'area_sqft' && g.target === 'subject').length, 1);
  const by = (code: string, field: string | null = null) => out.gaps.find((g) => g.code === code && (field === null || g.field === field));
  assert.equal(by('subject_area_estimate_only')!.fillable, true);
  assert.equal(by('base_unavailable')!.fillable, false);
  assert.equal(by('range_unavailable')!.fillable, false);
  assert.equal(by('comp_floor_missing')!.fillable, true);
  for (const g of out.gaps) assert.equal(typeof g.fillable, 'boolean');
  const bare = compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: { area_sqft: agentFact(2000) } } }));
  const field = (f: string) => bare.gaps.find((g) => g.code === 'subject_fact_missing' && g.field === f)!;
  for (const f of ['year_built', 'service', 'parking', 'amenities', 'outdoor_shared', 'floor']) assert.equal(field(f).fillable, true, f);
  assert.equal(field('unit_type').fillable, false);
});

test('gap messages say “the home”, never “the subject”', () => {
  const outs = [
    compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: {} } })),
    compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ area_sqft: agentFact(2000, 'guesstimate') }) } })),
  ];
  for (const out of outs) {
    assert.ok(out.gaps.length > 0);
    for (const g of out.gaps) assert.doesNotMatch(g.message, /subject/i, g.message);
  }
  assert.match(outs[0]!.gaps.find((g) => g.code === 'subject_fact_missing' && g.field === 'year_built')!.message, /^The home's year built/);
});
