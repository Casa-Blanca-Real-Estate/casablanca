// Findings' words against the 100 Barclay #17L sample (Dispatch 14, item 9):
// "How Hubert got there" from the 1st-tier sales only, the verdict, the tiles.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport, type EngineOutput, type ParsedExport, type ReportPropertyType } from '../../../engine/index.ts';
import { SAMPLE_EXPORT } from '../../../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../../../server/sample/barclay-17l.ts';
import { engineInput, namedPrices, workspaceComps } from '../../../workspace/engine-input.ts';
import type { CallState, Intake } from '../../../workspace/state.ts';
import { engineWhy, hubertTake, listWords, monthYear, statusTiles, verdictLine } from './findings.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
/** The same export as co-ops with no sizes: what a co-op walk imports. */
const coopParsed: ParsedExport = {
  ...parsed,
  comps: parsed.comps.map((c) => {
    const facts = { ...c.facts };
    delete facts.area_sqft;
    if (facts.property_type) facts.property_type = { ...facts.property_type, value: 'coop' };
    return { ...c, facts };
  }),
};
const tiers = (overrides: Record<string, 'primary' | 'secondary' | 'excluded'> = {}) => SAMPLE_TIERS.map((t, i) => {
  const tier = overrides[t.propertyKey] ?? t.tier;
  return {
    reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold' as const, tier, anchor: Boolean(t.anchor), reviewedAt: null,
    reasons: [{ tier, reason: t.reason, reasonType: t.reasonType, actor: 'agent', at: '2026-09-29T00:00:00Z', by: 'k', sample: true }],
    source: { kind: 'export' as const, importId: 'i' },
  };
});
const run = (intake: Intake, opts: { call?: CallState | null; type?: ReportPropertyType; overrides?: Record<string, 'primary' | 'secondary' | 'excluded'> } = {}): EngineOutput => {
  const p = opts.type === 'coop' ? coopParsed : parsed;
  const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed: p }], tiers(opts.overrides));
  return compute(engineInput({ asOf: '2026-09-29', intake, comps, prices: namedPrices(opts.call ?? null, null), propertyType: opts.type ?? 'condo' }));
};
const KNOWN_SIZE: Intake = { ...SAMPLE_INTAKE, areaSqft: { value: 2000, asOf: '2026-09-23' } };
const NO_SIZE: Intake = { ...SAMPLE_INTAKE };
delete NO_SIZE.areaSqft;
const names = new Map<string, string>();
const take = (output: EngineOutput, extra: Partial<Parameters<typeof hubertTake>[0]> = {}) =>
  hubertTake({ output, kind: 'on_facts', names, home: '17L', sf: true, side: 'seller', asking: null, ...extra });

test('with a size: the 1st-tier sales by name, price, size and month, their $/sq ft on the home’s size, and who sets each end', () => {
  const text = take(run(KNOWN_SIZE));
  assert.equal(text,
    'I started from your three 1st-tier sales: 5 Franklin Place #14A ($4.18M, 1,840 sq ft, sold Sep 2026), 66 Leonard Street #12A ($5.7M, 2,319 sq ft, sold Sep 2026) and 200 Chambers Street #10A ($4.65M, 2,201 sq ft, sold Aug 2026). '
    + 'At $2,112–$2,457 a sq ft on 17L’s 2,000 sq ft, that comes to $4.23M–$4.92M. '
    + '200 Chambers Street #10A sets the low end and 66 Leonard Street #12A the top. '
    + 'Your 1st-tier asks (in contract, active or didn’t sell) don’t set the range: only sales do. '
    + 'Your 2nd-tier and ✕ comps stayed out of the range.');
});

test('the page’s names win over the engine’s; nothing is named that isn’t a comp in the output', () => {
  const out = run(KNOWN_SIZE);
  const text = take(out, { names: new Map([['pk1|ny|new york|200 chambers st|10A', '200 Chambers #10A']]) });
  assert.match(text, /200 Chambers #10A sets the low end/);
  const named = new Set([...out.comps.map((c) => c.identity.address.street), '200 Chambers']);
  for (const m of text.matchAll(/(\d+ [A-Z][\w.]*(?: [A-Z][\w.]*)*) #/g)) assert.ok(named.has(m[1]!), `${m[1]} is a comp`);
});

test('no size: no sizes and no $/sq ft — and with no range, why not, from the engine', () => {
  const text = take(run(NO_SIZE), { sf: false });
  assert.doesNotMatch(text, /sq ft/);
  assert.match(text, /^I couldn’t make a range yet: no implied values without the subject's interior area\. Your 1st-tier sales so far: /);
});

test('a co-op: the range from the sales’ prices, no size anywhere', () => {
  const out = run(NO_SIZE, { type: 'coop' });
  assert.ok(out.results.on_facts.range, 'a co-op range');
  const text = take(out, { sf: false });
  assert.match(text, /^I started from your three 1st-tier sales: 5 Franklin Place #14A \(\$4\.18M, sold Sep 2026\), 66 Leonard Street #12A \(\$5\.7M, sold Sep 2026\) and 200 Chambers Street #10A \(\$4\.65M, sold Aug 2026\)\. They put 17L at \$4\.18M–\$5\.7M\. 5 Franklin Place #14A sets the low end and 66 Leonard Street #12A the top\./);
  assert.doesNotMatch(text, /sq ft|\/ SF/);
});

test('for a buyer, the offer line: the ask against what the sales support, and the low end’s sale', () => {
  const out = run(KNOWN_SIZE);
  assert.match(take(out, { side: 'buyer' }), /For an offer, 200 Chambers Street #10A, at the low end, is the strongest case for coming in low\.$/);
  assert.match(take(out, { side: 'buyer', asking: 5_250_000 }), /For an offer, the ask of \$5\.25M sits above what the sales support, and 200 Chambers Street #10A is the strongest case for coming in under it\.$/);
  assert.match(take(out, { side: 'buyer', asking: 4_500_000 }), /the ask of \$4\.5M sits inside what the sales support; 200 Chambers Street #10A, at the low end, is the strongest case/);
  assert.match(take(out, { side: 'buyer', asking: 3_900_000 }), /the ask of \$3\.9M already sits below what the sales support\.$/);
  assert.doesNotMatch(take(out, { side: 'seller', asking: 5_250_000 }), /offer|ask of/);
});

test('it never carries the agent’s number or the target', () => {
  const out = run(KNOWN_SIZE, { call: { low: 3_400_000, high: 4_200_000, at: 'x' } });
  const text = take(out);
  assert.doesNotMatch(text, /3\.4M|4\.2M|guess|target/i);
});

test('one 1st-tier sale is a point, not a range: it says so', () => {
  const out = run(KNOWN_SIZE, { overrides: { 'pk1|ny|new york|5 franklin pl|14A': 'secondary', 'pk1|ny|new york|66 leonard st|12A': 'secondary' } });
  assert.match(take(out), /^I couldn’t make a range yet: a range needs at least two 1st-tier sold comps: one comp is a point, and a range is never a point\. Your 1st-tier sales so far: 200 Chambers Street #10A/);
});

test('the verdict: the guess against the true estimate, with the gap', () => {
  const v = (low: number, high: number) => verdictLine(run(KNOWN_SIZE, { call: { low, high, at: 'x' } }), 'on_facts');
  assert.equal(v(3_400_000, 4_200_000), 'Your guess sits below the true estimate, by about $25.4K.');
  assert.equal(v(5_000_000, 5_200_000), 'Your guess sits above the true estimate, by about $84.1K.');
  assert.equal(v(4_300_000, 4_800_000), 'Your guess sits inside the true estimate.');
  assert.equal(v(4_000_000, 4_500_000), 'Your guess starts below the true estimate and ends inside it.');
  assert.equal(v(4_500_000, 5_200_000), 'Your guess starts inside the true estimate and runs above it.');
  assert.equal(v(3_900_000, 5_500_000), 'Your guess is wider than the true estimate, on both sides.');
  assert.equal(verdictLine(run(KNOWN_SIZE, { call: { skipped: true, at: 'x' } }), 'on_facts'), null, 'skipped: no verdict');
  assert.equal(verdictLine(run(NO_SIZE, { call: { low: 3_400_000, high: 4_200_000, at: 'x' } }), 'on_facts'), null, 'no range: no verdict');
});

test('the status tiles: $/SF with a size, prices without, counted comps only', () => {
  const withSize = statusTiles(run(KNOWN_SIZE).results.on_facts, true);
  assert.deepEqual(withSize.map((t) => [t.name, t.n, t.value, t.unit]), [
    ['Sold', 3, '$2,269', ' / SF'],
    ['In contract', 2, '$2,393', ' / SF'],
    ['Active', 1, '$4.25M', ' ask'],
    ['Didn’t sell', 0, '—', ''],
  ]);
  const coop = statusTiles(run(NO_SIZE, { type: 'coop' }).results.on_facts, false);
  assert.deepEqual(coop.map((t) => [t.name, t.n, t.value, t.unit]), [
    ['Sold', 3, '$4.65M', ' median'],
    ['In contract', 2, '$4.67M', ' median ask'],
    ['Active', 1, '$4.25M', ' ask'],
    ['Didn’t sell', 0, '—', ''],
  ]);
});

test('small words', () => {
  assert.equal(monthYear('2026-08-27'), 'Aug 2026');
  assert.equal(monthYear(null), null);
  assert.equal(listWords(['a']), 'a');
  assert.equal(listWords(['a', 'b', 'c']), 'a, b and c');
  assert.equal(engineWhy('no primary sold comps'), 'no 1st-tier sold comps');
});
