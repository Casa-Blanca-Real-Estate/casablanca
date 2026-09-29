// The walkthrough's stored state (CR-3a, Dispatch 07): what the agent enters at
// each step, as the browser and the server both read it. Plain data, no DOM and
// no Node, like the engine, so the same module builds the engine's input in the
// browser (instant recompute) and in the functions (the assistant's summary).
//
// Where it's stored (§12): the intake and deal terms in reports.state, the
// brief in reports.brief, the call in reports.agent_call and the target in
// reports.target. The call and the target never reach the assistant (§8.4).
import type { EvidenceClass, IsoDate, LaundryState, OutdoorKind, ResultKind, Tier } from '../engine/index.ts';

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
}

export type OutdoorChoice = OutdoorKind | 'none';

/** Step 1, the subject (§3, §6.1). Every field optional: intake is progressive. */
export interface Intake {
  address?: Entry<string>;
  unit?: Entry<string>;
  areaSqft?: Entry<number>;
  beds?: Entry<number>;
  baths?: Entry<number>;
  floor?: Entry<number>;
  commonCharges?: Entry<number>;
  taxes?: Entry<number>;
  centralAir?: Entry<boolean>;
  dishwasher?: Entry<boolean>;
  fireplace?: Entry<boolean>;
  laundry?: Entry<LaundryState>;
  outdoorKind?: Entry<OutdoorChoice>;
  outdoorSqft?: Entry<number>;
  views?: Entry<string[]>;
}

export type Audience = 'buyer' | 'seller';

/** Step 1, the brief (§3, §8.6). */
export interface Brief {
  question?: Entry<string>;
  audience?: Entry<Audience>;
  clientNote?: Entry<string>;
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
 * Step 6: who the placeholder email is to and from, and which result it uses.
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
}

export type ReasonType = 'property' | 'client' | 'method';

/** A comp in the report, as the server stores the agent's judgment of it (report_comps, reasons). */
export interface CompJudgment {
  reportCompId: string;
  propertyKey: string;
  evidenceClass: EvidenceClass;
  /** Null until the agent sorts it: an unsorted comp counts toward nothing. */
  tier: Tier | null;
  anchor: boolean;
  reviewedAt: string | null;
  /** Oldest first. The latest is the current reason (§12). */
  reasons: { tier: Tier; reason: string; reasonType: ReasonType; actor: string; at: string; by: string; sample: boolean }[];
}

/** The range stays hidden until the agent gives their call or skips it (§3.1). */
export function isRevealed(call: CallState | null | undefined): boolean {
  return Boolean(call && (call.skipped || (call.low !== undefined && call.high !== undefined)));
}
