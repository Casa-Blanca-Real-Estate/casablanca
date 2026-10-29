// get_view's input: what the browser says is on screen, checked.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readView } from './hubert-view.ts';

test('the view as sent, or none', () => {
  const id = '0b7f3a2e-6c1d-4f5a-9e8b-1a2b3c4d5e6f';
  assert.deepEqual(readView({ screen: 'review', compId: id }), { screen: 'review', compId: id });
  assert.deepEqual(readView({ screen: 'send' }), { screen: 'send', compId: null });
  assert.deepEqual(readView({ screen: 'sort', compId: 'not-a-uuid' }), { screen: 'sort', compId: null });
  assert.equal(readView({ screen: 'admin' }), null);
  assert.equal(readView(null), null);
  assert.equal(readView(['sort']), null);
});
