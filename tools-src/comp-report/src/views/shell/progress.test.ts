import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCK_CALL, LOCK_SORT, progressSteps, rowCta, type ProgressInput } from './progress.ts';

const at = (screen: ProgressInput['screen'], extra: Partial<ProgressInput> = {}): ProgressInput => ({ screen, revealed: false, ready: false, readOnly: false, ...extra });
const states = (i: ProgressInput) => progressSteps(i).map((s) => s.state);

test('the current step is marked; the Gate counts as Findings and Done as Send', () => {
  assert.deepEqual(states(at('sort')), ['current', 'todo', 'todo']);
  assert.deepEqual(states(at('gate')), ['done', 'current', 'todo']);
  assert.deepEqual(states(at('findings')), ['done', 'current', 'todo']);
  assert.deepEqual(states(at('send')), ['done', 'done', 'current']);
  assert.deepEqual(states(at('done')), ['done', 'done', 'done']);
});

test('Findings goes to the Gate until the call is given', () => {
  assert.equal(progressSteps(at('sort', { ready: true }))[1]!.target, 'gate');
  assert.equal(progressSteps(at('sort', { ready: true, revealed: true }))[1]!.target, 'findings');
});

test('Findings and Send stay locked until every comp is sorted; Send also waits for the call', () => {
  const unsorted = progressSteps(at('sort'));
  assert.deepEqual(unsorted.map((s) => s.locked), [null, LOCK_SORT, LOCK_SORT]);
  const sorted = progressSteps(at('sort', { ready: true }));
  assert.deepEqual(sorted.map((s) => s.locked), [null, null, LOCK_CALL]);
  const called = progressSteps(at('findings', { ready: true, revealed: true }));
  assert.deepEqual(called.map((s) => s.locked), [null, null, null]);
});

test('an admin reading someone else’s report can go anywhere', () => {
  assert.deepEqual(progressSteps(at('sort', { readOnly: true })).map((s) => s.locked), [null, null, null]);
});

test('the CTA: Findings on Sort (locked until sorted), Send on Findings, none on the rest', () => {
  assert.deepEqual(rowCta(at('sort')), { label: 'Findings →', target: 'gate', disabled: true });
  assert.deepEqual(rowCta(at('sort', { ready: true })), { label: 'Findings →', target: 'gate', disabled: false });
  assert.deepEqual(rowCta(at('sort', { ready: true, revealed: true })), { label: 'Findings →', target: 'findings', disabled: false });
  assert.deepEqual(rowCta(at('findings', { revealed: true })), { label: 'Send →', target: 'send', disabled: false });
  assert.equal(rowCta(at('gate')), null);
  assert.equal(rowCta(at('send')), null);
  assert.equal(rowCta(at('done')), null);
});
