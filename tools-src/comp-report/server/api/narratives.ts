// The writer's drafts and the agent's emails (CR-5, Dispatch 13; design §9,
// §10.2, §12 narratives).
//
//   /api/comp-report/narratives
//     GET   ?report=<uuid>          the report's drafts, newest first: polled
//                                   while one is written
//     POST  {reportId, action: 'write', length, result, keep?}
//                                   queue a draft. Its input is built here,
//                                   from what's stored — never from the
//                                   browser — and pinned with the row (§8.4:
//                                   the engine runs with no named prices and
//                                   no deal terms). `keep` is the agent's
//                                   edited email, kept as its own row before
//                                   the new draft replaces it. One write at a
//                                   time per report; a daily limit per person
//     POST  {reportId, action: 'copy', parentId, length, result, headline,
//            subject, text, qa, acknowledgments}
//                                   log what the agent copied, with QA's
//                                   results and their answers to them. The
//                                   compliance checks run again here, and a
//                                   hard failure is refused (409)
//
//   /.netlify/functions/comp-report-write-background
//     POST  {reportId, narrativeId} write one draft: claim it (exactly once),
//                                   call the writer with the pinned input,
//                                   check the draft against what the writer
//                                   was given, and record it and its usage
//
// Every request is signed in, and only the report's owner writes or copies;
// the background function checks the session like every other endpoint.
import type Anthropic from '@comp-report/anthropic-sdk';
import type { ResultKind } from '../../engine/index.ts';
import type { EmailLength } from '../../workspace/email.ts';
import { fairHousingFindings } from '../../workspace/fair-housing.ts';
import { DISCLAIMER } from '../../workspace/frame.ts';
import { appraisalFindings, draftChecks, ledgerFromInput, qaRecord, QA_VERSION, type Acknowledgment } from '../../workspace/qa.ts';
import { writerInputFrom, writerInputKey, type WriterInput } from '../../workspace/writer-input.ts';
import { usageTotals } from '../assistant.ts';
import { withActor, type Queryable, type Role } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { neutralNumbers } from '../numbers.ts';
import { requireUser, type AuthDeps, type SessionUser } from '../session.ts';
import { callWriter, CURRENT_WRITER_PROMPT, WRITER_PROMPTS, type WriterDraft } from '../writer.ts';
import { asUser, requirePool } from './reports.ts';
import { guardTestAi } from '../test-user.ts';
import { reportFor } from './workspace.ts';
import { logActivity, logViewed } from '../logs.ts';

const LENGTHS: EmailLength[] = ['full', 'short', 'text'];
const RESULTS: ResultKind[] = ['on_facts', 'with_estimates'];

/** A write claimed or queued this long ago without finishing is taken to have died. */
const ABANDONED_MINUTES = 10;

/** Drafts a person may have written in any 24 hours: each is a model call. */
export function writeLimit(role: Role, env: Record<string, string | undefined> = process.env): number {
  const set = Number(env.CR_WRITES_PER_DAY);
  const agents = Number.isInteger(set) && set > 0 ? set : 40;
  return role === 'admin' ? Math.max(agents, 200) : agents;
}

export interface NarrativeView {
  id: string;
  parentId: string | null;
  origin: 'writer' | 'agent';
  status: 'queued' | 'running' | 'done' | 'failed';
  length: EmailLength;
  result: ResultKind;
  engineVersion: string;
  inputsHash: string;
  promptVersion: string | null;
  model: string | null;
  /** writer: {headlines, sections}; agent: {headline, subject, text}. */
  content: unknown;
  /** A hash of what the writer was given, for the browser to tell whether the draft is still current (writerInputKey). */
  inputKey: string | null;
  progress: number;
  error: string | null;
  errorMessage: string | null;
  qa: unknown;
  acknowledgments: Acknowledgment[];
  copied: boolean;
  createdAt: string;
  finishedAt: string | null;
}

interface Row {
  id: string; parent_id: string | null; origin: NarrativeView['origin']; status: NarrativeView['status']; length: EmailLength;
  result_kind: ResultKind; engine_version: string; inputs_hash: string; prompt_version: string | null; model: string | null;
  content: unknown; input: WriterInput | null; progress: number; error: string | null; error_message: string | null; qa: unknown;
  acknowledgments: Acknowledgment[]; copied: boolean; created_at: Date; finished_at: Date | null;
}

const view = (r: Row): NarrativeView => ({
  id: r.id, parentId: r.parent_id, origin: r.origin, status: r.status, length: r.length, result: r.result_kind,
  engineVersion: r.engine_version, inputsHash: r.inputs_hash, promptVersion: r.prompt_version, model: r.model,
  content: r.content, inputKey: r.input ? writerInputKey(r.input) : null, progress: r.progress, error: r.error, errorMessage: r.error_message, qa: r.qa,
  acknowledgments: r.acknowledgments ?? [], copied: r.copied, createdAt: new Date(r.created_at).toISOString(),
  finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
});

/** The report's drafts, newest first: its writer drafts and the agent's emails. */
export async function loadNarratives(tx: Queryable, reportId: string, limit = 30): Promise<NarrativeView[]> {
  const { rows } = await tx.query<Row>(
    `select id, parent_id, origin, status, length, result_kind, engine_version, inputs_hash, prompt_version, model,
            content, input, progress, error, error_message, qa, acknowledgments, copied, created_at, finished_at
       from comp_report.narratives where report_id = $1 order by created_at desc, id limit $2`,
    [reportId, limit],
  );
  return rows.map(view);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function acknowledgmentsFrom(v: unknown): Acknowledgment[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 100) throw new HttpError(400, 'bad_acknowledgments', 'Send the acknowledgments as a list.');
  return v.map((a) => {
    if (!isObject(a) || typeof a.key !== 'string' || a.key.length > 300 || (a.how !== 'attributed' && a.how !== 'acknowledged')
      || typeof a.text !== 'string' || a.text.length > 300 || typeof a.at !== 'string' || a.at.length > 40) {
      throw new HttpError(400, 'bad_acknowledgments', 'An acknowledgment has a key, how, the text and when.');
    }
    return { key: a.key, how: a.how, text: a.text, at: a.at };
  });
}

/** The agent's email as sent in a request: its headline, subject and text. */
function emailFrom(body: Record<string, unknown>) {
  const headline = typeof body.headline === 'string' ? body.headline.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject : '';
  const text = typeof body.text === 'string' ? body.text : '';
  if (headline.length > 1_000 || subject.length > 500 || text.length > 60_000) throw new HttpError(413, 'too_large', 'The email is too long.');
  return { headline, subject, text };
}

/**
 * The checks no answer can clear (§9.3, D-2), run here on what's copied: the
 * headline, appraisal language, the fair-housing list's terms, the disclaimer.
 */
function complianceFailures(email: { headline: string; subject: string; text: string }): string[] {
  const all = `${email.subject}\n${email.text}`;
  const fails: string[] = [];
  if (!email.headline) fails.push('headline');
  if (appraisalFindings(all).length) fails.push('appraisal');
  if (fairHousingFindings(all.split(DISCLAIMER).join(' ')).some((f) => f.level === 'hard')) fails.push('fair_housing');
  if (!email.text.includes(DISCLAIMER)) fails.push('disclaimer');
  return fails;
}

export function handleNarratives(req: Request, deps: AuthDeps & { env?: Record<string, string | undefined> }): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'POST');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);

    if (req.method === 'GET') {
      const reportId = new URL(req.url).searchParams.get('report') ?? '';
      if (!UUID.test(reportId)) throw new HttpError(400, 'bad_report', 'Which report?');
      const { report, narratives } = await withActor(pool, asUser(user), async (tx) => ({
        report: await reportFor(tx, user, reportId, false),
        narratives: await loadNarratives(tx, reportId),
      }));
      await logViewed(pool, user, report);
      return json({ narratives });
    }

    const body = await readJsonObject(req, 160 * 1024);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');
    const length = LENGTHS.find((l) => l === body.length);
    if (!length) throw new HttpError(400, 'bad_length', 'Full, short or a text message?');
    const result = RESULTS.find((r) => r === body.result);
    if (!result) throw new HttpError(400, 'bad_result', 'Which result: on the facts, or with your estimates?');
    if (body.action !== 'write' && body.action !== 'copy') throw new HttpError(400, 'bad_action', 'Write a draft, or log a copy.');
    const keep = body.action === 'write' && body.keep !== undefined ? body.keep : null;
    if (keep !== null && !isObject(keep)) throw new HttpError(400, 'bad_keep', 'The edited email is an object.');
    const parentIn = body.action === 'copy' ? body.parentId : keep?.parentId;
    if (parentIn !== undefined && parentIn !== null && (typeof parentIn !== 'string' || !UUID.test(parentIn))) {
      throw new HttpError(400, 'bad_parent', 'Which draft did it come from?');
    }
    const parentId = typeof parentIn === 'string' ? parentIn : null;

    const done = await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      const n = await neutralNumbers(tx, reportId);
      if (!n) throw new HttpError(404, 'not_found', 'No such report.');
      if (!n.revealed) throw new HttpError(409, 'not_revealed', 'The email quotes what the comps say: give your number on Findings first.');
      if (parentId) {
        const parent = await tx.query('select 1 from comp_report.narratives where id = $1 and report_id = $2', [parentId, reportId]);
        if (!parent.rowCount) throw new HttpError(400, 'bad_parent', 'That draft isn’t this report’s.');
      }
      const facts = n.output.headline_facts[result];
      const pinned = [n.output.meta.engine_version, n.output.meta.house_method.hash, n.output.meta.inputs_hash, JSON.stringify(facts)];

      /** The agent's own email, finished as it's recorded: a fork of the draft it came from. */
      const recordAgent = async (email: { headline: string; subject: string; text: string }, extra: { qa: unknown; acks: Acknowledgment[]; copied: boolean }) => {
        const { rows } = await tx.query<Row>(
          `insert into comp_report.narratives
             (report_id, parent_id, origin, status, length, result_kind, audience, engine_version, house_method, inputs_hash,
              headline_facts, content, qa, acknowledgments, copied)
           values ($1, $2, 'agent', 'done', $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13)
           returning *`,
          [reportId, parentId, length, result, n.brief.audience?.value ?? null, ...pinned, JSON.stringify(email),
            JSON.stringify(extra.qa), JSON.stringify(extra.acks), extra.copied],
        );
        return view(rows[0]!);
      };

      if (body.action === 'copy') {
        const email = emailFrom(body);
        const acks = acknowledgmentsFrom(body.acknowledgments);
        const fails = complianceFailures(email);
        if (fails.length) {
          throw new HttpError(409, 'hard_failure', `It can’t be copied yet: ${fails.join(', ')}. Fix what QA found first.`);
        }
        if (body.qa !== undefined && (!isObject(body.qa) || JSON.stringify(body.qa).length > 64 * 1024)) {
          throw new HttpError(400, 'bad_qa', 'Send QA’s results as an object.');
        }
        // The browser's full checks, as the agent saw them, and this server's own compliance verdict.
        const qa = { browser: body.qa ?? null, server: { version: QA_VERSION, compliance: 'pass' } };
        return { narrative: await recordAgent(email, { qa, acks, copied: true }) };
      }

      // A write: first, an edited email the new draft will replace is kept.
      let kept: NarrativeView | null = null;
      if (keep) kept = await recordAgent(emailFrom(keep), { qa: null, acks: acknowledgmentsFrom(keep.acknowledgments), copied: false });

      await tx.query(`select pg_advisory_xact_lock(hashtext('comp_report.narratives:' || $1))`, [user.email]);
      await tx.query(
        `update comp_report.narratives
            set status = 'failed', finished_at = now(), error = 'abandoned', error_message = 'This draft was never finished.'
          where report_id = $1 and origin = 'writer'
            and ((status = 'queued' and created_at < now() - make_interval(mins => $2))
              or (status = 'running' and started_at < now() - make_interval(mins => $2)))`,
        [reportId, ABANDONED_MINUTES],
      );
      const inFlight = (await tx.query<{ id: string }>(
        `select id from comp_report.narratives where report_id = $1 and origin = 'writer' and status in ('queued', 'running')`,
        [reportId],
      )).rows[0];
      if (inFlight) throw new HttpError(409, 'write_in_progress', `A draft is being written (${inFlight.id}). Wait for it to finish.`);
      const limit = writeLimit(user.role, deps.env);
      const used = Number((await tx.query<{ n: string }>(
        `select count(*) as n from comp_report.narratives where origin = 'writer' and created_by = $1 and created_at > now() - interval '24 hours'`,
        [user.email],
      )).rows[0]?.n ?? 0);
      if (used >= limit) throw new HttpError(429, 'write_limit', `You’ve reached today’s limit of ${limit} drafts. The template is still yours to edit.`);

      const input = writerInputFrom({ output: n.output, comps: n.comps, intake: n.state.intake, brief: n.brief, send: n.state.send ?? {}, result, length });
      const { rows } = await tx.query<Row>(
        `insert into comp_report.narratives
           (report_id, origin, status, length, result_kind, audience, engine_version, house_method, inputs_hash, headline_facts, input, prompt_version)
         values ($1, 'writer', 'queued', $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
         returning *`,
        [reportId, length, result, n.brief.audience?.value ?? null, ...pinned, JSON.stringify(input), CURRENT_WRITER_PROMPT.id],
      );
      return { narrative: view(rows[0]!), kept, limit: { perDay: limit, left: Math.max(limit - used - 1, 0) } };
    });
    if (body.action === 'copy') await logActivity(pool, user.email, { name: 'narrative.copied', reportId, detail: { length } });
    return json(done, body.action === 'copy' ? 201 : 202);
  });
}

// ─── The background write ───────────────────────────────────────────────────

export interface WriteDeps extends AuthDeps {
  /** The client for this user's calls: the test user's uses the eval key (server/test-user.ts). */
  anthropic: (user: SessionUser) => Anthropic;
  /** How often the draft's progress is saved while it streams. */
  progressEveryMs?: number;
}

/** Everything the writer wrote, as one text: what QA checks as the draft lands. */
export function draftText(d: WriterDraft): string {
  return [
    ...d.headlines,
    d.sections.chosen,
    ...d.sections.comps.flatMap((c) => c.lines),
    ...d.sections.consider,
    d.sections.nextStep,
  ].filter(Boolean).join('\n');
}

/** One draft, start to finish. Awaited in tests and in local dev; in production it runs in a background function. */
export function runWrite(req: Request, deps: WriteDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST');
    const user: SessionUser = await requireUser(req, deps);
    const pool = requirePool(deps);
    const body = await readJsonObject(req);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    const narrativeId = typeof body.narrativeId === 'string' && UUID.test(body.narrativeId) ? body.narrativeId : null;
    if (!reportId || !narrativeId) throw new HttpError(400, 'bad_narrative', 'Which draft?');
    // The test user's write: the eval key and the day's budget, before the draft is claimed.
    await guardTestAi(pool, user, deps.env);

    // Claim it: queued, or running so long it must have died. Exactly one caller wins.
    const claimed = await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      const { rows } = await tx.query<{ input: WriterInput; prompt_version: string | null }>(
        `update comp_report.narratives
            set status = 'running', attempts = attempts + 1, started_at = now(), progress = 0
          where id = $1 and report_id = $2 and origin = 'writer'
            and (status = 'queued' or (status = 'running' and started_at < now() - make_interval(mins => $3)))
          returning input, prompt_version`,
        [narrativeId, reportId, ABANDONED_MINUTES],
      );
      return rows[0] ?? null;
    });
    if (!claimed) return json({ narrative: narrativeId, started: false });

    const finish = (fields: {
      status: 'done' | 'failed'; content?: unknown; model?: string | null; requestId?: string | null; stopReason?: string | null;
      error?: string | null; errorMessage?: string | null; qa?: unknown; progress?: number;
    }) => (tx: Queryable) => tx.query(
      `update comp_report.narratives
          set status = $2, finished_at = now(), content = $3::jsonb, model = $4, request_id = $5, stop_reason = $6,
              error = $7, error_message = $8, qa = $9::jsonb, progress = coalesce($10, progress)
        where id = $1 and status = 'running'`,
      [narrativeId, fields.status, fields.content === undefined ? null : JSON.stringify(fields.content), fields.model ?? null,
        fields.requestId ?? null, fields.stopReason ?? null, fields.error ?? null, fields.errorMessage?.slice(0, 500) ?? null,
        fields.qa === undefined ? null : JSON.stringify(fields.qa), fields.progress ?? null],
    );

    let client: Anthropic;
    try {
      client = deps.anthropic(user);
    } catch {
      await withActor(pool, asUser(user), finish({ status: 'failed', error: 'not_configured', errorMessage: 'The writer isn’t set up here.' }));
      return json({ narrative: narrativeId, started: true, status: 'failed' });
    }

    // Progress, saved every so often while the draft streams, one save at a time.
    const every = deps.progressEveryMs ?? 1_500;
    let saved = 0;
    let saving: Promise<unknown> = Promise.resolve();
    const onProgress = (chars: number) => {
      if (Date.now() - saved < every) return;
      saved = Date.now();
      saving = saving.then(() => withActor(pool, asUser(user), (tx) => tx.query(
        `update comp_report.narratives set progress = $2 where id = $1 and status = 'running'`, [narrativeId, chars],
      ))).catch(() => undefined);
    };

    const prompt = (claimed.prompt_version && WRITER_PROMPTS[claimed.prompt_version]) || CURRENT_WRITER_PROMPT;
    const outcome = await callWriter(client, claimed.input, { prompt, onProgress });
    await saving;

    let status: 'done' | 'failed';
    await withActor(pool, asUser(user), async (tx) => {
      if (outcome.ok) {
        // The draft as it lands, against what the writer was given: its own numbers, range language and compliance.
        const checks = draftChecks({
          text: draftText(outcome.draft), headline: outcome.draft.headlines[0], ledger: ledgerFromInput(claimed.input), sample: false, contentOnly: true,
        });
        status = 'done';
        await finish({
          status, content: outcome.draft, model: outcome.model, requestId: outcome.requestId, stopReason: outcome.stopReason,
          qa: qaRecord(checks), progress: outcome.raw.length,
        })(tx);
      } else {
        status = 'failed';
        await finish({
          status, model: outcome.model, requestId: outcome.requestId, stopReason: outcome.stopReason, error: outcome.reason, errorMessage: outcome.message,
        })(tx);
      }
      if (outcome.usage && outcome.model) {
        const totals = usageTotals(outcome.model, outcome.usage as Parameters<typeof usageTotals>[1]);
        await tx.query(
          `insert into comp_report.usage (user_email, report_id, provider, model, purpose, request_id,
             input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, estimated_cost_usd, detail)
           values ($1, $2, 'anthropic', $3, 'writer', $4, $5, $6, $7, $8, $9, $10)`,
          [user.email, reportId, outcome.model, outcome.requestId, totals.input, totals.output, totals.cacheRead, totals.cacheWrite, totals.costUsd,
            JSON.stringify({
              narrative: narrativeId, prompt: prompt.id, stop_reason: outcome.stopReason, outcome: outcome.ok ? 'done' : outcome.reason,
              iterations: (outcome.usage as { iterations?: unknown }).iterations ?? null,
            })],
        );
      }
    });
    return json({ narrative: narrativeId, started: true, status: status! });
  });
}
