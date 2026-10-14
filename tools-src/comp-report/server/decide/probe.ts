// The go/no-go call (Dispatch 10 phase 2 step 1): one fixed request with no
// user data, before any batch. MindBinder's account gates — "add a card", then
// "buy credits" — answered every call with a 403 and looked like an outage, and
// one of them cost a whole run (handoff §7.1, 1). So this is sent once, never
// retried, and it says plainly whether the batch may go.
//
// - The state is a fixture (fixtures.ts), and every registry question is asked
//   in one request, both orders for a choice: the same shape a listing gets.
// - It works with CR_JEV_MODE off, since it runs before watch mode goes on. It
//   needs the key, and it honours the shared pacing and cool-down, so it never
//   jumps a drainer's turn or a 429's wait. A 429 or 503 it gets holds every
//   request, as the drainer's would.
// - Its raw body is kept (decide_probes), cut at 64 KiB: what the parser gets
//   pinned to (phase 2 step 4).
// - "ok" means every question came back answered. Whether the answers match
//   the fixture's expected ones is reported beside it, and doesn't decide.
// - The same call, on another fixture or a few of the wire questions alone,
//   is how phase 2 step 5 compares both orders in one request with separate
//   requests (the CLI's `orders`): still fixtures only, never user data.
// Nothing here throws into a caller.

import { costUsd } from './cost.ts';
import type { DecideConfig } from './config.ts';
import { zdrRefusal, type Clock } from './drain.ts';
import { FIXTURE_BY_ID, fixtureState, PROBE_FIXTURE, type Fixture } from './fixtures.ts';
import { JEV_MODEL, jevAttempt } from './jev.ts';
import { QUESTIONS, REGISTRY_VERSION } from './registry.ts';
import { renderRequest } from './render.ts';
import type { DecideStore, ProbeRecord, UsageRecord } from './store.ts';
import { verdictFor } from './verdict.ts';

/** Under Netlify's 30 s cut for a buffered response (docs/comp-report/cr1-function-limits.md). */
export const PROBE_TIMEOUT_MS = 20_000;

export interface ProbeResult extends ProbeRecord {
  /** Whether a request went out at all. */
  sent: boolean;
  /** The decide_probes row, when one was written. */
  id: number | null;
  /** Wait this long before trying again (busy). */
  retryInMs?: number;
  /** Per question: whether its answer matches the fixture's expected one. Informational. */
  matches: Record<string, boolean>;
  /** The first 300 characters of a refusal's body. */
  note?: string;
}

export class ProbeInputError extends Error {}

/**
 * PURE: which fixture and which wire questions a probe sends. By default the
 * go/no-go: the first fixture, every question. Unknown ids are refused.
 */
export function probeInput(opts: { fixtureId?: unknown; wireIds?: unknown } = {}): { fixture: Fixture; questions: ReturnType<typeof renderRequest> } {
  const fixture = opts.fixtureId === undefined ? PROBE_FIXTURE : FIXTURE_BY_ID.get(String(opts.fixtureId));
  if (!fixture) throw new ProbeInputError(`no fixture "${String(opts.fixtureId).slice(0, 60)}"`);
  const all = renderRequest(QUESTIONS.map((q) => q.id));
  if (opts.wireIds === undefined) return { fixture, questions: all };
  if (!Array.isArray(opts.wireIds) || opts.wireIds.length === 0) throw new ProbeInputError('wireIds is a list of wire question ids');
  const questions: typeof all = {};
  for (const id of opts.wireIds) {
    if (typeof id !== 'string' || !(id in all)) throw new ProbeInputError(`no wire question "${String(id).slice(0, 60)}"`);
    questions[id] = all[id]!;
  }
  return { fixture, questions };
}

export async function runProbe(deps: {
  store: DecideStore;
  config: DecideConfig;
  fetchImpl: typeof fetch;
  clock: Clock;
  timeoutMs?: number;
  /** Another fixture, or a subset of the wire questions (the order-independence check). Default: the go/no-go. */
  fixtureId?: unknown;
  wireIds?: unknown;
}): Promise<ProbeResult> {
  const { store, config, clock } = deps;
  const { fixture, questions } = probeInput({ fixtureId: deps.fixtureId, wireIds: deps.wireIds });
  const base: ProbeRecord = {
    ok: false, outcome: 'no-key', status: null, ms: null, model: null, zdr: config.zdr, registryVersion: REGISTRY_VERSION,
    fixtureId: fixture.id, wireIds: Object.keys(questions), unanswered: [], raw: null, answers: {},
  };
  const unsent = (outcome: string, extra: Partial<ProbeResult> = {}): ProbeResult => ({ ...base, outcome, sent: false, id: null, matches: {}, ...extra });

  if (!config.jevKey) return unsent('no-key');
  if (zdrRefusal('listing', config)) return unsent('zdr-required');
  const now = clock.now();
  const pace = await store.pacing();
  const turnAt = Math.max(pace.nextStartAt, pace.coolUntil);
  if (turnAt > now) return unsent('busy', { retryInMs: Math.ceil(turnAt - now) });

  await store.setNextStart(now + config.minIntervalMs);
  const started = clock.now();
  const out = await jevAttempt({
    key: config.jevKey, state: fixtureState(fixture), questions, zdr: config.zdr, attempt: 1,
    fetchImpl: deps.fetchImpl, nowMs: () => clock.now(), timeoutMs: deps.timeoutMs ?? PROBE_TIMEOUT_MS, keepRaw: true,
  });
  const ms = Math.max(0, Math.round(clock.now() - started));
  const record: ProbeRecord = { ...base, ms, status: out.status, raw: out.raw ?? null };
  const usage: UsageRecord[] = [];
  const matches: Record<string, boolean> = {};
  let note: string | undefined;

  if (out.kind === 'answered') {
    const model = out.response.model ?? JEV_MODEL;
    // Every wire question asked must come back; the verdicts are for the registry questions asked whole.
    const unanswered = Object.keys(questions).filter((id) => !(id in out.response.answers));
    const answers: Record<string, unknown> = { wire: out.response.answers };
    for (const q of QUESTIONS) {
      const v = verdictFor(q, out.response.answers);
      if (!v) continue;
      answers[q.id] = { answer: v.answer, probability: v.probability, orderStable: v.orderStable, probabilities: v.probabilities };
      matches[q.id] = v.answer === fixture.expected[q.id];
    }
    Object.assign(record, {
      ok: unanswered.length === 0, outcome: unanswered.length === 0 ? 'answered' : 'unanswered',
      model: out.response.model, unanswered, answers,
    });
    usage.push({
      userEmail: 'system:decide', provider: 'jev', model, purpose: 'decide:probe', inputTokens: out.response.inputTokens,
      outputTokens: 0, costUsd: costUsd(model, out.response.inputTokens, 0), detail: { probe: true, ms, zdr: config.zdr },
    });
  } else if (out.kind === 'drop') {
    record.outcome = out.reason;
    note = out.note;
  } else {
    // Busy (429/502/503/504) or the network: stop, and hold every request for the wait the Gateway asked for.
    record.outcome = out.status === null ? 'network' : `busy-${out.status}`;
    note = out.note;
    if (out.shared) await store.coolDown(clock.now() + out.waitMs);
  }

  let id: number | null = null;
  try {
    id = await store.recordProbe(record, usage);
  } catch (error) {
    console.error('comp-report decide: could not record the probe:', String(error).slice(0, 200));
  }
  return { ...record, sent: true, id, matches, ...(note !== undefined ? { note } : {}), ...(out.kind === 'retry' ? { retryInMs: out.waitMs } : {}) };
}
