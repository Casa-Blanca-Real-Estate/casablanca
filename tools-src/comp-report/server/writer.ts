// The writer (design §8.1, §8.8, §10.2; Dispatch 13): Claude drafts the
// headlines and the email's sections in Casa's house voice, in Frankie's
// order. Stateless: one call per draft, from pinned numbers, with structured
// output. It runs in a background function (api/narratives.ts), so no
// platform limit cuts it off mid-draft.
//
// Settings, checked against the claude-api skill on 2026-10-14 for Opus 5.5:
//   - thinking is always on and adaptive; effort is the control, and its
//     default is medium, so it's set explicitly. Medium: a draft is writing
//     from given numbers, not open analysis. The eval measures it.
//   - structured output through output_config.format (a JSON schema), so the
//     sections come back as fields, not free text
//   - server-side fallbacks ("default", routed by refusal category), and
//     stop_reason checked before the content is read: a refusal or a cut-off
//     draft is a failure, and Send falls back to the template
//   - streamed, with max_tokens sized for thinking plus the draft
import Anthropic from '@comp-report/anthropic-sdk';
import type { WrittenSections } from '../workspace/email.ts';
import type { WriterInput } from '../workspace/writer-input.ts';
import { CURRENT_HOUSE_VOICE, HOUSE_VOICES } from './house-voice.ts';

export const WRITER = {
  model: 'claude-opus-5-5',
  effort: 'medium' as const,
  // Thinking plus a full email's sections; a draft runs ~1–2K output tokens.
  maxTokens: 16_000,
  betas: ['server-side-fallback-2026-07-01'] satisfies Anthropic.Beta.AnthropicBeta[],
  /** A background function runs for up to 15 minutes; a draft that takes 5 has gone wrong. */
  timeoutMs: 5 * 60_000,
};

export interface WriterPrompt {
  id: string;
  /** The house voice it carries (house-voice.ts). */
  voice: string;
  system: string;
}

/**
 * The system prompt. `rev` picks the field brief: cr5-2026-10-29 (CR-3, from
 * the real eval) keeps things to consider to the agent's own points and a
 * headline off a single price for the home. The shipped one stays as it was.
 */
function system(voiceId: string, rev: '2026-10-14' | '2026-10-29'): string {
  const voice = HOUSE_VOICES[voiceId]!;
  const later = rev !== '2026-10-14';
  return [
    'You draft the client email for a Casa Blanca comparative market analysis. A licensed New York City real estate agent sends it to their client; you draft, and the agent picks, edits and sends. Casa Blanca is a residential brokerage.',
    'The report comes as JSON: the home; whether the client is buying or selling; the client\'s first name; the length; the headline facts, which are the only figures a headline may cite; the comps that count, each with its figures, how it differs from the home and the agent\'s own note on it; the price table; and any lines the agent wrote for this email, marked agent_stated.',
    [
      'Return JSON with these fields:',
      '- headlines: two or three, each one sentence on what the comps show, citing only the headline facts. For example: "The three closest sales put #517 at $880–$925 a square foot — about $640K–$670K." Vary them: the range, the closest comp, how the sales closed against their asks.'
        + (later ? ' Only the range puts a price on the home: a headline on the closest comp says what it sold for, never what that would make the home.' : ''),
      '- chosen: one line on how the comps were chosen, from the agent\'s sorting (the tiers and their notes) and their own line if they wrote one. For example: "I focused on lower floors and homes close in size."',
      '- comps: for each comp given, its id and one to three short lines on it. The email already leads each comp with its address, link, price and price per square foot, so don\'t repeat those.',
      later
        ? '- consider: things to consider, only the points in agent_stated.things_to_consider, a point each, tightened. Never add a point of your own. If the agent wrote none, leave it empty.'
        : '- consider: things to consider, a point each: buildings that trade higher or lower, carrying costs, recent activity in the building. Only what the report supports.',
      '- next_step: the next step. If the agent wrote one, keep its meaning and its numbers. If not, a plain line inviting the client to talk it through; never an offer or a list price of your own.',
    ].join('\n'),
    'The email adds the greeting, the price table, the sign-off and the disclaimer itself: never write them. If the result uses the agent\'s estimates, the email already says so.',
    'By length. full: every field. short: headlines, one line for each comp given, and next_step; chosen empty and consider empty. text: a text message, so headlines and a one- or two-sentence next_step; comps, chosen and consider empty.',
    'For a seller, the next step is about pricing and listing, not an offer.',
    ...(later ? ['Carrying costs come up once in the email at most, where they matter most. Don\'t close every comp with the same kind of line.'] : []),
    'Leave a field empty (an empty string or list) when there\'s nothing true and useful to put in it.',
    voice.text,
  ].join('\n\n');
}

/**
 * Every writer prompt a stored draft can name. A draft keeps the prompt it
 * was written under; never edit a version once it has shipped, add one.
 */
export const WRITER_PROMPTS: Record<string, WriterPrompt> = {
  'cr5-2026-10-14': { id: 'cr5-2026-10-14', voice: 'house-2026-10-14', system: system('house-2026-10-14', '2026-10-14') },
  'cr5-2026-10-29': { id: 'cr5-2026-10-29', voice: 'house-2026-10-29', system: system('house-2026-10-29', '2026-10-29') },
};

export const CURRENT_WRITER_PROMPT = WRITER_PROMPTS['cr5-2026-10-29']!;
if (CURRENT_WRITER_PROMPT.voice !== CURRENT_HOUSE_VOICE.id) throw new Error('writer: the current prompt must carry the current house voice');

/** The draft's shape, enforced by the API (structured output). Counts are checked in code. */
export const WRITER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headlines', 'chosen', 'comps', 'consider', 'next_step'],
  properties: {
    headlines: { type: 'array', items: { type: 'string' } },
    chosen: { type: 'string' },
    comps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'lines'],
        properties: { id: { type: 'string' }, lines: { type: 'array', items: { type: 'string' } } },
      },
    },
    consider: { type: 'array', items: { type: 'string' } },
    next_step: { type: 'string' },
  },
} as const;

export interface WriterDraft {
  headlines: string[];
  sections: WrittenSections;
}

/** The user turn: the report, as JSON. */
export function userMessage(input: WriterInput): string {
  return `Draft the headlines and the email's sections for this report.\n\n<report>\n${JSON.stringify(input, null, 2)}\n</report>`;
}

/** The whole request, as it goes to the API — the tests read it to prove what can't be in it. */
export function writerRequest(input: WriterInput, prompt: WriterPrompt = CURRENT_WRITER_PROMPT) {
  return {
    model: WRITER.model,
    max_tokens: WRITER.maxTokens,
    betas: WRITER.betas,
    fallbacks: 'default' as const,
    thinking: { type: 'adaptive' as const },
    output_config: { effort: WRITER.effort, format: { type: 'json_schema' as const, schema: WRITER_SCHEMA as unknown as Record<string, unknown> } },
    system: [{ type: 'text' as const, text: prompt.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: userMessage(input) }] }],
  };
}

const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

/**
 * The draft from the model's JSON, held to its brief: one to three headlines,
 * a comp's lines only for a comp it was given (one to three, or one when
 * short), the sections the length has, and things to consider only when the
 * agent wrote some. Null when there's no headline.
 */
export function parseDraft(text: string, input: WriterInput): WriterDraft | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);
  const headlines = [...new Set(list(raw.headlines))].slice(0, 3);
  if (!headlines.length) return null;
  const given = new Set(input.comps.map((c) => c.id));
  const perComp = input.length === 'full' ? 3 : 1;
  const comps = (Array.isArray(raw.comps) ? raw.comps : [])
    .filter((c): c is { id: string; lines: unknown } => Boolean(c) && typeof (c as { id?: unknown }).id === 'string' && given.has((c as { id: string }).id))
    .map((c) => ({ id: c.id, lines: list(c.lines).slice(0, perComp) }))
    .filter((c) => c.lines.length);
  const full = input.length === 'full';
  return {
    headlines,
    sections: {
      chosen: full ? clean(raw.chosen) : '',
      comps: input.length === 'text' ? [] : comps,
      // Things to consider are the agent's (CR-3): none written, none drafted, whatever came back.
      consider: full && input.agent_stated.things_to_consider ? list(raw.consider) : [],
      nextStep: clean(raw.next_step),
    },
  };
}

type Usage = Anthropic.Beta.BetaMessage['usage'];

export type WriteOutcome =
  | { ok: true; draft: WriterDraft; model: string; stopReason: string | null; requestId: string | null; usage: Usage; raw: string }
  | {
    ok: false;
    /** refused — the model (and its fallback) declined; incomplete — cut off; unreadable — not the draft's shape; error — the call failed. */
    reason: 'refused' | 'incomplete' | 'unreadable' | 'error';
    message: string;
    model: string | null;
    stopReason: string | null;
    requestId: string | null;
    usage: Usage | null;
    status?: number | null;
  };

/** One draft: one call, streamed, read only after its stop reason is checked. */
export async function callWriter(
  client: Anthropic,
  input: WriterInput,
  opts: { prompt?: WriterPrompt; onProgress?: (chars: number) => void; signal?: AbortSignal } = {},
): Promise<WriteOutcome> {
  const stream = client.beta.messages.stream(writerRequest(input, opts.prompt), { signal: opts.signal, timeout: WRITER.timeoutMs });
  let chars = 0;
  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        chars += event.delta.text.length;
        opts.onProgress?.(chars);
      }
    }
    const m = await stream.finalMessage();
    const base = { model: m.model, stopReason: m.stop_reason, requestId: stream.request_id ?? null, usage: m.usage };
    if (m.stop_reason === 'refusal') {
      return { ok: false, reason: 'refused', message: 'Claude declined to draft this one.', ...base };
    }
    if (m.stop_reason === 'max_tokens') {
      return { ok: false, reason: 'incomplete', message: 'The draft was cut off before it finished.', ...base };
    }
    const text = m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
    const draft = parseDraft(text, input);
    if (!draft) return { ok: false, reason: 'unreadable', message: 'The draft didn’t come back in the shape the email needs.', ...base };
    return { ok: true, draft, raw: text, ...base };
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? error.status ?? null : null;
    console.error('comp-report writer: the call failed', status, error instanceof Error ? error.message : error);
    return {
      ok: false, reason: 'error', status,
      message: status === 429 ? 'The writer is busy right now.' : 'The writer couldn’t be reached.',
      model: null, stopReason: null, requestId: stream.request_id ?? null, usage: null,
    };
  }
}
