// Distance (Dispatch 11) on the 100 Barclay #17L sample, with each building's
// real mapped location (recorded from GeoSearch, dev/geosearch-fixtures.json):
// the engine's flag past ¼ and ½ mile, the row's distance, "Same building",
// and why a distance is missing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compute, parseExport, type CompOut, type EngineOutput } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { compDistance, type Lookup } from './distance.ts';
import { engineInput, workspaceComps, type Location } from './engine-input.ts';
import type { Intake } from './state.ts';

const recorded = JSON.parse(readFileSync(new URL('../dev/geosearch-fixtures.json', import.meta.url), 'utf8')) as Record<string, { geometry: { coordinates: [number, number] } }[]>;
const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const comps = workspaceComps([{ importId: 'i', createdAt: '2026-10-06T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold', tier: t.tier, anchor: false, reviewedAt: null, reasons: [],
  source: { kind: 'export' as const, importId: 'i' },
})));
const intake: Intake = { ...SAMPLE_INTAKE, areaSqft: { value: 2000, asOf: '2026-09-23' } };
const home = { building_key: 'pk1|ny|new york|100 barclay st', street: '100 Barclay Street' };

/** Every sample building located where GeoSearch puts it. */
function locate(streets: string[]): Map<string, Location> {
  const out = new Map<string, Location>();
  for (const c of [{ record: { identity: { building_key: home.building_key, address: { street: home.street } } } }, ...comps]) {
    const street = c.record.identity.address.street!;
    if (!streets.includes(street)) continue;
    const [lng, lat] = recorded[street]![0]!.geometry.coordinates;
    out.set(c.record.identity.building_key!, { lat, lng, asOf: '2026-10-06', matched: `${street}, Manhattan` });
  }
  return out;
}
const everywhere = locate([home.street, ...comps.map((c) => c.record.identity.address.street!)]);
const run = (locations: Map<string, Location>): EngineOutput => compute(engineInput({ asOf: '2026-10-06', intake, comps, locations }));
const compOut = (out: EngineOutput, street: string): CompOut => out.comps.find((c) => comps.find((w) => w.id === c.id)?.record.identity.address.street === street)!;
const distanceCheck = (o: CompOut) => o.checks.find((k) => k.code === 'distance');

test('the engine flags a comp past a quarter mile (noted) and past half a mile (far, Secondary)', () => {
  const out = run(everywhere);
  assert.equal(distanceCheck(compOut(out, '200 Chambers Street')), undefined, '0.19 mi: within a quarter mile, nothing to flag');
  const reade = distanceCheck(compOut(out, '77 Reade Street'))!;
  assert.deepEqual([reade.status, reade.label, reade.suggested_tier], ['flagged', '0.31 miles away', null], 'past ¼ mile: noted');
  const franklin = distanceCheck(compOut(out, '5 Franklin Place'))!;
  assert.deepEqual([franklin.status, franklin.label, franklin.suggested_tier], ['flagged', '0.56 miles away', 'secondary'], 'past ½ mile: far');
  assert.equal(franklin.confidence, 'approx', 'a building’s point, not the unit’s');
});

test('every row has its distance, and a comp in the home’s building reads “Same building”', () => {
  const out = run(everywhere);
  const lookups: Lookup[] = [];
  const of = (street: string) => compDistance(out.subject.identity, comps.find((c) => c.record.identity.address.street === street)!.record.identity, everywhere, lookups);
  const chambers = of('200 Chambers Street');
  assert.deepEqual([chambers.kind, (chambers as { label: string }).label], ['miles', '0.2 mi']);
  assert.deepEqual([(chambers as { home: string }).home, (chambers as { comp: string }).comp], ['100 Barclay Street, Manhattan', '200 Chambers Street, Manhattan'], 'what each was mapped as');
  assert.ok(Math.abs((chambers as { miles: number }).miles - 0.19) < 0.01, 'the engine’s own arithmetic: 0.19 mi');
  assert.equal((of('77 Reade Street') as { label: string }).label, '0.3 mi');
  assert.equal((of('111 Murray Street') as { label: string }).label, '0.1 mi');
  assert.deepEqual(of('100 Barclay Street'), { kind: 'same_building' }, 'not “0.0 mi”');
});

test('without a location, the row says why: not looked up, refused, or failed and tried again', () => {
  const comp = comps.find((c) => c.record.identity.address.street === '77 Reade Street')!.record.identity;
  const subject = run(everywhere).subject.identity;
  // 100 Barclay #11F is a comp in the home's building: leave that building out too.
  const onlyComps = locate(comps.map((c) => c.record.identity.address.street!).filter((s) => s !== home.street));
  assert.deepEqual(compDistance(subject, comp, onlyComps, []), { kind: 'unknown', why: 'The home hasn’t been looked up yet.', waiting: true });
  const refused: Lookup = { buildingKey: home.building_key, status: 'refused', reason: 'the geocoder found 100 Barclay Street, Brooklyn, not in Manhattan', retry: false };
  assert.deepEqual(compDistance(subject, comp, onlyComps, [refused]), {
    kind: 'unknown', why: 'The home isn’t mapped: the geocoder found 100 Barclay Street, Brooklyn, not in Manhattan.', waiting: false,
  });
  const underWay: Lookup = { buildingKey: home.building_key, status: 'pending', reason: null, retry: false };
  assert.deepEqual(compDistance(subject, comp, onlyComps, [underWay]), { kind: 'unknown', why: 'The home is being looked up.', waiting: true });
  const onlyHome = locate([home.street]);
  const failed: Lookup = { buildingKey: comp.building_key!, status: 'failed', reason: 'the geocoder didn’t answer within 4 seconds', retry: true };
  assert.deepEqual(compDistance(subject, comp, onlyHome, [failed]), {
    kind: 'unknown', why: 'This building isn’t mapped yet: the geocoder didn’t answer within 4 seconds. It’s tried again when the report next opens.', waiting: false,
  });
  // And the engine says so in its own check.
  assert.equal(distanceCheck(compOut(run(onlyHome), '77 Reade Street'))?.status, 'unknown');
});
