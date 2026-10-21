// An agent's own tags (DP-6, Dispatch 20): beside the house list (features.ts),
// a short phrase the agent writes. Free text a client may read in the email, so
// it's held to a strict shape here, screened for fair housing on the server
// when it's saved, and always shown as text: never markup, never instructions,
// and never a Jev input (D-12). Plain data, for the browser and the server.
import { TAGS } from './features.ts';
import { fairHousingFindings } from './fair-housing.ts';

/** The longest an agent's tag can be. */
export const MAX_FREE_TAG = 40;

/** The most tags a comp can carry, list and free together: report_comps.tags' own cap. */
export const MAX_TAGS = 30;

/**
 * Letters, digits, spaces and basic punctuation only. \p{L} and \p{N} take any
 * script's letters and digits; nothing else gets through: no "<" or ">", no
 * control, zero-width or bidi characters, no newline.
 */
const SHAPE = /^[\p{L}\p{M}\p{N} .,'\-&/()+%]+$/u;

/** NFC, then trimmed: the form a free tag is checked and stored in. */
export function normalizeFreeTag(raw: string): string {
  return raw.normalize('NFC').trim();
}

const LIST_LOWER = new Set<string>(TAGS.map((t) => t.toLowerCase()));

/** A tag on the house list, ignoring case: a free tag can't shadow one. */
function onTheList(t: string): boolean {
  return LIST_LOWER.has(t.toLowerCase());
}

/**
 * True when `t` is a valid free tag as given: already NFC and trimmed, one
 * line, 1 to 40 characters of the allowed shape, and not a list tag in any
 * case. Callers normalise first (normalizeFreeTag); a value that changes under
 * normalisation is refused, so what's checked is what's stored.
 */
export function isFreeTag(t: unknown): t is string {
  if (typeof t !== 'string') return false;
  if (t !== normalizeFreeTag(t)) return false;
  if (t.length < 1 || [...t].length > MAX_FREE_TAG) return false;
  if (!SHAPE.test(t)) return false;
  return !onTheList(t);
}

/** A free tag's fair-housing hard stop, if it has one: the term and its basis. */
export function freeTagHardTerm(t: string): { term: string; basis: string } | null {
  const hit = fairHousingFindings(t).find((f) => f.level === 'hard');
  return hit ? { term: hit.term, basis: hit.basis } : null;
}

/** Why a typed tag can't be added, in a sentence; null when it can. For the browser, before the server says so. */
export function freeTagProblem(raw: string): string | null {
  const t = normalizeFreeTag(raw);
  if (!t) return 'Type the tag first.';
  if ([...t].length > MAX_FREE_TAG) return `Keep a tag to ${MAX_FREE_TAG} characters.`;
  if (onTheList(t)) return 'That one’s on the list: pick it there.';
  if (!SHAPE.test(t)) return 'Letters, numbers, spaces and . , \' - & / ( ) + % only.';
  const hard = freeTagHardTerm(t);
  if (hard) return `“${hard.term}” can’t be a tag: it reads as a preference on ${hard.basis}.`;
  return null;
}
