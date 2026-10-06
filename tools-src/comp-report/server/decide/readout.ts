// The admin readout (Dispatch 10 phase 1 step 11): coverage first — answered
// against dropped, by reason — then cost, then what the answers say. Agreement
// by probability band waits on labels (phase 2); until then it reads
// "unmeasured", never a number.
//
// Read as the admin (row-level security admits admins and the system only).

import type { Queryable } from '../db.ts';
import { configSummary, type DecideConfig } from './config.ts';
import { costUsd } from './cost.ts';
import { QUESTIONS, REGISTRY_VERSION } from './registry.ts';
import { BARS } from './verdict.ts';

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
  const observations = Number((await tx.query<{ n: string }>(
    "select count(distinct observation_id) as n from comp_report.decide_requests where status = 'answered'",
  )).rows[0]?.n ?? 0);
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
    latency: latency.map((l) => ({ status: l.status, p50Seconds: l.p50_s, p95Seconds: l.p95_s })),
    cost: {
      byModel: cost,
      totalUsd: Math.round(totalUsd * 1e6) / 1e6,
      perListingUsd: observations ? Math.round((totalUsd / observations) * 1e8) / 1e8 : null,
    },
    judgments: {
      byBand: bands.map((b) => ({ ...b, n: Number(b.n), unstable: Number(b.unstable) })),
      byAnswer: answers.map((a) => ({ ...a, n: Number(a.n) })),
    },
    agreement: { state: 'unmeasured' as const, note: 'No labels yet. Phase 2 pre-registers a labelled set before any live call.' },
  };
}
