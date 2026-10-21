// The agent's lines on Send, and Hubert's edits to the email (2026-10-21),
// against a real PostgreSQL and the fake Messages API: the lines are drafted
// from the agent's notes or tidied, from what's stored, with nothing of the
// call, the target, the deal terms or the client note in the request; and
// Hubert reads the email Send showed and hands his checked edit to Send
// through the turn's stream, writing nothing to the report himself.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Anthropic from '@comp-report/anthropic-sdk';
import pg from 'pg';
import { startFakeAnthropic, type FakeAnthropic } from '../dev/fake-anthropic.ts';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleLines, type LinesDeps } from '../server/api/lines.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleTurn } from '../server/api/turn.ts';
import { handleWorkspace } from '../server/api/workspace.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import { SAMPLE_BRIEF, SAMPLE_INTAKE } from '../server/sample/barclay-17l.ts';
import { DISCLAIMER } from '../workspace/frame.ts';
import type { SendState } from '../workspace/state.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = {
  'tok-kimani-000000': 'kimani@casa-blanca.com',
  'tok-ana-000000000': 'ana@casa-blanca.com',
};

// Distinctive figures, so the requests can be searched for them (§8.4).
const CALL = { low: 3_456_789, high: 3_987_654, note: 'my private read on it', at: '2026-10-21T12:00:00.000Z' };
const TARGET = { price: { value: 4_111_111, asOf: '2026-10-21' }, note: { value: 'the owners’ secret number', asOf: '2026-10-21' } };
const DEAL = { template: 'buyer_traditional', price: { value: 4_222_222, asOf: '2026-10-21' } };
const CLIENT_NOTE = 'They are nervous about the board package';

describe('the agent’s lines on Send, and Hubert’s edits to the email', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let fake: FakeAnthropic;
  let deps: LinesDeps;
  let report = '';

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    fake = await startFakeAnthropic();
    deps = {
      verifier: {
        async verify(token: string) {
          const email = PEOPLE[token];
          return email ? ({ id: `id-${token}`, email, confirmed: true, provider: 'google', name: null } as IdentityUser) : null;
        },
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com' }),
      pool: pool as unknown as PoolLike,
      env: { CR_WRITES_PER_DAY: '3' },
      anthropic: () => new Anthropic({ apiKey: 'test', baseURL: fake.url, maxRetries: 0 }),
    };
  });
  after(async () => {
    await fake.close();
    await pool.end();
    await db?.drop();
  });

  const request = (path: string, token: string, method = 'GET', body?: unknown) =>
    new Request(`https://site/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const lines = async (job: string, token = 'tok-kimani-000000') => {
    const res = await handleLines(request('api/comp-report/lines', token, 'POST', { reportId: report, job }), deps);
    return { status: res.status, body: (await res.json()) as { lines: Record<string, string>; dropped: string[]; error?: string } };
  };
  const saveSend = async (send: SendState) =>
    assert.equal((await handleWorkspace(request('workspace', 'tok-kimani-000000', 'PATCH', { reportId: report, state: { intake: SAMPLE_INTAKE, dealTerms: DEAL, send } }), deps)).status, 200);
  const stateSend = async () => (await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) =>
    tx.query<{ send: SendState }>(`select state -> 'send' as send from comp_report.reports where id = $1`, [report]))).rows[0]!.send;
  const turn = async (message?: string) => {
    const res = await handleTurn(request('api/comp-report/turn', 'tok-kimani-000000', 'POST', { reportId: report, message }), deps);
    const raw = res.status === 200 ? await res.text() : '';
    return raw.split('\n\n').filter((c) => c.startsWith('data: ')).map((c) => JSON.parse(c.slice(6)) as Record<string, unknown>);
  };

  test('the sample report, sorted, with a target, deal terms and a client note', async () => {
    report = (await (await handleReports(request('reports', 'tok-kimani-000000', 'POST', { title: '100 Barclay Street #17L' }), deps)).json()).report.id;
    assert.equal((await handleImports(request('imports', 'tok-kimani-000000', 'POST', { reportId: report, sample: true }), deps)).status, 201);
    assert.equal((await handleComps(request('comps', 'tok-kimani-000000', 'POST', { reportId: report, sample: true }), deps)).status, 200);
    const brief = { ...SAMPLE_BRIEF, audience: { value: 'buyer', asOf: '2026-10-21' }, clientNote: { value: CLIENT_NOTE, asOf: '2026-10-21' } };
    assert.equal((await handleWorkspace(request('workspace', 'tok-kimani-000000', 'PATCH', { reportId: report, brief, target: TARGET, state: { intake: SAMPLE_INTAKE, dealTerms: DEAL, send: {} } }), deps)).status, 200);
  });

  test('before the agent’s number there are no lines to draft', async () => {
    assert.deepEqual([(await lines('draft')).status, (await lines('draft')).body.error], [409, 'not_revealed']);
    assert.equal((await handleWorkspace(request('workspace', 'tok-kimani-000000', 'PATCH', { reportId: report, call: CALL }), deps)).status, 200);
  });

  test('a draft fills the empty lines from the agent’s notes, and never sees their number, the target, the terms or the client note', async () => {
    await saveSend({ nextStep: { value: 'Open at $3.8M.', asOf: '2026-10-21' } });
    const before = fake.requests.length;
    const r = await lines('draft');
    assert.equal(r.status, 200);
    assert.ok(r.body.lines.chosen, 'how the comps were chosen, drafted');
    assert.equal(r.body.lines.nextStep, undefined, 'the agent’s own next step is never redrafted');
    const sent = JSON.stringify(fake.requests.slice(before));
    for (const secret of ['3456789', '3987654', '4111111', '4222222', 'my private read', 'secret number', CLIENT_NOTE]) {
      assert.ok(!sent.includes(secret), `the request carries ${secret}`);
    }
    const body = fake.requests.at(-1)!.body;
    assert.equal(body.model, 'claude-opus-5-5');
    assert.deepEqual((body.output_config as { effort: string }).effort, 'low');
  });

  test('a rewrite tidies only what the agent wrote', async () => {
    await saveSend({ chosen: { value: 'i looked at lower floors', asOf: '2026-10-21' }, nextStep: { value: 'open at $3.8M', asOf: '2026-10-21' } });
    const r = await lines('rewrite');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.lines, { chosen: 'I looked at lower floors.', nextStep: 'Open at $3.8M.' });
    assert.equal((await stateSend()).chosen?.value, 'i looked at lower floors', 'nothing is saved: Send offers it');
  });

  test('only the owner asks, and the daily limit holds', async () => {
    assert.equal((await lines('draft', 'tok-ana-000000000')).status, 404);
    // Kimani is an admin: at least 200 a day. Fill the log to the limit, as his own calls would.
    await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) => tx.query(
      `insert into comp_report.usage (user_email, report_id, provider, model, purpose, input_tokens, output_tokens)
       select 'kimani@casa-blanca.com', $1, 'anthropic', 'claude-opus-5-5', 'lines', 1, 1 from generate_series(1, 200)`, [report]));
    const capped = await lines('rewrite');
    assert.deepEqual([capped.status, capped.body.error], [429, 'lines_limit'], 'counted from the usage log');
  });

  test('Hubert reads the email Send showed, and his edit reaches Send through the stream, unwritten', async () => {
    const text = `Hi,\n\nThe closest sales put #17L at about $3.9M.\n\nLet me know when you'd like to talk.\n\n${DISCLAIMER}`;
    const send: SendState = {
      chosen: { value: 'I looked at lower floors.', asOf: '2026-10-21' },
      seen: { format: 'full', length: 'full', subject: 'Comps for #17L', headline: 'The closest sales put #17L at about $3.9M.', text, at: '2026-10-21T20:00:00Z' },
    };
    await saveSend(send);

    fake.scripts.push({ content: [{ type: 'tool_use', id: 'toolu_read', name: 'get_email', input: {} }], stopReason: 'tool_use' });
    await turn('How does my email read?');
    fake.scripts.push({
      content: [{ type: 'tool_use', id: 'toolu_edit', name: 'edit_email', input: {
        changes: [{ field: 'next_step', text: 'I’d open at $3.8M.' }],
        body_edits: [{ find: "Let me know when you'd like to talk.", replace: 'Call me when you’ve read it.' }],
      } }],
      stopReason: 'tool_use',
    });
    await turn(undefined);
    const read = (fake.requests.at(-1)!.body.messages as Array<{ content: Array<{ type: string; content?: string }> }>).at(-1)!.content[0]!;
    assert.equal(read.type, 'tool_result');
    assert.match(String(read.content), /Let me know when you'd like to talk/);
    assert.doesNotMatch(String(read.content), new RegExp(CLIENT_NOTE));

    fake.scripts.push({ content: [{ type: 'text', text: 'Done: the next step and the closing line.' }], stopReason: 'end_turn' });
    const events = await turn(undefined);
    assert.equal(events[0]!.type, 'email_edit', 'the edit comes first, for Send to apply');
    assert.deepEqual(events[0]!.edit, {
      changes: [{ field: 'next_step', text: 'I’d open at $3.8M.' }],
      bodyEdits: [{ find: "Let me know when you'd like to talk.", replace: 'Call me when you’ve read it.' }],
      length: 'full',
    });
    assert.deepEqual(await stateSend(), send, 'Hubert writes nothing: Send applies the edit');

    // A passage that isn't there comes back to him as an error, and nothing reaches Send.
    fake.scripts.push({ content: [{ type: 'tool_use', id: 'toolu_bad', name: 'edit_email', input: { changes: [], body_edits: [{ find: 'nowhere', replace: 'x' }] } }], stopReason: 'tool_use' });
    await turn('Change the sign-off line');
    fake.scripts.push({ content: [{ type: 'text', text: 'I couldn’t find that line.' }], stopReason: 'end_turn' });
    const after = await turn(undefined);
    assert.ok(!after.some((e) => e.type === 'email_edit'));
    const err = (fake.requests.at(-1)!.body.messages as Array<{ content: Array<{ type: string; is_error?: boolean }> }>).at(-1)!.content[0]!;
    assert.equal(err.is_error, true);
  });
});
