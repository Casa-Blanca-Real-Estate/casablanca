// A shipped prompt version never changes: conversations started on it replay
// thinking blocks bound to its exact system prompt and tools (§8.3 rule 5).
// Change the assistant by adding a version to PROMPTS, never by editing one.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { CURRENT_PROMPT, promptFor, PROMPTS, withdrawnSeqs } from './assistant.ts';

const fingerprint = (id: string) => createHash('sha256').update(JSON.stringify({ system: PROMPTS[id]!.system, tools: PROMPTS[id]!.tools })).digest('hex');

const SHIPPED: Record<string, string> = {
  'cr1-2026-09-25': 'd8fa4a8778d347e5bd2e5a3733f9626a291a5fbb71b424b64979f2f448e2f96b',
  'cr3a-2026-09-29': 'da66a77b3f72a2c1d117f6f86375ad15eeffbb2f26363ada3506dbbe837e7ae6',
  'cr6-2026-10-15': '1a4ed4fa534c60910971dac5682a355e3c0c68db0d593127c4d6ea068a25fee9',
  'hb-send-2026-10-21': '300dcae38c1ed9873fe7e1ab2587aac4824e9ac0e7569fd456d0bdb02bedd85d',
  'hb-listing-2026-10-28': '19c6a2619012d5d098719f2d1cf6564d5de61a797a7a6eecf98e1e5ec31b437e',
  'hb-trail-2026-10-28': '97e6142a581bc4de69e85f09dd1b05cce47df765c1c67dbd293dfee6f0e3d922',
  'hb-view-2026-10-29': 'bfd999e0d94998500314caf185d4de97795eb75cd4f84e61641fb91ca9acd9da',
  'hb-home-2026-10-29': '8f826e81820bc315c395de0e02298d2d54e728746c7f1c74e781899958960424',
};

test('shipped prompt versions are unchanged, byte for byte', () => {
  for (const [id, hash] of Object.entries(SHIPPED)) assert.equal(fingerprint(id), hash, `${id} changed: add a new version instead`);
});

test('a conversation keeps the version it started on', () => {
  assert.equal(promptFor([]).id, CURRENT_PROMPT.id, 'a new conversation starts on the current one');
  assert.equal(promptFor([{ prompt_version: null }, { prompt_version: 'cr3a-2026-09-29' }]).id, 'cr1-2026-09-25', 'recorded before versions: CR-1');
  assert.equal(promptFor([{ prompt_version: 'cr1-2026-09-25' }]).id, 'cr1-2026-09-25');
  assert.equal(promptFor([{ prompt_version: 'cr3a-2026-09-29' }, { prompt_version: null }]).id, 'cr3a-2026-09-29');
});

test('hb-voice (2026-11-06): hb-home with the chat voice, the step call-out and the calculator, its tools unchanged', () => {
  const voice = PROMPTS['hb-voice-2026-11-06']!;
  const home = PROMPTS['hb-home-2026-10-29']!;
  assert.equal(CURRENT_PROMPT.id, voice.id);
  assert.deepEqual(voice.tools, home.tools);
  assert.ok(voice.system.startsWith(home.system.split('Be concise and plain-spoken')[0]!), 'everything before the old last line is kept');
  for (const part of ['Your voice in the chat.', "Meet the agent's energy", 'Where the agent is.', 'The calculator.', 'Building the comps together', 'never call it one']) {
    assert.ok(voice.system.includes(part), part);
  }
  assert.ok(!voice.system.includes('Be concise and plain-spoken'), 'the flat line is replaced');
});

test('Stop: a withdraw marker takes its message and everything after it out, up to the marker', () => {
  const t = (seq: number, role: string, content: Array<Record<string, unknown>>) => ({ seq, role, content });
  const rows = [
    t(1, 'user', [{ type: 'text', text: 'hi' }]),
    t(2, 'assistant', [{ type: 'text', text: 'hey!' }]),
    t(3, 'user', [{ type: 'text', text: 'oops' }]),
    t(4, 'assistant', [{ type: 'tool_use', id: 'a', name: 'get_view', input: {} }]),
    t(5, 'user', [{ type: 'tool_result', tool_use_id: 'a', content: '{}' }]),
    t(6, 'user', [{ type: 'withdraw', from: 3 }]),
    t(7, 'user', [{ type: 'text', text: 'fixed' }]),
  ];
  assert.deepEqual([...withdrawnSeqs(rows)].sort(), [3, 4, 5, 6]);
  assert.equal(withdrawnSeqs(rows.slice(0, 5)).size, 0);
});
