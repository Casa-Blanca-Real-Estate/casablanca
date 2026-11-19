// Hubert's edits to the home's details: written into the intake, undone from the entries as they were.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyHomeSet, homeUndoStands } from './home-edit.ts';
import type { Intake } from './state.ts';

const intake: Intake = {
  areaSqft: { value: 1200, asOf: '2026-10-01', from: 'listing' },
  beds: { value: 2, asOf: '2026-10-01' },
};

test('sets and clears entries, leaving the rest', () => {
  const next = applyHomeSet(intake, { areaSqft: { value: 1240, asOf: '2026-10-29' }, beds: null, rooms: { value: 4.5, asOf: '2026-10-29' } });
  assert.deepEqual(next, { areaSqft: { value: 1240, asOf: '2026-10-29' }, rooms: { value: 4.5, asOf: '2026-10-29' } });
  assert.deepEqual(intake.beds, { value: 2, asOf: '2026-10-01' }, 'the old intake is left as it was');
  // Undo writes the entries as they were, the StreetEasy mark included.
  assert.deepEqual(applyHomeSet(next, { areaSqft: intake.areaSqft!, beds: intake.beds!, rooms: null }), intake);
});

test('Undo stands while the field reads as Hubert left it', () => {
  const e = (field: string, left: unknown) => ({ kind: 'home', field, undo: { left } });
  assert.equal(homeUndoStands(e('areaSqft', 1200), intake), true);
  assert.equal(homeUndoStands(e('areaSqft', 1240), intake), false, 'changed since');
  assert.equal(homeUndoStands(e('rooms', null), intake), true, 'a clear: still empty');
  assert.equal(homeUndoStands({ kind: 'comp', field: 'beds', undo: { left: 2 } }, intake), false);
  assert.equal(homeUndoStands({ kind: 'home', field: 'beds' }, intake), false);
});
