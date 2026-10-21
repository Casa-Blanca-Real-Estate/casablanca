// What Findings waits for, by the agent's level (NB-8, Kimani's A on 2026-10-21):
// a practice agent needs a tier, a note and comp tags; a full agent a tier and comp tags.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import type { CompJudgment } from '../../../workspace/state.ts';
import { needsOf, readinessLine, sortReadiness } from './screens.ts';

function comp(j: Partial<CompJudgment>): WorkspaceComp {
  const judgment: CompJudgment = {
    reportCompId: 'rc-1', propertyKey: 'pk', evidenceClass: 'sold', tier: null, anchor: false, reviewedAt: null,
    reasons: [], source: { kind: 'export', importId: null }, ...j,
  };
  return { id: 'pk', record: {} as WorkspaceComp['record'], origin: 'export', importId: null, readId: null, unconfirmed: false, judgment, unsortable: null };
}

test('a practice agent needs a tier, a note and comp tags', () => {
  assert.deepEqual(needsOf(comp({}), 'practice'), ['tier', 'note', 'tag']);
  assert.deepEqual(needsOf(comp({ tier: 'primary', tags: ['Same area'] }), 'practice'), ['note']);
  assert.deepEqual(needsOf(comp({ tier: 'primary', tags: ['Same area'], note: 'Close match.' }), 'practice'), []);
});

test('a full agent needs a tier and comp tags; the note is optional', () => {
  assert.deepEqual(needsOf(comp({}), 'full'), ['tier', 'tag']);
  assert.deepEqual(needsOf(comp({ tier: 'primary', tags: ['Same area'] }), 'full'), []);
  const r = sortReadiness([comp({ tier: 'primary', tags: ['Same area'] })], 'full');
  assert.equal(r.ready, true);
});

test('the helper line says what’s left at each level', () => {
  const todo = [comp({}), comp({ tier: 'secondary' })];
  assert.equal(readinessLine(sortReadiness(todo, 'practice')), '2 comps need a tier, note or comp tags');
  assert.equal(readinessLine(sortReadiness(todo, 'full')), '2 comps need a tier or comp tags');
  assert.equal(readinessLine(sortReadiness([], 'full')), 'Add comps to sort');
});
