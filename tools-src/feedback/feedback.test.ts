// The team Feedback button's function against Blobs' own local server: posting
// stays open to any page, reading back is gone, and no submission can
// overwrite another.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { handleFeedback, MAX_FIELD, MAX_MESSAGE, readFeedback, type FeedbackBlobs } from './feedback.ts';

const FN = 'https://studio.test/.netlify/functions/feedback';

describe('the team Feedback function', () => {
  let server: BlobsServer;
  let dir: string;
  let port = 0;
  let stores = 0;
  let now = Date.parse('2026-09-29T12:00:00Z');
  const clock = { now: () => now, random: (n: number) => randomBytes(n) };

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'feedback-blobs-'));
    server = new BlobsServer({ directory: dir, token: 'local' });
    ({ port } = await server.start());
  });
  after(async () => {
    await server?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  /** A store of its own per test. */
  const fresh = () => getStore({ name: `cb-feedback-${++stores}`, edgeURL: `http://localhost:${port}`, token: 'local', siteID: 'local-site' }) as unknown as FeedbackBlobs;
  const post = (store: FeedbackBlobs, body: unknown, raw?: string) =>
    handleFeedback(new Request(FN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body) }), store, clock);

  test('anyone can post, from any site — the tray on GitHub Pages posts cross-origin', async () => {
    const store = fresh();
    const pre = await handleFeedback(new Request(FN, { method: 'OPTIONS' }), store, clock);
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), '*');
    assert.equal(pre.headers.get('access-control-allow-methods'), 'POST, OPTIONS', 'the preflight no longer offers GET');

    const res = await post(store, { name: ' Ana ', email: 'ana@casa-blanca.com', message: '  The sort step is slow.  ', tool: 'Comp Report' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(await readFeedback(store), [
      { name: 'Ana', email: 'ana@casa-blanca.com', message: 'The sort step is slow.', tool: 'Comp Report', ts: '2026-09-29T12:00:00.000Z' },
    ]);
    const { blobs } = await store.list({ prefix: '' });
    assert.equal(blobs.length, 1);
    assert.match(blobs[0]!.key, /^items\/20260929T120000000Z-[0-9a-f]{12}$/, 'one blob per submission, keyed by time');
  });

  test('nothing reads the list back here: GET and every other method get 405 and no data', async () => {
    const store = fresh();
    await post(store, { name: 'Ana', email: 'ana@casa-blanca.com', message: 'Private-ish.' });
    await store.setJSON('list', [{ name: 'Old', email: 'old@example.com', message: 'From the old list.', tool: '', ts: '2026-01-01T00:00:00.000Z' }]);
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE']) {
      const res = await handleFeedback(new Request(FN, { method }), store, clock);
      assert.equal(res.status, 405, method);
      assert.equal(res.headers.get('access-control-allow-origin'), null, `${method}: no CORS, so no other site can even read the refusal`);
      const text = method === 'HEAD' ? '' : await res.text();
      assert.ok(!/ana@|old@|Private|old list/.test(text), `${method} leaked a submission`);
    }
  });

  test('bad posts are refused, and say why', async () => {
    const store = fresh();
    const cases: [unknown, string | undefined, number, string][] = [
      [undefined, '{not json', 400, 'invalid_json'],
      [[1, 2], undefined, 400, 'invalid_body'],
      [null, undefined, 400, 'invalid_body'],
      [{ name: 'Ana' }, undefined, 400, 'message_required'],
      [{ message: '   \n ' }, undefined, 400, 'message_required'],
      [{ message: 42 }, undefined, 400, 'message_required'],
      [{ message: 'x'.repeat(MAX_MESSAGE + 1) }, undefined, 413, 'too_long'],
      [undefined, JSON.stringify({ message: 'hi', pad: 'x'.repeat(17 * 1024) }), 413, 'too_large'],
    ];
    for (const [body, raw, status, error] of cases) {
      const res = await post(store, body, raw);
      assert.equal(res.status, status, error);
      assert.equal((await res.json()).error, error);
    }
    assert.equal((await post(store, { message: 'x'.repeat(MAX_MESSAGE) })).status, 200, 'exactly the limit is fine');
    assert.equal((await readFeedback(store)).length, 1, 'only that one was kept');
  });

  test('names, emails and tools are trimmed and clipped; anything not text is dropped', async () => {
    const store = fresh();
    await post(store, { name: 'N'.repeat(500), email: { evil: true }, tool: ['x'], message: 'Hello' });
    const [item] = await readFeedback(store);
    assert.equal(item!.name.length, MAX_FIELD);
    assert.equal(item!.email, '');
    assert.equal(item!.tool, '');
  });

  test('ten sent at once all land: nothing is read, changed and written back', async () => {
    const store = fresh();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => post(store, { message: `Note ${i}` })));
    assert.ok(results.every((r) => r.status === 200));
    assert.deepEqual((await readFeedback(store)).map((f) => f.message).sort(), Array.from({ length: 10 }, (_, i) => `Note ${i}`).sort());
  });

  test('the old single list is still read, merged in, newest first; broken entries are skipped', async () => {
    const store = fresh();
    await store.setJSON('list', [
      { name: 'Old', email: '', message: 'Second oldest', tool: 'Brand', ts: '2026-08-02T00:00:00.000Z' },
      { name: 7, message: 'Oldest', ts: '2026-08-01T00:00:00.000Z' },
      { message: 'No time' },
      'not an object',
    ]);
    now = Date.parse('2026-09-29T13:00:00Z');
    await post(store, { message: 'Newer' });
    now += 60_000;
    await post(store, { message: 'Newest' });
    const all = await readFeedback(store);
    assert.deepEqual(all.map((f) => f.message), ['Newest', 'Newer', 'Second oldest', 'Oldest']);
    assert.equal(all[3]!.name, '', 'a name that isn’t text is dropped');
    assert.deepEqual((await readFeedback(store, 2)).map((f) => f.message), ['Newest', 'Newer']);
  });

  test('a store failure is a plain 500: it says nothing about the store', async (t) => {
    t.mock.method(console, 'error', () => {});
    const broken: FeedbackBlobs = {
      get: async () => null,
      list: async () => ({ blobs: [] }),
      setJSON: async () => { throw new Error('BlobsInternalError: token abc123 rejected by https://internal'); },
    };
    const res = await post(broken, { message: 'Hello' });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'internal');
    assert.ok(!JSON.stringify(body).includes('abc123'), 'the old function echoed its error message to anyone');
  });
});
