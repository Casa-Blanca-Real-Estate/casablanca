// Sort's table (the handoff, screen 6; Dispatch 14 item 6), as plain data: one
// row per comp with what its cells show, the groups by status, the header
// sort, and the filter. No React here, so the drawer and
// Findings can read the same figures the rows show.
import type { CompOut, ListingStatus, Tier } from '../../../engine/index.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { psf } from '../../../workspace/format.ts';
import { noteOf } from '../../../workspace/state.ts';
import { compAddress, compPrice, compStatus, rowPsf, STATUS_LABEL, STATUS_ORDER } from '../workspace/comps.tsx';
import { needsOf } from '../workspace/screens.ts';
import type { RowNeed } from './table.ts';

export {
  monthYear, needText, nextSort, passes, shortName, shortPrice, sortRows, tagCounts,
  type Filter, type RowNeed, type SortKey, type SortState,
} from './table.ts';

/** A group of rows: the four statuses, then comps that can't be sorted. */
export type GroupId = ListingStatus | 'unsortable';
export const GROUP_ORDER: GroupId[] = [...STATUS_ORDER, 'unsortable'];
export const GROUP_LABEL: Record<GroupId, string> = { ...STATUS_LABEL, unsortable: 'Can’t be sorted' };

/** The price column's header per group (the prototype: Sale, Ask, Last ask). */
export const PRICE_LABEL: Record<GroupId, string> = { sold: 'Sale', in_contract: 'Ask', active: 'Ask', off_market: 'Last ask', unsortable: 'Price' };

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

// ─── What the cells say (the rest are in table.ts) ───────────────────────────

export function sizeText(r: Row): string {
  return r.size === null ? '—' : `${r.sizeEst ? '~' : ''}${Math.round(r.size).toLocaleString('en-US')}`;
}

export const ppsfText = (r: Row) => psf(r.ppsf);
export const countText = (n: number | null) => (n === null ? '—' : String(n));

/** The rows by group, in the groups' order; a group with no rows is left out. */
export function groupRows(rows: Row[]): { id: GroupId; rows: Row[] }[] {
  return GROUP_ORDER.map((id) => ({ id, rows: rows.filter((r) => r.group === id) })).filter((g) => g.rows.length);
}

