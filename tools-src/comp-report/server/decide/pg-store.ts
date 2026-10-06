// The durable queue over Postgres — store.ts's contract, as the production
// drainer and the enqueue use it. Every call is its own short transaction as a
// system actor (row-level security admits nobody else to these tables), so no
// pooled connection is held between steps, and nothing is held while waiting.
//
// The lease is a row with an expiry, taken with one conditional UPDATE: two
// drainers racing for it serialise on the row lock, and the loser's WHERE no
// longer matches.

import { randomBytes } from 'node:crypto';
import { withActor, type PoolLike, type Queryable } from '../db.ts';
import type { DropReason } from './jev.ts';
import { sha256Hex } from './render.ts';
import type {
  AnsweredRecord, DecideStore, DroppedRecord, NewRequest, QueueItem, RequestStatus, UsageRecord,
} from './store.ts';

const SYSTEM = { kind: 'system', does: 'decide' } as const;

/** A timestamptz column as epoch ms; -infinity and null read as 0. */
const MS = (col: string) => `coalesce(extract(epoch from nullif(${col}, '-infinity'::timestamptz)) * 1000, 0)::float8`;
const TS = (param: string) => `to_timestamp(${param}::float8 / 1000.0)`;

interface ItemRow {
  id: string | number;
  lane: 'listing';
  target_kind: 'property_observation';
  observation_id: string | number;
  question_ids: string[];
  registry_version: string;
  state: unknown;
  state_hash: string;
  attempts: number;
  requeues: number;
  not_before_ms: number | string;
  enqueued_at_ms: number | string;
  user_email: string | null;
}

const ITEM_COLUMNS = `id, lane, target_kind, observation_id, question_ids, registry_version, state, state_hash,
  attempts, requeues, ${MS('not_before')} as not_before_ms, ${MS('enqueued_at')} as enqueued_at_ms, user_email`;

function item(r: ItemRow): QueueItem {
  return {
    id: Number(r.id),
    lane: r.lane,
    target: { kind: r.target_kind, observationId: Number(r.observation_id) },
    questionIds: r.question_ids,
    registryVersion: r.registry_version,
    state: r.state,
    stateHash: r.state_hash,
    attempts: r.attempts,
    requeues: r.requeues,
    notBefore: Number(r.not_before_ms),
    enqueuedAt: Number(r.enqueued_at_ms),
    userEmail: r.user_email,
  };
}

async function insertUsage(tx: Queryable, rows: readonly UsageRecord[]) {
  for (const u of rows) {
    await tx.query(
      `insert into comp_report.usage (user_email, provider, model, purpose, input_tokens, output_tokens, estimated_cost_usd, detail)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [u.userEmail, u.provider, u.model, u.purpose, u.inputTokens, u.outputTokens, u.costUsd, JSON.stringify(u.detail)],
    );
  }
}

export class PgStore implements DecideStore {
  private readonly pool: PoolLike;

  constructor(pool: PoolLike) {
    this.pool = pool;
  }

  private run<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    return withActor(this.pool, SYSTEM, fn);
  }

  private async insert(tx: Queryable, req: NewRequest, nowMs: number, status: RequestStatus, reason: DropReason | null) {
    const { rows } = await tx.query<{ id: string }>(
      `insert into comp_report.decide_requests
         (lane, target_kind, observation_id, question_ids, wire_questions, registry_version, state, state_hash, user_email,
          status, drop_reason, not_before, enqueued_at, finished_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ${TS('$12')}, ${TS('$12')}, case when $10 = 'dropped' then ${TS('$12')} end)
       returning id`,
      [req.lane, req.target.kind, req.target.observationId, req.questionIds, req.wireQuestions, req.registryVersion,
        JSON.stringify(req.state), req.stateHash, req.userEmail, status, reason, nowMs],
    );
    return Number(rows[0]!.id);
  }

  enqueue(req: NewRequest, nowMs: number, maxQueue: number) {
    return this.run(async (tx) => {
      // Serialise enqueues on the runtime row, so the cap is exact.
      await tx.query('select 1 from comp_report.decide_runtime where id = 1 for update');
      const { rows } = await tx.query<{ n: string }>(
        "select count(*) as n from comp_report.decide_requests where status in ('queued', 'running')",
      );
      const full = Number(rows[0]!.n) >= maxQueue;
      const status: RequestStatus = full ? 'dropped' : 'queued';
      return { id: await this.insert(tx, req, nowMs, status, full ? 'queue-full' : null), status };
    });
  }

  enqueueDropped(req: NewRequest, nowMs: number, reason: DropReason) {
    return this.run(async (tx) => ({ id: await this.insert(tx, req, nowMs, 'dropped', reason) }));
  }

  acquireLease(holder: string, nowMs: number, leaseMs: number) {
    return this.run(async (tx) => {
      const r = await tx.query(
        `update comp_report.decide_runtime set lease_holder = $1, lease_until = ${TS('$2')}
          where id = 1 and (lease_holder is null or lease_holder = $1 or lease_until <= ${TS('$3')})`,
        [holder, nowMs + leaseMs, nowMs],
      );
      return r.rowCount === 1;
    });
  }

  renewLease(holder: string, nowMs: number, leaseMs: number) {
    return this.run(async (tx) => {
      const r = await tx.query(
        `update comp_report.decide_runtime set lease_until = ${TS('$2')} where id = 1 and lease_holder = $1`,
        [holder, nowMs + leaseMs],
      );
      return r.rowCount === 1;
    });
  }

  async releaseLease(holder: string) {
    await this.run((tx) => tx.query(
      'update comp_report.decide_runtime set lease_holder = null, lease_until = null where id = 1 and lease_holder = $1',
      [holder],
    ));
  }

  pacing() {
    return this.run(async (tx) => {
      const { rows } = await tx.query<{ next_ms: number | string; cool_ms: number | string }>(
        `select ${MS('next_start_at')} as next_ms, ${MS('cool_until')} as cool_ms from comp_report.decide_runtime where id = 1`,
      );
      return { nextStartAt: Number(rows[0]?.next_ms ?? 0), coolUntil: Number(rows[0]?.cool_ms ?? 0) };
    });
  }

  async setNextStart(atMs: number) {
    await this.run((tx) => tx.query(`update comp_report.decide_runtime set next_start_at = ${TS('$1')} where id = 1`, [atMs]));
  }

  async coolDown(untilMs: number) {
    await this.run((tx) => tx.query(
      `update comp_report.decide_runtime set cool_until = greatest(cool_until, ${TS('$1')}) where id = 1`,
      [untilMs],
    ));
  }

  /** Requeue once, then drop as out-of-time — for every running row matched by `where`. */
  private backOrDrop(tx: Queryable, where: string, params: unknown[], nowParam: string) {
    return tx.query<{ status: RequestStatus }>(
      `update comp_report.decide_requests
          set status = case when requeues >= 1 then 'dropped' else 'queued' end,
              drop_reason = case when requeues >= 1 then 'out-of-time' end,
              finished_at = case when requeues >= 1 then ${TS(nowParam)} end,
              requeues = case when requeues >= 1 then requeues else requeues + 1 end,
              claimed_by = null
        where status = 'running' and ${where}
        returning status`,
      params,
    );
  }

  recoverStranded(holder: string, nowMs: number) {
    return this.run(async (tx) => {
      const { rows } = await this.backOrDrop(tx, 'claimed_by <> $1', [holder, nowMs], '$2');
      return {
        requeued: rows.filter((r) => r.status === 'queued').length,
        dropped: rows.filter((r) => r.status === 'dropped').length,
      };
    });
  }

  claimNext(holder: string, nowMs: number) {
    return this.run(async (tx) => {
      const { rows } = await tx.query<ItemRow>(
        `update comp_report.decide_requests set status = 'running', claimed_by = $1
          where id = (select id from comp_report.decide_requests
                       where status = 'queued' and not_before <= ${TS('$2')}
                       order by not_before, id limit 1 for update skip locked)
          returning ${ITEM_COLUMNS}`,
        [holder, nowMs],
      );
      return rows[0] ? item(rows[0]) : null;
    });
  }

  nextWakeAt() {
    return this.run(async (tx) => {
      const { rows } = await tx.query<{ ms: number | string | null }>(
        `select ${MS('min(not_before)')} as ms, count(*) as n from comp_report.decide_requests where status = 'queued'`,
      );
      const r = rows[0] as { ms: number | string | null; n?: string } | undefined;
      return r && Number(r.n) > 0 ? Number(r.ms) : null;
    });
  }

  async saveAttempt(holder: string, id: number, p: { attempts: number; lastStatus: number | null; notBefore: number; backToQueue: boolean }) {
    await this.run((tx) => tx.query(
      `update comp_report.decide_requests
          set attempts = $3, last_status = $4, not_before = ${TS('$5')},
              status = case when $6 then 'queued' else status end,
              claimed_by = case when $6 then null else claimed_by end
        where id = $2 and status = 'running' and claimed_by = $1`,
      [holder, id, p.attempts, p.lastStatus, p.notBefore, p.backToQueue],
    ));
  }

  putBack(holder: string, id: number, nowMs: number) {
    return this.run(async (tx) => {
      const { rows } = await this.backOrDrop(tx, 'id = $1 and claimed_by = $2', [id, holder, nowMs], '$3');
      return rows[0]?.status === 'dropped' ? 'dropped' as const : 'requeued' as const;
    });
  }

  finishAnswered(holder: string, id: number, nowMs: number, rec: AnsweredRecord) {
    return this.run(async (tx) => {
      const done = await tx.query(
        `update comp_report.decide_requests
            set status = 'answered', claimed_by = null, finished_at = ${TS('$3')}, provider = $4, model = $5,
                attempts = $6, last_status = $7, unanswered = $8,
                drop_reason = case when cardinality($8::text[]) > 0 then 'unanswered' end, detail = $9
          where id = $2 and status = 'running' and claimed_by = $1`,
        [holder, id, nowMs, rec.provider, rec.model, rec.attempts, rec.lastStatus, rec.unanswered, JSON.stringify(rec.detail)],
      );
      if (done.rowCount !== 1) return false;
      for (const j of rec.judgments) {
        await tx.query(
          `insert into comp_report.judgments
             (request_id, target_kind, observation_id, lane, question_id, question_version, question_type, registry_version,
              provider, model, answer, probability, order_stable, probabilities, vendor_confidence, band, landed, bar,
              state_hash, option_order_hash)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [id, j.target.kind, j.target.observationId, j.lane, j.questionId, j.questionVersion, j.questionType, j.registryVersion,
            j.provider, j.model, j.answer, j.probability, j.orderStable, JSON.stringify(j.probabilities),
            JSON.stringify(j.vendorConfidence), j.band, j.landed, j.bar, j.stateHash, j.optionOrderHash],
        );
      }
      await insertUsage(tx, rec.usage);
      return true;
    });
  }

  finishDropped(holder: string, id: number, nowMs: number, rec: DroppedRecord) {
    return this.run(async (tx) => {
      const done = await tx.query(
        `update comp_report.decide_requests
            set status = 'dropped', claimed_by = null, finished_at = ${TS('$3')}, drop_reason = $4,
                attempts = $5, last_status = $6, detail = $7
          where id = $2 and status = 'running' and claimed_by = $1`,
        [holder, id, nowMs, rec.reason, rec.attempts, rec.lastStatus, JSON.stringify(rec.detail)],
      );
      if (done.rowCount !== 1) return false;
      await insertUsage(tx, rec.usage);
      return true;
    });
  }

  issueKick(nowMs: number, ttlMs: number) {
    const token = randomBytes(32).toString('hex');
    return this.run(async (tx) => {
      await tx.query(
        `update comp_report.decide_runtime set kick_hash = $1, kick_until = ${TS('$2')} where id = 1`,
        [sha256Hex(token), nowMs + ttlMs],
      );
      return token;
    });
  }

  redeemKick(token: string, nowMs: number) {
    if (!/^[0-9a-f]{64}$/.test(token)) return Promise.resolve(false);
    return this.run(async (tx) => {
      const r = await tx.query(
        `update comp_report.decide_runtime set kick_hash = null, kick_until = null
          where id = 1 and kick_hash = $1 and kick_until > ${TS('$2')}`,
        [sha256Hex(token), nowMs],
      );
      return r.rowCount === 1;
    });
  }
}
