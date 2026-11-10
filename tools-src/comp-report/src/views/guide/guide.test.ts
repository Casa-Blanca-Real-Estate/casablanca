import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCREEN_IDS } from '../workspace/screens.ts';
import { STEPS, stepForScreen } from './steps.ts';
import { GLOSSARY, GROUPS, findTerm, searchGlossary } from './glossary.ts';

test('the steps are numbered 1 to N in order', () => {
  assert.deepEqual(STEPS.map((s) => s.n), STEPS.map((_, i) => i + 1));
});

test('every screen but the Access panel belongs to exactly one step, for presenter mode’s badge', () => {
  for (const screen of SCREEN_IDS) {
    const owners = STEPS.filter((s) => (s.screens as string[]).includes(screen));
    if (screen === 'access') assert.equal(owners.length, 0);
    else assert.equal(owners.length, 1, screen);
  }
  assert.equal(stepForScreen('sort')?.title, 'Sort the comps');
  assert.equal(stepForScreen('access'), null);
});

test('every word a step names is in the glossary', () => {
  for (const s of STEPS) for (const w of s.words) assert.ok(findTerm(w), `${w} (step ${s.n})`);
});

test('glossary terms are unique, grouped, and searchable by their other names', () => {
  const names = GLOSSARY.map((t) => t.term.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  for (const t of GLOSSARY) assert.ok(GROUPS.includes(t.group), t.term);
  assert.ok(searchGlossary('DOM').some((t) => t.term === 'Days on market'));
  assert.ok(searchGlossary('  ').length === GLOSSARY.length);
});
