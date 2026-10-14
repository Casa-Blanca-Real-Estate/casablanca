// A shipped prompt version never changes: conversations started on it replay
// thinking blocks bound to its exact system prompt and tools (§8.3 rule 5).
// Change the assistant by adding a version to PROMPTS, never by editing one.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { CURRENT_PROMPT, promptFor, PROMPTS } from './assistant.ts';

const fingerprint = (id: string) => createHash('sha256').update(JSON.stringify({ system: PROMPTS[id]!.system, tools: PROMPTS[id]!.tools })).digest('hex');

const SHIPPED: Record<string, string> = {
  'cr1-2026-09-25': 'd8fa4a8778d347e5bd2e5a3733f9626a291a5fbb71b424b64979f2f448e2f96b',
  'cr3a-2026-09-29': 'da66a77b3f72a2c1d117f6f86375ad15eeffbb2f26363ada3506dbbe837e7ae6',
  'cr6-2026-10-15': '1a4ed4fa534c60910971dac5682a355e3c0c68db0d593127c4d6ea068a25fee9',
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
