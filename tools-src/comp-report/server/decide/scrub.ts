// The scrub (Dispatch 10 phase 1 step 7): what a listing's text may carry
// before it goes into `state`. The text is public, but it can name the owner,
// the listing agent or one of Casa's own agents, and give a phone number. None
// of that helps Jev read condition or sale terms, so it comes out.
//
// Out: emails, phone numbers, links, whole lines that are contact or credit
// lines ("Listed by …", "Contact …", "Courtesy of …"), and names it can
// recognise — the names it's given (Casa's agents, from comp_report.users) and
// names that follow a cue ("call Jane Doe", "ask for Sam", "agent: …").
// Each removal leaves a placeholder, so the sentence still reads.
//
// Pure. The result is marked with its origin: "[listing] …".

export const LISTING_ORIGIN = '[listing]';
/** Enough for a full description (MindBinder capped context at 4,000 characters; listings run 1–3k). */
export const MAX_LISTING_CHARS = 6_000;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
/** A bare domain: "casa-blanca.com", "streeteasy.com/…". */
const DOMAIN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|nyc|io|co|us)(?:\/[^\s]*)?\b/gi;
/** North American numbers in their usual shapes, with an optional extension. */
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b(?:\s*(?:x|ext\.?)\s*\d{1,5})?/gi;

/** A line that is about who to contact or who listed it, not about the home. */
const CONTACT_LINE = new RegExp(
  [
    '^\\s*(?:listed|marketed|presented|offered|represented|exclusively\\s+(?:listed|marketed|offered))\\s+(?:by|with)\\b',
    '^\\s*(?:listing\\s+)?(?:courtesy|compliments)\\s+of\\b',
    '^\\s*(?:contact|call|text|email|e-mail|reach|inquire|enquire|for\\s+(?:more\\s+information|info|showings?|an?\\s+appointment|a\\s+private\\s+showing))\\b',
    '^\\s*(?:listing\\s+)?(?:agents?|brokers?|brokerage|licensed\\s+(?:real\\s+estate\\s+)?(?:salesperson|broker|agent)s?)\\s*[:\\-–—]',
    '^\\s*(?:equal\\s+housing|all\\s+information\\s+(?:is\\s+)?(?:deemed|herein)|information\\s+(?:is\\s+)?deemed\\s+reliable)',
    '^\\s*(?:open\\s+house|by\\s+appointment\\s+only)\\b',
  ].join('|'),
  'i',
);

/** "call Jane", "contact Jane Doe", "ask for Sam Valk", "agent: Jane Doe", "owner Mr. Lee". */
const NAME_AFTER_CUE =
  /\b(call|text|contact|email|e-mail|ask\s+for|reach\s+out\s+to|agents?:?|brokers?:?|owners?:?|sellers?:?|listed\s+by|courtesy\s+of|presented\s+by|represented\s+by)\s+((?:(?:Mr|Mrs|Ms|Dr)\.?\s+)?[A-Z][a-z'’-]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z'’-]+){0,2})/g;
/** An honorific and a name anywhere: "Mrs. Rivera", "Dr. Ann Lee". */
const HONORIFIC_NAME = /\b(?:Mr|Mrs|Ms|Mx|Dr)\.?\s+[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The names to take out, from full names: each full name, and each part of
 * two letters or more that isn't a common word. A single first name alone
 * ("Sam") is taken out too — over-scrubbing a listing costs little; leaving a
 * name in costs trust.
 */
export function namePatterns(fullNames: readonly string[]): RegExp | null {
  const parts = new Set<string>();
  for (const raw of fullNames) {
    const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (name.length < 2) continue;
    parts.add(name);
    for (const p of name.split(/[\s,]+/)) {
      if (p.length >= 3 && /^[\p{L}'’-]+$/u.test(p) && !COMMON_WORDS.has(p.toLowerCase())) parts.add(p);
    }
  }
  if (parts.size === 0) return null;
  // Longest first, so "Sam Valk" goes before "Sam".
  const alts = [...parts].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(`(?<![\\p{L}])(?:${alts.join('|')})(?![\\p{L}])`, 'giu');
}

/**
 * Words that are also names, or appear in names, and are everyday words in a
 * listing. Not taken out on their own (only as part of a full name).
 */
const COMMON_WORDS = new Set([
  'park', 'street', 'avenue', 'place', 'court', 'hill', 'hills', 'river', 'north', 'south', 'east', 'west', 'grand',
  'hall', 'king', 'kings', 'queen', 'queens', 'rose', 'lane', 'wood', 'woods', 'brook', 'stone', 'green', 'white',
  'black', 'brown', 'gray', 'grey', 'young', 'long', 'rich', 'price', 'sale', 'house', 'home', 'terrace', 'garden',
  'gardens', 'view', 'views', 'light', 'sunny', 'art', 'bay', 'sky', 'lake', 'star', 'the', 'and', 'van', 'von', 'del',
  'de', 'la', 'le', 'mint', 'summer', 'winter', 'spring', 'fall', 'april', 'may', 'june', 'august', 'march', 'will',
  'bill', 'mark', 'hunter', 'baker', 'mason', 'carter', 'cook', 'miller', 'porter', 'chase', 'grant', 'hope', 'joy',
  'faith', 'love', 'major', 'new', 'york', 'city', 'soho', 'noho', 'tribeca', 'chelsea', 'harlem', 'madison', 'lexington',
  'hudson', 'washington', 'lincoln', 'jefferson', 'franklin', 'barclay', 'chambers', 'fulton', 'pine', 'broadway',
]);

export interface ScrubResult {
  /** "[listing] …", or null when nothing is left to ask about. */
  text: string | null;
  removed: { emails: number; phones: number; links: number; lines: number; names: number };
  truncated: boolean;
}

/** PURE: the listing text, scrubbed and marked with its origin. */
export function scrubListingText(raw: string | null | undefined, opts: { names?: readonly string[] } = {}): ScrubResult {
  const removed = { emails: 0, phones: 0, links: 0, lines: 0, names: 0 };
  let text = (raw ?? '').normalize('NFKC').replace(/\r\n?/g, '\n');

  const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;
  // Lines first: a whole contact line goes, whatever it holds.
  const lines = text.split('\n').filter((line) => {
    // A sentence that opens a paragraph with "Contact …" is dropped only up to
    // its first full stop; the rest of the line may still describe the home.
    if (CONTACT_LINE.test(line)) { removed.lines++; return false; }
    return true;
  });
  text = lines.join('\n');
  // Contact sentences inside a paragraph: "… Call Jane at 212 … to see it."
  text = text.replace(/(^|[.!?]\s+)((?:please\s+)?(?:contact|call|text|email|e-mail|reach out to|inquire with|for (?:more information|info|showings?|a private showing|an appointment))\b(?:[^.!?\n]|[.!?](?=\S))*[.!?]?)/gi, (_m, lead: string) => {
    removed.lines++;
    return lead;
  });

  removed.emails += count(EMAIL, text);
  text = text.replace(EMAIL, '[email]');
  removed.links += count(URL, text);
  text = text.replace(URL, '[link]');
  removed.links += count(DOMAIN, text);
  text = text.replace(DOMAIN, '[link]');
  removed.phones += count(PHONE, text);
  text = text.replace(PHONE, '[phone]');

  const known = namePatterns(opts.names ?? []);
  if (known) {
    removed.names += count(known, text);
    text = text.replace(known, '[name]');
  }
  text = text.replace(NAME_AFTER_CUE, (_m, cue: string, name: string) => {
    if (name === '[name]') return `${cue} ${name}`;
    removed.names++;
    return `${cue} [name]`;
  });
  removed.names += count(HONORIFIC_NAME, text);
  text = text.replace(HONORIFIC_NAME, '[name]');

  text = text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  let truncated = false;
  if (text.length > MAX_LISTING_CHARS) {
    // Cut at a sentence end where one is near, never mid-word.
    const cut = text.slice(0, MAX_LISTING_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
    text = end > MAX_LISTING_CHARS * 0.8 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '');
    truncated = true;
  }
  const words = text.replace(/\[(?:email|link|phone|name)\]/g, '').match(/\p{L}{2,}/gu) ?? [];
  return { text: words.length >= 5 ? `${LISTING_ORIGIN} ${text}` : null, removed, truncated };
}

/** The listing lane's whole state. Nothing else goes in it. */
export function listingState(scrubbed: string): { listing: string } {
  return { listing: scrubbed };
}
