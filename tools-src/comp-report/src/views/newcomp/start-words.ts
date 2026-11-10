// Start with Hubert (the design pass, DP-20 and §7.1): what the agent typed into Reports' hero, read
// for the New report window. A StreetEasy link or an address, and, if they said it, who it's for
// ("buyer", "my sellers"), the client's name ("for Jordan and Sam"), Co-op or Condo, and a budget or
// target ("budget $4.5M"). Plain rules, no model call: instant and free, and the agent checks what it
// filled on the next screen. Anything it can't place is left for the window, never guessed.
//
// Pure, with type imports only, so the tests run in node.
import { checkListingLink } from '../../../workspace/links.ts';
import type { Audience } from '../../../workspace/state.ts';
import { splitTitle } from '../workspace/model.ts';

export type StartHome =
  | { kind: 'link'; url: string }
  | { kind: 'typed'; address: string; unit: string | null; title: string }
  /** A link that doesn't check out: the window shows why. */
  | { kind: 'bad-link'; text: string; reason: string };

export interface StartWords {
  home: StartHome | null;
  side: Audience | null;
  client: string | null;
  type: 'condo' | 'coop' | null;
  /** The client's budget (a buyer) or target (a seller), in dollars. */
  price: number | null;
}

const URL_RE = /(?:https?:\/\/|www\.)\S+|\bstreeteasy\.com\/\S+/i;
const BUYER = /\b(?:buyers?|buying|buy[- ]side|purchas(?:e|er|ers|ing))\b/i;
const SELLER = /\b(?:sellers?|selling|sell[- ]side|owners?)\b/i;
const COOP = /\bco-?ops?\b/i;
const CONDO = /\bcondo(?:minium)?s?\b/i;
// "budget $4.5M", "target 3.2 million", "$2,450,000", "up to 4.5m".
const PRICE = /(?:\b(?:budget|target|up to|max(?:imum)?|around|about|asking|ask|price)\b\s*(?:of|is|:)?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(m{1,2}|k|million)?\b)|(?:\$\s*(\d[\d,]*(?:\.\d+)?)\s*(m{1,2}|k|million)?\b)/i;
// Where an address stops and the rest of the sentence starts.
const CUE = /\s+(?:for|with|buyers?|sellers?|buying|selling|clients?|condo(?:minium)?s?|co-?ops?|budget|target|up to|asking)\b/i;
const NAME = "[A-Z][\\p{L}'’.-]*";
// "for my buyers Jordan and Sam", "client: Dana Lee", "sellers Pat & Chris".
const CLIENT = new RegExp(
  `\\b(?:for|with|clients?|buyers?|sellers?)\\s*[:,\\-]?\\s+(?:(?:my|our|the|a|new|first-time|buyers?|sellers?|clients?|couple|family)\\s+)*`
  + `(${NAME}(?:\\s+(?:and|&)\\s+${NAME}|\\s+${NAME})*)`,
  'u',
);
/** Capitalised words that aren't a name. */
const NOT_A_NAME = /^(?:condo|condominium|co-?op|buyer|buyers|seller|sellers|client|clients|budget|target|street|st|avenue|ave|streeteasy|tribeca|soho|manhattan|brooklyn|i|me|we)$/i;

/** "4.5M", "2,450,000", "450k" in dollars; a bare figure under 100 reads as millions, as the price fields do. */
function dollars(figure: string, unit: string | undefined): number | null {
  let n = Number(figure.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = unit?.toLowerCase();
  if (u === 'k') n *= 1e3;
  else if (u === 'm' || u === 'mm' || u === 'million' || n < 100) n *= 1e6;
  n = Math.round(n);
  return n >= 50_000 && n <= 500_000_000 ? n : null;
}

function readClient(text: string): string | null {
  const m = CLIENT.exec(text);
  if (!m) return null;
  const words = m[1]!.split(/\s+/);
  // Trim keywords off the end ("Jordan Condo"), and give up if nothing name-like is left.
  while (words.length && NOT_A_NAME.test(words.at(-1)!.replace(/[.,]$/, ''))) words.pop();
  while (words.length && /^(?:and|&)$/i.test(words.at(-1)!)) words.pop();
  if (!words.length || NOT_A_NAME.test(words[0]!)) return null;
  const name = words.join(' ').replace(/[.,]+$/, '').trim();
  return name.length >= 2 && name.length <= 80 ? name : null;
}

function readAddress(text: string): StartHome | null {
  const parts = text.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  // The address is the first part with a street number; else the first part (a building's name).
  let at = parts.findIndex((p) => /^\d/.test(p));
  if (at < 0) at = 0;
  let line = parts[at]!;
  const cut = CUE.exec(` ${line}`);
  if (cut) line = ` ${line}`.slice(0, cut.index).trim();
  // "100 Barclay St, #17L": the unit in the next part.
  const next = parts[at + 1];
  if (next && /^(?:#|apt\.?\s*|unit\s+|ph\s*)[\w-]+$/i.test(next) && !/(?:#|apt|unit)\s*[\w-]+$/i.test(line)) line = `${line} ${next}`;
  if (line.length < 3 || !/[a-z]/i.test(line)) return null;
  const split = splitTitle(line);
  const address = split?.address ?? line;
  const unit = split?.unit ?? null;
  const u = unit ? (unit.startsWith('#') ? unit : `#${unit}`) : '';
  return { kind: 'typed', address, unit, title: `${address}${u ? ` ${u}` : ''}` };
}

/** What Start with Hubert understood from what was typed. */
export function readStartWords(raw: string): StartWords {
  const text = raw.replace(/\s+/g, ' ').trim();
  const empty: StartWords = { home: null, side: null, client: null, type: null, price: null };
  if (!text) return empty;

  let rest = text;
  let home: StartHome | null = null;
  const link = URL_RE.exec(text);
  if (link) {
    const token = link[0].replace(/[),.;]+$/, '');
    const check = checkListingLink(token);
    home = check.ok ? { kind: 'link', url: check.url } : { kind: 'bad-link', text: token, reason: check.reason };
    rest = `${text.slice(0, link.index)} ${text.slice(link.index + link[0].length)}`.replace(/\s+/g, ' ').trim();
  }

  const priceMatch = PRICE.exec(rest);
  const price = priceMatch ? dollars(priceMatch[1] ?? priceMatch[3]!, priceMatch[2] ?? priceMatch[4]) : null;
  const words = priceMatch ? `${rest.slice(0, priceMatch.index)} ${rest.slice(priceMatch.index + priceMatch[0].length)}` : rest;

  const buyer = BUYER.test(words);
  const seller = SELLER.test(words);
  const side: Audience | null = buyer === seller ? null : buyer ? 'buyer' : 'seller';
  const coop = COOP.test(words);
  const condo = CONDO.test(words);
  const type = coop === condo ? null : coop ? 'coop' : 'condo';
  const client = readClient(words);

  if (!home) home = readAddress(words);
  return { home, side, client, type, price };
}

/** The window can be skipped to step 2: a link that checks out, or an address of a few letters. */
export function startsOnDetails(w: StartWords): boolean {
  return w.home?.kind === 'link' || (w.home?.kind === 'typed' && w.home.address.trim().length >= 3);
}

/** What Hubert says he took from the words, for his note beside step 2. Kept in the browser for the session. */
export interface StartNote {
  /** What the agent said, field by field; a field left out wasn't said. */
  said: { side?: Audience; client?: string; type?: 'condo' | 'coop'; price?: number };
  /** The home came from a link (it's being read) or was typed. */
  from: 'link' | 'typed';
}

export const startNoteKey = (reportId: string) => `cr-start-hubert:${reportId}`;

export function noteOf(w: StartWords): StartNote {
  return {
    said: {
      ...(w.side ? { side: w.side } : {}),
      ...(w.client ? { client: w.client } : {}),
      ...(w.type ? { type: w.type } : {}),
      ...(w.price ? { price: w.price } : {}),
    },
    from: w.home?.kind === 'link' ? 'link' : 'typed',
  };
}

export function readStartNote(raw: string | null): StartNote | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as StartNote;
    return v && typeof v === 'object' && v.said && typeof v.said === 'object' && (v.from === 'link' || v.from === 'typed') ? v : null;
  } catch {
    return null;
  }
}

/** The details Hubert looks for once the listing is read, by their names in his note. */
const KEY_DETAILS: { key: 'areaSqft' | 'beds' | 'baths' | 'floor'; name: string }[] = [
  { key: 'areaSqft', name: 'the size' },
  { key: 'beds', name: 'the bedrooms' },
  { key: 'baths', name: 'the bathrooms' },
  { key: 'floor', name: 'the floor' },
];

/** The key details still empty: "the size and the floor". Null when none are. */
export function missingDetails(intake: Partial<Record<'areaSqft' | 'beds' | 'baths' | 'floor', unknown>>): string | null {
  const gone = KEY_DETAILS.filter((d) => intake[d.key] === undefined).map((d) => d.name);
  if (!gone.length) return null;
  return gone.length === 1 ? gone[0]! : `${gone.slice(0, -1).join(', ')} and ${gone.at(-1)}`;
}
