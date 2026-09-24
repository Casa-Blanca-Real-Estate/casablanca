// Design §6.8 — Hannah's export for 100 Barclay St #17L must reproduce the
// hand-verified figures. Expected values are worked from the raw export rows
// here, not taken from the engine.
//
// Whole-dollar $/sqft figures are truncated, as StreetEasy truncates them
// (see README → "Displaying $/sqft"); the engine itself returns exact values.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../index.ts';
import { comps, hannah, input, KEY, truncated } from './helpers.ts';

const SOLD = {
  chambers: 4_650_000 / 2_201,
  laight: 4_600_000 / 3_000,
  hudson: 2_240_000 / 1_935,
  franklin: 4_175_000 / 1_840,
  leonard66: 5_700_000 / 2_319,
};

const near = (actual: number | undefined, expected: number, what: string) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-9, `${what}: expected ${expected}, got ${actual}`);

test('sold, all five: mean $1,906/sqft and median $2,112/sqft', () => {
  const sold = compute(input()).results.on_facts.evidence.sold;
  const values = Object.values(SOLD);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  near(sold.price_per_sqft?.mean.value, mean, 'mean');
  near(sold.price_per_sqft?.median.value, SOLD.chambers, 'median');
  assert.equal(truncated(sold.price_per_sqft!.mean.value), 1906);
  assert.equal(truncated(sold.price_per_sqft!.median.value), 2112);
  assert.equal(sold.price_per_sqft!.n, 5);
  assert.equal(sold.basis, 'sale');
});

test('sold on floor 10 and up: mean $2,279/sqft', () => {
  // The agent's call: the two ground-floor units are a different product for a 17th-floor unit.
  const parsed = hannah();
  const lowFloors = parsed.comps
    .filter((c) => c.status.evidence_class === 'sold' && (c.facts.floor?.value ?? 0) < 10)
    .map((c) => c.identity.key);
  assert.deepEqual(lowFloors.sort(), [KEY.hudson, KEY.laight].sort());
  const out = compute(input({ comps: comps({ laight: 'secondary', hudson: 'secondary' }) }));
  const sold = out.results.on_facts.evidence.sold;
  const mean = (SOLD.chambers + SOLD.franklin + SOLD.leonard66) / 3;
  near(sold.price_per_sqft?.mean.value, mean, 'mean');
  assert.equal(truncated(sold.price_per_sqft!.mean.value), 2279);
  assert.deepEqual([...sold.price_per_sqft!.comp_ids].sort(), [KEY.chambers, KEY.franklin, KEY.leonard66].sort());
  // The judgment swings the answer ~20%, as the orientation says.
  assert.ok(sold.price_per_sqft!.mean.value / (Object.values(SOLD).reduce((a, b) => a + b) / 5) > 1.19);
});

test('in-contract and active $/sqft are on ask basis: 1,625 · 2,387 · 2,400 and 2,763 · 3,091', () => {
  const out = compute(input());
  const rate = (key: string) => {
    const c = out.comps.find((x) => x.id === key)!;
    assert.equal(c.basis, 'ask');
    return truncated(c.per_result.on_facts.price_per_sqft!.value);
  };
  assert.deepEqual([rate(KEY.leonard101), rate(KEY.moore), rate(KEY.leonard108)], [1625, 2387, 2400]);
  assert.deepEqual([rate(KEY.reade), rate(KEY.murray)], [2763, 3091]);
  near(out.comps.find((x) => x.id === KEY.leonard108)!.per_result.on_facts.price_per_sqft!.value, 4_835_000 / 2_014, '108 Leonard');
  const ev = out.results.on_facts.evidence;
  assert.equal(ev.in_contract.basis, 'ask');
  assert.equal(ev.active.basis, 'ask');
  // StreetEasy's PDF agrees on the class-pure figures: in contract $2,137, active $2,927.
  assert.equal(truncated(ev.in_contract.price_per_sqft!.mean.value), 2137);
  assert.equal(truncated(ev.active.price_per_sqft!.mean.value), 2927);
});

test('~1,840 is flagged approximate, and its $/sqft inherits it', () => {
  const parsed = hannah();
  const franklin = parsed.comps.find((c) => c.identity.key === KEY.franklin)!;
  assert.equal(franklin.facts.area_sqft?.value, 1840);
  assert.equal(franklin.facts.area_sqft?.confidence, 'approx');
  assert.equal(franklin.flags.approx_area, true);
  assert.ok(parsed.warnings.some((w) => w.code === 'approx_area' && w.row === 4));
  const out = compute(input());
  const c = out.comps.find((x) => x.id === KEY.franklin)!;
  assert.equal(c.flags.approx_area, true);
  assert.equal(c.per_result.on_facts.price_per_sqft?.confidence, 'approx');
  assert.equal(out.results.on_facts.evidence.sold.price_per_sqft?.mean.confidence, 'approx');
  assert.ok(out.warnings.some((w) => w.code === 'approx_area' && w.comp_ids.includes(KEY.franklin)));
  // Approximate is still "on the facts" (§6.4).
  assert.ok(out.results.on_facts.evidence.sold.price_per_sqft!.comp_ids.includes(KEY.franklin));
});

test('79 Laight #1A is flagged as a public-record closing', () => {
  const parsed = hannah();
  const laight = parsed.comps.find((c) => c.identity.key === KEY.laight)!;
  assert.equal(laight.flags.closing_record, true);
  assert.equal(laight.identity.streeteasy?.kind, 'closing');
  assert.equal(laight.identity.streeteasy?.closing_id, '11324235');
  // Its zeros are "no data", not zero.
  assert.equal(laight.facts.days_on_market, undefined);
  assert.equal(laight.engagement, null);
  assert.equal(laight.facts.list_price, undefined);
  assert.ok(parsed.warnings.some((w) => w.code === 'closing_record' && w.row === 2));
  const out = compute(input());
  const c = out.comps.find((x) => x.id === KEY.laight)!;
  assert.equal(c.flags.closing_record, true);
  assert.equal(c.sale_to_ask_percent, null);
  assert.ok(out.warnings.some((w) => w.code === 'closing_record' && w.comp_ids.includes(KEY.laight)));
  // Sold days on market leave the closing out: StreetEasy's 91 counts its 0 as a real zero.
  const dom = out.results.on_facts.days_on_market.sold!;
  assert.equal(dom.n, 4);
  assert.equal(dom.mean.value, (24 + 25 + 148 + 259) / 4);
});

test('100 Barclay #11F contributes no unit-rate indication', () => {
  const out = compute(input());
  const c = out.comps.find((x) => x.id === KEY.barclay11f)!;
  assert.equal(c.evidence_class, 'active');
  assert.equal(c.flags.area_missing, true);
  assert.equal(c.per_result.on_facts.price_per_sqft, null);
  assert.match(c.per_result.on_facts.no_unit_rate_because ?? '', /no interior area/);
  assert.equal(out.results.on_facts.evidence.active.counts.included, 3);
  assert.equal(out.results.on_facts.evidence.active.counts.with_unit_rate, 2);
  assert.ok(!out.results.on_facts.evidence.active.price_per_sqft!.comp_ids.includes(KEY.barclay11f));
  assert.ok(out.gaps.some((g) => g.code === 'comp_area_missing' && g.target === KEY.barclay11f));
  // It's the subject's own building — the one same-building comp.
  assert.equal(c.flags.same_building_as_subject, true);
  assert.equal(out.comps.filter((x) => x.flags.same_building_as_subject).length, 1);
});

test('101 Leonard #5B has no floor', () => {
  const parsed = hannah();
  assert.equal(parsed.comps.find((c) => c.identity.key === KEY.leonard101)!.facts.floor, undefined);
  const out = compute(input());
  const c = out.comps.find((x) => x.id === KEY.leonard101)!;
  assert.equal(c.flags.floor_missing, true);
  const floor = c.per_result.on_facts.comparisons.find((x) => x.line === 'floor')!;
  assert.equal(floor.status, 'unknown');
  assert.deepEqual(floor.missing, [{ side: 'comp', field: 'floor', label: "the comp's floor" }]);
  assert.ok(out.gaps.some((g) => g.code === 'comp_floor_missing' && g.target === KEY.leonard101));
});

test('sale-to-ask: −3.0%, +12.3%, −4.0%, −4.2%', () => {
  const out = compute(input());
  const s2a = (key: string) => out.comps.find((x) => x.id === key)!.sale_to_ask_percent;
  const oneDecimal = (x: number) => Math.round(x * 10) / 10;
  assert.deepEqual(
    [KEY.chambers, KEY.hudson, KEY.franklin, KEY.leonard66].map((k) => oneDecimal(s2a(k)!.value)),
    [-3.0, 12.3, -4.0, -4.2],
  );
  near(s2a(KEY.hudson)?.value, (2_240_000 / 1_995_000 - 1) * 100, '181 Hudson');
  assert.equal(s2a(KEY.laight), null); // a closing has no ask
  // Summarised: the median shows the negotiating margin that StreetEasy's "100% — selling at asking" hides.
  const summary = out.results.on_facts.sale_to_ask!;
  assert.equal(summary.n, 4);
  assert.equal(oneDecimal(summary.median.value), -3.5);
  assert.equal(oneDecimal(summary.mean.value), 0.3);
});

test("the export's own $/Sqft column is StreetEasy's truncation — kept for audit, never used", () => {
  const out = compute(input());
  for (const record of hannah().comps) {
    const exported = record.ignored_export_price_per_sqft;
    const ours = out.comps.find((c) => c.id === record.identity.key)!.per_result.on_facts.price_per_sqft;
    if (!exported) { assert.equal(ours, null); continue; }
    assert.equal(truncated(ours!.value), exported.value, record.identity.key ?? '');
  }
});
