// The New comp window's per-step facts (design pass, new-comp.md §4, 2026-11-11): each step's notes, and the
// building's laundry. Plain data, for the browser and the server alike.
//
// Notes: the Home amenities step keeps the home's original notes field (`notes`, "light, views, condition,
// layout", what Hubert and the per-comp review have always read); General, Own or shared, Building amenities
// and Add comps each keep their own. Client info's notes are the client's (brief.client.notes), read where the
// client's facts are. Everything that reads "the agent's notes on the home" reads them all, labelled.
//
// The building's laundry: on the floor, in the building, or none. The building's "Laundry in building"
// feature, which the comps' tags and the pickers already use, follows it.
import type { BuildingLaundry, Entry, Intake } from './state.ts';

/** The intake's notes fields, in the window's step order, with the step's name. */
export const HOME_NOTES = [
  ['notesGeneral', 'General'],
  ['notesShared', 'Laundry and outdoor space'],
  ['notes', 'Home amenities'],
  ['notesBuilding', 'Building amenities'],
  ['notesComps', 'The comps'],
] as const satisfies readonly (readonly [keyof Intake, string])[];

export type HomeNotesKey = (typeof HOME_NOTES)[number][0];

export const HOME_NOTES_KEYS: readonly HomeNotesKey[] = HOME_NOTES.map(([k]) => k);

export function isHomeNotesKey(key: string): key is HomeNotesKey {
  return (HOME_NOTES_KEYS as readonly string[]).includes(key);
}

/**
 * Every step's notes as one text, each under its step's name when more than one has any: what the review and
 * Hubert read as the agent's notes on the home. Null when there are none. A report from before the steps has
 * only `notes`, which reads as it always did.
 */
export function allHomeNotes(intake: Intake | null | undefined): string | null {
  const filled = HOME_NOTES
    .map(([key, label]) => [label, (intake?.[key] as Entry<string> | undefined)?.value.trim() ?? ''] as const)
    .filter(([, text]) => text);
  if (!filled.length) return null;
  if (filled.length === 1 && intake?.notes?.value.trim()) return filled[0]![1];
  return filled.map(([label, text]) => `${label}: ${text}`).join('\n');
}

export const BUILDING_LAUNDRY_LABEL: Record<BuildingLaundry, string> = { floor: 'On the floor', building: 'In the building', none: 'None' };

const IN_BUILDING = 'Laundry in building';

/** The building's laundry: as the agent set it, else "In the building" when the building's features have it. */
export function buildingLaundryOf(intake: Intake): { value: BuildingLaundry; from?: string | undefined } | null {
  if (intake.buildingLaundry) return { value: intake.buildingLaundry.value, from: intake.buildingLaundry.from };
  if (intake.building?.value.includes(IN_BUILDING)) return { value: 'building', from: intake.building.from };
  return null;
}

/** The intake with the building's laundry set (or cleared), and "Laundry in building" on the building's list to match. */
export function withBuildingLaundry(intake: Intake, value: BuildingLaundry | undefined, asOf: string): Intake {
  const next: Intake = { ...intake };
  if (value) next.buildingLaundry = { value, asOf };
  else delete next.buildingLaundry;
  const list = intake.building?.value ?? [];
  const has = list.includes(IN_BUILDING);
  const want = value === 'floor' || value === 'building' ? true : value === 'none' ? false : has;
  if (want !== has) {
    const updated = want ? [...list, IN_BUILDING] : list.filter((o) => o !== IN_BUILDING);
    if (updated.length) next.building = { value: updated, asOf };
    else delete next.building;
  }
  return next;
}
