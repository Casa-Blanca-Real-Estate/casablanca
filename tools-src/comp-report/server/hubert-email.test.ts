// Hubert and the email (server/hubert-email.ts): get_email reads what Send
// showed; edit_email checks an edit against it and hands it on, writing
// nothing. Words only: the disclaimer stays, a passage must be quoted exactly.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISCLAIMER } from '../workspace/frame.ts';
import type { SendState } from '../workspace/state.ts';
import type { Queryable } from './db.ts';
import { editEmail, editFromResult, emailFor } from './hubert-email.ts';

const body = `Hi Sam,\n\nThe closest sales put #17L at $3.9M to $4.2M.\n\nLet me know when you'd like to talk.\n\n${DISCLAIMER}`;

function tx(send: SendState | null, revealed = true): Queryable & { writes: number } {
  const q = {
    writes: 0,
    async query(sql: string) {
      if (!/^\s*select/i.test(sql)) q.writes++;
      return { rows: [{ send, revealed }], rowCount: 1 };
    },
  };
  return q as unknown as Queryable & { writes: number };
}

const seen: SendState['seen'] = { format: 'full', length: 'full', subject: 'Comps for #17L', headline: 'The closest sales put #17L at $3.9M to $4.2M.', text: body, at: '2026-10-21T20:00:00Z' };
const send: SendState = { seen, chosen: { value: 'I kept to the same line.', asOf: '2026-10-21' } };

test('get_email: the email as Send showed it, and the agent’s lines — never the client note', async () => {
  const got = await emailFor(tx(send), 'r');
  assert.equal(got?.on_send, true);
  assert.equal((got as { body: string }).body, body);
  assert.equal((got as { agent_lines: { chosen: string } }).agent_lines.chosen, 'I kept to the same line.');
  assert.doesNotMatch(JSON.stringify(got), /clientNote|client_note/);
  assert.equal((await emailFor(tx({}), 'r'))?.on_send, false, 'before Send has shown it');
  assert.equal((await emailFor(tx(send, false), 'r'))?.on_send, false, 'before the reveal');
});

test('edit_email: lines and passages, checked, handed on, nothing written', async () => {
  const t = tx(send);
  const r = await editEmail(t, 'r', {
    changes: [{ field: 'next_step', text: 'Offer $3.8M and ask for a 30-day close.' }, { field: 'consider', text: '' }],
    body_edits: [{ find: "Let me know when you'd like to talk.", replace: 'Call me when you’ve had a look.' }],
  });
  assert.ok(r.ok);
  assert.equal(t.writes, 0, 'Send applies it; the server writes nothing');
  assert.deepEqual(r.edit.changes.map((c) => c.field), ['next_step', 'consider']);
  assert.equal(r.edit.length, 'full');
  const block = { type: 'tool_result', content: JSON.stringify({ applied: r.summary, edit: r.edit }) };
  assert.deepEqual(editFromResult(block), r.edit);
  assert.equal(editFromResult({ ...block, is_error: true }), null);
});

test('edit_email refuses what it can’t do', async () => {
  const no = async (input: unknown, s: SendState | null = send, revealed = true) => {
    const r = await editEmail(tx(s, revealed), 'r', input);
    assert.equal(r.ok, false);
    return (r as { error: string }).error;
  };
  assert.match(await no({ changes: [], body_edits: [{ find: 'not there', replace: 'x' }] }), /isn't in the body/);
  assert.match(await no({ changes: [], body_edits: [{ find: '\n\n', replace: ' ' }] }), /appears \d times/);
  assert.match(await no({ changes: [], body_edits: [{ find: DISCLAIMER.slice(0, 40), replace: 'Nothing to see.' }] }), /disclaimer/);
  assert.match(await no({ changes: [{ field: 'styling', text: 'bold' }], body_edits: [] }), /Each change is a field/);
  assert.match(await no({ changes: [{ field: 'headline', text: '' }], body_edits: [] }), /can't be empty/);
  assert.match(await no({ changes: [], body_edits: [] }), /Nothing to change/);
  assert.match(await no({ changes: [{ field: 'subject', text: 'x' }], body_edits: [] }, send, false), /Findings/);
  assert.match(await no({ changes: [{ field: 'subject', text: 'x' }], body_edits: [] }, { ...send, sentAt: '2026-10-21T20:10:00Z' }), /marked this email as sent/);
  assert.match(await no({ changes: [], body_edits: [{ find: 'Hi', replace: 'Hello' }] }, {}), /hasn't opened Send/);
});
