// From the registry to a request: every question in a lane, for one state, in
// ONE request. A choice goes in twice — its declared option order and the
// reverse — as two question ids, because Jev's probabilities move with option
// order (handoff §5.1), and one request instead of two halves the requests
// under the Gateway's rate limit (Dispatch 10, "Where Casa differs" 5).
//
// Every string that reaches a question here comes from registry.ts. The state
// is the only place a listing's text goes.

import { createHash } from 'node:crypto';
import type { JevQuestionWire } from './jev.ts';
import { QUESTION_BY_ID, type Question } from './registry.ts';

export type Order = 'fwd' | 'rev';

/**
 * The wire id of one question in one order: "condition__fwd", "condition__rev";
 * a boolean or score has one. Plain [a-z_] ids, since what the Gateway accepts
 * in an id isn't documented; registry ids never contain "__".
 */
export function wireId(questionId: string, order: Order | null): string {
  return order ? `${questionId}__${order}` : questionId;
}

export function optionKeys(q: Question, order: Order): string[] {
  if (q.type !== 'choice') return [];
  const keys = q.options.map((o) => o.key);
  return order === 'fwd' ? keys : [...keys].reverse();
}

/** PURE: one question as Jev's wire shape, in one option order. */
export function renderQuestion(q: Question, order: Order): JevQuestionWire {
  if (q.type === 'choice') {
    const text = new Map(q.options.map((o) => [o.key, o.text]));
    return { type: 'choice', instructions: q.instructions, criteria: Object.fromEntries(optionKeys(q, order).map((k) => [k, text.get(k)!])) };
  }
  if (q.type === 'boolean') return { type: 'boolean', instructions: q.instructions, criteria: { ...q.criteria } };
  return { type: 'score', instructions: q.instructions, criteria: [...q.levels] };
}

/** The orders a question is asked in: both for a choice, one otherwise. */
export function ordersOf(q: Question): (Order | null)[] {
  return q.type === 'choice' ? ['fwd', 'rev'] : [null];
}

/** PURE: the request's questions for a list of registry ids, keyed by wire id. Unknown ids are refused. */
export function renderRequest(questionIds: readonly string[]): Record<string, JevQuestionWire> {
  const out: Record<string, JevQuestionWire> = {};
  for (const id of questionIds) {
    const q = QUESTION_BY_ID.get(id);
    if (!q) throw new Error(`decide: no question "${id}" in the registry`);
    for (const order of ordersOf(q)) out[wireId(id, order)] = renderQuestion(q, order ?? 'fwd');
  }
  return out;
}

/** How many wire questions the registry ids make. */
export function wireCount(questionIds: readonly string[]): number {
  return questionIds.reduce((n, id) => n + (QUESTION_BY_ID.get(id)?.type === 'choice' ? 2 : 1), 0);
}

/** Key-sorted JSON, so equal values hash equally. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The state's hash: a re-ask on the same text matches row for row. */
export function stateHash(state: unknown): string {
  return sha256Hex(stable(state));
}

/**
 * The option-order hash for one question: its wording version and the exact
 * key order of each order asked. A drift in either shows up as a new hash.
 */
export function optionOrderHash(q: Question): string {
  const orders = ordersOf(q).map((o) => (q.type === 'choice' ? optionKeys(q, o ?? 'fwd') : q.type === 'score' ? q.levels.map((_, i) => String(i)) : ['true', 'false']));
  return sha256Hex(stable({ id: q.id, version: q.version, orders }));
}
