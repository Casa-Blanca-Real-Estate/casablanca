// The agent's lines on Send, with Claude's help (dev note dn_mviipah6rs3v,
// 2026-10-21): the agent's own lines are what the email is written from, so
// Send can draft them from what the agent has already said, or tidy what the
// agent wrote. Two jobs, one small call each, from what's stored:
//
//   draft    — the empty lines, put together from the agent's own notes,
//              tags and tiers, and any line they've written. Their thinking
//              in words, never a view of the model's own: a line their notes
//              don't support stays empty.
//   rewrite  — the lines they wrote, edited for clarity and grammar only:
//              the same points, numbers, names and voice.
//
// Kimani's rule for the AI (dn_mvij3r5x4g0f): it doesn't do the agent's
// thinking, it executes it. So both jobs are held in code as well as in the
// prompt: a line that cites a number the agent never gave (or the report
// doesn't have) is dropped, and the agent's own line is kept.
//
// Settings as the writer's (writer.ts), checked against the claude-api skill
// on 2026-10-21 for Opus 5.5: adaptive thinking, effort set explicitly (low:
// short edits from given text), structured output, server-side fallbacks, the
// stop reason checked before the content is read. It runs in the request,
// not a background function: a few lines at low effort return in seconds,
// well inside the 60-second cap.
import Anthropic from '@comp-report/anthropic-sdk';
import type { WriterInput } from '../workspace/writer-input.ts';
import { CURRENT_HOUSE_VOICE } from './house-voice.ts';

export const LINES = {
  model: 'claude-opus-5-5',
  effort: 'low' as const,
  maxTokens: 8_000,
  betas: ['server-side-fallback-2026-07-01'] satisfies Anthropic.Beta.AnthropicBeta[],
  /** Inside the function's 60-second cap, with room to record the result. */
  timeoutMs: 45_000,
};

export type LinesJob = 'draft' | 'rewrite';

/** The agent's lines for the email, as Send keeps them. */
export interface AgentLines {
  chosen: string;
  consider: string;
  nextStep: string;
}

export const LINE_KEYS: (keyof AgentLines)[] = ['chosen', 'consider', 'nextStep'];

export interface LinesPrompt {
  id: string;
  job: LinesJob;
  system: string;
}

const SHARED = [
  'You help a licensed New York City real estate agent at Casa Blanca, a residential brokerage, with their own lines for a client email about a comparative market analysis. The email is built from three lines the agent owns: how they chose the comps, things to consider, and the next step.',
  'The agent does the thinking; you put it into words. Never add an opinion, a judgment, a recommendation, a figure or a fact the agent didn\'t give you. Never name a price, an offer or a list price the agent didn\'t write.',
  'Return JSON with the three fields: chosen, consider and next_step. Things to consider is one point per line, separated by newlines, with no bullets. An empty string means the line stays as it is.',
];

export const LINES_PROMPTS: Record<string, LinesPrompt> = {
  'lines-draft-2026-10-21': {
    id: 'lines-draft-2026-10-21',
    job: 'draft',
    system: [
      ...SHARED,
      'The report comes as JSON: the home, whether the client is buying or selling, the comps the agent kept with their tiers, tags and the agent\'s own note on each (agent_note), and any lines the agent already wrote (agent_stated).',
      [
        'Draft only the lines the agent hasn\'t written, from what they have said:',
        '- chosen: one or two sentences in the agent\'s first person on how they chose the comps, from their tiers, tags and notes. For example: "I focused on lower floors and homes close in size."',
        '- consider: the points the agent\'s notes raise for the client, such as a building that trades higher, carrying costs or recent activity. Only points their notes make.',
        '- next_step: only if the agent\'s notes say what they would do next. Otherwise an empty string: the next step is the agent\'s call.',
        'Leave a line empty when the agent\'s notes don\'t support it. Return an empty string for a line the agent already wrote.',
      ].join('\n'),
      CURRENT_HOUSE_VOICE.text,
    ].join('\n\n'),
  },
  'lines-rewrite-2026-10-21': {
    id: 'lines-rewrite-2026-10-21',
    job: 'rewrite',
    system: [
      ...SHARED,
      'You get the agent\'s lines as JSON, with the home and whether the client is buying or selling for context.',
      'Edit each line the agent wrote for clarity and grammar only: fix spelling, punctuation and awkward phrasing, and tighten where it helps. Keep every point, every number, every name and address, and the agent\'s voice and first person. Don\'t add a point or drop one. A line that already reads well comes back unchanged. A line the agent left empty stays an empty string.',
      CURRENT_HOUSE_VOICE.text,
    ].join('\n\n'),
  },
};

export const CURRENT_LINES_PROMPT: Record<LinesJob, LinesPrompt> = {
  draft: LINES_PROMPTS['lines-draft-2026-10-21']!,
  rewrite: LINES_PROMPTS['lines-rewrite-2026-10-21']!,
};

export const LINES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chosen', 'consider', 'next_step'],
  properties: {
    chosen: { type: 'string' },
    consider: { type: 'string' },
    next_step: { type: 'string' },
  },
} as const;

/** What the rewrite is given: the agent's lines, and just enough to read them. */
export interface RewriteInput {
  home: string;
  audience: WriterInput['audience'];
  lines: { chosen: string; consider: string; next_step: string };
}

export type LinesInput = { job: 'draft'; report: WriterInput } | { job: 'rewrite'; report: RewriteInput };

export function userMessage(input: LinesInput): string {
  return input.job === 'draft'
    ? `Draft the agent's empty lines from what they've said.\n\n<report>\n${JSON.stringify(input.report, null, 2)}\n</report>`
    : `Edit the agent's lines for clarity and grammar.\n\n<lines>\n${JSON.stringify(input.report, null, 2)}\n</lines>`;
}

export function linesRequest(input: LinesInput, prompt: LinesPrompt = CURRENT_LINES_PROMPT[input.job]) {
  return {
    model: LINES.model,
    max_tokens: LINES.maxTokens,
    betas: LINES.betas,
    fallbacks: 'default' as const,
    thinking: { type: 'adaptive' as const },
    output_config: { effort: LINES.effort, format: { type: 'json_schema' as const, schema: LINES_SCHEMA as unknown as Record<string, unknown> } },
    system: [{ type: 'text' as const, text: prompt.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: userMessage(input) }] }],
  };
}

/** Every figure in a text, as digits: "$1.2M" → "1.2", "3,450 sq ft" → "3450". */
export function figuresIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, '').replace(/\.0+$/, ''));
}

const tidy = (s: unknown): string => (typeof s === 'string' ? s.split('\n').map((l) => l.replace(/\s+/g, ' ').replace(/^[-•*]\s*/, '').trim()).filter(Boolean).join('\n') : '');

export interface LinesResult {
  /** The lines that changed: only these are offered to the agent. */
  lines: Partial<AgentLines>;
  /** Lines the model wrote that cited a figure the agent never gave: dropped, and said so. */
  dropped: (keyof AgentLines)[];
}

/**
 * The model's lines, held to the job: a draft fills only the empty lines, a
 * rewrite only the written ones; a line that cites a figure that isn't in
 * what the model was given is dropped; an unchanged line isn't offered.
 */
export function parseLines(text: string, input: LinesInput, current: AgentLines): LinesResult | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const given = new Set(figuresIn(JSON.stringify(input.report)));
  const out: LinesResult = { lines: {}, dropped: [] };
  const wire: Record<keyof AgentLines, string> = { chosen: 'chosen', consider: 'consider', nextStep: 'next_step' };
  for (const key of LINE_KEYS) {
    const line = tidy(raw[wire[key]]);
    const mine = current[key].trim();
    if (!line) continue;
    if (input.job === 'draft' ? mine : !mine) continue;
    if (line === mine) continue;
    // A rewrite keeps the agent's own figures; a draft cites only what it was given.
    const allowed = input.job === 'rewrite' ? new Set(figuresIn(mine)) : given;
    if (figuresIn(line).some((f) => !allowed.has(f))) {
      out.dropped.push(key);
      continue;
    }
    out.lines[key] = line;
  }
  return out;
}

type Usage = Anthropic.Beta.BetaMessage['usage'];

export type LinesOutcome =
  | { ok: true; result: LinesResult; model: string; requestId: string | null; usage: Usage; promptId: string }
  | { ok: false; status: number; code: string; message: string; model: string | null; requestId: string | null; usage: Usage | null; promptId: string };

/** One call: streamed, read only after its stop reason is checked. */
export async function callLines(client: Anthropic, input: LinesInput, current: AgentLines): Promise<LinesOutcome> {
  const prompt = CURRENT_LINES_PROMPT[input.job];
  const stream = client.beta.messages.stream(linesRequest(input, prompt), { timeout: LINES.timeoutMs });
  try {
    const m = await stream.finalMessage();
    const base = { model: m.model, requestId: stream.request_id ?? null, usage: m.usage, promptId: prompt.id };
    if (m.stop_reason === 'refusal') return { ok: false, status: 422, code: 'refused', message: 'Claude declined this one. Your lines are as you left them.', ...base };
    if (m.stop_reason === 'max_tokens') return { ok: false, status: 502, code: 'incomplete', message: 'It was cut off before it finished. Try again.', ...base };
    const text = m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
    const result = parseLines(text, input, current);
    if (!result) return { ok: false, status: 502, code: 'unreadable', message: 'It didn’t come back in the shape your lines need. Try again.', ...base };
    return { ok: true, result, ...base };
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? error.status ?? null : null;
    console.error('comp-report lines: the call failed', status, error instanceof Error ? error.message : error);
    return {
      ok: false, status: status === 429 ? 429 : 502, code: status === 429 ? 'busy' : 'model_error',
      message: status === 429 ? 'Hubert is busy right now. Try again in a minute.' : 'Hubert couldn’t be reached. Try again.',
      model: null, requestId: stream.request_id ?? null, usage: null, promptId: prompt.id,
    };
  }
}
