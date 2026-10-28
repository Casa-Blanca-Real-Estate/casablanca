// Casanova's condition on Dispatch 12 (#63): the photo side never reaches the
// public site. This runs the agent CMS's real store (netlify/functions/agent-store.mjs)
// and the roster's (agent-pics) against one local Blobs store and checks, at the
// store, the half of it the build can't see:
//
//   - Publish copies draft over live, and `pic` and `placements` are in neither,
//     so `live` (what an agent site renders) never carries them.
//   - The CMS preview link, the one read that needs no token, shows `draft` only.
//   - A CMS save or publish keeps the photo side; a photo write keeps the site.
//   - The pics token can't publish: agent-store refuses it.
//
// The build's half (agents/build.js never renders them) is in agents/build.test.js.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import agentStore from '../../netlify/functions/agent-store.mjs';
import { handlePics, type AgentBlobs, type PicsDeps } from './api.ts';
import { AGENTS_STORE } from './record.ts';
import { FILES_STORE, type FileBlobs } from './files.ts';

const PICS = 'pics-token-0123456789abcdef';
const CMS = 'cms-token-fedcba9876543210';
/** Planted in every photo field a person can type into. It must never surface in what the site reads. */
const MARK = 'PICSIDE-7f3a';

describe('the photo side never reaches the public site', () => {
  let server: BlobsServer;
  let dir: string;
  let pics: PicsDeps;
  const saved: Record<string, string | undefined> = {};

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'agent-pics-boundary-'));
    server = new BlobsServer({ directory: dir, token: 'local' });
    const { port } = await server.start();
    const url = `http://localhost:${port}`;
    for (const k of ['NETLIFY_BLOBS_CONTEXT', 'CB_CMS_TOKEN', 'CB_PICS_TOKEN', 'NETLIFY_BUILD_HOOK']) saved[k] = process.env[k];
    // agent-store.mjs reads its Blobs context and token from the environment, as on Netlify.
    process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({
      edgeURL: url, uncachedEdgeURL: url, siteID: 'local-site', token: 'local',
    })).toString('base64');
    process.env.CB_CMS_TOKEN = CMS;
    delete process.env.NETLIFY_BUILD_HOOK;
    pics = {
      store: getStore({ name: AGENTS_STORE, edgeURL: url, uncachedEdgeURL: url, consistency: 'strong', token: 'local', siteID: 'local-site' }) as unknown as AgentBlobs,
      files: getStore({ name: FILES_STORE, edgeURL: url, uncachedEdgeURL: url, consistency: 'strong', token: 'local', siteID: 'local-site' }) as unknown as FileBlobs,
      env: { CB_PICS_TOKEN: PICS, CB_CMS_TOKEN: CMS },
      now: () => Date.parse('2026-10-14T15:00:00Z'),
    };
  });
  after(async () => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    await server?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  const cms = async (method: string, body?: unknown, query = '', token = CMS) => {
    const res = await agentStore(new Request(`https://studio.test/.netlify/functions/agent-store${query}`, {
      method,
      headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : {},
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text) };
  };
  const picsCall = async (body: unknown) => {
    const res = await handlePics(new Request('https://studio.test/.netlify/functions/agent-pics', {
      method: 'POST', headers: { authorization: `Bearer ${PICS}` }, body: JSON.stringify(body),
    }), pics);
    return { status: res.status, body: await res.json() };
  };
  const draft = (bio: string) => ({
    identity: { name: 'Sam Valk', title: 'Licensed Real Estate Agent' },
    contact: { email: 's.valk@casa-blanca.com' },
    content: { bio },
  });
  const raw = async () => JSON.parse((await pics.store.get('sam-valk', { type: 'text' }))!);

  test('create in the CMS, then a photo write: the record holds both, side by side', async () => {
    assert.equal((await cms('POST', { action: 'create', slug: 'sam-valk', draft: draft('First bio.') })).status, 200);
    const res = await picsCall({
      action: 'update', slug: 'sam-valk', by: MARK,
      pic: { rawInDrive: true, generatedAt: '2026-10-01', notes: `notes ${MARK}` },
      placements: { streeteasy: { state: 'done', note: `note ${MARK}` }, businessCard: { state: 'na', note: MARK } },
    });
    assert.equal(res.status, 200);
    const rec = await raw();
    assert.ok(rec.pic && rec.placements, 'the photo side is on the record');
    assert.equal(rec.draft.content.bio, 'First bio.', 'and the draft is as the CMS left it');
  });

  test('a CMS save keeps the photo side, and keeps it out of the draft', async () => {
    const before = await raw();
    assert.equal((await cms('POST', { action: 'save', slug: 'sam-valk', draft: { ...draft('Second bio.'), pic: { notes: 'smuggled' }, placements: {} } })).status, 200);
    const rec = await raw();
    assert.deepEqual(rec.pic, before.pic);
    assert.deepEqual(rec.placements, before.placements);
    assert.equal(rec.draft.pic, undefined, "the CMS's own field rules drop a pic sent inside a draft");
    assert.equal(rec.draft.placements, undefined);
    assert.equal(rec.draft.content.bio, 'Second bio.');
  });

  test('Publish copies draft to live, and live carries none of the photo side', async () => {
    // A photo write straight before Publish, with no CMS save between them to
    // re-clean the draft: Publish copies the draft exactly as stored.
    assert.equal((await picsCall({ action: 'update', slug: 'sam-valk', pic: { notes: `last ${MARK}` } })).status, 200);
    const res = await cms('POST', { action: 'publish', slug: 'sam-valk' });
    assert.equal(res.status, 200);
    const rec = await raw();
    assert.equal(rec.status, 'live');
    assert.ok(rec.live, 'there is a live snapshot');
    for (const key of ['pic', 'placements', 'raws']) assert.equal(rec.live[key], undefined, `live.${key}`);
    assert.ok(!JSON.stringify(rec.live).includes(MARK), 'no photo field reached live');
    assert.ok(rec.pic && rec.placements, 'and publishing kept the photo side where it was');
  });

  test('the preview link, which needs no token, shows none of the photo side', async () => {
    const token = (await raw()).previewToken;
    const res = await cms('GET', undefined, `?slug=sam-valk&preview=${token}`, '');
    assert.equal(res.status, 200);
    assert.equal(res.body.preview, true);
    assert.ok(!res.text.includes(MARK));
    assert.ok(!/"pic"|"placements"/.test(res.text));
  });

  test("a photo write after publishing leaves the site's record alone", async () => {
    const before = await raw();
    assert.equal((await picsCall({ action: 'update', slug: 'sam-valk', placements: { gmailSig: { state: 'done' } } })).status, 200);
    const { pic: _p, placements: _pl, ...rest } = await raw();
    const { pic: _bp, placements: _bpl, ...restBefore } = before;
    assert.deepEqual(rest, restBefore, 'status, draft, live and publishedAt are untouched');
  });

  test("the pics token can't publish, save, suspend or delete: agent-store refuses it", async () => {
    const before = await raw();
    for (const body of [
      { action: 'publish', slug: 'sam-valk' },
      { action: 'save', slug: 'sam-valk', draft: draft('Hijacked.') },
      { action: 'status', slug: 'sam-valk', status: 'suspended' },
    ]) assert.equal((await cms('POST', body, '', PICS)).status, 401, body.action);
    assert.equal((await cms('DELETE', { slug: 'sam-valk' }, '', PICS)).status, 401);
    assert.equal((await cms('GET', undefined, '', PICS)).status, 401);
    assert.deepEqual(await raw(), before);
  });

  test('and the pics function has no publish of its own', async () => {
    const before = await raw();
    for (const action of ['publish', 'save', 'status', 'delete']) {
      assert.equal((await picsCall({ action, slug: 'sam-valk' })).status, 400, action);
    }
    // Its create makes drafts only, and never over an agent who exists.
    assert.equal((await picsCall({ action: 'create', slug: 'sam-valk', name: 'Sam Valk' })).status, 409);
    assert.deepEqual(await raw(), before);
  });
});
