// An agent's own tags (DP-6, Dispatch 20): strict shape, NFC, never a list tag, a fair-housing hard term refused.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { freeTagHardTerm, freeTagProblem, isFreeTag, MAX_FREE_TAG, normalizeFreeTag } from './free-tags.ts';
import { isTag } from './features.ts';

test('a good tag passes, in any script, with the allowed punctuation', () => {
  for (const t of ['Corner unit facing park', 'Pre-war, 2/3 of the block', 'Café (renovated 2019)', 'Garage + storage', '10% smaller', 'Smith & Sons', 'Über-quiet', 'Jardín privado']) {
    assert.ok(isFreeTag(t), t);
    assert.equal(freeTagProblem(t), null, t);
  }
  assert.ok(isFreeTag('x'.repeat(MAX_FREE_TAG)));
});

test('refused: a newline, markup, zero-width and bidi characters, 41 characters, a list tag in other case', () => {
  for (const t of ['Two\nlines', 'tab\there', '<script>', 'a > b', 'Quiet​block', 'Join‍', 'Park ‮weiv', 'Isolate⁦x', 'x'.repeat(MAX_FREE_TAG + 1), 'same building', 'FIRST FLOOR', '', ' padded ', 'Bell\u0007', 'quote"s', 'semi;colon']) {
    assert.equal(isFreeTag(t), false, JSON.stringify(t));
  }
  assert.equal(isFreeTag(42), false);
});

test('NFC: a decomposed tag is refused as given and passes once normalised', () => {
  const nfd = 'Café';
  assert.equal(isFreeTag(nfd), false);
  assert.equal(normalizeFreeTag(` ${nfd} `), 'Café');
  assert.ok(isFreeTag(normalizeFreeTag(nfd)));
});

test('a fair-housing hard term is named; a near one is not a stop', () => {
  assert.deepEqual(freeTagHardTerm('Perfect for couples'), { term: 'Perfect for couples', basis: 'familial status or age' });
  assert.match(freeTagProblem('Safe neighborhood') ?? '', /steering/);
  assert.equal(freeTagHardTerm('Family room'), null);
});

test('no list tag passes as a free one', () => {
  for (const t of ['Same building', 'Similar size', 'Penthouse']) {
    assert.ok(isTag(t));
    assert.equal(isFreeTag(t), false);
  }
});

test('no Jev input holds an agent’s tag: the decision provider never reads report_comps or a comp’s judgment (D-12)', () => {
  const dir = new URL('../server/decide/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  assert.ok(files.length > 5);
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /report_comps|CompJudgment|agent_tags|free-tags|writer-input|\.tags\b(?!\.)/, f);
  }
});
