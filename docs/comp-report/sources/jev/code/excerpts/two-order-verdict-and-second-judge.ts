// EXCERPT — the two-order verdict and the two-judge agreement rule, verbatim from
//   scripts/lib/stale-tiebreaker.ts  (pure; report-only in MindBinder — never wired to production)
//   scripts/probe-jev-stale-tiebreaker.ts  (the SECOND JUDGE: Claude Haiku 4.5 asked the same question)
// MindBinder @ main 5cc386d4. The question text is MindBinder's (a stale-notes tiebreaker); the SHAPE is the reusable part.
// Story-specific comments were trimmed; code is unchanged.

// ── from scripts/lib/stale-tiebreaker.ts ──
export const STALE_VERDICTS = ["still_true", "contradicted", "not_addressed"] as const;
export type StaleVerdict = (typeof STALE_VERDICTS)[number];

export const STALE_VERDICT_OPTIONS: Record<StaleVerdict, string> = {
  still_true: "Still true: the newer evidence states this fact, or plainly implies it, or tells a version of the story in which it holds.",
  contradicted: "Contradicted: the newer evidence says the opposite, or tells a different version of the story in which this fact cannot hold.",
  not_addressed: "Not addressed: the newer evidence says nothing that bears on this fact either way.",
};

export const FORWARD: readonly StaleVerdict[] = ["still_true", "contradicted", "not_addressed"];
export const REVERSED: readonly StaleVerdict[] = [...FORWARD].reverse();

/** PURE: the one question, in `order`. Asked twice — Jev's probabilities move with option order. */
export function staleVerdictQuestion(order: readonly StaleVerdict[]) {
  return {
    verdict: {
      type: "choice" as const,
      instructions:
        "state.fact comes from a section of the writer's notes that the writer marked \"likely outdated\". " +
        "state.newer_evidence is everything else the writer's material says about the same element. " +
        "Judged ONLY by state.newer_evidence, is state.fact — as stated, including any note and timing in brackets — still true of the story?",
      criteria: Object.fromEntries(order.map((k) => [k, STALE_VERDICT_OPTIONS[k]])),
    },
  };
}


/**
 * PRE-REGISTERED (2026-09-25, before any run): a judge's answer COUNTS only when both option orders give
 * the same top answer AND the mean probability of that answer is ≥ `minP`. Otherwise the judge is
 * "unsure", which never settles anything. The same rule the person-or-group probe pre-registered.
 */
export const ACCEPT_RULE = { minP: 0.8, orderStable: true } as const;

export type JudgeAnswer = StaleVerdict | "unsure";

/** What the tiebreaker does with one fact. */
export type TiebreakOutcome =
  /** Both judges say the newer evidence still holds it → it stays in canon, no card. */
  | "keep"
  /** Both judges say the newer evidence contradicts it → it leaves canon (superseded), no card. */
  | "retire"
  /** Neither judge found anything that bears on it → no card each; ONE card per section lists them. */
  | "section-card"
  /** The judges disagree, or one is unsure → one card for this fact. */
  | "card";

/**
 * The two readings of R35's "Jev and the extractor agree" (design §3):
 *   · `second-judge` (I2, the design's): the cheap model that ran the search is asked the SAME question
 *     Jev is, from the same evidence. Agreement settles the fact in EITHER direction — which is what makes
 *     R35's own example ("a newer source that contradicts one outweighs the old section") settle without
 *     a card.
 *   · `original-extraction` (I1): the extractor's vote is the extraction itself, i.e. always "still true".
 *     Only Jev's "still true" can agree with it, so every contradicted fact becomes a card.
 */
export type AgreementReading = "second-judge" | "original-extraction";

/** PURE: the outcome for one fact, from the two judges' answers, under `reading`. */
export function tiebreak(jev: JudgeAnswer, extractor: JudgeAnswer, reading: AgreementReading): TiebreakOutcome {
  if (reading === "original-extraction") {
    if (jev === "still_true") return "keep";
    if (jev === "not_addressed") return "section-card";
    return "card";
  }
  if (jev === "unsure" || extractor === "unsure") return "card";
  if (jev !== extractor) return "card";
  if (jev === "still_true") return "keep";
  if (jev === "contradicted") return "retire";
  return "section-card";
}

// ── Two-order verdict (the same shape as the person-or-group probe, restated so this lib stays pure) ──

export function argmax<K extends string>(p: Partial<Record<K, number>>): K | null {
  let best: K | null = null, bp = -1;
  for (const [k, v] of Object.entries(p) as Array<[K, number]>) if (typeof v === "number" && v > bp) { best = k; bp = v; }
  return best;
}

export function meanP(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = ((a[k] ?? 0) + (b[k] ?? 0)) / 2;
  return out;
}

/** PURE: one judge's answer from its two orders' probabilities. */
export function judgeAnswer(pFwd: Record<string, number>, pRev: Record<string, number>, rule = ACCEPT_RULE): { answer: JudgeAnswer; top: StaleVerdict | null; p: number; stable: boolean } {
  const mean = meanP(pFwd, pRev);
  const top = argmax(mean) as StaleVerdict | null;
  const stable = !!argmax(pFwd) && argmax(pFwd) === argmax(pRev);
  const p = top ? mean[top] : 0;
  const counts = !!top && (!rule.orderStable || stable) && p >= rule.minP;
  return { answer: counts ? top! : "unsure", top, p, stable };
}

// ── from scripts/probe-jev-stale-tiebreaker.ts ──
/** List prices: Jev input (output free) — the `typesafe-jev` row; the second judge — `claude-haiku-4-5`. */
export const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
export const HAIKU_USD_PER_INPUT_TOKEN = 1.0 / 1_000_000;
export const HAIKU_USD_PER_OUTPUT_TOKEN = 5.0 / 1_000_000;
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
/** The second judge answers with three probabilities in JSON — about this many output tokens. */
export const HAIKU_OUTPUT_TOKENS_EST = 60;
/** PURE: the second judge's prompt — the same question, the same state, three probabilities back. */
export function secondJudgePrompt(state: unknown, order: readonly StaleVerdict[]): { system: string; user: string } {
  const q = staleVerdictQuestion(order).verdict;
  return {
    system: "You judge one fact against evidence. Reply with ONLY a JSON object mapping each option key to a probability; the probabilities sum to 1.",
    user: `${q.instructions}\n\nOptions:\n${order.map((k) => `- ${k}: ${q.criteria[k]}`).join("\n")}\n\nstate = ${JSON.stringify(state)}`,
  };
}

/** PURE: parse the second judge's reply — a JSON object of option → probability. Anything else → {}. */
export function parseSecondJudge(text: string): Record<string, number> {
  const m = /\{[\s\S]*\}/.exec(text ?? "");
  if (!m) return {};
  try {
    const o = JSON.parse(m[0]);
    const out: Record<string, number> = {};
    for (const k of STALE_VERDICTS) if (typeof o[k] === "number" && o[k] >= 0 && o[k] <= 1) out[k] = o[k];
    return out;
  } catch { return {}; }
}

// (DRY, sleep and PACE_MS = 750 are the probe module's own globals; the probe paced Jev and Haiku alike.)
async function askHaiku(state: unknown, order: readonly StaleVerdict[]): Promise<{ probs: Record<string, number>; inTok: number; outTok: number; chars: number; error?: string }> {
  const p = secondJudgePrompt(state, order);
  const chars = p.system.length + p.user.length;
  if (DRY) return { probs: {}, inTok: 0, outTok: 0, chars };
  const k = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!k) return { probs: {}, inTok: 0, outTok: 0, chars, error: "no ANTHROPIC_API_KEY" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: HAIKU_MODEL, max_tokens: 200, temperature: 0, system: p.system, messages: [{ role: "user", content: p.user }] }),
    });
    if (!res.ok) return { probs: {}, inTok: 0, outTok: 0, chars, error: `HTTP ${res.status}` };
    const j: any = await res.json();
    return { probs: parseSecondJudge(String(j.content?.[0]?.text ?? "")), inTok: j.usage?.input_tokens ?? 0, outTok: j.usage?.output_tokens ?? 0, chars };
  } catch (err) {
    return { probs: {}, inTok: 0, outTok: 0, chars, error: String(err).slice(0, 200) };
  } finally { await sleep(PACE_MS); }
}
