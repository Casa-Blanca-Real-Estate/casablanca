// The New comp window's seven steps (design pass, docs/comp-report/design-pass/new-comp.md, 2026-11-11):
// Basics → General → Own or shared → Home amenities → Building amenities → Client info → Add comps. Each
// step's rail label, title, notes (every step but Basics) and what Hubert says beside it, from the canvas's
// STEPS(). The step is in the URL (?start=<key>), so a reload lands back on it.
import type { HomeNotesKey } from '../../../workspace/home-notes.ts';

export const STEP_KEYS = ['basics', 'general', 'shared', 'amenities', 'building', 'client', 'comps'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/** The window's URL value: a step, or Edit details (the window on its own, from a workspace's ✎). */
export type StartScreen = StepKey | 'details';

export interface StepDef {
  key: StepKey;
  /** On the rail: "3 · Own or shared". */
  label: string;
  /** The step's title, large. */
  title: string;
  /** Where the step's notes are kept: an intake field, the client's own, or none (Basics). */
  notes: HomeNotesKey | 'client' | null;
  /** "Notes · anything about the numbers". */
  notesHint: string;
  notesPlaceholder: string;
  /** Skip for now shows (the four optional steps). */
  optional: boolean;
  /** What Hubert says about the step. */
  hubert: string;
  /** Two things to say to him, under "Try". */
  asks: [string, string];
}

/** "Own or shared" is a placeholder name Kimani doesn't love (new-comp.md, Open): one place to change it. */
export const SHARED_NAME = 'Own or shared';

export const STEPS: readonly StepDef[] = [
  {
    key: 'basics', label: 'Basics', title: 'Basics', notes: null, notesHint: '', notesPlaceholder: '', optional: false,
    hubert: 'Buyer or seller, and what kind of home it is. Co-op or condo decides how every comp is weighed.',
    asks: ['Which do I pick for a condop?', 'Do I need the client’s name?'],
  },
  {
    key: 'general', label: 'General', title: 'General', notes: 'notesGeneral', notesHint: 'anything about the numbers',
    notesPlaceholder: 'e.g. The listed size includes a storage cage', optional: false,
    hubert: 'Size, rooms, floor and the monthly costs. If the listing gave no size, an estimate is fine: the email says it’s one.',
    asks: ['The listing has no size. What do I put?', 'Why do monthly costs matter?'],
  },
  {
    key: 'shared', label: SHARED_NAME, title: SHARED_NAME, notes: 'notesShared', notesHint: 'laundry, outdoor space',
    notesPlaceholder: 'e.g. Laundry room is on the same floor; the roof deck is shared by 40 units', optional: true,
    hubert: 'What the home and the building share or trade off: laundry in the unit or down the hall, a terrace of its own or the roof deck. Tell me and I’ll pick them.',
    asks: ['Laundry room on the floor, shared roof deck', 'Is a balcony worth as much as a terrace?'],
  },
  {
    key: 'amenities', label: 'Home amenities', title: 'Home amenities', notes: 'notes', notesHint: 'light, views, condition, layout',
    notesPlaceholder: 'Light, views, condition, layout, storage', optional: true,
    hubert: 'Tell me about the home in your own words (“renovated, south light, a dishwasher”) and I’ll pick the chips.',
    asks: ['Renovated kitchen, south and west light', 'What counts as “Mint”?'],
  },
  {
    key: 'building', label: 'Building amenities', title: 'Building amenities', notes: 'notesBuilding', notesHint: 'the building and the block',
    notesPlaceholder: 'e.g. Lobby renovated 2023; assessment through 2026', optional: true,
    hubert: 'The building’s services and policies. I filled what the listing said; add what you know from being there.',
    asks: ['Doorman, gym and a bike room', 'Does a doorman change the price?'],
  },
  {
    key: 'client', label: 'Client info', title: 'Client info', notes: 'client', notesHint: 'optional',
    notesPlaceholder: 'Anything else about them worth knowing', optional: true,
    hubert: 'Optional, and only for you and me: it shapes the email’s advice, never the numbers.',
    asks: ['Pre-approved for $4M, lease ends in March', 'What should I ask a buyer about?'],
  },
  {
    key: 'comps', label: 'Comps', title: 'Add comps', notes: 'notesComps', notesHint: 'about the comps you picked',
    notesPlaceholder: 'e.g. Found these on a Saturday tour', optional: false,
    hubert: 'Add the comps: paste listing links or drop the StreetEasy export. Recent sales close to the home are best. You sort them next.',
    asks: ['What makes a good comp?', 'Where do I find the StreetEasy export?'],
  },
];

/** The steps Edit details shows: the target property, not the comps. */
export const EDIT_STEPS: readonly StepDef[] = STEPS.filter((s) => s.key !== 'comps');

export function stepOf(key: StepKey): StepDef {
  return STEPS.find((s) => s.key === key)!;
}

/**
 * ?start= as it reads now: the seven steps, and the three of the window before them (a link or a reload from
 * before this round lands on the nearest step): home → Basics, details → Edit details or General, comps.
 */
export function startFromParam(v: string | null): StartScreen | null {
  if (!v) return null;
  if ((STEP_KEYS as readonly string[]).includes(v) || v === 'details') return v as StartScreen;
  if (v === 'home') return 'basics';
  return null;
}

/** The activity log's and the guide's names for the window's steps (a closed list on the server). */
export function loggedScreen(s: StartScreen): 'new-report' | 'new-report-details' | 'new-report-comps' {
  return s === 'basics' ? 'new-report' : s === 'comps' ? 'new-report-comps' : 'new-report-details';
}

/** Hubert's step guides (hubert/guides.ts) by the window's step. */
export function guideStepOf(s: StartScreen): 'home' | 'details' | 'comps' {
  return s === 'basics' ? 'home' : s === 'comps' ? 'comps' : 'details';
}

