// Undo on Hubert's comp edits shows only while the comp reads as he left it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TrailEntry } from '../server/hubert-trail.ts';
import type { CompJudgment } from './state.ts';
import { undoStands } from './trail-undo.ts';

const j = (over: Partial<CompJudgment> = {}): CompJudgment => ({
  reportCompId: 'rc1', propertyKey: 'k', evidenceClass: 'sold', tier: 'primary', anchor: false, reviewedAt: null, reasons: [],
  source: { kind: 'export', importId: 'i' }, note: 'Same line.', tags: ['Same building'], ...over,
});
const entry = (field: string, left: unknown): TrailEntry => ({
  kind: 'comp', compId: 'rc1', target: '200 Chambers Street #10A', field, label: field, before: null, after: null, undo: { edit: {}, left },
});

test('offered while the field reads as Hubert left it', () => {
  assert.equal(undoStands(entry('tier', 'primary'), j()), true);
  assert.equal(undoStands(entry('note', 'Same line.'), j()), true);
  assert.equal(undoStands(entry('tags', ['Same building']), j()), true);
  assert.equal(undoStands(entry('floor', 12), j({ factOverrides: { floor: { value: 12, by: 'a', at: 't' } } })), true);
  assert.equal(undoStands(entry('floor', null), j()), true, 'a restore: no override left');
});

test('gone once it’s undone or changed since, on another comp, or taken out', () => {
  assert.equal(undoStands(entry('tier', 'secondary'), j()), false);
  assert.equal(undoStands(entry('note', 'Something else.'), j()), false);
  assert.equal(undoStands(entry('tags', []), j()), false);
  assert.equal(undoStands(entry('tier', 'primary'), j({ reportCompId: 'rc2' })), false);
  assert.equal(undoStands(entry('tier', 'primary'), j({ removedAt: '2026-10-29' })), false);
  assert.equal(undoStands({ ...entry('tier', 'primary'), undo: undefined }, j()), false);
  assert.equal(undoStands(entry('anchor', null), j()), false, 'the star goes back with the tier');
});

test('the star, taking out and putting back: offered while they stand', () => {
  assert.equal(undoStands(entry('anchor', true), j({ anchor: true })), true);
  assert.equal(undoStands(entry('anchor', true), j()), false, 'the star moved on since');
  assert.equal(undoStands(entry('anchor', false), j()), true);
  assert.equal(undoStands(entry('removed', true), j({ removedAt: '2026-10-29' })), true, 'taken out: putting it back is the one undo');
  assert.equal(undoStands(entry('removed', true), j()), false, 'already back');
  assert.equal(undoStands(entry('removed', false), j()), true);
});
