// The sample that resets (Dispatch 23 items 1–2), against a real PostgreSQL:
// a sample report built on the server in one transaction, condo or co-op;
// "Reset the sample" replaces the caller's own active sample report with a
// fresh one and archives the old, in the same transaction. Only those who may
// use the sample (admins, and a guest on a preview) get past the door, before
// any report is looked at.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleAllowlist } from '../server/api/allowlist.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleMessages } from '../server/api/messages.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleSample } from '../server/api/sample.ts';
import { handleWorkspace } from '../server/api/workspace.ts';
import type { PoolLike } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import { memorySamplePhotoStore } from '../server/sample/photos.ts';
import type { AuthDeps } from '../server/session.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = {
  'tok-kimani-000000': 'kimani@casa-blanca.com',
  'tok-erez-00000000': 'erez@casa-blanca.com',
  'tok-ana-000000000': 'ana@casa-blanca.com',
  'tok-hannah-000000': 'hannah@partner.com',
  'tok-friend-000000': 'friend@outside.com',
};
const KIMANI = 'tok-kimani-000000';
const EREZ = 'tok-erez-00000000';
const ANA = 'tok-ana-000000000';
const MENTOR = 'tok-hannah-000000';
const EXTERNAL = 'tok-friend-000000';

describe('the sample that resets, through the API', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  /** A superuser, to read and plant rows past row-level security. */
  let su: pg.Pool;
  let deps: AuthDeps & { samplePhotos: ReturnType<typeof memorySamplePhotoStore> };
  /** Every statement run through the pool, for the spy. */
  let seen: string[] = [];

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    su = testPool(db.urlAs(new URL(process.env.CR_TEST_DATABASE_URL!).username), 1);
    const spied: PoolLike = {
      async connect() {
        const client = await pool.connect();
        return {
          query: (text: string, params?: unknown[]) => {
            seen.push(text);
            return client.query(text, params as unknown[]);
          },
          release: (e?: Error | boolean) => client.release(e),
        } as unknown as Awaited<ReturnType<PoolLike['connect']>>;
      },
    } as PoolLike;
    deps = {
      verifier: {
        async verify(token: string) {
          const email = PEOPLE[token];
          return email ? ({ id: `id-${token}`, email, confirmed: true, provider: 'google', name: null } as IdentityUser) : null;
        },
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com, erez@casa-blanca.com' }),
      pool: spied,
      samplePhotos: memorySamplePhotoStore(),
    };
    // A mentor and an external, granted as an admin would.
    for (const [email, role] of [['hannah@partner.com', 'mentor'], ['friend@outside.com', 'external']]) {
      const res = await handleAllowlist(req(KIMANI, '/api/comp-report/allowlist', 'POST', { email, role }), deps);
      assert.equal(res.status, 200);
    }
  });
  after(async () => {
    await pool.end();
    await su.end();
    await db?.drop();
  });

  function req(token: string, path: string, method = 'GET', body?: unknown) {
    return new Request(`https://site${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const sample = (token: string, body: unknown) => handleSample(req(token, '/api/comp-report/sample', 'POST', body), deps);
  const fill = async (token: string, kind: string, title = '100 Barclay Street #17L') => {
    const res = await sample(token, { action: 'fill', kind, title });
    assert.equal(res.status, 201, await res.clone().text());
    return (await res.json()).report as { id: string; title: string; propertyType: string; sampleData: boolean; ownerEmail: string; status: string };
  };
  const workspace = async (token: string, id: string) => {
    const res = await handleWorkspace(req(token, `/api/comp-report/workspace?report=${id}`), deps);
    assert.equal(res.status, 200);
    return res.json();
  };
  const rowOf = async (id: string) =>
    (await su.query('select status, sample_data, owner_email, title, property_type from comp_report.reports where id = $1', [id])).rows[0];
  const countReports = async () => Number((await su.query('select count(*) as n from comp_report.reports')).rows[0].n);

  test('anyone but an admin gets 403 from fill and reset, and from the three existing sample gates, before any report is read', async () => {
    const own = await fill(KIMANI, 'condo');
    for (const token of [ANA, MENTOR, EXTERNAL]) {
      // An external has no report of its own to aim at; the gates refuse before that matters.
      seen = [];
      const calls = [
        await sample(token, { action: 'fill', kind: 'condo', title: 'x' }),
        await sample(token, { action: 'reset', reportId: own.id }),
        await handleSample(req(token, '/api/comp-report/sample'), deps),
        await handleImports(req(token, '/api/comp-report/imports', 'POST', { reportId: own.id, sample: true }), deps),
        await handleComps(req(token, '/api/comp-report/comps', 'POST', { reportId: own.id, sample: true }), deps),
      ];
      for (const res of calls) assert.equal(res.status, 403, `${token}: ${await res.clone().text()}`);
      const touched = seen.filter((q) => /comp_report\.(reports|imports|report_comps|properties|property_observations)\b/.test(q));
      assert.deepEqual(touched, [], `${token} reached a report query`);
    }
    assert.equal((await rowOf(own.id)).status, 'active');
  });

  test('fill builds a sample report, condo or co-op: owned by the caller, marked sample, its export imported and unsorted', async () => {
    const condo = await fill(KIMANI, 'condo');
    assert.deepEqual({ type: condo.propertyType, sample: condo.sampleData, owner: condo.ownerEmail, title: condo.title },
      { type: 'condo', sample: true, owner: 'kimani@casa-blanca.com', title: '100 Barclay Street #17L' });
    const ws = await workspace(KIMANI, condo.id);
    assert.equal(ws.imports.length, 1);
    assert.equal(ws.imports[0].sample, true);
    assert.equal(ws.comps.length, 11);
    assert.ok(ws.comps.every((c: { tier: string | null }) => c.tier === null), 'unsorted: the walk starts on Sort');
    assert.equal(ws.state.intake.areaSqft.value, 2000);
    assert.equal(ws.brief.audience.value, 'seller');
    assert.equal(ws.messageCount, 0);

    const coop = await fill(KIMANI, 'coop', 'Co-op practice');
    assert.equal(coop.propertyType, 'coop');
    const cws = await workspace(KIMANI, coop.id);
    assert.equal(cws.state.intake.areaSqft, undefined, 'a co-op sample has no size');
    const csv = Buffer.from(cws.imports[0].contentBase64, 'base64').toString('utf8');
    assert.match(csv, /,Co-op,/);
    assert.doesNotMatch(csv, /ft²/, 'no size or $/sqft column values');
  });

  test('fill refuses a kind outside condo and coop, and a bad title, with 400', async () => {
    const before = await countReports();
    for (const body of [
      { action: 'fill', kind: 'townhouse', title: 'x' },
      { action: 'fill', title: 'x' },
      { action: 'fill', kind: 'condo', title: '' },
      { action: 'fill', kind: 'condo', title: 'x'.repeat(201) },
      { action: 'nope' },
    ]) assert.equal((await sample(KIMANI, body)).status, 400, JSON.stringify(body));
    assert.equal((await handleSample(req(KIMANI, '/api/comp-report/sample?kind=villa'), deps)).status, 400);
    assert.equal(await countReports(), before);
  });

  test('reset gives a fresh copy with an empty Hubert, the title read from the row, and archives the old; and the fresh one resets too', async () => {
    const first = await fill(KIMANI, 'coop', 'Practice co-op');
    // Ruin it: sort it, and talk to Hubert.
    assert.equal((await handleComps(req(KIMANI, '/api/comp-report/comps', 'POST', { reportId: first.id, sample: true }), deps)).status, 200);
    const c = await su.connect();
    try {
      await c.query('begin');
      await c.query(`select comp_report.enter('user', 'kimani@casa-blanca.com', 'admin', null)`);
      await c.query(`insert into comp_report.messages (report_id, seq, role, content) values ($1, 1, 'user', '[]'::jsonb)`, [first.id]);
      await c.query('commit');
    } finally {
      c.release();
    }
    assert.ok((await workspace(KIMANI, first.id)).messageCount > 0);

    const res = await sample(KIMANI, { action: 'reset', reportId: first.id, title: 'A title from the body', kind: 'condo' });
    assert.equal(res.status, 201, await res.clone().text());
    const { report, archived } = await res.json();
    assert.equal(archived, first.id);
    assert.notEqual(report.id, first.id);
    assert.deepEqual({ title: report.title, type: report.propertyType, owner: report.ownerEmail, sample: report.sampleData },
      { title: 'Practice co-op', type: 'coop', owner: 'kimani@casa-blanca.com', sample: true }, 'title and kind from the old row, never the body');
    assert.equal((await rowOf(first.id)).status, 'archived');
    const fresh = await workspace(KIMANI, report.id);
    assert.equal(fresh.messageCount, 0);
    assert.ok(fresh.comps.every((c: { tier: string | null; reasons: unknown[] }) => c.tier === null && c.reasons.length === 0));
    const msgs = await (await handleMessages(req(KIMANI, `/api/comp-report/messages?report=${report.id}`), deps)).json();
    assert.equal(msgs.messages.length, 0);

    // Gone from the list, there under Archived.
    const list = await (await handleReports(req(KIMANI, '/api/comp-report/reports'), deps)).json();
    assert.ok(!list.reports.some((r: { id: string }) => r.id === first.id));
    assert.ok(list.reports.some((r: { id: string }) => r.id === report.id));

    // A second click on the archived one is a 404, and nothing more is made.
    const before = await countReports();
    assert.equal((await sample(KIMANI, { action: 'reset', reportId: first.id })).status, 404);
    assert.equal(await countReports(), before);
    // The fresh one is itself resettable.
    const again = await sample(KIMANI, { action: 'reset', reportId: report.id });
    assert.equal(again.status, 201);
    assert.equal((await rowOf(report.id)).status, 'archived');
  });

  test('reset is 404 for someone else’s report, a real report of one’s own, or an archived one; nothing is archived or created', async () => {
    const theirs = await fill(EREZ, 'condo');
    const real = (await (await handleReports(req(KIMANI, '/api/comp-report/reports', 'POST', { title: '25 North Moore #9C' }), deps)).json()).report;
    const old = await fill(KIMANI, 'condo');
    await handleReports(req(KIMANI, '/api/comp-report/reports', 'PATCH', { id: old.id, action: 'archive' }), deps);
    const before = await countReports();
    for (const id of [theirs.id, real.id, old.id, '00000000-0000-4000-8000-000000000000']) {
      assert.equal((await sample(KIMANI, { action: 'reset', reportId: id })).status, 404, id);
    }
    assert.equal((await sample(KIMANI, { action: 'reset', reportId: 'not-a-uuid' })).status, 400);
    assert.equal(await countReports(), before);
    assert.equal((await rowOf(theirs.id)).status, 'active');
    assert.equal((await rowOf(real.id)).status, 'active');
  });

  test('create and archive are one transaction: a failure leaves the old report active and no new one', async () => {
    const first = await fill(KIMANI, 'condo');
    const before = await countReports();
    const failing: PoolLike = {
      async connect() {
        const client = await deps.pool!.connect();
        return {
          query: (text: string, params?: unknown[]) => {
            if (/set status = 'archived'/.test(text)) return Promise.reject(new Error('forced failure'));
            return client.query(text, params);
          },
          release: (e?: Error | boolean) => client.release(e),
        } as unknown as Awaited<ReturnType<PoolLike['connect']>>;
      },
    } as PoolLike;
    const res = await handleSample(req(KIMANI, '/api/comp-report/sample', 'POST', { action: 'reset', reportId: first.id }), { ...deps, pool: failing });
    assert.equal(res.status, 500);
    assert.equal((await rowOf(first.id)).status, 'active');
    assert.equal(await countReports(), before);
  });

  test('the in-place fills follow the report’s kind: a co-op report imports and sorts the co-op sample', async () => {
    const created = (await (await handleReports(req(KIMANI, '/api/comp-report/reports', 'POST', { title: 'Typed co-op', propertyType: 'coop' }), deps)).json()).report;
    assert.equal((await handleImports(req(KIMANI, '/api/comp-report/imports', 'POST', { reportId: created.id, sample: true }), deps)).status, 201);
    const sorted = await (await handleComps(req(KIMANI, '/api/comp-report/comps', 'POST', { reportId: created.id, sample: true }), deps)).json();
    const csv = Buffer.from(sorted.imports[0].contentBase64, 'base64').toString('utf8');
    assert.match(csv, /,Co-op,/);
    const tags = sorted.comps.flatMap((c: { tags: string[] | null }) => c.tags ?? []);
    assert.ok(!tags.some((t: string) => /size|smaller|bigger/i.test(t)), tags.join(', '));
    assert.ok(sorted.comps.every((c: { tags: string[] | null }) => (c.tags ?? []).length > 0), 'every comp keeps a tag, so the sample reaches Findings');
    const walk = await (await handleSample(req(KIMANI, '/api/comp-report/sample?kind=coop'), deps)).json();
    assert.equal(walk.propertyType, 'coop');
    assert.equal(walk.intake.areaSqft, undefined);
  });
});
