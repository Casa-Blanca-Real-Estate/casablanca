/**
 * jev-shadow.ts — WATCH MODE for Jev: ask, record, and act on NOTHING.
 *
 * KJ (2026-09-23): Jev will become the mediator that auto-applies high-confidence cards — but only
 * once we know how accurate it is. This slice measures that. It does two things, beside decisions the
 * platform already made, and changes neither:
 *
 *   #1 KIND  — each brand-new name the canonize mints: what KIND of thing is it? Jev's pick +
 *              probabilities are recorded next to the kind the platform actually assigned. This is
 *              KJ's "Black Markets and The Ring are characters" class.
 *   #2 CITE  — each atom committed from a segment: is the passage it cites actually ABOUT the atom's
 *              subject? (T1: facts about Blaze cited to Manx's sentence, because a segment's first
 *              400 characters are every atom's quote.)
 *
 * 🔴 ACT ON NOTHING. The only writes in this module are `INSERT INTO jev_observations` (an answer) and
 * `INSERT INTO jev_watch_drops` (a question that got none) — instrument tables (migrations 116, 117),
 * outside the story graph, purged with their binder. No node, facet, edge, card
 * or kind is read-back-and-changed from an answer here; the call sites fire it with `void` and never
 * see its result. `scripts/verify-jev-shadow.ts` fails the battery if a write of any other kind
 * appears in this module or in jev.ts, or if a call site starts consuming the result.
 *
 * OFF BY DEFAULT: `JEV_SHADOW=true` turns it on. Deliberately NOT the house kill-switch shape — this
 * is an extra network call per new name and per segment with no calibration behind it yet, the same
 * reasoning as PREDICATE_MODEL_REVIEW.
 *
 * Measurement: `scripts/audit-jev-agreement.ts --binder=N` reads the tables back — agreement per lane,
 * agreement by Jev's own confidence, the disagreements for a human to label, and COVERAGE: how many of
 * the questions the watch asked were answered at all. Under the Gateway's rate limit (2026-09-25 on)
 * that is not a given, so every unanswered question is a `jev_watch_drops` row with its reason.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { ENTITY_KINDS } from "../pipeline/step-classify";
import { jevEvaluateDetailed, type JevOutcome, type JevQuestion } from "./jev";
import { mbwarn } from "./mb-log";

/** Watch mode switch. OFF unless `JEV_SHADOW=true`. */
export function jevShadowEnabled(): boolean {
  return (process.env.JEV_SHADOW ?? "").trim() === "true";
}

/**
 * What each kind MEANS, as Jev's option descriptions. Written from the classifier's own vocabulary
 * (step-classify.ts ENTITY_KIND_SYSTEM + the Characters-purity taxonomy, #276): characters are
 * individual PEOPLE only; groups are organizations/factions; a place is a location. Order is fixed —
 * Jev's probabilities move with option order (design doc §1).
 */
export const KIND_OPTION_TEXT: Record<(typeof ENTITY_KINDS)[number], string> = {
  character: "One individual person or being with a mind — someone who acts, speaks or is spoken to. Never a group, organization, market or place.",
  location: "A place: a city, district, building, room, planet, region or venue.",
  event: "Something that happens at a point or over a span of story time — a fight, a death, a meeting, a heist.",
  organization: "A named formal group or institution: a company, gang, agency, government body, network or market operated by people.",
  faction: "A side or allegiance within a conflict — a bloc people belong to by loyalty rather than employment.",
  demographic: "A class or population of people defined by a shared trait (e.g. metahumans, refugees), not an organized group.",
  episode: "An episode of a series — a structural unit of the telling, not a story event.",
  season: "A season of a series — a structural unit of the telling.",
  item: "A physical object, device, weapon, vehicle, substance or piece of technology.",
  theme: "An abstract idea the story is ABOUT (grief, redemption, power) — not a thing that exists in the world.",
  concept: "An in-world idea, rule, system, technology class or term that is not a person, place, group, object or event.",
  meta: "A fact about the PROJECT or its making (the writer, tone references, production choices), not about the story world.",
  arc: "A storyline that runs across many events — a character's journey or a plot thread.",
};

/** PURE: the kind question. The name and its context live in STATE only (injection hygiene). */
export function buildKindQuestion(name: string, context: string): { state: Record<string, string>; questions: Record<string, JevQuestion> } {
  return {
    state: { name, context: context.slice(0, 4000) },
    questions: {
      kind: {
        type: "choice",
        instructions: "In this story, what kind of thing is the element named in state.name? Use state.context, which is what the writer said about it.",
        criteria: Object.fromEntries(ENTITY_KINDS.map((k) => [k, KIND_OPTION_TEXT[k]])),
      },
    },
  };
}

/** `quote` — the atom's OWN quote (`shared/fact-quote.ts`), what the page shows for it. Absent → the
 *  passage every atom shares (the pre-2026-09-24 shape, one segment head for all of them). */
export interface CitedAtom { subject: string; predicate: string; object?: unknown; quote?: string }

/** PURE: one boolean per atom — "is the passage this atom cites about this atom's subject?". Atoms are
 *  numbered in state and referred to by number, so no story text enters the question text. Capped at
 *  40. Each atom carries the passage IT cites (`state.atoms[n].passage`): since 2026-09-24 a fact's
 *  quote is its own sentence, and asking Jev about a shared segment head would measure a quote the page
 *  no longer shows (FULL-RUN-19 §3: 96.0% agreement on whole passages, 40.5% on cut ones). */
export function buildCitationQuestions(quote: string, atoms: CitedAtom[]): {
  state: { atoms: Array<{ n: number; subject: string; fact: string; passage: string }> };
  questions: Record<string, JevQuestion>;
  keys: string[];
} {
  const list = atoms.slice(0, CITATION_ATOMS_PER_REQUEST).map((a, i) => ({
    n: i + 1,
    subject: a.subject,
    fact: `${a.subject} ${String(a.predicate).replace(/_/g, " ")} ${a.object == null ? "" : typeof a.object === "string" ? a.object : JSON.stringify(a.object)}`.trim().slice(0, 300),
    passage: (a.quote && a.quote.trim() ? a.quote : quote).slice(0, 1500),
  }));
  const questions: Record<string, JevQuestion> = {};
  for (const a of list) {
    questions[`a${a.n}`] = {
      type: "boolean",
      instructions: `Does atom ${a.n}'s passage (state.atoms[${a.n - 1}].passage) state atom ${a.n}'s fact ABOUT atom ${a.n}'s subject — rather than about someone or something else?`,
      criteria: {
        true: "The passage says this fact, and says it about this subject.",
        false: "The passage does not say it, or says it about a different person or thing.",
      },
    };
  }
  return { state: { atoms: list }, questions, keys: list.map((a) => `a${a.n}`) };
}

/** The observation row — the ONLY write this module makes. */
async function recordObservation(o: {
  binderId: number | null; jobId?: string | null; lane: "kind" | "citation"; subject: string; itemKey?: string | null;
  incumbent: string | null; jevAnswer: string | null; jevProbability: number | null; jevConfidence: number | null;
  distribution: unknown; model: string | null; evidence: string | null; agrees: boolean | null;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO jev_observations
      (binder_id, job_id, lane, subject, item_key, incumbent, jev_answer, jev_probability, jev_confidence,
       jev_distribution, jev_model, evidence, agrees)
    VALUES (${o.binderId}, ${o.jobId ?? null}, ${o.lane}, ${o.subject.slice(0, 300)}, ${o.itemKey ?? null},
       ${o.incumbent}, ${o.jevAnswer}, ${o.jevProbability}, ${o.jevConfidence},
       ${JSON.stringify(o.distribution ?? null)}::jsonb, ${o.model}, ${o.evidence ? o.evidence.slice(0, 600) : null}, ${o.agrees})`);
}

/** A question the watch asked and got no answer to — the second and last write this module makes. */
async function recordDrop(d: {
  binderId: number | null; jobId?: string | null; lane: "kind" | "citation"; subject: string; itemKey?: string | null;
  questions: number; reason: string; attempts: number; lastStatus: number | null; waitedMs: number;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO jev_watch_drops (binder_id, job_id, lane, subject, item_key, questions, reason, attempts, last_status, waited_ms)
      VALUES (${d.binderId}, ${d.jobId ?? null}, ${d.lane}, ${d.subject.slice(0, 300)}, ${d.itemKey ?? null},
        ${d.questions}, ${d.reason}, ${d.attempts}, ${d.lastStatus}, ${Math.min(2_147_483_647, Math.max(0, Math.round(d.waitedMs)))})`);
  } catch (err) {
    // The ledger itself failing must still leave a trace, and must never reach the caller.
    mbwarn("jev-shadow", "drop_record_failed", { lane: d.lane, reason: d.reason, questions: d.questions, error: String(err).slice(0, 200) });
  }
}

/** PURE: how an outcome is recorded — the drop row's reason, attempts and status, or null if answered. */
export function dropOf(out: JevOutcome): { reason: string; attempts: number; lastStatus: number | null; waitedMs: number } | null {
  return out.ok ? null : { reason: out.reason, attempts: out.attempts, lastStatus: out.lastStatus, waitedMs: out.waitedMs };
}

/**
 * #1 — watch the kind decision. `incumbent` is the kind the platform ASSIGNED (already decided and
 * already used by the caller). Returns nothing; never throws.
 */
export async function jevShadowKind(p: { binderId: number; name: string; context: string; incumbent: string | undefined; jobId?: string | null }): Promise<void> {
  try {
    const { state, questions } = buildKindQuestion(p.name, p.context);
    const out = await jevEvaluateDetailed(state, questions, { scope: "jev-shadow-kind" });
    const base = { binderId: p.binderId, jobId: p.jobId, lane: "kind" as const, subject: p.name, questions: 1 };
    const drop = dropOf(out);
    if (drop || !out.ok) { await recordDrop({ ...base, ...drop! }); return; }
    const r = out.result;
    const a = r.answers.kind;
    if (!a?.choice) { await recordDrop({ ...base, reason: "unanswered", attempts: out.attempts, lastStatus: 200, waitedMs: out.waitedMs }); return; }
    await recordObservation({
      binderId: p.binderId, jobId: p.jobId, lane: "kind", subject: p.name, incumbent: p.incumbent ?? null,
      jevAnswer: a.choice, jevProbability: a.probability ?? null, jevConfidence: a.confidence ?? null,
      distribution: a.probabilities, model: r.model, evidence: p.context, agrees: p.incumbent ? a.choice === p.incumbent : null,
    });
  } catch (err) {
    mbwarn("jev-shadow", "kind_failed", { binderId: p.binderId, error: String(err).slice(0, 200) });
  }
}

/** One citation request: ask, then write an observation per answered atom and one drop row for the rest. */
async function askCitations(
  p: { binderId: number; quote: string; jobId?: string | null },
  atoms: CitedAtom[],
  base: { binderId: number; jobId?: string | null; lane: "citation"; subject: string; itemKey: string | null },
): Promise<void> {
  const { state, questions, keys } = buildCitationQuestions(p.quote, atoms);
  const out = await jevEvaluateDetailed(state, questions, { scope: "jev-shadow-citation" });
  const drop = dropOf(out);
  const at = { ...base, subject: state.atoms[0]?.subject ?? base.subject };
  if (drop || !out.ok) { await recordDrop({ ...at, questions: keys.length, ...drop! }); return; }
  const r = out.result;
  let unanswered = 0;
  for (let i = 0; i < keys.length; i++) {
    const a = r.answers[keys[i]];
    if (!a || typeof a.probability !== "number") { unanswered++; continue; }
    await recordObservation({
      binderId: p.binderId, jobId: p.jobId, lane: "citation", subject: state.atoms[i].subject, itemKey: base.itemKey,
      // The platform's implicit claim is "this passage supports this atom" — i.e. `true`.
      incumbent: "true", jevAnswer: a.probability >= 0.5 ? "true" : "false", jevProbability: a.probability,
      jevConfidence: null, distribution: { true: a.probability }, model: r.model,
      evidence: `${state.atoms[i].fact}\n— cited: ${state.atoms[i].passage.slice(0, 600)}`, agrees: a.probability >= 0.5,
    });
  }
  if (unanswered) await recordDrop({ ...at, questions: unanswered, reason: "unanswered", attempts: out.attempts, lastStatus: 200, waitedMs: out.waitedMs });
}

/** Atoms per citation request — `buildCitationQuestions` numbers at most this many. */
export const CITATION_ATOMS_PER_REQUEST = 40;

/**
 * #2 — watch the citations of one segment's atoms. One request per 40 atoms (a segment with more used to
 * have the rest silently unasked; each atom's question and passage are the same either way). Every atom
 * ends as an observation or a drop row. Never throws.
 */
export async function jevShadowCitations(p: { binderId: number; quote: string; atoms: CitedAtom[]; jobId?: string | null; segmentKey?: string | null }): Promise<void> {
  try {
    if (p.atoms.length === 0) return;
    const base = { binderId: p.binderId, jobId: p.jobId, lane: "citation" as const, subject: p.atoms[0]?.subject ?? "", itemKey: p.segmentKey ?? null };
    // An atom with no passage of its own and no segment quote to fall back on has nothing to judge.
    const askable = p.atoms.filter((a) => (a.quote ?? "").trim() || p.quote.trim());
    const noPassage = p.atoms.length - askable.length;
    if (noPassage) await recordDrop({ ...base, questions: noPassage, reason: "no-passage", attempts: 0, lastStatus: null, waitedMs: 0 });
    for (let from = 0; from < askable.length; from += CITATION_ATOMS_PER_REQUEST) {
      await askCitations(p, askable.slice(from, from + CITATION_ATOMS_PER_REQUEST), base);
    }
  } catch (err) {
    mbwarn("jev-shadow", "citation_failed", { binderId: p.binderId, error: String(err).slice(0, 200) });
  }
}
