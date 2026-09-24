// The assistant's pinned configuration and transcript handling (design §8).
// Everything the model sees is decided here, server-side: the browser sends
// only the agent's new message (§8.3 rule 6).
//
// CR-1 lays the foundations — one streamed Opus 5.5 call per request, the
// server-side tool loop, the append-only transcript, usage logging — with a
// placeholder prompt and one tool. CR-4 builds the real assistant on it.
import type Anthropic from '@comp-report/anthropic-sdk';
import type { Queryable } from './db.ts';

export const ASSISTANT = {
  model: 'claude-opus-5-5',
  // §8.8: thinking is always on for Opus 5.5 and effort is the control; set it
  // explicitly (the API default is medium). Conversational turns run low.
  effort: 'low' as const,
  // Room for thinking plus the reply, sized so a turn fits the measured 60 s
  // request cap at ~70 output tokens/s (docs/comp-report/cr1-function-limits.md).
  maxTokens: 8192,
  promptVersion: 'cr1-2026-09-25',
  betas: [
    'thinking-display-updates-2026-08-18', // progress notes arrive as thinking text (§8.8)
    'server-side-fallback-2026-07-01', // fallbacks: "default" on a policy refusal (§8.8)
    'thinking-binding-controls-2026-08-01', // make any history edit fail loudly (§8.3 rule 5)
  ] satisfies Anthropic.Beta.AnthropicBeta[],
};

export const SYSTEM_PROMPT = [
  'You are the Casa Blanca comp report assistant, working with a licensed New York City real estate agent on a comparative market analysis for one property.',
  'This is an early build: the calculation engine is not connected yet, so you cannot produce or check any figure. Never state a price, price per square foot, range or adjustment amount of your own; if asked for one, say the numbers come from the engine once it is connected.',
  'You may call get_report to see the report you are working in.',
  'Be concise and plain-spoken. A comp report is not an appraisal; never call it one.',
].join('\n\n');

export const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: 'get_report',
    description: "The report you're working in: its title, property type, mode and status. Call it when you need to know which report this is.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
    eager_input_streaming: true,
  },
];

type Block = Record<string, unknown> & { type: string };

export interface StoredMessage {
  seq: number;
  role: 'user' | 'assistant';
  content: Block[];
  stop_reason: string | null;
  in_context: boolean;
}

/**
 * The messages to send, built from the stored transcript. Assistant turns are
 * replayed verbatim — thinking blocks included, unchanged (§8.8) — except as
 * the fallback rules require: before the last `fallback` block of a turn that
 * fell back mid-output, thinking and tool-use blocks are left out. A turn kept
 * out of context (refused, interrupted) is skipped along with the user message
 * it answered, so a refusal isn't replayed into every later request.
 */
export function buildMessages(stored: StoredMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (let i = 0; i < stored.length; i++) {
    const m = stored[i]!;
    if (!m.in_context) continue;
    if (m.role === 'user') {
      const next = stored[i + 1];
      const answersTools = m.content.some((b) => b.type === 'tool_result');
      const refused = next && next.role === 'assistant' && !next.in_context && next.stop_reason === 'refusal';
      if (refused && !answersTools) continue;
      out.push({ role: 'user', content: m.content as unknown as Anthropic.Beta.BetaContentBlockParam[] });
      continue;
    }
    out.push({ role: 'assistant', content: forReplay(m.content) as unknown as Anthropic.Beta.BetaContentBlockParam[] });
  }
  return out;
}

function forReplay(content: Block[]): Block[] {
  let lastFallback = -1;
  content.forEach((b, i) => {
    if (b.type === 'fallback') lastFallback = i;
  });
  if (lastFallback < 0) return content;
  const dropBefore = new Set(['thinking', 'redacted_thinking', 'tool_use']);
  return content.filter((b, i) => i > lastFallback || !dropBefore.has(b.type));
}

/** The tool_use blocks of an assistant turn that still need results. */
export function pendingToolUses(last: StoredMessage | undefined): Array<{ id: string; name: string; input: unknown }> {
  if (!last || last.role !== 'assistant' || !last.in_context || last.stop_reason !== 'tool_use') return [];
  return last.content
    .filter((b) => b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string')
    .map((b) => ({ id: b.id as string, name: b.name as string, input: b.input }));
}

/** Runs pinned tools server-side. CR-4 routes these through the engine. */
export async function runTool(
  tx: Queryable,
  reportId: string,
  call: { id: string; name: string; input: unknown },
): Promise<Block> {
  if (call.name === 'get_report') {
    const { rows } = await tx.query<Record<string, unknown>>(
      'select title, property_type, mode, status, created_at from comp_report.reports where id = $1',
      [reportId],
    );
    return { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(rows[0] ?? null) };
  }
  return { type: 'tool_result', tool_use_id: call.id, is_error: true, content: `Unknown tool ${call.name}` };
}

// Per million tokens: input, output, cache read, cache write (5 min) — §8.9.
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2, 5],
  'claude-opus-5': [5, 25, 0.5, 6.25],
  'claude-opus-4-8': [5, 25, 0.5, 6.25],
  'claude-haiku-4-5': [1, 5, 0.1, 1.25],
};

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number | null;
}

type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/**
 * Totals and an estimated cost. With fallbacks, usage.iterations is the
 * per-attempt source of truth and each attempt is priced at its own model.
 */
export function usageTotals(model: string, usage: UsageLike & { iterations?: Array<UsageLike & { model?: string | null }> | null }): UsageTotals {
  const parts = usage.iterations?.length ? usage.iterations : [{ ...usage, model }];
  const totals: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 };
  for (const p of parts) {
    const i = p.input_tokens ?? 0, o = p.output_tokens ?? 0, r = p.cache_read_input_tokens ?? 0, w = p.cache_creation_input_tokens ?? 0;
    totals.input += i; totals.output += o; totals.cacheRead += r; totals.cacheWrite += w;
    const price = PRICES[p.model ?? model];
    totals.costUsd = price && totals.costUsd !== null
      ? totals.costUsd + (i * price[0] + o * price[1] + r * price[2] + w * price[3]) / 1_000_000
      : null;
  }
  if (totals.costUsd !== null) totals.costUsd = Math.round(totals.costUsd * 1e6) / 1e6;
  return totals;
}
