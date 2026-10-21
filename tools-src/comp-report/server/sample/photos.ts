// The sample's photos: 100 Barclay #17L's comps as StreetEasy shows them.
// Hannah's export has no photos, and nothing here can hold StreetEasy's
// image URLs in the source (they're only known by reading the pages), so the
// deployed site reads each sample comp's listing page once, through the same
// reader as a pasted link (Firecrawl), and keeps the photo URLs it found in a
// site-wide Blobs store. Every preview and production share that one copy:
// about a dozen reads, once.
//
// The photos are linked, never hosted (NW-020 a): what's kept is URLs, cleaned
// with cleanPhotoUrls on the way in and again on the way out. A sample comp
// carries its photos on its export observation's `raw`, which a real export's
// observation never has; workspace.ts shows them on Sort's card.
import { cleanPhotoUrls, parseExport, type CompRecord } from '../../engine/index.ts';
import type { PageReader } from '../links.ts';
import { SAMPLE_EXPORT } from './barclay-17l-export.ts';

/** Where the photos are kept. Production is a Blobs store; tests and local dev pass a map. */
export interface SamplePhotoStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const KEY = 'barclay-17l/v1';
/** A capture that started this long ago and never finished is over: try again. */
const STALE_CAPTURE_MS = 20 * 60_000;
/** A capture that found no photos at all (StreetEasy's wall, say) can be tried again after this. */
const RETRY_EMPTY_MS = 60 * 60_000;
/** Pages read at once: Firecrawl's plans allow a few concurrent requests. */
const AT_ONCE = 2;

type Kept =
  | { state: 'capturing'; startedAt: string }
  | { state: 'done'; capturedAt: string; byProperty: Record<string, string[]> };

/** The sample's comps that have a listing page: property key and URL. */
export function samplePhotoTargets(): { propertyKey: string; url: string }[] {
  const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf, filename: SAMPLE_EXPORT.filename });
  return parsed.comps
    .map((c: CompRecord) => ({ propertyKey: c.identity.key, url: c.identity.streeteasy?.url ?? null }))
    .filter((t): t is { propertyKey: string; url: string } => Boolean(t.propertyKey && t.url));
}

async function readKept(store: SamplePhotoStore): Promise<Kept | null> {
  try {
    const raw = await store.get(KEY);
    return raw ? (JSON.parse(raw) as Kept) : null;
  } catch {
    return null;
  }
}

/** The kept photos by property key, cleaned again; empty until a capture has finished. */
export async function samplePhotos(store: SamplePhotoStore | null | undefined): Promise<Record<string, string[]>> {
  if (!store) return {};
  const kept = await readKept(store);
  if (kept?.state !== 'done') return {};
  const out: Record<string, string[]> = {};
  for (const [key, urls] of Object.entries(kept.byProperty ?? {})) {
    const clean = cleanPhotoUrls(Array.isArray(urls) ? urls : []);
    if (clean.length) out[key] = clean;
  }
  return out;
}

/** Whether a capture should run now: none yet, a stale one, or an empty one an hour old. */
export async function captureDue(store: SamplePhotoStore, now = Date.now()): Promise<boolean> {
  const kept = await readKept(store);
  if (!kept) return true;
  if (kept.state === 'capturing') return now - Date.parse(kept.startedAt) > STALE_CAPTURE_MS;
  const found = Object.values(kept.byProperty ?? {}).some((u) => u.length);
  return !found && now - Date.parse(kept.capturedAt) > RETRY_EMPTY_MS;
}

/**
 * Reads every sample comp's page and keeps the photos found. Runs in a
 * background function; a page that can't be read just has no photos.
 */
export async function captureSamplePhotos(reader: PageReader, store: SamplePhotoStore, now = () => new Date()): Promise<Record<string, string[]>> {
  await store.set(KEY, JSON.stringify({ state: 'capturing', startedAt: now().toISOString() } satisfies Kept));
  const targets = samplePhotoTargets();
  const byProperty: Record<string, string[]> = {};
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const t = targets[next++]!;
      const read = await reader.read(t.url).catch(() => null);
      if (!read?.ok) continue;
      const ex = read.extract;
      const photos = cleanPhotoUrls([ex['heroImageUrl'], ...(Array.isArray(ex['photos']) ? ex['photos'] : [])]);
      if (photos.length) byProperty[t.propertyKey] = photos;
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  await store.set(KEY, JSON.stringify({ state: 'done', capturedAt: now().toISOString(), byProperty } satisfies Kept));
  return byProperty;
}

/** A store in memory, for tests and local dev. */
export function memorySamplePhotoStore(initial: Record<string, string> = {}): SamplePhotoStore {
  const m = new Map(Object.entries(initial));
  return {
    async get(key) {
      return m.get(key) ?? null;
    },
    async set(key, value) {
      m.set(key, value);
    },
  };
}
