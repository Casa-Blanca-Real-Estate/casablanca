// Findings' words against the 100 Barclay #17L sample (Dispatch 14, item 9):
// "How Hubert got there" from the 1st-tier sales only, the verdict, the tiles.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport, type EngineOutput, type ParsedExport, type ReportPropertyType } from '../../../engine/index.ts';
import { SAMPLE_EXPORT } from '../../../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../../../server/sample/barclay-17l.ts';
import { engineInput, namedPrices, workspaceComps } from '../../../workspace/engine-input.ts';
import type { CallState, Intake } from '../../../workspace/state.ts';
import { daysOnMarketLine, engineWhy, hubertTake, listWords, monthYear, movedLine, saleToAskLine, statusTiles, stillNeeded, takeText, verdictLine } from './findings.ts';

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
  takeText(hubertTake({ output, kind: 'on_facts', names, home: '17L', sf: true, side: 'seller', asking: null, ...extra }));

test('with a size: the closest sales by name, one short sentence per idea, their $/sq ft on the home’s size, and who sets each end', () => {
  const text = take(run(KNOWN_SIZE));
  assert.equal(text,
    'I started from your three closest sales: 5 Franklin Place #14A, 66 Leonard Street #12A and 200 Chambers Street #10A. '
    + 'They sold for $2,112–$2,457 a sq ft. '
    + 'On 17L’s 2,000 sq ft, that’s $4.23M–$4.92M. '
    + '200 Chambers Street #10A sets the low end. 66 Leonard Street #12A sets the top. '
    + 'Your closest asks don’t set the range. Only sales do. '
    + 'Your 2nd-tier and ✕ comps stayed out.');
});

test('the take comes as segments: each comp by id, its price, size and date in a title, not in the sentence', () => {
  const segs = hubertTake({ output: run(KNOWN_SIZE), kind: 'on_facts', names, home: '17L', sf: true, side: 'seller', asking: null });
  const comps = segs.filter((x): x is Extract<typeof x, { comp: string }> => 'comp' in x);
  assert.equal(comps[0]!.name, '5 Franklin Place #14A');
  assert.equal(comps[0]!.title, '$4.18M · 1,840 sq ft · sold Sep 2026');
  assert.ok(comps.every((c) => c.comp.startsWith('pk1|')));
  const coop = hubertTake({ output: run(NO_SIZE, { type: 'coop' }), kind: 'on_facts', names, home: '17L', sf: false, side: 'seller', asking: null });
  assert.ok(coop.every((x) => !('title' in x) || !/sq ft/.test(x.title)), 'no size in a co-op’s titles');
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
  assert.match(text, /^I couldn’t make a range yet: no implied values without the subject's interior area\. Your closest sales so far: /);
});

test('a co-op: the range from the sales’ prices, no size anywhere', () => {
  const out = run(NO_SIZE, { type: 'coop' });
  assert.ok(out.results.on_facts.range, 'a co-op range');
  const text = take(out, { sf: false });
  assert.match(text, /^I started from your three closest sales: 5 Franklin Place #14A, 66 Leonard Street #12A and 200 Chambers Street #10A\. They put 17L at \$4\.18M–\$5\.7M\. 5 Franklin Place #14A sets the low end\. 66 Leonard Street #12A sets the top\./);
  assert.doesNotMatch(text, /sq ft|\/ SF/);
});

test('for a buyer, the offer line: the ask against what the sales support, and the low end’s sale', () => {
  const out = run(KNOWN_SIZE);
  assert.match(take(out, { side: 'buyer' }), /For an offer, 200 Chambers Street #10A, at the low end, is your strongest case for going low\.$/);
  assert.match(take(out, { side: 'buyer', asking: 5_250_000 }), /The ask of \$5\.25M is above what the sales support\. 200 Chambers Street #10A is your strongest case for offering under it\.$/);
  assert.match(take(out, { side: 'buyer', asking: 4_500_000 }), /The ask of \$4\.5M is inside what the sales support\. 200 Chambers Street #10A, at the low end, is your strongest case/);
  assert.match(take(out, { side: 'buyer', asking: 3_900_000 }), /The ask of \$3\.9M is already below what the sales support\.$/);
  assert.doesNotMatch(take(out, { side: 'seller', asking: 5_250_000 }), /offer|ask of/);
});

test('it never carries the agent’s number or the target', () => {
  const out = run(KNOWN_SIZE, { call: { low: 3_400_000, high: 4_200_000, at: 'x' } });
  const text = take(out);
  assert.doesNotMatch(text, /3\.4M|4\.2M|guess|target/i);
});

test('one 1st-tier sale is a point, not a range: it says so', () => {
  const out = run(KNOWN_SIZE, { overrides: { 'pk1|ny|new york|5 franklin pl|14A': 'secondary', 'pk1|ny|new york|66 leonard st|12A': 'secondary' } });
  assert.match(take(out), /^I couldn’t make a range yet: a range needs at least two 1st-tier sold comps: one comp is a point, and a range is never a point\. Your closest sales so far: 200 Chambers Street #10A/);
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

test('pricing details, in words: sales against ask by sign, days on market with the spread and the count', () => {
  const f = (value: number) => ({ value });
  assert.equal(saleToAskLine({ n: 3, median: f(2.14), min: f(-3), max: f(4.5) }), 'Your 3 sales closed a median 2.1% above their last asking price, from −3.0% to +4.5%.');
  assert.equal(saleToAskLine({ n: 4, median: f(-1.5), min: f(-6), max: f(0) }), 'Your 4 sales closed a median 1.5% below their last asking price, from −6.0% to 0.0%.');
  assert.equal(saleToAskLine({ n: 2, median: f(0.02), min: f(-1), max: f(1) }), 'Your 2 sales closed a median at their asking price, from −1.0% to +1.0%.');
  assert.equal(saleToAskLine({ n: 1, median: f(-2), min: f(-2), max: f(-2) }), 'Your one sale closed 2.0% below its last asking price.');
  assert.equal(daysOnMarketLine({ n: 3, median: f(148), min: f(24), max: f(259) }), 'Your 3 sales took 24 to 259 days to go into contract; the middle one, 148.');
  assert.equal(daysOnMarketLine({ n: 2, median: f(141.5), min: f(24), max: f(259) }), 'Your 2 sales took 24 and 259 days to go into contract.');
  assert.equal(daysOnMarketLine({ n: 1, median: f(30), min: f(30), max: f(30) }), 'Your one sale took 30 days to go into contract.');
  const r = run(KNOWN_SIZE).results.on_facts;
  assert.ok(r.sale_to_ask && r.days_on_market.sold, 'the sample has both');
});

test('the backstop line: how far the range moved toward or away from the target since the reveal', () => {
  const pin = { at: 'x', low: 4_000_000, base: 4_300_000, high: 4_500_000, engineVersion: 'v' };
  assert.equal(movedLine(pin, { low: 4_000_000, high: 4_500_000 }, 4_800_000, 'Client’s target price'), null, 'nothing moved');
  assert.equal(movedLine(pin, { low: 4_100_000, high: 4_700_000 }, 4_800_000, 'Client’s target price'),
    'Since you first saw it, the range moved from $4M–$4.5M to $4.1M–$4.7M: $200K closer to the client’s target price.');
  assert.equal(movedLine(pin, { low: 3_800_000, high: 4_300_000 }, 4_800_000, 'Your list price'),
    'Since you first saw it, the range moved from $4M–$4.5M to $3.8M–$4.3M: $200K further from your list price.');
  assert.equal(movedLine(pin, { low: 4_200_000, high: 4_900_000 }, 4_800_000, 'Shared target'),
    'Since you first saw it, the range moved from $4M–$4.5M to $4.2M–$4.9M: $300K closer to the shared target, which it now takes in.');
  assert.match(movedLine(pin, { low: 4_100_000, high: 4_400_000 }, 4_200_000, 'Client’s budget')!, /The client’s budget sits inside both\.$/);
  assert.equal(movedLine({ ...pin, low: null, high: null }, { low: 1, high: 2 }, 3, 'x'), null, 'no range at the reveal');
  assert.equal(movedLine(pin, { low: 1, high: 2 }, null, 'x'), null, 'no target');
});

test('still needed: only what the agent can fill in, and what it is', () => {
  const out = run(NO_SIZE);
  const n = stillNeeded(out.gaps);
  assert.ok(n.fillable.length > 0 && n.fillable.length < out.gaps.length, 'some fillable, some not');
  assert.ok(n.fillable.every((g) => g.fillable) && n.rest.every((g) => !g.fillable));
  assert.match(n.words!, /^\d+ facts? about (the home|a comp|your comps)/);
  const gap = (target: string | null, fillable: boolean) => ({ code: 'c', message: 'm', target, field: null, results: ['on_facts' as const], fillable });
  assert.equal(stillNeeded([gap('subject', true), gap('subject', true), gap('rc1', true), gap(null, false)]).words, '2 facts about the home and 1 about a comp to fill in');
  assert.equal(stillNeeded([gap('rc1', true), gap('rc2', true)]).words, '2 facts about your comps to fill in');
  assert.equal(stillNeeded([gap(null, false)]).words, null);
});
