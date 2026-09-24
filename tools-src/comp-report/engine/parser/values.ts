// Reading the export's cell values. CSV cells are always text ("$4,650,000",
// "~1,840 ft²", "8/27/2026"); XLSX cells may be text or native numbers and
// date serials. Each reader returns the value plus whether its source marked
// it approximate, or a note saying why it couldn't be read.

import { parseIsoDate, parseUsDate, spreadsheetSerialToIso, type IsoDate } from '../util/dates.ts';
import { roundHalfAway } from '../util/numbers.ts';
import type { EvidenceClass, PropertyType } from '../types.ts';

export type Cell = string | number | boolean | null;

export interface Read<T> {
  value: T | null;
  approx: boolean;
  /** Why the value was changed or couldn't be read. */
  note: string | null;
}

const BLANK = /^(|-|—|–|n\/?a|none|null)$/i;

function ok<T>(value: T, approx = false, note: string | null = null): Read<T> {
  return { value, approx, note };
}
function none<T>(note: string | null = null): Read<T> {
  return { value: null, approx: false, note };
}

export function cellText(cell: Cell): string {
  if (cell === null) return '';
  return typeof cell === 'string' ? cell.trim() : String(cell);
}

export function isBlank(cell: Cell): boolean {
  return cell === null || (typeof cell === 'string' && BLANK.test(cell.trim()));
}

/** Leading "~" — StreetEasy's mark for an approximate (AI-inferred) figure. */
function stripApprox(s: string): { text: string; approx: boolean } {
  const approx = /^~|^≈|^approx\.?\s/i.test(s) || /^ca\.?\s/i.test(s);
  return { text: s.replace(/^(~|≈|approx\.?\s*|ca\.?\s*)/i, '').trim(), approx };
}

function wholeNumber(x: number, what: string): Read<number> {
  if (!Number.isFinite(x) || x < 0) return none(`${what} ${x} is not a usable amount`);
  const rounded = roundHalfAway(x);
  if (Math.abs(rounded - x) < 1e-6) return ok(rounded);
  return ok(rounded, false, `${what} ${x} rounded to ${rounded}`);
}

/** "$4,650,000", "4650000", "~$4.65M" → whole dollars. */
export function readMoney(cell: Cell): Read<number> {
  if (cell === null || isBlank(cell)) return none();
  if (typeof cell === 'number') return wholeNumber(cell, 'amount');
  if (typeof cell === 'boolean') return none(`"${cell}" is not an amount`);
  const { text, approx } = stripApprox(cell.trim());
  const match = /^\$?\s*([\d,]*\.?\d+)\s*([kmb])?$/i.exec(text.replace(/\s*(usd|\/mo|per month)$/i, ''));
  if (!match) return none(`"${cell}" is not an amount`);
  const base = Number(match[1]!.replace(/,/g, ''));
  const suffix = match[2]?.toLowerCase();
  if (suffix) {
    const scale = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1_000_000_000;
    const r = wholeNumber(base * scale, 'amount');
    return { value: r.value, approx: true, note: `"${cell}" is a rounded display figure; read as approximate` };
  }
  const r = wholeNumber(base, 'amount');
  return { ...r, approx };
}

/** "2,201 ft²", "~1,840 ft²", "2201", "2,201 sq ft" → whole square feet. */
export function readArea(cell: Cell): Read<number> {
  if (cell === null || isBlank(cell)) return none();
  if (typeof cell === 'number') {
    const r = wholeNumber(cell, 'area');
    return r.value === 0 ? none('an area of 0 is not an area') : r;
  }
  if (typeof cell === 'boolean') return none(`"${cell}" is not an area`);
  const { text, approx } = stripApprox(cell.trim());
  const cleaned = text.replace(/\s*(ft²|ft2|sq\.?\s*ft\.?|sqft|sf|square feet|square foot)$/i, '').replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(cleaned)) return none(`"${cell}" is not an area`);
  const r = wholeNumber(Number(cleaned), 'area');
  if (r.value === 0) return none('an area of 0 is not an area');
  return { ...r, approx };
}

/** A whole-number count: days on market, units, stories, page views. */
export function readCount(cell: Cell): Read<number> {
  if (cell === null || isBlank(cell)) return none();
  if (typeof cell === 'number') return Number.isInteger(cell) && cell >= 0 ? ok(cell) : none(`${cell} is not a count`);
  if (typeof cell === 'boolean') return none(`"${cell}" is not a count`);
  const text = cell.trim().replace(/,/g, '');
  if (/^studio$/i.test(text)) return ok(0);
  const plus = /^(\d+)\+$/.exec(text);
  if (plus) return ok(Number(plus[1]), true, `"${cell}" read as at least ${plus[1]}`);
  if (!/^\d+$/.test(text)) return none(`"${cell}" is not a count`);
  return ok(Number(text));
}

/** Bathrooms: halves allowed ("3.5"). */
export function readHalfCount(cell: Cell): Read<number> {
  if (cell === null || isBlank(cell)) return none();
  const n = typeof cell === 'number' ? cell : typeof cell === 'string' ? Number(cell.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0) return none(`"${cellText(cell)}" is not a count`);
  if (!Number.isInteger(n * 2)) return ok(n, false, `${n} is not a whole or half count`);
  return ok(n);
}

/** A floor number. Labels like "PH" or "G" aren't numbers; they're reported, not guessed. */
export function readFloor(cell: Cell): Read<number> {
  if (cell === null || isBlank(cell)) return none();
  if (typeof cell === 'number') return Number.isInteger(cell) ? ok(cell) : none(`${cell} is not a floor number`);
  if (typeof cell === 'boolean') return none(`"${cell}" is not a floor number`);
  const text = cell.trim();
  if (/^-?\d+$/.test(text)) return ok(Number(text));
  const ordinal = /^(\d+)(st|nd|rd|th)( floor)?$/i.exec(text);
  if (ordinal) return ok(Number(ordinal[1]));
  return none(`floor "${text}" is a label, not a number`);
}

/** "8/27/2026", "2026-08-27", or a spreadsheet date serial. */
export function readDate(cell: Cell, date1904 = false): Read<IsoDate> {
  if (cell === null || isBlank(cell)) return none();
  if (typeof cell === 'number') {
    const iso = spreadsheetSerialToIso(cell, date1904);
    return iso ? ok(iso) : none(`${cell} is not a date`);
  }
  if (typeof cell === 'boolean') return none(`"${cell}" is not a date`);
  const text = cell.trim();
  const us = parseUsDate(text);
  if (us) return ok(us.date, false, us.twoDigitYear ? `"${text}": two-digit year read as ${us.date.slice(0, 4)}` : null);
  const isoPart = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(text);
  if (isoPart && parseIsoDate(isoPart[1]!)) return ok(isoPart[1]!);
  return none(`"${text}" is not a date`);
}

const STATUS: Record<string, EvidenceClass> = {
  sold: 'sold', closed: 'sold',
  'in contract': 'in_contract', 'contract signed': 'in_contract', 'under contract': 'in_contract', pending: 'in_contract',
  active: 'active', 'for sale': 'active', listed: 'active', open: 'active',
};

export function readStatus(cell: Cell): { raw: string | null; evidence_class: EvidenceClass | null } {
  const raw = cellText(cell);
  if (raw === '') return { raw: null, evidence_class: null };
  return { raw, evidence_class: STATUS[raw.toLowerCase().replace(/\s+/g, ' ')] ?? null };
}

const PROPERTY_TYPES: Record<string, PropertyType> = {
  condo: 'condo', condominium: 'condo',
  'co-op': 'coop', coop: 'coop', cooperative: 'coop',
  condop: 'condop',
  townhouse: 'townhouse', house: 'townhouse', 'single-family': 'townhouse', 'single family': 'townhouse',
  'multi-family': 'multi_family', 'multi family': 'multi_family',
};

export function readPropertyType(cell: Cell): Read<PropertyType> {
  const raw = cellText(cell);
  if (raw === '') return none();
  const type = PROPERTY_TYPES[raw.toLowerCase()];
  return type ? ok(type) : ok<PropertyType>('other', false, `property type "${raw}" isn't one the engine knows`);
}

/** "Pets allowed; Smoke-free" → ["Pets allowed", "Smoke-free"]. */
export function readTags(cell: Cell): string[] {
  const text = cellText(cell);
  if (text === '') return [];
  return text.split(';').map((t) => t.trim()).filter((t) => t !== '');
}
