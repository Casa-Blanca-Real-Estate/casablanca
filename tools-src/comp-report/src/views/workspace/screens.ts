// The workspace's screens after the design port (Dispatch 14): Sort, the Gate,
// Findings, Send and Done, with the progress row's three steps over them.
// Plain functions, shared by the shell and every screen.
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { noteOf, type Intake } from '../../../workspace/state.ts';

export type ScreenId = 'sort' | 'gate' | 'findings' | 'send' | 'done';

/** The progress row: Sort → Findings → Send. The Gate sits under Findings; Done under Send. */
export const PROGRESS: { id: 'sort' | 'findings' | 'send'; n: number; label: string }[] = [
  { id: 'sort', n: 1, label: 'Sort' },
  { id: 'findings', n: 2, label: 'Findings' },
  { id: 'send', n: 3, label: 'Send' },
];

export function progressStep(screen: ScreenId): 'sort' | 'findings' | 'send' {
  return screen === 'gate' ? 'findings' : screen === 'done' ? 'send' : screen;
}

export function isScreen(s: string | null): s is ScreenId {
  return s === 'sort' || s === 'gate' || s === 'findings' || s === 'send' || s === 'done';
}

/** What a comp still needs before Findings unlocks (the handoff: a tier, a note and at least one tag). */
export type Need = 'tier' | 'note' | 'tag';

export function needsOf(c: WorkspaceComp): Need[] {
  const j = c.judgment;
  const needs: Need[] = [];
  if (!j?.tier) needs.push('tier');
  if (!noteOf(j)) needs.push('note');
  if (!(j?.tags?.length)) needs.push('tag');
  return needs;
}

/** "Needs tier, note, tag". */
export function needsLabel(needs: Need[]): string {
  return needs.length ? `Needs ${needs.join(', ')}` : '';
}

export interface SortReadiness {
  /** Findings unlocks: every comp that can be sorted has a tier, a note and a tag, and none waits for a confirm. */
  ready: boolean;
  /** The comps that still need something, in list order. */
  incomplete: { comp: WorkspaceComp; needs: Need[] }[];
  /** Comps read from a link and not yet confirmed: confirm or remove them first. */
  toConfirm: WorkspaceComp[];
  /** Comps that can be sorted (a comp the engine can't sort doesn't count). */
  counted: number;
}

/**
 * The Sort → Gate requirement (Dispatch 14, item 6). Comps still to confirm
 * must be confirmed or removed; comps that can't be sorted (no address, a
 * status the engine doesn't know) don't count. With no comps, it isn't ready.
 */
export function sortReadiness(comps: WorkspaceComp[]): SortReadiness {
  const sortable = comps.filter((c) => !c.unsortable);
  const toConfirm = sortable.filter((c) => c.unconfirmed);
  const incomplete = sortable.filter((c) => !c.unconfirmed).map((comp) => ({ comp, needs: needsOf(comp) })).filter((x) => x.needs.length);
  return { ready: sortable.length > 0 && !toConfirm.length && !incomplete.length, incomplete, toConfirm, counted: sortable.length };
}

/** "3 comps need a tier, note or tag" — the helper link under the Findings button. */
export function readinessLine(r: SortReadiness): string {
  if (r.ready) return '';
  if (!r.counted) return 'Add comps to sort';
  const parts: string[] = [];
  if (r.incomplete.length) parts.push(`${r.incomplete.length} comp${r.incomplete.length === 1 ? ' needs' : 's need'} a tier, note or tag`);
  if (r.toConfirm.length) parts.push(`${r.toConfirm.length} to confirm`);
  return parts.join(' · ');
}

/**
 * Square footage (the handoff, "No square footage"): with no interior size and
 * no estimate of one, every per-SF figure and size column is hidden on every
 * screen. A co-op never prices by the square foot (the engine refuses $/sq ft
 * for co-op reports), so it counts as no size whatever the intake says.
 */
export function hasSF(intake: Intake, propertyType: 'condo' | 'coop' = 'condo'): boolean {
  return propertyType === 'condo' && Boolean(intake.areaSqft && intake.areaSqft.value > 0);
}

/**
 * The home's short name, as the handoff writes it ("17L has it too", "What
 * makes it comparable to 17L"): the unit without its "#", else the street
 * line, else the report's title.
 */
export function homeName(intake: Intake, title: string): string {
  const unit = intake.unit?.value.trim().replace(/^#\s*/, '');
  if (unit) return unit;
  const street = intake.address?.value.split(',')[0]?.trim();
  return street || title.trim() || 'the home';
}
