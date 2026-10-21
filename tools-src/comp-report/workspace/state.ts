// The walkthrough's stored state (CR-3a, Dispatch 07): what the agent enters at
// each step, as the browser and the server both read it. Plain data, no DOM and
// no Node, like the engine, so the same module builds the engine's input in the
// browser (instant recompute) and in the functions (the assistant's summary).
//
// Where it's stored (§12): the intake and deal terms in reports.state, the
// brief in reports.brief, the call in reports.agent_call and the target in
// reports.target. The call and the target never reach the assistant (§8.4).
import type { IsoDate, LaundryState, ListingStatus, OutdoorKind, ResultKind, Tier } from '../engine/index.ts';
import type { Acknowledgment } from './qa.ts';

/**
 * One value the agent entered: when, whether it's their estimate (input
 * confidence `guesstimate`, so "with estimates" only — §6.4), and whether the
 * sample filled it in. A sample value shows labelled "Sample" wherever it shows.
 */
export interface Entry<T> {
  value: T;
  asOf: IsoDate;
  estimate?: boolean;
  sample?: boolean;
  /**
   * Filled from the home's StreetEasy page (Dispatch 09): shown with a "from
   * StreetEasy" mark, and the engine sources it to the listing. Changing it
   * makes it the agent's.
   */
  from?: 'listing';
  /** The page marks it approximate ("~1,840 ft²"): input confidence `approx`. */
  approx?: boolean;
}

export type OutdoorChoice = OutdoorKind | 'none';

/** Unit condition: the handoff's picker (Original, Updated, Renovated, Mint); good and needs_work are CR-3's. */
export type Condition = 'original' | 'updated' | 'renovated' | 'mint' | 'good' | 'needs_work';

/**
 * The home (§3; `02-screens.md`, New comp): its details. Every field optional:
 * intake is progressive, and the size is the one the numbers can't do without.
 */
export interface Intake {
  address?: Entry<string>;
  unit?: Entry<string>;
  areaSqft?: Entry<number>;
  beds?: Entry<number>;
  baths?: Entry<number>;
  floor?: Entry<number>;
  /** The asking price, where it's listed: its $/sq ft shows against the comps. */
  askingPrice?: Entry<number>;
  commonCharges?: Entry<number>;
  taxes?: Entry<number>;
  /** "What stands out?" Kara: "you really go crazy on the notes." Never a number (§2). */
  notes?: Entry<string>;
  centralAir?: Entry<boolean>;
  dishwasher?: Entry<boolean>;
  fireplace?: Entry<boolean>;
  laundry?: Entry<LaundryState>;
  outdoorKind?: Entry<OutdoorChoice>;
  outdoorSqft?: Entry<number>;
  views?: Entry<string[]>;
  /** Which way the windows face: "South", "North and east". CR-3's free text; the pickers write `exposures`. */
  exposure?: Entry<string>;
  /** Which way the windows face, from the handoff's picker: North, South, East, West. Context; the engine doesn't compare it yet. */
  exposures?: Entry<string[]>;
  /** The building's features, from the handoff's picker: Doorman, Gym, Pool, Storage, Parking, Roof deck. */
  building?: Entry<string[]>;
  corner?: Entry<boolean>;
  condition?: Entry<Condition>;
  yearBuilt?: Entry<number>;
  /** New development (true) or a resale (false). */
  newDevelopment?: Entry<boolean>;
}

export type Audience = 'buyer' | 'seller';

/** Who the report is for (§3, §8.6): buyer or seller, and the client's name (D-22). */
export interface Brief {
  audience?: Entry<Audience>;
  /** Used in the email's greeting. Asked in the new-comp modal, beside buyer or seller (D-22). */
  clientName?: Entry<string>;
  /** What matters to the client: written on Send (`02-screens.md`). */
  clientNote?: Entry<string>;
  /** CR-3a's question. No longer asked; kept for the reports that have one. */
  question?: Entry<string>;
}

/** The furthest screen a report has reached, for the reports list's Stage (Dispatch 14). */
export type Reached = 'sort' | 'findings' | 'send';

/** How it went (D-19's one-tap fallback; filled from deal records later): what the agent typed in. */
export interface Outcomes {
  /** The seller's list price, or the buyer's offer. */
  listedOrOffered?: Entry<number>;
  contract?: Entry<number>;
  sold?: Entry<number>;
}

/** Step 1, deal terms — D-10's recommendation B: two templates in v1 (§6.7). */
export interface DealTermsState {
  template: 'buyer_traditional' | 'seller_pricing';
  price?: Entry<number>;
  depositPercent?: Entry<number>;
  downPaymentPercent?: Entry<number>;
  ratePercent?: Entry<number>;
  termYears?: Entry<number>;
  targetClosing?: Entry<IsoDate>;
  sellerTarget?: Entry<number>;
  timing?: Entry<string>;
  flexibility?: Entry<string>;
}

/** Step 1, a price goal. Never an input to the numbers, never shown to the assistant (§2, §8.4). */
export interface TargetState {
  price: Entry<number>;
  note?: Entry<string>;
}

/**
 * Step 4, the agent's call: their own low–high view, before the range shows
 * (D-1 recommendation C, §3.1). Skipping it reveals the range too.
 */
export interface CallState {
  low?: number;
  high?: number;
  skipped?: boolean;
  /** An optional line on why (`02-screens.md`, Findings). Never shown to the assistant (§8.4). */
  note?: string;
  at: string;
  sample?: boolean;
}

/**
 * Send: who the email is from, and which result it uses. The client's name is
 * on the brief now (D-22); `clientName` here is CR-3a's. The agent's edits to
 * the email are kept until they go back to the draft; `basedOn` fingerprints
 * the email they edited, so one whose numbers have since moved says so (§3:
 * "numbers changed since this draft"), and `parentId` names the writer's
 * draft it came from (CR-5). `acks` are the agent's answers to QA's findings
 * (§9.1), logged with the email when it's copied.
 */
export interface SendState {
  result?: ResultKind;
  /** The one sentence, the agent's (D-21): required before the email can be copied. */
  headline?: Entry<string>;
  /** How the comps were chosen: "I focused on lower floors and homes close in size…" */
  chosen?: Entry<string>;
  /** Things to consider: the agent's points, buildings that trade higher or lower. */
  consider?: Entry<string>;
  /** The next step: the offer advice for a buyer, the pricing advice for a seller. */
  nextStep?: Entry<string>;
  length?: 'full' | 'short' | 'text';
  clientName?: Entry<string>;
  signOff?: Entry<string>;
  draft?: { subject: string; body: string; basedOn: string; at: string; parentId?: string | null };
  /** Which of the four formats Send shows (Dispatch 14): Designed renders the Full draft. */
  format?: 'full' | 'designed' | 'short' | 'text';
  /** Marked as sent (after a copy); Reopen clears it. Done shows it. */
  sentAt?: string;
  /** The agent chose the template over the writer's drafts (CR-5). */
  useTemplate?: boolean;
  acks?: Acknowledgment[];
  copiedAt?: string;
}

/** reports.state. */
export interface WorkspaceState {
  intake?: Intake;
  dealTerms?: DealTermsState | null;
  send?: SendState;
  /** The home's link read whose values filled the details, so they fill once. */
  subjectRead?: string;
  /** The furthest screen reached, for the reports list (Dispatch 14). */
  reached?: Reached;
  outcomes?: Outcomes;
  /** Hubert's drawer has opened on Sort once: it opens by default only the first time (the handoff). */
  hubertSeen?: boolean;
}

export type ReasonType = 'property' | 'client' | 'method';

/**
 * Where a comp's record comes from: its newest observation (§12). An export's
 * comp is read from the stored file (by its property key); a link's from what
 * its page said, confirmed by the agent or not yet; a typed-in comp from what
 * was typed. The browser and the server read each with the engine's parser.
 */
export type CompSource =
  | { kind: 'export'; importId: string | null }
  | { kind: 'listing'; extract: unknown; asOf: IsoDate; url: string | null; readId: string | null; confirmedAt: string | null }
  | { kind: 'manual'; fields: unknown; asOf: IsoDate };

/** A comp in the report, as the server stores the agent's judgment of it (report_comps, reasons). */
export interface CompJudgment {
  reportCompId: string;
  propertyKey: string;
  /** Sold, in contract, active — or off the market unsold: "didn't sell" (§6.3). */
  evidenceClass: ListingStatus;
  /** Null until the agent sorts it: an unsorted comp counts toward nothing. */
  tier: Tier | null;
  anchor: boolean;
  reviewedAt: string | null;
  /** Oldest first. The latest is the current reason (§12). */
  reasons: { tier: Tier; reason: string; reasonType: ReasonType; actor: string; at: string; by: string; sample: boolean }[];
  source: CompSource;
  /** The agent's note, "Why it's a comp" (Dispatch 14): it can come before a tier. Older comps have only reasons: see noteOf. */
  note?: string | null;
  /** The agent's tags, from the handoff's list (workspace/features.ts). */
  tags?: string[];
  /** The comp's features as the agent sees them, in the home's pickers. Empty: none given. */
  features?: Record<string, string[]>;
  /** Taken out of the report: it counts in nothing, and an export's removed row is what Hubert can suggest again. */
  removedAt?: string | null;
  /**
   * The agent's corrections to the source's facts (Dispatch 15, NW-044 a): read
   * as the agent's fact, marked "changed"; the source's value stays on record.
   */
  factOverrides?: FactOverrides;
}

/** The source facts the agent can correct on a comp's card: a closed list, checked by the server. */
export const OVERRIDE_KEYS = ['price', 'size', 'date', 'floor'] as const;
export type OverrideKey = (typeof OVERRIDE_KEYS)[number];

/** One correction: the value (whole dollars, whole square feet, YYYY-MM-DD, a whole floor), who made it and when. */
export interface FactOverride<T = number | string> {
  value: T;
  by: string;
  at: string;
}

export interface FactOverrides {
  price?: FactOverride<number>;
  size?: FactOverride<number>;
  date?: FactOverride<string>;
  floor?: FactOverride<number>;
}

/** A reason recorded when a comp is tiered before it has a note (the reasons table needs one). */
export const NO_NOTE_YET = '(no note yet)';

/** The agent's note on a comp: the note itself, else the latest reason that's a real one (older comps). */
export function noteOf(j: CompJudgment | null | undefined): string | null {
  if (!j) return null;
  if (j.note !== undefined && j.note !== null) return j.note.trim() || null;
  const r = j.reasons.at(-1)?.reason?.trim();
  return r && r !== NO_NOTE_YET ? r : null;
}

/** The range stays hidden until the agent gives their call or skips it (§3.1). */
export function isRevealed(call: CallState | null | undefined): boolean {
  return Boolean(call && (call.skipped || (call.low !== undefined && call.high !== undefined)));
}
