// The design port's data (Dispatch 14) against a real PostgreSQL: a comp's
// note, tags and features; a tier before a note; taking a comp out and putting
// it back; one anchor per report; a typed-in comp with its note and tags; the
// Co-op/Condo toggle; the reports list's client, side and stage in one query;
// and the Gate's rule by the agent's level, on the server.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleReports, type ReportSummary } from '../server/api/reports.ts';
import { handleWorkspace, type WorkspaceData } from '../server/api/workspace.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import { SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import type { AuthDeps } from '../server/session.ts';
import { TAGS } from '../workspace/features.ts';
import { NO_NOTE_YET } from '../workspace/state.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = {
  'tok-kimani-000000': 'kimani@casa-blanca.com',
  'tok-ana-000000000': 'ana@casa-blanca.com',
  'tok-new-000000000': 'new@casa-blanca.com',
};

describe('the design port’s data', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let deps: AuthDeps;
  let report = '';

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
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
    };
  });
  after(async () => {
    await pool.end();
    await db?.drop();
  });

  const request = (path: string, token: string, method = 'GET', body?: unknown) =>
    new Request(`https://site/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const asJson = async <T,>(res: Response) => ({ status: res.status, body: (await res.json()) as T & { error?: string; message?: string } });
  const comps = (token: string, method: string, body: Record<string, unknown>) => handleComps(request('comps', token, method, { reportId: report, ...body }), deps).then(asJson<WorkspaceData>);
  const patch = (token: string, body: Record<string, unknown>) => handleWorkspace(request('workspace', token, 'PATCH', { reportId: report, ...body }), deps).then(asJson<{ saved: boolean }>);
  const reasonsOf = async (reportCompId: string) =>
    (await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) =>
      tx.query<{ tier: string; reason: string }>('select tier, reason from comp_report.reasons where report_comp_id = $1 order by id', [reportCompId]))).rows;

  let chambers = '';
  test('the sample sorts with notes and tags, so it can reach Findings', async () => {
    report = (await asJson<{ report: { id: string } }>(await handleReports(request('reports', 'tok-kimani-000000', 'POST', { title: '100 Barclay Street #17L', propertyType: 'coop' }), deps))).body.report.id;
    assert.equal((await handleImports(request('imports', 'tok-kimani-000000', 'POST', { reportId: report, sample: true }), deps)).status, 201);
    const sorted = await comps('tok-kimani-000000', 'POST', { sample: true });
    assert.equal(sorted.status, 200);
    for (const s of SAMPLE_TIERS) {
      const c = sorted.body.comps.find((x) => x.propertyKey === s.propertyKey)!;
      assert.equal(c.note, s.reason);
      assert.ok(c.tags?.length, s.propertyKey);
      for (const t of c.tags!) assert.ok((TAGS as readonly string[]).includes(t), t);
    }
    chambers = sorted.body.comps.find((c) => c.propertyKey === 'pk1|ny|new york|200 chambers st|10A')!.reportCompId;
  });

  test('a comp’s note, tags and features save together; a changed note on a tiered comp appends a reason', async () => {
    const before = (await reasonsOf(chambers)).length;
    const r = await comps('tok-kimani-000000', 'PATCH', {
      reportCompId: chambers, note: 'Closest match, high floor.', tags: ['Same area', 'Similar size'],
      features: { views: ['Water', 'Nonsense'], outdoor: ['None', 'Terrace'], bogus: ['x'] },
    });
    assert.equal(r.status, 200);
    const c = r.body.comps.find((x) => x.reportCompId === chambers)!;
    assert.deepEqual([c.note, c.tags, c.features], ['Closest match, high floor.', ['Same area', 'Similar size'], { views: ['Water'], outdoor: ['None'] }]);
    const reasons = await reasonsOf(chambers);
    assert.equal(reasons.length, before + 1);
    assert.deepEqual(reasons.at(-1), { tier: 'primary', reason: 'Closest match, high floor.' });
    assert.equal((await comps('tok-kimani-000000', 'PATCH', { reportCompId: chambers, tags: ['Not a tag'] })).body.error, 'bad_tags');
  });

  test('a tier before a note records “(no note yet)”; the note then appends the real one', async () => {
    const manual = await comps('tok-kimani-000000', 'POST', {
      manual: { address: '30 Warren Street, New York, NY', unit: '#7A', status: 'sold', price: 4380000, date: '2026-08-01', floor: 7 },
      note: 'Two blocks away, comparable layout.', tags: ['Same area'], features: { building: ['Doorman'] },
    });
    assert.equal(manual.status, 201);
    const warren = manual.body.comps.find((c) => c.propertyKey.includes('30 warren'))!;
    assert.deepEqual([warren.note, warren.tags, warren.features], ['Two blocks away, comparable layout.', ['Same area'], { building: ['Doorman'] }]);

    const blank = await comps('tok-kimani-000000', 'POST', { manual: { address: '1 Main Street, New York, NY', unit: '#2', status: 'active', price: 3000000 } });
    const main = blank.body.comps.find((c) => c.propertyKey.includes('1 main'))!;
    const tiered = await comps('tok-kimani-000000', 'PATCH', { reportCompId: main.reportCompId, tier: 'secondary' });
    assert.equal(tiered.body.comps.find((c) => c.reportCompId === main.reportCompId)!.tier, 'secondary');
    assert.deepEqual(await reasonsOf(main.reportCompId), [{ tier: 'secondary', reason: NO_NOTE_YET }]);
    await comps('tok-kimani-000000', 'PATCH', { reportCompId: main.reportCompId, note: 'Same street, an ask.' });
    assert.deepEqual((await reasonsOf(main.reportCompId)).at(-1), { tier: 'secondary', reason: 'Same street, an ask.' });
  });

  test('one ★ per report, any status: starring another moves it; a removed comp loses it, and comes back without it', async () => {
    const all = (await comps('tok-kimani-000000', 'PATCH', { reportCompId: chambers, anchor: true })).body.comps;
    const active = all.find((c) => c.evidenceClass === 'active')!;
    const moved = (await comps('tok-kimani-000000', 'PATCH', { reportCompId: active.reportCompId, anchor: true })).body.comps;
    assert.deepEqual(moved.filter((c) => c.anchor).map((c) => c.reportCompId), [active.reportCompId]);

    const removed = await comps('tok-kimani-000000', 'PATCH', { reportCompId: active.reportCompId, removed: true });
    const r = removed.body.comps.find((c) => c.reportCompId === active.reportCompId)!;
    assert.ok(r.removedAt);
    assert.equal(r.anchor, false);
    assert.equal((await comps('tok-kimani-000000', 'PATCH', { reportCompId: active.reportCompId, tier: 'primary' })).body.error, 'removed');
    const back = await comps('tok-kimani-000000', 'PATCH', { reportCompId: active.reportCompId, removed: false });
    assert.equal(back.body.comps.find((c) => c.reportCompId === active.reportCompId)!.removedAt, null);
  });

  test('the Co-op/Condo toggle saves, and the reports list reads client, side and stage', async () => {
    assert.equal((await patch('tok-kimani-000000', {
      propertyType: 'condo', brief: { audience: { value: 'seller', asOf: '2026-10-15' }, clientName: { value: 'Jordan and Sam', asOf: '2026-10-15' } },
    })).status, 200);
    assert.equal((await patch('tok-kimani-000000', { propertyType: 'house' })).body.error, 'bad_property_type');
    const list = async () => (await asJson<{ reports: ReportSummary[] }>(await handleReports(request('reports', 'tok-kimani-000000'), deps))).body.reports;
    let row = (await list()).find((r) => r.id === report)!;
    assert.deepEqual([row.propertyType, row.client, row.side, row.stage], ['condo', 'Jordan and Sam', 'seller', 'sort']);
    assert.ok(typeof row.unsorted === 'number');
    await patch('tok-kimani-000000', { call: { skipped: true, at: '2026-10-15T12:00:00.000Z' } });
    assert.equal((await list()).find((r) => r.id === report)!.stage, 'findings');
    await patch('tok-kimani-000000', { state: { reached: 'send' } });
    assert.equal((await list()).find((r) => r.id === report)!.stage, 'send');
    await patch('tok-kimani-000000', { state: { reached: 'send', send: { sentAt: '2026-10-15T13:00:00.000Z' } } });
    row = (await list()).find((r) => r.id === report)!;
    assert.equal(row.stage, 'sent');
  });

  test('the Gate on the server: a practice agent gives low, high and 100+ characters of why, and can’t skip; a full agent can', async () => {
    const newReport = (await asJson<{ report: { id: string } }>(await handleReports(request('reports', 'tok-new-000000000', 'POST', { title: 'A home' }), deps))).body.report.id;
    await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) =>
      tx.query(`update comp_report.users set capability = 'practice' where email = 'new@casa-blanca.com'`));
    const call = (body: unknown) => handleWorkspace(request('workspace', 'tok-new-000000000', 'PATCH', { reportId: newReport, call: body }), deps).then(asJson<object>);
    const at = '2026-10-15T12:00:00.000Z';
    assert.equal((await call({ skipped: true, at })).body.error, 'gate_required');
    assert.equal((await call({ low: 3400000, high: 4200000, at, note: 'Too short.' })).body.error, 'gate_why');
    assert.equal((await call({ low: 3400000, high: 4200000, at, note: 'x'.repeat(100) })).status, 200);
    assert.equal((await patch('tok-kimani-000000', { call: { skipped: true, at } })).status, 200, 'a full agent can skip');
  });
});
