// Hubert's edits to the home's details (set_home_fact, server/hubert-home.ts):
// what the agent dictated, as the intake entries to write. Plain data, like
// the rest of workspace/: the server builds the edit, the browser applies it
// to the intake its autosave owns (the way edit_email's edit reaches Send),
// and Undo applies the entries as they were.
import type { Intake } from './state.ts';

/** Each changed field's new entry, or null to clear it. */
export interface HubertHomeEdit {
  set: Partial<Record<keyof Intake, Intake[keyof Intake] | null>>;
}

/** The intake with the edit's entries written in. */
export function applyHomeSet(intake: Intake, set: HubertHomeEdit['set']): Intake {
  const next: Intake = { ...intake };
  for (const [key, entry] of Object.entries(set) as [keyof Intake, Intake[keyof Intake] | null][]) {
    if (entry === null || entry === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = entry;
  }
  return next;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Whether a home entry's Undo still applies: the field still reads as Hubert left it. */
export function homeUndoStands(entry: { kind: string; field: string; undo?: { left: unknown } }, intake: Intake): boolean {
  if (entry.kind !== 'home' || !entry.undo) return false;
  return same((intake as Record<string, { value?: unknown } | undefined>)[entry.field]?.value, entry.undo.left);
}
