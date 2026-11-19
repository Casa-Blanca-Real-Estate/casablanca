import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCREEN_IDS } from '../workspace/screens.ts';
import { STEPS, stepForScreen } from './steps.ts';
import { TIPS, nextTip, tipsFor } from './tour.ts';

test('the tour has a tip for every screen of the flow, each under one of the guide’s steps', () => {
  for (const s of SCREEN_IDS.filter((x) => x !== 'access')) assert.ok(tipsFor(s).length > 0, s);
  for (const t of TIPS) assert.ok(stepForScreen(t.screen), t.id);
  assert.deepEqual(new Set(TIPS.map((t) => t.screen)), new Set(STEPS.flatMap((s) => s.screens)));
});

test('tip ids are unique, and the one last tip is on Done', () => {
  assert.equal(new Set(TIPS.map((t) => t.id)).size, TIPS.length);
  assert.deepEqual(TIPS.filter((t) => t.last).map((t) => t.screen), ['done']);
});

test('the tour shows the first tip not yet done whose target is on the page', () => {
  const all = () => true;
  assert.equal(nextTip('sort', [], all)?.id, 'sort-row');
  assert.equal(nextTip('sort', ['sort-row'], all)?.id, 'sort-review');
  // No Review comps button (nothing left to review): straight to Findings.
  assert.equal(nextTip('sort', ['sort-row'], (t) => t.id !== 'sort-review')?.id, 'sort-next');
  assert.equal(nextTip('sort', ['sort-row', 'sort-review', 'sort-next'], all), null);
  assert.equal(nextTip(null, [], all), null);
  assert.equal(nextTip('access', [], all), null);
});

test('every tip has a target and short words for the card', () => {
  for (const t of TIPS) {
    assert.ok(t.title.length > 0 && t.targets.length > 0, t.id);
    assert.ok(t.body.length < 170, `${t.id}: ${t.body.length}`);
  }
});
