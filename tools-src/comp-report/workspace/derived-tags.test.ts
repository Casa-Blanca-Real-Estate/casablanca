// The tags the data settles (NW-059 a, Dispatch 16), against the 100 Barclay #17L
// sample: suggestions and contradictions, the size scale's edges from the house
// method, and Lower and Higher floor left to the agent.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport, productionHouseMethod, type EngineOutput } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { derivedTags, sizeTag } from './derived-tags.ts';
import { engineInput, workspaceComps } from './engine-input.ts';
import type { Features } from './features.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold', tier: t.tier, anchor: false, reviewedAt: null, reasons: [],
  source: { kind: 'export' as const, importId: 'i' },
})));
const run = (asOf: string): EngineOutput => compute(engineInput({
  asOf, intake: { ...SAMPLE_INTAKE, areaSqft: { value: 2000, asOf: '2026-09-23' } }, comps,
}));
const OUT = run('2026-09-29');
const tagsFor = (street: string, unit: string, out = OUT, features?: Features) => {
  const c = comps.find((x) => x.record.identity.address.street?.toLowerCase().startsWith(street) && x.record.identity.unit.raw?.replace('#', '') === unit);
  assert.ok(c, `${street} ${unit} is in the sample`);
  const o = out.comps.find((x) => x.id === c.id)!;
  const d = derivedTags({ comp: o, record: c.record, subject: out.subject, features });
  return { supported: d.supported.map((t) => t.tag), contradicted: d.contradicted.map((t) => t.tag), d };
};

test('the size scale: Similar within the house method’s 10%, Smaller or Bigger to its 25%, Much past it — the engine’s own edge', () => {
  const t = productionHouseMethod().check_thresholds;
  assert.deepEqual([t.size_tag_percent.value, t.size_percent.value], [10, 25]);
  const tag = (comp: number) => sizeTag(2000, comp, t)?.tag;
  assert.equal(tag(2000), 'Similar size');
  assert.equal(tag(2200), 'Similar size', 'exactly 10% is still similar');
  assert.equal(tag(2201), 'Bigger');
  assert.equal(tag(1799), 'Smaller');
  assert.equal(tag(2500), 'Bigger', 'exactly 25% is not yet far off, as size_far_off reads it');
  assert.equal(tag(2501), 'Much bigger');
  assert.equal(tag(1499), 'Much smaller');
  assert.equal(sizeTag(0, 1000, t), null);
  assert.equal(sizeTag(2000, 2200, { size_tag_percent: { value: 5, basis: 'x' }, size_percent: t.size_percent })?.tag, 'Bigger', 'the edges are configuration');
});

test('the sample: same building, the size scale, similar and first floors, from the data', () => {
  assert.deepEqual(tagsFor('200 chambers', '10A').supported, ['Bigger'], '2,201 against 2,000: just past 10%');
  assert.deepEqual(tagsFor('79 laight', '1A').supported, ['Much bigger', 'First floor']);
  assert.deepEqual(tagsFor('5 franklin', '14A').supported, ['Similar size', 'Similar floor'], 'floor 14 against 17: within the band');
  assert.deepEqual(tagsFor('100 barclay', '11F').supported, ['Same building'], 'no size, and 6 floors lower');
  // Lower and Higher floor stay the agent's.
  for (const c of OUT.comps) {
    const rec = comps.find((x) => x.id === c.id)!.record;
    const d = derivedTags({ comp: c, record: rec, subject: OUT.subject });
    assert.ok(!d.supported.some((t) => t.tag === 'Lower floor' || t.tag === 'Higher floor'));
  }
  assert.match(tagsFor('200 chambers', '10A').d.supported[0]!.because, /^10% bigger than the home$/);
});

test('contradictions: a known floor other than 1 rules out First floor; an outdoor pick other than None rules out No outdoor space', () => {
  assert.ok(tagsFor('200 chambers', '10A').contradicted.includes('First floor'));
  assert.ok(!tagsFor('79 laight', '1A').contradicted.includes('First floor'));
  assert.ok(!tagsFor('101 leonard', '5B').contradicted.includes('First floor'), 'an unknown floor contradicts nothing');
  // The agent's pick wins over the source's.
  assert.ok(tagsFor('200 chambers', '10A', OUT, { outdoor: ['Terrace'] }).contradicted.includes('No outdoor space'));
  assert.ok(!tagsFor('5 franklin', '14A', OUT, { outdoor: ['None'] }).contradicted.includes('No outdoor space'));
  assert.ok(tagsFor('5 franklin', '14A').contradicted.includes('No outdoor space'), 'the export lists private outdoor space');
});

test('6+ months from the engine’s sale-age check, and only past six months', () => {
  assert.ok(!OUT.comps.some((c) => derivedTags({ comp: c, record: comps.find((x) => x.id === c.id)!.record, subject: OUT.subject }).supported.some((t) => t.tag === '6+ months')));
  const later = run('2027-06-01');
  const chambers = tagsFor('200 chambers', '10A', later);
  assert.ok(chambers.supported.includes('6+ months'));
  assert.match(chambers.d.supported.find((t) => t.tag === '6+ months')!.because, /months ago/);
});
