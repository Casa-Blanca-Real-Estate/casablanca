// Dispatch 22a (CR-7e) · NW-088 a, answered NB-23 A: mentors read every report, read-only.
//   CR_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:comp-report
//
// The SQL tests run under withActor with no handler in front, so row-level security alone is
// what's being tested. The write check is catalog-driven: every insert, update and all policy
// in comp_report, before and after the migration, compared with can_see_report renamed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleMentees } from '../server/api/mentees.ts';
import { handleMessages } from '../server/api/messages.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleWorkspace } from '../server/api/workspace.ts';
import { withActor, type Actor, type PoolLike, type Queryable } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import type { AuthDeps } from '../server/session.ts';
import { createTestDatabase, migrationFiles, MIGRATIONS_DIR, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const MIGRATION = '20261027120000_comp_report_mentor_reads.sql';

type UserActor = Actor & { kind: 'user' };
const OWNER: UserActor = { kind: 'user', email: 'ana@casa-blanca.com', role: 'agent' };
const AGENT: UserActor = { kind: 'user', email: 'ben@casa-blanca.com', role: 'agent' };
const ADMIN: UserActor = { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' };
const MENTOR: UserActor = { kind: 'user', email: 'noble@casa-blanca.com', role: 'mentor' };
const EXTERNAL: UserActor = { kind: 'user', email: 'counsel@firm.com', role: 'external' };
const ROLES: Array<[string, UserActor]> = [['owner', OWNER], ['admin', ADMIN], ['mentor', MENTOR], ['agent', AGENT], ['external', EXTERNAL]];
/** Tokens long enough for the session's shape check. */
const tok = (who: string) => `tok-${who}`.padEnd(20, '0');
const SIGN_IN: Actor = { kind: 'system', does: 'sign-in' };

const as = <T>(pool: PoolLike, actor: Actor, fn: (tx: Queryable) => Promise<T>) => withActor(pool, actor, fn);

/** Every write policy in comp_report, by name, with its expressions as Postgres prints them.
 *  The mentees table is new in this migration and tested on its own, below. */
async function writePolicies(client: pg.Client) {
  const { rows } = await client.query<{ policyname: string; cmd: string; roles: string; qual: string | null; with_check: string | null }>(
    `select policyname, cmd, roles::text, qual, with_check from pg_policies
      where schemaname = 'comp_report' and cmd in ('INSERT', 'UPDATE', 'ALL') and tablename <> 'mentees' order by policyname`,
  );
  return rows;
}

describe('mentors read every report, read-only (Dispatch 22a)', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let deps: AuthDeps;
  let report: string;
  let agentReport: string;

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    await as(pool, SIGN_IN, async (tx) => {
      for (const [, a] of ROLES) await tx.query('insert into comp_report.users (email, role) values ($1, $2)', [a.email, a.role]);
    });
    report = await as(pool, OWNER, async (tx) => {
      const id = (await tx.query<{ id: string }>("insert into comp_report.reports (owner_email, title) values ($1, 'Ana — 25 N Moore 9C') returning id", [OWNER.email])).rows[0]!.id;
      const p = (await tx.query<{ id: string }>("insert into comp_report.properties (property_key, address, unit) values ('100-barclay|17l', '100 Barclay St', '17L') returning id")).rows[0]!.id;
      const o = (await tx.query<{ id: string }>(
        `insert into comp_report.property_observations (property_id, report_id, source, facts) values ($1, $2, 'listing', '{"sqft": 1200}') returning id`, [p, id])).rows[0]!.id;
      const rc = (await tx.query<{ id: string }>(
        "insert into comp_report.report_comps (report_id, property_id, observation_id, evidence_class) values ($1, $2, $3, 'sold') returning id", [id, p, o])).rows[0]!.id;
      await tx.query(`insert into comp_report.reasons (report_comp_id, report_id, tier, reason, reason_type, actor)
                      values ($1, $2, 'primary', 'Same line, two floors up', 'property', 'agent')`, [rc, id]);
      await tx.query(`insert into comp_report.messages (report_id, seq, role, content) values ($1, 1, 'user', '[{"type":"text","text":"hi"}]')`, [id]);
      await tx.query(`insert into comp_report.imports (report_id, format, content, content_sha256, as_of, parser_version, export_schema, comp_count)
                      values ($1, 'csv', '\\x01', repeat('a', 64), current_date, 't', 't', 0)`, [id]);
      await tx.query("insert into comp_report.link_reads (report_id, purpose, url) values ($1, 'comp', 'https://streeteasy.com/building/x/17l')", [id]);
      await tx.query(`insert into comp_report.narratives (report_id, origin, status, length, result_kind, engine_version, inputs_hash, headline_facts)
                      values ($1, 'agent', 'done', 'full', 'on_facts', 't', 't', '{}')`, [id]);
      return id;
    });
    agentReport = await as(pool, AGENT, async (tx) =>
      (await tx.query<{ id: string }>("insert into comp_report.reports (owner_email, title) values ($1, 'Ben — 1 Main') returning id", [AGENT.email])).rows[0]!.id);

    const people: Record<string, Partial<IdentityUser>> = Object.fromEntries(ROLES.map(([k, a]) => [tok(k), { email: a.email }]));
    deps = {
      verifier: {
        async verify(token: string) {
          const p = people[token];
          return p ? ({ id: `id-${token}`, confirmed: true, provider: 'google', name: null, ...p } as IdentityUser) : null;
        },
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({ CR_ADMIN_EMAILS: ADMIN.email }),
      pool: pool as unknown as PoolLike,
    };
    // The roles above came from the system insert; the allowlist gives the outsider and the mentor theirs on sign-in.
    await as(pool, ADMIN, async (tx) => {
      await tx.query("insert into comp_report.allowlist (email, role) values ($1, 'mentor'), ($2, 'external')", [MENTOR.email, EXTERNAL.email]);
    });
  });
  after(async () => {
    await pool.end();
    await db?.drop();
  });

  test('reports_select and can_read_report agree for every role, and the policy does not recurse', async () => {
    for (const [name, actor] of ROLES) {
      const r = await as(pool, actor, async (tx) => (await tx.query<{ listed: boolean; fn: boolean }>(
        'select exists (select 1 from comp_report.reports where id = $1) as listed, comp_report.can_read_report($1) as fn', [report])).rows[0]!);
      assert.equal(r.listed, r.fn, `${name}: reports_select and can_read_report disagree`);
      assert.equal(r.listed, ['owner', 'admin', 'mentor'].includes(name), `${name} reads the report`);
    }
    const client = new pg.Client({ connectionString: db.ownerUrl });
    await client.connect();
    try {
      const def = (await client.query<{ qual: string }>("select qual from pg_policies where schemaname = 'comp_report' and policyname = 'reports_select'")).rows[0]!.qual;
      assert.doesNotMatch(def, /can_read_report|can_edit_report/);
      assert.match(def, /mentor/);
      const fns = (await client.query<{ n: number }>("select count(*)::int as n from pg_proc where proname = 'can_see_report'")).rows[0]!.n;
      assert.equal(fns, 0, 'can_see_report no longer exists');
    } finally {
      await client.end();
    }
  });

  test('a mentor reads comps with their facts, reasons, messages, imports, link reads and narratives', async () => {
    const counts = await as(pool, MENTOR, async (tx) => {
      const n = async (sql: string) => (await tx.query(sql, [report])).rowCount;
      return {
        comps: await n('select 1 from comp_report.report_comps where report_id = $1'),
        facts: await n('select 1 from comp_report.property_observations where report_id = $1'),
        reasons: await n('select 1 from comp_report.reasons where report_id = $1'),
        messages: await n('select 1 from comp_report.messages where report_id = $1'),
        imports: await n('select 1 from comp_report.imports where report_id = $1'),
        links: await n('select 1 from comp_report.link_reads where report_id = $1'),
        narratives: await n('select 1 from comp_report.narratives where report_id = $1'),
      };
    });
    assert.deepEqual(counts, { comps: 1, facts: 1, reasons: 1, messages: 1, imports: 1, links: 1, narratives: 1 });
    const agent = await as(pool, AGENT, async (tx) => (await tx.query('select 1 from comp_report.report_comps where report_id = $1', [report])).rowCount);
    assert.equal(agent, 0, 'another agent still sees nothing');
  });

  test('a mentor writes nowhere', async () => {
    const tries: Array<[string, (tx: Queryable) => Promise<{ rowCount: number | null }>]> = [
      ['update another agent\'s report', (tx) => tx.query("update comp_report.reports set title = 'x' where id = $1", [report])],
      ['update a comp', (tx) => tx.query("update comp_report.report_comps set is_anchor = true where report_id = $1", [report])],
      ['update a link read', (tx) => tx.query("update comp_report.link_reads set status = 'failed' where report_id = $1", [report])],
      ['update a narrative', (tx) => tx.query("update comp_report.narratives set status = 'failed' where report_id = $1", [report])],
      ['update users', (tx) => tx.query("update comp_report.users set role = 'admin' where email = $1", [MENTOR.email])],
      ['update the allowlist', (tx) => tx.query("update comp_report.allowlist set role = 'agent' where email = $1", [MENTOR.email])],
    ];
    for (const [what, run] of tries) {
      const changed: number | null = await as(pool, MENTOR, run).then((r) => r.rowCount, () => 0);
      assert.equal(changed, 0, `a mentor could ${what}`);
    }
    const inserts: Array<[string, (tx: Queryable) => Promise<unknown>]> = [
      ['a report in another\'s name', (tx) => tx.query("insert into comp_report.reports (owner_email, title) values ($1, 'x')", [OWNER.email])],
      ['a message', (tx) => tx.query(`insert into comp_report.messages (report_id, seq, role, content) values ($1, 2, 'user', '[]')`, [report])],
      ['a link read', (tx) => tx.query("insert into comp_report.link_reads (report_id, purpose, url) values ($1, 'comp', 'https://streeteasy.com/b/y')", [report])],
      ['an observation', (tx) => tx.query(
        `insert into comp_report.property_observations (property_id, report_id, source, facts)
         select property_id, report_id, 'agent', '{}' from comp_report.report_comps where report_id = $1`, [report])],
    ];
    for (const [what, run] of inserts) {
      await assert.rejects(as(pool, MENTOR, run), /row-level security|violates/, `a mentor could insert ${what}`);
    }
  });

  test('no write policy is gained or lost: every insert and update policy is as before, can_see_report renamed', async () => {
    const before = await createTestDatabase({ migrate: false });
    const c1 = new pg.Client({ connectionString: before.ownerUrl });
    const c2 = new pg.Client({ connectionString: db.ownerUrl });
    await c1.connect();
    await c2.connect();
    try {
      for (const file of migrationFiles().filter((f) => f < MIGRATION)) {
        await c1.query('begin');
        await c1.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
        await c1.query('commit');
      }
      const was = (await writePolicies(c1)).map((p) => ({
        ...p,
        qual: p.qual?.replaceAll('can_see_report', 'can_edit_report') ?? null,
        with_check: p.with_check?.replaceAll('can_see_report', 'can_edit_report') ?? null,
      }));
      const now = await writePolicies(c2);
      assert.deepEqual(now, was);
      for (const p of now) {
        assert.doesNotMatch(`${p.qual} ${p.with_check}`, /can_read_report|can_see_report|mentor/, `${p.policyname} admits a reader`);
      }
      // can_edit_report is can_see_report under its new name.
      const body = async (c: pg.Client, name: string) =>
        (await c.query<{ src: string }>('select prosrc as src from pg_proc where proname = $1', [name])).rows[0]!.src;
      assert.equal(await body(c2, 'can_edit_report'), await body(c1, 'can_see_report'));
    } finally {
      await c1.end();
      await c2.end();
      await before.drop();
    }
  });

  const get = (token: string, path: string) =>
    new Request(`https://site/api/comp-report/${path}`, { headers: { authorization: `Bearer ${token}` } });

  test("GET /reports?scope=all: everyone's for admins and mentors, ignored for anyone else", async () => {
    const ids = async (token: string, query: string) => {
      const res = await handleReports(get(token, `reports${query}`), deps);
      assert.equal(res.status, 200, `${token} ${query}`);
      return ((await res.json()).reports as Array<{ id: string }>).map((r) => r.id).sort();
    };
    const both = [report, agentReport].sort();
    assert.deepEqual(await ids(tok('admin'), '?scope=all'), both);
    assert.deepEqual(await ids(tok('mentor'), '?scope=all'), both);
    assert.deepEqual(await ids(tok('mentor'), ''), [], 'without scope, their own');
    assert.deepEqual(await ids(tok('mentor'), `?scope=all&owner=${encodeURIComponent(AGENT.email)}`), [agentReport]);
    assert.deepEqual(await ids(tok('agent'), '?scope=all'), [agentReport]);
    assert.deepEqual(await ids(tok('external'), '?scope=all'), []);
    const bad = await handleReports(get(tok('mentor'), 'reports?scope=all&owner=Ben@Casa-Blanca.com'), deps);
    assert.equal(bad.status, 400);
  });

  test('one read path: a mentor opens the report, its workspace and its messages; another agent gets 404', async () => {
    for (const path of [`reports?id=${report}`, `workspace?report=${report}`, `messages?report=${report}`]) {
      const handler = path.startsWith('reports') ? handleReports : path.startsWith('workspace') ? handleWorkspace : handleMessages;
      assert.equal((await handler(get(tok('mentor'), path), deps)).status, 200, `mentor ${path}`);
      assert.equal((await handler(get(tok('agent'), path), deps)).status, 404, `agent ${path}`);
    }
    const ws = await (await handleWorkspace(get(tok('mentor'), `workspace?report=${report}`), deps)).json();
    assert.equal(ws.report.ownerEmail, OWNER.email, 'the client marks it read-only by its owner');
    assert.equal(ws.comps.length, 1);
  });

  test("a mentor can't change a report through the API", async () => {
    const res = await handleReports(new Request('https://site/api/comp-report/reports', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tok('mentor')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: report, action: 'archive' }),
    }), deps);
    assert.equal(res.status, 404);
  });

  const mentees = (token: string, method = 'GET', body?: unknown) => handleMentees(new Request('https://site/api/comp-report/mentees', {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), deps);

  test("a mentor's mentees: picked from the agents, kept, and the filter on Everyone's", async () => {
    const first = await (await mentees(tok('mentor'))).json();
    assert.deepEqual(first.mentees, []);
    assert.deepEqual(first.agents.map((a: { email: string }) => a.email).sort(), [OWNER.email, AGENT.email].sort(), 'only agents can be picked');

    assert.equal((await mentees(tok('mentor'), 'PUT', { emails: [OWNER.email] })).status, 200);
    const ids = async (query: string) =>
      ((await (await handleReports(get(tok('mentor'), `reports${query}`), deps)).json()).reports as Array<{ id: string }>).map((r) => r.id).sort();
    assert.deepEqual(await ids('?scope=all&mentees=1'), [report]);
    assert.deepEqual(await ids('?scope=all'), [report, agentReport].sort(), 'all agents is still a click away');

    // Replacing the list keeps the removed row, stamped, and re-adding brings it back.
    await mentees(tok('mentor'), 'PUT', { emails: [AGENT.email] });
    assert.deepEqual(await ids('?scope=all&mentees=1'), [agentReport]);
    await mentees(tok('mentor'), 'PUT', { emails: [OWNER.email, AGENT.email] });
    assert.deepEqual((await (await mentees(tok('mentor'))).json()).mentees, [OWNER.email, AGENT.email].sort());
    const rows = await as(pool, MENTOR, async (tx) => (await tx.query('select 1 from comp_report.mentees')).rowCount);
    assert.equal(rows, 2);

    // Only an agent can be a mentee; only a mentor keeps a list; nobody else sees a mentor's list.
    assert.equal((await mentees(tok('mentor'), 'PUT', { emails: [ADMIN.email] })).status, 400);
    assert.equal((await mentees(tok('mentor'), 'PUT', { emails: ['not an email'] })).status, 400);
    for (const who of ['admin', 'agent', 'external', 'owner']) assert.equal((await mentees(tok(who))).status, 403, who);
    assert.deepEqual(await (async () => {
      const r = await handleReports(get(tok('agent'), 'reports?scope=all&mentees=1'), deps);
      return ((await r.json()).reports as Array<{ id: string }>).map((x) => x.id);
    })(), [agentReport], 'mentees=1 from an agent is ignored, like scope=all');
    const seen = await as(pool, AGENT, async (tx) => (await tx.query('select 1 from comp_report.mentees')).rowCount);
    assert.equal(seen, 0);
    await assert.rejects(as(pool, AGENT, (tx) => tx.query(
      "insert into comp_report.mentees (mentor_email, agent_email) values ($1, $2)", [AGENT.email, OWNER.email])), /row-level security/);
    await assert.rejects(as(pool, MENTOR, (tx) => tx.query('delete from comp_report.mentees')), /append-only|refuse|not allowed|permission|row-level/i);
  });
});
