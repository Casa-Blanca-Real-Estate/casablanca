// Hubert on one comp (Dispatch 25): the per-comp review on Sort. Two jobs, one
// small call each, from what's stored (workspace/review.ts builds the input):
//
//   feedback — the agent's note and tags on the comp, against its facts and
//              the home's: what holds up, what's missing or wrong, and whether
//              the comp looks weak. No rewrite of the note and no tier: the
//              reasoning stays the agent's.
//   take     — Hubert's own reasoning on the comp, the tier he would give and
//              why, and the weak flag. Advice: the agent sets the tier.
//
// Kimani's rule (D-29, 2026-10-22): the human drives. A practice agent gets
// feedback on their own reasoning before they can see his take; the server
// refuses a practice agent's take until a feedback round is stored
// (api/comp-review.ts). Neither job sees the agent's number, the target, the
// deal terms or the tier (D-4).
//
// Grounded in code as lines.ts is: a point, sentence or reason that cites a
// figure the input doesn't hold is dropped, and never shown.
//
// Settings as lines.ts's, checked against the claude-api skill on 2026-10-22
// for Opus 5.5: adaptive thinking, effort set explicitly (medium: a judgment
// on one comp, short to write), structured output, server-side fallbacks, the
// stop reason checked before the content is read. It runs in the request: one
// comp at medium effort returns well inside the 60-second cap.
import Anthropic from '@comp-report/anthropic-sdk';
import type { Tier } from '../engine/index.ts';
import type { ReviewInput, ReviewKind } from '../workspace/review.ts';
import { figuresIn } from './lines.ts';

export const REVIEW = {
  model: 'claude-opus-5-5',
  effort: 'medium' as const,
  maxTokens: 8_000,
  betas: ['server-side-fallback-2026-07-01'] satisfies Anthropic.Beta.AnthropicBeta[],
  /** Inside the function's 60-second cap, with room to record the result. */
  timeoutMs: 45_000,
};

export interface ReviewPrompt {
  id: string;
  job: ReviewKind;
  system: string;
}

const SHARED = [
  'You are Hubert, a mentor at Casa Blanca, a residential brokerage in New York City. You help a licensed agent judge the comparable sales for a comparative market analysis, one comp at a time. Agents learn the craft here: the agent reasons, you help them reason well.',
  'You get one comp and the home it is compared to, as JSON: each one\'s facts, their features, how the tool measured the comp against the home (against_the_home) and the house\'s comparability checks that flagged it (checks).',
  [
    'What makes a good comp, as Casa\'s mentors teach it:',
    '- Same building first, then the nearest buildings: within about a quarter mile.',
    '- Recent: sold or in contract in the last three to six months. Older sales say less about today.',
    '- Close in size, layout, bedrooms and floor. A penthouse, a ground floor or a very different size is a different product.',
    '- The same kind of building and service: full service against full service, new development against new development, condo against condo, co-op against co-op.',
    '- Condition, light, views, outdoor space and carrying costs explain why two similar homes trade apart.',
    '- A comp that didn\'t sell says where buyers wouldn\'t go: its last ask is a ceiling, not a value.',
  ].join('\n'),
  'Ground everything in the input. Cite a figure only as the input writes it, and only one the input holds: no figure of your own, no arithmetic. Never name a value, a range or a price for the home.',
  'weak is true when the comp is a poor comparison for this home, with weak_reason saying why in a few plain words: "closed three years ago", "no amenities against a full-service home", "half a mile away". Otherwise weak is false and weak_reason is an empty string.',
];

export const REVIEW_PROMPTS: Record<string, ReviewPrompt> = {
  'review-feedback-2026-10-22': {
    id: 'review-feedback-2026-10-22',
    job: 'feedback',
    system: [
      ...SHARED,
      'The agent\'s own reasoning comes as agent: their note on why it is (or isn\'t) a comp, and their tags. Give them feedback on it, the way a mentor reviews a trainee\'s work:',
      '- holds_up: the points in their reasoning the facts support. One short sentence each, at most three.',
      '- look_again: what is missing or wrong in their reasoning against the comp\'s facts and the home\'s: a difference they didn\'t weigh, a claim the facts contradict, a tag that doesn\'t fit. One short sentence each, at most four. Speak to the agent as "you".',
      'Don\'t rewrite their note, don\'t write a note for them, and don\'t say which tier to give it: the tier is their call. If their reasoning is empty or says nothing about the comp, say what they should look at first.',
    ].join('\n\n'),
  },
  'review-take-2026-10-22': {
    id: 'review-take-2026-10-22',
    job: 'take',
    system: [
      ...SHARED,
      'Give your own take on the comp:',
      '- reasoning: two to four short sentences on how it compares to the home and why it is, or isn\'t, a good comp. Plain words, as one agent to another.',
      '- tier: the tier you would give it. primary counts toward the range; secondary is context, shown but not counted; excluded is out of every figure.',
      '- tier_why: one sentence on why that tier.',
      'If the agent asks you something (agent_asks), take it into account: they may know something about the comp the data doesn\'t.',
      'The agent decides the tier. Yours is a suggestion they can take or leave.',
    ].join('\n\n'),
  },
};

export const CURRENT_REVIEW_PROMPT: Record<ReviewKind, ReviewPrompt> = {
  feedback: REVIEW_PROMPTS['review-feedback-2026-10-22']!,
  take: REVIEW_PROMPTS['review-take-2026-10-22']!,
};

const WEAK = { weak: { type: 'boolean' }, weak_reason: { type: 'string' } } as const;

export const REVIEW_SCHEMAS = {
  feedback: {
    type: 'object',
    additionalProperties: false,
    required: ['holds_up', 'look_again', 'weak', 'weak_reason'],
    properties: { holds_up: { type: 'array', items: { type: 'string' } }, look_again: { type: 'array', items: { type: 'string' } }, ...WEAK },
  },
  take: {
    type: 'object',
    additionalProperties: false,
    required: ['reasoning', 'tier', 'tier_why', 'weak', 'weak_reason'],
    properties: {
      reasoning: { type: 'string' },
      tier: { type: 'string', enum: ['primary', 'secondary', 'excluded'] },
      tier_why: { type: 'string' },
      ...WEAK,
    },
  },
} as const;

export function userMessage(job: ReviewKind, input: ReviewInput): string {
  const ask = job === 'feedback' ? 'Give the agent feedback on their reasoning about this comp.' : 'Give your take on this comp.';
  return `${ask}\n\n<comp_review>\n${JSON.stringify(input, null, 2)}\n</comp_review>`;
}

export function reviewRequest(job: ReviewKind, input: ReviewInput, prompt: ReviewPrompt = CURRENT_REVIEW_PROMPT[job]) {
  return {
    model: REVIEW.model,
    max_tokens: REVIEW.maxTokens,
    betas: REVIEW.betas,
    fallbacks: 'default' as const,
    thinking: { type: 'adaptive' as const },
    output_config: { effort: REVIEW.effort, format: { type: 'json_schema' as const, schema: REVIEW_SCHEMAS[job] as unknown as Record<string, unknown> } },
    system: [{ type: 'text' as const, text: prompt.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: userMessage(job, input) }] }],
  };
}

/** What a round says, held to the input: the entry's text, tier and flag. */
export interface ReviewResult {
  text: string;
  weak: { reason: string } | null;
  tier?: Tier | null;
  tierWhy?: string;
  /** How many points, sentences or reasons cited a figure the input doesn't hold: dropped. */
  dropped: number;
}

const one = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').replace(/^[-•*]\s*/, '').trim() : '');
const TIERS: readonly Tier[] = ['primary', 'secondary', 'excluded'];

/** Sentences, kept whole: "It sold 3.5% below its last ask." stays one. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * The model's round, grounded: every figure it cites must be one the input
 * holds (figuresIn over the input, as lines.ts checks a draft). A feedback
 * point or a take's sentence that cites another is dropped; a weak reason
 * that does drops the flag with it. Null when it isn't the job's shape, or
 * nothing is left to show.
 */
export function parseReview(text: string, job: ReviewKind, input: ReviewInput): ReviewResult | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const given = new Set(figuresIn(JSON.stringify(input)));
  let dropped = 0;
  const grounded = (s: string) => {
    if (figuresIn(s).every((f) => given.has(f))) return true;
    dropped += 1;
    return false;
  };

  const reason = one(raw.weak_reason);
  const weak = raw.weak === true && reason && grounded(reason) ? { reason } : null;

  if (job === 'feedback') {
    const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map(one).filter(Boolean).slice(0, max).filter(grounded) : []);
    const holds = list(raw.holds_up, 3);
    const again = list(raw.look_again, 4);
    if (!holds.length && !again.length) return null;
    const parts: string[] = [];
    if (holds.length) parts.push(['What holds up:', ...holds.map((p) => `- ${p}`)].join('\n'));
    if (again.length) parts.push(['Look again:', ...again.map((p) => `- ${p}`)].join('\n'));
    return { text: parts.join('\n'), weak, dropped };
  }

  const tier = TIERS.find((t) => t === raw.tier) ?? null;
  const reasoning = sentences(one(raw.reasoning)).filter(grounded).join(' ');
  if (!reasoning || !tier) return null;
  const why = one(raw.tier_why);
  return { text: reasoning, weak, tier, ...(why && grounded(why) ? { tierWhy: why } : {}), dropped };
}

type Usage = Anthropic.Beta.BetaMessage['usage'];

export type ReviewOutcome =
  | { ok: true; result: ReviewResult; model: string; requestId: string | null; usage: Usage; promptId: string }
  | { ok: false; status: number; code: string; message: string; model: string | null; requestId: string | null; usage: Usage | null; promptId: string };

/** One call: streamed, read only after its stop reason is checked. */
export async function callReview(client: Anthropic, job: ReviewKind, input: ReviewInput): Promise<ReviewOutcome> {
  const prompt = CURRENT_REVIEW_PROMPT[job];
  const stream = client.beta.messages.stream(reviewRequest(job, input, prompt), { timeout: REVIEW.timeoutMs });
  try {
    const m = await stream.finalMessage();
    const base = { model: m.model, requestId: stream.request_id ?? null, usage: m.usage, promptId: prompt.id };
    if (m.stop_reason === 'refusal') return { ok: false, status: 422, code: 'refused', message: 'Hubert declined this one. Your note is as you left it.', ...base };
    if (m.stop_reason === 'max_tokens') return { ok: false, status: 502, code: 'incomplete', message: 'Hubert was cut off before he finished. Try again.', ...base };
    const text = m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
    const result = parseReview(text, job, input);
    if (!result) return { ok: false, status: 502, code: 'unreadable', message: 'Hubert’s answer didn’t come back in a shape the review can show. Try again.', ...base };
    return { ok: true, result, ...base };
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? error.status ?? null : null;
    console.error('comp-report review: the call failed', status, error instanceof Error ? error.message : error);
    return {
      ok: false, status: status === 429 ? 429 : 502, code: status === 429 ? 'busy' : 'model_error',
      message: status === 429 ? 'Hubert is busy right now. Try again in a minute.' : 'Hubert couldn’t be reached. Try again.',
      model: null, requestId: stream.request_id ?? null, usage: null, promptId: prompt.id,
    };
  }
}
