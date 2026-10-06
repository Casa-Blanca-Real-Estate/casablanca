// A sentence's numbers against the headline facts: a number matches a fact at
// the number's own precision, and a name's numbers aren't figures.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HeadlineFact, HeadlineFacts } from '../engine/index.ts';
import { numbersNotInFacts } from './grounding.ts';

const f = (id: string, value: number, unit: HeadlineFact['unit']): HeadlineFact => ({
  id, label: id, value, unit, source: 'engine', as_of: '2026-09-29', confidence: 'exact', derivation: id, comp_ids: [],
});
const h: HeadlineFacts = {
  kind: 'on_facts',
  facts: [f('range.low', 4_225_352, 'usd'), f('range.low_per_sqft', 2112.676, 'usd_per_sqft'), f('range.comps', 3, 'count'), f('sold.median_sale_to_ask', -4.0229, 'percent')],
  agent_number: { position: 'below', facts: [f('agent.high', 4_200_000, 'usd')] },
  names: [{ id: 'subject', address: '100 Barclay Street', unit: '#17L' }, { id: 'c', address: '200 Chambers Street', unit: '#10A' }],
  missing: [],
};

test('a number matches a fact at its own precision: rounded, or truncated as $/sq ft is', () => {
  assert.deepEqual(numbersNotInFacts('About $4.23M, or $4.2M, or $4,225,352.', h), []);
  assert.deepEqual(numbersNotInFacts('$2,112 a sq ft, 4.0% below, from 3 sales.', h), []);
  assert.deepEqual(numbersNotInFacts('About $4.3M at $2,113 a sq ft.', h), ['$4.3M', '$2,113']);
});

test('a name’s numbers aren’t figures, but a figure that looks like one still has to match', () => {
  assert.deepEqual(numbersNotInFacts('17L, like 200 Chambers #10A.', h), []);
  assert.deepEqual(numbersNotInFacts('$200 a sq ft', h), ['$200']);
});

test('the agent’s number counts only when QA allows it', () => {
  assert.deepEqual(numbersNotInFacts('Your $4.2M', h), [], '$4.2M also rounds from the range’s $4,225,352, so it matches a fact');
  assert.deepEqual(numbersNotInFacts('Your $4,200,000', h), ['$4,200,000']);
  assert.deepEqual(numbersNotInFacts('Your $4,200,000', h, { agent: true }), []);
});
