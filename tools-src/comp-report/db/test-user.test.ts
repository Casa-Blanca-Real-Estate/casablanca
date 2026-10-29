// Dispatch 23 item 4 (CR-7f): the test user (CR_TEST_KEY) and copy-to-test.
//   CR_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:comp-report
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig, decide } from '../server/access.ts';
import { handleAllowlist } from '../server/api/allowlist.ts';
import { handleCapability } from '../server/api/capability.ts';
import { handleDecide } from '../server/api/decide.ts';
import { handleInspect, INSPECT_KEY_HEADER } from '../server/api/inspect.ts';
import { runLinkRead } from '../server/api/links.ts';
import { handleMe } from '../server/api/me.ts';
import { handleMessages } from '../server/api/messages.ts';
import { runWrite } from '../server/api/narratives.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleTurn, productionAnthropic } from '../server/api/turn.ts';
import { checkCall, checkTarget, handleWorkspace } from '../server/api/workspace.ts';
import { withActor, type PoolClientLike, type PoolLike } from '../server/db.ts';
import { enqueueListingJudgments } from '../server/decide/enqueue.ts';
import { decideConfig } from '../server/decide/config.ts';
import { handleIdentityEvent } from '../server/identity-events.ts';
import type { IdentityUser } from '../server/identity.ts';
import { PLACEHOLDER } from '../server/inspect/copy.ts';
import { requireUser, type AuthDeps } from '../server/session.ts';
import { NULL_COST_USD, TEST_KEY_HEADER } from '../server/test-user.ts';
import { buildFixture, leaks, MARK, type Fixture } from './inspect-fixture.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const TEST_KEY = 't'.repeat(36) + '-test-key';
const INSPECT_KEY = 'i'.repeat(36) + '-inspect-key';
const DECIDE_KEY = 'd'.repeat(36) + '-decide-key';
const TEST_EMAIL = 'session@test.invalid';
const ENV = { CR_TEST_KEY: TEST_KEY, CR_TEST_USER_EMAIL: TEST_EMAIL, CR_INSPECT_KEY: INSPECT_KEY };
const ADMIN = 'kimani@casa-blanca.com';
const AGENT = 'ana@casa-blanca.com';
const tok = (email: string) => `tok-${email.replace('@', '.at.')}`.padEnd(20, '0');

function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const { log, error } = console;
  console.log = () => undefined;
  console.error = () => undefined;
  return fn().finally(() => {
    console.log = log;
    console.error = error;
  });
}

/** A pool whose matching statements fail. */
function failing(pool: PoolLike, match: RegExp): PoolLike {
  return {
    async connect(): Promise<PoolClientLike> {
      const c = await pool.connect();
      return {
        query: ((text: string, params?: unknown[]) => (match.test(text) ? Promise.reject(new Error('injected failure')) : c.query(text, params))) as PoolClientLike['query'],
        release: (e?: Error | boolean) => c.release(e),
      };
    },
  };
}

describe('the test user and copy-to-test (Dispatch 23 item 4)', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let su: pg.Client;
  let fx: Fixture;
  let verified = 0;
  const casa = accessConfig({ CR_ADMIN_EMAILS: ADMIN });
  const deps = (env: Record<string, string | undefined> = ENV): AuthDeps => ({
    verifier: {
      async verify(token: string) {
        verified++;
        const email = [ADMIN, AGENT].find((e) => tok(e) === token);
        return email ? ({ id: `id-${email}`, email, confirmed: true, provider: 'google', name: null } as IdentityUser) : null;
      },
      emailConfirmationRequired: async () => true,
    },
    access: casa,
    pool: pool as unknown as PoolLike,
    env,
  });
  const req = (path: string, opts: { testKey?: string | null; bearer?: string; method?: string; body?: unknown; inspectKey?: string } = {}) =>
    new Request(`https://site/api/comp-report/${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: {
        'content-type': 'application/json',
        ...(opts.testKey === null || opts.testKey === undefined ? {} : { [TEST_KEY_HEADER]: opts.testKey }),
        ...(opts.bearer ? { authorization: `Bearer ${tok(opts.bearer)}` } : {}),
        ...(opts.inspectKey ? { [INSPECT_KEY_HEADER]: opts.inspectKey } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  const me = (r: Request, env?: Record<string, string | undefined>) => quiet(() => handleMe(r, deps(env)));
  const testRows = async () => (await su.query('select * from comp_report.users where is_test')).rows;

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 8);
    su = new pg.Client({ connectionString: db.urlAs(new URL(process.env.CR_TEST_DATABASE_URL!).username || 'postgres') });
    await su.connect();
    await withActor(pool as unknown as PoolLike, { kind: 'system', does: 'sign-in' }, async (tx) => {
      await tx.query("insert into comp_report.users (email, role) values ($1, 'admin'), ($2, 'agent')", [ADMIN, AGENT]);
    });
    fx = await buildFixture(pool as unknown as PoolLike);
  });
  after(async () => {
    await su?.end();
    await pool?.end();
    await db?.drop();
  });

  test('without X-Test-Key nothing changes: the bearer goes to Identity, whatever the keys say', async () => {
    const weird = { CR_TEST_KEY: TEST_KEY, CR_INSPECT_KEY: TEST_KEY, CR_DECIDE_KEY: TEST_KEY, CR_TEST_USER_EMAIL: 'real@casa-blanca.com' };
    for (const env of [{}, ENV, weird]) {
      const res = await me(req('me', { bearer: AGENT }), env);
      assert.equal(res.status, 200);
      assert.equal(((await res.json()) as { user: { email: string } }).user.email, AGENT);
      assert.equal((await me(req('me'), env)).status, 401);
    }
    // The gates and an Identity admin on /decide answer as they would with no keys set.
    for (const env of [{}, weird]) {
      const gate = async (email: string) => (await quiet(() => handleIdentityEvent(new Request('https://site/.netlify/functions/identity-login', {
        method: 'POST', body: JSON.stringify({ event: 'login', user: { email, app_metadata: { provider: 'google' } } }),
      }), { access: casa, pool: pool as unknown as PoolLike }, null))).status;
      assert.equal(await gate(AGENT), 204);
      assert.equal(await gate('someone@gmail.com'), 403);
      const d = await quiet(() => handleDecide(req('decide', { bearer: ADMIN }), { ...deps(env), env, config: { ...decideConfig({}), decideKey: null } }));
      assert.equal(d.status, 200);
    }
    assert.deepEqual(await testRows(), []);
  });

  test('the key: off, short, missing-but-present, empty and wrong are each 401 and never reach Identity', async () => {
    const before = verified;
    const cases: [string, Record<string, string | undefined>, string][] = [
      ['off', { CR_TEST_USER_EMAIL: TEST_EMAIL }, TEST_KEY],
      ['short', { CR_TEST_KEY: 'short', CR_TEST_USER_EMAIL: TEST_EMAIL }, 'short'],
      ['empty', ENV, ''],
      ['wrong', ENV, 'w'.repeat(45)],
    ];
    for (const [label, env, key] of cases) {
      const res = await me(req('me', { testKey: key, bearer: AGENT }), env);
      assert.equal(res.status, 401, label);
    }
    assert.equal(verified, before, 'Identity was never asked');
    assert.deepEqual(await testRows(), []);
  });

  test('misconfiguration is a 503, only once the key matched: a real address, or a key shared with another', async () => {
    const bad: Record<string, string | undefined>[] = [
      { ...ENV, CR_TEST_USER_EMAIL: 'real@casa-blanca.com' },
      { ...ENV, CR_TEST_USER_EMAIL: undefined },
      { ...ENV, CR_INSPECT_KEY: TEST_KEY },
      { ...ENV, CR_DECIDE_KEY: TEST_KEY },
    ];
    for (const env of bad) {
      assert.equal((await me(req('me', { testKey: TEST_KEY }), env)).status, 503);
      assert.equal((await me(req('me', { testKey: 'w'.repeat(45) }), env)).status, 401);
    }
    assert.deepEqual(await testRows(), []);
  });

  test('a row with that address and is_test false is refused', async () => {
    const env = { ...ENV, CR_TEST_USER_EMAIL: 'real.row@test.invalid' };
    // A row an ordinary sign-in made (is_test false) before the address was the test user's.
    await withActor(pool as unknown as PoolLike, { kind: 'system', does: 'sign-in' }, (tx) =>
      tx.query("insert into comp_report.users (email) values ('real.row@test.invalid')"));
    assert.equal((await me(req('me', { testKey: TEST_KEY }), env)).status, 503);
  });

  test('with the right key, every endpoint acts as the test user, an agent in practice, and no one else', async () => {
    const res = await me(req('me', { testKey: TEST_KEY, bearer: ADMIN }));
    assert.equal(res.status, 200);
    const { user } = (await res.json()) as { user: { email: string; role: string; capability: string } };
    assert.deepEqual([user.email, user.role, user.capability], [TEST_EMAIL, 'agent', 'practice']);
    const [row] = await testRows();
    assert.equal(row.email, TEST_EMAIL);
    assert.equal(row.created_by, 'system:test-key');
    // A report it makes is its own; a real user's is out of reach.
    const created = await quiet(() => handleReports(req('reports', { testKey: TEST_KEY, body: { title: 'Test report' } }), deps()));
    assert.equal(created.status, 201);
    assert.equal(((await created.json()) as { report: { ownerEmail: string } }).report.ownerEmail, TEST_EMAIL);
    assert.equal((await quiet(() => handleWorkspace(req(`workspace?report=${fx.reportId}`, { testKey: TEST_KEY }), deps()))).status, 404);
    // The background functions honour it too: past the check, to their own refusals.
    assert.equal((await quiet(() => runLinkRead(req('links-background', { testKey: TEST_KEY, body: {} }), { ...deps(), reader: { read: async () => { throw new Error('unused'); } } } as never))).status, 400);
    assert.equal((await quiet(() => runLinkRead(req('links-background', { testKey: 'w'.repeat(45), body: {} }), { ...deps(), reader: { read: async () => { throw new Error('unused'); } } } as never))).status, 401);
  });

  test('is_test is set only by test-key, only on @test.invalid, and never changed after insert', async () => {
    await assert.rejects(withActor(pool as unknown as PoolLike, { kind: 'system', does: 'sign-in' }, (tx) =>
      tx.query("insert into comp_report.users (email, is_test) values ('other@test.invalid', true)")), /row-level security/);
    await assert.rejects(withActor(pool as unknown as PoolLike, { kind: 'system', does: 'test-key' }, (tx) =>
      tx.query("insert into comp_report.users (email, is_test) values ('real2@casa-blanca.com', true)")), /users_is_test_address_check/);
    await assert.rejects(withActor(pool as unknown as PoolLike, { kind: 'user', email: ADMIN, role: 'admin' }, (tx) =>
      tx.query('update comp_report.users set is_test = true where email = $1', [AGENT])), /is_test can't be changed/);
    await assert.rejects(withActor(pool as unknown as PoolLike, { kind: 'user', email: ADMIN, role: 'admin' }, (tx) =>
      tx.query('update comp_report.users set is_test = false where email = $1', [TEST_EMAIL])), /is_test can't be changed/);
  });

  test('decide(), the Identity gate and POST /allowlist refuse the test address', async () => {
    const lax = accessConfig({ CR_ADMIN_EMAILS: TEST_EMAIL, CR_ALLOWED_DOMAINS: 'test.invalid' });
    assert.deepEqual(decide(TEST_EMAIL, lax, 'agent'), { allowed: false, role: null, via: null });
    const gate = await quiet(() => handleIdentityEvent(new Request('https://site/.netlify/functions/identity-login', {
      method: 'POST', body: JSON.stringify({ event: 'login', user: { email: TEST_EMAIL, app_metadata: { provider: 'google' } } }),
    }), { access: lax, pool: pool as unknown as PoolLike }, null));
    assert.equal(gate.status, 403);
    const grant = await quiet(() => handleAllowlist(req('allowlist', { bearer: ADMIN, body: { email: TEST_EMAIL, role: 'agent' } }), deps()));
    assert.equal(grant.status, 400);
    await assert.rejects(withActor(pool as unknown as PoolLike, { kind: 'user', email: ADMIN, role: 'admin' }, (tx) =>
      tx.query("insert into comp_report.allowlist (email, role) values ('x@test.invalid', 'agent')")), /allowlist_not_test_address_check/);
  });

  test('the Access panel and everyone\'s reports leave the test user out; a level change aimed at it is a 404', async () => {
    const people = await quiet(() => handleCapability(req('capability', { bearer: ADMIN }), deps()));
    const list = ((await people.json()) as { people: { email: string }[] }).people.map((p) => p.email);
    assert.ok(list.includes(AGENT));
    assert.ok(!list.includes(TEST_EMAIL));
    const change = await quiet(() => handleCapability(req('capability', { bearer: ADMIN, body: { email: TEST_EMAIL, capability: 'full' } }), deps()));
    assert.equal(change.status, 404);
    const all = await quiet(() => handleReports(req('reports?scope=all', { bearer: ADMIN }), deps()));
    const owners = ((await all.json()) as { reports: { ownerEmail: string }[] }).reports.map((r) => r.ownerEmail);
    assert.ok(owners.length > 0);
    assert.ok(!owners.includes(TEST_EMAIL));
  });

  test('its AI: the eval key only. Unset, the turn and the write are 503 and ANTHROPIC_API_KEY is never read', async () => {
    const reportId = (await withActor(pool as unknown as PoolLike, { kind: 'user', email: TEST_EMAIL, role: 'agent' }, (tx) =>
      tx.query<{ id: string }>("insert into comp_report.reports (owner_email, title) values ($1, 'AI test') returning id", [TEST_EMAIL]))).rows[0]!.id;
    const original = process.env;
    let reads = 0;
    const { CR_EVAL_ANTHROPIC_API_KEY: _unset, ...rest } = original;
    process.env = new Proxy({ ...rest, ...ENV, ANTHROPIC_API_KEY: 'sk-real-key' }, {
      get(t, k) {
        if (k === 'ANTHROPIC_API_KEY') reads++;
        return (t as Record<string | symbol, unknown>)[k];
      },
    }) as NodeJS.ProcessEnv;
    try {
      const authed = { ...deps(), env: undefined };
      const turn = await quiet(() => handleTurn(req('turn', { testKey: TEST_KEY, body: { reportId, message: 'hi' } }), { ...authed, anthropic: productionAnthropic }));
      assert.equal(turn.status, 503);
      assert.equal(((await turn.json()) as { error: string }).error, 'eval_key_not_set');
      const write = await quiet(() => runWrite(req('write-background', { testKey: TEST_KEY, body: { reportId, narrativeId: '00000000-0000-4000-8000-000000000000' } }), { ...authed, anthropic: productionAnthropic }));
      assert.equal(write.status, 503);
      assert.throws(() => productionAnthropic({ email: TEST_EMAIL, test: true } as never), /CR_EVAL_ANTHROPIC_API_KEY/);
      const queued = await enqueueListingJudgments({ observationId: 1, record: {} as never, userEmail: TEST_EMAIL }, { pool: pool as unknown as PoolLike, testUser: true });
      assert.deepEqual(queued, { queued: false, why: 'off' });
      assert.equal(reads, 0);
    } finally {
      process.env = original;
    }
  });

  test('its AI: with the eval key set, a call at $2 for the day is refused before it is made, and a null cost counts', async () => {
    const reportId = (await withActor(pool as unknown as PoolLike, { kind: 'user', email: TEST_EMAIL, role: 'agent' }, (tx) =>
      tx.query<{ id: string }>("insert into comp_report.reports (owner_email, title) values ($1, 'Budget test') returning id", [TEST_EMAIL]))).rows[0]!.id;
    const env = { ...ENV, CR_EVAL_ANTHROPIC_API_KEY: 'sk-eval' };
    let made = 0;
    const anthropic = () => {
      made++;
      throw new Error('no network in this test');
    };
    const spend = (cost: number | null) => withActor(pool as unknown as PoolLike, { kind: 'user', email: TEST_EMAIL, role: 'agent' }, (tx) =>
      tx.query("insert into comp_report.usage (user_email, report_id, provider, model, purpose, estimated_cost_usd) values ($1, $2, 'anthropic', 'claude-opus-4-8', 'assistant', $3)", [TEST_EMAIL, reportId, cost]));
    const turn = () => quiet(() => handleTurn(req('turn', { testKey: TEST_KEY, body: { reportId, message: 'hi' } }), { ...deps(env), anthropic: anthropic as never }));
    await spend(2 - NULL_COST_USD);
    await turn();
    assert.equal(made, 1, 'under $2: the call goes ahead');
    await spend(null);
    const refused = await turn();
    assert.equal(refused.status, 429);
    assert.equal(((await refused.json()) as { error: string }).error, 'test_budget');
    assert.equal(made, 1, 'at $2: refused before the call');
  });

  // ── copy-to-test ──────────────────────────────────────────────────────────

  const copy = (opts: { testKey?: string | null; inspectKey?: string | null; method?: string; extra?: string; pool?: PoolLike } = {}) => quiet(() => handleInspect(
    new Request(`https://site/api/comp-report/inspect?view=copy-to-test&report=${fx.reportId}${opts.extra ?? ''}`, {
      method: opts.method ?? 'POST',
      headers: {
        ...(opts.inspectKey === null ? {} : { [INSPECT_KEY_HEADER]: opts.inspectKey ?? INSPECT_KEY }),
        ...(opts.testKey === null ? {} : { [TEST_KEY_HEADER]: opts.testKey ?? TEST_KEY }),
      },
    }),
    { pool: opts.pool ?? (pool as unknown as PoolLike), identityUrl: 'https://site/.netlify/identity', env: ENV },
  ));
  const testReports = async () => (await su.query('select id from comp_report.reports where owner_email = $1', [TEST_EMAIL])).rows.map((r) => r.id);
  const copyRows = async () => (await su.query("select * from comp_report.access_events where kind = 'inspect_copy' order by id")).rows;

  test('copy-to-test: one key alone, a text parameter, GET, or a failed audit row: nothing copied', async () => {
    const before = await testReports();
    assert.equal((await copy({ testKey: null })).status, 401);
    assert.equal((await copy({ testKey: 'w'.repeat(45) })).status, 401);
    assert.equal((await copy({ inspectKey: null })).status, 401);
    assert.equal((await copy({ inspectKey: 'w'.repeat(45) })).status, 401);
    assert.equal((await copy({ extra: '&text=1' })).status, 400);
    assert.equal((await copy({ extra: '&text=0' })).status, 400);
    assert.equal((await copy({ method: 'GET' })).status, 405);
    assert.equal((await copy({ pool: failing(pool as unknown as PoolLike, /insert into comp_report\.access_events/) })).status, 503);
    assert.deepEqual(await testReports(), before);
    assert.deepEqual(await copyRows(), []);
  });

  test('copy-to-test: the copy lands in the test user\'s account only, redacted, read back through its own endpoints', async () => {
    const res = await copy();
    assert.equal(res.status, 201);
    const { copy: made } = (await res.json()) as { copy: { reportId: string; comps: number } };
    assert.equal(made.comps, 3);
    const [audit] = await copyRows();
    assert.equal(audit.report_id, fx.reportId);
    assert.equal(audit.target_report_id, made.reportId);
    assert.equal(audit.view, 'copy-to-test');

    const own = await su.query('select owner_email from comp_report.reports where id = $1', [made.reportId]);
    assert.equal(own.rows[0].owner_email, TEST_EMAIL);
    const bodies = await Promise.all([
      handleWorkspace(req(`workspace?report=${made.reportId}`, { testKey: TEST_KEY }), deps()),
      handleMessages(req(`messages?report=${made.reportId}`, { testKey: TEST_KEY }), deps()),
      handleReports(req('reports', { testKey: TEST_KEY }), deps()),
    ].map((p) => quiet(() => p)));
    for (const r of bodies) assert.equal(r.status, 200);
    const [ws, msgs, reports] = await Promise.all(bodies.map((r) => r.text()));
    for (const body of [ws!, msgs!, reports!]) assert.deepEqual(leaks(body, [fx.owner]), []);

    // The comp facts that pass are copied; the engine's own checks accept the placeholders.
    const workspace = JSON.parse(ws!) as { comps: { source: { kind: string; fields: Record<string, unknown> }; propertyKey: string; tier: string | null }[]; call: unknown; target: unknown };
    assert.equal(workspace.comps.length, 3);
    assert.ok(workspace.comps.every((c) => c.source.kind === 'manual' && c.propertyKey.startsWith(`pk1|redacted-${made.reportId}-`)));
    assert.ok(workspace.comps.some((c) => c.source.fields.price === 1234567));
    assert.ok(workspace.comps.every((c) => c.tier === 'primary'));
    checkCall(workspace.call, 'practice');
    checkTarget(workspace.target);

    // The copy's import is made here, never from the source's file.
    const imports = (await su.query('select content, content_sha256 from comp_report.imports where report_id = $1', [made.reportId])).rows;
    assert.equal(imports.length, 1);
    assert.ok(!imports[0].content.toString('utf8').includes(MARK));
    assert.notEqual(imports[0].content_sha256, fx.contentSha256);
    assert.equal((await su.query('select count(*)::int as n from comp_report.geocodes where building_key like $1', [`%redacted%`])).rows[0].n, 0);
    const obs = (await su.query('select facts from comp_report.property_observations where report_id = $1', [made.reportId])).rows;
    assert.ok(obs.every((o) => !('coordinates' in o.facts)));
    assert.equal(PLACEHOLDER.text, '[redacted]');

    // A second copy succeeds, on properties of its own.
    const again = await copy();
    assert.equal(again.status, 201);
    const second = ((await again.json()) as { copy: { reportId: string } }).copy.reportId;
    const keys = async (id: string) => (await su.query('select p.property_key from comp_report.report_comps rc join comp_report.properties p on p.id = rc.property_id where rc.report_id = $1', [id])).rows.map((r) => r.property_key);
    const [a, b] = [await keys(made.reportId), await keys(second)];
    assert.equal(a.filter((k) => b.includes(k)).length, 0);
  });

  test('requireUser without the header asks Identity as before', async () => {
    const user = await quiet(() => requireUser(req('me', { bearer: AGENT }), deps()));
    assert.equal(user.email, AGENT);
    assert.equal(user.test, undefined);
  });
});
