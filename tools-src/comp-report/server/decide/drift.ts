// The weekly drift check (Dispatch 10 phase 2 step 6): re-ask the fixed
// fixtures (fixtures.ts) once a week, through the same queue, pacing and
// verdict as any listing. The Gateway reports only "typesafe-ai/jev", never a
// version, so a change upstream shows up only as movement here: the readout
// compares each fixture × question's latest answer with its first.
//
// - Started by a Netlify scheduled function (comp-report-decide-drift), or by
//   an admin (POST {action: "drift"}). Either way, once per ISO week: a second
//   start in the same week queues nothing, so a repeat costs nothing.
// - Watch mode and the key are needed: with either missing, nothing is queued.
// - Jev only. No second judge: Haiku is pinned to a dated model.
// Never throws.

import type { DecideConfig } from './config.ts';
import { kickDrainer, MAX_QUEUE } from './enqueue.ts';
import { FIXTURES, FIXTURES_VERSION, fixtureState } from './fixtures.ts';
import { QUESTIONS, REGISTRY_VERSION } from './registry.ts';
import { stateHash, wireCount } from './render.ts';
import type { DecideStore, NewRequest } from './store.ts';

/** "drift-2026-w42": the ISO week a run belongs to. */
export function driftBatch(nowMs: number): string {
  const d = new Date(nowMs);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday); // the Thursday of this week decides its year
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `drift-${day.getUTCFullYear()}-w${String(week).padStart(2, '0')}`;
}

/** PURE: one fixture's request, with every question. */
export function fixtureRequest(fixtureId: string, batch: string): NewRequest {
  const f = FIXTURES.find((x) => x.id === fixtureId);
  if (!f) throw new Error(`decide: no fixture "${fixtureId}"`);
  const questionIds = QUESTIONS.map((q) => q.id);
  const state = fixtureState(f);
  return {
    lane: 'listing',
    target: { kind: 'fixture', fixtureId: f.id },
    questionIds,
    wireQuestions: wireCount(questionIds),
    registryVersion: REGISTRY_VERSION,
    state,
    stateHash: stateHash(state),
    userEmail: 'system:decide-drift',
    secondJudge: false,
    batch,
  };
}

export type DriftResult =
  | { queued: false; why: 'off' | 'no-key' | 'already-this-week' | 'error'; batch: string }
  | { queued: true; batch: string; fixturesVersion: string; requests: number[]; kicked: boolean };

export async function enqueueDriftCheck(deps: {
  store: DecideStore;
  config: DecideConfig;
  nowMs: number;
  /** The site's origin, to start the drainer; none means don't start one. */
  origin: string | null;
  fetchImpl?: typeof fetch;
}): Promise<DriftResult> {
  const batch = driftBatch(deps.nowMs);
  if (deps.config.mode !== 'watch') return { queued: false, why: 'off', batch };
  if (!deps.config.jevKey) return { queued: false, why: 'no-key', batch };
  try {
    if (await deps.store.batchExists(batch)) return { queued: false, why: 'already-this-week', batch };
    const requests: number[] = [];
    for (const f of FIXTURES) requests.push((await deps.store.enqueue(fixtureRequest(f.id, batch), deps.nowMs, MAX_QUEUE)).id);
    const kicked = deps.origin ? await kickDrainer(deps.store, deps.origin, deps.fetchImpl ?? fetch, deps.nowMs) : false;
    return { queued: true, batch, fixturesVersion: FIXTURES_VERSION, requests, kicked };
  } catch (error) {
    console.error('comp-report decide: could not queue the drift check:', String(error).slice(0, 200));
    return { queued: false, why: 'error', batch };
  }
}
