// The durable queue's storage contract (Dispatch 10 phase 1 step 3), and an
// in-memory implementation of it on an injected clock for the transport tests.
// Production uses pg-store.ts, the same contract over Postgres; the database
// tests hold that one to the same behaviour.
//
// The queue is also the drop ledger: every request ends answered or dropped
// with a named reason, so coverage is a number.
//
// Times are milliseconds since the epoch, passed in by the caller's clock —
// never the database's now() — so the tests can run the queue on a fake clock.

import type { DropReason } from './jev.ts';
import type { Band, Landing, ProviderId } from './verdict.ts';

export type RequestStatus = 'queued' | 'running' | 'answered' | 'dropped';

export interface Target {
  kind: 'property_observation';
  observationId: number;
}

export interface QueueItem {
  id: number;
  lane: 'listing';
  target: Target;
  questionIds: string[];
  registryVersion: string;
  state: unknown;
  stateHash: string;
  attempts: number;
  requeues: number;
  notBefore: number;
  enqueuedAt: number;
  /** Who the request is for (the importing agent), for the usage row. */
  userEmail: string | null;
}

export interface NewRequest {
  lane: 'listing';
  target: Target;
  questionIds: string[];
  /** How many wire questions: a choice counts twice (both orders). */
  wireQuestions: number;
  registryVersion: string;
  state: unknown;
  stateHash: string;
  userEmail: string | null;
}

export interface JudgmentRecord {
  target: Target;
  lane: 'listing';
  questionId: string;
  questionVersion: number;
  questionType: 'choice' | 'boolean' | 'score';
  registryVersion: string;
  provider: ProviderId;
  model: string | null;
  answer: string | null;
  probability: number | null;
  orderStable: boolean;
  probabilities: Record<string, Record<string, number>>;
  vendorConfidence: Record<string, number>;
  band: Band;
  landed: Landing;
  /** "uncalibrated", or the bar's evidence pointer. */
  bar: string;
  stateHash: string;
  optionOrderHash: string;
}

export interface UsageRecord {
  userEmail: string;
  provider: 'jev' | 'anthropic';
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  detail: Record<string, unknown>;
}

export interface AnsweredRecord {
  provider: ProviderId;
  model: string | null;
  attempts: number;
  lastStatus: number | null;
  /** Registry questions that came back without a usable answer ("unanswered"). */
  unanswered: string[];
  judgments: JudgmentRecord[];
  usage: UsageRecord[];
  detail: Record<string, unknown>;
}

export interface DroppedRecord {
  reason: DropReason;
  attempts: number;
  lastStatus: number | null;
  usage: UsageRecord[];
  detail: Record<string, unknown>;
}

export interface DecideStore {
  /** Adds a request, or records it dropped as queue-full past the cap. Returns its id and status. */
  enqueue(req: NewRequest, nowMs: number, maxQueue: number): Promise<{ id: number; status: RequestStatus }>;
  /** Records a request that was never queued (no-key with no fallback): dropped at once. */
  enqueueDropped(req: NewRequest, nowMs: number, reason: DropReason): Promise<{ id: number }>;

  /** One drainer at a time: take the lease if it's free, expired or already ours. */
  acquireLease(holder: string, nowMs: number, leaseMs: number): Promise<boolean>;
  /** Extend it; false when it's no longer ours. */
  renewLease(holder: string, nowMs: number, leaseMs: number): Promise<boolean>;
  releaseLease(holder: string): Promise<void>;

  /** The shared pacing: when the next request may start, and the cool-down every request waits out. */
  pacing(): Promise<{ nextStartAt: number; coolUntil: number }>;
  setNextStart(atMs: number): Promise<void>;
  /** Extends the shared cool-down; never shortens it. */
  coolDown(untilMs: number): Promise<void>;

  /**
   * Requests left running by a drainer that no longer holds the lease (it died
   * or ran out of time): requeued once, then dropped as out-of-time.
   */
  recoverStranded(holder: string, nowMs: number): Promise<{ requeued: number; dropped: number }>;
  /** The oldest queued request that may start by now, marked running for this holder. */
  claimNext(holder: string, nowMs: number): Promise<QueueItem | null>;
  /** When the earliest queued request may start, or null when nothing is queued. */
  nextWakeAt(): Promise<number | null>;
  /** Saves an attempt's progress. `backToQueue` hands a request that's backing off back to the queue. */
  saveAttempt(holder: string, id: number, p: { attempts: number; lastStatus: number | null; notBefore: number; backToQueue: boolean }): Promise<void>;
  /** A running request this drainer has no time for: requeued once, then dropped as out-of-time. */
  putBack(holder: string, id: number, nowMs: number): Promise<'requeued' | 'dropped'>;
  finishAnswered(holder: string, id: number, nowMs: number, rec: AnsweredRecord): Promise<boolean>;
  finishDropped(holder: string, id: number, nowMs: number, rec: DroppedRecord): Promise<boolean>;

  /** A one-use token that lets the background drainer run, for `ttlMs`. Replaces any earlier one. */
  issueKick(nowMs: number, ttlMs: number): Promise<string>;
  /** True once for a live token; it's spent. */
  redeemKick(token: string, nowMs: number): Promise<boolean>;
}

// ─── In memory, for the tests ────────────────────────────────────────────────

export interface MemoryRow {
  item: QueueItem;
  status: RequestStatus;
  claimedBy: string | null;
  wireQuestions: number;
  dropReason: DropReason | null;
  lastStatus: number | null;
  provider: ProviderId | null;
  model: string | null;
  unanswered: string[];
  finishedAt: number | null;
  detail: Record<string, unknown>;
}

export class MemoryStore implements DecideStore {
  rows: MemoryRow[] = [];
  judgments: JudgmentRecord[] = [];
  usage: UsageRecord[] = [];
  lease: { holder: string | null; until: number } = { holder: null, until: 0 };
  nextStartAt = 0;
  coolUntil = 0;
  starts: number[] = [];
  private kick: { token: string; until: number } | null = null;
  private seq = 0;

  private add(req: NewRequest, nowMs: number, status: RequestStatus, dropReason: DropReason | null): MemoryRow {
    const { wireQuestions, ...fields } = req;
    const row: MemoryRow = {
      item: { ...fields, id: ++this.seq, attempts: 0, requeues: 0, notBefore: nowMs, enqueuedAt: nowMs },
      status, claimedBy: null, wireQuestions, dropReason, lastStatus: null,
      provider: null, model: null, unanswered: [], finishedAt: status === 'dropped' ? nowMs : null, detail: {},
    };
    this.rows.push(row);
    return row;
  }

  async enqueue(req: NewRequest, nowMs: number, maxQueue: number) {
    const open = this.rows.filter((r) => r.status === 'queued' || r.status === 'running').length;
    const full = open >= maxQueue;
    const row = this.add(req, nowMs, full ? 'dropped' : 'queued', full ? 'queue-full' : null);
    return { id: row.item.id, status: row.status };
  }

  async enqueueDropped(req: NewRequest, nowMs: number, reason: DropReason) {
    return { id: this.add(req, nowMs, 'dropped', reason).item.id };
  }

  async acquireLease(holder: string, nowMs: number, leaseMs: number) {
    if (this.lease.holder && this.lease.holder !== holder && this.lease.until > nowMs) return false;
    this.lease = { holder, until: nowMs + leaseMs };
    return true;
  }

  async renewLease(holder: string, nowMs: number, leaseMs: number) {
    if (this.lease.holder !== holder) return false;
    this.lease.until = nowMs + leaseMs;
    return true;
  }

  async releaseLease(holder: string) {
    if (this.lease.holder === holder) this.lease = { holder: null, until: 0 };
  }

  async pacing() {
    return { nextStartAt: this.nextStartAt, coolUntil: this.coolUntil };
  }

  async setNextStart(atMs: number) {
    this.nextStartAt = atMs;
  }

  async coolDown(untilMs: number) {
    this.coolUntil = Math.max(this.coolUntil, untilMs);
  }

  private backOrDrop(row: MemoryRow, nowMs: number): 'requeued' | 'dropped' {
    row.claimedBy = null;
    if (row.item.requeues >= 1) {
      row.status = 'dropped';
      row.dropReason = 'out-of-time';
      row.finishedAt = nowMs;
      return 'dropped';
    }
    row.item.requeues++;
    row.status = 'queued';
    return 'requeued';
  }

  async recoverStranded(holder: string, nowMs: number) {
    let requeued = 0;
    let dropped = 0;
    for (const row of this.rows) {
      if (row.status !== 'running' || row.claimedBy === holder) continue;
      if (this.backOrDrop(row, nowMs) === 'requeued') requeued++; else dropped++;
    }
    return { requeued, dropped };
  }

  async claimNext(holder: string, nowMs: number) {
    const row = this.rows
      .filter((r) => r.status === 'queued' && r.item.notBefore <= nowMs)
      .sort((a, b) => a.item.notBefore - b.item.notBefore || a.item.id - b.item.id)[0];
    if (!row) return null;
    row.status = 'running';
    row.claimedBy = holder;
    return structuredClone(row.item);
  }

  async nextWakeAt() {
    const queued = this.rows.filter((r) => r.status === 'queued');
    return queued.length ? Math.min(...queued.map((r) => r.item.notBefore)) : null;
  }

  private mine(holder: string, id: number) {
    const row = this.rows.find((r) => r.item.id === id);
    return row && row.status === 'running' && row.claimedBy === holder ? row : null;
  }

  async saveAttempt(holder: string, id: number, p: { attempts: number; lastStatus: number | null; notBefore: number; backToQueue: boolean }) {
    const row = this.mine(holder, id);
    if (!row) return;
    row.item.attempts = p.attempts;
    row.lastStatus = p.lastStatus;
    row.item.notBefore = p.notBefore;
    if (p.backToQueue) { row.status = 'queued'; row.claimedBy = null; }
  }

  async putBack(holder: string, id: number, nowMs: number) {
    const row = this.mine(holder, id);
    return row ? this.backOrDrop(row, nowMs) : 'requeued';
  }

  async finishAnswered(holder: string, id: number, nowMs: number, rec: AnsweredRecord) {
    const row = this.mine(holder, id);
    if (!row) return false;
    Object.assign(row, {
      status: 'answered', claimedBy: null, finishedAt: nowMs, provider: rec.provider, model: rec.model,
      lastStatus: rec.lastStatus, unanswered: rec.unanswered, detail: rec.detail,
      dropReason: rec.unanswered.length ? 'unanswered' : null,
    });
    row.item.attempts = rec.attempts;
    this.judgments.push(...rec.judgments);
    this.usage.push(...rec.usage);
    return true;
  }

  async finishDropped(holder: string, id: number, nowMs: number, rec: DroppedRecord) {
    const row = this.mine(holder, id);
    if (!row) return false;
    Object.assign(row, { status: 'dropped', claimedBy: null, finishedAt: nowMs, dropReason: rec.reason, lastStatus: rec.lastStatus, detail: rec.detail });
    row.item.attempts = rec.attempts;
    this.usage.push(...rec.usage);
    return true;
  }

  async issueKick(nowMs: number, ttlMs: number) {
    const token = `kick-${++this.seq}-${Math.random().toString(36).slice(2)}`;
    this.kick = { token, until: nowMs + ttlMs };
    return token;
  }

  async redeemKick(token: string, nowMs: number) {
    const ok = !!this.kick && this.kick.token === token && this.kick.until > nowMs;
    if (ok) this.kick = null;
    return ok;
  }
}
