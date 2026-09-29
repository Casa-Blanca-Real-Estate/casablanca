// Which StreetEasy links the tool will read (§6.2, Dispatch 09). Plain data,
// like the engine: the browser checks a pasted link as it's typed, and the
// server checks it again before anything is read.
import { parseStreetEasyUrl } from '../engine/index.ts';

export type LinkPurpose = 'comp' | 'subject';

/** At most this many links in one paste. */
export const MAX_LINKS_PER_REQUEST = 20;

export type LinkCheck =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * A pasted link, as the tool will read it: StreetEasy only, a sale listing, a
 * unit's page or a public-record closing, canonical (https, no query string —
 * the exports' links carry tracking parameters).
 */
export function checkListingLink(raw: string): LinkCheck {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'Paste a StreetEasy listing link.' };
  if (text.length > 500) return { ok: false, reason: 'That link is too long to be a StreetEasy listing.' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  const ref = parseStreetEasyUrl(withScheme);
  if (!ref || !/^https:\/\/streeteasy\.com\//.test(ref.url)) {
    return { ok: false, reason: 'Only StreetEasy listing links can be read. Paste a StreetEasy link, or type the comp in.' };
  }
  if (ref.kind === 'rental') return { ok: false, reason: 'That’s a rental listing. Comps are sales.' };
  if (ref.kind === 'building') return { ok: false, reason: 'That’s the building’s page. Paste the unit’s listing.' };
  if (ref.kind === 'other') return { ok: false, reason: 'That StreetEasy page isn’t a listing. Paste the unit’s listing link.' };
  if (!/^https:\/\/streeteasy\.com\/[^?#\s]+$/.test(ref.url)) return { ok: false, reason: 'That link can’t be read as a StreetEasy listing.' };
  return { ok: true, url: ref.url };
}

/** "…/building/100-barclay-street-new_york/17l" → "100 Barclay Street #17L": a title before the page is read. */
export function titleFromLink(url: string): string | null {
  const ref = parseStreetEasyUrl(url);
  if (!ref?.building_slug) return null;
  const street = ref.building_slug
    .replace(/-(new_york|brooklyn|bronx|staten_island|queens)$/, '')
    .split('-')
    .filter(Boolean)
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
  if (!street) return null;
  return ref.unit_slug ? `${street} #${ref.unit_slug.toUpperCase()}` : street;
}
