// The agent's lines on Send (server/lines.ts): held to the job in code, not
// only in the prompt — a draft fills only empty lines, a rewrite only written
// ones, and a line that cites a figure the agent never gave is dropped.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURRENT_LINES_PROMPT, figuresIn, linesRequest, parseLines, type AgentLines, type LinesInput } from './lines.ts';
import type { WriterInput } from '../workspace/writer-input.ts';

const report = {
  home: { name: '100 Barclay #17L', address: '100 Barclay Street', unit: '17L' },
  audience: 'buyer',
  client_first_name: 'Sam',
  length: 'full',
  result: { kind: 'on_facts', label: 'On the facts', uses_agent_estimates: [] },
  headline_facts: [{ id: 'range.low', what: 'low', value: 'about $3.9M' }],
  headline_cannot_say: [],
  comps: [{ id: 'c1', name: '5 Franklin #14A', agent_note: 'Same line two floors down, sold in 41 days.', agent_tags: ['Same building'] }],
  price_table: null,
  agent_stated: { next_step: 'Open at $3.8M.' },
} as unknown as WriterInput;

const empty: AgentLines = { chosen: '', consider: '', nextStep: '' };
const draft: LinesInput = { job: 'draft', report };

test('a draft fills only the empty lines', () => {
  const mine = { ...empty, nextStep: 'Open at $3.8M.' };
  const r = parseLines(JSON.stringify({ chosen: 'I kept to the same line.', consider: '', next_step: 'Open at $3.8M, firmly.' }), draft, mine)!;
  assert.deepEqual(r.lines, { chosen: 'I kept to the same line.' });
  assert.deepEqual(r.dropped, []);
});

test('a draft that cites a figure the report doesn’t have is dropped', () => {
  const r = parseLines(JSON.stringify({ chosen: 'Sold in 41 days, two floors down.', consider: 'It could go for $4.4M.', next_step: '' }), draft, empty)!;
  assert.deepEqual(r.lines, { chosen: 'Sold in 41 days, two floors down.' });
  assert.deepEqual(r.dropped, ['consider']);
});

test('a rewrite edits only the written lines and keeps the agent’s own figures', () => {
  const mine = { chosen: 'i looked at lower floors  and similar size', consider: '', nextStep: 'open at $3.8M' };
  const rewrite: LinesInput = { job: 'rewrite', report: { home: '100 Barclay #17L', audience: 'buyer', lines: { chosen: mine.chosen, consider: '', next_step: mine.nextStep } } };
  const ok = parseLines(JSON.stringify({ chosen: 'I looked at lower floors and similar sizes.', consider: 'Carrying costs are high.', next_step: 'Open at $3.8M.' }), rewrite, mine)!;
  assert.deepEqual(ok.lines, { chosen: 'I looked at lower floors and similar sizes.', nextStep: 'Open at $3.8M.' });
  const moved = parseLines(JSON.stringify({ chosen: '', consider: '', next_step: 'Open at $3.75M.' }), rewrite, mine)!;
  assert.deepEqual(moved.lines, {});
  assert.deepEqual(moved.dropped, ['nextStep'], 'a rewrite never changes a number');
});

test('an unchanged line isn’t offered, bullets come off, and junk is unreadable', () => {
  const mine = { ...empty, chosen: 'I kept it close.' };
  const rewrite: LinesInput = { job: 'rewrite', report: { home: 'x', audience: null, lines: { chosen: mine.chosen, consider: '', next_step: '' } } };
  assert.deepEqual(parseLines(JSON.stringify({ chosen: 'I kept it close.', consider: '', next_step: '' }), rewrite, mine)!.lines, {});
  assert.deepEqual(parseLines(JSON.stringify({ chosen: '', consider: '- One\n• Two', next_step: '' }), draft, empty)!.lines, { consider: 'One\nTwo' });
  assert.equal(parseLines('not json', draft, empty), null);
});

test('figures read as digits', () => {
  assert.deepEqual(figuresIn('$3.8M, 1,250 sq ft, 41 days, 2.0'), ['3.8', '1250', '41', '2']);
});

test('the request: Opus 5.5 at low effort, structured output, fallbacks, and nothing of the target', () => {
  const req = linesRequest(draft);
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.output_config.effort, 'low');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.thinking, { type: 'adaptive' });
  assert.match(CURRENT_LINES_PROMPT.draft.system, /the next step is the agent's call/);
  assert.doesNotMatch(JSON.stringify(req), /target|agent_number/i);
});
