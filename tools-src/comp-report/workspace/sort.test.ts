// Sort's note chips and a comp's facts, against the 100 Barclay #17L sample.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport, type EngineOutput } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { engineInput, workspaceComps } from './engine-input.ts';
import { isoDay } from './format.ts';
import { addToNote, factLines, noteChips, usualSource } from './sort.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold', tier: t.tier, anchor: false, reviewedAt: null, reasons: [],
  source: { kind: 'export' as const, importId: 'i' },
})));
const out: EngineOutput = compute(engineInput({
  asOf: '2026-09-29', intake: { ...SAMPLE_INTAKE, areaSqft: { value: 2000, asOf: '2026-09-23' } }, comps,
}));
const chipsFor = (street: string, unit: string, note = '') => {
  const c = comps.find((x) => x.record.identity.address.street?.toLowerCase().startsWith(street) && x.record.identity.unit.raw?.replace('#', '') === unit);
  assert.ok(c, `${street} ${unit} is in the sample`);
  const o = out.comps.find((x) => x.id === c.id);
  assert.ok(o);
  return noteChips(o, c.record, out.subject, note);
};

test('chips restate what the engine compared, the same building and the mentors’ rules first', () => {
  const same = chipsFor('100 barclay', '11F');
  assert.equal(same[0], 'Same building');
  assert.ok(same.includes('Has outdoor space'), 'the comp has outdoor space; the home has none');
  assert.ok(same.includes('Lower floor'));
  assert.ok(same.includes('Higher monthlies'), '$6,712 a month against $5,130');
  assert.ok(!same.includes('Same line'), '11F and 17L are different lines');

  const first = chipsFor('79 laight', '1A');
  assert.ok(first.includes('First floor'));
  assert.ok(!first.includes('Lower floor'), 'a first floor says it once');
  assert.ok(first.includes('Bigger'));

  assert.deepEqual(chipsFor('200 chambers', '10A').slice(0, 2), ['Bigger', 'Lower floor']);
});

test('a size within a few percent reads as the same size, or the same layout when the rooms match too', () => {
  const close = chipsFor('108 leonard', '7G'); // 14 sq ft bigger, half a bath more
  assert.ok(close.includes('About the same size'));
  assert.ok(!close.includes('Bigger'));
  assert.ok(close.includes('More baths'));
});

test('what the note already says isn’t offered again', () => {
  const chips = chipsFor('200 chambers', '10A', 'Bigger, lower floor');
  assert.ok(!chips.includes('Bigger'));
  assert.ok(!chips.includes('Lower floor'));
});

test('a chip joins the note as a phrase', () => {
  assert.equal(addToNote('', 'Smaller'), 'Smaller');
  assert.equal(addToNote('Smaller', 'Lower floor'), 'Smaller, lower floor');
  assert.equal(addToNote('Smaller ', 'Same building'), 'Smaller, same building');
  assert.equal(addToNote('Smaller.', 'Lower floor'), 'Smaller. Lower floor');
  assert.equal(addToNote('Smaller\n', 'Lower floor'), 'Smaller\nLower floor');
  assert.equal(addToNote('Bigger', 'A co-op'), 'Bigger, a co-op');
});

test('a comp’s facts, each with where it came from', () => {
  const c = comps.find((x) => x.record.identity.address.street?.toLowerCase().startsWith('200 chambers'));
  assert.ok(c);
  const lines = factLines(c.record);
  const size = lines.find((l) => l.label === 'Size');
  assert.deepEqual(size, { label: 'Size', value: '2,201 sq ft', from: `StreetEasy’s export, ${isoDay(SAMPLE_EXPORT.asOf)}`, sureness: '' });
  assert.equal(usualSource(lines), `StreetEasy’s export, ${isoDay(SAMPLE_EXPORT.asOf)}`, 'said once for the row');
  assert.equal(lines.find((l) => l.label === 'Closed')?.value, 'Aug 27, 2026', 'a sold comp’s date is its closing');
  assert.ok(lines.some((l) => l.label === 'Last ask'), 'a sold comp’s ask is its last ask');
});
