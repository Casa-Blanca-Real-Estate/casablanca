// Sort's table (the handoff, screen 6; Dispatch 14 item 6), as plain data: one
// row per comp with what its cells show, the groups by status, the header
// sort, the filter and the status medians. No React here, so the drawer and
// Findings can read the same figures the rows show.
import type { CompOut, CompRecord, ListingStatus, Tier } from '../../../engine/index.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { psf } from '../../../workspace/format.ts';
import { noteOf } from '../../../workspace/state.ts';
import { compAddress, compPrice, compStatus, rowPsf, STATUS_LABEL, STATUS_ORDER } from '../workspace/comps.tsx';
import { needsOf } from '../workspace/screens.ts';

/** A group of rows: the four statuses, then comps that can't be sorted. */
export type GroupId = ListingStatus | 'unsortable';
export const GROUP_ORDER: GroupId[] = [...STATUS_ORDER, 'unsortable'];
export const GROUP_LABEL: Record<GroupId, string> = { ...STATUS_LABEL, unsortable: 'Can’t be sorted' };

/** The price column's header per group (the prototype: Sale, Ask, Last ask). */
export const PRICE_LABEL: Record<GroupId, string> = { sold: 'Sale', in_contract: 'Ask', active: 'Ask', off_market: 'Last ask', unsortable: 'Price' };

/** What a row still needs before Findings unlocks: a tier, a note, a tag, or a confirm for a comp read from its page. */
export type RowNeed = 'tier' | 'note' | 'tag' | 'confirm';

export interface Row {
  c: WorkspaceComp;
  /** The comp's id in the report, for every edit; null for a row that can't be sorted. */
  rcId: string | null;
  group: GroupId;
  address: string;
  tags: string[];
  note: string | null;
  tier: Tier | null;
  anchor: boolean;
  needs: RowNeed[];
  /** Sale for sold, ask otherwise. */
  price: number | null;
  ppsf: number | null;
  size: number | null;
  /** The size is approximate or the agent's estimate: the dot beside it. */
  sizeEst: boolean;
  /** YYYY-MM-DD: sold, contract or listing date. */
  date: string | null;
  floor: number | null;
  dom: number | null;
}

export function toRow(c: WorkspaceComp, out: CompOut | undefined): Row {
  const j = c.judgment;
  const f = c.record.facts;
  const status = compStatus(c);
  const group: GroupId = c.unsortable || !j || !status ? 'unsortable' : status;
  const needs: RowNeed[] = group === 'unsortable' ? [] : c.unconfirmed ? ['confirm'] : needsOf(c);
  const area = f.area_sqft;
  return {
    c,
    rcId: group === 'unsortable' ? null : j?.reportCompId ?? null,
    group,
    address: compAddress(c),
    tags: j?.tags ?? [],
    note: noteOf(j),
    tier: j?.tier ?? null,
    anchor: Boolean(j?.anchor),
    needs,
    price: compPrice(c).value,
    ppsf: rowPsf(c, out),
    size: area?.value ?? null,
    sizeEst: Boolean(area && (c.record.flags.approx_area || area.confidence === 'approx' || area.confidence === 'guesstimate')),
    date: f.status_date?.value ?? null,
    floor: f.floor?.value ?? null,
    dom: out?.days_on_market ?? f.days_on_market?.value ?? null,
  };
}

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
  if (!date || !/^\d{4}-\d{2}/.test(date)) return '—';
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

export function sizeText(r: Row): string {
  return r.size === null ? '—' : `${r.sizeEst ? '~' : ''}${Math.round(r.size).toLocaleString('en-US')}`;
}

export const ppsfText = (r: Row) => psf(r.ppsf);
export const countText = (n: number | null) => (n === null ? '—' : String(n));

/** "Needs tier, note, tag"; a comp read from its page: "Confirm or remove". */
export function needText(needs: RowNeed[]): string {
  if (needs.includes('confirm')) return 'Confirm or remove';
  return needs.length ? `Needs ${needs.join(', ')}` : '';
}

/** "200 Chambers St #10A" → "200 Chambers": how the handoff names a comp in a sentence. */
export function shortName(record: CompRecord): string {
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

const TIER_RANK: Record<Tier, number> = { primary: 1, secondary: 2, excluded: 3 };

function sortValue(r: Row, key: SortKey): number | null {
  switch (key) {
    case 'price': return r.price;
    case 'ppsf': return r.ppsf;
    case 'size': return r.size;
    case 'date': return r.date ? Date.parse(r.date) : null;
    case 'tier': return r.tier ? TIER_RANK[r.tier] : 0;
  }
}

/** Sorted within a group; a missing value goes last either way. Ties keep the list order. */
export function sortRows(rows: Row[], s: SortState): Row[] {
  if (!s.key) return rows;
  const key = s.key;
  return rows
    .map((r, i) => ({ r, i, v: sortValue(r, key) }))
    .sort((a, b) => {
      if (a.v === null || Number.isNaN(a.v)) return b.v === null || Number.isNaN(b.v) ? a.i - b.i : 1;
      if (b.v === null || Number.isNaN(b.v)) return -1;
      return a.v === b.v ? a.i - b.i : (a.v - b.v) * s.dir;
    })
    .map((x) => x.r);
}

// ─── Filter ──────────────────────────────────────────────────────────────────

export interface Filter { incomplete: boolean; tags: string[] }

export function passes(r: Row, f: Filter): boolean {
  if (f.incomplete && !r.needs.length) return false;
  if (f.tags.length && !r.tags.some((t) => f.tags.includes(t))) return false;
  return true;
}

/** Each tag on any row, with how many rows carry it, in the order they first appear. */
export function tagCounts(rows: Row[]): { tag: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([tag, n]) => ({ tag, n }));
}

export function groupRows(rows: Row[]): { id: GroupId; rows: Row[] }[] {
  return GROUP_ORDER.map((id) => ({ id, rows: rows.filter((r) => r.group === id) })).filter((g) => g.rows.length);
}

// ─── The status tiles (the prototype's statusStatsLive) ──────────────────────

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

export interface StatusStat {
  status: ListingStatus;
  name: string;
  n: number;
  /** "$4.45M" without a size; "$2,270" with one. */
  median: string;
  /** " median", " ask", " median ask", " last ask"; " / SF" with a size. */
  unit: string;
}

/**
 * Count and median per status, from what the rows show: with no square footage,
 * the median price (sale, ask, last ask); with it, the median $/SF (the engine's
 * own where it has one). A status with no rows is left out.
 */
export function statusStats(rows: Row[], sf: boolean): StatusStat[] {
  return STATUS_ORDER.flatMap((status) => {
    const list = rows.filter((r) => r.group === status);
    if (!list.length) return [];
    const n = list.length;
    if (sf) {
      const m = median(list.flatMap((r) => (r.ppsf === null ? [] : [r.ppsf])));
      return [{ status, name: STATUS_LABEL[status], n, median: psf(m), unit: m === null ? '' : ' / SF' }];
    }
    const m = median(list.flatMap((r) => (r.price === null ? [] : [r.price])));
    const many = n > 1;
    const unit = { sold: ' median', in_contract: many ? ' median ask' : ' ask', active: many ? ' median ask' : ' ask', off_market: many ? ' median last ask' : ' last ask' }[status];
    return [{ status, name: STATUS_LABEL[status], n, median: shortPrice(m), unit: m === null ? '' : unit }];
  });
}
