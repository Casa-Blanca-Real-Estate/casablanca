// Dispatch 23 item 3 (CR-7f): the inspection API. Redaction by allowlist, the
// key, the audit and its caps, and an inspect actor that can only read.
//   CR_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:comp-report
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { handleHealth } from '../server/api/health.ts';
import { handleInspect, INSPECT_KEY_HEADER, type InspectDeps } from '../server/api/inspect.ts';
import { INSPECT_READER, loadWorkspace, reportFor } from '../server/api/workspace.ts';
import { withActor, type PoolClientLike, type PoolLike, type Queryable } from '../server/db.ts';
import { AUDIT_ACTOR, writeAudit } from '../server/inspect/audit.ts';
import { COLUMNS, EMAIL_KEY, emailHasher, readView, redact, VIEW_SPECS, type Spec } from '../server/inspect/views.ts';
import { buildFixture, leaks, MARK, NEVER, OWNER, PASSES, type Fixture } from './inspect-fixture.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const KEY = 'k'.repeat(24) + '-inspect-key-for-tests';
const OTHER_KEY = 'o'.repeat(40);
const ENV = { CR_INSPECT_KEY: KEY };

/** Records every statement, and optionally fails the ones that match. */
function spied(pool: PoolLike, log: string[], fail?: RegExp): PoolLike {
  return {
    async connect(): Promise<PoolClientLike> {
      const c = await pool.connect();
      return {
        query: ((text: string, params?: unknown[]) => {
          log.push(text);
          return fail?.test(text) ? Promise.reject(new Error('injected failure')) : c.query(text, params);
        }) as PoolClientLike['query'],
        release: (e?: Error | boolean) => c.release(e),
      };
    },
  };
}

/** Captures console.log and console.error while fn runs. */
async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const { log, error } = console;
  console.log = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = log;
    console.error = error;
  }
}

function suite(label: string, ownerCanCreateRoles: boolean) {
  describe(`the inspection API (Dispatch 23 item 3), ${label}`, { skip: skipWithoutDatabase }, () => {
    let db: TestDatabase;
    let pool: pg.Pool;
    let su: pg.Client;
    let fx: Fixture;
    const fetchImpl = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
    const deps = (over: Partial<InspectDeps> = {}): InspectDeps => ({
      pool: pool as unknown as PoolLike, identityUrl: 'https://site.example/.netlify/identity', fetchImpl, env: ENV, ...over,
    });
    const call = (query: string, opts: { key?: string | null; method?: string; d?: Partial<InspectDeps> } = {}) => handleInspect(
      new Request(`https://site.example/api/comp-report/inspect?${query}`, {
        method: opts.method ?? 'GET',
        headers: opts.key === null ? {} : { [INSPECT_KEY_HEADER]: opts.key ?? KEY },
      }),
      deps(opts.d),
    );
    const audits = async () => (await su.query("select * from comp_report.access_events where kind like 'inspect%' order by id")).rows;

    before(async () => {
      db = await createTestDatabase({ ownerCanCreateRoles });
      pool = testPool(db.ownerUrl, 8);
      su = new pg.Client({ connectionString: db.urlAs(new URL(process.env.CR_TEST_DATABASE_URL!).username || 'postgres') });
      await su.connect();
      fx = await buildFixture(pool as unknown as PoolLike);
    });
    after(async () => {
      await su?.end();
      await pool?.end();
      await db?.drop();
    });

    test('no sentinel, unique number or address leaves any default view', async () => {
      for (const q of ['view=reports', `view=workspace&report=${fx.reportId}`, `view=comps&report=${fx.reportId}`,
        `view=messages&report=${fx.reportId}`, 'view=usage', 'view=access', 'view=activity', `view=activity&report=${fx.reportId}`]) {
        const res = await call(q);
        const body = await res.text();
        assert.equal(res.status, 200, `${q}: ${body}`);
        assert.deepEqual(leaks(body), [], q);
      }
    });

    test('comp facts that are numbers or dates pass; the rest is redacted', async () => {
      const body = await (await call(`view=comps&report=${fx.reportId}`)).json() as { comps: Record<string, any>[] };
      const facts = body.comps[0]!.observation.facts;
      assert.equal(facts.sale_price.value, PASSES.salePrice);
      assert.equal(facts.area_sqft.value, PASSES.areaSqft);
      assert.equal(facts.status_date.value, PASSES.statusDate);
      assert.equal(facts.sale_price.source, 'se_export');
      assert.equal(facts.coordinates.value.lat, '[redacted]');
      assert.ok([1300000, 1300001, 1300002].includes(body.comps[0]!.fact_overrides.price.value));
      assert.equal(body.comps[0]!.tier, 'primary');
      assert.equal(body.comps[0]!.evidence_class, 'sold');
      const ws = await (await call(`view=workspace&report=${fx.reportId}`)).json() as { workspace: Record<string, any> };
      assert.equal(ws.workspace.comps[0].facts.sale_price.value, PASSES.salePrice);
      assert.equal(ws.workspace.state.reached, 'send');
      assert.equal(ws.workspace.state.dealTerms.template, 'buyer_traditional');
      assert.equal(ws.workspace.state.dealTerms.price.value, '[redacted]');
      assert.equal(ws.workspace.geocodes[0].status, 'matched');
      assert.equal(ws.workspace.geocodes[0].lat, '[redacted]');
      assert.equal(ws.workspace.imports[0].contentBase64, undefined);
      const list = await (await call('view=reports')).json() as { reports: Record<string, unknown>[] };
      assert.equal(list.reports[0]!.stage, 'sent');
      assert.equal(list.reports[0]!.comps, 3);
      assert.equal(list.reports[0]!.messages, 3);
      assert.equal(list.reports[0]!.title, '[redacted]');
    });

    test('addresses come out as a stable 8-character hash, the same with text=1, and differ under another key', async () => {
      const hash = emailHasher(KEY)(OWNER.email);
      assert.match(hash, /^[0-9a-f]{8}$/);
      assert.equal(emailHasher(KEY)(OWNER.email), hash);
      assert.notEqual(emailHasher(OTHER_KEY)(OWNER.email), hash);
      const ws = await (await call(`view=workspace&report=${fx.reportId}`)).json() as { workspace: Record<string, any> };
      assert.equal(ws.workspace.report.ownerEmail, hash);
      const text = await (await call(`view=workspace&report=${fx.reportId}&text=1`)).json() as { workspace: Record<string, any> };
      assert.equal(text.workspace.report.ownerEmail, hash);
      assert.equal(text.workspace.comps[0].factOverrides.price.by, hash);
      const comps = await (await call(`view=comps&report=${fx.reportId}&text=1`)).json() as { comps: Record<string, any>[] };
      assert.equal(comps.comps[0]!.created_by, hash);
      const access = await (await call('view=access')).json() as { rows: Record<string, unknown>[] };
      assert.ok(access.rows.some((r) => r.by_email === hash));
      assert.ok(access.rows.every((r) => !('dedupe_key' in r)));
      const activity = await (await call('view=activity')).json() as { rows: Record<string, any>[] };
      assert.equal(activity.rows[0]!.user_email, hash);
      assert.equal(activity.rows[0]!.detail.by, emailHasher(KEY)('agent'));
      const usage = await (await call('view=usage')).json() as { totals: Record<string, unknown>[]; rows: Record<string, unknown>[] };
      assert.equal(usage.totals[0]!.user_email, hash);
      assert.equal(usage.rows[0]!.purpose, 'assistant');
      assert.equal(usage.rows[0]!.model, 'claude-opus-4-8');
      assert.ok(!JSON.stringify(text).includes(OWNER.email));
    });

    test('text=1 returns the text fields as stored, never the never fields', async () => {
      for (const view of ['workspace', 'comps', 'messages']) {
        const body = await (await call(`view=${view}&report=${fx.reportId}&text=1`)).text();
        assert.ok(body.includes(MARK), view);
        assert.ok(!body.includes(NEVER), view);
        assert.ok(!body.includes(OWNER.email), view);
      }
      const ws = await (await call(`view=workspace&report=${fx.reportId}&text=1`)).text();
      for (const n of ['987650011', '987650013', '987650015', '987650017', '40.98765021']) assert.ok(ws.includes(n), n);
    });

    test('every column of every table, and every key in the fixture, is classified; addresses are hashed', async () => {
      const { rows } = await su.query<{ table_name: string; column_name: string }>(
        "select table_name, column_name from information_schema.columns where table_schema = 'comp_report' order by 1, 2");
      const missing = rows.filter((r) => !COLUMNS[r.table_name]?.[r.column_name]).map((r) => `${r.table_name}.${r.column_name}`);
      assert.deepEqual(missing, []);
      const stale = Object.entries(COLUMNS).flatMap(([t, cols]) => Object.keys(cols).filter((c) => !rows.some((r) => r.table_name === t && r.column_name === c)).map((c) => `${t}.${c}`));
      assert.deepEqual(stale, []);

      const unhashed: string[] = [];
      const walk = (spec: Spec, path: string) => {
        if (typeof spec === 'string' || 'enum' in spec || 'match' in spec) return;
        if ('arr' in spec) return walk(spec.arr, `${path}[]`);
        if ('map' in spec) return walk(spec.map, `${path}{}`);
        for (const [k, child] of Object.entries(spec.obj)) {
          if (EMAIL_KEY.test(k) && child !== 'email' && child !== 'never') unhashed.push(`${path}.${k}`);
          walk(child, `${path}.${k}`);
        }
      };
      for (const [t, cols] of Object.entries(COLUMNS)) walk({ obj: cols }, t);
      for (const [v, spec] of Object.entries(VIEW_SPECS)) walk(spec, v);
      assert.deepEqual(unhashed, []);

      const dropped: string[] = [];
      for (const view of ['reports', 'workspace', 'comps', 'messages', 'usage', 'access', 'activity'] as const) {
        const raw = await withActor(pool as unknown as PoolLike, { kind: 'inspect' }, (tx) => readView(tx, view, { reportId: fx.reportId, days: 7 }));
        redact(VIEW_SPECS[view], raw, { text: false, hash: emailHasher(KEY), dropped });
      }
      assert.deepEqual(dropped, []);
    });

    test('the inspect reader never selects imports.content or link_reads.extract, and nothing reads narratives', async () => {
      const log: string[] = [];
      const spy = spied(pool as unknown as PoolLike, log);
      for (const view of ['reports', 'workspace', 'comps', 'messages', 'usage', 'access', 'activity'] as const) {
        await withActor(spy, { kind: 'inspect' }, (tx) => readView(tx, view, { reportId: fx.reportId, days: 7 }));
      }
      assert.ok(log.length > 10);
      for (const q of log) {
        assert.ok(!/narratives/.test(q), q);
        if (/comp_report\.imports\b/.test(q) && !/count\(\*\)/.test(q)) assert.ok(!/\bcontent\b/.test(q), q);
        if (/comp_report\.link_reads\b/.test(q) && !/count\(\*\)/.test(q)) assert.ok(!/then extract|,\s*extract\b|select extract/.test(q), q);
      }
      // The loaded workspace carries no file and no page extract either.
      const ws = await withActor(pool as unknown as PoolLike, { kind: 'inspect' }, (tx) => loadWorkspace(tx, INSPECT_READER, fx.reportId));
      assert.equal(ws.imports[0]!.contentBase64, '');
      assert.equal(ws.reads[0]!.extract, null);
    });

    test('text=1 is a 400 on the list views and without a report', async () => {
      for (const q of ['view=reports&text=1', 'view=usage&text=1', 'view=access&text=1', 'view=activity&text=1', 'view=workspace&text=1',
        'view=health&text=1', `view=workspace&report=${fx.reportId}&text=yes`]) {
        assert.equal((await call(q)).status, 400, q);
      }
      for (const q of ['view=sql', 'view=narratives', 'view=workspace', 'view=workspace&report=not-a-uuid', `view=reports&report=${fx.reportId}`, 'view=usage&days=0', 'view=usage&days=91']) {
        assert.equal((await call(q)).status, 400, q);
      }
      assert.equal((await call('view=workspace&report=00000000-0000-4000-8000-000000000000')).status, 404);
      assert.equal((await call('view=workspace&report=00000000-0000-4000-8000-000000000000&text=1')).status, 404);
    });

    test('every call that returns data writes its audit row first; health writes none', async () => {
      const before = (await audits()).length;
      await call(`view=comps&report=${fx.reportId}`);
      await call(`view=messages&report=${fx.reportId}&text=1`);
      await call('view=health');
      const rows = (await audits()).slice(before);
      assert.equal(rows.length, 2);
      assert.equal(rows[0]!.kind, 'inspect');
      assert.equal(rows[0]!.view, 'comps');
      assert.equal(rows[0]!.report_id, fx.reportId);
      assert.equal(rows[0]!.text_flag, false);
      assert.equal(rows[0]!.source, 'server');
      assert.equal(rows[0]!.created_by, 'system:inspect-audit');
      assert.equal(rows[0]!.email, null);
      assert.equal(rows[1]!.kind, 'inspect_text');
      assert.equal(rows[1]!.text_flag, true);
      assert.equal(rows[1]!.view, 'messages');
    });

    test('when the audit row can\'t be written: text=1 is a 503 with nothing in it; the redacted views go on', async () => {
      const broken = spied(pool as unknown as PoolLike, [], /insert into comp_report\.access_events/);
      const { result: res, lines } = await captureLogs(() => call(`view=workspace&report=${fx.reportId}&text=1`, { d: { pool: broken } }));
      assert.equal(res.status, 503);
      const body = await res.text();
      assert.ok(!body.includes(MARK));
      assert.ok(lines.some((l) => l.includes('audit_failed')));
      const redacted = await captureLogs(() => call(`view=workspace&report=${fx.reportId}`, { d: { pool: broken } }));
      assert.equal(redacted.result.status, 200);
    });

    test('inspect-audit runs only its lock, its count and its insert', async () => {
      const log: string[] = [];
      await writeAudit(spied(pool as unknown as PoolLike, log), { view: 'messages', reportId: fx.reportId, text: true });
      const own = log.filter((q) => !/^(begin|commit|rollback)$/.test(q) && !/comp_report\.enter\(|to_regprocedure/.test(q));
      assert.equal(own.length, 3);
      assert.match(own[0]!, /pg_advisory_xact_lock/);
      assert.match(own[1]!, /count\(\*\)[\s\S]*inspect_text/);
      assert.match(own[2]!, /insert into comp_report\.access_events/);
    });

    test('inspect-audit writes only its own kinds, with no address, from the server; it reads only text=1 rows', async () => {
      const as = (sql: string, params: unknown[] = []) => withActor(pool as unknown as PoolLike, AUDIT_ACTOR, (tx) => tx.query(sql, params));
      const refused = async (sql: string, params: unknown[] = []) => {
        await assert.rejects(as(sql, params), (e: { code?: string }) => e.code === '42501' || e.code === '23514');
      };
      await refused(`insert into comp_report.access_events (kind, source, email) values ('session_start', 'server', $1)`, [OWNER.email]);
      await refused(`insert into comp_report.access_events (kind, source, view, text_flag) values ('gate', 'gate', 'reports', false)`);
      await refused(`insert into comp_report.access_events (kind, source, view, text_flag, by_email) values ('inspect', 'server', 'reports', false, $1)`, [OWNER.email]);
      await refused(`insert into comp_report.access_events (kind, source, view, text_flag, owner_email) values ('inspect', 'server', 'reports', false, $1)`, [OWNER.email]);
      await refused(`insert into comp_report.access_events (kind, source, view, text_flag, domain) values ('inspect', 'server', 'reports', false, 'example.org')`);
      const seen = (await as('select distinct kind from comp_report.access_events')).rows.map((r) => r.kind);
      assert.deepEqual(seen, ['inspect_text']);
      // Another system actor can't write the inspect kinds: 22b's policy admits no inspect row with an email…
      // …and the inspect-audit name is refused there by name.
      await assert.rejects(withActor(pool as unknown as PoolLike, { kind: 'system', does: 'access-log' }, (tx) =>
        tx.query(`insert into comp_report.access_events (kind, source, email) values ('inspect', 'server', null)`)));
    });

    test('text=1 caps: the 21st call in an hour is a 429 and writes no row; two racing for the last place, one wins', async () => {
      await su.query('set session_replication_role = replica');
      await su.query("delete from comp_report.access_events where kind = 'inspect_text'");
      await su.query('set session_replication_role = origin');
      for (let i = 0; i < 19; i++) assert.equal(await writeAudit(pool as unknown as PoolLike, { view: 'comps', reportId: fx.reportId, text: true }), 'written');
      const [a, b] = await Promise.all([
        call(`view=comps&report=${fx.reportId}&text=1`),
        call(`view=messages&report=${fx.reportId}&text=1`),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [200, 429]);
      const count = async () => Number((await su.query("select count(*) from comp_report.access_events where kind = 'inspect_text'")).rows[0].count);
      assert.equal(await count(), 20);
      assert.equal((await call(`view=comps&report=${fx.reportId}&text=1`)).status, 429);
      assert.equal(await count(), 20);
      // The redacted views aren't capped.
      assert.equal((await call(`view=comps&report=${fx.reportId}`)).status, 200);

      // A day's cap: 100 in the last 24 hours, older than the hour.
      await su.query('set session_replication_role = replica');
      await su.query("delete from comp_report.access_events where kind = 'inspect_text'");
      await su.query(`insert into comp_report.access_events (at, kind, source, view, text_flag, created_by)
                      select now() - interval '2 hours', 'inspect_text', 'server', 'comps', true, 'system:inspect-audit' from generate_series(1, 100)`);
      await su.query('set session_replication_role = origin');
      assert.equal((await call(`view=comps&report=${fx.reportId}&text=1`)).status, 429);
      await su.query('set session_replication_role = replica');
      await su.query("delete from comp_report.access_events where kind = 'inspect_text'");
      await su.query('set session_replication_role = origin');
    });

    test('the key: unset, short, missing, empty and wrong are each 401, logged without the value, and write no row', async () => {
      const before = (await audits()).length;
      const wrong = 'w'.repeat(48);
      const cases: [string, Partial<InspectDeps>, string | null][] = [
        ['unset', { env: {} }, KEY],
        ['short', { env: { CR_INSPECT_KEY: 'short-key' } }, 'short-key'],
        ['missing', {}, null],
        ['empty', {}, ''],
        ['wrong', {}, wrong],
      ];
      for (const [label, d, key] of cases) {
        const { result: res, lines } = await captureLogs(() => call(`view=workspace&report=${fx.reportId}`, { key, d }));
        assert.equal(res.status, 401, label);
        assert.ok(lines.some((l) => l.includes('"refused"')), label);
        if (key) assert.ok(lines.every((l) => !l.includes(key)), label);
      }
      assert.equal((await audits()).length, before);
    });

    test('methods: a view on POST and copy-to-test on GET are 405 with a good key, 401 with a bad one', async () => {
      assert.equal((await call(`view=workspace&report=${fx.reportId}`, { method: 'POST' })).status, 405);
      assert.equal((await call(`view=workspace&report=${fx.reportId}`, { method: 'POST', key: OTHER_KEY })).status, 401);
      assert.equal((await call(`view=copy-to-test&report=${fx.reportId}`)).status, 405);
      assert.equal((await call(`view=copy-to-test&report=${fx.reportId}`, { key: OTHER_KEY })).status, 401);
      assert.equal((await call('view=reports', { method: 'DELETE' })).status, 405);
    });

    test('health returns exactly what /health returns', async () => {
      const mine = await (await call('view=health')).json();
      const theirs = await (await handleHealth(new Request('https://site.example/api/comp-report/health'), {
        pool: pool as unknown as PoolLike, identityUrl: 'https://site.example/.netlify/identity', fetchImpl,
      })).json();
      assert.deepEqual(mine, theirs);
      assert.deepEqual(Object.keys(mine as object).sort(), ['assistant', 'database', 'identity']);
    });

    test('a key set equal to another session key: 503 for the right key, 401 for a wrong one', async () => {
      for (const other of ['CR_TEST_KEY', 'CR_DECIDE_KEY']) {
        const env = { CR_INSPECT_KEY: KEY, [other]: KEY };
        const { result } = await captureLogs(() => call('view=reports', { d: { env } }));
        assert.equal(result.status, 503, other);
        assert.equal((await call('view=reports', { d: { env }, key: OTHER_KEY })).status, 401, other);
      }
      // A short duplicate doesn't count as a key.
      assert.equal((await call('view=reports', { d: { env: { CR_INSPECT_KEY: KEY, CR_TEST_KEY: KEY.slice(0, 20) } } })).status, 200);
    });

    test('the inspect actor can\'t insert, update or delete anywhere', async () => {
      const { rows: tables } = await su.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'comp_report' and table_type = 'BASE TABLE' order by 1");
      const valid: Record<string, string> = {
        reports: `insert into comp_report.reports (owner_email, title) values ('${OWNER.email}', 'x')`,
        report_comps: `insert into comp_report.report_comps (report_id, property_id, evidence_class) select '${fx.reportId}', property_id, 'sold' from comp_report.report_comps limit 1`,
        reasons: `insert into comp_report.reasons (report_comp_id, report_id, tier, reason, reason_type, actor) values ('${fx.compIds[0]}', '${fx.reportId}', 'primary', 'x', 'property', 'agent')`,
        messages: `insert into comp_report.messages (report_id, seq, role, content) values ('${fx.reportId}', 99, 'user', '[]')`,
        usage: `insert into comp_report.usage (user_email, provider, model, purpose) values ('${OWNER.email}', 'anthropic', 'm', 'assistant')`,
        users: `insert into comp_report.users (email) values ('new@casa-blanca.com')`,
        allowlist: `insert into comp_report.allowlist (email) values ('new@firm.com')`,
        properties: `insert into comp_report.properties (property_key, address) values ('pk-new', 'x')`,
        access_events: `insert into comp_report.access_events (kind, source, view, text_flag) values ('inspect', 'server', 'reports', false)`,
        activity: `insert into comp_report.activity (user_email, kind, name) values ('${OWNER.email}', 'screen', 'screen.sort')`,
      };
      const settable = (t: string) => Object.keys(COLUMNS[t]!).find((c) => c !== 'id' && c !== 'seq')!;
      for (const { table_name: t } of tables) {
        const statements = [
          valid[t] ?? `insert into comp_report.${t} default values`,
          `update comp_report.${t} set ${settable(t)} = ${settable(t)}`,
          `delete from comp_report.${t}`,
        ];
        for (const sql of statements) {
          const counted = async () => Number((await su.query(`select count(*) from comp_report.${t}`)).rows[0].count);
          const before = await counted();
          // Through withActor: the transaction is read only.
          await assert.rejects(withActor(pool as unknown as PoolLike, { kind: 'inspect' }, (tx) => tx.query(sql)),
            (e: { code?: string }) => e.code === '25006', `${t}: ${sql}`);
          // In a plain transaction as the inspect actor: refused by privilege where the role exists,
          // and by row-level security (nothing changed) where it doesn't.
          const c = new pg.Client({ connectionString: db.ownerUrl });
          await c.connect();
          try {
            await c.query('begin');
            await c.query("select comp_report.enter('inspect', null, null, null)");
            let code: string | undefined;
            let changed = 0;
            try {
              changed = (await c.query(sql)).rowCount ?? 0;
            } catch (e) {
              code = (e as { code?: string }).code;
            }
            await c.query('rollback');
            if (ownerCanCreateRoles) assert.equal(code, '42501', `${t}: ${sql}`);
            else {
              assert.ok(code === undefined ? changed === 0 : ['42501', 'P0001', '23502', '23503', '23514'].includes(code), `${t}: ${sql} → ${code}`);
              if (/^insert/.test(sql) && code === undefined) assert.fail(`${t}: an insert went through`);
            }
          } finally {
            await c.end();
          }
          assert.equal(await counted(), before, `${t}: ${sql}`);
        }
      }
    });

    test('no write policy, and no function one calls, admits the inspect kind; nor does any policy on the closed tables', async () => {
      const { rows } = await su.query<{ tablename: string; policyname: string; cmd: string; qual: string | null; with_check: string | null }>(
        "select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'comp_report'");
      const inspectKind = /actor_kind\(\)\s*=\s*'inspect'/;
      const closed = ['users', 'allowlist', 'decide_requests', 'decide_runtime', 'judgments', 'decide_probes', 'signin_error_buckets', 'signin_salt', 'narratives', 'mentees'];
      const fns = new Set<string>();
      for (const p of rows) {
        const text = `${p.qual ?? ''} ${p.with_check ?? ''}`;
        if (p.cmd !== 'SELECT') {
          assert.ok(!inspectKind.test(text), `${p.tablename}.${p.policyname}`);
          for (const m of text.matchAll(/comp_report\.([a-z_]+)\(/g)) fns.add(m[1]!);
        }
        if (closed.includes(p.tablename)) assert.ok(!/inspect/.test(text), `${p.tablename}.${p.policyname}`);
      }
      assert.ok(fns.has('can_read_report') && fns.has('can_edit_report'));
      for (const f of fns) {
        const { rows: defs } = await su.query<{ def: string }>(
          "select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'comp_report' and p.proname = $1", [f]);
        for (const d of defs) assert.ok(!/inspect/.test(d.def), f);
      }
    });

    test(ownerCanCreateRoles ? 'the inspect role holds no grant on imports.content or link_reads.extract' : 'without roles, the views work through the policies alone', async () => {
      const { rows } = await su.query<{ ok: boolean }>("select exists (select 1 from pg_roles where rolname = 'comp_report_inspect') as ok");
      if (ownerCanCreateRoles) {
        assert.ok(rows[0]!.ok);
        const priv = async (table: string, column: string) => (await su.query<{ ok: boolean }>(
          `select has_column_privilege('comp_report_inspect', 'comp_report.${table}', '${column}', 'select') as ok`)).rows[0]!.ok;
        assert.equal(await priv('imports', 'content'), false);
        assert.equal(await priv('imports', 'filename'), true);
        assert.equal(await priv('link_reads', 'extract'), false);
        assert.equal(await priv('link_reads', 'url'), true);
        const { rows: who } = await su.query<{ ok: boolean }>("select has_table_privilege('comp_report_inspect', 'comp_report.users', 'select') as ok");
        assert.equal(who[0]!.ok, false);
        const role = await withActor(pool as unknown as PoolLike, { kind: 'inspect' }, async (tx) => (await tx.query<{ r: string }>('select current_user as r')).rows[0]!.r);
        assert.equal(role, 'comp_report_inspect');
      }
      assert.equal((await call(`view=workspace&report=${fx.reportId}`)).status, 200);
      assert.equal((await call(`view=comps&report=${fx.reportId}&text=1`)).status, 200);
    });

    test('reportFor with the inspect reader reads any report, and only reads', async () => {
      const found = await withActor(pool as unknown as PoolLike, { kind: 'inspect' }, (tx: Queryable) => reportFor(tx, INSPECT_READER, fx.reportId, false));
      assert.equal(found.id, fx.reportId);
      // @ts-expect-error the inspect reader can't ask for a report to write
      const typeCheck = (tx: Queryable) => reportFor(tx, INSPECT_READER, fx.reportId, true);
      void typeCheck;
    });
  });
}

suite('with the select-only role', true);
suite('on a database that can\'t create roles', false);
