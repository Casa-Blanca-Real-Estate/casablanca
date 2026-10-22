// The API end to end against a real PostgreSQL: sign-in provisioning, roles,
// and the definition of done's first line — a signed-in agent creates a
// report that persists, and nobody else can see it.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleMe } from '../server/api/me.ts';
import { handleReports } from '../server/api/reports.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import { handleIdentityEvent } from '../server/identity-events.ts';
import type { IdentityUser } from '../server/identity.ts';
import type { AuthDeps } from '../server/session.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, Partial<IdentityUser>> = {
  'tok-ana-000000000': { email: 'ana@casa-blanca.com', name: 'Ana Agent' },
  'tok-ben-000000000': { email: 'ben@casa-blanca.com' },
  'tok-kimani-000000': { email: 'kimani@casa-blanca.com' },
  'tok-counsel-00000': { email: 'counsel@firm.com' },
  'tok-gmail-0000000': { email: 'someone@gmail.com' },
};

describe('comp report API', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let deps: AuthDeps;

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    deps = {
      verifier: {
        async verify(token: string) {
          const p = PEOPLE[token];
          return p ? ({ id: `id-${token}`, confirmed: true, provider: 'google', name: null, ...p } as IdentityUser) : null;
        },
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com' }),
      pool: pool as unknown as PoolLike,
    };
  });
  after(async () => {
    await pool.end();
    await db?.drop();
  });

  const req = (token: string, method = 'GET', body?: unknown, query = '') =>
    new Request(`https://site/api/comp-report/reports${query}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  test('signing in provisions the user, keyed by email, with the role the rule gives', async () => {
    const res = await handleMe(new Request('https://site/api/comp-report/me', { headers: { authorization: 'Bearer tok-ana-000000000' } }), deps);
    assert.equal(res.status, 200);
    const { user, database } = await res.json();
    assert.deepEqual(
      { email: user.email, role: user.role, capability: user.capability, persisted: user.persisted, name: user.name },
      { email: 'ana@casa-blanca.com', role: 'agent', capability: 'full', persisted: true, name: 'Ana Agent' },
    );
    assert.equal(database, 'ready');
    const admin = await (await handleMe(new Request('https://site/x', { headers: { authorization: 'Bearer tok-kimani-000000' } }), deps)).json();
    assert.equal(admin.user.role, 'admin');
  });

  test("a new user's first requests can arrive together without failing", async () => {
    PEOPLE['tok-new-000000000'] = { email: 'new.agent@casa-blanca.com' };
    const statuses = await Promise.all(Array.from({ length: 6 }, () =>
      handleMe(new Request('https://site/x', { headers: { authorization: 'Bearer tok-new-000000000' } }), deps).then((r) => r.status)));
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200]);
  });

  test('a signed-in agent creates a report, and it persists', async () => {
    const created = await handleReports(req('tok-ana-000000000', 'POST', { title: '25 North Moore Street, #9C' }), deps);
    assert.equal(created.status, 201);
    const { report } = await created.json();
    assert.equal(report.title, '25 North Moore Street, #9C');
    assert.equal(report.ownerEmail, 'ana@casa-blanca.com');

    // A fresh connection pool — nothing cached in the process — still has it.
    const fresh = testPool(db.ownerUrl, 1);
    try {
      const listed = await (await handleReports(req('tok-ana-000000000'), { ...deps, pool: fresh as unknown as PoolLike })).json();
      assert.deepEqual(listed.reports.map((r: { id: string }) => r.id), [report.id]);
    } finally {
      await fresh.end();
    }

    // Ben can't list it or fetch it; the admin can fetch it.
    const bens = await (await handleReports(req('tok-ben-000000000'), deps)).json();
    assert.deepEqual(bens.reports, []);
    assert.equal((await handleReports(req('tok-ben-000000000', 'GET', undefined, `?id=${report.id}`), deps)).status, 404);
    assert.equal((await handleReports(req('tok-kimani-000000', 'GET', undefined, `?id=${report.id}`), deps)).status, 200);
  });

  test('the owner archives and restores a report; only a sample report can be deleted, and then it is gone', async () => {
    const make = async (title: string) => (await (await handleReports(req('tok-ana-000000000', 'POST', { title }), deps)).json()).report;
    const patch = (token: string, body: unknown) => handleReports(req(token, 'PATCH', body), deps);
    const list = async (query = '') => (await (await handleReports(req('tok-ana-000000000', 'GET', undefined, query), deps)).json()).reports.map((r: { id: string }) => r.id);
    const real = await make('1 Real Street');

    // Someone else, or an admin reading it, can't touch it.
    assert.equal((await patch('tok-ben-000000000', { id: real.id, action: 'archive' })).status, 404);
    assert.equal((await patch('tok-kimani-000000', { id: real.id, action: 'archive' })).status, 404);

    assert.equal((await patch('tok-ana-000000000', { id: real.id, action: 'archive' })).status, 200);
    assert.ok(!(await list()).includes(real.id));
    assert.ok((await list('?archived=1')).includes(real.id));
    assert.equal((await patch('tok-ana-000000000', { id: real.id, action: 'archive' })).status, 409);
    assert.equal((await patch('tok-ana-000000000', { id: real.id, action: 'delete' })).status, 409, 'a real report is only archived');
    assert.equal((await patch('tok-ana-000000000', { id: real.id, action: 'restore' })).status, 200);
    assert.ok((await list()).includes(real.id));

    const sample = await make('100 Barclay Street #17L');
    await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'ana@casa-blanca.com', role: 'agent' }, (tx) => tx.query('update comp_report.reports set sample_data = true where id = $1', [sample.id]));
    const deleted = await patch('tok-ana-000000000', { id: sample.id, action: 'delete' });
    assert.equal(deleted.status, 200);
    assert.equal((await deleted.json()).report.status, 'deleted');
    assert.ok(!(await list()).includes(sample.id));
    assert.ok(!(await list('?archived=1')).includes(sample.id));
    assert.equal((await handleReports(req('tok-ana-000000000', 'GET', undefined, `?id=${sample.id}`), deps)).status, 404);
    assert.equal((await handleReports(req('tok-kimani-000000', 'GET', undefined, `?id=${sample.id}`), deps)).status, 404);
    assert.equal((await patch('tok-ana-000000000', { id: sample.id, action: 'restore' })).status, 404);

    assert.equal((await patch('tok-ana-000000000', { id: real.id, action: 'burn' })).status, 400);
    assert.equal((await patch('tok-ana-000000000', { id: 'nope', action: 'archive' })).status, 400);
  });

  test('bad input is refused before it reaches the database', async () => {
    assert.equal((await handleReports(req('tok-ana-000000000', 'POST', { title: '' }), deps)).status, 400);
    assert.equal((await handleReports(req('tok-ana-000000000', 'POST', { title: 'x', propertyType: 'townhouse' }), deps)).status, 400);
    assert.equal((await handleReports(req('tok-ana-000000000', 'GET', undefined, '?id=not-a-uuid'), deps)).status, 400);
    assert.equal((await handleReports(req('tok-ana-000000000', 'DELETE'), deps)).status, 405);
  });

  test("a non-Casa Google account is refused by the API even though Identity signed it in", async () => {
    const res = await handleReports(req('tok-gmail-0000000'), deps);
    assert.equal(res.status, 403);
    const recorded = await withActor(pool as unknown as PoolLike, { kind: 'system', does: 'test' }, async (tx) =>
      (await tx.query("select 1 from comp_report.users where email = 'someone@gmail.com'")).rowCount);
    assert.equal(recorded, 0, 'a refused person is never recorded');
  });

  test('the allowlist admits an outsider, and revoking it shuts them out on the next request', async () => {
    assert.equal((await handleReports(req('tok-counsel-00000'), deps)).status, 403);
    const allow = (sql: string) => withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) => tx.query(sql));
    await allow("insert into comp_report.allowlist (email, role, note) values ('counsel@firm.com', 'external', 'Casa counsel')");
    const me = await (await handleMe(new Request('https://site/x', { headers: { authorization: 'Bearer tok-counsel-00000' } }), deps)).json();
    assert.equal(me.user.role, 'external');
    await allow("update comp_report.allowlist set revoked_at = now(), revoked_by = 'kimani@casa-blanca.com' where email = 'counsel@firm.com'");
    assert.equal((await handleReports(req('tok-counsel-00000'), deps)).status, 403);
  });

  test('a role granted on the allowlist applies on the next request; a disabled account is stopped', async () => {
    const asAdmin = (sql: string) => withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) => tx.query(sql));
    await asAdmin("insert into comp_report.allowlist (email, role, note) values ('ben@casa-blanca.com', 'mentor', 'Mentor programme')");
    const ben = await (await handleMe(new Request('https://site/x', { headers: { authorization: 'Bearer tok-ben-000000000' } }), deps)).json();
    assert.equal(ben.user.role, 'mentor');
    await asAdmin("update comp_report.users set status = 'disabled' where email = 'ben@casa-blanca.com'");
    const res = await handleReports(req('tok-ben-000000000'), deps);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'disabled');
  });

  test('the sign-up gate reads the same allowlist', async () => {
    const gate = (email: string) =>
      handleIdentityEvent(
        new Request('https://site/.netlify/functions/identity-signup', {
          method: 'POST',
          body: JSON.stringify({ event: 'signup', user: { email, app_metadata: { provider: 'google' } } }),
        }),
        { access: deps.access, pool: deps.pool },
      );
    assert.equal((await gate('ana@casa-blanca.com')).status, 204);
    assert.equal((await gate('someone@gmail.com')).status, 403);
    const asAdmin = (sql: string) => withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) => tx.query(sql));
    await asAdmin("insert into comp_report.allowlist (email, role) values ('photographer@studio.com', 'external')");
    assert.equal((await gate('photographer@studio.com')).status, 204);
  });
});
