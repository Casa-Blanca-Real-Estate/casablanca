// The verdict: from a provider's answers to what a judgment says, and how it
// lands (design §7.1; Dispatch 10 phase 1 step 5). Pure.
//
// - The two-order rule: a choice counts when both option orders give the same
//   top option. Its probability is the mean of the two orders' (handoff §5.1).
// - Between 0.4 and 0.6 is always "ask", whatever the bands say.
// - A score comes back 0-based. scoreLevel() is the one place it's converted,
//   to the 1-based level the registry lists, and a test asserts it.
// - Bands need a bar per question × provider × model. Every bar starts
//   uncalibrated, and while a question's bar is uncalibrated its answers land
//   as "watch": recorded, never shown. A bar can't be set without a pointer to
//   its evidence — the same way house-method values stay null (§6.6).

import type { ParsedAnswer } from './jev.ts';
import { ordersOf, wireId } from './render.ts';
import type { Question } from './registry.ts';

export type ProviderId = 'jev' | 'haiku';

/** Where a judgment would land by its bar, before watch mode holds it back. */
export type Band = 'high' | 'middling' | 'low' | 'ask' | 'unsure';
/** How it landed. In phase 1, always "watch". */
export type Landing = 'watch' | 'applied' | 'suggested' | 'asked';

export interface Verdict {
  questionId: string;
  /** The top option; "true"/"false" for a yes/no; the 1-based level as a string for a score. */
  answer: string | null;
  /** The answer's probability: the two orders' mean for a choice, max(P, 1−P) for a yes/no. */
  probability: number | null;
  /** Both orders chose the same top option (always true for one-order questions). */
  orderStable: boolean;
  /** Each order's probabilities as answered, keyed "fwd"/"rev", or "once". */
  probabilities: Record<string, Record<string, number>>;
  /** For a score: the 1-based level, unrounded. */
  level?: number;
  vendorConfidence: Record<string, number>;
}

/** The ask band: never settled by a bar. */
export const ASK_BAND = { low: 0.4, high: 0.6 } as const;

function argmax(p: Record<string, number>): string | null {
  let best: string | null = null;
  let bp = -1;
  for (const [k, v] of Object.entries(p)) if (v > bp) { best = k; bp = v; }
  return best;
}

/**
 * The one conversion of a Jev score: its 0-based level index, a
 * probability-weighted mean from 0 to levels − 1, to the registry's 1-based
 * levels. Null when it's outside the scale.
 */
export function scoreLevel(raw0Based: number, levels: number): number | null {
  if (!Number.isFinite(raw0Based) || raw0Based < 0 || raw0Based > levels - 1) return null;
  return raw0Based + 1;
}

/**
 * PURE: the verdict on one registry question from the answers to its wire ids,
 * or null when any order went unanswered (the question is then "unanswered").
 */
export function verdictFor(q: Question, answers: Record<string, ParsedAnswer>): Verdict | null {
  const vendorConfidence: Record<string, number> = {};
  if (q.type === 'choice') {
    const fwd = answers[wireId(q.id, 'fwd')];
    const rev = answers[wireId(q.id, 'rev')];
    if (!fwd?.probabilities || !rev?.probabilities || !fwd.choice || !rev.choice) return null;
    if (fwd.vendorConfidence !== undefined) vendorConfidence.fwd = fwd.vendorConfidence;
    if (rev.vendorConfidence !== undefined) vendorConfidence.rev = rev.vendorConfidence;
    const keys = q.options.map((o) => o.key);
    const mean = Object.fromEntries(keys.map((k) => [k, ((fwd.probabilities![k] ?? 0) + (rev.probabilities![k] ?? 0)) / 2]));
    const top = argmax(mean);
    return {
      questionId: q.id,
      answer: top,
      probability: top ? mean[top]! : null,
      orderStable: fwd.choice === rev.choice && argmax(fwd.probabilities) === argmax(rev.probabilities),
      probabilities: { fwd: fwd.probabilities, rev: rev.probabilities },
      vendorConfidence,
    };
  }
  const id = wireId(q.id, ordersOf(q)[0]!);
  const a = answers[id];
  if (!a) return null;
  if (a.vendorConfidence !== undefined) vendorConfidence.once = a.vendorConfidence;
  if (q.type === 'boolean') {
    if (a.probability === undefined) return null;
    const p = a.probability;
    return {
      questionId: q.id,
      answer: p >= 0.5 ? 'true' : 'false',
      probability: Math.max(p, 1 - p),
      orderStable: true,
      probabilities: { once: { true: p } },
      vendorConfidence,
    };
  }
  if (a.rawScore === undefined) return null;
  const level = scoreLevel(a.rawScore, q.levels.length);
  if (level === null) return null;
  const dist = a.probabilities ?? {};
  // A score's "probability" is the weight on the level it rounds to, when the distribution came back.
  const rounded = Math.round(level);
  return {
    questionId: q.id,
    answer: String(rounded),
    probability: dist[String(rounded - 1)] ?? null,
    orderStable: true,
    probabilities: { once: dist },
    level,
    vendorConfidence,
  };
}

// ─── Bars ────────────────────────────────────────────────────────────────────

export type Bar =
  | { questionId: string; provider: ProviderId; model: string; state: 'uncalibrated' }
  | {
    questionId: string; provider: ProviderId; model: string; state: 'calibrated';
    /** At or above (and order-stable): high. */
    high: number;
    /** At or above: middling. Below: low. */
    middling: number;
    /** Where the measurement is: a path and section, e.g. docs/comp-report/jev-calibration.md#condition. */
    evidence: string;
  };

/**
 * The bars. Empty on purpose: every question × provider × model is
 * uncalibrated until phase 2 measures it and Kimani decides (Dispatch 10
 * phase 2). A calibrated bar is added here, with its evidence.
 */
export const BARS: readonly Bar[] = [];

/** A bar that can't be used — asserted empty by the tests. */
export function barProblems(bars: readonly Bar[] = BARS): string[] {
  const out: string[] = [];
  for (const b of bars) {
    if (b.state !== 'calibrated') continue;
    const where = `${b.questionId} × ${b.provider} × ${b.model}`;
    if (!/^docs\/comp-report\/[^\s#]+\.md#\S+$/.test(b.evidence)) out.push(`${where}: a bar needs a pointer to its evidence (docs/comp-report/….md#section)`);
    if (!(b.high > b.middling && b.middling > 0 && b.high <= 1)) out.push(`${where}: needs 0 < middling < high ≤ 1`);
  }
  return out;
}

export function barFor(questionId: string, provider: ProviderId, model: string | null, bars: readonly Bar[] = BARS): Bar {
  const found = bars.find((b) => b.questionId === questionId && b.provider === provider && b.model === model);
  if (found && barProblems([found]).length === 0) return found;
  return { questionId, provider, model: model ?? '(unknown)', state: 'uncalibrated' };
}

/**
 * PURE: the band a verdict would fall in under its bar. Uncalibrated, it still
 * gets a band for the record — "unsure" for an order flip, "ask" in the ask
 * band — and "low" otherwise, since no bar says anything is higher.
 */
export function bandOf(v: Verdict, bar: Bar): Band {
  if (v.answer === null || v.probability === null) return 'unsure';
  if (!v.orderStable) return 'unsure';
  if (v.probability >= ASK_BAND.low && v.probability <= ASK_BAND.high) return 'ask';
  if (bar.state !== 'calibrated') return 'low';
  if (v.probability >= bar.high) return 'high';
  if (v.probability >= bar.middling) return 'middling';
  return 'low';
}

/**
 * PURE: how it lands. Nothing lands above "watch" while its bar is
 * uncalibrated, or while the decision layer is in watch mode — and in phase 1
 * it always is.
 */
export function landingOf(band: Band, bar: Bar, mode: 'watch' | 'live'): Landing {
  if (mode === 'watch' || bar.state !== 'calibrated') return 'watch';
  if (band === 'high') return 'applied';
  if (band === 'middling') return 'suggested';
  return 'asked';
}
