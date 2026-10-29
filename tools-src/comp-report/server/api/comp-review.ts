// POST /api/comp-report/comp-review — Hubert on one comp, on Sort's review flow
// (Dispatch 25; server/comp-review.ts).
//
//   body: {reportId, reportCompId, job: 'feedback' | 'take', asks?, practice?}
//   reply: {workspace, entry, dropped}
//
// What the model reads is built here, from what's stored (workspace/review.ts):
// the comp, the home and the engine's measurements, from an engine run with no
// named prices and no deal terms (server/numbers.ts), and for feedback the
// agent's note and tags as saved. Never the call, the target or the tier (D-4).
//
// The human drives (D-29): feedback needs the agent's note (and, practising,
// their tags: NB-8); a practice agent's take is refused until a feedback round
// on the comp is stored. `practice` lets an admin viewing as a new agent ask as
// one: it can only make the rule stricter. Each round is appended to the
// comp's review (server/reviews.ts) and its usage logged. Only the report's
// owner asks, within the daily review limit.
import type Anthropic from '@comp-report/anthropic-sdk';
import { latest, MAX_ASKED, reviewInput, type ReviewEntry, type ReviewKind } from '../../workspace/review.ts';
import { usageTotals } from '../assistant.ts';
import { callReview } from '../comp-review.ts';
import { withActor } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { neutralNumbers } from '../numbers.ts';
import { appendReview, reviewLimit } from '../reviews.ts';
import { requireUser, type AuthDeps, type SessionUser } from '../session.ts';
import { asUser, requirePool } from './reports.ts';
import { guardTestAi } from '../test-user.ts';
import { loadWorkspace, reportFor } from './workspace.ts';

export interface CompReviewDeps extends AuthDeps {
  /** The client for this user's calls: the test user's uses the eval key (server/test-user.ts). */
  anthropic: (user: SessionUser) => Anthropic;
  env?: Record<string, string | undefined>;
}

const JOBS: ReviewKind[] = ['feedback', 'take'];

export function handleCompReview(req: Request, deps: CompReviewDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);
    const body = await readJsonObject(req);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');
    const reportCompId = typeof body.reportCompId === 'string' && UUID.test(body.reportCompId) ? body.reportCompId : null;
    if (!reportCompId) throw new HttpError(400, 'bad_comp', 'Which comp?');
    const job = JOBS.find((j) => j === body.job);
    if (!job) throw new HttpError(400, 'bad_job', 'Feedback on your reasoning, or Hubert’s take?');
    if (body.asks !== undefined && body.asks !== null && (typeof body.asks !== 'string' || body.asks.length > MAX_ASKED)) {
      throw new HttpError(400, 'bad_asks', `Keep what you tell Hubert under ${MAX_ASKED} characters.`);
    }
    const asks = job === 'take' && typeof body.asks === 'string' ? body.asks.trim() || null : null;
    const level = user.capability === 'practice' || body.practice === true ? 'practice' : 'full';

    const prepared = await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      const n = await neutralNumbers(tx, reportId);
      if (!n) throw new HttpError(404, 'not_found', 'No such report.');
      const comp = n.comps.find((c) => c.judgment?.reportCompId === reportCompId);
      if (!comp?.judgment || comp.judgment.removedAt) throw new HttpError(404, 'not_found', 'No such comp in this report.');
      if (comp.unsortable) throw new HttpError(409, 'unsortable', comp.unsortable);
      const j = comp.judgment;
      const note = j.note?.trim() ?? '';
      if (job === 'feedback') {
        if (!note) throw new HttpError(409, 'no_note', 'Write why it’s a comp first: Hubert gives feedback on your reasoning.');
        if (level === 'practice' && !(j.tags ?? []).length) throw new HttpError(409, 'no_tags', 'Pick its tags too: Hubert reviews your note and tags together.');
      }
      if (job === 'take' && level === 'practice' && !latest(j.review, 'feedback')) {
        throw new HttpError(409, 'feedback_first', 'Get Hubert’s feedback on your reasoning first: his take shows after that.');
      }
      const limit = reviewLimit(user.role, deps.env);
      const used = Number((await tx.query<{ n: string }>(
        `select count(*) as n from comp_report.usage where user_email = $1 and purpose = 'comp_review' and created_at > now() - interval '24 hours'`,
        [user.email],
      )).rows[0]?.n ?? 0);
      if (used >= limit) throw new HttpError(429, 'review_limit', `You’ve reached today’s limit of ${limit} reviews. Your note and tier are still yours to set.`);
      const input = reviewInput({ output: n.output, comp, intake: n.state.intake, propertyType: n.propertyType, job, asks });
      return { input, note: note || null, tags: j.tags ?? [] };
    });

    await guardTestAi(pool, user, deps.env);
    const outcome = await callReview(deps.anthropic(user), job, prepared.input);

    if (outcome.usage && outcome.model) {
      const totals = usageTotals(outcome.model, outcome.usage as Parameters<typeof usageTotals>[1]);
      await withActor(pool, asUser(user), (tx) => tx.query(
        `insert into comp_report.usage (user_email, report_id, provider, model, purpose, request_id,
             input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, estimated_cost_usd, detail)
           values ($1, $2, 'anthropic', $3, 'comp_review', $4, $5, $6, $7, $8, $9, $10)`,
          [user.email, reportId, outcome.model, outcome.requestId, totals.input, totals.output, totals.cacheRead, totals.cacheWrite, totals.costUsd,
            JSON.stringify({
              job, prompt: outcome.promptId, report_comp_id: reportCompId, level, outcome: outcome.ok ? 'done' : outcome.code,
              dropped: outcome.ok ? outcome.result.dropped : 0, weak: outcome.ok ? Boolean(outcome.result.weak) : null,
              iterations: (outcome.usage as { iterations?: unknown }).iterations ?? null,
            })],
      ));
    }
    if (!outcome.ok) throw new HttpError(outcome.status, outcome.code, outcome.message);
    const r = outcome.result;
    const entry: ReviewEntry = {
      at: new Date().toISOString(), kind: job, text: r.text, weak: r.weak, by: user.email,
      ...(job === 'feedback' ? { note: prepared.note, tags: prepared.tags } : { tier: r.tier ?? null, ...(r.tierWhy ? { tierWhy: r.tierWhy } : {}), ...(asks ? { asked: asks } : {}) }),
    };
    return json(await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      await appendReview(tx, reportId, reportCompId, [entry]);
      return { workspace: await loadWorkspace(tx, user, reportId), entry, dropped: r.dropped };
    }));
  });
}
