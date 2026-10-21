// A listing's photos (NW-020 a, Dispatch 16). The page is third-party text and
// the whole extract reaches the browser, so a photo URL is kept only if it's
// plainly one of StreetEasy's images: https, no userinfo, no port, on a host
// in PHOTO_HOSTS. Everything else is dropped, never stored. The server runs
// this before it stores a read (cleanListingExtract), the parser runs it again
// when it builds the record, and Dispatch 20 runs it once more before a photo
// reaches the client. Photos are linked, never proxied or copied (§ design,
// "listing photos linked, not hosted").

/**
 * StreetEasy's image hosts: an exact host, or any subdomain of one. Dispatch
 * 17's live probe (2026-10-21) saw every photo on photos.zillowstatic.com, on
 * all seven pages it read. PROVISIONAL until Dispatch 17's list lands in the
 * repo; take its list here then.
 */
export const PHOTO_HOSTS: readonly string[] = ['photos.zillowstatic.com'];

/** At most this many photos are kept, hero first. */
export const MAX_PHOTOS = 8;

/** Not a listing photo: the carousel import's junk filter (netlify/functions/streeteasy-import-background.mjs). */
const JUNK = /(logo|sprite|favicon|\bicon\b|\/icons?\/|placeholder|avatar|headshot|\bmap\b|\bads?\b|advert|badge|watermark|pixel|\.svg(\?|$))/i;

const MAX_URL_LENGTH = 2048;

function onPhotoHost(host: string): boolean {
  return PHOTO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * An https URL, read by hand: the engine has no URL class (it runs with no DOM
 * and no Node). The authority is a bare host — no userinfo ("@"), no port, no
 * escapes — so what's checked is the host a browser would fetch from.
 */
const HTTPS = /^https:\/\/([a-z0-9.-]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i;

/** One URL as kept (its fragment dropped), or null when it isn't plainly a StreetEasy photo. */
function cleanPhotoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s === '' || s.length > MAX_URL_LENGTH || /[\s\\\u0000-\u001f\u007f]/.test(s)) return null;
  const m = HTTPS.exec(s);
  if (!m) return null;
  const host = m[1]!.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('.') || host.includes('..') || !onPhotoHost(host)) return null;
  const rest = `${m[2] ?? '/'}${m[3] ?? ''}`;
  if (JUNK.test(rest)) return null;
  return `https://${host}${rest}`;
}

/**
 * The photo URLs worth keeping, in order (pass the hero first): https only, no
 * userinfo, on StreetEasy's image hosts, not junk, each once, at most 8.
 */
export function cleanPhotoUrls(urls: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const raw of Array.isArray(urls) ? urls : []) {
    const url = cleanPhotoUrl(raw);
    if (url && !out.includes(url)) out.push(url);
    if (out.length === MAX_PHOTOS) break;
  }
  return out;
}

/**
 * The extract as it may be stored: its `photos` replaced by the cleaned list
 * (hero first) and its `heroImageUrl` kept only if it passes. Nothing else is
 * touched. Returns a new object.
 */
export function cleanListingExtract(extract: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...extract };
  const hero = cleanPhotoUrl(extract['heroImageUrl']);
  const photos = cleanPhotoUrls([hero, ...(Array.isArray(extract['photos']) ? extract['photos'] : [])]);
  if ('photos' in extract || hero) out['photos'] = photos;
  if (hero) out['heroImageUrl'] = hero;
  else delete out['heroImageUrl'];
  return out;
}
