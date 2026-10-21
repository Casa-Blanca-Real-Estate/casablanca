// The new report, filled from the read (Dispatch 20) against a real PostgreSQL:
// an agent's own tags (DP-6) — strict, NFC-normalised, screened for fair
// housing, at most 30 a comp — the tags the data settles, set several at once
// (NB-9 C), and a listing comp's photos, cleaned again on the way out (NW-020 a).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleWorkspace, type WorkspaceData } from '../server/api/workspace.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import type { AuthDeps } from '../server/session.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = { 'tok-kimani-000000': 'kimani@casa-blanca.com' };
const CHAMBERS = 'pk1|ny|new york|200 chambers st|10A';
const FRANKLIN = 'pk1|ny|new york|5 franklin pl|14A';
const HOST = 'https://photos.zillowstatic.com/fp';

describe('The new report, filled from the read', { skip: skipWithoutDatabase }, () => {
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

  const request = (path: string, method = 'GET', body?: unknown) =>
    new Request(`https://site/${path}`, {
      method,
      headers: { authorization: 'Bearer tok-kimani-000000', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const asJson = async <T,>(res: Response) => ({ status: res.status, body: (await res.json()) as T & { error?: string; message?: string } });
  const comps = (method: string, body: Record<string, unknown>) => handleComps(request('comps', method, { reportId: report, ...body }), deps).then(asJson<WorkspaceData>);
  const byKey = (data: WorkspaceData, key: string) => data.comps.find((c) => c.propertyKey === key)!;
  const tags = (rc: string, t: unknown) => comps('PATCH', { reportCompId: rc, tags: t });

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

  test('a tag of the agent’s own is stored NFC-normalised and trimmed, beside the list’s', async () => {
    const decomposed = '  Café on the corner ';
    const r = await tags(chambers, ['Same area', decomposed]);
    assert.equal(r.status, 200, r.body.message);
    assert.deepEqual(byKey(r.body, CHAMBERS).tags, ['Same area', 'Café on the corner']);
    assert.equal(byKey(r.body, CHAMBERS).tags![1], 'Café on the corner');
  });

  test('each bad free tag is refused, and nothing changes', async () => {
    const bad: [string, string][] = [
      ['a newline', 'Two\nlines'],
      ['markup', '<script>alert(1)</script>'],
      ['a zero-width space', 'Quiet​block'],
      ['a bidi override', 'Park ‮weiv'],
      ['41 characters', 'x'.repeat(41)],
      ['a list tag in other case', 'same BUILDING'],
      ['a control character', 'Bell\u0007'],
      ['an empty tag', '   '],
    ];
    for (const [what, t] of bad) {
      const r = await tags(chambers, ['Same area', t]);
      assert.equal(r.status, 400, what);
      assert.equal(r.body.error, 'bad_tags', what);
    }
    const hard = await tags(chambers, ['Same area', 'Perfect for couples']);
    assert.equal(hard.status, 400);
    assert.equal(hard.body.error, 'fair_housing');
    assert.match(hard.body.message ?? '', /familial status/);
    const ws = await asJson<WorkspaceData>(await handleWorkspace(request(`workspace?report=${report}`), deps));
    assert.deepEqual(byKey(ws.body, CHAMBERS).tags, ['Same area', 'Café on the corner'], 'nothing changed');
  });

  test('40 characters is fine; a 31st tag is a 400 before the database would say so', async () => {
    assert.equal((await tags(chambers, ['Same area', 'y'.repeat(40)])).status, 200);
    const thirty = Array.from({ length: 30 }, (_, i) => `Mine ${i + 1}`);
    assert.equal((await tags(chambers, thirty)).status, 200);
    const r = await tags(chambers, [...thirty, 'Mine 31']);
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'too_many_tags');
  });

  test('tagEdits sets several comps’ tags in one call, each checked like one', async () => {
    const r = await comps('PATCH', { tagEdits: [{ reportCompId: chambers, tags: ['Similar size'] }, { reportCompId: franklin, tags: ['Bigger', 'Same area'] }] });
    assert.equal(r.status, 200, r.body.message);
    assert.deepEqual(byKey(r.body, CHAMBERS).tags, ['Similar size']);
    assert.deepEqual(byKey(r.body, FRANKLIN).tags, ['Bigger', 'Same area']);
    const bad = await comps('PATCH', { tagEdits: [{ reportCompId: chambers, tags: ['<b>'] }] });
    assert.equal(bad.status, 400);
    assert.equal((await comps('PATCH', { tagEdits: [] })).status, 400);
  });

  test('a listing comp’s photos: https on StreetEasy’s image hosts only, at most 8, never an off-list host or a userinfo URL', async () => {
    const good = Array.from({ length: 10 }, (_, i) => `${HOST}/photo${i}-se_large_800_400.webp`);
    const bad = [
      'http://photos.zillowstatic.com/fp/plain-http.webp',
      'https://evil.example.com/fp/off-list.webp',
      'https://user:pw@photos.zillowstatic.com/fp/userinfo.webp',
      'https://photos.zillowstatic.com.evil.example/fp/suffix.webp',
      'javascript:alert(1)',
    ];
    // A read stored as it came, before the server cleaned photos on the way in.
    await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, async (tx) => {
      const p = await tx.query<{ id: string }>(
        "insert into comp_report.properties (property_key, address, unit) values ('pk1|ny|new york|9 photo st|2b', '9 Photo Street', '2B') returning id",
      );
      const raw = { address: '9 Photo Street', unit: '2B', status: 'Sold', heroImageUrl: bad[2], photos: [bad[0], ...good.slice(0, 3), bad[1], bad[3], bad[4], ...good.slice(3)] };
      const o = await tx.query<{ id: string }>(
        `insert into comp_report.property_observations (property_id, report_id, source, as_of, facts, links, raw)
         values ($1, $2, 'listing', '2026-10-20', '{}', '{https://streeteasy.com/building/9-photo-street/2b}', $3::jsonb) returning id`,
        [p.rows[0]!.id, report, JSON.stringify(raw)],
      );
      await tx.query(
        "insert into comp_report.report_comps (report_id, property_id, observation_id, evidence_class) values ($1, $2, $3, 'sold')",
        [report, p.rows[0]!.id, o.rows[0]!.id],
      );
    });
    const res = await handleWorkspace(request(`workspace?report=${report}`), deps);
    const text = await res.text();
    const ws = JSON.parse(text) as WorkspaceData;
    const comp = ws.comps.find((c) => c.propertyKey === 'pk1|ny|new york|9 photo st|2b')!;
    assert.deepEqual(comp.photos, good.slice(0, 8));
    for (const b of bad) assert.ok(!text.includes(b), `${b} never leaves the server`);
    assert.ok(!text.includes('user:pw@'));
    // An export's comp has no photos.
    assert.deepEqual(ws.comps.find((c) => c.propertyKey === CHAMBERS)!.photos, []);
  });
});
