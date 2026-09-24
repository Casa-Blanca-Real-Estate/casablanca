// TEMPORARY — CR-1 time-limit probe: one deliberately long, tool-using Claude
// Opus 5.5 turn, streamed through a Netlify function (Dispatch 05 §6, design
// §8.8). Emits a compact timeline — block starts and stops, a per-second
// progress count, and the final stop reason and usage — rather than the text.
// A heartbeat every second keeps the connection from reading as idle, so any
// cutoff it hits is the execution limit, not an idle timeout. Removed once
// measured; the real streaming path is built from what this shows.
import Anthropic from '@comp-report/anthropic-sdk';
import { notFound, numberParam, probeAllowed, sseResponse, type ProbeContext } from '../../tools-src/comp-report/server/probe.ts';

const MODEL = 'claude-opus-5-5';

const SYSTEM =
  'You are helping test a streaming pipeline for a real estate tool. Follow the ' +
  "user's instructions exactly and write the full requested length.";

const TASK =
  'Write a thorough, well-structured explainer - about 4,000 words, in 12 sections with ' +
  'headings - on how a comparative market analysis for a New York City condo is built: ' +
  'choosing comparable sales, keeping sold, in-contract and active listings as separate ' +
  'evidence, price per square foot, adjustments, and presenting a range rather than a single ' +
  'number. When you have finished writing the whole explainer, call the record_outline tool ' +
  'with your section headings.';

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: 'record_outline',
    description: "Record the explainer's section headings, once the explainer is written.",
    input_schema: {
      type: 'object',
      properties: { headings: { type: 'array', items: { type: 'string' } } },
      required: ['headings'],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
];

type Effort = 'low' | 'medium' | 'high';

export default async (req: Request, context: ProbeContext) => {
  if (!probeAllowed(req, context)) return notFound();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY is not set in this context' }, { status: 503 });

  const maxTokens = numberParam(req, 'max', 20000, 1000, 32000);
  const effortParam = new URL(req.url).searchParams.get('effort');
  const effort: Effort = effortParam === 'low' || effortParam === 'medium' ? effortParam : 'high';

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  return sseResponse(async (emit) => {
    emit({ type: 'open', node: process.version, region: process.env.AWS_REGION ?? null, effort, maxTokens });
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['thinking-display-updates-2026-08-18', 'server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive', display: 'updates' },
      output_config: { effort },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: TASK }],
    });

    const counts: Record<string, number> = {};
    let firstDelta: number | null = null;
    const started = Date.now();
    const heartbeat = setInterval(() => emit({ type: 'progress', counts: { ...counts } }), 1000);
    try {
      for await (const event of stream) {
        if (event.type === 'message_start') {
          emit({ type: 'message_start', model: event.message.model, id: event.message.id });
        } else if (event.type === 'content_block_start') {
          emit({ type: 'block_start', index: event.index, block: event.content_block.type });
        } else if (event.type === 'content_block_stop') {
          emit({ type: 'block_stop', index: event.index });
        } else if (event.type === 'content_block_delta') {
          firstDelta ??= Date.now() - started;
          const d = event.delta;
          const size =
            d.type === 'text_delta' ? d.text.length
            : d.type === 'thinking_delta' ? d.thinking.length
            : d.type === 'input_json_delta' ? d.partial_json.length
            : 0;
          counts[d.type] = (counts[d.type] ?? 0) + size;
        }
      }
      const final = await stream.finalMessage();
      emit({
        type: 'final',
        model: final.model,
        stop_reason: final.stop_reason,
        stop_details: final.stop_details ?? null,
        blocks: final.content.map((b) => b.type),
        usage: final.usage,
        firstDeltaMs: firstDelta,
        counts,
      });
    } finally {
      clearInterval(heartbeat);
    }
  });
};

export const config = { path: '/api/comp-report/probe/claude' };
