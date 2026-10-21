// Phase 2, the files, end to end: the real Blobs client against Blobs' own local
// server. An upload in parts that resumes, a download that comes back byte for
// byte, the parts' sizes held to what was declared, outputs that replace their
// variant, deletes that free every part, and the status rules for stored photos.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { handlePics, type AgentBlobs, type PicsDeps } from './api.ts';
import { AGENTS_STORE, VARIANTS } from './record.ts';
import { FILES_STORE, PART_SIZE, type FileBlobs } from './files.ts';

const PICS = 'pics-token-0123456789abcdef';
const CMS = 'cms-token-fedcba9876543210';
const API = 'https://studio.test/.netlify/functions/agent-pics';

function cmsRecord(slug: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    slug,
    status: 'draft',
    draft: { identity: { name, title: 'Licensed Real Estate Agent' }, contact: { phone: '212-555-0199', email: `${slug}@contact.example` } },
    live: null,
    previewToken: 'preview-token-000',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...extra,
  };
}

/** Bytes that differ part to part, so a part out of order or doubled can't pass for the file. */
function fileBytes(n: number, seed = 7): Uint8Array {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; out[i] = x >>> 24; }
  return out;
}

describe('the profile-pic files (phase 2)', () => {
  let server: BlobsServer;
  let dir: string;
  let store: AgentBlobs;
  let files: FileBlobs;
  let deps: PicsDeps;
  let now = Date.parse('2026-10-21T15:00:00Z');

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'agent-pics-files-'));
    server = new BlobsServer({ directory: dir, token: 'local' });
    const { port } = await server.start();
    const url = `http://localhost:${port}`;
    const opts = { edgeURL: url, uncachedEdgeURL: url, consistency: 'strong' as const, token: 'local', siteID: 'local-site' };
    store = getStore({ name: AGENTS_STORE, ...opts }) as unknown as AgentBlobs;
    files = getStore({ name: FILES_STORE, ...opts }) as unknown as FileBlobs;
    deps = { store, files, env: { CB_PICS_TOKEN: PICS, CB_CMS_TOKEN: CMS }, now: () => now };
  });
  after(async () => {
    await server?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    now = Date.parse('2026-10-21T15:00:00Z');
    const old = await files.list({ prefix: '' });
    await Promise.all(old.blobs.map((b) => files.delete(b.key)));
    await store.set('rikki-t', JSON.stringify(cmsRecord('rikki-t', 'Rikki Tauber')));
    await store.set('_index', JSON.stringify(['rikki-t']));
  });

  const send = async (method: string, qs: string, body?: unknown, token = PICS) => {
    const res = await handlePics(new Request(`${API}${qs}`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: body === undefined ? undefined : body instanceof Uint8Array ? new Uint8Array(body) as Uint8Array<ArrayBuffer> : JSON.stringify(body),
    }), deps);
    const isJson = (res.headers.get('content-type') || '').includes('json');
    return { status: res.status, body: isJson ? await res.json() : null, bytes: isJson ? null : new Uint8Array(await res.arrayBuffer()) };
  };
  const post = (body: Record<string, unknown>) => send('POST', '', { slug: 'rikki-t', by: 'test', ...body });
  const putPart = (id: string, n: number, bytes: Uint8Array) => send('POST', `?slug=rikki-t&upload=${id}&part=${n}`, bytes);
  const partOf = (data: Uint8Array, n: number) => data.subarray(n * PART_SIZE, (n + 1) * PART_SIZE);
  const stored = async () => JSON.parse((await store.get('rikki-t', { type: 'text' }))!);
  const keysUnder = async (prefix: string) => (await files.list({ prefix })).blobs.map((b) => b.key);

  /** Start, send every part, finish. */
  async function upload(role: 'raw' | 'output', filename: string, data: Uint8Array, extra: Record<string, unknown> = {}) {
    const start = await post({ action: 'upload-start', role, filename, bytes: data.length, ...extra });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    const up = start.body.upload;
    for (let n = 0; n < up.parts; n++) assert.equal((await putPart(up.id, n, partOf(data, n))).status, 200);
    const done = await post({ action: 'upload-finish', upload: up.id });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    return done.body;
  }

  async function download(key: string): Promise<Uint8Array> {
    const first = await send('GET', `?slug=rikki-t&file=${key}&part=0`);
    assert.equal(first.status, 200);
    const pieces = [first.bytes!];
    const agent = (await send('GET', '?slug=rikki-t')).body.agent;
    const file = [...agent.pic.raws, ...agent.pic.outputs].find((f: { key: string }) => f.key === key);
    for (let n = 1; n < file.parts; n++) pieces.push((await send('GET', `?slug=rikki-t&file=${key}&part=${n}`)).bytes!);
    return new Uint8Array(Buffer.concat(pieces));
  }

  test('a NEF goes up in parts, resumes after a dropped part, and comes back byte for byte', async () => {
    const nef = fileBytes(2 * PART_SIZE + 12345);
    const start = await post({ action: 'upload-start', role: 'raw', filename: 'Rikki Tauber 01.NEF', bytes: nef.length, capturedAt: '2026-10-02T14:03:00.000Z' });
    assert.equal(start.status, 200);
    const up = start.body.upload;
    assert.equal(up.parts, 3);
    assert.equal(up.kind, 'archive');
    assert.equal(up.partSize, PART_SIZE);

    // Parts 0 and 2 arrive; part 1 is lost.
    await putPart(up.id, 0, partOf(nef, 0));
    await putPart(up.id, 2, partOf(nef, 2));
    const status = await send('GET', `?slug=rikki-t&upload=${up.id}`);
    assert.deepEqual(status.body.received, [0, 2]);
    const pending = (await send('GET', '?slug=rikki-t')).body.uploads;
    assert.equal(pending.length, 1);
    assert.equal(pending[0].received, 2);

    const early = await post({ action: 'upload-finish', upload: up.id });
    assert.equal(early.status, 409);
    assert.deepEqual(early.body.missing, [1]);
    assert.equal((await stored()).pic, undefined, 'an unfinished upload never reaches the record');

    // The resume sends only what's missing.
    await putPart(up.id, 1, partOf(nef, 1));
    const done = await post({ action: 'upload-finish', upload: up.id });
    assert.equal(done.status, 200);
    assert.equal(done.body.file.kind, 'archive');
    assert.equal(done.body.file.bytes, nef.length);
    assert.equal(done.body.file.capturedAt, '2026-10-02T14:03:00.000Z');
    assert.equal(done.body.agent.status, 'raw');
    assert.equal(done.body.agent.archives, 1);
    assert.equal(done.body.agent.working, 0);
    assert.equal(done.body.agent.bytes, nef.length);
    assert.equal(done.body.agent.pic.workingKey, '', 'an archive is never the cutout’s source');
    assert.deepEqual((await send('GET', '?slug=rikki-t')).body.uploads, [], 'the upload note goes once it finishes');

    assert.deepEqual(await download(up.id), nef);
  });

  test("a part must be exactly the size the upload declared, in range, and under the part ceiling", async () => {
    const data = fileBytes(PART_SIZE + 10);
    const up = (await post({ action: 'upload-start', role: 'raw', filename: 'a.jpg', bytes: data.length })).body.upload;
    assert.equal((await putPart(up.id, 0, data.subarray(0, PART_SIZE - 1))).status, 400, 'short');
    assert.equal((await putPart(up.id, 1, data.subarray(PART_SIZE - 1))).status, 400, 'the last part, padded');
    assert.equal((await putPart(up.id, 2, data.subarray(0, 10))).status, 400, 'out of range');
    assert.equal((await putPart(up.id, 0, fileBytes(PART_SIZE + 1))).status, 413);
    assert.equal((await putPart('0'.repeat(24), 0, data.subarray(0, PART_SIZE))).status, 404, 'no such upload');
    assert.deepEqual((await send('GET', `?slug=rikki-t&upload=${up.id}`)).body.received, []);
  });

  test('every file route needs the pics token', async () => {
    const data = fileBytes(100);
    const key = (await upload('raw', 'a.jpg', data)).file.key;
    const up = (await post({ action: 'upload-start', role: 'raw', filename: 'b.jpg', bytes: 10 })).body.upload;
    for (const token of ['', 'nope', CMS]) {
      assert.equal((await send('GET', `?slug=rikki-t&file=${key}&part=0`, undefined, token)).status, 401);
      assert.equal((await send('POST', `?slug=rikki-t&upload=${up.id}&part=0`, fileBytes(10), token)).status, 401);
      assert.equal((await send('GET', `?slug=rikki-t&upload=${up.id}`, undefined, token)).status, 401);
    }
    assert.deepEqual((await send('GET', `?slug=rikki-t&upload=${up.id}`)).body.received, [], 'nothing was stored');
  });

  test('what may be stored: camera files and JPEG/PNG originals, the ten variants, within size', async () => {
    const start = (b: Record<string, unknown>) => post({ action: 'upload-start', bytes: 1000, ...b });
    assert.equal((await start({ role: 'raw', filename: 'x.gif' })).status, 400);
    assert.equal((await start({ role: 'raw', filename: 'noext' })).status, 400);
    assert.equal((await start({ role: 'raw', filename: 'x.NEF', bytes: 201 * 1024 * 1024 })).status, 413);
    assert.equal((await start({ role: 'raw', filename: 'x.jpg', bytes: 0 })).status, 400);
    assert.equal((await start({ role: 'output', filename: 'x.jpg' })).status, 400, 'an output names its variant');
    assert.equal((await start({ role: 'output', filename: 'x.jpg', variant: 'SQ9_Nope' })).status, 400);
    assert.equal((await start({ role: 'output', filename: 'x.nef', variant: 'SQ1_GrayLogo' })).status, 400);
    assert.equal((await start({ role: 'output', filename: 'x.png', variant: 'R1_Logo', bytes: 26 * 1024 * 1024 })).status, 413);
    assert.equal((await start({ role: 'thumbnail', filename: 'x.png' })).status, 400);
    assert.equal((await start({ role: 'raw', filename: 'x.jpg', key: 'mine' })).status, 400, 'a key is the server’s to pick');
    assert.equal((await post({ action: 'upload-start', slug: 'nobody-x', role: 'raw', filename: 'x.jpg', bytes: 10 })).status, 404);
    const ok = await start({ role: 'raw', filename: '../../Rikki 02.dng' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.upload.kind, 'archive');
    assert.ok(!ok.body.upload.filename.includes('/'), 'a filename can’t carry a path');
  });

  test('the first working file becomes the cutout’s source, and an agent can have an archive with none', async () => {
    const nef = await upload('raw', 'Rikki 01.nef', fileBytes(500));
    assert.equal(nef.agent.pic.workingKey, '');
    const jpg = await upload('raw', 'Rikki 01.jpeg', fileBytes(400), { width: 4000, height: 6000 });
    assert.equal(jpg.agent.pic.workingKey, jpg.file.key);
    assert.equal(jpg.file.type, 'image/jpeg');
    assert.equal(jpg.file.width, 4000);
    const png = await upload('raw', 'Rikki 02.png', fileBytes(300));
    assert.equal(png.agent.pic.workingKey, jpg.file.key, 'a second one doesn’t take over');

    const pick = await post({ action: 'update', pic: { workingKey: png.file.key } });
    assert.equal(pick.status, 200);
    assert.equal(pick.body.agent.pic.workingKey, png.file.key);
    assert.equal((await post({ action: 'update', pic: { workingKey: nef.file.key } })).status, 400, 'never an archive');
    assert.equal((await post({ action: 'update', pic: { workingKey: 'f'.repeat(24) } })).status, 400);
  });

  test('the ten outputs stamp the generate, replace their variant, and free the old bytes', async () => {
    await upload('raw', 'Rikki 01.jpg', fileBytes(400), { capturedAt: '2026-10-02T10:00:00Z' });
    let last: { agent: { status: string; outputs: number; generatedAt: string; pic: { variants: { round: string[]; square: string[] } } } } | null = null;
    for (const v of VARIANTS) last = await upload('output', `Rikki_Tauber_${v}.jpg`, fileBytes(200, v.length), { variant: v });
    assert.equal(last!.agent.outputs, 10);
    assert.equal(last!.agent.status, 'generated');
    assert.equal(last!.agent.generatedAt, new Date(now).toISOString());
    assert.deepEqual(last!.agent.pic.variants.round, ['R1_Logo', 'R2_Logo', 'R3_Blank', 'R4_Clean']);
    assert.equal(last!.agent.pic.variants.square.length, 6);

    const first = (await stored()).pic.outputs.find((o: { variant: string }) => o.variant === 'SQ1_GrayLogo');
    now += 3_600_000;
    const again = await upload('output', 'Rikki_Tauber_SQ1_GrayLogo.jpg', fileBytes(250, 99), { variant: 'SQ1_GrayLogo' });
    assert.equal(again.agent.outputs, 10, 'still ten: one per variant');
    assert.deepEqual(await keysUnder(`f/rikki-t/${first.key}/`), [], 'the old one’s parts are gone');
    assert.deepEqual(await download(again.file.key), fileBytes(250, 99));
    assert.equal(again.agent.generatedAt, new Date(now).toISOString());
  });

  test('a stored photo puts the agent back at raw only when it was taken after the last generate', async () => {
    for (const v of VARIANTS) await upload('output', `R_${v}.png`, fileBytes(50), { variant: v });
    const gen = now;
    now += 86_400_000;
    // Last year's originals, stored today: the photo out there is still current.
    let r = await upload('raw', 'Rikki 2025.jpg', fileBytes(60), { capturedAt: '2025-06-01T12:00:00Z' });
    assert.equal(r.agent.status, 'generated');
    // An archive never resets, whenever it's from.
    r = await upload('raw', 'Rikki new.nef', fileBytes(60), { capturedAt: new Date(gen + 3600_000).toISOString() });
    assert.equal(r.agent.status, 'generated');
    // A new shoot's JPEG does.
    r = await upload('raw', 'Rikki new.jpg', fileBytes(60), { capturedAt: new Date(gen + 3600_000).toISOString() });
    assert.equal(r.agent.status, 'raw');
    // And with no EXIF date, the time it was stored stands in.
    await store.set('rikki-t', JSON.stringify(cmsRecord('rikki-t', 'Rikki Tauber')));
    for (const v of VARIANTS) await upload('output', `R_${v}.png`, fileBytes(50), { variant: v });
    now += 60_000;
    r = await upload('raw', 'export.png', fileBytes(60));
    assert.equal(r.agent.status, 'raw');
  });

  test('deleting a file takes it off the record and deletes every part; the working file falls back', async () => {
    const a = await upload('raw', 'a.jpg', fileBytes(PART_SIZE + 5));
    const b = await upload('raw', 'b.jpg', fileBytes(10));
    await post({ action: 'update', pic: { workingKey: b.file.key } });
    assert.equal((await keysUnder(`f/rikki-t/${a.file.key}/`)).length, 2);

    const del = await post({ action: 'file-delete', key: b.file.key });
    assert.equal(del.status, 200);
    assert.equal(del.body.freed, 10);
    assert.equal(del.body.agent.pic.workingKey, a.file.key);
    assert.deepEqual(await keysUnder(`f/rikki-t/${b.file.key}/`), []);
    assert.equal((await send('GET', `?slug=rikki-t&file=${b.file.key}&part=0`)).status, 404);

    await post({ action: 'file-delete', key: a.file.key });
    const after = (await send('GET', '?slug=rikki-t')).body.agent;
    assert.equal(after.raws, 0);
    assert.equal(after.bytes, 0);
    assert.equal(after.pic.workingKey, '');
    assert.deepEqual(await keysUnder('f/rikki-t/'), [], 'nothing left in the store');
    assert.equal((await post({ action: 'file-delete', key: a.file.key })).status, 404);
  });

  test('discarding an unfinished upload deletes what arrived; a finished one has to be deleted as a file', async () => {
    const data = fileBytes(PART_SIZE * 2);
    const up = (await post({ action: 'upload-start', role: 'raw', filename: 'big.nef', bytes: data.length })).body.upload;
    await putPart(up.id, 0, partOf(data, 0));
    assert.equal((await post({ action: 'upload-abort', upload: up.id })).status, 200);
    assert.deepEqual(await keysUnder(`f/rikki-t/${up.id}/`), []);
    assert.deepEqual(await keysUnder(`up/rikki-t/`), []);

    const done = await upload('raw', 'small.jpg', fileBytes(10));
    assert.equal((await post({ action: 'upload-abort', upload: done.file.key })).status, 409);
    assert.equal((await keysUnder(`f/rikki-t/${done.file.key}/`)).length, 1);
  });

  test('the bytes never land in the agent store, and the CMS’s side of the record is untouched', async () => {
    const before = await stored();
    await upload('raw', 'a.nef', fileBytes(1000));
    const afterRec = await stored();
    for (const k of Object.keys(before)) assert.deepEqual(afterRec[k], before[k], `${k} changed`);
    assert.deepEqual(Object.keys(afterRec).sort(), [...Object.keys(before), 'pic'].sort());
    assert.ok(JSON.stringify(afterRec).length < 2000, 'the record holds what the file is, not its bytes');
    const roster = (await send('GET', '')).body.roster;
    assert.equal(roster[0].bytes, 1000);
    assert.equal(roster[0].archives, 1);
  });

  test('the server’s file fields can’t be written through update', async () => {
    for (const pic of [{ raws: [] }, { outputs: [] }, { variants: { round: [], square: [] } }]) {
      assert.equal((await post({ action: 'update', pic })).status, 400);
    }
  });

  test('an agent holds a dozen unfinished uploads at most', async () => {
    for (let i = 0; i < 12; i++) assert.equal((await post({ action: 'upload-start', role: 'raw', filename: `${i}.jpg`, bytes: 10 })).status, 200);
    assert.equal((await post({ action: 'upload-start', role: 'raw', filename: 'x.jpg', bytes: 10 })).status, 409);
  });
});
