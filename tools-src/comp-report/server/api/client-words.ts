// POST /api/comp-report/client-words — Hubert on the client's words, on Send's
// client step (Dispatch 26; server/client-words.ts).
//
//   body: {reportId, target: 'overview' | <reportCompId>, job: 'feedback' | 'draft', result?, asks?, practice?}
//   reply: {workspace, round, dropped}
//
// What the model reads is built here, from what's stored — the browser saves
// the agent's words first — never from the request: the writer's input
// (writer-input.ts: no agent number, no target, no deal terms, no client
// note), with the comp's Sort note, Hubert's take from Sort, and for feedback
// the agent's overview or paragraph as saved.
//
// The human drives (D-29): feedback needs the agent's words; a practice
// agent's draft (the writer's version) is refused until a feedback round on
// that step is stored. `practice` lets an admin viewing as a new agent ask as
// one: it can only make the rule stricter. The overview has feedback only: its
// draft is Send's "Draft from notes" (api/lines.ts), held to the same rule.
// Each round is appended (server/reviews.ts) and its usage logged. Only the
// report's owner asks, after the reveal, within the daily review limit.
import type Anthropic from '@comp-report/anthropic-sdk';
import type { ResultKind } from '../../engine/index.ts';
import {
  clientCompInput, clientOverviewInput, cleanClientRounds, latestRound, MAX_CLIENT_ASKED, OVERVIEW, versionUnlocked,
  type ClientRound, type ClientRoundKind,
} from '../../workspace/client-words.ts';
import { answerResult } from '../../workspace/reading.ts';
import { writerInputFrom } from '../../workspace/writer-input.ts';
import { usageTotals } from '../assistant.ts';
import { agentWords, callClientWords, type ClientWordsInput } from '../client-words.ts';
import { withActor } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { neutralNumbers } from '../numbers.ts';
import { appendClientRounds, reviewLimit } from '../reviews.ts';
import { requireUser, type AuthDeps, type SessionUser } from '../session.ts';
import { asUser, requirePool } from './reports.ts';
import { guardTestAi } from '../test-user.ts';
import { loadWorkspace, reportFor } from './workspace.ts';

export interface ClientWordsDeps extends AuthDeps {
  /** The client for this user's calls: the test user's uses the eval key (server/test-user.ts). */
  anthropic: (user: SessionUser) => Anthropic;
  env?: Record<string, string | undefined>;
}

const JOBS: ClientRoundKind[] = ['feedback', 'draft'];
const RESULTS: ResultKind[] = ['on_facts', 'with_estimates'];

export function handleClientWords(req: Request, deps: ClientWordsDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);
    const body = await readJsonObject(req);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');
    const target = body.target === OVERVIEW ? OVERVIEW : typeof body.target === 'string' && UUID.test(body.target) ? body.target : null;
    if (!target) throw new HttpError(400, 'bad_target', 'The overview, or which comp?');
    const job = JOBS.find((j) => j === body.job);
    if (!job) throw new HttpError(400, 'bad_job', 'Feedback on your words, or Hubert’s version?');
    if (job === 'draft' && target === OVERVIEW) throw new HttpError(400, 'bad_job', 'The overview drafts from your notes: use Draft from notes.');
    if (body.asks !== undefined && body.asks !== null && (typeof body.asks !== 'string' || body.asks.length > MAX_CLIENT_ASKED)) {
      throw new HttpError(400, 'bad_asks', `Keep what you tell Hubert under ${MAX_CLIENT_ASKED} characters.`);
    }
    const asks = job === 'draft' && typeof body.asks === 'string' ? body.asks.trim() || null : null;
    const asked = RESULTS.find((r) => r === body.result);
    const level = user.capability === 'practice' || body.practice === true ? 'practice' : 'full';

    const prepared = await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      const n = await neutralNumbers(tx, reportId);
      if (!n) throw new HttpError(404, 'not_found', 'No such report.');
      if (!n.revealed) throw new HttpError(409, 'not_revealed', 'The client’s words come after your number on Findings.');
      const rounds = cleanClientRounds(n.state.clientRounds?.[target]);
      if (job === 'draft' && !versionUnlocked(rounds, level)) {
        throw new HttpError(409, 'feedback_first', 'Get Hubert’s feedback on yours first: his version shows after that.');
      }
      const limit = reviewLimit(user.role, deps.env);
      const used = Number((await tx.query<{ n: string }>(
        `select count(*) as n from comp_report.usage where user_email = $1 and purpose = 'client_words' and created_at > now() - interval '24 hours'`,
        [user.email],
      )).rows[0]?.n ?? 0);
      if (used >= limit) throw new HttpError(429, 'client_words_limit', `You’ve reached today’s limit of ${limit}. Your words are still yours to write.`);

      const send = n.state.send ?? {};
      const result = asked ?? send.result ?? answerResult(n.output);
      const report = writerInputFrom({ output: n.output, comps: n.comps, intake: n.state.intake, brief: n.brief, send, result, length: 'full' });
      let w: ClientWordsInput;
      if (target === OVERVIEW) {
        w = { job: 'feedback', target: 'overview', input: clientOverviewInput(report, send) };
      } else {
        const comp = n.comps.find((c) => c.judgment?.reportCompId === target);
        if (!comp?.judgment || comp.judgment.removedAt) throw new HttpError(404, 'not_found', 'No such comp in this report.');
        const paragraph = comp.judgment.clientLine?.text ?? '';
        const input = clientCompInput({ report, comp, job, paragraph, asks, lastDraft: latestRound(rounds, 'draft')?.text ?? null });
        if (!input) throw new HttpError(409, 'not_in_email', 'That comp isn’t in the email: it doesn’t count in this result.');
        w = job === 'draft' ? { job, target: 'comp', input } : { job, target: 'comp', input };
      }
      if (job === 'feedback' && !agentWords(w).trim()) {
        throw new HttpError(409, 'nothing_written', target === OVERVIEW ? 'Write your headline and how you chose the comps first.' : 'Write your paragraph first: Hubert gives feedback on your words.');
      }
      return { w, wrote: job === 'feedback' ? agentWords(w) : null };
    });

    await guardTestAi(pool, user, deps.env);
    const outcome = await callClientWords(deps.anthropic(user), prepared.w);

    if (outcome.usage && outcome.model) {
      const totals = usageTotals(outcome.model, outcome.usage as Parameters<typeof usageTotals>[1]);
      await withActor(pool, asUser(user), (tx) => tx.query(
        `insert into comp_report.usage (user_email, report_id, provider, model, purpose, request_id,
             input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, estimated_cost_usd, detail)
           values ($1, $2, 'anthropic', $3, 'client_words', $4, $5, $6, $7, $8, $9, $10)`,
        [user.email, reportId, outcome.model, outcome.requestId, totals.input, totals.output, totals.cacheRead, totals.cacheWrite, totals.costUsd,
          JSON.stringify({
            job, target: target === OVERVIEW ? OVERVIEW : 'comp', report_comp_id: target === OVERVIEW ? null : target, prompt: outcome.promptId, level,
            outcome: outcome.ok ? 'done' : outcome.code, dropped: outcome.ok ? outcome.result.dropped : 0,
            iterations: (outcome.usage as { iterations?: unknown }).iterations ?? null,
          })],
      ));
    }
    if (!outcome.ok) throw new HttpError(outcome.status, outcome.code, outcome.message);
    const round: ClientRound = {
      at: new Date().toISOString(), kind: job, text: outcome.result.text, by: user.email,
      ...(prepared.wrote !== null ? { wrote: prepared.wrote } : {}),
      ...(asks ? { asked: asks } : {}),
    };
    return json(await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      await appendClientRounds(tx, reportId, target, [round]);
      return { workspace: await loadWorkspace(tx, user, reportId), round, dropped: outcome.result.dropped };
    }));
  });
}
