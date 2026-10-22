// The per-comp review on Sort (Dispatch 25, D-29): the agent reasons about each
// comp before tiering it, one comp at a time, with Hubert's view of that comp
// beside theirs. The human drives: a practice agent writes their note and tags,
// asks Hubert for feedback, and only then can see his own take; a full agent
// sees his take first and writes or edits their own. The tier is always the
// agent's: Hubert suggests one in his take and never sets it.
//
// Plain data, like the engine, so the browser, the server and the tests read
// the same shapes. What it holds:
//   - a review entry, as stored: append-only, per comp, in reports.state.reviews
//     (no migration: state is jsonb), written only by the server's review call
//     and the sample, never by the browser's state save
//   - which comps the flow walks, and in what order
//   - what the model is given for one comp: its facts, the home's, how the
//     engine measured one against the other, Kara's checks, and the agent's own
//     note and tags. Never the agent's number, the target, the deal terms or the
//     tier (D-4: the reveal hasn't happened yet).
import type { EngineOutput, Tier } from '../engine/index.ts';
import { addressOf } from './email.ts';
import type { WorkspaceComp } from './engine-input.ts';
import { cleanFeatures, featuresFromRecord, homeFeatures, type Features } from './features.ts';
import { againstAsk, psf, sqft, usd } from './format.ts';
import { homeName } from './reading.ts';
import type { Intake } from './state.ts';
import { againstHome } from './writer-input.ts';

export type ReviewKind = 'feedback' | 'take';

/**
 * One round with Hubert on one comp. `text` is what he said; a take carries
 * the tier he would give (advice: nothing reads it but the screen). `weak`
 * is his flag, with a plain reason, or null. `note` is the agent's note the
 * round was about (feedback), so a mentor can follow the learning later;
 * `asked` is what a full agent typed under his take before asking again.
 */
export interface ReviewEntry {
  at: string;
  kind: ReviewKind;
  text: string;
  weak: { reason: string } | null;
  /** Who asked: the agent's email. */
  by: string;
  /** A take's suggested tier, and why, in a sentence. */
  tier?: Tier | null;
  tierWhy?: string;
  /** The agent's note and tags as they were when they asked for feedback. */
  note?: string | null;
  tags?: string[];
  /** A full agent's words to Hubert, before he took another look. */
  asked?: string | null;
  /** Filled in by the sample (Dispatch 25 item 7): shown labelled "Sample". */
  sample?: boolean;
}

/** The most rounds kept per comp: the oldest go first. Enough for a learning trail, bounded for the jsonb. */
export const MAX_ROUNDS = 40;
export const MAX_REVIEW_TEXT = 4000;
export const MAX_ASKED = 1000;
const TIERS: readonly Tier[] = ['primary', 'secondary', 'excluded'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** One stored entry, or null when it isn't one. Only the known keys are kept, each checked. */
export function cleanReviewEntry(raw: unknown): ReviewEntry | null {
  if (!isObject(raw)) return null;
  if (raw.kind !== 'feedback' && raw.kind !== 'take') return null;
  if (typeof raw.at !== 'string' || Number.isNaN(Date.parse(raw.at))) return null;
  if (!text(raw.text, MAX_REVIEW_TEXT) || typeof raw.by !== 'string' || !raw.by) return null;
  let weak: ReviewEntry['weak'] = null;
  if (raw.weak !== null && raw.weak !== undefined) {
    if (!isObject(raw.weak) || !text(raw.weak.reason, 500)) return null;
    weak = { reason: String(raw.weak.reason).trim() };
  }
  const out: ReviewEntry = { at: raw.at, kind: raw.kind, text: String(raw.text).trim(), weak, by: raw.by };
  if (raw.kind === 'take') {
    out.tier = TIERS.includes(raw.tier as Tier) ? (raw.tier as Tier) : null;
    if (text(raw.tierWhy, 1000)) out.tierWhy = String(raw.tierWhy).trim();
  }
  if (typeof raw.note === 'string' || raw.note === null) out.note = raw.note === null ? null : raw.note.slice(0, 2000);
  if (Array.isArray(raw.tags)) out.tags = raw.tags.filter((t): t is string => typeof t === 'string').slice(0, 30);
  if (typeof raw.asked === 'string' && raw.asked.length <= MAX_ASKED) out.asked = raw.asked;
  if (raw.sample === true) out.sample = true;
  return out;
}

/** A comp's stored rounds, oldest first, less anything that isn't one. */
export function cleanReview(raw: unknown): ReviewEntry[] {
  return Array.isArray(raw) ? raw.map(cleanReviewEntry).filter((e): e is ReviewEntry => e !== null) : [];
}

/** state.reviews: every comp's rounds, by report comp id. */
export function cleanReviews(raw: unknown): Record<string, ReviewEntry[]> {
  if (!isObject(raw)) return {};
  const out: Record<string, ReviewEntry[]> = {};
  for (const [id, list] of Object.entries(raw)) {
    const rounds = cleanReview(list);
    if (rounds.length) out[id] = rounds;
  }
  return out;
}

export function latest(review: readonly ReviewEntry[] | undefined, kind: ReviewKind): ReviewEntry | null {
  return [...(review ?? [])].reverse().find((e) => e.kind === kind) ?? null;
}

/** A practice agent sees Hubert's take only after one round of feedback (Dispatch 25 item 3). */
export function takeUnlocked(review: readonly ReviewEntry[] | undefined, level: 'practice' | 'full'): boolean {
  return level === 'full' || Boolean(latest(review, 'feedback'));
}

/**
 * Hubert's weak flag on a comp, as the agent may see it: his latest round's.
 * A practice agent's take stays out of it until they've opened it (`seenTake`),
 * so the flag on Sort never gives his take away before their feedback.
 */
export function weakFlag(review: readonly ReviewEntry[] | undefined, level: 'practice' | 'full' = 'full', seenTake = false): { reason: string } | null {
  const shown = (review ?? []).filter((e) => level === 'full' || seenTake || e.kind === 'feedback');
  return shown.length ? shown[shown.length - 1]!.weak : null;
}

/**
 * Done in the flow: the comp has the agent's tier and, for a practice agent, a
 * round of feedback on their reasoning. "Review comps" leads Sort until every
 * comp is.
 */
export function stepDone(c: WorkspaceComp, level: 'practice' | 'full'): boolean {
  const j = c.judgment;
  if (!j || j.removedAt) return true;
  if (!j.tier) return false;
  return level === 'full' || Boolean(latest(j.review, 'feedback'));
}

/** The flow's order: the comps it walks, untiered ones first, each in Sort's order otherwise. */
export function reviewOrder<T extends { tier: Tier | null }>(sortOrder: readonly T[]): T[] {
  return [...sortOrder.filter((r) => !r.tier), ...sortOrder.filter((r) => r.tier)];
}

// ─── What the model is given ─────────────────────────────────────────────────

export interface ReviewInput {
  home: {
    name: string;
    type: 'condo' | 'co-op';
    facts: Record<string, string>;
    features: Features;
  };
  comp: {
    name: string;
    status: 'sold' | 'in contract' | 'active' | 'didn’t sell';
    source: 'StreetEasy export' | 'StreetEasy page' | 'typed in by the agent';
    facts: Record<string, string>;
    features: Features;
    /** How it differs from the home, as the engine measured it. */
    against_the_home: string[];
    /** The mentors' comparability checks that flagged it, as the engine words them (§6.10). */
    checks: string[];
  };
  /** The agent's own reasoning: what feedback reviews. Left out of a take, so his view is his own. */
  agent?: { note: string | null; tags: string[] };
  /** A full agent's words under Hubert's last take, for another look. */
  agent_asks?: string;
}

const STATUS_WORDS = { sold: 'sold', in_contract: 'in contract', active: 'active', off_market: 'didn’t sell' } as const;
const SOURCE_WORDS = { export: 'StreetEasy export', listing: 'StreetEasy page', manual: 'typed in by the agent' } as const;

function intakeFacts(i: Intake): Record<string, string> {
  const out: Record<string, string> = {};
  if (i.areaSqft) out.size = sqft(i.areaSqft.value, Boolean(i.areaSqft.approx || i.areaSqft.estimate));
  if (i.beds) out.bedrooms = String(i.beds.value);
  if (i.baths) out.bathrooms = String(i.baths.value);
  if (i.rooms) out.rooms = String(i.rooms.value);
  if (i.floor) out.floor = String(i.floor.value);
  if (i.askingPrice) out.asking_price = usd(i.askingPrice.value);
  if (i.commonCharges) out.common_charges = `${usd(i.commonCharges.value)} a month`;
  if (i.taxes) out.taxes = `${usd(i.taxes.value)} a month`;
  if (i.yearBuilt) out.year_built = String(i.yearBuilt.value);
  if (i.newDevelopment) out.new_development = i.newDevelopment.value ? 'yes' : 'no';
  if (i.neighborhood) out.neighborhood = i.neighborhood.value;
  if (i.notes?.value.trim()) out.what_stands_out = i.notes.value.trim();
  return out;
}

/**
 * One comp's review input, from the report as it's stored. `output` must
 * carry no named prices or deal terms (server/numbers.ts builds it so); this
 * reads only the comp's own figures and the engine's measurements.
 */
export function reviewInput(args: {
  output: EngineOutput;
  comp: WorkspaceComp;
  intake: Intake | undefined;
  propertyType: 'condo' | 'coop';
  job: ReviewKind;
  asks?: string | null;
}): ReviewInput {
  const { output, comp } = args;
  const intake = args.intake ?? {};
  const out = output.comps.find((c) => c.id === comp.id);
  const f = comp.record.facts;
  const status = comp.record.status.listing_status ?? comp.record.status.evidence_class ?? comp.judgment?.evidenceClass ?? 'sold';
  const sized = Boolean(intake.areaSqft) && args.propertyType === 'condo';
  const facts: Record<string, string> = {};
  const price = status === 'sold' ? f.sale_price?.value : f.list_price?.value;
  if (price) facts[status === 'sold' ? 'sale_price' : status === 'off_market' ? 'last_ask' : 'ask'] = usd(price);
  if (status === 'sold' && f.list_price) facts.last_ask = usd(f.list_price.value);
  const ppsf = out?.per_result.on_facts.price_per_sqft?.value ?? out?.per_result.with_estimates.price_per_sqft?.value ?? null;
  if (ppsf !== null) facts.price_per_sqft = psf(ppsf);
  if (f.area_sqft) facts.size = sqft(f.area_sqft.value, f.area_sqft.confidence === 'approx' || comp.record.flags.approx_area);
  if (f.beds) facts.bedrooms = String(f.beds.value);
  if (f.baths) facts.bathrooms = String(f.baths.value);
  if (f.rooms) facts.rooms = String(f.rooms.value);
  if (f.floor) facts.floor = String(f.floor.value);
  if (f.status_date) facts[status === 'sold' ? 'sale_date' : 'date'] = f.status_date.value;
  if (out?.days_on_market !== null && out?.days_on_market !== undefined) facts.days_on_the_market = String(out.days_on_market);
  if (out?.sale_to_ask_percent) facts.sale_against_last_ask = againstAsk(out.sale_to_ask_percent.value);
  if (out?.distance_miles !== null && out?.distance_miles !== undefined) {
    facts.distance = out.distance_miles === 0 ? 'in the same building' : `${(Math.round(out.distance_miles * 100) / 100).toString()} miles`;
  }
  if (comp.record.neighborhood) facts.neighborhood = comp.record.neighborhood;
  const carry = out?.per_result.on_facts.monthly_carry ?? out?.per_result.with_estimates.monthly_carry;
  if (carry) facts.monthly_carry = `${usd(carry.value)} a month`;
  const own = comp.judgment?.features;
  const features = own && Object.keys(own).length ? cleanFeatures(own) : featuresFromRecord(comp.record);
  const comparisons = out ? (out.per_result.on_facts.comparisons.length ? out.per_result.on_facts.comparisons : out.per_result.with_estimates.comparisons) : [];

  const input: ReviewInput = {
    home: {
      name: homeName(intake.unit?.value, intake.address?.value.split(',')[0]),
      type: args.propertyType === 'coop' ? 'co-op' : 'condo',
      facts: intakeFacts(intake),
      features: homeFeatures(intake),
    },
    comp: {
      name: addressOf(comp),
      status: STATUS_WORDS[status as keyof typeof STATUS_WORDS] ?? 'sold',
      source: SOURCE_WORDS[comp.judgment?.source.kind ?? 'export'],
      facts: sized ? facts : Object.fromEntries(Object.entries(facts).filter(([k]) => k !== 'price_per_sqft')),
      features,
      against_the_home: comparisons.map(againstHome).filter((x): x is string => Boolean(x)),
      checks: (out?.checks ?? []).filter((k) => k.status === 'flagged').map((k) => k.message),
    },
  };
  if (args.job === 'feedback') input.agent = { note: comp.judgment?.note?.trim() || null, tags: comp.judgment?.tags ?? [] };
  const asks = args.asks?.trim();
  if (args.job === 'take' && asks) input.agent_asks = asks;
  return input;
}
