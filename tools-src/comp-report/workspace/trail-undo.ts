// Undo on Hubert's comp edits (hubert-plan.md question 5): the trail entry
// carries the agent's own edit that puts the field back (server/hubert-comps.ts).
// It's offered only while the comp still reads as Hubert left it, so an entry
// already undone, or changed since by the agent or by Hubert again, has none:
// Undo never overwrites a later change.
import type { TrailEntry } from '../server/hubert-trail.ts';
import { noteOf, OVERRIDE_KEYS, type CompJudgment, type OverrideKey } from './state.ts';

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The field as it reads now, in the terms the entry's `left` is in. */
function current(field: string, j: CompJudgment): unknown {
  if (field === 'tier') return j.tier;
  if (field === 'note') return noteOf(j);
  if (field === 'tags') return j.tags ?? [];
  if ((OVERRIDE_KEYS as readonly string[]).includes(field)) return j.factOverrides?.[field as OverrideKey]?.value ?? null;
  return undefined;
}

/** Whether the entry's Undo still applies to this comp. */
export function undoStands(entry: TrailEntry, j: CompJudgment | null | undefined): boolean {
  if (!entry.undo || entry.kind !== 'comp' || !j || j.reportCompId !== entry.compId || j.removedAt) return false;
  const now = current(entry.field, j);
  return now !== undefined && same(now, entry.undo.left);
}
