// The streamed assistant turn, end to end: the real Anthropic SDK against a
// scripted fake of the Messages API, and a real PostgreSQL. Checks what the
// server sends the model (pinned model, effort, thinking, fallbacks, tools,
// the verbatim transcript), what the browser receives, and what's recorded.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Anthropic from '@comp-report/anthropic-sdk';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleMessages } from '../server/api/messages.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleTurn, type TurnDeps } from '../server/api/turn.ts';
import { CURRENT_PROMPT } from '../server/assistant.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import { startFakeAnthropic, type FakeAnthropic, type Script } from '../dev/fake-anthropic.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

type Block = Record<string, unknown>;

const PEOPLE: Record<string, Partial<IdentityUser>> = {
  'tok-ana-000000000': { email: 'ana@casa-blanca.com' },
  'tok-ben-000000000': { email: 'ben@casa-blanca.com' },
};

describe('the streamed assistant turn', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let fake: FakeAnthropic;
  let scripts: Script[];
  let requests: FakeAnthropic['requests'];
  let deps: TurnDeps;
  let reportId: string;

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    fake = await startFakeAnthropic();
    scripts = fake.scripts;
    requests = fake.requests;
    const baseURL = fake.url;
    deps = {
      verifier: {
        verify: async (t) => (PEOPLE[t] ? ({ id: t, confirmed: true, provider: 'google', name: null, ...PEOPLE[t] } as IdentityUser) : null),
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({}),
      pool: pool as unknown as PoolLike,
      anthropic: () => new Anthropic({ apiKey: 'test-key', baseURL, maxRetries: 0 }),
    };
    const created = await handleReports(new Request('https://site/api/comp-report/reports', {
      method: 'POST', headers: { authorization: 'Bearer tok-ana-000000000' }, body: JSON.stringify({ title: '100 Barclay Street, #17L' }),
    }), deps);
    reportId = (await created.json()).report.id;
  });
  after(async () => {
    await fake?.close();
    await pool?.end();
    await db?.drop();
  });

  async function turn(message: string | undefined, token = 'tok-ana-000000000', extra: Partial<TurnDeps> = {}) {
    const res = await handleTurn(new Request('https://site/api/comp-report/turn', {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ reportId, message }),
    }), { ...deps, ...extra });
    const raw = res.status === 200 ? await res.text() : '';
    const events = raw.split('\n\n').filter((c) => c.startsWith('data: ')).map((c) => JSON.parse(c.slice(6)));
    return { res, raw, events };
  }

  const stored = () => withActor(pool as unknown as PoolLike, { kind: 'user', email: 'ana@casa-blanca.com', role: 'agent' }, async (tx) =>
    (await tx.query<{ seq: number; role: string; content: Block[]; stop_reason: string | null; in_context: boolean; model: string | null; request_id: string | null }>(
      'select seq, role, content, stop_reason, in_context, model, request_id from comp_report.messages where report_id = $1 order by seq', [reportId])).rows);

  test('one streamed turn completes, and is recorded verbatim with its usage', async () => {
    scripts.push({
      content: [
        { type: 'thinking', thinking: 'Looking at what this report is.', signature: 'sig-one' },
        { type: 'text', text: 'Hello Ana — this is the 100 Barclay report.' },
      ],
      stopReason: 'end_turn',
    });
    const { res, events } = await turn('Hi — which report is this?');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    assert.equal(events[0].type, 'start');
    assert.deepEqual(events.filter((e) => e.type === 'progress').map((e) => e.text), ['Looking at what this report is.']);
    assert.equal(events.filter((e) => e.type === 'text').map((e) => e.text).join(''), 'Hello Ana — this is the 100 Barclay report.');
    const done = events.at(-1);
    assert.equal(done.type, 'done');
    assert.equal(done.stopReason, 'end_turn');
    assert.deepEqual(done.usage, { input: 1200, output: 300, cacheRead: 800, cacheWrite: 0, costUsd: 0.01096 });

    // What the model was sent: everything pinned server-side (§8.3, §8.8).
    const sent = requests.at(-1)!;
    assert.equal(sent.body.model, 'claude-opus-5-5');
    assert.deepEqual(sent.body.output_config, { effort: 'low' });
    assert.deepEqual(sent.body.thinking, { type: 'adaptive', display: 'updates', block_binding: { prefix_mismatch_behavior: 'error' } });
    assert.equal(sent.body.fallbacks, 'default');
    assert.deepEqual(sent.body.tool_choice, { type: 'auto' });
    // A new conversation starts on the current prompt and tools, and stays on them.
    assert.deepEqual((sent.body.tools as Block[]).map((t) => t.name), ['get_report', 'get_numbers']);
    assert.equal((sent.body.system as Block[])[0]!.text, CURRENT_PROMPT.system);
    assert.equal(sent.body.stream, true);
    const betas = String(sent.headers['anthropic-beta']);
    for (const b of ['thinking-display-updates-2026-08-18', 'server-side-fallback-2026-07-01', 'thinking-binding-controls-2026-08-01']) {
      assert.ok(betas.includes(b), b);
    }
    assert.deepEqual(sent.body.messages, [{ role: 'user', content: [{ type: 'text', text: 'Hi — which report is this?' }] }]);

    const rows = await stored();
    assert.deepEqual(rows.map((r) => [r.seq, r.role, r.in_context, r.stop_reason]), [[1, 'user', true, null], [2, 'assistant', true, 'end_turn']]);
    assert.equal(rows[1]!.request_id, 'req_fake_1');
    assert.deepEqual(rows[1]!.content[0], { type: 'thinking', thinking: 'Looking at what this report is.', signature: 'sig-one' });
  });

  test('a tool call is run server-side on the next request, and the history is replayed unchanged', async () => {
    scripts.push({ content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_report', input: {} }], stopReason: 'tool_use' });
    const first = await turn('Double-check the property type?');
    assert.equal(first.events.find((e) => e.type === 'tool')?.name, 'get_report');
    assert.equal(first.events.at(-1).stopReason, 'tool_use');

    scripts.push({ content: [{ type: 'text', text: "It's a condo." }], stopReason: 'end_turn' });
    const second = await turn(undefined); // the browser just asks again
    assert.equal(second.events.at(-1).type, 'done');

    const sent = requests.at(-1)!.body.messages as Array<{ role: string; content: Block[] }>;
    // Earlier turns go back exactly as they were stored — thinking signature included.
    assert.deepEqual(sent[1], { role: 'assistant', content: (await stored())[1]!.content });
    const last = sent.at(-1)!;
    assert.equal(last.role, 'user');
    assert.equal(last.content[0]!.type, 'tool_result');
    assert.equal(last.content[0]!.tool_use_id, 'toolu_1');
    assert.match(String(last.content[0]!.content), /"property_type":"condo"/);
  });

  test("a refusal is shown and recorded, but not replayed into later turns", async () => {
    scripts.push({ content: [], stopReason: 'refusal', stopDetails: { type: 'refusal', category: 'cyber', explanation: null } });
    const refused = await turn('Something the classifier declines');
    assert.deepEqual(refused.events.at(-1), { type: 'refused', category: 'cyber' });
    const rows = await stored();
    assert.deepEqual([rows.at(-1)!.stop_reason, rows.at(-1)!.in_context], ['refusal', false]);

    scripts.push({ content: [{ type: 'text', text: 'Sure.' }], stopReason: 'end_turn' });
    await turn('Something ordinary');
    const sent = requests.at(-1)!.body.messages as Array<{ role: string; content: Block[] }>;
    const texts = sent.flatMap((m) => m.content.filter((b) => b.type === 'text').map((b) => b.text));
    assert.ok(!texts.includes('Something the classifier declines'));
    assert.ok(texts.includes('Something ordinary'));
  });

  test('a turn that runs past the deadline is stopped cleanly and kept out of context', async () => {
    scripts.push({ content: [{ type: 'text', text: 'x'.repeat(400) }], stopReason: 'end_turn', delayMs: 40 });
    const slow = await turn('Write something long', 'tok-ana-000000000', { deadlineMs: 1_200, heartbeatMs: 300 });
    const last = slow.events.at(-1);
    assert.equal(last.type, 'interrupted');
    assert.equal(last.reason, 'time_limit');
    assert.ok(slow.raw.includes(': keep-alive') || slow.events.some((e) => e.type === 'text'), 'the stream kept moving');
    const rows = await stored();
    assert.deepEqual([rows.at(-1)!.role, rows.at(-1)!.stop_reason, rows.at(-1)!.in_context], ['assistant', 'interrupted', false]);
  });

  test('if the browser disconnects mid-turn, the turn still finishes and is recorded', async () => {
    scripts.push({ content: [{ type: 'text', text: 'A reply the agent will read after reloading.' }], stopReason: 'end_turn', delayMs: 30 });
    const before = (await stored()).length;
    const res = await handleTurn(new Request('https://site/api/comp-report/turn', {
      method: 'POST', headers: { authorization: 'Bearer tok-ana-000000000' }, body: JSON.stringify({ reportId, message: 'Reloading mid-reply' }),
    }), deps);
    const reader = res.body!.getReader();
    await reader.read(); // the first event arrives…
    await reader.cancel(); // …then the browser goes away
    for (let i = 0; i < 100 && (await stored()).length < before + 2; i++) await new Promise((r) => setTimeout(r, 30));
    const last = (await stored()).at(-1)!;
    assert.deepEqual([last.role, last.stop_reason, last.in_context], ['assistant', 'end_turn', true]);
    assert.equal((last.content[0] as { text?: string }).text, 'A reply the agent will read after reloading.');
  });

  test('a message sent while a reply is still being written waits: it is refused, and that reply is still recorded', async () => {
    scripts.push({ content: [{ type: 'text', text: 'A slow reply that must not be lost.' }], stopReason: 'end_turn', delayMs: 40 });
    const before = (await stored()).length;
    const first = await handleTurn(new Request('https://site/api/comp-report/turn', {
      method: 'POST', headers: { authorization: 'Bearer tok-ana-000000000' }, body: JSON.stringify({ reportId, message: 'First' }),
    }), deps);
    const reader = first.body!.getReader();
    await reader.read(); // under way: the message is stored, its reply isn't yet
    const second = await turn('Second, too soon');
    assert.equal(second.res.status, 409);
    assert.equal((await second.res.json()).error, 'turn_in_progress');
    while (!(await reader.read()).done); // the first runs to its end
    const rows = await stored();
    assert.equal(rows.length, before + 2, 'the refused message was never stored');
    assert.deepEqual(rows.slice(-2).map((r) => [r.role, r.stop_reason, r.in_context]), [['user', null, true], ['assistant', 'end_turn', true]]);
    assert.equal((rows.at(-1)!.content[0] as { text?: string }).text, 'A slow reply that must not be lost.');
  });

  test('a message left without a reply (a function that died) holds the report only for a while', async () => {
    const next = (await stored()).at(-1)!.seq + 1;
    await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'ana@casa-blanca.com', role: 'agent' }, (tx) =>
      tx.query(`insert into comp_report.messages (report_id, seq, role, content, prompt_version) values ($1, $2, 'user', $3, $4)`,
        [reportId, next, JSON.stringify([{ type: 'text', text: 'Left unanswered' }]), CURRENT_PROMPT.id]));
    assert.equal((await turn('Anyone there?')).res.status, 409);
    scripts.push({ content: [{ type: 'text', text: 'Back.' }], stopReason: 'end_turn' });
    const later = await turn('Anyone there?', 'tok-ana-000000000', { inFlightSeconds: 0 });
    assert.equal(later.events.at(-1).type, 'done');
    const sent = requests.at(-1)!.body.messages as Array<{ role: string; content: Block[] }>;
    assert.deepEqual(sent.slice(-2).map((m) => m.content.map((b) => b.text)), [['Left unanswered'], ['Anyone there?']]);
  });

  test("another agent can't talk in, or read, Ana's report", async () => {
    const ben = await turn('hello', 'tok-ben-000000000');
    assert.equal(ben.res.status, 404);
    const read = await handleMessages(new Request(`https://site/api/comp-report/messages?report=${reportId}`, {
      headers: { authorization: 'Bearer tok-ben-000000000' },
    }), deps);
    assert.equal(read.status, 404);
  });

  test('the transcript reads back as text, progress notes and tools', async () => {
    const res = await handleMessages(new Request(`https://site/api/comp-report/messages?report=${reportId}`, {
      headers: { authorization: 'Bearer tok-ana-000000000' },
    }), deps);
    const { messages } = await res.json();
    assert.equal(messages[1].text, 'Hello Ana — this is the 100 Barclay report.');
    assert.deepEqual(messages[1].progress, ['Looking at what this report is.']);
    assert.ok(messages.some((m: { tools: string[] }) => m.tools.includes('get_report')));
    assert.ok(messages.some((m: { toolResultsOnly: boolean }) => m.toolResultsOnly));
  });

  test('usage is logged per call', async () => {
    const rows = await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'ana@casa-blanca.com', role: 'agent' }, async (tx) =>
      (await tx.query<{ model: string; purpose: string; output_tokens: number }>('select model, purpose, output_tokens from comp_report.usage where report_id = $1', [reportId])).rows);
    // Nine calls: the first turn, the tool call and its continuation, the
    // refusal, the ordinary turn after it, the one the browser left, the slow
    // reply a second message waited for and the reply after an unanswered
    // message — each 300 output tokens as scripted — and the interrupted turn,
    // which logs what it had used when it was stopped. Refused requests make none.
    assert.equal(rows.length, 9);
    assert.ok(rows.every((r) => r.model === 'claude-opus-5-5' && r.purpose === 'assistant'));
    assert.deepEqual(rows.map((r) => r.output_tokens).sort((a, b) => a - b), [1, 300, 300, 300, 300, 300, 300, 300, 300]);
  });
});
