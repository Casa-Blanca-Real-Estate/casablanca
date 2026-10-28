// POST /api/comp-report/turn — one assistant turn, streamed (design §8.3 rule 6).
//
//   body: { reportId, message? }   message is the agent's new text; omit it to
//                                  continue after a tool call
//   reply: text/event-stream of JSON events —
//     email_edit (Hubert's checked edit, for Send) · change (one entry of Hubert's trail, server/hubert-trail.ts)
//     · comps_changed (he changed a comp: the screen reloads them) · start · progress · text · tool · done
//     · refused · interrupted · error
//
// Each request runs any pending tool calls server-side, then makes exactly one
// model call and streams it. When a turn ends in a tool call the browser
// simply asks again. The server owns the transcript: the agent's message, the
// assistant's reply verbatim (thinking blocks and all) and the usage are
// written by this function, append-only.
//
// Netlify's limits, measured in CR-1 (docs/comp-report/cr1-function-limits.md):
// a response that goes 30 s without sending a byte is cut, and every response
// is cut at 60 s. So this sends a keep-alive every 10 s, and at 50 s it stops
// the model call itself and says so, rather than let the platform drop the
// connection mid-sentence. Long turns belong in a background function — the
// CR-4 recommendation.
import Anthropic from '@comp-report/anthropic-sdk';
import {
  ASSISTANT, buildMessages, pendingToolUses, promptFor, runTool, usageTotals,
  type StoredMessage,
} from '../assistant.ts';
import { withActor, type PoolLike, type Queryable } from '../db.ts';
import { editFromResult, type HubertEmailEdit } from '../hubert-email.ts';
import { trailOf, type TrailEntry } from '../hubert-trail.ts';
import type { WebSearcher } from '../web-search.ts';
import { allowMethods, HttpError, readJsonObject, respond, UUID } from '../http.ts';
import { requireUser, type AuthDeps, type SessionUser } from '../session.ts';
import { asUser, requirePool } from './reports.ts';

export interface TurnDeps extends AuthDeps {
  anthropic: () => Anthropic;
  /** Hubert's web search and page reads (server/web-search.ts): without it, he says search isn't available. */
  web?: () => WebSearcher;
  deadlineMs?: number;
  heartbeatMs?: number;
  inFlightSeconds?: number;
}

export function productionAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new HttpError(503, 'assistant_not_configured', 'The assistant has no API key in this environment.');
  return new Anthropic({ apiKey, maxRetries: 1 });
}

const MAX_MESSAGE = 20_000;

/**
 * A turn is answering while the transcript ends in the agent's side of it — a
 * message or tool results — with no reply recorded yet. The reply is written
 * when the model call ends (at most the 50 s deadline, then the write), so a
 * newer message waits rather than take the reply's place. If a function dies
 * before it writes one, the report frees itself after this long.
 */
const IN_FLIGHT_SECONDS = 90;

type Event = Record<string, unknown> & { type: string };

/** Loads the transcript, records the agent's message and any tool results. */
async function prepare(pool: PoolLike, user: SessionUser, reportId: string, message: string | null, inFlightSeconds: number, web?: WebSearcher) {
  return withActor(pool, asUser(user), async (tx) => {
    // The conversation is the owner's; admins can read reports, not talk in them.
    const report = await tx.query('select 1 from comp_report.reports where id = $1 and owner_email = $2 and status <> \'deleted\'', [reportId, user.email]);
    if (!report.rowCount) throw new HttpError(404, 'not_found', 'No such report.');

    const stored: (StoredMessage & { answering?: boolean })[] = (await tx.query<StoredMessage & { answering: boolean }>(
      `select seq, role, content, stop_reason, in_context, prompt_version,
              role = 'user' and created_at > now() - make_interval(secs => $2) as answering
         from comp_report.messages where report_id = $1 order by seq`,
      [reportId, inFlightSeconds],
    )).rows;
    if (stored.at(-1)?.answering) {
      throw new HttpError(409, 'turn_in_progress', 'This report is already answering. Wait for it to finish.');
    }
    let seq = stored.at(-1)?.seq ?? 0;
    // The conversation stays on the prompt and tools it started with (§8.3 rule 5).
    const prompt = promptFor(stored);

    const pending = pendingToolUses(stored.findLast((m) => m.in_context));
    // Hubert's checked edits to the email, for this response to hand to the agent's Send screen.
    const edits: HubertEmailEdit[] = [];
    // And his trail: every change those tools made, for the chat to show at once.
    const changes: TrailEntry[] = [];
    if (pending.length) {
      // §8.3 rule 6: run the pending tool calls server-side first.
      const results = [];
      for (const call of pending) {
        const result = await runTool(tx, reportId, call, prompt, { user, ...(web ? { web } : {}) });
        results.push(result);
        const edit = call.name === 'edit_email' ? editFromResult(result) : null;
        if (edit) edits.push(edit);
        changes.push(...trailOf(call.name, result).changes);
      }
      const content = message ? [...results, { type: 'text', text: message }] : results;
      await insertMessage(tx, reportId, ++seq, 'user', content, { promptVersion: prompt.id });
      stored.push({ seq, role: 'user', content, stop_reason: null, in_context: true });
    } else if (message) {
      const content = [{ type: 'text', text: message }];
      await insertMessage(tx, reportId, ++seq, 'user', content, { promptVersion: prompt.id });
      stored.push({ seq, role: 'user', content, stop_reason: null, in_context: true });
    } else {
      throw new HttpError(400, 'nothing_to_send', 'Send a message.');
    }
    return { messages: buildMessages(stored), nextSeq: seq + 1, prompt, edits, changes };
  });
}

async function insertMessage(
  tx: Queryable, reportId: string, seq: number, role: 'user' | 'assistant', content: unknown,
  extra: { model?: string | null; stopReason?: string | null; requestId?: string | null; inContext?: boolean; promptVersion: string },
) {
  await tx.query(
    `insert into comp_report.messages (report_id, seq, role, content, model, stop_reason, request_id, in_context, prompt_version)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [reportId, seq, role, JSON.stringify(content), extra.model ?? null, extra.stopReason ?? null, extra.requestId ?? null, extra.inContext ?? true, extra.promptVersion],
  );
}

export function handleTurn(req: Request, deps: TurnDeps): Promise<Response> {
  return respond(async () => {
    const started = Date.now();
    allowMethods(req, 'POST');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);

    const body = await readJsonObject(req);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');
    const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : null;
    if (message && message.length > MAX_MESSAGE) throw new HttpError(413, 'message_too_long');

    // Before anything is recorded: without a client (no key here) the agent's message isn't stored unanswered.
    const client = deps.anthropic();
    let prepared;
    try {
      prepared = await prepare(pool, user, reportId, message, deps.inFlightSeconds ?? IN_FLIGHT_SECONDS, deps.web?.());
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new HttpError(409, 'turn_in_progress', 'This report is already answering. Wait for it to finish.');
      }
      throw error;
    }

    const deadline = deps.deadlineMs ?? 50_000;
    const heartbeat = deps.heartbeatMs ?? 10_000;
    const encoder = new TextEncoder();

    // If the browser goes away mid-turn (a reload, a closed tab, a dropped
    // connection), the turn still runs to its end and is recorded: the server
    // owns the transcript, and the agent sees the reply when they come back.
    let clientGone = false;

    const body$ = new ReadableStream<Uint8Array>({
      cancel() {
        clientGone = true;
      },
      async start(controller) {
        let lastWrite = Date.now();
        const write = (chunk: string) => {
          if (clientGone) return;
          try {
            controller.enqueue(encoder.encode(chunk));
            lastWrite = Date.now();
          } catch {
            clientGone = true;
          }
        };
        const emit = (e: Event) => write(`data: ${JSON.stringify(e)}\n\n`);
        // First, before the model's reply: the edits Hubert just made, for Send to apply.
        for (const edit of prepared.edits) emit({ type: 'email_edit', edit });
        for (const entry of prepared.changes) emit({ type: 'change', entry });
        if (prepared.changes.some((c) => c.kind === 'comp')) emit({ type: 'comps_changed' });
        const aborter = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          aborter.abort();
        }, Math.max(1_000, deadline - (Date.now() - started)));
        const keepAlive = setInterval(() => {
          if (Date.now() - lastWrite >= heartbeat - 50) write(': keep-alive\n\n');
        }, Math.min(heartbeat, 5_000));

        const stream = client.beta.messages.stream(
          {
            model: ASSISTANT.model,
            max_tokens: ASSISTANT.maxTokens,
            betas: ASSISTANT.betas,
            fallbacks: 'default',
            thinking: { type: 'adaptive', display: 'updates', block_binding: { prefix_mismatch_behavior: 'error' } },
            output_config: { effort: ASSISTANT.effort },
            system: [{ type: 'text', text: prepared.prompt.system, cache_control: { type: 'ephemeral' } }],
            tools: prepared.prompt.tools,
            tool_choice: { type: 'auto' },
            cache_control: { type: 'ephemeral' },
            messages: prepared.messages,
          },
          { signal: aborter.signal },
        );

        const record = async (m: Anthropic.Beta.BetaMessage | undefined, outcome: 'complete' | 'refused' | 'interrupted') => {
          const content = m?.content ?? [];
          const totals = m ? usageTotals(m.model, m.usage as Parameters<typeof usageTotals>[1]) : null;
          await withActor(pool, asUser(user), async (tx) => {
            await insertMessage(tx, reportId, prepared.nextSeq, 'assistant', content, {
              model: m?.model ?? ASSISTANT.model,
              stopReason: outcome === 'interrupted' ? 'interrupted' : m?.stop_reason ?? null,
              requestId: stream.request_id ?? null,
              inContext: outcome === 'complete',
              promptVersion: prepared.prompt.id,
            });
            if (totals) {
              await tx.query(
                `insert into comp_report.usage (user_email, report_id, provider, model, purpose, request_id,
                   input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, estimated_cost_usd, detail)
                 values ($1, $2, 'anthropic', $3, 'assistant', $4, $5, $6, $7, $8, $9, $10)`,
                [user.email, reportId, m!.model, stream.request_id ?? null, totals.input, totals.output,
                 totals.cacheRead, totals.cacheWrite, totals.costUsd,
                 JSON.stringify({ stop_reason: m!.stop_reason, iterations: (m!.usage as { iterations?: unknown }).iterations ?? null, prompt: prepared.prompt.id })],
              );
            }
          });
          return totals;
        };

        try {
          for await (const event of stream) {
            if (event.type === 'message_start') {
              emit({ type: 'start', model: event.message.model });
            } else if (event.type === 'content_block_start') {
              const block = event.content_block;
              if (block.type === 'tool_use') emit({ type: 'tool', name: block.name });
              if (block.type === 'fallback') emit({ type: 'fallback', from: block.from.model, to: block.to.model });
            } else if (event.type === 'content_block_delta') {
              const d = event.delta;
              if (d.type === 'text_delta') emit({ type: 'text', text: d.text });
              else if (d.type === 'thinking_delta' && d.thinking) emit({ type: 'progress', text: d.thinking });
            }
          }
          const final = await stream.finalMessage();
          if (final.stop_reason === 'refusal') {
            await record(final, 'refused');
            emit({ type: 'refused', category: final.stop_details?.category ?? null });
          } else {
            const totals = await record(final, 'complete');
            emit({ type: 'done', stopReason: final.stop_reason, model: final.model, usage: totals, ms: Date.now() - started });
          }
        } catch (error) {
          const partial = stream.currentMessage;
          if (timedOut || aborter.signal.aborted) {
            await record(partial, 'interrupted').catch((e) => console.error('comp-report turn: record failed', e));
            emit({ type: 'interrupted', reason: 'time_limit', ms: Date.now() - started });
          } else {
            console.error('comp-report turn: model call failed', error);
            await record(partial, 'interrupted').catch(() => undefined);
            const status = error instanceof Anthropic.APIError ? error.status : null;
            emit({ type: 'error', code: status === 429 ? 'rate_limited' : 'model_error', status });
          }
        } finally {
          clearTimeout(timer);
          clearInterval(keepAlive);
          if (!clientGone) {
            try {
              controller.close();
            } catch {
              /* already closed by the other side */
            }
          }
        }
      },
    });

    return new Response(body$, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  });
}
