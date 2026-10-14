// The admin readout (Dispatch 10 phase 1 step 11): coverage first — answered
// against dropped, by reason — then cost, then what the answers say. Agreement
// by probability band waits on labels (phase 2); until then it reads
// "unmeasured", never a number.
//
// Read as the admin (row-level security admits admins and the system only).

import type { Queryable } from '../db.ts';
import { configSummary, type DecideConfig } from './config.ts';
import { costUsd } from './cost.ts';
import { FIXTURE_BY_ID, FIXTURES_VERSION } from './fixtures.ts';
import { JEV_MODEL } from './jev.ts';
import { QUESTIONS, REGISTRY_VERSION } from './registry.ts';
import { BARS } from './verdict.ts';

/** A drift-check answer has moved when it changed, or its probability moved this much. */
export const DRIFT_MOVE = 0.1;

export async function decideReadout(tx: Queryable, config: DecideConfig) {
  const requests = (await tx.query<{ status: string; drop_reason: string | null; requests: string; questions: string; unanswered: string }>(
    `select status, drop_reason, count(*) as requests,
            sum(cardinality(question_ids)) as questions, sum(cardinality(unanswered)) as unanswered
       from comp_report.decide_requests group by status, drop_reason`,
  )).rows;

  const byStatus: Record<string, number> = {};
  const droppedRequests: Record<string, number> = {};
  const droppedQuestions: Record<string, number> = {};
  let answeredQuestions = 0;
  let pendingQuestions = 0;
  for (const r of requests) {
    const n = Number(r.requests);
    const q = Number(r.questions);
    const u = Number(r.unanswered);
    byStatus[r.status] = (byStatus[r.status] ?? 0) + n;
    if (r.status === 'answered') {
      answeredQuestions += q - u;
      if (u > 0) droppedQuestions.unanswered = (droppedQuestions.unanswered ?? 0) + u;
    } else if (r.status === 'dropped') {
      const reason = r.drop_reason ?? 'unknown';
      droppedRequests[reason] = (droppedRequests[reason] ?? 0) + n;
      droppedQuestions[reason] = (droppedQuestions[reason] ?? 0) + q;
    } else {
      pendingQuestions += q;
    }
  }
  const dropped = Object.values(droppedQuestions).reduce((a, b) => a + b, 0);
  const settled = answeredQuestions + dropped;

  const runtime = (await tx.query<{ lease_held: boolean; lease_until: Date | null; cool_until: Date | string; oldest: Date | null }>(
    `select (lease_holder is not null and lease_until > now()) as lease_held, lease_until, cool_until,
            (select min(enqueued_at) from comp_report.decide_requests where status = 'queued') as oldest
       from comp_report.decide_runtime where id = 1`,
  )).rows[0];

  const perCall = (await tx.query<{ provider: string; calls: string; p50_ms: number | null; p95_ms: number | null }>(
    `select provider, count(*) as calls,
            percentile_cont(0.5) within group (order by (detail->>'ms')::float8) as p50_ms,
            percentile_cont(0.95) within group (order by (detail->>'ms')::float8) as p95_ms
       from comp_report.usage where purpose like 'decide:%' and detail ? 'ms' group by provider order by provider`,
  )).rows.map((r) => ({ provider: r.provider, calls: Number(r.calls), p50Ms: r.p50_ms, p95Ms: r.p95_ms }));

  const latestProbe = (await tx.query<{ id: string; created_at: Date; ok: boolean; outcome: string; status: number | null; ms: number | null; model: string | null; zdr: boolean }>(
    'select id, created_at, ok, outcome, status, ms, model, zdr from comp_report.decide_probes order by id desc limit 1',
  )).rows[0];

  const batches = (await tx.query<{ batch: string; status: string; n: string; first_at: Date; last_at: Date }>(
    `select batch, status, count(*) as n, min(enqueued_at) as first_at, max(enqueued_at) as last_at
       from comp_report.decide_requests where batch is not null group by batch, status order by min(id), status`,
  )).rows;
  const byBatch = new Map<string, { batch: string; byStatus: Record<string, number>; firstAt: Date; lastAt: Date }>();
  for (const b of batches) {
    const e = byBatch.get(b.batch) ?? { batch: b.batch, byStatus: {}, firstAt: b.first_at, lastAt: b.last_at };
    e.byStatus[b.status] = Number(b.n);
    if (b.first_at < e.firstAt) e.firstAt = b.first_at;
    if (b.last_at > e.lastAt) e.lastAt = b.last_at;
    byBatch.set(b.batch, e);
  }

  const latency = (await tx.query<{ status: string; p50_s: number | null; p95_s: number | null }>(
    `select status,
            percentile_cont(0.5) within group (order by extract(epoch from finished_at - enqueued_at)) as p50_s,
            percentile_cont(0.95) within group (order by extract(epoch from finished_at - enqueued_at)) as p95_s
       from comp_report.decide_requests where finished_at is not null group by status`,
  )).rows;

  const cost = (await tx.query<{ provider: string; model: string; calls: string; input_tokens: string; output_tokens: string }>(
    `select provider, model, count(*) as calls, sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens
       from comp_report.usage where purpose like 'decide:%' group by provider, model order by provider, model`,
  )).rows.map((r) => {
    const input = Number(r.input_tokens);
    const output = Number(r.output_tokens);
    return { provider: r.provider, model: r.model, calls: Number(r.calls), inputTokens: input, outputTokens: output, usd: costUsd(r.model, input, output) };
  });
  // Per listing: Jev's calls on imports only — not the probe, the drift fixtures or the labelled batch's second judge.
  const imports = (await tx.query<{ input_tokens: string | null; listings: string }>(
    `select sum(u.input_tokens) as input_tokens, count(distinct r.observation_id) as listings
       from comp_report.usage u
       join comp_report.decide_requests r on r.id = case when u.detail->>'request' ~ '^[0-9]+$' then (u.detail->>'request')::bigint end
      where u.purpose = 'decide:listing' and u.provider = 'jev' and r.batch is null and r.target_kind = 'property_observation'`,
  )).rows[0];
  const importListings = Number(imports?.listings ?? 0);
  const importUsd = costUsd(JEV_MODEL, Number(imports?.input_tokens ?? 0), 0) ?? 0;
  const totalUsd = cost.reduce((a, c) => a + (c.usd ?? 0), 0);

  const bands = (await tx.query<{ question_id: string; provider: string; model: string | null; band: string; landed: string; n: string; unstable: string }>(
    `select question_id, provider, model, band, landed, count(*) as n, count(*) filter (where not order_stable) as unstable
       from comp_report.judgments group by question_id, provider, model, band, landed order by question_id, provider, model, band`,
  )).rows;
  const answers = (await tx.query<{ question_id: string; provider: string; answer: string | null; n: string }>(
    'select question_id, provider, answer, count(*) as n from comp_report.judgments group by question_id, provider, answer order by 1, 2, 3',
  )).rows;

  return {
    setup: configSummary(config),
    registry: {
      version: REGISTRY_VERSION,
      questions: QUESTIONS.map((q) => ({ id: q.id, version: q.version, type: q.type, feeds: q.feeds })),
      calibratedBars: BARS.filter((b) => b.state === 'calibrated').length,
    },
    queue: {
      byStatus,
      oldestQueuedAt: runtime?.oldest ?? null,
      drainerRunning: runtime?.lease_held ?? false,
      coolUntil: runtime?.cool_until instanceof Date ? runtime.cool_until : null,
    },
    coverage: {
      // Registry questions, not wire questions: a choice asked in both orders is one question.
      questions: { answered: answeredQuestions, dropped, pending: pendingQuestions, answeredShare: settled ? answeredQuestions / settled : null },
      droppedQuestionsByReason: droppedQuestions,
      droppedRequestsByReason: droppedRequests,
    },
    latency: {
      // In the queue: from enqueue to finish, by how it ended.
      queue: latency.map((l) => ({ status: l.status, p50Seconds: l.p50_s, p95Seconds: l.p95_s })),
      // One call, from the usage rows' own timing.
      perCall,
    },
    probe: latestProbe
      ? { id: Number(latestProbe.id), at: latestProbe.created_at, ok: latestProbe.ok, outcome: latestProbe.outcome, status: latestProbe.status, ms: latestProbe.ms, model: latestProbe.model, zdr: latestProbe.zdr }
      : null,
    batches: [...byBatch.values()],
    drift: await driftReadout(tx),
    cost: {
      byModel: cost,
      totalUsd: Math.round(totalUsd * 1e6) / 1e6,
      perListingUsd: importListings ? Math.round((importUsd / importListings) * 1e8) / 1e8 : null,
    },
    judgments: {
      byBand: bands.map((b) => ({ ...b, n: Number(b.n), unstable: Number(b.unstable) })),
      byAnswer: answers.map((a) => ({ ...a, n: Number(a.n) })),
    },
    agreement: { state: 'unmeasured' as const, note: 'No labels yet. Phase 2 pre-registers a labelled set before any live call.' },
  };
}

/**
 * The drift check: per fixture × question × provider, its first recorded
 * answer against its latest, for the same wording (option-order hash). A
 * question whose wording changed starts a new record.
 */
export async function driftReadout(tx: Queryable) {
  const rows = (await tx.query<{
    fixture_id: string; question_id: string; provider: string; runs: string;
    first_answer: string | null; first_p: number | null; first_at: Date; latest_answer: string | null; latest_p: number | null; latest_at: Date;
  }>(
    `with j as (
       select fixture_id, question_id, provider, option_order_hash, answer, probability, created_at,
              row_number() over w_first as first_n, row_number() over w_last as last_n, count(*) over w_all as runs
         from comp_report.judgments
        where target_kind = 'fixture'
       window w_first as (partition by fixture_id, question_id, provider, option_order_hash order by id),
              w_last as (partition by fixture_id, question_id, provider, option_order_hash order by id desc),
              w_all as (partition by fixture_id, question_id, provider, option_order_hash))
     select f.fixture_id, f.question_id, f.provider, f.runs,
            f.answer as first_answer, f.probability as first_p, f.created_at as first_at,
            l.answer as latest_answer, l.probability as latest_p, l.created_at as latest_at
       from j f join j l using (fixture_id, question_id, provider, option_order_hash)
      where f.first_n = 1 and l.last_n = 1
      order by f.fixture_id, f.question_id, f.provider`,
  )).rows;
  const items = rows.map((r) => {
    const dp = r.first_p !== null && r.latest_p !== null ? r.latest_p - r.first_p : null;
    const moved = r.first_answer !== r.latest_answer || (dp !== null && Math.abs(dp) >= DRIFT_MOVE);
    const expected = FIXTURE_BY_ID.get(r.fixture_id)?.expected[r.question_id] ?? null;
    return {
      fixture: r.fixture_id, question: r.question_id, provider: r.provider, runs: Number(r.runs),
      first: { answer: r.first_answer, probability: r.first_p, at: r.first_at },
      latest: { answer: r.latest_answer, probability: r.latest_p, at: r.latest_at },
      probabilityChange: dp, moved, expected, latestMatchesExpected: expected === null ? null : r.latest_answer === expected,
    };
  });
  return { fixturesVersion: FIXTURES_VERSION, moved: items.filter((i) => i.moved).length, items };
}

/** One batch's requests, each with its text and every judgment on it — what the agreement script reads. */
export async function batchView(tx: Queryable, batch: string) {
  const requests = (await tx.query<{
    id: string; status: string; drop_reason: string | null; source_url: string | null; fixture_id: string | null;
    observation_id: string | null; state: unknown; state_hash: string; question_ids: string[]; unanswered: string[]; enqueued_at: Date; finished_at: Date | null;
  }>(
    `select id, status, drop_reason, source_url, fixture_id, observation_id, state, state_hash, question_ids, unanswered, enqueued_at, finished_at
       from comp_report.decide_requests where batch = $1 order by id`,
    [batch],
  )).rows;
  const judgments = (await tx.query<{
    request_id: string; provider: string; model: string | null; question_id: string; question_version: number; answer: string | null;
    probability: number | null; order_stable: boolean; probabilities: unknown; band: string;
  }>(
    `select j.request_id, j.provider, j.model, j.question_id, j.question_version, j.answer, j.probability, j.order_stable, j.probabilities, j.band
       from comp_report.judgments j join comp_report.decide_requests r on r.id = j.request_id
      where r.batch = $1 order by j.request_id, j.question_id, j.provider`,
    [batch],
  )).rows;
  const byRequest = new Map<string, typeof judgments>();
  for (const j of judgments) byRequest.set(j.request_id, [...(byRequest.get(j.request_id) ?? []), j]);
  return {
    batch,
    registryVersion: REGISTRY_VERSION,
    requests: requests.map((r) => ({
      id: Number(r.id), status: r.status, dropReason: r.drop_reason, url: r.source_url, fixture: r.fixture_id,
      observationId: r.observation_id === null ? null : Number(r.observation_id),
      state: r.state, stateHash: r.state_hash, questions: r.question_ids, unanswered: r.unanswered,
      enqueuedAt: r.enqueued_at, finishedAt: r.finished_at,
      judgments: (byRequest.get(r.id) ?? []).map((j) => ({
        provider: j.provider, model: j.model, question: j.question_id, version: j.question_version, answer: j.answer,
        probability: j.probability, orderStable: j.order_stable, probabilities: j.probabilities, band: j.band,
      })),
    })),
  };
}

/** The latest go/no-go calls, raw bodies and all: what the parser gets pinned to. */
export async function probesView(tx: Queryable, limit = 10) {
  const rows = (await tx.query<Record<string, unknown>>(
    `select id, created_at, created_by, ok, outcome, status, ms, provider, model, zdr, registry_version, fixture_id, wire_ids, unanswered, raw, answers
       from comp_report.decide_probes order by id desc limit $1`,
    [Math.max(1, Math.min(50, Math.floor(limit)))],
  )).rows;
  return { probes: rows.map((r) => ({ ...r, id: Number(r.id) })) };
}
