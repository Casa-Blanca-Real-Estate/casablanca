// Sort's table, the pure parts (Dispatch 14): how a row's cells read, the
// header sort, the filter and the median. Type imports only, so the tests run
// it as it is (table.test.ts).
import type { CompRecord, Tier } from '../../../engine/index.ts';

/** What a row still needs before Findings unlocks: a tier, a note, tags, or a confirm for a comp read from its page. */
export type RowNeed = 'tier' | 'note' | 'tag' | 'confirm';

/** The word for each need, as the row says it (NB-5: plain "Tags", with an ⓘ on the card, the form and the filter). */
/** The ⓘ beside "Tags" (NB-5, answer C): what a tag is. */
export const TAG_INFO = 'Tags say how a comp compares to the home: what’s the same (same building, similar size) and what’s different (smaller, lower floor, no outdoor space). Every comp needs at least one.';

export const NEED_WORD: Record<Exclude<RowNeed, 'confirm'>, string> = { tier: 'tier', note: 'note', tag: 'tags' };

// ─── What the cells say ──────────────────────────────────────────────────────

/** $4.45M, $850K: the way the handoff writes prices in a row. */
export function shortPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-08-14 → Aug 2026. */
export function monthYear(date: string | null | undefined): string {
  if (!date || !/^\d{4}-(0[1-9]|1[0-2])/.test(date)) return '—';
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/** "Needs tier, note, tags"; a comp read from its page: "Confirm or remove". */
export function needText(needs: RowNeed[]): string {
  if (needs.includes('confirm')) return 'Confirm or remove';
  return needs.length ? `Needs ${needs.map((n) => NEED_WORD[n as Exclude<RowNeed, 'confirm'>]).join(', ')}` : '';
}

/** "200 Chambers St #10A" → "200 Chambers": how the handoff names a comp in a sentence. */
export function shortName(record: Pick<CompRecord, 'identity'>): string {
  const street = (record.identity.address.street ?? '').trim();
  if (!street) return 'this comp';
  return street.replace(/\s+(street|st|place|pl|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|terrace|ter|square|sq|way|parkway|pkwy)\.?$/i, '');
}

// ─── Header sort ─────────────────────────────────────────────────────────────

export type SortKey = 'price' | 'ppsf' | 'size' | 'date' | 'tier';
export interface SortState { key: SortKey | null; dir: 1 | -1 }

/** The prototype's cycle: a new column ascending, then descending, then off. */
export function nextSort(s: SortState, key: SortKey): SortState {
  if (s.key !== key) return { key, dir: 1 };
  if (s.dir === 1) return { key, dir: -1 };
  return { key: null, dir: 1 };
}

/** What a row sorts on. */
export interface Sortable {
  price: number | null;
  ppsf: number | null;
  size: number | null;
  /** YYYY-MM-DD */
  date: string | null;
  tier: Tier | null;
}

const TIER_RANK: Record<Tier, number> = { primary: 1, secondary: 2, excluded: 3 };

function sortValue(r: Sortable, key: SortKey): number | null {
  switch (key) {
    case 'price': return r.price;
    case 'ppsf': return r.ppsf;
    case 'size': return r.size;
    case 'date': return r.date ? Date.parse(r.date) : null;
    // Not sorted yet ranks first, as the prototype has it.
    case 'tier': return r.tier ? TIER_RANK[r.tier] : 0;
  }
}

/** Sorted within a group; a missing value goes last either way. Ties keep the list order. */
export function sortRows<T extends Sortable>(rows: T[], s: SortState): T[] {
  if (!s.key) return rows;
  const key = s.key;
  const missing = (v: number | null) => v === null || Number.isNaN(v);
  return rows
    .map((r, i) => ({ r, i, v: sortValue(r, key) }))
    .sort((a, b) => {
      if (missing(a.v)) return missing(b.v) ? a.i - b.i : 1;
      if (missing(b.v)) return -1;
      return a.v === b.v ? a.i - b.i : (a.v! - b.v!) * s.dir;
    })
    .map((x) => x.r);
}

// ─── Filter ──────────────────────────────────────────────────────────────────

export interface Filter { incomplete: boolean; tags: string[] }

export function passes(r: { needs: RowNeed[]; tags: string[] }, f: Filter): boolean {
  if (f.incomplete && !r.needs.length) return false;
  if (f.tags.length && !r.tags.some((t) => f.tags.includes(t))) return false;
  return true;
}

/** Each tag on any row, with how many rows carry it, in the order they first appear. */
export function tagCounts(rows: { tags: string[] }[]): { tag: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([tag, n]) => ({ tag, n }));
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}
