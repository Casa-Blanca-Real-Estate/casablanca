// Calendar arithmetic with no clock.
//
// The engine never asks what day it is — every "as of" date arrives as an
// input — and it never touches the built-in Date, whose behaviour depends on
// the machine's time zone. Dates are ISO calendar dates ("2026-09-23") and all
// arithmetic is integer day counts (Howard Hinnant's civil-calendar algorithms,
// proleptic Gregorian).

/** An ISO 8601 calendar date, "YYYY-MM-DD". No time, no time zone. */
export type IsoDate = string;

export interface CivilDate {
  y: number;
  m: number; // 1–12
  d: number; // 1–31
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

export function isValidCivil(y: number, m: number, d: number): boolean {
  return (
    Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d) &&
    y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
  );
}

/** Days since 1970-01-01 for a civil date. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = floorDiv(yy, 400);
  const yoe = yy - era * 400;
  const mp = m > 2 ? m - 3 : m + 9;
  const doy = floorDiv(153 * mp + 2, 5) + d - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The civil date for a count of days since 1970-01-01. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = floorDiv(z, 146097);
  const doe = z - era * 146097;
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365);
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153);
  const d = doy - floorDiv(153 * mp + 2, 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

function pad(n: number, width: number): string {
  let s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

export function formatIsoDate(c: CivilDate): IsoDate {
  return `${pad(c.y, 4)}-${pad(c.m, 2)}-${pad(c.d, 2)}`;
}

/** Parses a strict ISO calendar date; null if it isn't one. */
export function parseIsoDate(s: string): CivilDate | null {
  const match = ISO_DATE.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return isValidCivil(y, m, d) ? { y, m, d } : null;
}

export function isIsoDate(s: unknown): s is IsoDate {
  return typeof s === 'string' && parseIsoDate(s) !== null;
}

export function isoToDays(s: IsoDate): number {
  const c = parseIsoDate(s);
  if (!c) throw new Error(`not an ISO date: ${JSON.stringify(s)}`);
  return daysFromCivil(c.y, c.m, c.d);
}

export function daysToIso(days: number): IsoDate {
  return formatIsoDate(civilFromDays(days));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return isoToDays(to) - isoToDays(from);
}

/** Average Gregorian month, in days — used to express ages in months. */
export const DAYS_PER_MONTH = 30.436875;

/** The same day `months` months earlier or later, clamped to the month's end. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const c = parseIsoDate(date);
  if (!c) throw new Error(`not an ISO date: ${JSON.stringify(date)}`);
  if (!Number.isInteger(months)) throw new Error('months must be a whole number');
  const index = c.y * 12 + (c.m - 1) + months;
  const y = floorDiv(index, 12);
  const m = index - y * 12 + 1;
  return formatIsoDate({ y, m, d: Math.min(c.d, daysInMonth(y, m)) });
}

/**
 * A spreadsheet date serial to an ISO date. Excel's default 1900 system counts
 * from 1899-12-30 (which absorbs its fictional 1900-02-29); the 1904 system
 * counts from 1904-01-01. Any time-of-day fraction is dropped.
 */
export function spreadsheetSerialToIso(serial: number, date1904: boolean): IsoDate | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (date1904) return daysToIso(daysFromCivil(1904, 1, 1) + whole);
  if (whole < 61) return null; // before 1900-03-01: Excel's calendar is wrong there
  return daysToIso(daysFromCivil(1899, 12, 30) + whole);
}

/**
 * US-style month/day/year as StreetEasy writes it ("8/27/2026"). A two-digit
 * year is read as 20YY and reported by the caller.
 */
export function parseUsDate(s: string): { date: IsoDate; twoDigitYear: boolean } | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s.trim());
  if (!match) return null;
  const m = Number(match[1]);
  const d = Number(match[2]);
  const twoDigitYear = match[3]!.length === 2;
  const y = twoDigitYear ? 2000 + Number(match[3]) : Number(match[3]);
  if (!isValidCivil(y, m, d)) return null;
  return { date: formatIsoDate({ y, m, d }), twoDigitYear };
}
