// The walkthrough's stored state (CR-3a, Dispatch 07): what the agent enters at
// each step, as the browser and the server both read it. Plain data, no DOM and
// no Node, like the engine, so the same module builds the engine's input in the
// browser (instant recompute) and in the functions (the assistant's summary).
//
// Where it's stored (§12): the intake and deal terms in reports.state, the
// brief in reports.brief, the call in reports.agent_call and the target in
// reports.target. The call and the target never reach the assistant (§8.4).
import type { IsoDate, LaundryState, ListingStatus, OutdoorKind, ResultKind, Tier } from '../engine/index.ts';

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

export type Condition = 'renovated' | 'good' | 'needs_work';

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
  /** Which way the windows face: "South", "North and east". Context; the engine doesn't compare it yet. */
  exposure?: Entry<string>;
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
  at: string;
  sample?: boolean;
}

/**
 * Send: who the placeholder email is from, and which result it uses. The
 * client's name is on the brief now (D-22); `clientName` here is CR-3a's.
 * The agent's edits to the draft are kept until they go back to the template;
 * `basedOn` fingerprints the template they edited, so a draft whose numbers
 * have since moved says so (§3: "numbers changed since this draft").
 */
export interface SendState {
  result?: ResultKind;
  clientName?: Entry<string>;
  signOff?: Entry<string>;
  draft?: { subject: string; body: string; basedOn: string; at: string };
  copiedAt?: string;
}

/** reports.state. */
export interface WorkspaceState {
  intake?: Intake;
  dealTerms?: DealTermsState | null;
  send?: SendState;
  /** The home's link read whose values filled the details, so they fill once. */
  subjectRead?: string;
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
}

/** The range stays hidden until the agent gives their call or skips it (§3.1). */
export function isRevealed(call: CallState | null | undefined): boolean {
  return Boolean(call && (call.skipped || (call.low !== undefined && call.high !== undefined)));
}
