// The clearest statement of why this tool exists (§6.2): StreetEasy's own
// report for these comps headlines "Average sale price $4,535,000" — the mean
// of all eleven homes, closed sales and asking prices together — and a
// "$2.2M–$6.0M estimated sale price range", simply the lowest price to the
// highest across every status. This test rebuilds both from the raw rows and
// proves the engine never returns either, in any configuration.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute, loadHouseMethod, type EngineInput, type EngineOutput } from '../index.ts';
import testValues from './fixtures/house-method.test-only.json' with { type: 'json' };
import { agentFact, allNumbers, allPairs, comps, fixtureText, HANNAH_CSV, input, KEY, subjectFacts } from './helpers.ts';

/** A deliberately independent CSV split — none of the engine's code. */
function rawRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l !== '');
  const split = (line: string) => {
    const out: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') { if (quoted && line[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
      else if (ch === ',' && !quoted) { out.push(field); field = ''; }
      else field += ch;
    }
    out.push(field);
    return out;
  };
  const header = split(lines[0]!);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [header[i]!, v])));
}

const dollars = (s: string) => (s ? Number(s.replace(/[$,]/g, '')) : null);

const rows = rawRows(fixtureText(HANNAH_CSV));
const blendedPrices = rows.map((r) => dollars(r['Sale Price']!) ?? dollars(r['Listing Price']!)!);
const BLENDED_AVERAGE = blendedPrices.reduce((a, b) => a + b, 0) / blendedPrices.length;
const BLENDED_LOW = Math.min(...blendedPrices);
const BLENDED_HIGH = Math.max(...blendedPrices);
const psfColumn = rows.map((r) => r['$/Sqft']!).filter(Boolean).map((v) => Number(v.replace(/[$,]|\s*ft²/g, '')));
const BLENDED_PSF_FROM_COLUMN = psfColumn.reduce((a, b) => a + b, 0) / psfColumn.length;
const exactPsf = rows.filter((r) => r['Sqft']).map((r) => (dollars(r['Sale Price']!) ?? dollars(r['Listing Price']!)!) / Number(r['Sqft']!.replace(/[~,]|\s*ft²/g, '')));
const BLENDED_PSF_EXACT = exactPsf.reduce((a, b) => a + b, 0) / exactPsf.length;

test("rebuilds StreetEasy's blended figures from the raw rows", () => {
  assert.equal(rows.length, 11);
  assert.equal(BLENDED_AVERAGE, 4_535_000);
  assert.equal(BLENDED_LOW, 2_240_000); // "$2.2M"
  assert.equal(BLENDED_HIGH, 5_995_000); // "$6.0M"
  assert.equal(Math.trunc(BLENDED_PSF_FROM_COLUMN), 2179); // "$2,179/ft²"
  // Its sold-only line, by contrast, is class-pure — and matches the engine.
  const soldOnly = rows.filter((r) => r['Listing Status'] === 'SOLD').map((r) => dollars(r['Sale Price']!)!);
  assert.equal(soldOnly.reduce((a, b) => a + b, 0) / soldOnly.length, 4_273_000);
});

function configurations(): [string, EngineInput, Parameters<typeof compute>[1]][] {
  const withArea = input();
  const noArea = input({ subject: { identity: withArea.subject.identity, facts: {} } });
  const anchored = input({ comps: comps().map((c) => (c.id === KEY.chambers ? { ...c, anchor: true } : c)) });
  const leads = (['unit_rate.median', 'unit_rate.mean', 'unit_rate.anchor', 'adjusted_price.median', 'adjusted_price.mean', 'adjusted_price.anchor'] as const)
    .map((indicator): [string, EngineInput, undefined] => [`lead ${indicator}`, { ...anchored, method: { lead: { indicator } } }, undefined]);
  const estimates = input({
    subject: { identity: withArea.subject.identity, facts: subjectFacts({ area_sqft: agentFact(2050, 'guesstimate'), outdoor_private: agentFact(true), views: agentFact(['city']) }) },
    agent_adjustments: [{ id: 'a1', factor: 'outdoor_space', value: { percent: 5 }, as_of: '2026-09-24' }],
    method: { narrowing: { low: 3_900_000, reason: 'the ground-floor sales are a different product', as_of: '2026-09-24' } },
  });
  const testHm = loadHouseMethod(testValues);
  return [
    ['everything primary, no subject area', noArea, undefined],
    ['everything primary, subject area known', withArea, undefined],
    ['floor 10 and up', input({ comps: comps({ laight: 'excluded', hudson: 'excluded' }) }), undefined],
    ['in contract and active excluded', input({ comps: comps({ leonard108: 'excluded', leonard101: 'excluded', moore: 'excluded', murray: 'excluded', barclay11f: 'excluded', reade: 'excluded' }) }), undefined],
    ...leads,
    ['with estimates and a narrowing', estimates, undefined],
    ['test house method', withArea, { houseMethod: testHm }],
    ['test house method with estimates', estimates, { houseMethod: testHm }],
  ];
}

function assertNeverBlended(label: string, out: EngineOutput): void {
  for (const { path, value } of allNumbers(out)) {
    assert.ok(Math.abs(value - BLENDED_AVERAGE) >= 0.5, `${label}: ${path} is StreetEasy's blended average ${value}`);
    assert.ok(Math.abs(value - BLENDED_PSF_EXACT) >= 1e-6, `${label}: ${path} is a blended $/sqft ${value}`);
    assert.ok(Math.abs(value - BLENDED_PSF_FROM_COLUMN) >= 1e-6, `${label}: ${path} averages StreetEasy's $/Sqft column ${value}`);
  }
  for (const { path, obj } of allPairs(out, 'low', 'high')) {
    const low = (obj['low'] as { value?: number } | number | null);
    const high = (obj['high'] as { value?: number } | number | null);
    const lo = typeof low === 'number' ? low : low?.value;
    const hi = typeof high === 'number' ? high : high?.value;
    for (const [a, b] of [[BLENDED_LOW, BLENDED_HIGH], [2_200_000, 6_000_000]]) {
      assert.ok(!(lo === a && hi === b), `${label}: ${path} is StreetEasy's lowest-to-highest-of-everything range`);
    }
  }
}

test('the detector itself catches the blended figures when they are present', () => {
  const clean = compute(input());
  const planted = (mutate: (o: EngineOutput) => void) => {
    const copy = structuredClone(clean);
    mutate(copy);
    return copy;
  };
  assert.throws(() => assertNeverBlended('planted', planted((o) => { o.results.on_facts.base!.value = 4_535_000; })));
  assert.throws(() => assertNeverBlended('planted', planted((o) => {
    o.results.on_facts.range = { ...o.results.on_facts.range!, low: { ...o.results.on_facts.range!.low, value: 2_240_000 }, high: { ...o.results.on_facts.range!.high, value: 5_995_000 } };
  })));
  assert.throws(() => assertNeverBlended('planted', planted((o) => { o.results.on_facts.evidence.sold.price_per_sqft!.mean.value = BLENDED_PSF_EXACT; })));
  assert.doesNotThrow(() => assertNeverBlended('clean', clean));
});

test('the engine never returns the blended $4,535,000 or the $2.2M–$6.0M range, in any configuration', () => {
  for (const [label, engineInput, options] of configurations()) {
    const out = compute(engineInput, options);
    assertNeverBlended(label, out);
  }
});

test('every statistic holds one evidence class, and the range only primary sold comps', () => {
  for (const [label, engineInput, options] of configurations()) {
    const out = compute(engineInput, options);
    const classOf = new Map(out.comps.map((c) => [c.id, c.evidence_class]));
    const tierOf = new Map(out.comps.map((c) => [c.id, c.tier]));
    for (const { path, obj } of allPairs(out.results, 'comp_ids', 'median')) {
      const classes = new Set((obj['comp_ids'] as string[]).map((id) => classOf.get(id)));
      assert.ok(classes.size <= 1, `${label}: ${path} mixes evidence classes`);
    }
    for (const kind of ['on_facts', 'with_estimates'] as const) {
      const r = out.results[kind];
      for (const id of r.bracket?.comp_ids ?? []) {
        assert.equal(classOf.get(id), 'sold', `${label}: the ${kind} range includes a non-sold comp`);
        assert.equal(tierOf.get(id), 'primary', `${label}: the ${kind} range includes a non-primary comp`);
      }
      for (const family of [r.indicators.unit_rate, r.indicators.adjusted_price]) {
        for (const ind of [family.median, family.mean, family.anchor]) {
          for (const id of ind.comp_ids) assert.equal(classOf.get(id), 'sold', `${label}: ${ind.id} uses a non-sold comp`);
        }
      }
    }
  }
});

test("the engine's sold-only range isn't StreetEasy's, even with every comp primary", () => {
  const out = compute(input({ method: { lead: { indicator: 'adjusted_price.median' } } }));
  const r = out.results.on_facts;
  // Sold prices only: $2.24M (181 Hudson) to $5.7M (66 Leonard) — never an asking price.
  assert.equal(r.range!.low.value, 2_240_000);
  assert.equal(r.range!.high.value, 5_700_000);
  assert.equal(r.base!.value, 4_600_000);
  assert.notEqual(r.range!.high.value, BLENDED_HIGH);
});
