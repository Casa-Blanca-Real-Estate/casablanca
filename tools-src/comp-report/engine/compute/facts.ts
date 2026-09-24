// Which value of each fact a result uses (§2, §6.4).
//
// - A stated fact beats the record (the export, the listing); the latest
//   statement wins, and on the same date the later one in the list.
// - "On the facts" uses exact and approximate values; "with estimates" adds
//   the agent's guesstimates.
// - Inferred values (listing text, Jev) are in neither until the agent
//   confirms them; they're listed as pending.
// - Hypothetical values belong to what-ifs only.
// - Trust but verify: when a stated fact differs from the record, the stated
//   value is used and the contradiction is flagged — neither is silently dropped.

import { canonicalJson } from '../util/canonical-json.ts';
import type { Confidence, FactField, PropertyFacts, Sourced, StatedFact } from '../types.ts';
import type { EstimateUse, PendingItem, ResultKind } from './output.ts';

export interface FactContext {
  kind: ResultKind;
  mode: 'report' | 'what_if';
}

export function usableIn(s: { source: string; confidence: Confidence }, ctx: FactContext): boolean {
  if (s.source === 'hypothetical' && ctx.mode !== 'what_if') return false;
  if (s.confidence === 'inferred') return false;
  if (ctx.kind === 'on_facts') return s.confidence === 'exact' || s.confidence === 'approx';
  return true;
}

export interface Contradiction {
  field: FactField;
  stated_id: string;
  stated: unknown;
  record: unknown;
  record_source: string;
}

export interface ResolvedFacts {
  facts: Partial<Record<FactField, Sourced<unknown>>>;
  /** "record" or the stated fact's id. */
  chosen_from: Partial<Record<FactField, string>>;
  contradictions: Contradiction[];
  estimates: EstimateUse[];
  pending: PendingItem[];
  hypotheticals_ignored: string[];
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

/**
 * Resolves one property's facts for one result. `stated` holds the stated
 * facts that target it, in input order; `suggestions` the parser's guesses,
 * which rank after the record's own facts and before anything stated.
 */
export function resolveFacts(
  targetLabel: string, record: PropertyFacts, stated: readonly StatedFact[], ctx: FactContext,
  suggestions: readonly { field: FactField; value: Sourced<unknown> }[] = [],
): ResolvedFacts {
  const out: ResolvedFacts = { facts: {}, chosen_from: {}, contradictions: [], estimates: [], pending: [], hypotheticals_ignored: [] };
  const fields = new Set<FactField>([
    ...(Object.keys(record) as FactField[]), ...stated.map((s) => s.field), ...suggestions.map((s) => s.field),
  ]);
  for (const field of [...fields].sort()) {
    const recordValue = record[field] as Sourced<unknown> | undefined;
    // Stated facts for this field, oldest first (stable, so input order breaks ties).
    const statements = stated
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => s.field === field)
      .sort((a, b) => (a.s.value.as_of < b.s.value.as_of ? -1 : a.s.value.as_of > b.s.value.as_of ? 1 : a.index - b.index))
      .map(({ s }) => s);

    let chosen: { value: Sourced<unknown>; from: string } | null = null;
    for (let i = statements.length - 1; i >= 0 && !chosen; i--) {
      const s = statements[i]!;
      if (usableIn(s.value, ctx)) chosen = { value: s.value, from: s.id };
    }
    if (!chosen && recordValue && usableIn(recordValue, ctx)) chosen = { value: recordValue, from: 'record' };
    for (let i = suggestions.length - 1; i >= 0 && !chosen; i--) {
      const x = suggestions[i]!;
      if (x.field === field && usableIn(x.value, ctx)) chosen = { value: x.value, from: 'suggestion' };
    }

    for (const s of statements) {
      if (s.value.source === 'hypothetical' && ctx.mode !== 'what_if') out.hypotheticals_ignored.push(s.id);
    }
    if (recordValue?.source === 'hypothetical' && ctx.mode !== 'what_if') out.hypotheticals_ignored.push(`${targetLabel}.${field}`);

    // The newest candidate still awaiting confirmation is pending.
    const suggested = suggestions.filter((x) => x.field === field).map((x) => x.value);
    const newest = statements.length > 0 ? statements[statements.length - 1]!.value
      : suggested.length > 0 ? suggested[suggested.length - 1]! : recordValue;
    if (newest && newest.confidence === 'inferred') {
      const newestId = statements.length > 0 ? statements[statements.length - 1]!.id : null;
      out.pending.push({
        kind: 'fact', id: newestId, target: targetLabel, what: field, value: newest.value, source: newest.source,
        note: newest.note ?? 'inferred — needs the agent to confirm before it enters either result',
      });
    }

    if (!chosen) continue;
    out.facts[field] = chosen.value;
    out.chosen_from[field] = chosen.from;
    if (chosen.from !== 'record' && recordValue && (recordValue.confidence === 'exact' || recordValue.confidence === 'approx') &&
      !same(recordValue.value, chosen.value.value)) {
      out.contradictions.push({
        field, stated_id: chosen.from, stated: chosen.value.value, record: recordValue.value, record_source: recordValue.source,
      });
    }
    if (ctx.kind === 'with_estimates' && chosen.value.confidence === 'guesstimate') {
      out.estimates.push({
        kind: 'stated_fact', id: chosen.from, target: targetLabel, what: field,
        note: `${field} = ${JSON.stringify(chosen.value.value)} is the agent's estimate`,
      });
    }
  }
  return out;
}

/** The weakest of several confidences: exact < approx < guesstimate < inferred. */
export function weakest(...confidences: (Confidence | null | undefined)[]): Confidence {
  const order: Confidence[] = ['exact', 'approx', 'guesstimate', 'inferred'];
  let worst = 0;
  for (const c of confidences) if (c) worst = Math.max(worst, order.indexOf(c));
  return order[worst]!;
}
