import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followUpState, nextTicks } from './next-steps.ts';

test('the follow-up waits two days after sending, then is due until ticked', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  assert.equal(followUpState(undefined, {}, now), null);
  assert.equal(followUpState('2026-11-05T12:00:00Z', {}, now), 'waiting');
  assert.equal(followUpState('2026-11-04T12:00:00Z', {}, now), 'due');
  assert.equal(followUpState('2026-11-04T12:00:00Z', { 'follow-up': true }, now), 'done');
  assert.equal(followUpState('2026-11-04T12:00:00Z', { 'plan-offer': true }, now), 'due');
});

test('ticks between two saves: only What’s next’s own keys, either way', () => {
  assert.deepEqual(nextTicks(null, { 'follow-up': true }), [{ item: 'follow-up', on: true }]);
  assert.deepEqual(nextTicks({ 'follow-up': true }, { 'follow-up': false, 'plan-offer': true }), [
    { item: 'follow-up', on: false }, { item: 'plan-offer', on: true },
  ]);
  assert.deepEqual(nextTicks({ 'follow-up': true }, { 'follow-up': true }), []);
  assert.deepEqual(nextTicks({}, { 'made-up': true }), []);
  assert.deepEqual(nextTicks('junk', undefined), []);
});
