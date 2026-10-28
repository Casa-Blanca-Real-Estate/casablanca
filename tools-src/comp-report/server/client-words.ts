// Hubert on the client's words (Dispatch 26): Send's client step, where the
// overview and each comp's paragraph are written for the client. Two jobs, one
// small call each, from what's stored (workspace/client-words.ts builds the input):
//
//   feedback — on the agent's overview or one comp's paragraph: what works,
//              what's unclear, what the facts don't support, and what's off
//              the house voice. No rewrite: the words stay the agent's. The
//              fair-housing list is checked in code and added to it.
//   draft    — the writer's version of one comp's paragraph, in the house
//              voice, from the comp's facts, how it differs from the home, the
//              agent's Sort note and tags, and Hubert's take on Sort. A full
//              agent can say what to change and ask again.
//
// Kimani's rule (D-29, 2026-10-22): the human drives. A practice agent writes
// first and gets feedback before they can see the writer's version: the server
// refuses a practice agent's draft until a feedback round on that step is
// stored (api/client-words.ts). Neither job sees the agent's number, the
// target or the deal terms: the input is the writer's (writer-input.ts).
//
// Grounded in code as lines.ts and comp-review.ts are: a point or sentence
// that cites a figure the input doesn't hold is dropped, never shown, and a
// drafted sentence with a term on the fair-housing hard list goes with it.
//
// Settings as comp-review.ts's, checked against the claude-api skill on
// 2026-10-27 for Opus 5.5: adaptive thinking, effort set explicitly (low:
// a paragraph or a short review from given text), structured output,
// server-side fallbacks, the stop reason checked before the content is read.
// It runs in the request: one paragraph at low effort returns in seconds.
import Anthropic from '@comp-report/anthropic-sdk';
import { MAX_CLIENT_LINE, type ClientCompInput, type ClientOverviewInput, type ClientRoundKind } from '../workspace/client-words.ts';
import { fairHousingFindings } from '../workspace/fair-housing.ts';
import { CURRENT_HOUSE_VOICE } from './house-voice.ts';
import { figuresIn } from './lines.ts';

export const CLIENT_WORDS = {
  model: 'claude-opus-5-5',
  effort: 'low' as const,
  maxTokens: 8_000,
  betas: ['server-side-fallback-2026-07-01'] satisfies Anthropic.Beta.AnthropicBeta[],
  /** Inside the function's 60-second cap, with room to record the result. */
  timeoutMs: 45_000,
};

export type ClientWordsInput =
  | { job: 'feedback'; target: 'overview'; input: ClientOverviewInput }
  | { job: 'feedback'; target: 'comp'; input: ClientCompInput }
  | { job: 'draft'; target: 'comp'; input: ClientCompInput };

export interface ClientWordsPrompt {
  id: string;
  job: ClientRoundKind;
  system: string;
}

const SHARED = [
  'You help a licensed New York City real estate agent at Casa Blanca, a residential brokerage, write the email that goes to their client with a comparative market analysis. The email leads with an overview, then shows each comparable home in its own box: its photo, address, price and price per square foot, then a short paragraph written for the client about how it compares to the client\'s home. Agents learn the craft here: the agent writes, you help them write well.',
  'Ground everything in the input. Cite a figure only as the input writes it, and only one the input holds: no figure of your own, no arithmetic. Never name a value, a range, an offer or a list price for the client\'s home.',
];

export const CLIENT_WORDS_PROMPTS: Record<string, ClientWordsPrompt> = {
  'client-feedback-2026-10-27': {
    id: 'client-feedback-2026-10-27',
    job: 'feedback',
    system: [
      ...SHARED,
      'You get, as JSON, either the agent\'s overview (agent_overview: their headline, how they chose the comps, things to consider and the next step, with the headline facts and the comps it rests on) or one comp with the paragraph the agent wrote for the client about it (agent_paragraph), with the comp\'s facts, how it differs from the home, the agent\'s own note from sorting it, and your take on it from sorting (hubert_take_on_sort).',
      [
        'Give the agent feedback on their words, the way a mentor reviews a trainee\'s draft. Speak to the agent as "you". One short sentence a point.',
        '- works: what reads well for the client and is supported by the facts. At most two.',
        '- unclear: what a client who isn\'t in real estate would trip on: jargon, a vague claim, a point that needs one more word. At most three.',
        '- unsupported: a claim the facts don\'t back or contradict, or a figure that isn\'t in the input. At most three.',
        '- off_voice: where it strays from the house voice below: hype, jargon, a judgment about who should live there, an appraisal. At most three.',
      ].join('\n'),
      'Don\'t rewrite their words and don\'t write a version for them. If they wrote nothing, say what the client would want to know first.',
      CURRENT_HOUSE_VOICE.text,
    ].join('\n\n'),
  },
  'client-draft-2026-10-27': {
    id: 'client-draft-2026-10-27',
    job: 'draft',
    system: [
      ...SHARED,
      'You get, as JSON, one comp: its facts, how it differs from the home (against_the_home), the agent\'s note and tags from sorting it, and your take on it from sorting (hubert_take_on_sort).',
      'Write the comp\'s paragraph for the client (paragraph): two to four short sentences, under 400 characters in all, on how it compares to the client\'s home and what it says about the home\'s price, in the agent\'s first person where it needs a voice. The box already shows the address, price, price per square foot and status above the paragraph, so don\'t open by repeating them. Use the agent\'s note: they know things the data doesn\'t. Keep their meaning; write it for the client.',
      'If the agent asks you to change something (agent_asks, about last_draft), make that change and keep the rest.',
      CURRENT_HOUSE_VOICE.text,
    ].join('\n\n'),
  },
};

export const CURRENT_CLIENT_WORDS_PROMPT: Record<ClientRoundKind, ClientWordsPrompt> = {
  feedback: CLIENT_WORDS_PROMPTS['client-feedback-2026-10-27']!,
  draft: CLIENT_WORDS_PROMPTS['client-draft-2026-10-27']!,
};

const list = { type: 'array', items: { type: 'string' } } as const;

export const CLIENT_WORDS_SCHEMAS = {
  feedback: {
    type: 'object',
    additionalProperties: false,
    required: ['works', 'unclear', 'unsupported', 'off_voice'],
    properties: { works: list, unclear: list, unsupported: list, off_voice: list },
  },
  draft: {
    type: 'object',
    additionalProperties: false,
    required: ['paragraph'],
    properties: { paragraph: { type: 'string' } },
  },
} as const;

export function userMessage(w: ClientWordsInput): string {
  const ask = w.job === 'draft'
    ? 'Write this comp\'s paragraph for the client.'
    : w.target === 'overview' ? 'Give the agent feedback on their overview.' : 'Give the agent feedback on their paragraph for this comp.';
  return `${ask}\n\n<client_words>\n${JSON.stringify(w.input, null, 2)}\n</client_words>`;
}

export function clientWordsRequest(w: ClientWordsInput, prompt: ClientWordsPrompt = CURRENT_CLIENT_WORDS_PROMPT[w.job]) {
  return {
    model: CLIENT_WORDS.model,
    max_tokens: CLIENT_WORDS.maxTokens,
    betas: CLIENT_WORDS.betas,
    fallbacks: 'default' as const,
    thinking: { type: 'adaptive' as const },
    output_config: { effort: CLIENT_WORDS.effort, format: { type: 'json_schema' as const, schema: CLIENT_WORDS_SCHEMAS[w.job] as unknown as Record<string, unknown> } },
    system: [{ type: 'text' as const, text: prompt.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: userMessage(w) }] }],
  };
}

export interface ClientWordsResult {
  text: string;
  /** Points or sentences that cited a figure the input doesn't hold, or a fair-housing hard term: dropped. */
  dropped: number;
}

const one = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').replace(/^[-•*]\s*/, '').trim() : '');
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/** The agent's own words a feedback round is about: the paragraph, or the overview's lines. */
export function agentWords(w: ClientWordsInput): string {
  if (w.job === 'draft') return '';
  if (w.target === 'comp') return w.input.agent_paragraph ?? '';
  const o = w.input.agent_overview;
  return [o.headline, o.how_the_comps_were_chosen, o.things_to_consider, o.next_step].filter(Boolean).join('\n');
}

/**
 * The fair-housing list on the agent's words (fair-housing.ts), as feedback
 * points: a hard term must come out before the email can be copied; a near one
 * is often innocent, and worth a second look.
 */
export function fairHousingPoints(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of fairHousingFindings(text)) {
    const key = f.term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f.level === 'hard'
      ? `“${f.term}” reads as a preference on ${f.basis}: take it out. The email can’t be copied with it.`
      : `“${f.term}” can touch on ${f.basis}: make sure it’s about the property, not who should live there.`);
  }
  return out;
}

/**
 * The model's round, grounded: a point or sentence that cites a figure the
 * input doesn't hold is dropped (figuresIn, as lines.ts checks a draft), and
 * so is a drafted sentence with a fair-housing hard term. Feedback gets the
 * fair-housing list on the agent's own words added in code. Null when it
 * isn't the job's shape, or nothing is left to show.
 */
export function parseClientWords(text: string, w: ClientWordsInput): ClientWordsResult | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const given = new Set(figuresIn(JSON.stringify(w.input)));
  let dropped = 0;
  const grounded = (s: string) => {
    if (figuresIn(s).every((f) => given.has(f))) return true;
    dropped += 1;
    return false;
  };

  if (w.job === 'draft') {
    const kept = sentences(one(raw.paragraph)).filter((s) => {
      if (!grounded(s)) return false;
      if (fairHousingFindings(s).some((f) => f.level === 'hard')) {
        dropped += 1;
        return false;
      }
      return true;
    });
    // The box holds MAX_CLIENT_LINE characters: whole sentences up to it, never a cut one.
    let paragraph = '';
    for (const s of kept) {
      const next = paragraph ? `${paragraph} ${s}` : s;
      if (next.length > MAX_CLIENT_LINE) break;
      paragraph = next;
    }
    return paragraph ? { text: paragraph, dropped } : null;
  }

  const points = (v: unknown, max: number) => (Array.isArray(v) ? v.map(one).filter(Boolean).slice(0, max).filter(grounded) : []);
  const parts: string[] = [];
  const section = (title: string, items: string[]) => {
    if (items.length) parts.push([title, ...items.map((p) => `- ${p}`)].join('\n'));
  };
  section('What works:', points(raw.works, 2));
  section('What’s unclear:', points(raw.unclear, 3));
  section('Not supported:', points(raw.unsupported, 3));
  section('Off-voice:', points(raw.off_voice, 3));
  section('Fair housing:', fairHousingPoints(agentWords(w)));
  return parts.length ? { text: parts.join('\n'), dropped } : null;
}

type Usage = Anthropic.Beta.BetaMessage['usage'];

export type ClientWordsOutcome =
  | { ok: true; result: ClientWordsResult; model: string; requestId: string | null; usage: Usage; promptId: string }
  | { ok: false; status: number; code: string; message: string; model: string | null; requestId: string | null; usage: Usage | null; promptId: string };

/** One call: streamed, read only after its stop reason is checked. */
export async function callClientWords(client: Anthropic, w: ClientWordsInput): Promise<ClientWordsOutcome> {
  const prompt = CURRENT_CLIENT_WORDS_PROMPT[w.job];
  const stream = client.beta.messages.stream(clientWordsRequest(w, prompt), { timeout: CLIENT_WORDS.timeoutMs });
  try {
    const m = await stream.finalMessage();
    const base = { model: m.model, requestId: stream.request_id ?? null, usage: m.usage, promptId: prompt.id };
    if (m.stop_reason === 'refusal') return { ok: false, status: 422, code: 'refused', message: 'Hubert declined this one. Your words are as you left them.', ...base };
    if (m.stop_reason === 'max_tokens') return { ok: false, status: 502, code: 'incomplete', message: 'Hubert was cut off before he finished. Try again.', ...base };
    const text = m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
    const result = parseClientWords(text, w);
    if (!result) return { ok: false, status: 502, code: 'unreadable', message: 'Hubert’s answer didn’t come back in a shape this step can show. Try again.', ...base };
    return { ok: true, result, ...base };
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? error.status ?? null : null;
    console.error('comp-report client words: the call failed', status, error instanceof Error ? error.message : error);
    return {
      ok: false, status: status === 429 ? 429 : 502, code: status === 429 ? 'busy' : 'model_error',
      message: status === 429 ? 'Hubert is busy right now. Try again in a minute.' : 'Hubert couldn’t be reached. Try again.',
      model: null, requestId: stream.request_id ?? null, usage: null, promptId: prompt.id,
    };
  }
}
