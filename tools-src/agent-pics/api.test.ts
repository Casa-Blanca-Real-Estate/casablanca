// The profile-pic roster's API end to end: the real Blobs client against Blobs'
// own local server. Checks the token gate (unset, shared with the CMS, wrong,
// right), that reads carry no contact details, the derived status through every
// step, and that a write changes `pic` and `placements` and nothing else.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { handlePics, type AgentBlobs, type PicsDeps } from './api.ts';
import { PLACEMENTS, AGENTS_STORE } from './record.ts';
import { FILES_STORE, type FileBlobs } from './files.ts';

const PICS = 'pics-token-0123456789abcdef';
const CMS = 'cms-token-fedcba9876543210';

/** A record as agent-store.mjs's `create` writes it, with contact details that must never come back. */
function cmsRecord(slug: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    slug,
    status: 'draft',
    draft: {
      identity: { name, displayName: '', title: 'Licensed Real Estate Agent', licenseNumber: '' },
      contact: { phone: '212-555-0199', email: `${slug}@contact.example`, instagram: '', linkedin: '', streeteasy: '' },
    },
    live: null,
    previewToken: 'preview-token-000',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    updatedBy: 'Kimani',
    publishedAt: '',
    ...extra,
  };
}

describe('the profile-pic roster API', () => {
  let server: BlobsServer;
  let dir: string;
  let store: AgentBlobs;
  let files: FileBlobs;
  let deps: PicsDeps;
  let now = Date.parse('2026-10-14T15:00:00Z');

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'agent-pics-blobs-'));
    server = new BlobsServer({ directory: dir, token: 'local' });
    const { port } = await server.start();
    const url = `http://localhost:${port}`;
    store = getStore({ name: AGENTS_STORE, edgeURL: url, uncachedEdgeURL: url, consistency: 'strong', token: 'local', siteID: 'local-site' }) as unknown as AgentBlobs;
    files = getStore({ name: FILES_STORE, edgeURL: url, uncachedEdgeURL: url, consistency: 'strong', token: 'local', siteID: 'local-site' }) as unknown as FileBlobs;
    deps = { store, files, env: { CB_PICS_TOKEN: PICS, CB_CMS_TOKEN: CMS }, now: () => now };
  });
  after(async () => {
    await server?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    now = Date.parse('2026-10-14T15:00:00Z');
    deps.env = { CB_PICS_TOKEN: PICS, CB_CMS_TOKEN: CMS };
    await store.set('rikki-t', JSON.stringify(cmsRecord('rikki-t', 'Rikki Tauber')));
    await store.set('james-c', JSON.stringify(cmsRecord('james-c', 'James Campanella')));
    await store.set('_index', JSON.stringify(['rikki-t', 'james-c']));
  });

  const call = async (method: string, opts: { token?: string; slug?: string; body?: unknown; raw?: string } = {}) => {
    const qs = opts.slug ? `?slug=${opts.slug}` : '';
    const res = await handlePics(new Request(`https://studio.test/.netlify/functions/agent-pics${qs}`, {
      method,
      headers: opts.token === undefined ? {} : { authorization: `Bearer ${opts.token}` },
      body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    }), deps);
    const text = await res.text();
    return { status: res.status, text, body: text ? JSON.parse(text) : null };
  };
  const update = (slug: string, patch: Record<string, unknown>) => call('POST', { token: PICS, body: { action: 'update', slug, by: 'test', ...patch } });
  const stored = async (slug: string) => JSON.parse((await store.get(slug, { type: 'text' }))!);

  /* ── the gate ── */

  test('with no CB_PICS_TOKEN set, it refuses everything', async () => {
    deps.env = { CB_CMS_TOKEN: CMS };
    assert.equal((await call('GET', { token: '' })).status, 503);
    assert.equal((await call('GET', { token: 'anything' })).status, 503);
    assert.equal((await update('rikki-t', { pic: { rawInDrive: true } })).status, 503);
  });

  test('with CB_PICS_TOKEN the same as CB_CMS_TOKEN, it refuses everything', async () => {
    deps.env = { CB_PICS_TOKEN: CMS, CB_CMS_TOKEN: CMS };
    const res = await call('GET', { token: CMS });
    assert.equal(res.status, 503);
    assert.match(res.body.message, /same as CB_CMS_TOKEN/);
  });

  test('every method needs the pics token: none, a wrong one and the CMS one are all 401', async () => {
    for (const token of [undefined, '', 'wrong', CMS, `${PICS}x`]) {
      assert.equal((await call('GET', { token })).status, 401, `GET roster with ${token}`);
      assert.equal((await call('GET', { token, slug: 'rikki-t' })).status, 401, `GET one with ${token}`);
      assert.equal((await call('POST', { token, body: { action: 'update', slug: 'rikki-t', pic: { rawInDrive: true } } })).status, 401);
    }
    assert.equal((await stored('rikki-t')).pic, undefined, 'nothing was written');
  });

  test('a preflight gets 204 with no body', async () => {
    const res = await call('OPTIONS');
    assert.equal(res.status, 204);
    assert.equal(res.text, '');
  });

  test('anything but GET and POST is 405', async () => {
    assert.equal((await call('DELETE', { token: PICS, body: { slug: 'rikki-t' } })).status, 405);
    assert.ok(await store.get('rikki-t', { type: 'text' }), 'and nothing was deleted');
  });

  /* ── reads ── */

  test('the roster lists every agent in the store, by name, and works for records the CMS made', async () => {
    const res = await call('GET', { token: PICS });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.roster.map((r: { slug: string }) => r.slug), ['james-c', 'rikki-t']);
    const rikki = res.body.roster[1];
    assert.equal(rikki.name, 'Rikki Tauber');
    assert.equal(rikki.status, 'none');
    assert.equal(rikki.placed, 0);
    assert.deepEqual(Object.keys(rikki.placements), [...PLACEMENTS]);
  });

  test('an empty store is an empty roster, not an error', async () => {
    const empty = { ...deps, store: { get: async () => null, set: async () => undefined, list: async () => ({ blobs: [] }) } };
    const res = await handlePics(new Request('https://studio.test/x', { headers: { authorization: `Bearer ${PICS}` } }), empty);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).roster, []);
  });

  test("reads never carry the CMS's contact details, draft or preview token", async () => {
    for (const res of [await call('GET', { token: PICS }), await call('GET', { token: PICS, slug: 'rikki-t' })]) {
      assert.equal(res.status, 200);
      for (const secret of ['212-555-0199', '@contact.example', 'preview-token-000', 'licenseNumber', '"draft":', '"live":', '"contact"']) {
        assert.ok(!res.text.includes(secret), `a read leaked ${secret}`);
      }
    }
  });

  test('an unknown slug is 404 and a malformed one 400', async () => {
    assert.equal((await call('GET', { token: PICS, slug: 'nobody-x' })).status, 404);
    assert.equal((await call('GET', { token: PICS, slug: '../_index' })).status, 400);
  });

  /* ── the derived status ── */

  test('none → raw → generated → deployed, then back to generated when a new photo is made', async () => {
    let res = await update('rikki-t', { pic: { rawInDrive: true } });
    assert.equal(res.body.agent.status, 'raw');

    res = await update('rikki-t', { pic: { generatedAt: '2026-10-10' } });
    assert.equal(res.body.agent.status, 'generated');

    now += 60_000;
    res = await update('rikki-t', {
      placements: {
        gmailSig: { state: 'done' }, gmailAvatar: { state: 'done' }, filemaker: { state: 'done' },
        streeteasy: { state: 'done' }, businessCard: { state: 'na', note: 'no card ordered' },
      },
    });
    assert.equal(res.body.agent.status, 'deployed');
    assert.equal(res.body.agent.placed, 5);

    // A new set, generated after those placements: they're stale, not done.
    now += 24 * 3600_000;
    res = await update('rikki-t', { pic: { generatedAt: new Date(now).toISOString() } });
    assert.equal(res.body.agent.status, 'generated');
    assert.equal(res.body.agent.placements.gmailSig, 'stale');
    assert.equal(res.body.agent.placements.businessCard, 'na', "a placement that doesn't apply stays resolved");
    assert.equal(res.body.agent.placed, 1);

    // Ticking it again brings it up to date.
    now += 60_000;
    res = await update('rikki-t', { placements: { gmailSig: { state: 'done' } } });
    assert.equal(res.body.agent.placements.gmailSig, 'done');
    assert.equal(res.body.agent.placed, 2);
  });

  test('a raw stored after the last generate puts the agent back at raw', async () => {
    const rec = cmsRecord('james-c', 'James Campanella', {
      pic: {
        generatedAt: '2026-09-01T00:00:00.000Z',
        raws: [{ key: 'raws/james-c/1', filename: 'James Campanella 05.jpeg', bytes: 4_200_000, uploadedAt: '2026-10-02T00:00:00.000Z' }],
      },
    });
    await store.set('james-c', JSON.stringify(rec));
    const res = await call('GET', { token: PICS, slug: 'james-c' });
    assert.equal(res.body.agent.status, 'raw');
    assert.equal(res.body.agent.raws, 1);
  });

  test("a placement's date is stamped by the server when its state flips, not when its note changes", async () => {
    let res = await update('rikki-t', { placements: { streeteasy: { state: 'done' } } });
    const at = res.body.agent.placementLog.streeteasy.at;
    assert.equal(at, '2026-10-14T15:00:00.000Z');
    now += 3600_000;
    res = await update('rikki-t', { placements: { streeteasy: { note: 'uploaded via the agent portal' } } });
    assert.equal(res.body.agent.placementLog.streeteasy.at, at);
    assert.equal(res.body.agent.placementLog.streeteasy.note, 'uploaded via the agent portal');
  });

  /* ── what a write may touch ── */

  test('a write changes pic and placements and leaves every other byte of the record as it was', async () => {
    const before = await stored('rikki-t');
    await update('rikki-t', { pic: { rawInDrive: true, notes: 'reshoot booked' }, placements: { filemaker: { state: 'na' } } });
    const afterWrite = await stored('rikki-t');
    const { pic, placements, ...rest } = afterWrite;
    assert.deepEqual(rest, before, 'draft, live, status, previewToken and the CMS timestamps are untouched');
    assert.equal(pic.notes, 'reshoot booked');
    assert.equal(pic.updatedBy, 'test');
    assert.equal(placements.filemaker.state, 'na');
  });

  test("a body naming anything outside pic and placements is refused whole, and nothing is written", async () => {
    const before = await stored('rikki-t');
    for (const extra of [
      { draft: { identity: { name: 'Hijacked' } } },
      { live: { identity: { name: 'Hijacked' } } },
      { status: 'live' },
      { previewToken: 'mine' },
      { action: 'publish' },
    ]) {
      const res = await call('POST', { token: PICS, body: { action: 'update', slug: 'rikki-t', pic: { rawInDrive: true }, ...extra } });
      assert.equal(res.status, 400, JSON.stringify(extra));
    }
    assert.deepEqual(await stored('rikki-t'), before);
  });

  test("the server's own fields in pic can't be written", async () => {
    for (const pic of [{ raws: [] }, { variants: { round: ['x'] } }, { sigPhotoKey: 'x' }, { updatedAt: '2020-01-01' }]) {
      const res = await update('rikki-t', { pic });
      assert.equal(res.status, 400, JSON.stringify(pic));
      assert.equal(res.body.error, 'not-writable');
    }
  });

  test('bad placements, states, dates and types are refused', async () => {
    const bad = [
      { placements: { instagram: { state: 'done' } } },
      { placements: { streeteasy: { state: 'posted' } } },
      { placements: { streeteasy: { state: 'done', at: '2020-01-01' } } },
      { placements: { streeteasy: 'done' } },
      { pic: { rawInDrive: 'yes' } },
      { pic: { generatedAt: 'last week' } },
      { pic: { generatedAt: '2014-12-31' } },
      { pic: { generatedAt: '2026-12-01' } },
      { pic: 'raw' },
    ];
    for (const patch of bad) assert.equal((await update('rikki-t', patch)).status, 400, JSON.stringify(patch));
    assert.equal((await stored('rikki-t')).pic, undefined);
  });

  test('agents are never created here: an update for an unknown slug is 404 and writes nothing', async () => {
    const res = await update('nobody-x', { pic: { rawInDrive: true } });
    assert.equal(res.status, 404);
    assert.equal(await store.get('nobody-x', { type: 'text' }), null);
  });

  test('markup and control characters are stripped from notes', async () => {
    const res = await update('rikki-t', { pic: { notes: '<b>reshoot</b>\u0007 Friday' } });
    assert.equal(res.body.agent.pic.notes, 'breshoot/b Friday');
  });

  test('a body over 32 KB is refused', async () => {
    const res = await call('POST', { token: PICS, raw: JSON.stringify({ action: 'update', slug: 'rikki-t', pic: { notes: 'x'.repeat(40_000) } }) });
    assert.equal(res.status, 413);
  });
});
