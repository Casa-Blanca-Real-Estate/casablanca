/**
 * identity-jev.ts — R49's C: a PRONOUN-USAGE lane on Jev (KJ, 2026-09-26: "A + B + C").
 *
 * One question per character, over the WRITER's own passages (uploads, notes, chat — R37; never a
 * platform summary): "which third-person pronouns does the writer use for X?" Asked twice, the second
 * time with the options REVERSED (Jev's probabilities move with option order; a verdict that flips is
 * not a verdict), averaged. An order-stable answer at or above `JEV_PRONOUN_BAR` becomes one witness in
 * the identity reader (`shared/identity-evidence.ts`, `IdentityEvidence.jev`) — it reads PRONOUNS, and
 * never decides a gender on its own.
 *
 * 🔴 OFF by default (`IDENTITY_JEV=true` turns it on) — the house shape for an uncalibrated model call
 * on the canonize path (`PREDICATE_MODEL_REVIEW`, `JEV_SHADOW`). The bar is SET FROM STONER'S RUN of
 * `scripts/probe-jev-pronouns.ts` against the pre-registered labels (R45's shape: "the accept bar is set
 * from Stoner's run"); `JEV_PRONOUN_BAR` is the placeholder that run replaces. The probe builds its
 * requests with THIS module's builders, so it measures exactly what production would send.
 *
 * Cost: one small request per order per character, ≈ $0.0004 a character at Jev's list price.
 */
import { jevEvaluate, type JevQuestion } from "./jev.js";
import type { PronounClass, WriterParagraph } from "@shared/identity-evidence";

export const PRONOUN_OPTIONS = ["he_him", "she_her", "they_them", "it_its", "other_set", "not_enough"] as const;
export type PronounOption = (typeof PRONOUN_OPTIONS)[number];

const OPTION_TEXT: Readonly<Record<PronounOption, string>> = {
  he_him: "The writer refers to this character as he / him / his.",
  she_her: "The writer refers to this character as she / her / hers.",
  they_them: "The writer refers to this ONE character as they / them / their (a singular they — not a group the character belongs to).",
  it_its: "The writer refers to this character as it / its.",
  other_set: "The writer uses another set for this character (xe/xem, ze/hir, a name only by choice), or switches between sets.",
  not_enough: "The passages never refer to this character with a third-person pronoun, or it cannot be told which pronoun is theirs.",
};

/** The reader's pronoun class for an answer (null: no single set). */
export const PRONOUN_OPTION_CLASS: Readonly<Record<PronounOption, PronounClass | null>> = {
  he_him: "he", she_her: "she", they_them: "they", it_its: "it", other_set: null, not_enough: null,
};

/** The accept bar — a PLACEHOLDER until Stoner's pre-registered run sets it (R45). */
export const JEV_PRONOUN_BAR = 0.8;
/** Well under Jev's state limit. */
export const JEV_PASSAGE_CHARS = 20_000;

/** OPT-IN: `IDENTITY_JEV=true`. Anything else (unset, "1", "false") is off. */
export function identityJevEnabled(): boolean {
  return (process.env.IDENTITY_JEV ?? "").trim().toLowerCase() === "true";
}

/** PURE: the question, in one option order. */
export function pronounQuestion(name: string, order: "forward" | "reversed"): Record<string, JevQuestion> {
  const keys = order === "forward" ? [...PRONOUN_OPTIONS] : [...PRONOUN_OPTIONS].reverse();
  const criteria: Record<string, string> = {};
  for (const k of keys) criteria[k] = OPTION_TEXT[k];
  return {
    pronouns: {
      type: "choice",
      instructions: `Read ONLY the writer's own passages in the state. Which third-person pronouns does the WRITER use for the character "${name}"? Count only pronouns that clearly refer to ${name} — not to someone else in the same passage, not I/me/we, and not a "they" for a group that includes ${name}. Dialogue counts only when a speaker plainly refers to ${name}.`,
      criteria,
    },
  };
}

/** PURE: the state — the character's name and the writer's passages, each labelled with its origin. */
export function pronounState(name: string, passages: readonly WriterParagraph[]): { character: string; writer_passages: string } | null {
  if (!passages.length) return null;
  const text = passages.map((p) => `[${p.where}] ${p.text}`).join("\n---\n").slice(0, JEV_PASSAGE_CHARS);
  return { character: name, writer_passages: text };
}

/** PURE: the verdict from the two orders' probabilities (a key missing in one order counts 0 there). */
export function pronounVerdict(
  pFwd: Partial<Record<string, number>>, pRev: Partial<Record<string, number>>, bar = JEV_PRONOUN_BAR,
): { top: PronounOption | null; p: number; stable: boolean; accepted: boolean } {
  const argmax = (r: Partial<Record<string, number>>) => {
    let best: string | null = null, bp = -1;
    for (const [k, v] of Object.entries(r)) if (typeof v === "number" && v > bp) { best = k; bp = v; }
    return best;
  };
  const mean: Record<string, number> = {};
  for (const k of Array.from(new Set([...Object.keys(pFwd), ...Object.keys(pRev)]))) mean[k] = ((pFwd[k] ?? 0) + (pRev[k] ?? 0)) / 2;
  const top = argmax(mean) as PronounOption | null;
  const stable = !!top && argmax(pFwd) === argmax(pRev);
  const p = top ? mean[top] : 0;
  return { top, p, stable, accepted: !!top && stable && p >= bar };
}

/**
 * Ask Jev (both orders) and return the reader's witness, or null — not accepted, no single set, or no
 * key/network (jevEvaluate never throws). Recorded in `story_llm_usage` under scope `identity-jev`.
 */
export async function askJevPronouns(name: string, passages: readonly WriterParagraph[]): Promise<{ set: PronounClass; p: number } | null> {
  const state = pronounState(name, passages);
  if (!state) return null;
  const fwd = await jevEvaluate(state, pronounQuestion(name, "forward"), { scope: "identity-jev" });
  const rev = await jevEvaluate(state, pronounQuestion(name, "reversed"), { scope: "identity-jev" });
  const a = fwd?.answers.pronouns?.probabilities, b = rev?.answers.pronouns?.probabilities;
  if (!a || !b) return null;
  const v = pronounVerdict(a, b);
  const set = v.top ? PRONOUN_OPTION_CLASS[v.top] : null;
  return v.accepted && set ? { set, p: +v.p.toFixed(3) } : null;
}
