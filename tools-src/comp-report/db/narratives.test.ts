// The writer and its drafts (CR-5, Dispatch 13) against a real PostgreSQL and
// the fake Messages API: a draft queued with its numbers pinned, written in
// the background and checked as it lands; what can never reach the model; a
// refusal or a failed call standing down for the template; the agent's email
// forking from its draft and logged with QA when copied; a hard compliance
// failure refused; and who may do any of it. Nothing reaches Anthropic.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Anthropic from '@comp-report/anthropic-sdk';
import pg from 'pg';
import { startFakeAnthropic, type FakeAnthropic } from '../dev/fake-anthropic.ts';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleNarratives, runWrite, type NarrativeView, type WriteDeps } from '../server/api/narratives.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleWorkspace } from '../server/api/workspace.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import { SAMPLE_BRIEF, SAMPLE_INTAKE, SAMPLE_SEND } from '../server/sample/barclay-17l.ts';
import type { AuthDeps } from '../server/session.ts';
import { DISCLAIMER } from '../workspace/frame.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = {
  'tok-kimani-000000': 'kimani@casa-blanca.com',
  'tok-ana-000000000': 'ana@casa-blanca.com',
  'tok-ben-000000000': 'ben@casa-blanca.com',
};

// The agent's own figures, distinctive so the request can be searched for them (§8.4).
const CALL = { low: 3_456_789, high: 3_987_654, note: 'my private read on it', at: '2026-10-14T12:00:00.000Z' };
const TARGET = { price: { value: 4_111_111, asOf: '2026-10-14' }, note: { value: 'the owners’ secret number', asOf: '2026-10-14' } };
const DEAL = { template: 'buyer_traditional', price: { value: 4_222_222, asOf: '2026-10-14' }, downPaymentPercent: { value: 25, asOf: '2026-10-14' } };

describe('the writer and its drafts', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let fake: FakeAnthropic;
  let deps: AuthDeps & { env: Record<string, string | undefined> };
  let writeDeps: WriteDeps;
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
    };
    writeDeps = { ...deps, anthropic: () => new Anthropic({ apiKey: 'test', baseURL: fake.url, maxRetries: 0 }), progressEveryMs: 0 };
  });
  after(async () => {
    await fake.close();
    await pool.end();
    await db?.drop();
  });

  const request = (path: string, token: string | null, method = 'GET', body?: unknown) =>
    new Request(`https://site/${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const call = async (token: string, method: string, body?: unknown, query = '') => {
    const res = await handleNarratives(request(`api/comp-report/narratives${query}`, token, method, body), deps);
    return { status: res.status, body: (await res.json()) as { narrative: NarrativeView; narratives: NarrativeView[]; kept: NarrativeView | null; error?: string; message?: string } };
  };
  const write = (token: string, body: Record<string, unknown> = {}) => call(token, 'POST', { reportId: report, action: 'write', length: 'full', result: 'with_estimates', ...body });
  const run = async (token: string, narrativeId: string, d: WriteDeps = writeDeps) => {
    const res = await runWrite(request('.netlify/functions/comp-report-write-background', token, 'POST', { reportId: report, narrativeId }), d);
    return { status: res.status, body: (await res.json()) as { started?: boolean; status?: string; error?: string } };
  };
  const latest = async (token = 'tok-kimani-000000') => (await call(token, 'GET', undefined, `?report=${report}`)).body.narratives;
  /** A query as Kimani, the report's owner and an admin: row-level security applies, as it does to every request. */
  const asKimani = <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) =>
    withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) => tx.query<T>(sql, params));
  const saveSend = (send: object) =>
    handleWorkspace(request('workspace', 'tok-kimani-000000', 'PATCH', { reportId: report, state: { intake: SAMPLE_INTAKE, dealTerms: DEAL, send } }), deps);

  test('the sample report, sorted, with the agent’s number, a target and deal terms', async () => {
    report = (await (await handleReports(request('reports', 'tok-kimani-000000', 'POST', { title: '100 Barclay Street #17L' }), deps)).json()).report.id;
    assert.equal((await handleImports(request('imports', 'tok-kimani-000000', 'POST', { reportId: report, sample: true }), deps)).status, 201);
    assert.equal((await handleComps(request('comps', 'tok-kimani-000000', 'POST', { reportId: report, sample: true }), deps)).status, 200);
    const brief = { ...SAMPLE_BRIEF, audience: { value: 'buyer', asOf: '2026-10-14' }, clientName: { value: 'Jordan Lee', asOf: '2026-10-14' } };
    const res = await handleWorkspace(request('workspace', 'tok-kimani-000000', 'PATCH', {
      reportId: report, brief, target: TARGET, state: { intake: SAMPLE_INTAKE, dealTerms: DEAL, send: SAMPLE_SEND },
    }), deps);
    assert.equal(res.status, 200);
  });

  test('nothing is written before the agent’s number: the email quotes what the comps say', async () => {
    const early = await write('tok-kimani-000000');
    assert.deepEqual([early.status, early.body.error], [409, 'not_revealed']);
    assert.equal((await handleWorkspace(request('workspace', 'tok-kimani-000000', 'PATCH', { reportId: report, call: CALL }), deps)).status, 200);
  });

  let first: NarrativeView;
  test('a draft is queued with its numbers pinned, and written in the background', async () => {
    const queued = await write('tok-kimani-000000');
    assert.equal(queued.status, 202);
    first = queued.body.narrative;
    assert.deepEqual([first.status, first.origin, first.length, first.result, first.promptVersion], ['queued', 'writer', 'full', 'with_estimates', 'cr5-2026-10-14']);
    assert.match(first.inputsHash, /^sha256:/);
    assert.match(first.inputKey ?? '', /^sha256:/, 'what the writer is given is stored with it, and the browser gets its key');

    const again = await write('tok-kimani-000000', { length: 'short' });
    assert.deepEqual([again.status, again.body.error], [409, 'write_in_progress'], 'one write at a time per report');

    const ran = await run('tok-kimani-000000', first.id);
    assert.deepEqual([ran.status, ran.body.status], [200, 'done']);
    assert.equal((await run('tok-kimani-000000', first.id)).body.started, false, 'claimed exactly once');

    const done = (await latest()).find((n) => n.id === first.id)!;
    assert.equal(done.status, 'done');
    assert.equal(done.model, 'claude-opus-5-5');
    const content = done.content as { headlines: string[]; sections: { comps: { lines: string[] }[]; nextStep: string } };
    assert.ok(content.headlines.length >= 2);
    assert.ok(content.sections.comps.length > 0);
    assert.equal(content.sections.nextStep, SAMPLE_SEND.nextStep!.value, 'the agent’s next step, kept');
    assert.equal((done.qa as { ready: boolean }).ready, true, 'a draft citing only what it was given passes QA as it lands');
    assert.ok(done.progress > 0);
  });

  test('the pinned facts, the model, the prompt and the usage are stored with the draft', async () => {
    const { rows } = await asKimani<{ engine_version: string; house_method: string; headline_facts: { facts: { id: string }[]; agent_number: unknown }; request_id: string; input: { comps: unknown[] } }>(
      'select engine_version, house_method, headline_facts, request_id, input from comp_report.narratives where id = $1', [first.id]);
    assert.ok(rows[0]!.input.comps.length, 'the writer’s whole input is kept');
    assert.equal(rows[0]!.engine_version, '0.4.0');
    assert.ok(rows[0]!.house_method);
    assert.ok(rows[0]!.headline_facts.facts.some((f) => f.id === 'range.low'));
    assert.equal(rows[0]!.headline_facts.agent_number, null, 'pinned from the neutral numbers');
    assert.equal(rows[0]!.request_id, 'req_fake_1');
    const usage = (await asKimani<{ purpose: string; model: string; input_tokens: number; detail: { narrative: string; prompt: string } }>(
      `select purpose, model, input_tokens, detail from comp_report.usage where purpose = 'writer'`)).rows;
    assert.equal(usage.length, 1);
    assert.deepEqual([usage[0]!.model, usage[0]!.detail.narrative, usage[0]!.detail.prompt], ['claude-opus-5-5', first.id, 'cr5-2026-10-14']);
    assert.ok(usage[0]!.input_tokens > 0);
  });

  test('the agent’s number, the target and the deal terms never reach the request (§8.4)', () => {
    const sent = JSON.stringify(fake.requests.map((r) => r.body));
    assert.ok(sent.includes('200 Chambers Street'), 'the requests are here to search');
    for (const v of [CALL.low, CALL.high, TARGET.price.value, DEAL.price.value]) {
      for (const shown of [String(v), v.toLocaleString('en-US'), `$${Number((v / 1e6).toPrecision(3))}M`]) {
        assert.equal(sent.includes(shown), false, `${shown} reached the model`);
      }
    }
    for (const words of [CALL.note, TARGET.note.value, 'agent_number', 'downPaymentPercent', 'down_payment', 'clientNote', SAMPLE_BRIEF.clientNote!.value]) {
      assert.equal(sent.includes(words), false, `${words} reached the model`);
    }
  });

  test('a finished draft never changes; an edit forks a new one when a new draft replaces it', async () => {
    await assert.rejects(asKimani(`update comp_report.narratives set content = '{}' where id = $1`, [first.id]), /never changes/);
    await assert.rejects(asKimani(`delete from comp_report.narratives where id = $1`, [first.id]), /append-only|permission denied/);
    const edited = { parentId: first.id, headline: 'My own headline.', subject: '100 Barclay Street #17L', text: `Hi Jordan,\n\nMy own headline.\n\n${DISCLAIMER}` };
    const next = await write('tok-kimani-000000', { length: 'short', keep: edited });
    assert.equal(next.status, 202);
    assert.deepEqual([next.body.kept?.origin, next.body.kept?.parentId, next.body.kept?.copied], ['agent', first.id, false]);
    assert.deepEqual(next.body.kept?.content, { headline: edited.headline, subject: edited.subject, text: edited.text });
    assert.equal((await run('tok-kimani-000000', next.body.narrative.id)).body.status, 'done');
  });

  test('an invented number is caught as the draft lands', async () => {
    await saveSend({ ...SAMPLE_SEND, nextStep: { value: 'invent a number', asOf: '2026-10-14' } });
    const q = await write('tok-kimani-000000', { length: 'text' });
    await run('tok-kimani-000000', q.body.narrative.id);
    const d = (await latest()).find((n) => n.id === q.body.narrative.id)!;
    const qa = d.qa as { ready: boolean; checks: { id: string; items?: { text: string }[] }[] };
    assert.equal(qa.ready, false);
    assert.deepEqual(qa.checks.find((c) => c.id === 'numbers')?.items?.map((i) => i.text), ['$9.87M']);
  });

  test('a refusal or a failed call fails the draft, saying why, and the template stands in', async () => {
    await saveSend({ ...SAMPLE_SEND, nextStep: { value: 'refuse this one', asOf: '2026-10-14' } });
    const refused = await write('tok-kimani-000000', { length: 'text' });
    await run('tok-kimani-000000', refused.body.narrative.id);
    let d = (await latest()).find((n) => n.id === refused.body.narrative.id)!;
    assert.deepEqual([d.status, d.error, d.errorMessage, d.content], ['failed', 'refused', 'Claude declined to draft this one.', null]);

    await saveSend(SAMPLE_SEND);
    const down = await write('tok-kimani-000000', { length: 'text' });
    await run('tok-kimani-000000', down.body.narrative.id, { ...writeDeps, anthropic: () => new Anthropic({ apiKey: 'x', baseURL: 'http://127.0.0.1:9', maxRetries: 0 }) });
    d = (await latest()).find((n) => n.id === down.body.narrative.id)!;
    assert.deepEqual([d.status, d.error], ['failed', 'error']);

    const unset = await write('tok-kimani-000000', { length: 'text' });
    await run('tok-kimani-000000', unset.body.narrative.id, { ...writeDeps, anthropic: () => { throw new Error('no key'); } });
    d = (await latest()).find((n) => n.id === unset.body.narrative.id)!;
    assert.deepEqual([d.status, d.error], ['failed', 'not_configured']);
  });

  test('copying logs the agent’s email with QA and their answers; a hard compliance failure is refused', async () => {
    const email = { headline: 'The three closest sales put 17L at $2,112–$2,457 a sq ft.', subject: '100 Barclay Street #17L: what the comps say' };
    const ok = await call('tok-kimani-000000', 'POST', {
      reportId: report, action: 'copy', parentId: first.id, length: 'full', result: 'with_estimates', ...email,
      text: `Hi Jordan,\n\n${email.headline} Near the family room, about $5.1M.\n\n${DISCLAIMER}`,
      qa: { version: 'x', ready: true, checks: [] },
      acknowledgments: [{ key: 'number:$5.1M', how: 'attributed', text: '$5.1M', at: '2026-10-14T12:00:00Z' }],
    });
    assert.equal(ok.status, 201);
    assert.deepEqual([ok.body.narrative.origin, ok.body.narrative.parentId, ok.body.narrative.copied], ['agent', first.id, true]);
    assert.deepEqual(ok.body.narrative.acknowledgments.map((a) => a.key), ['number:$5.1M'], 'the acknowledgment is logged');
    assert.deepEqual((ok.body.narrative.qa as { server: unknown }).server, { version: (ok.body.narrative.qa as { server: { version: string } }).server.version, compliance: 'pass' });

    const copy = (text: string, headline = email.headline) => call('tok-kimani-000000', 'POST', {
      reportId: report, action: 'copy', parentId: first.id, length: 'full', result: 'with_estimates', ...email, headline, text,
    });
    for (const [text, why] of [
      [`Hi Jordan,\n\nOur appraisal says so.\n\n${DISCLAIMER}`, 'appraisal'],
      [`Hi Jordan,\n\nPerfect for young professionals.\n\n${DISCLAIMER}`, 'fair_housing'],
      ['Hi Jordan,\n\nNo disclaimer here.', 'disclaimer'],
    ] as const) {
      const res = await copy(text);
      assert.deepEqual([res.status, res.body.error], [409, 'hard_failure'], why);
      assert.ok(res.body.message?.includes(why), why);
    }
    assert.equal((await copy(`Hi,\n\n${DISCLAIMER}`, '')).status, 409, 'no headline, no copy (D-21)');
  });

  test('only the owner writes or copies; an admin reads; another agent sees nothing; the limit holds', async () => {
    assert.equal((await call('tok-ben-000000000', 'GET', undefined, `?report=${report}`)).status, 404);
    assert.equal((await write('tok-ben-000000000')).status, 404);
    assert.equal((await run('tok-ben-000000000', first.id)).status, 404);
    assert.equal((await handleNarratives(request('api/comp-report/narratives', null, 'GET'), deps)).status, 401);

    // Ana's own report: an agent's daily limit (3 here).
    report = (await (await handleReports(request('reports', 'tok-ana-000000000', 'POST', { title: 'Ana’s' }), deps)).json()).report.id;
    await handleWorkspace(request('workspace', 'tok-ana-000000000', 'PATCH', { reportId: report, call: { skipped: true, at: '2026-10-14T12:00:00.000Z' } }), deps);
    for (let i = 0; i < 3; i++) {
      const q = await write('tok-ana-000000000', { length: 'text' });
      assert.equal(q.status, 202, `write ${i + 1}`);
      await run('tok-ana-000000000', q.body.narrative.id);
    }
    const over = await write('tok-ana-000000000', { length: 'text' });
    assert.deepEqual([over.status, over.body.error], [429, 'write_limit']);
    assert.equal((await call('tok-kimani-000000', 'GET', undefined, `?report=${report}`)).status, 200, 'an admin can read it');
    assert.equal((await write('tok-kimani-000000')).status, 404, 'but not write in it');
  });
});
