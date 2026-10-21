// When the data settles a comp's tags (NB-9 C, Dispatch 20), against the 100
// Barclay #17L sample: a full agent's are pre-filled once, a practice agent's
// are chips, a contradicted tag comes off for both, and a tag the agent took
// off isn't put back.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { engineInput, workspaceComps } from './engine-input.ts';
import { settleTags } from './settle-tags.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const make = (tags: (key: string) => string[]) => workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold' as const, tier: t.tier, anchor: false, reviewedAt: null, reasons: [],
  source: { kind: 'export' as const, importId: 'i' }, tags: tags(t.propertyKey),
})));
const CHAMBERS = 'pk1|ny|new york|200 chambers st|10A';
const rcOf = (key: string) => `rc${SAMPLE_TIERS.findIndex((t) => t.propertyKey === key)}`;
const settle = (tags: (key: string) => string[], level: 'practice' | 'full', offered?: Record<string, string[]>) => {
  const comps = make(tags);
  const output = compute(engineInput({ asOf: '2026-09-29', intake: { ...SAMPLE_INTAKE, areaSqft: { value: 2000, asOf: '2026-09-23' } }, comps }));
  return settleTags({ comps, output, level, offered });
};

test('a full agent: the supported tags are pre-filled, and a contradicted one comes off', () => {
  const s = settle((k) => (k === CHAMBERS ? ['Same area', 'First floor'] : []), 'full');
  const chambers = s.edits.find((e) => e.reportCompId === rcOf(CHAMBERS))!;
  assert.deepEqual(chambers.tags, ['Same area', 'Bigger'], 'First floor is off (floor 10); Bigger is on (10% bigger)');
  assert.deepEqual(s.suggestions, {});
  assert.ok(s.offeredChanged);
  assert.ok(s.offered[rcOf(CHAMBERS)]!.includes('Bigger'));
});

test('a full agent: a tag the data already offered isn’t put back after the agent took it off', () => {
  const first = settle(() => [], 'full');
  const again = settle((k) => (k === CHAMBERS ? ['Same area'] : first.edits.find((e) => e.reportCompId === rcOf(k))?.tags ?? []), 'full', first.offered);
  assert.equal(again.edits.find((e) => e.reportCompId === rcOf(CHAMBERS)), undefined);
  assert.equal(again.offeredChanged, false);
});

test('a practice agent: nothing is added, the supported tags are chips, and a contradicted one still comes off', () => {
  const s = settle((k) => (k === CHAMBERS ? ['First floor'] : []), 'practice');
  assert.deepEqual(s.edits, [{ reportCompId: rcOf(CHAMBERS), tags: [] }]);
  assert.deepEqual(s.suggestions[rcOf(CHAMBERS)]!.map((d) => d.tag), ['Bigger']);
  // A chip the agent took is not offered again.
  const taken = settle((k) => (k === CHAMBERS ? ['Bigger'] : []), 'practice');
  assert.equal(taken.suggestions[rcOf(CHAMBERS)], undefined);
});
