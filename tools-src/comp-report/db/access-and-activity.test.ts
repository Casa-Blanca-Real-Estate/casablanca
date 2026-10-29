// Dispatch 22b (CR-7e): the sign-in log, the activity log, their limits and their purge.
//   CR_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:comp-report
//
// Two layers, as everywhere (§12): the handlers through their real entry points, and the SQL
// under withActor with no handler in front, so row-level security and the CHECKs alone are
// what's tested there.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleAccessLog } from '../server/api/access-log.ts';
import { handleActivity } from '../server/api/activity.ts';
import { handleCapability } from '../server/api/capability.ts';
import { handleComps } from '../server/api/comps.ts';
import { purgeLogs } from '../server/api/purge-logs.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleSignInError } from '../server/api/signin-error.ts';
import { handleWorkspace } from '../server/api/workspace.ts';
import { withActor, type Actor, type PoolClientLike, type PoolLike, type Queryable } from '../server/db.ts';
import { handleIdentityEvent } from '../server/identity-events.ts';
import type { IdentityUser } from '../server/identity.ts';
import { daySalt, ipFrom, ipHash } from '../server/logs.ts';
import { requireUser, type AuthDeps } from '../server/session.ts';
import { SCREEN_IDS, isScreen } from '../src/views/workspace/screens.ts';
import { ERROR_CODES } from '../src/error-codes.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

type UserActor = Actor & { kind: 'user' };
const OWNER: UserActor = { kind: 'user', email: 'ana@casa-blanca.com', role: 'agent' };
const AGENT: UserActor = { kind: 'user', email: 'ben@casa-blanca.com', role: 'agent' };
const ADMIN: UserActor = { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' };
const MENTOR: UserActor = { kind: 'user', email: 'noble@casa-blanca.com', role: 'mentor' };
const MENTOR2: UserActor = { kind: 'user', email: 'mia@casa-blanca.com', role: 'mentor' };
const EXTERNAL: UserActor = { kind: 'user', email: 'counsel@firm.com', role: 'external' };
const PEOPLE = [OWNER, AGENT, ADMIN, MENTOR, MENTOR2, EXTERNAL];
const STRANGER = 'someone.private@gmail.com';
const IP = '203.0.113.7';
const tok = (email: string) => `tok-${email.replace('@', '.at.')}`.padEnd(20, '0');
const as = <T>(pool: PoolLike, actor: Actor, fn: (tx: Queryable) => Promise<T>) => withActor(pool, actor, fn);
const SYSTEM = (does: string): Actor => ({ kind: 'system', does });

/** A pool whose queries fail when the text or a parameter matches: a database that breaks in one place. */
function failing(pool: PoolLike, match: RegExp): PoolLike {
  return {
    async connect(): Promise<PoolClientLike> {
      const c = await pool.connect();
      return {
        query: ((text: string, params?: unknown[]) =>
          match.test(text) || (params ?? []).some((p) => typeof p === 'string' && match.test(p))
            ? Promise.reject(new Error('injected failure'))
            : c.query(text, params)) as PoolClientLike['query'],
        release: (e?: Error | boolean) => c.release(e),
      };
    },
  };
}
const DOWN: PoolLike = { connect: () => Promise.reject(new Error('database down')) };

describe('the sign-in log and the activity log (Dispatch 22b)', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let su: pg.Client; // a superuser on the test database: ages rows and holds locks, never stands in for the app
  let deps: AuthDeps;
  let report: string;
  let agentReport: string;
  let comp: string;
  const casa = accessConfig({ CR_ADMIN_EMAILS: ADMIN.email });

  /** As the superuser with triggers off: ages rows the purge should find. */
  const raw = async (sql: string, params: unknown[] = []) => {
    await su.query('set session_replication_role = replica');
    try {
      return await su.query(sql, params);
    } finally {
      await su.query('set session_replication_role = origin');
    }
  };
  const rows = async <R extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await su.query<R>(sql, params)).rows;
  const events = (kind: string) => rows<Record<string, unknown>>('select * from comp_report.access_events where kind = $1 order by id', [kind]);

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 12);
    su = new pg.Client({ connectionString: db.urlAs(new URL(process.env.CR_TEST_DATABASE_URL!).username || 'postgres') });
    await su.connect();
    await as(pool, SYSTEM('sign-in'), async (tx) => {
      for (const a of PEOPLE) await tx.query('insert into comp_report.users (email, role, last_seen_at) values ($1, $2, now())', [a.email, a.role]);
    });
    await as(pool, ADMIN, async (tx) => {
      await tx.query("insert into comp_report.allowlist (email, role) values ($1, 'mentor'), ($2, 'mentor'), ($3, 'external')", [MENTOR.email, MENTOR2.email, EXTERNAL.email]);
    });
    ({ report, comp } = await as(pool, OWNER, async (tx) => {
      const id = (await tx.query<{ id: string }>("insert into comp_report.reports (owner_email, title) values ($1, 'Ana — 25 N Moore 9C') returning id", [OWNER.email])).rows[0]!.id;
      const p = (await tx.query<{ id: string }>("insert into comp_report.properties (property_key, address, unit) values ('100-barclay|17l', '100 Barclay St', '17L') returning id")).rows[0]!.id;
      const o = (await tx.query<{ id: string }>(
        `insert into comp_report.property_observations (property_id, report_id, source, facts) values ($1, $2, 'listing', '{"sqft": 1200}') returning id`, [p, id])).rows[0]!.id;
      const rc = (await tx.query<{ id: string }>(
        "insert into comp_report.report_comps (report_id, property_id, observation_id, evidence_class) values ($1, $2, $3, 'sold') returning id", [id, p, o])).rows[0]!.id;
      return { report: id, comp: rc };
    }));
    agentReport = await as(pool, AGENT, async (tx) =>
      (await tx.query<{ id: string }>("insert into comp_report.reports (owner_email, title) values ($1, 'Ben — 1 Main') returning id", [AGENT.email])).rows[0]!.id);

    const people: Record<string, Partial<IdentityUser>> = Object.fromEntries(
      [...PEOPLE.map((a) => a.email), STRANGER, 'dana@casa-blanca.com', 'eli@casa-blanca.com', 'fay@casa-blanca.com', 'gus@casa-blanca.com']
        .map((e) => [tok(e), { email: e }]),
    );
    deps = {
      verifier: {
        async verify(token: string) {
          const p = people[token];
          return p ? ({ id: `id-${token}`, confirmed: true, provider: 'google', name: null, ...p } as IdentityUser) : null;
        },
        emailConfirmationRequired: async () => true,
      },
      access: casa,
      pool: pool as unknown as PoolLike,
    };
  });
  after(async () => {
    await su?.end();
    await pool?.end();
    await db?.drop();
  });

  const req = (path: string, email: string | null, init: { method?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}) =>
    new Request(`https://site/api/comp-report/${path}`, {
      method: init.method ?? (init.body !== undefined || init.raw !== undefined ? 'POST' : 'GET'),
      headers: { ...(email ? { authorization: `Bearer ${tok(email)}` } : {}), 'content-type': 'application/json', ...init.headers },
      body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
    });

  // ── The gate ────────────────────────────────────────────────────────────

  const gateBody = (email: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ event: 'login', user: { email, app_metadata: { provider: 'google' }, ...extra } });
  const gate = (body: string, gdeps: { pool: PoolLike | null } = { pool: pool as unknown as PoolLike }, context: { ip?: string } | null = { ip: IP }, headers: Record<string, string> = {}) =>
    handleIdentityEvent(new Request('https://site/.netlify/functions/identity-login', { method: 'POST', headers, body }), { access: casa, ...gdeps }, context);

  test('the gate never refuses because of logging: it answers exactly what decide() says', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    t.mock.method(console, 'log', () => undefined);
    const big = 'x'.repeat(100 * 1024);
    const twoKb = gateBody(OWNER.email, { user_metadata: { full_name: 'Ana', note: 'y'.repeat(2100) } });
    assert.ok(twoKb.length > 2000);
    const cases: Array<[string, () => Promise<Response>]> = [
      ['a database that throws', () => gate(gateBody(OWNER.email), { pool: DOWN })],
      ['the salt create failing', () => gate(gateBody(OWNER.email), { pool: failing(pool as unknown as PoolLike, /signin_salt/) })],
      ['no context.ip', () => gate(gateBody(OWNER.email), undefined, null)],
      ['a 100 KB body', () => gate(gateBody(OWNER.email, { pad: big }))],
      ['a 2 KB user object', () => gate(twoKb)],
    ];
    for (const [what, run] of cases) {
      assert.equal((await run()).status, 204, `allowed, with ${what}`);
    }
    for (const [what, run] of [
      ['a database that throws', () => gate(gateBody(STRANGER), { pool: DOWN })],
      ['no context.ip', () => gate(gateBody(STRANGER), undefined, null)],
      ['a 100 KB body', () => gate(gateBody(STRANGER, { pad: big }))],
    ] as Array<[string, () => Promise<Response>]>) {
      assert.equal((await run()).status, 403, `refused, with ${what}`);
    }
    // Only the 2 KB body was logged: the big one is over 64 KB, and the rest skipped.
    const gates = await events('gate');
    assert.equal(gates.length, 1);
    assert.equal(gates[0]!.email, OWNER.email);
    assert.equal(gates[0]!.event, 'login');
    assert.equal(gates[0]!.source, 'gate');
    assert.equal(gates[0]!.allowed, true);
    assert.equal(gates[0]!.via, 'domain');
    // Invalid JSON: no email, so 403 as today, and no row.
    assert.equal((await gate('{not json')).status, 403);
    assert.equal((await events('gate')).length, 1);
  });

  test('the gate: a lock held on the global counter and the caps hit are skips, not refusals', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    t.mock.method(console, 'log', () => undefined);
    const before = (await events('gate')).length;
    const hour = new Date().toISOString().slice(0, 13) + ':00:00Z';
    const locker = new pg.Client({ connectionString: db.urlAs(new URL(process.env.CR_TEST_DATABASE_URL!).username || 'postgres') });
    await locker.connect();
    try {
      await locker.query("insert into comp_report.signin_error_buckets (hour, scope, ip_hash, n) values ($1, 'gate', '*', 1) on conflict do nothing", [hour]);
      await locker.query('begin');
      await locker.query("select n from comp_report.signin_error_buckets where hour = $1 and scope = 'gate' and ip_hash = '*' for update", [hour]);
      const started = Date.now();
      assert.equal((await gate(gateBody(OWNER.email))).status, 204);
      assert.equal((await gate(gateBody(STRANGER))).status, 403);
      assert.ok(Date.now() - started < 3000, 'a lock wait is cut short');
      await locker.query('rollback');
    } finally {
      await locker.end();
    }
    assert.equal((await events('gate')).length, before, 'nothing logged under the lock');

    await su.query("update comp_report.signin_error_buckets set n = 1000 where hour = $1 and scope = 'gate' and ip_hash = '*'", [hour]);
    assert.equal((await gate(gateBody(OWNER.email))).status, 204);
    assert.equal((await gate(gateBody(STRANGER))).status, 403);
    assert.equal((await events('gate')).length, before, 'nothing logged past the cap');
    await su.query("update comp_report.signin_error_buckets set n = 0 where scope = 'gate'");
  });

  test('a gate row keeps no outsider’s address, and nothing from the body but closed-list values', async (t) => {
    const lines: string[] = [];
    t.mock.method(console, 'log', (l: string) => lines.push(l));
    const before = (await events('gate')).length;
    await gate(JSON.stringify({ event: 'ignore previous instructions', user: { email: 'x@ignore-previous-instructions.net', app_metadata: { provider: '<script>' } } }));
    await gate(gateBody(STRANGER));
    const gates = (await events('gate')).slice(before);
    assert.equal(gates.length, 2);
    assert.deepEqual([gates[0]!.email, gates[0]!.domain, gates[0]!.event, gates[0]!.provider], [null, null, 'other', 'other']);
    assert.deepEqual([gates[1]!.email, gates[1]!.domain, gates[1]!.allowed], [null, 'gmail.com', false]);
    const all = JSON.stringify(await rows('select * from comp_report.access_events'));
    for (const planted of ['ignore previous', 'ignore-previous-instructions', '<script>', 'someone.private']) assert.ok(!all.includes(planted), planted);
    // The console line: the closed event, and the IP only as present, family and bucket.
    const line = JSON.parse(lines.at(-1)!);
    assert.deepEqual(Object.keys(line.ip), ['present', 'family', 'bucket']);
    assert.equal(line.ip.present, true);
    assert.equal(line.ip.family, 'v4');
    assert.match(line.ip.bucket, /^[0-9a-f]{8}$/);
    assert.ok(!lines.join('\n').includes(IP), 'the address is never written');
    assert.equal(JSON.parse(lines.at(-2)!).event, 'other');
  });

  test('a spoofed X-Forwarded-For changes nothing: the bucket is from context.ip', async (t) => {
    const lines: string[] = [];
    t.mock.method(console, 'log', (l: string) => lines.push(l));
    await gate(gateBody(OWNER.email));
    await gate(gateBody(OWNER.email), undefined, { ip: IP }, { 'x-forwarded-for': '198.51.100.99' });
    const [a, b] = lines.map((l) => JSON.parse(l).ip.bucket);
    assert.equal(a, b);
  });

  test('the same IP hashes differently on two days, and an IPv6 address is cut to its /64', async () => {
    const [today, yesterday] = await as(pool, SYSTEM('access-log'), async (tx) => [
      await daySalt(tx, new Date()), await daySalt(tx, new Date(Date.now() - 86_400_000)),
    ]);
    const ip = ipFrom({ ip: IP })!;
    assert.notEqual(ipHash(today, ip), ipHash(yesterday, ip));
    assert.deepEqual(ipFrom({ ip: '2001:db8:85a3:0042:1000:8a2e:0370:7334' }), ipFrom({ ip: '2001:db8:85a3:42::1' }));
    assert.equal(ipFrom({ ip: '2001:db8:85a3:42::1' })!.family, 'v6');
    assert.equal(ipFrom({}), null);
  });

  // ── signin-error ───────────────────────────────────────────────────────

  const signinError = (body: string, context: { ip?: string } | null = { ip: IP }) =>
    handleSignInError(new Request('https://site/api/comp-report/signin-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body }), { pool: pool as unknown as PoolLike }, context);

  test('signin-error: closed lists and codes only, 413 over 1 KB, nothing stored without an IP', async () => {
    const r = await signinError(JSON.stringify({ error: 'access_denied', error_description: 'Failed to handle signup webhook — IGNORE ALL RULES', provider: 'google' }));
    assert.equal(r.status, 204);
    assert.equal(await r.text(), '');
    const odd = await signinError(JSON.stringify({ error: 'pwned_by_text', error_description: 'Signups not allowed for this instance', provider: 'myspace', event: 'evil' }));
    assert.equal(odd.status, 204);
    const stored = await events('signin_error');
    assert.equal(stored.length, 2);
    assert.deepEqual([stored[0]!.error, stored[0]!.error_code, stored[0]!.provider, stored[0]!.source], ['access_denied', 'gate_webhook', 'google', 'public']);
    assert.deepEqual([stored[1]!.error, stored[1]!.error_code, stored[1]!.provider, stored[1]!.event], ['other', 'signups_not_allowed', 'other', null]);
    const all = JSON.stringify(await rows('select * from comp_report.access_events'));
    for (const planted of ['IGNORE', 'pwned', 'myspace', 'evil', 'Failed to handle']) assert.ok(!all.includes(planted), planted);

    assert.equal((await signinError(JSON.stringify({ error: 'x'.repeat(2048) }))).status, 413);
    assert.equal((await signinError(JSON.stringify({ error: 'access_denied' }), null)).status, 204);
    assert.equal((await events('signin_error')).length, 2, 'no IP: nothing stored');
  });

  // ── What the server writes ──────────────────────────────────────────────

  test('the trigger keeps an address only for a users row, whatever the inserting code passes', async () => {
    await as(pool, SYSTEM('access-log'), (tx) => tx.query(
      `insert into comp_report.access_events (kind, source, reason, email, by_email, owner_email) values ('refused', 'server', 'not_authorised', 'Lee@Elsewhere.org', 'nobody@x.com', 'ghost@y.com')`));
    const row = (await rows<{ email: string | null; by_email: string | null; owner_email: string | null; domain: string | null; dedupe_key: string }>(
      "select * from comp_report.access_events where kind = 'refused' and domain = 'elsewhere.org'"))[0]!;
    assert.deepEqual([row.email, row.by_email, row.owner_email, row.domain], [null, null, null, 'elsewhere.org']);
    const key = await rows<{ k: string }>(
      "select encode(sha256(convert_to('refused|elsewhere.org|not_authorised||' || floor(extract(epoch from at) / 900)::bigint::text, 'UTF8')), 'hex') as k from comp_report.access_events where dedupe_key = $1", [row.dedupe_key]);
    assert.equal(key[0]!.k, row.dedupe_key, 'the key is built from the stored domain, not the address');
  });

  test('the CHECKs refuse rows whose kind and source don’t pair, and gate rows carrying a reason or report', async () => {
    const bad = [
      "('gate', 'server', null, null)",
      "('refused', 'gate', 'not_authorised', null)",
      "('signin_error', 'server', null, null)",
      "('gate', 'gate', 'disabled', null)",
      `('gate', 'gate', null, '${report}')`,
    ];
    for (const values of bad) {
      await assert.rejects(as(pool, SYSTEM('access-log'), (tx) => tx.query(`insert into comp_report.access_events (kind, source, reason, report_id) values ${values}`)), /check constraint/, values);
    }
  });

  test('the inspect actor can’t write here: Dispatch 23 adds its own policy', async () => {
    for (const sql of [
      "insert into comp_report.access_events (kind, source, event) values ('gate', 'gate', 'login')",
      `insert into comp_report.access_events (kind, source, email) values ('session_start', 'server', '${ADMIN.email}')`,
    ]) {
      await assert.rejects(as(pool, SYSTEM('inspect-audit'), (tx) => tx.query(sql)), /row-level security/);
    }
  });

  test('refused: 50 requests leave one row, not_authorised included, and the row exists when the response returns', async () => {
    for (let i = 0; i < 50; i++) {
      await assert.rejects(requireUser(req('me', STRANGER), deps), (e: { code?: string }) => e.code === 'not_authorised');
    }
    const refused = (await events('refused')).filter((r) => r.domain === 'gmail.com');
    assert.equal(refused.length, 1);
    assert.equal(refused[0]!.email, null, 'not a user: only the domain');
    assert.equal(refused[0]!.reason, 'not_authorised');
  });

  test('a failing log write changes nothing: the refusal and the sign-in still answer as before', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    const broken = { ...deps, pool: failing(pool as unknown as PoolLike, /^access-log$/) };
    await assert.rejects(requireUser(req('me', STRANGER), broken), (e: { code?: string }) => e.code === 'not_authorised');
    const user = await requireUser(req('me', AGENT.email), broken);
    assert.equal(user.email, AGENT.email);
  });

  test('session_start: once for a new user, then once per 30 minutes, not every 5', async () => {
    const mine = async () => (await events('session_start')).filter((r) => r.email === 'gus@casa-blanca.com').length;
    await requireUser(req('me', 'gus@casa-blanca.com'), deps);
    assert.equal(await mine(), 1, 'a new user starts a session');
    await raw("update comp_report.users set last_seen_at = now() - interval '6 minutes' where email = 'gus@casa-blanca.com'");
    await requireUser(req('me', 'gus@casa-blanca.com'), deps);
    assert.equal(await mine(), 1, 'the 5-minute refresh writes nothing here');
    await raw("update comp_report.users set last_seen_at = now() - interval '31 minutes' where email = 'gus@casa-blanca.com'");
    await requireUser(req('me', 'gus@casa-blanca.com'), deps);
    assert.equal(await mine(), 2);
  });

  test('viewed_other: 50 views by one mentor leave one row; a second mentor gets their own; the owner none', async () => {
    for (let i = 0; i < 50; i++) assert.equal((await handleWorkspace(req(`workspace?report=${report}`, MENTOR.email), deps)).status, 200);
    await handleWorkspace(req(`workspace?report=${report}`, MENTOR2.email), deps);
    await handleReports(req(`reports?id=${report}`, MENTOR2.email), deps);
    await handleWorkspace(req(`workspace?report=${report}`, OWNER.email), deps);
    const views = await events('viewed_other');
    assert.deepEqual(views.map((v) => v.by_email).sort(), [MENTOR.email, MENTOR2.email].sort());
    assert.ok(views.every((v) => v.report_id === report && v.owner_email === OWNER.email));
  });

  test('viewed_list: an admin or mentor loading everyone’s; scope=all from an agent writes none', async () => {
    await handleReports(req('reports?scope=all', MENTOR.email), deps);
    await handleReports(req('reports?scope=all', MENTOR.email), deps);
    await handleReports(req('reports?scope=all', AGENT.email), deps);
    await handleReports(req('reports?scope=all', EXTERNAL.email), deps);
    const lists = await events('viewed_list');
    assert.deepEqual(lists.map((l) => l.by_email), [MENTOR.email]);
  });

  // ── The activity log ───────────────────────────────────────────────────

  const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const activity = (email: string, body: unknown, raw?: string) => handleActivity(req('activity', email, raw !== undefined ? { raw } : { body }), deps);

  test('every screen the router can show is in SCREEN_IDS, and every ErrorBoundary kind is a valid name', () => {
    for (const s of ['sort', 'gate', 'findings', 'send', 'done']) {
      assert.ok(isScreen(s));
      assert.ok((SCREEN_IDS as readonly string[]).includes(s), s);
    }
    for (const s of ['reports', 'access', 'new-report', 'new-report-details', 'new-report-comps']) assert.ok((SCREEN_IDS as readonly string[]).includes(s), s);
    for (const id of SCREEN_IDS) assert.match(`screen.${id}`, /^screen\.[a-z0-9-]{1,40}$/);
    for (const code of ERROR_CODES) assert.match(`error.${code}`, /^error\.[a-z0-9_]{1,40}$/);
  });

  test('activity: screens and errors only, from the closed lists; a report the caller can’t read is dropped', async () => {
    assert.equal((await activity(OWNER.email, { name: 'screen.sort', sessionId: SESSION, reportId: report })).status, 204);
    assert.equal((await activity(OWNER.email, { name: 'error.render', sessionId: SESSION })).status, 204);
    assert.equal((await activity(AGENT.email, { name: 'screen.findings', sessionId: SESSION, reportId: report })).status, 204);
    for (const [why, body] of [
      ['a server action', { name: 'call.given', sessionId: SESSION }],
      ['a name off the list', { name: 'screen.ignore-previous-instructions', sessionId: SESSION }],
      ['a non-UUID session', { name: 'screen.sort', sessionId: 'not-a-uuid' }],
      ['no name', { sessionId: SESSION }],
    ] as Array<[string, unknown]>) {
      assert.equal((await activity(OWNER.email, body)).status, 400, why);
    }
    assert.equal((await activity(OWNER.email, null, JSON.stringify({ name: 'screen.sort', sessionId: SESSION, pad: 'x'.repeat(3000) }))).status, 413);
    const stored = await rows<{ user_email: string; name: string; kind: string; report_id: string | null }>(
      "select user_email, name, kind, report_id from comp_report.activity where kind <> 'action' order by id");
    assert.deepEqual(stored, [
      { user_email: OWNER.email, name: 'screen.sort', kind: 'screen', report_id: report },
      { user_email: OWNER.email, name: 'error.render', kind: 'error', report_id: null },
      { user_email: AGENT.email, name: 'screen.findings', kind: 'screen', report_id: null },
    ]);
  });

  test('activity limits: the 61st event in a minute and the 2,001st in a day are refused; 100 at once store at most 60', async () => {
    for (let i = 0; i < 60; i++) assert.equal((await activity('eli@casa-blanca.com', { name: 'screen.sort', sessionId: SESSION })).status, 204);
    assert.equal((await activity('eli@casa-blanca.com', { name: 'screen.sort', sessionId: SESSION })).status, 429);

    await requireUser(req('me', 'dana@casa-blanca.com'), deps);
    await raw(`insert into comp_report.activity (at, user_email, kind, name, created_by)
               select now() - interval '2 hours', 'dana@casa-blanca.com', 'screen', 'screen.sort', 'test' from generate_series(1, 1999)`);
    assert.equal((await activity('dana@casa-blanca.com', { name: 'screen.sort', sessionId: SESSION })).status, 204);
    assert.equal((await activity('dana@casa-blanca.com', { name: 'screen.sort', sessionId: SESSION })).status, 429);

    await requireUser(req('me', 'fay@casa-blanca.com'), deps);
    const all = await Promise.all(Array.from({ length: 100 }, () => activity('fay@casa-blanca.com', { name: 'screen.send', sessionId: SESSION })));
    assert.equal(all.filter((r) => r.status === 204).length, 60);
    const n = (await rows<{ n: number }>("select count(*)::int as n from comp_report.activity where user_email = 'fay@casa-blanca.com'"))[0]!.n;
    assert.equal(n, 60);
  });

  test('the database holds the same line: free text in detail, or a screen named call.given, fails its CHECK', async () => {
    for (const [name, kind, detail] of [
      ['call.given', 'screen', {}],
      ['screen.sort', 'action', {}],
      ['comp.tiered', 'action', { tier: 'primary', note: 'the client loves it' }],
      ['comp.tiered', 'action', { tier: 'gold' }],
      ['import.read', 'action', { comps: 'twelve' }],
      ['screen.sort', 'screen', { note: 'hello' }],
    ] as Array<[string, string, unknown]>) {
      await assert.rejects(as(pool, SYSTEM('activity-log'), (tx) => tx.query(
        'insert into comp_report.activity (user_email, kind, name, detail) values ($1, $2, $3, $4::jsonb)', [OWNER.email, kind, name, JSON.stringify(detail)])),
      /check constraint/, `${kind} ${name} ${JSON.stringify(detail)}`);
    }
    // A user can't write an action directly either: the insert policy takes screens and errors only.
    await assert.rejects(as(pool, OWNER, (tx) => tx.query(
      "insert into comp_report.activity (user_email, kind, name, detail) values ($1, 'action', 'call.given', '{}')", [OWNER.email])), /row-level security/);
  });

  test('the server records what was done, after its transaction: a tier, a call, a send', async () => {
    const tier = await handleComps(req('comps', OWNER.email, { body: { reportId: report, reportCompId: comp, tier: 'primary', reason: 'Same line', reasonType: 'property' } }), deps as never);
    assert.equal(tier.status, 200);
    const call = await handleWorkspace(req('workspace', OWNER.email, { method: 'PATCH', body: { reportId: report, call: { low: 1_000_000, high: 1_100_000, at: new Date().toISOString(), note: 'x' } } }), deps);
    assert.equal(call.status, 200);
    const sent = await handleWorkspace(req('workspace', OWNER.email, { method: 'PATCH', body: { reportId: report, state: { send: { sentAt: new Date().toISOString() } } } }), deps);
    assert.equal(sent.status, 200);
    await handleWorkspace(req('workspace', OWNER.email, { method: 'PATCH', body: { reportId: report, state: { send: { sentAt: new Date().toISOString() } } } }), deps);
    const actions = await rows<{ name: string; detail: unknown; user_email: string; created_by: string }>(
      "select name, detail, user_email, created_by from comp_report.activity where kind = 'action' order by id");
    assert.deepEqual(actions.map((a) => [a.name, a.detail]), [
      ['comp.tiered', { tier: 'primary', by: 'agent' }],
      ['call.given', { skipped: false, by: 'agent' }],
      ['report.sent', { by: 'agent' }],
    ], 'a second save of a sent report is not sent again');
    assert.ok(actions.every((a) => a.user_email === OWNER.email && a.created_by === 'system:activity-log'));
  });

  // ── Deletes and the purge ──────────────────────────────────────────────

  test('nothing changes or deletes a log row directly: an admin, another system actor, or the app role', async () => {
    for (const actor of [ADMIN, SYSTEM('decide-key')]) {
      for (const sql of ['update comp_report.access_events set kind = kind', 'delete from comp_report.access_events',
        'update comp_report.activity set name = name', 'delete from comp_report.activity']) {
        await as(pool, actor, async (tx) => {
          const n = await tx.query(sql).then((r) => r.rowCount, (e: Error) => e.message);
          assert.ok(n === 0 || /append-only|permission denied|row-level/.test(String(n)), `${JSON.stringify(actor)}: ${sql} → ${n}`);
        });
      }
    }
    const app = new pg.Client({ connectionString: db.ownerUrl });
    await app.connect();
    try {
      for (const sql of ['delete from comp_report.access_events', 'delete from comp_report.activity', 'update comp_report.activity set name = name']) {
        await app.query('begin');
        const { rows: [who] } = await app.query<{ db_role: string }>("select db_role from comp_report.enter('system', null, null, 'log-purge')");
        assert.equal(who!.db_role, 'comp_report_app');
        await app.query("select set_config('cr.purging', 'on', true)");
        await assert.rejects(app.query(sql), /permission denied|append-only/, `as comp_report_app: ${sql}`);
        await app.query('rollback');
      }
    } finally {
      await app.end();
    }
    assert.ok((await rows('select 1 from comp_report.access_events')).length > 0);
  });

  test('the purge, as log-purge only: by age and source, a later kind too, salt older than today, and cr.purging off after', async () => {
    await raw(`insert into comp_report.access_events (at, kind, source, created_by) values
                 (now() - interval '31 days', 'gate', 'gate', 't'),
                 (now() - interval '31 days', 'session_start', 'server', 't'),
                 (now() - interval '14 months', 'session_start', 'server', 't')`);
    await raw(`insert into comp_report.activity (at, user_email, kind, name, created_by) values
                 (now() - interval '91 days', $1, 'screen', 'screen.sort', 't'), (now() - interval '89 days', $1, 'screen', 'screen.sort', 't')`, [OWNER.email]);
    await raw("insert into comp_report.signin_salt (day, salt) values (current_date - 3, repeat('a', 64)) on conflict do nothing");
    await raw("insert into comp_report.signin_error_buckets (hour, scope, ip_hash, n) values (now() - interval '2 days', 'gate', '*', 5)");
    // A kind Dispatch 23 may add: the purge must trim it by age, not by a list of kinds.
    await su.query('alter table comp_report.access_events drop constraint access_events_kind_check');
    await raw("insert into comp_report.access_events (at, kind, source, view, text_flag, created_by) values (now() - interval '14 months', 'inspect', 'server', 'reports', false, 't')");

    for (const actor of [SYSTEM('access-log'), ADMIN]) {
      await assert.rejects(as(pool, actor, (tx) => tx.query('select comp_report.purge_access_events()')), /only the system actor log-purge|permission denied/);
    }

    const old = async () => (await rows<{ n: number }>(`select
        (select count(*) from comp_report.access_events where at < now() - interval '13 months'
                                                            or (source = 'gate' and at < now() - interval '30 days'))
      + (select count(*) from comp_report.activity where at < now() - interval '90 days')
      + (select count(*) from comp_report.signin_salt where day < current_date)
      + (select count(*) from comp_report.signin_error_buckets where hour < now() - interval '1 day') as n`))[0]!.n;
    assert.ok(Number(await old()) >= 6);
    const kept = (await rows<{ n: number }>("select count(*)::int as n from comp_report.activity where at > now() - interval '90 days'"))[0]!.n;
    const left = await withActor(pool as unknown as PoolLike, SYSTEM('log-purge'), async (tx) => {
      await tx.query('select comp_report.purge_access_events(), comp_report.purge_activity(), comp_report.purge_signin_buckets()');
      return (await tx.query<{ p: string | null }>("select current_setting('cr.purging', true) as p")).rows[0]!.p;
    });
    assert.equal(left, 'off');
    assert.deepEqual(await purgeLogs(pool as unknown as PoolLike), { accessEvents: 0, activity: 0, buckets: 0 }, 'the scheduled run finds nothing left');
    assert.equal(Number(await old()), 0);
    assert.equal((await rows<{ n: number }>("select count(*)::int as n from comp_report.activity where at > now() - interval '90 days'"))[0]!.n, kept);
    assert.equal((await rows("select 1 from comp_report.access_events where kind = 'inspect'")).length, 0);
    assert.ok((await rows("select 1 from comp_report.access_events where at > now() - interval '1 day'")).length > 0, 'recent rows stay');
    await su.query(`alter table comp_report.access_events add constraint access_events_kind_check check (kind in ('gate', 'session_start', 'refused', 'viewed_other', 'viewed_list', 'signin_error', 'capability_change'))`);
  });

  test('the policies: only activity_insert may reference can_read_report; the only deletes are the four purge policies', async () => {
    const policies = await rows<{ tablename: string; policyname: string; cmd: string; qual: string | null; with_check: string | null }>(
      "select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'comp_report'");
    for (const p of policies.filter((x) => ['INSERT', 'UPDATE', 'ALL'].includes(x.cmd))) {
      const expr = `${p.qual} ${p.with_check}`;
      if (p.policyname === 'activity_insert') {
        assert.match(expr, /can_read_report/);
        continue;
      }
      assert.doesNotMatch(expr, /can_read_report|can_see_report/, p.policyname);
      if (p.tablename !== 'mentees') assert.doesNotMatch(expr, /mentor/, `${p.policyname} admits a mentor`);
    }
    const NEW = ['access_events', 'activity', 'signin_error_buckets', 'signin_salt'];
    const deletes = policies.filter((p) => p.cmd === 'DELETE' && NEW.includes(p.tablename));
    assert.deepEqual(deletes.map((p) => p.policyname).sort(), NEW.map((t) => `${t}_purge_delete`).sort());
    for (const d of deletes) assert.match(d.qual ?? '', /is_system\(\)/);
    const forced = await rows<{ relname: string; relforcerowsecurity: boolean }>(
      "select relname, relforcerowsecurity from pg_class where relnamespace = 'comp_report'::regnamespace and relname = any($1)", [NEW]);
    assert.ok(forced.length === 4 && forced.every((r) => r.relforcerowsecurity));
  });

  test('the migration applies where roles can’t be managed', async () => {
    const plain = await createTestDatabase({ ownerCanCreateRoles: false });
    try {
      const c = new pg.Client({ connectionString: plain.ownerUrl });
      await c.connect();
      const t = (await c.query<{ n: number }>("select count(*)::int as n from pg_tables where schemaname = 'comp_report' and tablename in ('access_events', 'activity', 'signin_salt', 'signin_error_buckets')")).rows[0]!.n;
      await c.end();
      assert.equal(t, 4);
    } finally {
      await plain.drop();
    }
  });

  // ── The reader and the level ───────────────────────────────────────────

  test('the access log reader: admins only, at the handler and in SQL; its views and their 400s', async () => {
    const signin = await handleAccessLog(req('access-log?view=signin', ADMIN.email), deps);
    assert.equal(signin.status, 200);
    const kinds = new Set(((await signin.json()).lines as Array<{ kind: string }>).map((l) => l.kind));
    assert.ok(kinds.has('gate') && kinds.has('refused') && kinds.has('session_start') && kinds.has('signin_error'));
    assert.ok(![...kinds].some((k) => k === 'viewed_other' || k === 'viewed_list'));
    const audit = await (await handleAccessLog(req('access-log?view=audit', ADMIN.email), deps)).json();
    assert.ok(audit.lines.some((l: { kind: string }) => l.kind === 'viewed_list'));
    const timeline = await (await handleAccessLog(req(`access-log?view=timeline&report=${report}`, ADMIN.email), deps)).json();
    assert.ok(timeline.activity.some((a: { name: string }) => a.name === 'comp.tiered'));
    assert.ok(timeline.lines.every((l: { kind: string }) => l.kind === 'viewed_other') && timeline.lines.length >= 1);
    const gateLine = (await (await handleAccessLog(req('access-log?view=signin', ADMIN.email), deps)).json()).lines.find((l: { kind: string }) => l.kind === 'gate');
    assert.equal(gateLine.verified, false, 'gate lines are marked unverified');

    for (const who of [AGENT, MENTOR, EXTERNAL]) {
      assert.equal((await handleAccessLog(req('access-log?view=signin', who.email), deps)).status, 403, who.role);
      const n = await as(pool, who, async (tx) => (await tx.query('select 1 from comp_report.access_events')).rowCount);
      assert.equal(n, 0, `${who.role} reads no access_events in SQL`);
    }
    assert.equal((await handleAccessLog(req('access-log?view=timeline', ADMIN.email), deps)).status, 400);
    assert.equal((await handleAccessLog(req('access-log?view=everything', ADMIN.email), deps)).status, 400);
    assert.equal((await handleAccessLog(req('access-log?view=signin&user=Ana@Casa-Blanca.com', ADMIN.email), deps)).status, 400);
    assert.equal((await handleAccessLog(req('access-log?view=timeline&report=nope', ADMIN.email), deps)).status, 400);
  });

  test('capability: admins only; 404, 400; logged; practice clears the unlock; a failed log write is an error line and the change stands', async (t) => {
    const set = (who: string, body: unknown, d: AuthDeps = deps) => handleCapability(req('capability', who, { body }), d);
    assert.equal((await set(MENTOR.email, { email: AGENT.email, capability: 'practice' })).status, 403);
    assert.equal((await set(ADMIN.email, { email: 'nobody@casa-blanca.com', capability: 'practice' })).status, 404);
    assert.equal((await set(ADMIN.email, { email: AGENT.email, capability: 'admin' })).status, 400);

    const full = await set(ADMIN.email, { email: AGENT.email, capability: 'full', reason: 'Passed Noble’s review' });
    assert.equal(full.status, 200);
    let row = (await rows<{ capability: string; unlocked_by: string | null; unlocked_reason: string | null; unlocked_at: Date | null }>(
      'select capability, unlocked_by, unlocked_reason, unlocked_at from comp_report.users where email = $1', [AGENT.email]))[0]!;
    assert.deepEqual([row.capability, row.unlocked_by, row.unlocked_reason], ['full', ADMIN.email, 'Passed Noble’s review']);
    assert.ok(row.unlocked_at);

    assert.equal((await set(ADMIN.email, { email: AGENT.email, capability: 'practice' })).status, 200);
    row = (await rows<typeof row>('select capability, unlocked_by, unlocked_reason, unlocked_at from comp_report.users where email = $1', [AGENT.email]))[0]!;
    assert.deepEqual([row.capability, row.unlocked_by, row.unlocked_reason, row.unlocked_at], ['practice', null, null, null]);
    const changes = await events('capability_change');
    assert.deepEqual(changes.map((c) => [c.email, c.by_email, c.capability]), [[AGENT.email, ADMIN.email, 'full'], [AGENT.email, ADMIN.email, 'practice']]);

    const errors: string[] = [];
    t.mock.method(console, 'error', (...a: unknown[]) => errors.push(a.map(String).join(' ')));
    const broken = { ...deps, pool: failing(pool as unknown as PoolLike, /^access-log$/) };
    assert.equal((await set(ADMIN.email, { email: AGENT.email, capability: 'full' }, broken)).status, 200);
    assert.equal((await rows<{ capability: string }>('select capability from comp_report.users where email = $1', [AGENT.email]))[0]!.capability, 'full');
    assert.ok(errors.some((e) => e.includes('unlogged') && e.includes(AGENT.email) && e.includes(ADMIN.email)));
    assert.equal((await events('capability_change')).length, 2);
  });
});
