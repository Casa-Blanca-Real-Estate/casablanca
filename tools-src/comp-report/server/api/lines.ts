// POST /api/comp-report/lines — the agent's lines on Send, drafted or tidied
// (server/lines.ts; dev note dn_mviipah6rs3v).
//
//   body: {reportId, job: 'draft' | 'rewrite', result?, practice?}
//   reply: {lines: {chosen?, consider?, nextStep?}, dropped: [...]}
//
// What the model reads is built here, from what's stored — the browser saves
// the agent's lines first — never from the request: a draft reads the
// writer's input (writer-input.ts: no agent number, no target, no deal terms,
// no client note), a rewrite only the agent's own lines. Nothing is saved: the
// browser offers the lines, and the agent keeps or undoes them. Only the
// report's owner asks, after the reveal, within the writer's daily limit
// (counted apart from the drafts), and every call's usage is logged.
//
// The lines are the overview of the client step (Dispatch 26), so a practice
// agent writes them first: a draft is refused until Hubert has given feedback
// on their overview (api/client-words.ts). Tidying their own words isn't.
import type Anthropic from '@comp-report/anthropic-sdk';
import type { ResultKind } from '../../engine/index.ts';
import { cleanClientRounds, OVERVIEW, versionUnlocked } from '../../workspace/client-words.ts';
import { answerResult } from '../../workspace/reading.ts';
import { writerInputFrom } from '../../workspace/writer-input.ts';
import { usageTotals } from '../assistant.ts';
import { withActor } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { callLines, LINE_KEYS, type AgentLines, type LinesInput, type LinesJob } from '../lines.ts';
import { neutralNumbers } from '../numbers.ts';
import { requireUser, type AuthDeps, type SessionUser } from '../session.ts';
import { writeLimit } from './narratives.ts';
import { asUser, requirePool } from './reports.ts';
import { guardTestAi } from '../test-user.ts';
import { reportFor } from './workspace.ts';

export interface LinesDeps extends AuthDeps {
  /** The client for this user's calls: the test user's uses the eval key (server/test-user.ts). */
  anthropic: (user: SessionUser) => Anthropic;
  env?: Record<string, string | undefined>;
}

const JOBS: LinesJob[] = ['draft', 'rewrite'];
const RESULTS: ResultKind[] = ['on_facts', 'with_estimates'];

export function handleLines(req: Request, deps: LinesDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);
    const body = await readJsonObject(req);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');
    const job = JOBS.find((j) => j === body.job);
    if (!job) throw new HttpError(400, 'bad_job', 'Draft your lines, or tidy them?');
    const asked = RESULTS.find((r) => r === body.result);
    const level = user.capability === 'practice' || body.practice === true ? 'practice' : 'full';

    const prepared = await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      const n = await neutralNumbers(tx, reportId);
      if (!n) throw new HttpError(404, 'not_found', 'No such report.');
      if (!n.revealed) throw new HttpError(409, 'not_revealed', 'Your lines come after your number on Findings.');
      const limit = writeLimit(user.role, deps.env);
      const used = Number((await tx.query<{ n: string }>(
        `select count(*) as n from comp_report.usage where user_email = $1 and purpose = 'lines' and created_at > now() - interval '24 hours'`,
        [user.email],
      )).rows[0]?.n ?? 0);
      if (used >= limit) throw new HttpError(429, 'lines_limit', `You’ve reached today’s limit of ${limit}. Your lines are still yours to edit.`);

      const send = n.state.send ?? {};
      const current: AgentLines = { chosen: send.chosen?.value ?? '', consider: send.consider?.value ?? '', nextStep: send.nextStep?.value ?? '' };
      const written = LINE_KEYS.filter((k) => current[k].trim());
      if (job === 'draft' && written.length === LINE_KEYS.length) throw new HttpError(409, 'nothing_to_draft', 'Every line is already yours. Tidy them instead.');
      if (job === 'draft' && !versionUnlocked(cleanClientRounds(n.state.clientRounds?.[OVERVIEW]), level)) {
        throw new HttpError(409, 'feedback_first', 'Write your overview and get Hubert’s feedback on it first: drafting from your notes opens after that.');
      }
      if (job === 'rewrite' && !written.length) throw new HttpError(409, 'nothing_to_tidy', 'Write a line first, or draft them from your notes.');

      const report = writerInputFrom({ output: n.output, comps: n.comps, intake: n.state.intake, brief: n.brief, send, result: asked ?? answerResult(n.output), length: 'full' });
      const input: LinesInput = job === 'draft'
        ? { job, report }
        : { job, report: { home: report.home.name, audience: report.audience, lines: { chosen: current.chosen, consider: current.consider, next_step: current.nextStep } } };
      return { input, current };
    });

    await guardTestAi(pool, user, deps.env);
    const outcome = await callLines(deps.anthropic(user), prepared.input, prepared.current);

    if (outcome.usage && outcome.model) {
      const totals = usageTotals(outcome.model, outcome.usage as Parameters<typeof usageTotals>[1]);
      await withActor(pool, asUser(user), (tx) => tx.query(
        `insert into comp_report.usage (user_email, report_id, provider, model, purpose, request_id,
           input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, estimated_cost_usd, detail)
         values ($1, $2, 'anthropic', $3, 'lines', $4, $5, $6, $7, $8, $9, $10)`,
        [user.email, reportId, outcome.model, outcome.requestId, totals.input, totals.output, totals.cacheRead, totals.cacheWrite, totals.costUsd,
          JSON.stringify({
            job, prompt: outcome.promptId, outcome: outcome.ok ? 'done' : outcome.code,
            offered: outcome.ok ? Object.keys(outcome.result.lines) : [], dropped: outcome.ok ? outcome.result.dropped : [],
            iterations: (outcome.usage as { iterations?: unknown }).iterations ?? null,
          })],
      ));
    }
    if (!outcome.ok) throw new HttpError(outcome.status, outcome.code, outcome.message);
    return json(outcome.result);
  });
}
