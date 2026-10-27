// Hubert on the client's words (Dispatch 26): a point or sentence that cites a
// figure the input doesn't hold is dropped, a drafted sentence with a
// fair-housing hard term goes with it, the agent's own words get the list
// checked in code, and the request carries nothing of the target or the call.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClientCompInput, ClientOverviewInput } from '../workspace/client-words.ts';
import { clientWordsRequest, parseClientWords, type ClientWordsInput } from './client-words.ts';

const comp: ClientCompInput = {
  home: { name: '100 Barclay #17L', address: '100 Barclay Street', unit: '17L' },
  audience: 'buyer',
  client_first_name: 'Sam',
  comp: {
    id: 'c1', name: '5 Franklin #14A', status: 'sold', link: null, frame_line: 'sold for $4,250,000', tier: 'primary',
    facts: { sale_price: '$4,250,000', price_per_sqft: '$2,112' }, against_the_home: ['3 floors lower than the home'],
    agent_note: 'Same line, sold in 41 days.', agent_tags: ['Same building'],
  },
  hubert_take_on_sort: 'The closest match in the set.',
};

const draft: ClientWordsInput = { job: 'draft', target: 'comp', input: comp };

test('a draft: a sentence with an invented figure, or a fair-housing hard term, is dropped', () => {
  const r = parseClientWords(JSON.stringify({
    paragraph: 'It sits in the same line, 3 floors lower. It sold in 41 days. It would fetch $4.6M now. Perfect for young professionals.',
  }), draft)!;
  assert.equal(r.text, 'It sits in the same line, 3 floors lower. It sold in 41 days.');
  assert.equal(r.dropped, 2);
});

test('a draft with nothing left, or not the shape: no round', () => {
  assert.equal(parseClientWords(JSON.stringify({ paragraph: 'Worth $9,876,543.' }), draft), null);
  assert.equal(parseClientWords('not json', draft), null);
  assert.equal(parseClientWords('[]', draft), null);
});

test('feedback on a paragraph: sections, invented figures dropped, the fair-housing list added in code', () => {
  const w: ClientWordsInput = { job: 'feedback', target: 'comp', input: { ...comp, agent_paragraph: 'Same line, and a safe neighborhood for a family.' } };
  const r = parseClientWords(JSON.stringify({
    works: ['Naming the line helps.'],
    unclear: ['Say what "line" means.'],
    unsupported: ['It sold for $3.1M is not in the facts.'],
    off_voice: [],
  }), w)!;
  assert.equal(r.dropped, 1);
  assert.match(r.text, /^What works:\n- Naming the line helps\.\nWhat’s unclear:\n- Say what "line" means\.\nFair housing:\n/);
  assert.match(r.text, /“safe neighborhood” reads as a preference on steering: take it out/);
  assert.match(r.text, /“family” can touch on familial status/);
  assert.doesNotMatch(r.text, /Not supported/);
});

test('feedback on the overview reads the agent’s lines for fair housing', () => {
  const input: ClientOverviewInput = {
    home: comp.home, audience: 'buyer', client_first_name: 'Sam', headline_facts: [], comps: [],
    agent_overview: { headline: 'Ideal for empty nesters', how_the_comps_were_chosen: 'Same line.', things_to_consider: '', next_step: '' },
  };
  const r = parseClientWords(JSON.stringify({ works: [], unclear: [], unsupported: [], off_voice: [] }), { job: 'feedback', target: 'overview', input })!;
  assert.match(r.text, /^Fair housing:\n- “Ideal for empty nesters” reads as a preference/);
});

test('the request: Opus 5.5 at low effort, structured output, fallbacks; no target, number or deal terms', () => {
  const req = clientWordsRequest(draft);
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.output_config.effort, 'low');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.fallbacks, 'default');
  const text = req.messages[0]!.content[0]!.text;
  assert.ok(text.includes('5 Franklin #14A'));
  assert.doesNotMatch(text, /target|budget|offer_price|deal_terms/i);
});
