// Does a text cite only numbers it may (§9.1, §10.2)? Every number in it must
// be one the tool knows — a headline fact, a comp's own figure, a step of the
// price table, the home's own facts, or something the agent stated — or part
// of a name (the "17" of "17L", the "200" of "200 Chambers"). A number matches
// a known value when the value at the number's own precision is that number:
// rounded for prices, percents and counts — "$4.2M" and "$4.23M" both match
// $4,225,352 — and truncated for $/sq ft, as §6.1 shows it: "$2,112" matches
// $2,112.68, and "$2,113" doesn't. Small counts in words ("three") aren't
// numbers here. Dates are matched as dates, against the dates the tool knows.
//
// The headline's first check (CR-3b) is `numbersNotInFacts`; QA's whole-email
// grounding (CR-5) is `unmatchedNumbers`, over a ledger built in qa.ts.
import type { HeadlineFact, HeadlineFacts } from '../engine/index.ts';

/** How a known value's unit matches a written number: money, a percent, or anything else. */
/** `any` is a number the agent wrote: it matches however it's written. */
export type KnownUnit = HeadlineFact['unit'] | 'usd_per_month' | 'rooms' | 'floor' | 'number' | 'any';

export interface Known {
  value: number;
  unit: KnownUnit;
  /** What it is, for the checks to say: "200 Chambers Street #10A: sale price". */
  label: string;
  source: 'fact' | 'comp' | 'table' | 'home' | 'agent';
}

/** Everything a draft may cite (§9.1). */
export interface Ledger {
  numbers: Known[];
  /** Names whose digits aren't figures: addresses and units. */
  names: string[];
  /** Dates the tool knows, YYYY-MM-DD: the comps' dates, the analysis date. */
  dates: string[];
  /** Text the tool put in itself (the disclaimer, the estimate disclosures): never scanned. */
  frame: string[];
}

interface Token {
  text: string;
  index: number;
  value: number;
  /** The token's own precision: 0.01M is 10,000. */
  step: number;
  kind: 'money' | 'percent' | 'bare';
}

const SCALE = String.raw`(?:\s?(?:million|mil|thousand|[KkMm])(?![a-z]))`;
const NUMBER = new RegExp(String.raw`\$?\d[\d,]*(?:\.\d+)?${SCALE}?(?:\s?(?:%|percent\b|per\s?cent\b))?`, 'g');

function tokens(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const raw = m[0].replace(/,+$/, '');
    const scale = /(million|mil|thousand|[KkMm])(?:\s?(?:%|percent|per\s?cent))?$/i.exec(raw)?.[1]?.toLowerCase();
    const multiplier = scale === 'm' || scale === 'million' || scale === 'mil' ? 1e6 : scale === 'k' || scale === 'thousand' ? 1e3 : 1;
    const digits = /\d[\d,]*(?:\.\d+)?/.exec(raw)![0].replace(/,/g, '');
    const decimals = digits.includes('.') ? digits.split('.')[1]!.length : 0;
    const percent = /(%|percent|per\s?cent)$/i.test(raw);
    out.push({
      text: raw.trim(),
      index: m.index ?? 0,
      value: Number(digits) * multiplier,
      step: 10 ** -decimals * multiplier,
      kind: percent ? 'percent' : raw.startsWith('$') || multiplier > 1 ? 'money' : 'bare',
    });
  }
  return out;
}

const MONEY = new Set<KnownUnit>(['usd', 'usd_per_sqft', 'usd_per_month', 'usd_per_sqft_per_month']);

function matches(t: Token, k: { value: number; unit: KnownUnit }): boolean {
  if (t.kind === 'money' && !MONEY.has(k.unit) && k.unit !== 'any') return false;
  if (t.kind === 'percent' && k.unit !== 'percent' && k.unit !== 'any') return false;
  const v = Math.abs(k.value);
  const shown = k.unit === 'usd_per_sqft' ? Math.trunc(v / t.step) * t.step : Math.round(v / t.step) * t.step;
  return Math.abs(shown - t.value) < t.step / 1000;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?`;
const DATE = new RegExp(
  [
    String.raw`\b${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b`, // Aug 27, Aug 27, 2026
    String.raw`\b${MONTH}\s+\d{4}\b`, // August 2026
    String.raw`\b\d{4}-\d{2}-\d{2}\b`, // 2026-08-27
    String.raw`\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b`, // 8/27, 12/25, 8/27/2026
    String.raw`\b(?:19|20)\d{2}\b`, // 2026
  ].join('|'),
  'gi',
);

interface Parts { y?: number; m?: number; d?: number }

/** Every valid reading of a written date: "12/25" is December 25th, or December 2025; "24/7" is none. */
function readings(text: string): Parts[] {
  return allReadings(text).filter((r) => (r.m === undefined || (r.m >= 1 && r.m <= 12)) && (r.d === undefined || (r.d >= 1 && r.d <= 31)));
}

function allReadings(text: string): Parts[] {
  const t = text.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) return [{ y: +m[1]!, m: +m[2]!, d: +m[3]! }];
  if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t))) {
    const a = +m[1]!, b = +m[2]!;
    if (m[3]) return [{ m: a, d: b, y: m[3].length === 2 ? 2000 + +m[3] : +m[3] }];
    return [{ m: a, d: b }, { m: a, y: 2000 + b }];
  }
  if ((m = /^(?:19|20)\d{2}$/.exec(t))) return [{ y: +t }];
  const month = MONTHS.indexOf(t.slice(0, 3).toLowerCase()) + 1;
  const rest = t.replace(/^[A-Za-z.]+\s+/, '');
  if ((m = /^(\d{4})$/.exec(rest))) return [{ m: month, y: +m[1]! }];
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/.exec(rest))) return [{ m: month, d: +m[1]!, ...(m[2] ? { y: +m[2] } : {}) }];
  return [];
}

function knownDate(text: string, dates: string[]): boolean {
  const known = dates.map((d) => ({ y: +d.slice(0, 4), m: +d.slice(5, 7), d: +d.slice(8, 10) }));
  return readings(text).some((r) => known.some((k) => (r.y === undefined || r.y === k.y) && (r.m === undefined || r.m === k.m) && (r.d === undefined || r.d === k.d)));
}

// ─── The checks ──────────────────────────────────────────────────────────────

export interface UnmatchedNumber {
  /** As written: "$4.3M", "Aug 12". */
  text: string;
  index: number;
  /** A few words either side, for the check to show where it is. */
  context: string;
}

function blank(text: string, spans: string[]): string {
  let out = text;
  for (const s of spans) if (s) out = out.split(s).join(' '.repeat(s.length));
  return out;
}

function around(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, index - 28)) + 1);
  const endAt = text.indexOf(' ', Math.min(text.length, index + length + 28));
  const end = endAt < 0 ? text.length : endAt;
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

/**
 * The numbers and dates in a text that trace to nothing in the ledger. The
 * ledger's frame text (the disclaimer and the like) is skipped; a name's
 * digits aren't figures unless they're written as one ($, %, K, M).
 */
export function unmatchedNumbers(text: string, ledger: Ledger): UnmatchedNumber[] {
  // A link's digits (a listing id) aren't figures.
  const scan = blank(text, ledger.frame).replace(/https?:\/\/\S+/g, (u) => ' '.repeat(u.length));
  const nameNumbers = new Set(ledger.names.flatMap((n) => n.match(/\d+/g) ?? []).map(Number));
  const out: UnmatchedNumber[] = [];
  const dated: Array<[number, number]> = [];
  for (const m of scan.matchAll(DATE)) {
    const t = m[0];
    const index = m.index ?? 0;
    // "24/7" reads as no date at all: its digits are checked as numbers.
    if (!readings(t).length) continue;
    const known = knownDate(t, ledger.dates);
    // A bare 4-digit number is a year only when it's a known one; otherwise it's a figure ("2000 sq ft") or a name ("1999 Broadway").
    if (/^\d{4}$/.test(t) && !known) continue;
    dated.push([index, index + t.length]);
    if (!known) out.push({ text: t, index, context: around(text, index, t.length) });
  }
  for (const t of tokens(scan)) {
    if (dated.some(([a, b]) => t.index >= a && t.index < b)) continue;
    if (t.kind === 'bare' && nameNumbers.has(t.value)) continue;
    if (ledger.numbers.some((k) => matches(t, k))) continue;
    out.push({ text: t.text, index: t.index, context: around(text, t.index, t.text.length) });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** The numbers in a text — for the agent's own lines, whose numbers count as agent-stated. */
export function numbersIn(text: string): number[] {
  return tokens(text).map((t) => t.value);
}

/**
 * The numbers in a text that trace to none of the headline facts or names.
 * `agent` lets the agent's own number count too: QA allows it in a headline
 * the agent writes; a draft never cites it (§8.4).
 */
export function numbersNotInFacts(text: string, h: HeadlineFacts, opts: { agent?: boolean } = {}): string[] {
  const facts = [...h.facts, ...(opts.agent ? h.agent_number?.facts ?? [] : [])];
  const nameNumbers = new Set(h.names.flatMap((n) => `${n.address ?? ''} ${n.unit ?? ''}`.match(/\d+/g) ?? []).map(Number));
  return tokens(text)
    .filter((t) => !(t.kind === 'bare' && nameNumbers.has(t.value)))
    .filter((t) => !facts.some((f) => matches(t, f)))
    .map((t) => t.text);
}
