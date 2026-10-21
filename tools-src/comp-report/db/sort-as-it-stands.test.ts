// Sort, as it stands (Dispatch 15) against a real PostgreSQL: the ★ comp is
// 1st tier (NB-6); the agent's corrections to a source's facts, a closed list
// stamped from the session and the clock (NW-044 a); and putting a removed
// comp back with its tier, note and tags (NW-056).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleReports } from '../server/api/reports.ts';
import type { WorkspaceData } from '../server/api/workspace.ts';
import type { PoolLike } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import type { AuthDeps } from '../server/session.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = { 'tok-kimani-000000': 'kimani@casa-blanca.com' };
const CHAMBERS = 'pk1|ny|new york|200 chambers st|10A';
const FRANKLIN = 'pk1|ny|new york|5 franklin pl|14A';

describe('Sort, as it stands', { skip: skipWithoutDatabase }, () => {
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

  const request = (path: string, method = 'GET', body?: unknown, raw?: string) =>
    new Request(`https://site/${path}`, {
      method,
      headers: { authorization: 'Bearer tok-kimani-000000', 'content-type': 'application/json' },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  const asJson = async <T,>(res: Response) => ({ status: res.status, body: (await res.json()) as T & { error?: string; message?: string } });
  const comps = (method: string, body: Record<string, unknown>) => handleComps(request('comps', method, { reportId: report, ...body }), deps).then(asJson<WorkspaceData>);
  const rawPatch = (raw: string) => handleComps(request('comps', 'PATCH', undefined, raw), deps).then(asJson<WorkspaceData>);
  const byKey = (data: WorkspaceData, key: string) => data.comps.find((c) => c.propertyKey === key)!;

  let chambers = '';
  let franklin = '';
  test('the sample sorts', async () => {
    report = (await asJson<{ report: { id: string } }>(await handleReports(request('reports', 'POST', { title: '100 Barclay Street #17L' }), deps))).body.report.id;
    assert.equal((await handleImports(request('imports', 'POST', { reportId: report, sample: true }), deps)).status, 201);
    const sorted = await comps('POST', { sample: true });
    assert.equal(sorted.status, 200);
    chambers = byKey(sorted.body, CHAMBERS).reportCompId;
    franklin = byKey(sorted.body, FRANKLIN).reportCompId;
  });

  test('★ makes a comp 1st tier, and records the tier as a reason; 2nd or ✕ takes the star off', async () => {
    const second = await comps('PATCH', { reportCompId: franklin, tier: 'secondary' });
    assert.equal(byKey(second.body, FRANKLIN).tier, 'secondary');
    const starred = await comps('PATCH', { reportCompId: franklin, anchor: true });
    assert.equal(starred.status, 200);
    const f = byKey(starred.body, FRANKLIN);
    assert.deepEqual([f.tier, f.anchor], ['primary', true]);
    assert.equal(f.reasons.at(-1)?.tier, 'primary');
    assert.equal(byKey(starred.body, CHAMBERS).anchor, false, 'one ★ per report: it moved');

    const excluded = await comps('PATCH', { reportCompId: franklin, tier: 'excluded' });
    assert.deepEqual([byKey(excluded.body, FRANKLIN).tier, byKey(excluded.body, FRANKLIN).anchor], ['excluded', false]);
    // The tier POST does the same.
    await comps('PATCH', { reportCompId: chambers, anchor: true });
    const posted = await comps('POST', { reportCompId: chambers, tier: 'secondary', reason: 'Context only.', reasonType: 'property' });
    assert.deepEqual([byKey(posted.body, CHAMBERS).tier, byKey(posted.body, CHAMBERS).anchor], ['secondary', false]);
    // A ★ and a tier that isn't 1st, together, is refused.
    assert.equal((await comps('PATCH', { reportCompId: chambers, anchor: true, tier: 'secondary' })).body.error, 'bad_anchor');
    // Unstarring leaves the tier.
    await comps('PATCH', { reportCompId: chambers, anchor: true });
    const off = await comps('PATCH', { reportCompId: chambers, anchor: false });
    assert.deepEqual([byKey(off.body, CHAMBERS).tier, byKey(off.body, CHAMBERS).anchor], ['primary', false]);
  });

  test('a correction saves the four facts only, stamped from the session and the clock; null puts StreetEasy’s back', async () => {
    const before = Date.now();
    const r = await comps('PATCH', {
      reportCompId: chambers,
      factOverrides: { price: { value: 4_100_000, by: 'someone@else.example', at: '1999-01-01T00:00:00.000Z' }, floor: 3, size: { value: 2000 }, date: '2026-07-01' },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const o = byKey(r.body, CHAMBERS).factOverrides!;
    assert.deepEqual([o.price?.value, o.floor?.value, o.size?.value, o.date?.value], [4_100_000, 3, 2000, '2026-07-01']);
    assert.equal(o.price?.by, 'kimani@casa-blanca.com', 'the body’s by is dropped');
    assert.ok(Date.parse(o.price!.at) >= before - 1000, 'the body’s at is dropped');
    assert.deepEqual(Object.keys(o.price!).sort(), ['at', 'by', 'value']);

    const cleared = await comps('PATCH', { reportCompId: chambers, factOverrides: { price: null } });
    const c = byKey(cleared.body, CHAMBERS).factOverrides!;
    assert.equal(c.price, undefined);
    assert.equal(c.floor?.value, 3, 'the others stay');
  });

  test('a correction refuses a key off the list, __proto__, constructor, prototype, and a string where a number belongs', async () => {
    const refused = async (factOverrides: unknown) => (await comps('PATCH', { reportCompId: chambers, factOverrides })).body.error;
    assert.equal(await refused({ beds: 3 }), 'bad_fact');
    assert.equal(await refused({ constructor: { value: 1 } }), 'bad_fact');
    assert.equal(await refused({ prototype: { value: 1 } }), 'bad_fact');
    assert.equal(await refused({ price: '4100000' }), 'bad_fact');
    assert.equal(await refused({ price: { value: '4100000' } }), 'bad_fact');
    assert.equal(await refused({ size: 1980.5 }), 'bad_fact');
    assert.equal(await refused({ floor: '12' }), 'bad_fact');
    assert.equal(await refused({ price: 0 }), 'bad_fact');
    assert.equal(await refused({ date: '2099-01-01' }), 'bad_fact');
    assert.equal(await refused({ date: 20260701 }), 'bad_fact');
    assert.equal(await refused([4100000]), 'bad_fact');
    // __proto__ as JSON text: JSON.parse makes it an own key, which the closed list refuses.
    const proto = await rawPatch(`{"reportId":"${report}","reportCompId":"${chambers}","factOverrides":{"__proto__":{"value":1,"polluted":true}}}`);
    assert.equal(proto.body.error, 'bad_fact');
    const nested = await rawPatch(`{"reportId":"${report}","reportCompId":"${chambers}","factOverrides":{"price":{"value":4200000,"__proto__":{"polluted":true}}}}`);
    assert.equal(nested.status, 200, 'a value object’s other keys are dropped');
    assert.deepEqual(Object.keys(byKey(nested.body, CHAMBERS).factOverrides!.price!).sort(), ['at', 'by', 'value']);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(({} as Record<string, unknown>).value, undefined);
    assert.equal(Object.keys(Object.prototype).length, 0);
  });

  test('a removed comp comes back with its tier, note and tags, on Put back', async () => {
    const before = byKey((await comps('PATCH', { reportCompId: franklin, tier: 'secondary', note: 'Context.', tags: ['Similar size'] })).body, FRANKLIN);
    const removed = byKey((await comps('PATCH', { reportCompId: franklin, removed: true })).body, FRANKLIN);
    assert.ok(removed.removedAt);
    const back = byKey((await comps('PATCH', { reportCompId: franklin, removed: false })).body, FRANKLIN);
    assert.equal(back.removedAt, null);
    assert.deepEqual([back.tier, back.note, back.tags, back.reasons.length], [before.tier, before.note, before.tags, before.reasons.length]);
  });
});
