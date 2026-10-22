// Hubert on one comp (Dispatch 25): the round is held to its job's shape, and
// a point, sentence or reason that cites a figure the input doesn't hold is
// dropped, never shown.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReviewInput } from '../workspace/review.ts';
import { parseReview, reviewRequest } from './comp-review.ts';

const input: ReviewInput = {
  home: { name: '17L', type: 'condo', facts: { size: '2,000 sq ft', floor: '17' }, features: {} },
  comp: {
    name: '200 Chambers Street #10A', status: 'sold', source: 'StreetEasy export',
    facts: { sale_price: '$4,250,000', price_per_sqft: '$2,112', floor: '10' }, features: {},
    against_the_home: ['7 floors lower than the home'], checks: [],
  },
  agent: { note: 'Close in size, full service', tags: ['Similar size'] },
};

test('feedback: its points, with any that cite a figure the input lacks dropped', () => {
  const r = parseReview(JSON.stringify({
    holds_up: ['Full service matches.', 'It sold for $4,250,000.'],
    look_again: ['It is 7 floors lower than the home.', 'It sold 12% over ask.'],
    weak: false, weak_reason: '',
  }), 'feedback', input)!;
  assert.equal(r.text, 'What holds up:\n- Full service matches.\n- It sold for $4,250,000.\nLook again:\n- It is 7 floors lower than the home.');
  assert.equal(r.dropped, 1);
  assert.equal(r.weak, null);
  assert.equal(r.tier, undefined, 'feedback gives no tier');
});

test('a take: sentences with an invented figure dropped; a weak reason that invents one drops the flag', () => {
  const r = parseReview(JSON.stringify({
    reasoning: 'A close match at $2,112 a foot. It would sell for $4.6M today. Same kind of building.',
    tier: 'primary', tier_why: 'Close in every way.', weak: true, weak_reason: 'sold 40 months ago',
  }), 'take', input)!;
  assert.equal(r.text, 'A close match at $2,112 a foot. Same kind of building.');
  assert.equal(r.tier, 'primary');
  assert.equal(r.tierWhy, 'Close in every way.');
  assert.equal(r.weak, null);
  assert.equal(r.dropped, 2);
  const weak = parseReview(JSON.stringify({ reasoning: 'Far away.', tier: 'excluded', tier_why: '', weak: true, weak_reason: 'half a mile away' }), 'take', input)!;
  assert.deepEqual(weak.weak, { reason: 'half a mile away' });
});

test('not the job’s shape, or nothing left: no round', () => {
  assert.equal(parseReview('not json', 'take', input), null);
  assert.equal(parseReview(JSON.stringify({ reasoning: 'Fine.', tier: 'best', tier_why: '', weak: false, weak_reason: '' }), 'take', input), null);
  assert.equal(parseReview(JSON.stringify({ reasoning: 'Worth $9M.', tier: 'primary', tier_why: '', weak: false, weak_reason: '' }), 'take', input), null);
  assert.equal(parseReview(JSON.stringify({ holds_up: [], look_again: [], weak: false, weak_reason: '' }), 'feedback', input), null);
});

test('the request: the model and effort set, structured output, the comp in the message', () => {
  const req = reviewRequest('take', input);
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.output_config.effort, 'medium');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.ok(req.messages[0]!.content[0]!.text.includes('200 Chambers Street #10A'));
});
