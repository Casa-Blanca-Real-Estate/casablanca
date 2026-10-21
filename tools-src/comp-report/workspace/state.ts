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

/** Unit condition, low to high: Needs work, Original, Well kept (`good`), Updated, Renovated, Mint (NW-012, NB-4; factor 8's scale). */
export type Condition = 'original' | 'updated' | 'renovated' | 'mint' | 'good' | 'needs_work';

/**
 * The home (§3; `02-screens.md`, New comp): its details. Every field optional:
 * intake is progressive, and the size is the one the numbers can't do without.
 */
export interface Intake {
  address?: Entry<string>;
  unit?: Entry<string>;
  /** StreetEasy's neighborhood, as the page names it (NW-017 a): "Turtle Bay". Kept as shown, never checked against a list. */
  neighborhood?: Entry<string>;
  areaSqft?: Entry<number>;
  beds?: Entry<number>;
  baths?: Entry<number>;
  /** Rooms as New York counts them, halves allowed (NW-011): co-ops price by rooms. */
  rooms?: Entry<number>;
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
  /**
   * The building's features, from the pickers: every option picked in the
   * building groups (Services and facilities, Wellness and recreation, Shared
   * outdoor space — workspace/features.ts), by label. Older reports hold the
   * handoff's six (Doorman, Gym, Pool, Storage, Parking, Roof deck), which keep
   * their labels.
   */
  building?: Entry<string[]>;
  /** The building's policies, from the Policies picker (NW-010): "Pets allowed", "Smoke-free" … */
  policies?: Entry<string[]>;
  corner?: Entry<boolean>;
  condition?: Entry<Condition>;
  yearBuilt?: Entry<number>;
  /** New development (true) or a resale (false). */
  newDevelopment?: Entry<boolean>;
  /**
   * What kind of home it is, as a label (NW-018 a, NB-2 A): the report's type
   * stays the pricing basis (condo or co-op), and this says more — a condop, a
   * townhouse, a house. Never an input to the numbers.
   */
  kind?: Entry<HomeKind>;
  /** A sponsor unit: sold by the building's sponsor (NB-2 A). A flag, not a kind. */
  sponsorUnit?: Entry<boolean>;
  /** HDFC or another income-restricted co-op: the price and the buyer's income are capped (NB-2 A). A flag, not a kind. */
  hdfc?: Entry<boolean>;
}

/** The home's kind label (NB-2 A). The report's type is still condo or co-op. */
export const HOME_KINDS = ['condo', 'coop', 'condop', 'townhouse', 'house', 'multi_family'] as const;
export type HomeKind = (typeof HOME_KINDS)[number];

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
/** An edited email: the body as the agent left it, and a fingerprint of the email it was edited from. */
export interface SendDraft {
  /** Before Dispatch 18 the subject travelled with the body; kept to show an old draft's subject. */
  subject?: string;
  body: string;
  basedOn: string;
  at: string;
  parentId?: string | null;
}

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
  /**
   * The subject line, the agent's (NW-083 a): one for every length, kept apart
   * from the body so editing it freezes no draft. Unset, it's the old draft's
   * subject, else the template's.
   */
  subject?: Entry<string>;
  /** Before Dispatch 18: one edited draft at a time. Read as that length's entry in `drafts`; never written. */
  draft?: SendDraft;
  /** The agent's edited plain text, one per length (Dispatch 18): editing Short keeps the Full one. */
  drafts?: Partial<Record<'full' | 'short' | 'text', SendDraft>>;
  /** Which of the four formats Send shows (Dispatch 14): Designed renders the Full draft. */
  format?: 'full' | 'designed' | 'short' | 'text';
  /** Marked as sent, copied or not (NW-086 a); Reopen clears it. Done shows it. */
  sentAt?: string;
  /** The tab last copied with the Copy button: what Mark as sent records. */
  copiedFormat?: 'full' | 'designed' | 'short' | 'text';
  /** The agent chose the template over the writer's drafts (CR-5). */
  useTemplate?: boolean;
  acks?: Acknowledgment[];
  copiedAt?: string;
  /**
   * The email as the agent last saw it on Send (2026-10-21): the open tab and
   * its plain text. Hubert reads it (get_email) and edits against it; nothing
   * else does.
   */
  seen?: SeenEmail;
}

/** What Send showed: written by the browser as the email changes, read by Hubert's get_email. */
export interface SeenEmail {
  format: 'full' | 'designed' | 'short' | 'text';
  length: 'full' | 'short' | 'text';
  subject: string;
  headline: string;
  text: string;
  at: string;
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
  /**
   * The tags the data has offered each comp, by report comp id (NB-9 C,
   * workspace/settle-tags.ts): a full agent's are pre-filled once, so one the
   * agent took off isn't put back.
   */
  tagsOffered?: Record<string, string[]>;
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
  /**
   * A listing comp's photos, hero first (NW-020 a, Dispatch 20): https URLs on
   * StreetEasy's image hosts only, at most 8, as the server's cleanPhotoUrls
   * kept them. Shown with a plain <img>; never fetched, proxied or copied.
   */
  photos?: string[];
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
