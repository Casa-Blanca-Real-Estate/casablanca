// The email's photos (Dispatch 26 item 4): only a photo on PHOTO_HOSTS is ever
// fetched, a second copy reuses the first, only an image of a known type and
// size is kept, and the public route serves only a key this module issued.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyable, copyPhoto, copyPhotos, MAX_PHOTO_BYTES, memoryEmailPhotoStore, PHOTO_KEY, photoPath, servePhoto, type PhotoFetch } from './email-photos.ts';

const ON = 'https://photos.zillowstatic.com/fp/abc-se_large_800_400.webp';
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).buffer;

function fetcher(reply: Awaited<ReturnType<PhotoFetch>> = { ok: true, data: jpeg, contentType: 'image/jpeg' }) {
  const asked: string[] = [];
  const f: PhotoFetch = async (url) => {
    asked.push(url);
    return reply;
  };
  return { f, asked };
}

test('a photo off PHOTO_HOSTS, or not https, or with userinfo or a port, is never fetched', async () => {
  const store = memoryEmailPhotoStore();
  const { f, asked } = fetcher();
  for (const url of [
    'https://example.com/a.jpg',
    'http://photos.zillowstatic.com/fp/a.jpg',
    'https://user@photos.zillowstatic.com/fp/a.jpg',
    'https://photos.zillowstatic.com:8443/fp/a.jpg',
    'https://photos.zillowstatic.com.evil.test/a.jpg',
    'https://evil.test/?u=https://photos.zillowstatic.com/a.jpg',
    'javascript:alert(1)',
    42,
    null,
  ]) {
    assert.equal(copyable(url), null, String(url));
    assert.equal(await copyPhoto(store, f, 'r1', url), null);
  }
  assert.deepEqual(asked, []);
  assert.equal(store.photos.size, 0);
});

test('a photo on PHOTO_HOSTS is copied once per report, under a random key, and reused', async () => {
  const store = memoryEmailPhotoStore();
  const { f, asked } = fetcher();
  const key = (await copyPhoto(store, f, 'r1', ON))!;
  assert.match(key, PHOTO_KEY);
  assert.ok(!key.includes('zillow'));
  assert.equal(await copyPhoto(store, f, 'r1', ON), key, 'the second copy reuses the first');
  const other = (await copyPhoto(store, f, 'r2', ON))!;
  assert.notEqual(other, key, 'another report gets its own copy');
  assert.equal(asked.length, 2);
});

test('only an image of a known type and a bounded size is kept; a failed fetch keeps nothing', async () => {
  const store = memoryEmailPhotoStore();
  assert.equal(await copyPhoto(store, fetcher({ ok: true, data: jpeg, contentType: 'text/html' }).f, 'r1', ON), null);
  assert.equal(await copyPhoto(store, fetcher({ ok: true, data: jpeg, contentType: 'image/svg+xml' }).f, 'r1', ON), null);
  assert.equal(await copyPhoto(store, fetcher({ ok: true, data: new ArrayBuffer(0), contentType: 'image/jpeg' }).f, 'r1', ON), null);
  assert.equal(await copyPhoto(store, fetcher({ ok: true, data: new ArrayBuffer(MAX_PHOTO_BYTES + 1), contentType: 'image/jpeg' }).f, 'r1', ON), null);
  assert.equal(await copyPhoto(store, fetcher({ ok: false, reason: 'status 404' }).f, 'r1', ON), null);
  assert.equal(await copyPhoto(store, async () => { throw new Error('boom'); }, 'r1', ON), null);
  assert.equal(store.photos.size, 0);
  assert.ok(await copyPhoto(store, fetcher({ ok: true, data: jpeg, contentType: 'image/JPEG; charset=binary' }).f, 'r1', ON));
});

test('copyPhotos: by the caller’s id, missing where there’s no copy', async () => {
  const store = memoryEmailPhotoStore();
  const out = await copyPhotos(store, fetcher().f, 'r1', [
    { id: 'a', url: ON }, { id: 'b', url: 'https://example.com/b.jpg' }, { id: 'c', url: `${ON}?2` },
  ]);
  assert.deepEqual(Object.keys(out).sort(), ['a', 'c']);
});

test('the route serves only a key it issued, and nothing else', async () => {
  const store = memoryEmailPhotoStore();
  const key = (await copyPhoto(store, fetcher().f, 'r1', ON))!;
  const get = (k: string, method = 'GET') => servePhoto(new Request(`https://x.test${photoPath(k)}`, { method }), store);

  const ok = await get(key);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/jpeg');
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.match(ok.headers.get('cache-control')!, /immutable/);
  assert.deepEqual(new Uint8Array(await ok.arrayBuffer()), new Uint8Array(jpeg));
  assert.equal((await get(key, 'HEAD')).status, 200);
  assert.equal((await get(key, 'POST')).status, 405);

  const [indexName] = [...store.index.keys()];
  for (const k of ['', 'x', key.slice(1), `${key}A`, indexName!, '../p/' + key, 'A'.repeat(43)]) {
    assert.equal((await get(encodeURIComponent(k))).status, 404, k);
  }
  assert.equal((await servePhoto(new Request(`https://x.test${photoPath(key)}`), null)).status, 404);
});

test('a stored photo whose type isn’t an image is never served', async () => {
  const store = memoryEmailPhotoStore();
  const key = 'B'.repeat(43);
  store.photos.set(key, { data: jpeg, contentType: 'text/html' });
  assert.equal((await servePhoto(new Request(`https://x.test${photoPath(key)}`), store)).status, 404);
});
