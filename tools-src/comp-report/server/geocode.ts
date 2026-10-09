// A building's mapped location, for distance (Dispatch 11, §6.10), from NYC
// Planning's GeoSearch (geosearch.planninglabs.nyc): free, no key, the five
// boroughs, and built on the city's own address file (PAD).
//
// Only the street address goes out ("200 Chambers Street"): no unit, no name,
// nothing else. A result counts only when its house number, its street and its
// borough all agree with ours. Anything else is refused with the reason, never
// guessed: GeoSearch always answers with something, and its nearest match for
// a street it doesn't know can be a different street in a different borough.
// One request at a time, a short timeout and no retry here: a failed lookup is
// tried again later, a few times at most (api/geocode.ts).
import { normalizeStreet } from '../engine/index.ts';

export const GEOCODER = 'nyc_geosearch';
export const GEOCODER_NAME = 'NYC Planning GeoSearch';
export const DEFAULT_GEOSEARCH_URL = 'https://geosearch.planninglabs.nyc';

export const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'] as const;
export type Borough = (typeof BOROUGHS)[number];

export type Geocoded =
  | { status: 'matched'; lat: number; lng: number; matched: string; bin: string | null }
  | { status: 'refused'; reason: string; matched: string | null }
  | { status: 'failed'; reason: string };

/** Looks up one building by its street address alone; `borough` is ours, for checking the match. */
export type Geocoder = (street: string, borough: Borough | null) => Promise<Geocoded>;

// Queens mail goes by neighbourhood: "Long Island City, NY", not "Queens, NY".
const QUEENS_PLACES = new Set([
  'queens', 'long island city', 'astoria', 'sunnyside', 'woodside', 'jackson heights', 'east elmhurst', 'elmhurst',
  'corona', 'flushing', 'forest hills', 'rego park', 'kew gardens', 'jamaica', 'ridgewood', 'maspeth', 'middle village',
  'glendale', 'bayside', 'whitestone', 'college point', 'fresh meadows', 'far rockaway', 'rockaway park', 'arverne',
  'howard beach', 'ozone park', 'south ozone park', 'richmond hill', 'woodhaven', 'hollis', 'queens village', 'st albans',
  'saint albans', 'springfield gardens', 'rosedale', 'cambria heights', 'laurelton', 'little neck', 'douglaston',
  'oakland gardens', 'bellerose', 'glen oaks', 'briarwood', 'jamaica estates',
]);

/** Our borough, from the address: its ZIP where we have one, else its city. Null when it doesn't say. */
export function boroughOf(city: string | null | undefined, zip?: string | null): Borough | null {
  const z = zip && /^\d{5}/.test(zip) ? Number(zip.slice(0, 5)) : null;
  if (z !== null) {
    if (z >= 10001 && z <= 10299) return 'Manhattan';
    if (z >= 10301 && z <= 10314) return 'Staten Island';
    if (z >= 10451 && z <= 10475) return 'Bronx';
    if (z >= 11201 && z <= 11256) return 'Brooklyn';
    if ((z >= 11004 && z <= 11109) || (z >= 11351 && z <= 11697)) return 'Queens';
  }
  const c = (city ?? '').toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  if (['new york', 'manhattan', 'nyc', 'new york city', 'new york ny'].includes(c)) return 'Manhattan';
  if (c === 'brooklyn') return 'Brooklyn';
  if (c === 'bronx' || c === 'the bronx') return 'Bronx';
  if (c === 'staten island') return 'Staten Island';
  if (QUEENS_PLACES.has(c)) return 'Queens';
  return null;
}

interface Feature {
  geometry?: { coordinates?: unknown };
  properties?: { housenumber?: unknown; street?: unknown; borough?: unknown; addendum?: { pad?: { bin?: unknown } } };
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const titled = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());

/** How the geocoder names an address it found: "200 Chambers Street, Manhattan". */
function named(f: Feature): string {
  const p = f.properties ?? {};
  const street = [text(p.housenumber), text(p.street) ? titled(text(p.street)!) : null].filter(Boolean).join(' ');
  return [street || 'an address', text(p.borough)].filter(Boolean).join(', ');
}

/**
 * The geocoder's match for our street, or why there's none: the first result
 * whose house number and street are ours, in our borough.
 */
export function pickMatch(features: readonly Feature[], street: string, borough: Borough | null): Geocoded {
  const ours = normalizeStreet(street);
  if (!/^\d/.test(ours)) return { status: 'refused', reason: 'its address has no house number to check a match against', matched: null };
  if (!borough) return { status: 'refused', reason: 'its address doesn’t say which borough, so a match can’t be checked', matched: null };
  const sameAddress = features.filter((f) => {
    const hn = text(f.properties?.housenumber);
    const st = text(f.properties?.street);
    return hn && st && normalizeStreet(`${hn} ${st}`) === ours;
  });
  for (const f of sameAddress) {
    if (text(f.properties?.borough) !== borough) continue;
    const c = f.geometry?.coordinates;
    const [lng, lat] = Array.isArray(c) ? c : [];
    if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const bin = text(f.properties?.addendum?.pad?.bin);
    return { status: 'matched', lat, lng, matched: named(f), bin: bin && /^\d{7}$/.test(bin) ? bin : null };
  }
  if (sameAddress.length) {
    return { status: 'refused', reason: `the geocoder found ${named(sameAddress[0]!)}, not in ${borough}`, matched: named(sameAddress[0]!) };
  }
  const nearest = features[0];
  return nearest
    ? { status: 'refused', reason: `the geocoder’s nearest match was ${named(nearest)}, not this address`, matched: named(nearest) }
    : { status: 'refused', reason: 'the geocoder found no address like it', matched: null };
}

/** NYC Planning's GeoSearch: the street address alone, ten results, a short timeout. */
export function nycGeoSearch(opts: { baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number } = {}): Geocoder {
  const base = (opts.baseUrl || DEFAULT_GEOSEARCH_URL).replace(/\/+$/, '');
  const get = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 4000;
  return async (street, borough) => {
    const url = `${base}/v2/search?${new URLSearchParams({ text: street, size: '10' })}`;
    // The timeout covers the answer's body too; a held timer, so it fires even with nothing else running.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    let body: unknown;
    try {
      const res = await get(url, { signal: abort.signal, headers: { accept: 'application/json', 'user-agent': 'CasaBlancaCompReport/1' } });
      if (!res.ok) return { status: 'failed', reason: `the geocoder answered ${res.status}` };
      body = await res.json();
    } catch (e) {
      if (abort.signal.aborted) return { status: 'failed', reason: `the geocoder didn’t answer within ${timeoutMs / 1000} seconds` };
      return { status: 'failed', reason: e instanceof SyntaxError ? 'the geocoder’s answer couldn’t be read' : 'the geocoder couldn’t be reached' };
    } finally {
      clearTimeout(timer);
    }
    const features = (body as { features?: unknown })?.features;
    if (!Array.isArray(features)) return { status: 'failed', reason: 'the geocoder’s answer couldn’t be read' };
    return pickMatch(features as Feature[], street, borough);
  };
}
