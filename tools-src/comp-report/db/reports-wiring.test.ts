// The reports list's wiring (2026-11-06), against a real PostgreSQL: the Range column worked out on the
// server (not the range the owner's browser last wrote), Stage · updated counting a comp's tier, a sample's
// photo from the sample's stored photos, and Done's What's next ticks in the list and the activity log.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleReports, type ReportSummary, type ReportsDeps } from '../server/api/reports.ts';
import { handleWorkspace, type WorkspaceData } from '../server/api/workspace.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import { neutralNumbers } from '../server/numbers.ts';
import { sampleIntake } from '../server/sample/barclay-17l.ts';
import { memorySamplePhotoStore, samplePhotoTargets } from '../server/sample/photos.ts';
import { answerResult } from '../workspace/reading.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = { 'tok-kimani-000000': 'kimani@casa-blanca.com' };
const PHOTO = 'https://photos.zillowstatic.com/fp/barclay-11f-se_large_800_400.jpg';

describe('the reports list’s wiring', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let deps: ReportsDeps;
  let report = '';

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    // A 100 Barclay comp's photo in the sample's store: 17L has no page of its own, so its row borrows the building's.
    const barclay = samplePhotoTargets().find((t) => t.propertyKey.includes('100 barclay'))!;
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
      samplePhotos: memorySamplePhotoStore({
        'barclay-17l/v1': JSON.stringify({ state: 'done', capturedAt: '2026-11-01T00:00:00.000Z', byProperty: { [barclay.propertyKey]: [PHOTO] } }),
      }),
    };
  });
  after(async () => {
    await pool.end();
    await db?.drop();
  });

  const request = (path: string, method = 'GET', body?: unknown) =>
    new Request(`https://site/${path}`, {
      method,
      headers: { authorization: 'Bearer tok-kimani-000000', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const asJson = async <T,>(res: Response) => ({ status: res.status, body: (await res.json()) as T & { error?: string } });
  const list = async () => (await asJson<{ reports: ReportSummary[] }>(await handleReports(request('reports'), deps))).body.reports;
  const patch = (body: Record<string, unknown>) => handleWorkspace(request('workspace', 'PATCH', { reportId: report, ...body }), deps).then(asJson<{ saved: boolean }>);
  const asKimani = <T,>(sql: string, args: unknown[] = []) =>
    withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) => tx.query(sql, args)).then((r) => r.rows as T[]);

  test('the sample, sorted and revealed, with a stale range on the report', async () => {
    report = (await asJson<{ report: { id: string } }>(await handleReports(request('reports', 'POST', { title: '100 Barclay Street #17L', propertyType: 'condo' }), deps))).body.report.id;
    assert.equal((await handleImports(request('imports', 'POST', { reportId: report, sample: true }), deps)).status, 201);
    assert.equal((await handleComps(request('comps', 'POST', { reportId: report, sample: true }), deps).then(asJson<WorkspaceData>)).status, 200);
    // The browser last wrote a range long ago (before comps changed): the list mustn't show it.
    assert.equal((await patch({ state: { intake: sampleIntake('condo'), range: { low: 1, high: 2 } } })).status, 200);
    assert.equal((await patch({ call: { skipped: true, at: '2026-11-01T12:00:00.000Z' } })).status, 200);
  });

  test('Range: the engine’s range as it stands, worked out on the server', async () => {
    const want = await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, async (tx) => {
      const n = (await neutralNumbers(tx, report))!;
      return n.output.results[answerResult(n.output)].range!;
    });
    const row = (await list()).find((r) => r.id === report)!;
    assert.equal(row.rangeLow, Math.round(want.low.value));
    assert.equal(row.rangeHigh, Math.round(want.high.value));
    assert.notEqual(row.rangeLow, 1);
  });

  test('a report not yet revealed shows no range, whatever its state says', async () => {
    const other = (await asJson<{ report: { id: string } }>(await handleReports(request('reports', 'POST', { title: '25 Leonard Street #3', propertyType: 'condo' }), deps))).body.report.id;
    await handleWorkspace(request('workspace', 'PATCH', { reportId: other, state: { range: { low: 5, high: 6 } } }), deps);
    const row = (await list()).find((r) => r.id === other)!;
    assert.equal(row.rangeLow, null);
    // Nothing read, nothing in its building: no photo, and the list sets the address in type.
    assert.equal(row.photo, null);
    assert.equal(row.photoFrom, null);
  });

  test('a sample’s photo comes from the sample’s stored photos, from its own building', async () => {
    const row = (await list()).find((r) => r.id === report)!;
    assert.equal(row.photo, PHOTO);
    assert.equal(row.photoFrom, 'sample');
  });

  test('Stage · updated counts a comp’s tier, which lives on the comp’s own row', async () => {
    await asKimani("update comp_report.reports set title = title where id = $1", [report]);
    const before = (await list()).find((r) => r.id === report)!;
    const comp = (await asKimani<{ id: string }>('select id from comp_report.report_comps where report_id = $1 and removed_at is null order by created_at limit 1', [report]))[0]!;
    await new Promise((r) => setTimeout(r, 20));
    const tiered = await handleComps(request('comps', 'PATCH', { reportId: report, reportCompId: comp.id, tier: 'secondary' }), deps);
    assert.equal(tiered.status, 200);
    const after = (await list()).find((r) => r.id === report)!;
    assert.equal(after.updatedAt, before.updatedAt, 'the report row itself didn’t change');
    assert.ok(Date.parse(after.workedAt!) > Date.parse(before.workedAt!), 'but it was worked on');
  });

  test('What’s next: ticks show in the list and land in the activity log, each way', async () => {
    const state = { intake: sampleIntake('condo'), send: { sentAt: '2026-11-02T12:00:00.000Z' } };
    assert.equal((await patch({ state })).status, 200);
    assert.equal((await patch({ state: { ...state, doneChecks: { 'follow-up': true } } })).status, 200);
    assert.deepEqual((await list()).find((r) => r.id === report)!.doneChecks, ['follow-up']);
    assert.equal((await patch({ state: { ...state, doneChecks: { 'follow-up': false, 'plan-offer': true } } })).status, 200);
    // A save that changes nothing logs nothing.
    assert.equal((await patch({ state: { ...state, doneChecks: { 'follow-up': false, 'plan-offer': true } } })).status, 200);
    assert.deepEqual((await list()).find((r) => r.id === report)!.doneChecks, ['plan-offer']);
    const rows = await asKimani<{ name: string; detail: unknown }>(
      "select name, detail from comp_report.activity where report_id = $1 and name = 'report.next_ticked' order by id", [report]);
    assert.deepEqual(rows.map((r) => r.detail), [{ item: 'follow-up', on: true }, { item: 'follow-up', on: false }, { item: 'plan-offer', on: true }]);
  });

  test('the database refuses a What’s next row with anything but its item and flag', async () => {
    await assert.rejects(withActor(pool as unknown as PoolLike, { kind: 'system', does: 'activity-log' }, (tx) => tx.query(
      `insert into comp_report.activity (user_email, report_id, kind, name, detail) values ('kimani@casa-blanca.com', $1, 'action', 'report.next_ticked', $2::jsonb)`,
      [report, JSON.stringify({ item: 'call the client', on: true })],
    )));
  });
});
