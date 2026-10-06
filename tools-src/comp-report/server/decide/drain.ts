// The drainer (Dispatch 10 phase 1 steps 2–4): one invocation of the
// background function works the durable queue until it's empty or its time is
// nearly up, then says whether it should be invoked again.
//
// - One drainer at a time, held by a lease row that expires — not a session
//   advisory lock, which would pin one pooled connection for up to 15 minutes.
//   Each step is its own short transaction. A drainer that dies leaves its
//   lease to expire, and the next one requeues what it left running (once;
//   the second time it's dropped as out-of-time).
// - Pacing and the cool-down are shared through the store: requests start at
//   least JEV_MIN_INTERVAL_MS apart, and a 429/502/503/504 holds every request
//   until its Retry-After (or backoff) has passed.
// - A request gets JEV_MAX_ATTEMPTS attempts of 30 s. A network error backs off
//   that request alone and hands it back to the queue so the others go on.
// - Jev first. When Jev can't answer — no key, an account gate, retries or the
//   network exhausted — and the fallback's switch is on, Haiku 4.5 is asked.
//   A question neither answers is recorded as dropped, and goes to the agent
//   once anything is shown to agents; it's never guessed.
// - Nothing throws into a caller: every request ends answered or dropped with
//   a named reason, and the drainer reports what it did.

import { costUsd, HAIKU_MODEL } from './cost.ts';
import { fallbackReady, type DecideConfig } from './config.ts';
import { askHaiku, type HaikuClient } from './haiku.ts';
import {
  JEV_ATTEMPT_TIMEOUT_MS, JEV_MAX_ATTEMPTS, JEV_MODEL, jevAttempt, type DropReason, type ParsedAnswer,
} from './jev.ts';
import { LANE_TEXT, QUESTION_BY_ID, REGISTRY_VERSION, type LaneText } from './registry.ts';
import { optionOrderHash, renderRequest } from './render.ts';
import type { DecideStore, JudgmentRecord, QueueItem, UsageRecord } from './store.ts';
import { bandOf, barFor, landingOf, verdictFor, type ProviderId } from './verdict.ts';

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms))) };

/** A background function gets 15 minutes; the drainer stops starting work well before. */
export const DRAIN_BUDGET_MS = 12 * 60_000;
export const LEASE_MS = 2 * 60_000;

/** Jev can't answer: the fallback may. Not a malformed body, and not a refusal like the privacy flags' 4xx. */
export const FALLBACK_REASONS: ReadonlySet<string> = new Set(['no-key', 'retries-exhausted', 'network', 'http-401', 'http-402', 'http-403']);

export interface DrainDeps {
  store: DecideStore;
  clock: Clock;
  config: DecideConfig;
  fetchImpl: typeof fetch;
  /** The Haiku client, when the fallback can run. */
  haiku: HaikuClient | null;
  holder: string;
  budgetMs?: number;
  leaseMs?: number;
  attemptTimeoutMs?: number;
  log?: (event: string, data: Record<string, unknown>) => void;
  /** What each lane's text is. The registry's LANE_TEXT; tests pass their own. */
  lanes?: Readonly<Record<string, LaneText>>;
}

/**
 * PURE: whether a lane's request must be refused before it's sent. Only a lane
 * declared public goes out with zero retention off; a private lane — or one
 * that declares nothing — needs CR_JEV_ZDR on.
 */
export function zdrRefusal(lane: string, config: Pick<DecideConfig, 'zdr'>, lanes: Readonly<Record<string, LaneText>> = LANE_TEXT): boolean {
  return !config.zdr && lanes[lane] !== 'public';
}

export interface DrainReport {
  ran: boolean;
  answered: number;
  dropped: number;
  requeued: number;
  /** Work is left that this invocation had no time for: invoke again. */
  again: boolean;
  /** It stopped on an error. */
  failed?: boolean;
  byReason: Record<string, number>;
}

type ItemResult = 'answered' | 'dropped' | 'deferred' | 'out-of-time' | 'lost';

/** PURE: the judgment rows and the unanswered questions from one provider's answers. */
export function judge(
  item: QueueItem, questionIds: readonly string[], answers: Record<string, ParsedAnswer>, provider: ProviderId, model: string | null,
): { judgments: JudgmentRecord[]; unanswered: string[] } {
  const judgments: JudgmentRecord[] = [];
  const unanswered: string[] = [];
  for (const id of questionIds) {
    const q = QUESTION_BY_ID.get(id)!;
    const v = verdictFor(q, answers);
    if (!v) { unanswered.push(id); continue; }
    const bar = barFor(id, provider, model);
    const band = bandOf(v, bar);
    judgments.push({
      target: item.target,
      lane: item.lane,
      questionId: id,
      questionVersion: q.version,
      questionType: q.type,
      registryVersion: REGISTRY_VERSION,
      provider,
      model,
      answer: v.answer,
      probability: v.probability,
      orderStable: v.orderStable,
      probabilities: v.probabilities,
      vendorConfidence: v.vendorConfidence,
      band,
      // Phase 1 is watch mode only: CR_JEV_MODE has no live setting yet.
      landed: landingOf(band, bar, 'watch'),
      bar: bar.state === 'calibrated' ? bar.evidence : 'uncalibrated',
      stateHash: item.stateHash,
      optionOrderHash: optionOrderHash(q),
    });
  }
  return { judgments, unanswered };
}

export async function drain(deps: DrainDeps): Promise<DrainReport> {
  const { store, clock, config, holder } = deps;
  const budget = deps.budgetMs ?? DRAIN_BUDGET_MS;
  const leaseMs = deps.leaseMs ?? LEASE_MS;
  const attemptTimeout = deps.attemptTimeoutMs ?? JEV_ATTEMPT_TIMEOUT_MS;
  const log = deps.log ?? (() => undefined);
  const report: DrainReport = { ran: false, answered: 0, dropped: 0, requeued: 0, again: false, byReason: {} };
  const started = clock.now();
  const deadline = started + budget;

  try {
    if (!(await store.acquireLease(holder, started, leaseMs))) return report;
  } catch (error) {
    log('lease_failed', { error: String(error).slice(0, 200) });
    return report;
  }
  report.ran = true;
  const count = (result: ItemResult, reason?: string) => {
    if (result === 'answered') report.answered++;
    if (result === 'dropped') report.dropped++;
    if (reason) report.byReason[reason] = (report.byReason[reason] ?? 0) + 1;
  };

  try {
    const recovered = await store.recoverStranded(holder, clock.now());
    report.requeued += recovered.requeued;
    report.dropped += recovered.dropped;
    if (recovered.dropped) report.byReason['out-of-time'] = (report.byReason['out-of-time'] ?? 0) + recovered.dropped;

    for (;;) {
      const now = clock.now();
      if (!(await store.renewLease(holder, now, leaseMs))) { log('lease_lost', {}); break; }
      const item = await store.claimNext(holder, now);
      if (!item) {
        const wake = await store.nextWakeAt();
        if (wake === null) break;
        if (wake + attemptTimeout > deadline) { report.again = true; break; }
        // Everything queued is backing off: wait, in lease-sized steps.
        await clock.sleep(Math.min(Math.max(wake - now, 0), leaseMs / 2));
        continue;
      }
      const result = await runItem(deps, item, deadline, attemptTimeout, leaseMs, count);
      if (result === 'out-of-time') {
        const back = await store.putBack(holder, item.id, clock.now());
        if (back === 'requeued') report.requeued++; else count('dropped', 'out-of-time');
        report.again = true;
        break;
      }
      if (result === 'lost') break;
    }
  } catch (error) {
    // A database error mid-drain: stop, and don't hand on — a broken database
    // would only fail again. What's left running is recovered by the next
    // drainer an import or an admin starts.
    log('drain_failed', { error: String(error).slice(0, 200) });
    report.failed = true;
    report.again = false;
  } finally {
    await store.releaseLease(holder).catch(() => undefined);
  }
  if (!report.again && !report.failed) {
    // Something enqueued while this drainer was finishing couldn't get the lease to start its own.
    const wake = await store.nextWakeAt().catch(() => null);
    if (wake !== null) report.again = true;
  }
  return report;
}

async function runItem(
  deps: DrainDeps, item: QueueItem, deadline: number, attemptTimeout: number, leaseMs: number,
  count: (r: ItemResult, reason?: string) => void,
): Promise<ItemResult> {
  const { store, clock, config, holder } = deps;
  const log = deps.log ?? (() => undefined);
  const questionIds = item.questionIds.filter((id) => QUESTION_BY_ID.has(id));
  const purpose = `decide:${item.lane}`;
  const usageFor = (provider: UsageRecord['provider'], model: string, inputTokens: number, outputTokens: number, detail: Record<string, unknown>): UsageRecord => ({
    userEmail: item.userEmail ?? 'system:decide', provider, model, purpose, inputTokens, outputTokens,
    costUsd: costUsd(model, inputTokens, outputTokens), detail: { request: item.id, zdr: config.zdr, ...detail },
  });

  if (zdrRefusal(item.lane, config, deps.lanes)) {
    // Neither Jev nor the fallback may see private text without zero retention.
    const ok = await store.finishDropped(holder, item.id, clock.now(), {
      reason: 'zdr-required', attempts: item.attempts, lastStatus: null, usage: [],
      detail: { zdr: false, note: `the ${item.lane} lane's text isn't public, and CR_JEV_ZDR is off: nothing sent` },
    });
    if (ok) count('dropped', 'zdr-required');
    return ok ? 'dropped' : 'lost';
  }

  if (questionIds.length === 0) {
    const ok = await store.finishDropped(holder, item.id, clock.now(), {
      reason: 'unanswered', attempts: item.attempts, lastStatus: null, usage: [], detail: { note: 'no question in the request is in the registry any more' },
    });
    if (ok) count('dropped', 'unanswered');
    return ok ? 'dropped' : 'lost';
  }

  let attempts = item.attempts;
  let lastStatus: number | null = null;
  let jevDrop: { reason: DropReason; note: string } | null = null;
  const questions = renderRequest(questionIds);

  if (!config.jevKey) {
    jevDrop = { reason: 'no-key', note: 'no AI_GATEWAY_API_KEY: nothing sent' };
  } else {
    let notBefore = item.notBefore;
    while (!jevDrop) {
      const pace = await store.pacing();
      const turnAt = Math.max(pace.nextStartAt, pace.coolUntil, notBefore, clock.now());
      if (turnAt + attemptTimeout > deadline) {
        await store.saveAttempt(holder, item.id, { attempts, lastStatus, notBefore, backToQueue: false });
        return 'out-of-time';
      }
      // Wait for the turn in lease-sized steps, renewing as it goes.
      while (clock.now() < turnAt) {
        await clock.sleep(Math.min(turnAt - clock.now(), leaseMs / 2));
        if (!(await store.renewLease(holder, clock.now(), leaseMs))) return 'lost';
      }
      // Another wait may have been set while this one slept (it can't in a
      // single drainer, but the store is the truth): check once more.
      const again = await store.pacing();
      if (Math.max(again.nextStartAt, again.coolUntil) > clock.now()) continue;

      await store.setNextStart(clock.now() + config.minIntervalMs);
      attempts++;
      const startedAt = clock.now();
      const out = await jevAttempt({
        key: config.jevKey, state: item.state, questions, zdr: config.zdr, attempt: attempts, fetchImpl: deps.fetchImpl,
        nowMs: () => clock.now(), timeoutMs: attemptTimeout,
      });
      lastStatus = out.status;
      if (out.kind === 'answered') {
        const model = out.response.model ?? JEV_MODEL;
        const { judgments, unanswered } = judge(item, questionIds, out.response.answers, 'jev', out.response.model);
        const usage = [usageFor('jev', model, out.response.inputTokens, 0, { ms: clock.now() - startedAt, attempts })];
        const detail = { zdr: config.zdr, waitedMs: clock.now() - item.enqueuedAt };
        if (judgments.length === 0) {
          // A 200 that answered none of it: every question is unanswered.
          const ok = await store.finishDropped(holder, item.id, clock.now(), { reason: 'unanswered', attempts, lastStatus, usage, detail });
          if (ok) count('dropped', 'unanswered');
          return ok ? 'dropped' : 'lost';
        }
        const ok = await store.finishAnswered(holder, item.id, clock.now(), {
          provider: 'jev', model: out.response.model, attempts, lastStatus, unanswered, judgments, usage, detail,
        });
        if (!ok) return 'lost';
        count('answered', unanswered.length ? 'unanswered' : undefined);
        log('answered', { request: item.id, provider: 'jev', attempts, unanswered: unanswered.length });
        return 'answered';
      }
      if (out.kind === 'drop') {
        jevDrop = { reason: out.reason, note: out.note };
        break;
      }
      // Retry.
      log('retry', { request: item.id, status: out.status, attempt: attempts, waitMs: out.waitMs, shared: out.shared });
      if (attempts >= JEV_MAX_ATTEMPTS) {
        jevDrop = { reason: out.shared ? 'retries-exhausted' : 'network', note: out.note };
        break;
      }
      if (out.shared) {
        await store.coolDown(clock.now() + out.waitMs);
      } else {
        notBefore = clock.now() + out.waitMs;
        await store.saveAttempt(holder, item.id, { attempts, lastStatus, notBefore, backToQueue: true });
        return 'deferred';
      }
    }
  }

  // Jev didn't answer. The fallback, if it may.
  const usage: UsageRecord[] = [];
  const detail: Record<string, unknown> = { zdr: config.zdr, jev: { reason: jevDrop!.reason, note: jevDrop!.note }, waitedMs: clock.now() - item.enqueuedAt };
  if (FALLBACK_REASONS.has(jevDrop!.reason) && fallbackReady(config) && deps.haiku) {
    const h = await askHaiku(deps.haiku, item.state, questionIds);
    if (h.calls > 0) usage.push(usageFor('anthropic', h.ok ? h.model : HAIKU_MODEL, h.inputTokens, h.outputTokens, { fallback: true, calls: h.calls }));
    const judged = h.ok ? judge(item, questionIds, h.answers, 'haiku', h.model) : null;
    if (h.ok && judged && judged.judgments.length > 0) {
      const { judgments, unanswered } = judged;
      const ok = await store.finishAnswered(holder, item.id, clock.now(), {
        provider: 'haiku', model: h.model, attempts, lastStatus, unanswered, judgments, usage, detail,
      });
      if (!ok) return 'lost';
      count('answered', unanswered.length ? 'unanswered' : undefined);
      log('answered', { request: item.id, provider: 'haiku', unanswered: unanswered.length });
      return 'answered';
    }
    detail.fallback = { reason: h.ok ? 'unanswered' : h.reason };
  }
  const ok = await store.finishDropped(holder, item.id, clock.now(), { reason: jevDrop!.reason, attempts, lastStatus, usage, detail });
  if (!ok) return 'lost';
  count('dropped', jevDrop!.reason);
  log('dropped', { request: item.id, reason: jevDrop!.reason, attempts });
  return 'dropped';
}
