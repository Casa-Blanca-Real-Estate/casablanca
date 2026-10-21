// Guest mode and the sample's photos, against a real PostgreSQL: a guest gets
// in only on a preview with the key, is an agent that row-level security keeps
// to its own reports, and may use the sample; the sample's comps carry the
// photos read from their pages once those are kept.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleMe } from '../server/api/me.ts';
import { handleReports } from '../server/api/reports.ts';
import { runSamplePhotoCapture } from '../server/api/sample-photos.ts';
import { handleSample } from '../server/api/sample.ts';
import type { PoolLike } from '../server/db.ts';
import { deployContext, GUEST_EMAIL, guestConfig } from '../server/guest.ts';
import type { IdentityUser } from '../server/identity.ts';
import type { PageReader } from '../server/links.ts';
import { captureDue, memorySamplePhotoStore, samplePhotos, samplePhotoTargets, type SamplePhotoStore } from '../server/sample/photos.ts';
import type { AuthDeps } from '../server/session.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const KEY = 'a-guest-key-long-enough-to-be-a-secret';
const at = (host: string) => new Request(`https://${host}/api/comp-report/me`);

describe('guest mode: when it is on', () => {
  test('only with a key of 24+ characters, and only on a preview, a branch deploy or the dev server', () => {
    assert.equal(guestConfig({}, 'deploy-preview'), null);
    assert.equal(guestConfig({ CR_GUEST_KEY: 'short' }, 'deploy-preview'), null);
    assert.equal(guestConfig({ CR_GUEST_KEY: KEY }, 'production'), null);
    assert.equal(guestConfig({ CR_GUEST_KEY: KEY }, null), null);
    assert.deepEqual(guestConfig({ CR_GUEST_KEY: KEY }, 'deploy-preview'), { key: KEY });
    assert.deepEqual(guestConfig({ CR_GUEST_KEY: KEY }, 'branch-deploy'), { key: KEY });
    assert.deepEqual(guestConfig({ CR_GUEST_KEY: ` ${KEY} ` }, 'dev'), { key: KEY });
  });

  test('which deploy: Netlify’s runtime when it says, else the hostname; a custom domain or a permalink is never a preview', () => {
    const runtime = (context: string) => ({ context: { deploy: { context } } });
    assert.equal(deployContext(at('deploy-preview-85--casa.netlify.app'), runtime('production')), 'production');
    assert.equal(deployContext(at('casa.example'), runtime('deploy-preview')), 'deploy-preview');
    assert.equal(deployContext(at('deploy-preview-85--casa-blanca-creative-studio.netlify.app'), undefined), 'deploy-preview');
    assert.equal(deployContext(at('staging--casa-blanca-creative-studio.netlify.app'), undefined), 'branch-deploy');
    assert.equal(deployContext(at('casa-blanca-creative-studio.netlify.app'), undefined), null);
    assert.equal(deployContext(at('studio.casa-blanca.com'), undefined), null);
    assert.equal(deployContext(at('6716c2a0e4b0f1a2b3c4d5e6--casa-blanca-creative-studio.netlify.app'), undefined), null);
    assert.equal(deployContext(at('deploy-preview-85--casa.netlify.app.evil.example'), undefined), null);
  });
});

describe('the sample’s photos: kept once', () => {
  test('a capture reads each sample comp’s page and keeps cleaned photo URLs; due again only when stale or empty', async () => {
    const store = memorySamplePhotoStore();
    assert.equal(await captureDue(store), true);
    const targets = samplePhotoTargets();
    assert.ok(targets.length >= 10, 'the sample export’s comps with a page');
    const read: string[] = [];
    const reader: PageReader = {
      async read(url) {
        read.push(url);
        if (url.includes('/closing/')) return { ok: false, code: 'unreadable', message: 'no' };
        return { ok: true, extract: { heroImageUrl: `https://photos.zillowstatic.com/fp/${read.length}-hero.webp`, photos: ['https://evil.example/x.webp', `https://photos.zillowstatic.com/fp/${read.length}-2.webp`] } };
      },
    };
    const { captureSamplePhotos } = await import('../server/sample/photos.ts');
    const kept = await captureSamplePhotos(reader, store);
    assert.equal(read.length, targets.length);
    for (const urls of Object.values(kept)) {
      assert.equal(urls.length, 2);
      assert.ok(urls.every((u) => u.startsWith('https://photos.zillowstatic.com/')));
    }
    assert.deepEqual(await samplePhotos(store), kept);
    assert.equal(await captureDue(store), false);
  });
});

describe('guest mode and the sample, through the API', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let deps: AuthDeps & { samplePhotos: SamplePhotoStore };

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    deps = {
      verifier: {
        async verify(token: string) {
          return token === 'tok-ana-000000000'
            ? ({ id: 'id-ana', email: 'ana@casa-blanca.com', confirmed: true, provider: 'google', name: 'Ana' } as IdentityUser)
            : null;
        },
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com' }),
      pool: pool as unknown as PoolLike,
      guest: { key: KEY },
      samplePhotos: memorySamplePhotoStore(),
    };
  });
  after(async () => {
    await pool.end();
    await db?.drop();
  });

  const guest = `guest.${KEY}`;
  const ana = 'tok-ana-000000000';
  const req = (token: string, path: string, method = 'GET', body?: unknown) =>
    new Request(`https://site${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  test('the key signs in the guest, an agent; a wrong key, or guest mode off, is refused', async () => {
    const me = await handleMe(req(guest, '/api/comp-report/me'), deps);
    assert.equal(me.status, 200);
    const { user } = await me.json();
    assert.deepEqual(
      { email: user.email, role: user.role, guest: user.guest, persisted: user.persisted },
      { email: GUEST_EMAIL, role: 'agent', guest: true, persisted: true },
    );
    assert.equal((await handleMe(req('guest.not-the-key-but-long-enough', '/x'), deps)).status, 401);
    assert.equal((await handleMe(req(guest, '/x'), { ...deps, guest: null })).status, 401);
    assert.equal((await handleMe(req(guest, '/x'), { ...deps, guest: undefined })).status, 401);
    // Identity's own users are untouched by it.
    assert.equal((await (await handleMe(req(ana, '/x'), deps)).json()).user.guest, false);
  });

  test('a guest never sees a real agent’s report', async () => {
    const created = await handleReports(req(ana, '/api/comp-report/reports', 'POST', { title: '25 North Moore Street, #9C' }), deps);
    const { report } = await created.json();
    const list = await (await handleReports(req(guest, '/api/comp-report/reports'), deps)).json();
    assert.ok(!list.reports.some((r: { id: string }) => r.id === report.id));
    assert.equal((await handleReports(req(guest, `/api/comp-report/reports?id=${report.id}`), deps)).status, 404);
    assert.equal((await handleImports(req(guest, '/api/comp-report/imports', 'POST', { reportId: report.id, sample: true }), deps)).status, 404);
  });

  test('a guest may use the sample; an agent may not', async () => {
    assert.equal((await handleSample(req(guest, '/api/comp-report/sample'), deps)).status, 200);
    assert.equal((await handleSample(req(ana, '/api/comp-report/sample'), deps)).status, 403);
    const sample = await (await handleSample(req(guest, '/api/comp-report/sample'), deps)).json();
    assert.equal(sample.title, '100 Barclay Street #17L');
  });

  test('the sample’s comps carry its photos once they’re kept: on a new import, and on an earlier one at the next sample sort', async () => {
    const make = async () => (await (await handleReports(req(guest, '/api/comp-report/reports', 'POST', { title: '100 Barclay Street #17L', propertyType: 'condo' }), deps)).json()).report.id as string;

    // Before any capture: no photos.
    const early = await make();
    let ws = await (await handleImports(req(guest, '/api/comp-report/imports', 'POST', { reportId: early, sample: true }), deps)).json();
    assert.ok(ws.comps.every((c: { photos: string[] }) => c.photos.length === 0));

    // The capture: an agent may not start it; a guest may.
    const reader: PageReader = { async read(url) { return { ok: true, extract: { photos: [`https://photos.zillowstatic.com/fp/${encodeURIComponent(url).slice(-12)}-se_large_800_400.webp`] } }; } };
    const bg = (token: string) => runSamplePhotoCapture(req(token, '/.netlify/functions/comp-report-sample-photos-background', 'POST'), { ...deps, reader });
    assert.equal((await bg(ana)).status, 403);
    assert.deepEqual(await (await bg(guest)).json(), { captured: true, withPhotos: samplePhotoTargets().length });
    assert.deepEqual(await (await bg(guest)).json(), { captured: false });

    // A new sample report has them.
    const later = await make();
    ws = await (await handleImports(req(guest, '/api/comp-report/imports', 'POST', { reportId: later, sample: true }), deps)).json();
    const chambers = ws.comps.find((c: { propertyKey: string }) => c.propertyKey === 'pk1|ny|new york|200 chambers st|10A');
    assert.equal(chambers.photos.length, 1);
    assert.match(chambers.photos[0], /^https:\/\/photos\.zillowstatic\.com\/fp\//);

    // The early one gets them at its next sample sort, keeping its tiers.
    ws = await (await handleComps(req(guest, '/api/comp-report/comps', 'POST', { reportId: early, sample: true }), deps)).json();
    assert.ok(ws.comps.filter((c: { photos: string[] }) => c.photos.length).length >= 10);
    assert.equal(ws.comps.find((c: { propertyKey: string }) => c.propertyKey === 'pk1|ny|new york|200 chambers st|10A').tier, 'primary');
    // Sorting again changes nothing more.
    const again = await (await handleComps(req(guest, '/api/comp-report/comps', 'POST', { reportId: early, sample: true }), deps)).json();
    assert.deepEqual(again.comps.map((c: { photos: string[] }) => c.photos), ws.comps.map((c: { photos: string[] }) => c.photos));
  });

  test('a sample sort also sorts the comps the sample doesn’t know, keeping what the agent gave', async () => {
    const id = (await (await handleReports(req(guest, '/api/comp-report/reports', 'POST', { title: '30 Warren Street #7A' }), deps)).json()).report.id as string;
    const typed = await handleComps(req(guest, '/api/comp-report/comps', 'POST', {
      reportId: id, manual: { address: '30 Warren Street, New York, NY', unit: '#7A', status: 'sold', price: 4380000, date: '2026-08-01', floor: 7 },
      tags: ['Similar size'],
    }), deps);
    assert.equal(typed.status, 201);
    const ws = await (await handleComps(req(guest, '/api/comp-report/comps', 'POST', { reportId: id, sample: true }), deps)).json();
    assert.equal(ws.comps.length, 1);
    const [c] = ws.comps;
    assert.equal(c.tier, 'secondary');
    assert.deepEqual(c.tags, ['Similar size']);
    assert.match(c.note, /placeholder/);
    assert.ok(c.reviewedAt);
    assert.equal(c.reasons.at(-1).sample, true);
  });
});
