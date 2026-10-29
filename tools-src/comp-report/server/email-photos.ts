// The email's photos, for real (Dispatch 26 item 4; D-28, NB-3 B). On Sort a
// comp's photos are linked, never copied (NW-020 a). The client's email is
// different: it outlives the listing, and StreetEasy's image links can change
// or stop, so when the agent copies the Designed email, each shown comp's hero
// photo (and the home's) is copied once into Casa's Blobs store and served
// from a public route under /api/comp-report/, by a long random key with no
// listing in the URL. Casa keeps the copies, for reference.
//
// What's copied is held to the same rule as everything else about photos:
// only a URL cleanPhotoUrls keeps (https, StreetEasy's image hosts, PHOTO_HOSTS)
// is ever fetched, the fetch follows no redirect, and only an image of a known
// type and a bounded size is kept. The route serves only a key this module
// issued: the shape is checked before the store is asked, and an index entry
// (one per report and source URL, so a second copy reuses the first) can't be
// asked for, since photos and the index live under different prefixes.
import { createHash, randomBytes } from 'node:crypto';
import { cleanPhotoUrls } from '../engine/index.ts';

/** Where the copies are kept. Production is a Blobs store; tests and local dev pass memory. */
export interface EmailPhotoStore {
  getPhoto(key: string): Promise<{ data: ArrayBuffer; contentType: string } | null>;
  setPhoto(key: string, data: ArrayBuffer, meta: { contentType: string; reportId: string; source: string; at: string }): Promise<void>;
  getIndex(name: string): Promise<string | null>;
  setIndex(name: string, key: string): Promise<void>;
}

/** One photo's bytes, or why not. */
export type PhotoFetch = (url: string) => Promise<{ ok: true; data: ArrayBuffer; contentType: string } | { ok: false; reason: string }>;

export const PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
/** 32 random bytes, base64url: 43 characters. */
export const PHOTO_KEY = /^[A-Za-z0-9_-]{43}$/;
export const PHOTO_ROUTE = '/api/comp-report/email-photo';

export const photoPath = (key: string) => `${PHOTO_ROUTE}?k=${key}`;

/** The source URL as it may be copied: the same URL back when cleanPhotoUrls keeps it unchanged, else null. */
export function copyable(url: unknown): string | null {
  const kept = cleanPhotoUrls([url])[0];
  return kept && kept === url ? kept : null;
}

const indexName = (reportId: string, url: string) => createHash('sha256').update(`${reportId}\n${url}`).digest('hex');

/**
 * One photo copied into the store, or reused from an earlier copy for this
 * report: its key, or null when the URL isn't one we copy or the fetch failed.
 */
export async function copyPhoto(store: EmailPhotoStore, fetchPhoto: PhotoFetch, reportId: string, url: unknown, now = () => new Date()): Promise<string | null> {
  const source = copyable(url);
  if (!source) return null;
  return keepCopy(store, reportId, source, () => fetchPhoto(source), now);
}

/**
 * One image kept in the store under a fresh key, once per owner and source: the
 * key of the earlier copy when there is one, else `load`'s bytes, held to the
 * same types and size. The agent's headshot (server/agent-card.ts) comes this
 * way, from Casa's own photo store rather than a fetch.
 */
export async function keepCopy(
  store: EmailPhotoStore, owner: string, source: string, load: () => ReturnType<PhotoFetch>, now = () => new Date(),
): Promise<string | null> {
  const reportId = owner;
  const name = indexName(owner, source);
  const known = await store.getIndex(name).catch(() => null);
  if (known && PHOTO_KEY.test(known) && (await store.getPhoto(known).catch(() => null))) return known;
  const got = await load().catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }));
  if (!got.ok) return null;
  const type = got.contentType.split(';')[0]!.trim().toLowerCase();
  if (!PHOTO_TYPES.includes(type) || !got.data.byteLength || got.data.byteLength > MAX_PHOTO_BYTES) return null;
  const key = randomBytes(32).toString('base64url');
  await store.setPhoto(key, got.data, { contentType: type, reportId, source, at: now().toISOString() });
  await store.setIndex(name, key);
  return key;
}

/** Copies several at once, a few at a time: the result by the caller's id, missing where there's no copy. */
export async function copyPhotos(
  store: EmailPhotoStore, fetchPhoto: PhotoFetch, reportId: string, wanted: { id: string; url: string }[], atOnce = 4,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let next = 0;
  const worker = async () => {
    while (next < wanted.length) {
      const w = wanted[next++]!;
      const key = await copyPhoto(store, fetchPhoto, reportId, w.url).catch(() => null);
      if (key) out[w.id] = key;
    }
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, wanted.length) }, worker));
  return out;
}

/** GET /api/comp-report/email-photo?k=<key>: public by design, and only for a key this module issued. */
export async function servePhoto(req: Request, store: EmailPhotoStore | null | undefined): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Use GET.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const key = new URL(req.url).searchParams.get('k') ?? '';
  const missing = () => new Response('Not found.', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  if (!store || !PHOTO_KEY.test(key)) return missing();
  const photo = await store.getPhoto(key).catch(() => null);
  if (!photo || !PHOTO_TYPES.includes(photo.contentType)) return missing();
  return new Response(req.method === 'HEAD' ? null : photo.data, {
    status: 200,
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}

/** The production fetch: https, no redirects, a timeout, and the size checked before and after. */
export const fetchListingPhoto: PhotoFetch = async (url) => {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Accept: 'image/*' } });
  if (!res.ok) return { ok: false, reason: `status ${res.status}` };
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_PHOTO_BYTES) return { ok: false, reason: 'too large' };
  const data = await res.arrayBuffer();
  return { ok: true, data, contentType: res.headers.get('content-type') ?? '' };
};

/** A store in memory, for tests and local dev. */
export function memoryEmailPhotoStore(): EmailPhotoStore & { photos: Map<string, { data: ArrayBuffer; contentType: string }>; index: Map<string, string> } {
  const photos = new Map<string, { data: ArrayBuffer; contentType: string }>();
  const index = new Map<string, string>();
  return {
    photos,
    index,
    async getPhoto(key) {
      return photos.get(key) ?? null;
    },
    async setPhoto(key, data, meta) {
      photos.set(key, { data, contentType: meta.contentType });
    },
    async getIndex(name) {
      return index.get(name) ?? null;
    },
    async setIndex(name, key) {
      index.set(name, key);
    },
  };
}
