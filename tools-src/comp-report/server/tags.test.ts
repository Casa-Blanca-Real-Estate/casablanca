// Every tag stored before Dispatch 20 still loads and saves: each list tag passes cleanTags as it is.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanTags } from './api/comps.ts';
import { TAGS } from '../workspace/features.ts';

test('every list tag, and the handoff’s original eighteen, pass unchanged', () => {
  assert.deepEqual(cleanTags([...TAGS]), [...TAGS]);
  assert.deepEqual(cleanTags(['Same building', 'Same building', 'Corner, park view']), ['Same building', 'Corner, park view']);
});

test('not a list of text: refused', () => {
  assert.throws(() => cleanTags('Same building'), /list/);
  assert.throws(() => cleanTags([1]), /text/);
});
