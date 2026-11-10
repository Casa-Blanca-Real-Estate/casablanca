// The reports list's own logic (Dispatch 14, the handoff's screen 2): the header sort, the stage
// each row shows, and the date. Plain functions, so the sort rule can be tested without a browser.
import type { Report } from '../../api.ts';
import type { ScreenId } from '../workspace/screens.ts';
import { followUpState } from '../../../workspace/next-steps.ts';

export type SortKey = 'home' | 'side' | 'range' | 'comps' | 'when';
export interface SortState { key: SortKey; dir: 1 | -1 }

/**
 * The columns after the photo, in order (the design pass, 2026-11-06). Every one sorts. "Stage · updated"
 * sorts by recency: the stage shows beside the date it was last changed.
 */
export const COLUMNS: { key: SortKey; label: string; wide: boolean }[] = [
  { key: 'home', label: 'Home', wide: false },
  { key: 'side', label: 'Side', wide: true },
  { key: 'range', label: 'Range', wide: true },
  { key: 'comps', label: 'Comps', wide: true },
  { key: 'when', label: 'Stage · updated', wide: true },
];

/** Newest first. */
export const DEFAULT_SORT: SortState = { key: 'when', dir: -1 };

/**
 * A header click: another column starts ascending (↑), the same one then goes descending (↓), and a third click
 * clears it back to newest first. "Stage · updated" is the default, so it only flips.
 */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (key === 'when') return current.key === 'when' ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: -1 };
  if (current.key !== key) return { key, dir: 1 };
  return current.dir === 1 ? { key, dir: -1 } : DEFAULT_SORT;
}

type Stage = NonNullable<Report['stage']>;
export const stageOf = (r: Report): Stage => r.stage ?? 'sort';

/** When a report was last worked on: the report or one of its comps (the server's workedAt), else its own update. */
export const workedAt = (r: Report): string => r.workedAt ?? r.updatedAt;

/** The date Stage · updated shows, and sorts by: when it was sent, for a sent report; else when it was last worked on. */
export const whenOf = (r: Report): string => (stageOf(r) === 'sent' && r.sentAt ? r.sentAt : workedAt(r));

/** A report's sort value; null sorts last whichever way the column runs. */
function sortValue(r: Report, key: SortKey): string | number | null {
  if (key === 'home') return r.title.trim();
  if (key === 'side') return r.side ?? null;
  if (key === 'range') return r.rangeLow ?? null;
  if (key === 'comps') return r.comps ?? null;
  const t = Date.parse(whenOf(r));
  return Number.isNaN(t) ? null : t;
}

// Addresses compare as people read them: "25 Leonard" before "100 Barclay", case aside.
const byAddress = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

/** The list in the header's order. Empty values last; ties keep the server's order (newest worked on first). */
export function sortReports(reports: Report[], sort: SortState): Report[] {
  return reports
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = sortValue(a.r, sort.key);
      const y = sortValue(b.r, sort.key);
      if (x === null || y === null) return x === y ? a.i - b.i : x === null ? 1 : -1;
      const raw = typeof x === 'string' && typeof y === 'string' ? byAddress.compare(x, y) : x > y ? 1 : x < y ? -1 : 0;
      // Range by its low end; two with the same low, by the high.
      const tie = !raw && sort.key === 'range' ? (a.r.rangeHigh ?? 0) - (b.r.rangeHigh ?? 0) : 0;
      return (raw || tie) * sort.dir || a.i - b.i;
    })
    .map(({ r }) => r);
}

/** The search box: address, client, or the agent's name or email, as typed. */
export function matchesSearch(r: Report, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [r.title, r.client, r.ownerName, r.ownerEmail].filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** "6 comps · 3 untiered"; "1 comp"; "No comps". */
export function compsLabel(r: Report): string {
  const n = r.comps ?? 0;
  if (!n) return 'No comps';
  const u = r.unsorted ?? 0;
  return `${n} comp${n === 1 ? '' : 's'}${u ? ` · ${u} untiered` : ''}`;
}

/** "$4.23M – $4.92M", or "—" before Findings has one. */
export function rangeLabel(r: Report, price: (n: number) => string): string {
  return r.rangeLow != null && r.rangeHigh != null ? `${price(r.rangeLow)} – ${price(r.rangeHigh)}` : '—';
}

/** The numbers row: how many reports, how many still open, how many sent this month. */
export function listStats(reports: Report[], now: Date = new Date()): { reports: number; open: number; sentThisMonth: number } {
  const sentThisMonth = reports.filter((r) => {
    if (!r.sentAt) return false;
    const d = new Date(r.sentAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  return { reports: reports.length, open: reports.filter((r) => stageOf(r) !== 'sent').length, sentThisMonth };
}

/** Pick up where you left off: the most recently changed report that isn't sent yet. */
export function pickUp(reports: Report[]): Report | null {
  return reports.filter((r) => stageOf(r) !== 'sent' && r.status === 'active')
    .sort((a, b) => Date.parse(workedAt(b)) - Date.parse(workedAt(a)))[0] ?? null;
}

/** "Nov 4"; the year instead when it isn't this one. */
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.getFullYear() === now.getFullYear()
    ? d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

// ─── Hubert's follow-up reminder (Done's What's next, the design pass) ──────

/** Not after a month: by then it's moved on, one way or the other. */
export const FOLLOW_UP_UNTIL_MS = 30 * 24 * 60 * 60 * 1000;

/** A sent report whose follow-up is due (workspace/next-steps.ts, as Done's Hubert reads it), and under a month old. */
export function followUpIsDue(r: Report, now: Date = new Date()): boolean {
  if (r.status !== 'active' || stageOf(r) !== 'sent' || !r.sentAt) return false;
  const checks = Object.fromEntries((r.doneChecks ?? []).map((k) => [k, true]));
  return followUpState(r.sentAt, checks, now) === 'due' && now.getTime() - Date.parse(r.sentAt) <= FOLLOW_UP_UNTIL_MS;
}

/** The reminder on Reports' hero: the longest-waiting report that's due, or null. */
export function followUpDue(reports: Report[], now: Date = new Date()): Report | null {
  return reports.filter((r) => followUpIsDue(r, now)).sort((a, b) => (a.sentAt! < b.sentAt! ? -1 : a.sentAt! > b.sentAt! ? 1 : 0))[0] ?? null;
}

/** "Sent to Jordan and Sam on Nov 4. Heard back? Tick it on Done." */
export function followUpLine(r: Report, now: Date = new Date()): string {
  const when = r.sentAt ? shortDate(r.sentAt, now) : '';
  return `Sent${r.client ? ` to ${r.client}` : ''}${when ? ` on ${when}` : ''}. Heard back? Tick it on Done.`;
}

/** "100 Barclay Street #17L" as the photo's stand-in: the number large, the street under it. */
export function thumbWords(title: string): { number: string; street: string } {
  const t = title.replace(/\s+#\S+$/, '').trim();
  const m = /^(\d+[\w-]*)\s+(.+)$/.exec(t);
  return m ? { number: m[1]!, street: m[2]! } : { number: '', street: t };
}
