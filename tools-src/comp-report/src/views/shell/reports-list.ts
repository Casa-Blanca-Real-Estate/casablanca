// The reports list's own logic (Dispatch 14, the handoff's screen 2): the header sort, the stage
// each row shows, and the date. Plain functions, so the sort rule can be tested without a browser.
import type { Report } from '../../api.ts';
import type { ScreenId } from '../workspace/screens.ts';

export type SortKey = 'home' | 'side' | 'stage' | 'updated';
export interface SortState { key: SortKey; dir: 1 | -1 }

/** The columns after the thumbnail, in order. The handoff calls the Side column "Client"; it holds Buyer or Seller. */
export const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'home', label: 'Home', align: 'left' },
  { key: 'side', label: 'Side', align: 'left' },
  { key: 'stage', label: 'Stage', align: 'left' },
  { key: 'updated', label: 'Updated', align: 'right' },
];

export const DEFAULT_SORT: SortState = { key: 'updated', dir: -1 };

/** A header click: the same column flips its direction; another starts ascending, except Updated, which starts newest first. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key === key) return { key, dir: current.dir === 1 ? -1 : 1 };
  return { key, dir: key === 'updated' ? -1 : 1 };
}

type Stage = NonNullable<Report['stage']>;
const STAGE_ORDER: Record<Stage, number> = { sort: 1, findings: 2, send: 3, sent: 4 };
export const stageOf = (r: Report): Stage => r.stage ?? 'sort';

function sortValue(r: Report, key: SortKey): string | number {
  if (key === 'home') return r.title;
  if (key === 'side') return r.side ?? '';
  if (key === 'stage') return STAGE_ORDER[stageOf(r)];
  return r.updatedAt;
}

/** The list in the header's order. Plain comparison, as the prototype does it; ties keep the server's order. */
export function sortReports(reports: Report[], sort: SortState): Report[] {
  return reports
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = sortValue(a.r, sort.key);
      const y = sortValue(b.r, sort.key);
      const cmp = (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      return cmp || a.i - b.i;
    })
    .map(({ r }) => r);
}

export const STAGE_LABEL: Record<Stage, string> = { sort: 'Sort', findings: 'Findings', send: 'Send', sent: 'Sent' };
/** The status square's class (the shared .sq set): Send ink, Sort yellow, Findings lavender, Sent hollow. */
export const STAGE_SQUARE: Record<Stage, string> = { sort: 'yellow', findings: 'in_contract', send: 'sold', sent: 'sent' };

/** "Sort · 3 unsorted" while comps still need a tier; the stage's name otherwise. */
export function stageLabel(r: Report): string {
  const stage = stageOf(r);
  if (stage === 'sort' && r.unsorted) return `Sort · ${r.unsorted} unsorted`;
  return STAGE_LABEL[stage];
}

/** The screen a row opens on: where the report got to. Sort is the default, so it needs no step. */
export function screenFor(r: Report): ScreenId | undefined {
  const stage = stageOf(r);
  return stage === 'sent' ? 'done' : stage === 'sort' ? undefined : stage;
}

/** "Oct 9, 4:12 PM"; the year instead of the time when it isn't this one. */
export function updatedLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const thisYear = d.getFullYear() === now.getFullYear();
  const text = thisYear
    ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return text.replace(/[  ]/g, ' '); // newer ICU puts a narrow no-break space before AM/PM
}

export const PAGE_SIZE = 10;
