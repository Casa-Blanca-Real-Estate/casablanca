// Row-level security and the schema's guarantees, against a real PostgreSQL.
//   CR_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:comp-report
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { DatabaseUnavailable, withActor, type Actor, type PoolLike, type Queryable } from '../server/db.ts';
import { createTestDatabase, skipWithoutDatabase, type TestDatabase } from './testing.ts';

const AGENT_A: Actor = { kind: 'user', email: 'ana@casa-blanca.com', role: 'agent' };
const AGENT_B: Actor = { kind: 'user', email: 'ben@casa-blanca.com', role: 'agent' };
const ADMIN: Actor = { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' };
const MENTOR: Actor = { kind: 'user', email: 'noble@casa-blanca.com', role: 'mentor' };
const SIGN_IN: Actor = { kind: 'system', does: 'sign-in' };

const as = <T>(pool: PoolLike, actor: Actor, fn: (tx: Queryable) => Promise<T>) => withActor(pool, actor, fn);

async function provision(pool: PoolLike, ...actors: Actor[]) {
  await as(pool, SIGN_IN, async (tx) => {
    for (const a of actors) {
      if (a.kind !== 'user') continue;
      await tx.query('insert into comp_report.users (email, role) values ($1, $2)', [a.email, a.role]);
    }
  });
}

async function newReport(pool: PoolLike, actor: Actor & { kind: 'user' }, title = 'Report') {
  return as(pool, actor, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'insert into comp_report.reports (owner_email, title) values ($1, $2) returning id',
      [actor.email, title],
    );
    return rows[0]!.id;
  });
}

async function rejects(p: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(p, (e: Error) => pattern.test(e.message));
}

describe('comp_report schema — owner can create roles (Neon-like)', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;

  before(async () => {
    db = await createTestDatabase({ ownerCanCreateRoles: true });
    pool = new pg.Pool({ connectionString: db.ownerUrl, max: 4 });
    await provision(pool, AGENT_A, AGENT_B, ADMIN, MENTOR);
  });
  after(async () => {
    await pool.end();
    await db.drop();
  });

  test('requests run as comp_report_app, which does not bypass RLS', async () => {
    const who = await as(pool, AGENT_A, async (tx) => (await tx.query<{ u: string }>('select current_user as u')).rows[0]!.u);
    assert.equal(who, 'comp_report_app');
  });

  test("an agent sees only their own reports; an admin sees everyone's", async () => {
    const a = await newReport(pool, AGENT_A as Actor & { kind: 'user' }, 'Ana — 25 N Moore 9C');
    const b = await newReport(pool, AGENT_B as Actor & { kind: 'user' }, 'Ben — 100 Barclay 17L');
    const ids = (actor: Actor) =>
      as(pool, actor, async (tx) => (await tx.query<{ id: string }>('select id from comp_report.reports')).rows.map((r) => r.id));
    assert.deepEqual(await ids(AGENT_A), [a]);
    assert.deepEqual(await ids(AGENT_B), [b]);
    assert.deepEqual((await ids(ADMIN)).sort(), [a, b].sort());
    assert.deepEqual(await ids(MENTOR), [], 'mentors see users, not reports');
  });

  test("an agent can't create a report in someone else's name, or take one over", async () => {
    await rejects(
      as(pool, AGENT_A, (tx) => tx.query('insert into comp_report.reports (owner_email, title) values ($1, $2)', ['ben@casa-blanca.com', 'x'])),
      /row-level security/,
    );
    const mine = await newReport(pool, AGENT_A as Actor & { kind: 'user' });
    await rejects(
      as(pool, AGENT_A, (tx) => tx.query('update comp_report.reports set owner_email = $2 where id = $1', [mine, 'ben@casa-blanca.com'])),
      /row-level security/,
    );
    // …but an admin can reassign (a departing agent's reports, §12).
    const moved = await as(pool, ADMIN, (tx) =>
      tx.query('update comp_report.reports set owner_email = $2 where id = $1', [mine, 'ben@casa-blanca.com']));
    assert.equal(moved.rowCount, 1);
  });

  test("another agent's report can't be read, changed or deleted — it just isn't there", async () => {
    const a = await newReport(pool, AGENT_A as Actor & { kind: 'user' });
    const r = await as(pool, AGENT_B, async (tx) => ({
      read: (await tx.query('select 1 from comp_report.reports where id = $1', [a])).rowCount,
      update: (await tx.query("update comp_report.reports set title = 'mine now' where id = $1", [a])).rowCount,
    }));
    assert.deepEqual(r, { read: 0, update: 0 });
    await rejects(as(pool, AGENT_A, (tx) => tx.query('delete from comp_report.reports where id = $1', [a])), /permission denied/);
  });

  test('created_by and created_at come from the request, not the caller', async () => {
    const row = await as(pool, AGENT_A, async (tx) =>
      (await tx.query<{ created_by: string; updated_by: string; recent: boolean }>(
        `insert into comp_report.reports (owner_email, title, created_by, updated_by, created_at)
         values ($1, 't', 'someone-else', 'someone-else', '2001-01-01')
         returning created_by, updated_by, created_at > now() - interval '1 minute' as recent`,
        ['ana@casa-blanca.com'],
      )).rows[0]!);
    assert.deepEqual(row, { created_by: 'ana@casa-blanca.com', updated_by: 'ana@casa-blanca.com', recent: true });
    const system = await as(pool, SIGN_IN, async (tx) =>
      (await tx.query<{ created_by: string }>("select created_by from comp_report.users where email = 'ana@casa-blanca.com'")).rows[0]!);
    assert.equal(system.created_by, 'system:sign-in');
  });

  test('with no actor set, a request is nobody: it sees nothing and writes nothing', async () => {
    const client = await pool.connect();
    try {
      const seen = await client.query('select * from comp_report.reports');
      assert.equal(seen.rowCount, 0);
      await rejects(client.query("insert into comp_report.reports (owner_email, title) values ('ana@casa-blanca.com', 'x')"), /no actor|row-level security/);
    } finally {
      client.release();
    }
  });

  test('messages, reasons, observations and usage are append-only', async () => {
    const report = await newReport(pool, AGENT_A as Actor & { kind: 'user' });
    await as(pool, AGENT_A, (tx) => tx.query(
      `insert into comp_report.messages (report_id, seq, role, content) values ($1, 1, 'user', '[{"type":"text","text":"hi"}]')`,
      [report]));
    await as(pool, AGENT_A, (tx) => tx.query(
      `insert into comp_report.usage (user_email, report_id, provider, model, purpose) values ($1, $2, 'anthropic', 'claude-opus-5-5', 'assistant')`,
      ['ana@casa-blanca.com', report]));
    // Inside a request, the app role has no UPDATE or DELETE on history at all.
    await rejects(as(pool, ADMIN, (tx) => tx.query("update comp_report.messages set content = '[]' where report_id = $1", [report])), /permission denied/);
    await rejects(as(pool, ADMIN, (tx) => tx.query('delete from comp_report.usage where report_id = $1', [report])), /permission denied/);
    // The table owner outside a request is nobody: row-level security leaves it nothing to change.
    assert.equal((await pool.query("update comp_report.messages set content = '[]'")).rowCount, 0);
    // And a superuser, who bypasses row-level security, is stopped by the triggers.
    const su = new pg.Client({ connectionString: db.urlAs(new URL(process.env.CR_TEST_DATABASE_URL!).username) });
    await su.connect();
    try {
      for (const sql of [
        "update comp_report.messages set content = '[]'",
        'delete from comp_report.messages',
        "update comp_report.usage set model = 'x'",
        'delete from comp_report.usage',
        'truncate comp_report.messages',
        'truncate comp_report.usage',
        'truncate comp_report.reasons',
      ]) {
        await rejects(su.query(sql), /append-only/);
      }
    } finally {
      await su.end();
    }
  });

  test("a comp's tier changes only by recording a reason, and the latest reason wins", async () => {
    const report = await newReport(pool, AGENT_A as Actor & { kind: 'user' });
    const comp = await as(pool, AGENT_A, async (tx) => {
      const p = await tx.query<{ id: string }>(
        `insert into comp_report.properties (property_key, address, unit) values ('100-barclay-st|17l', '100 Barclay St', '17L') returning id`);
      const c = await tx.query<{ id: string }>(
        `insert into comp_report.report_comps (report_id, property_id, evidence_class) values ($1, $2, 'sold') returning id`,
        [report, p.rows[0]!.id]);
      return c.rows[0]!.id;
    });
    await rejects(as(pool, AGENT_A, (tx) => tx.query("update comp_report.report_comps set tier = 'primary' where id = $1", [comp])), /only by recording a reason/);
    await as(pool, AGENT_A, async (tx) => {
      await tx.query(`insert into comp_report.reasons (report_comp_id, report_id, tier, reason, reason_type, actor)
                      values ($1, $2, 'primary', 'Same building, same line', 'property', 'agent')`, [comp, report]);
      await tx.query(`insert into comp_report.reasons (report_comp_id, report_id, tier, reason, reason_type, actor)
                      values ($1, $2, 'excluded', 'Estate sale — not arm''s length', 'property', 'agent')`, [comp, report]);
    });
    const state = await as(pool, AGENT_A, async (tx) => ({
      tier: (await tx.query<{ tier: string }>('select tier from comp_report.report_comps where id = $1', [comp])).rows[0]!.tier,
      history: (await tx.query<{ tier: string }>('select tier from comp_report.reasons where report_comp_id = $1 order by id', [comp])).rows.map((r) => r.tier),
    }));
    assert.deepEqual(state, { tier: 'excluded', history: ['primary', 'excluded'] });
    // A reason against someone else's comp goes nowhere.
    await rejects(as(pool, AGENT_B, (tx) => tx.query(
      `insert into comp_report.reasons (report_comp_id, report_id, tier, reason, reason_type, actor)
       values ($1, $2, 'primary', 'x', 'method', 'agent')`, [comp, report])), /row-level security/);
    // A comp arrives untiered.
    await rejects(as(pool, AGENT_A, async (tx) => {
      const p = await tx.query<{ id: string }>(`insert into comp_report.properties (property_key, address) values ('x-st|', 'X St') returning id`);
      await tx.query(`insert into comp_report.report_comps (report_id, property_id, evidence_class, tier) values ($1, $2, 'sold', 'primary')`, [report, p.rows[0]!.id]);
    }), /arrives untiered/);
  });

  test("property identity is shared; what an agent's import saw is theirs (D-9)", async () => {
    const property = await as(pool, AGENT_A, async (tx) => {
      const p = await tx.query<{ id: string }>(
        `insert into comp_report.properties (property_key, address, unit) values ('25-n-moore-st|9c', '25 North Moore Street', '9C') returning id`);
      await tx.query(
        `insert into comp_report.property_observations (property_id, source, as_of, facts, links)
         values ($1, 'se_export', '2026-09-23', '{"price":{"value":4650000}}', '{https://streeteasy.com/building/25-north-moore/9c}')`,
        [p.rows[0]!.id]);
      return p.rows[0]!.id;
    });
    const seenBy = (actor: Actor) => as(pool, actor, async (tx) => ({
      property: (await tx.query('select 1 from comp_report.properties where id = $1', [property])).rowCount,
      observations: (await tx.query('select 1 from comp_report.property_observations where property_id = $1', [property])).rowCount,
    }));
    assert.deepEqual(await seenBy(AGENT_A), { property: 1, observations: 1 });
    assert.deepEqual(await seenBy(AGENT_B), { property: 1, observations: 0 });
    assert.deepEqual(await seenBy(ADMIN), { property: 1, observations: 1 });
    await rejects(as(pool, AGENT_A, (tx) => tx.query("update comp_report.properties set unit = '9D' where id = $1", [property])), /append-only|permission denied/);
  });

  test('users, allowlist and usage are scoped by role', async () => {
    const users = (actor: Actor) =>
      as(pool, actor, async (tx) => (await tx.query('select email from comp_report.users')).rowCount);
    assert.equal(await users(AGENT_A), 1, 'an agent sees their own row');
    assert.equal(await users(MENTOR), 4, 'mentors see everyone');
    assert.equal(await users(ADMIN), 4);
    // Only admins change a user.
    const byAgent = await as(pool, AGENT_A, (tx) => tx.query("update comp_report.users set role = 'admin' where email = 'ana@casa-blanca.com'"));
    assert.equal(byAgent.rowCount, 0);
    await as(pool, ADMIN, (tx) => tx.query("update comp_report.users set capability = 'practice' where email = 'ben@casa-blanca.com'"));
    // The allowlist is the admins' (and the sign-in check's).
    await rejects(as(pool, AGENT_A, (tx) => tx.query("insert into comp_report.allowlist (email) values ('friend@gmail.com')")), /row-level security/);
    await as(pool, ADMIN, (tx) => tx.query("insert into comp_report.allowlist (email, note) values ('lawyer@firm.com', 'Casa counsel')"));
    const readable = (actor: Actor) => as(pool, actor, async (tx) => (await tx.query('select 1 from comp_report.allowlist')).rowCount);
    assert.equal(await readable(AGENT_A), 0);
    assert.equal(await readable(SIGN_IN), 1);
    // Usage: your own calls only; admins see spend.
    await rejects(as(pool, AGENT_A, (tx) => tx.query(
      "insert into comp_report.usage (user_email, provider, model, purpose) values ('ben@casa-blanca.com', 'anthropic', 'm', 'x')")), /row-level security/);
  });
});

describe('comp_report schema — owner cannot create roles', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;

  before(async () => {
    db = await createTestDatabase({ ownerCanCreateRoles: false });
    pool = new pg.Pool({ connectionString: db.ownerUrl, max: 2 });
    await provision(pool, AGENT_A, AGENT_B);
  });
  after(async () => {
    await pool.end();
    await db.drop();
  });

  test('requests stay the table owner, and FORCE ROW LEVEL SECURITY still scopes them', async () => {
    const who = await as(pool, AGENT_A, async (tx) => (await tx.query<{ u: string }>('select current_user as u')).rows[0]!.u);
    assert.equal(who, db.owner);
    const a = await newReport(pool, AGENT_A as Actor & { kind: 'user' });
    const seenByB = await as(pool, AGENT_B, async (tx) => (await tx.query('select 1 from comp_report.reports where id = $1', [a])).rowCount);
    assert.equal(seenByB, 0);
  });
});

describe('withActor refuses unsafe databases', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;

  before(async () => {
    db = await createTestDatabase({ ownerCanCreateRoles: true });
  });
  after(async () => {
    await db.drop();
  });

  test('a connection role with BYPASSRLS is refused', async () => {
    await db.admin.query(`do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'cr_test_bypass') then
          create role cr_test_bypass login bypassrls;
        end if;
      end $$`);
    const owner = new pg.Client({ connectionString: db.ownerUrl });
    await owner.connect();
    await owner.query('grant usage on schema comp_report to cr_test_bypass');
    await owner.end();
    const pool = new pg.Pool({ connectionString: db.urlAs('cr_test_bypass'), max: 1 });
    try {
      await assert.rejects(as(pool, AGENT_A, async () => 1), (e) => e instanceof DatabaseUnavailable && e.reason === 'unsafe_role');
    } finally {
      await pool.end();
    }
  });

  test("a database without the comp_report schema is refused (e.g. someone else's)", async () => {
    const bare = await createTestDatabase({ migrate: false });
    const pool = new pg.Pool({ connectionString: bare.ownerUrl, max: 1 });
    try {
      await assert.rejects(as(pool, AGENT_A, async () => 1), (e) => e instanceof DatabaseUnavailable && e.reason === 'not_migrated');
    } finally {
      await pool.end();
      await bare.drop();
    }
  });
});
