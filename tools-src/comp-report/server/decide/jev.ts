// Jev (TypeSafe AI) through Vercel's AI Gateway — the transport's pure parts
// and a single attempt (Dispatch 10 phase 1 step 2; handoff §2–§3).
//
// The paced, retried, durable part is drain.ts: on Netlify there's no
// long-lived process, so the queue, the pacing and the shared cool-down live in
// the database. Here is what one attempt does, and nothing more:
// - the request is built by a pure function;
// - the response is read by a strict pure one — validated, never repaired;
// - an attempt ends in exactly one of: answered, retry (with how long, and
//   whether the wait holds every request), or a named drop.
// Nothing here throws into a caller.
//
// ── Privacy ─────────────────────────────────────────────────────────────────
// Every request carries `disallowPromptTraining: true`, with no switch. It's
// available on every Vercel plan.
//
// `zeroDataRetention: true` needs a Vercel Pro team. Casa starts on Kimani's
// existing account, which isn't on Pro (2026-10-06), so it's a switch,
// CR_JEV_ZDR, on by default (Dispatch 10, "Where Casa differs" 3). With it off,
// the flag is left out — never sent as false — and drain.ts refuses a private
// lane's request before it's sent. Both flags fail closed on the Gateway.
//
// No code path sends either flag as false. The two shapes below are the only
// ones; a test asserts them on the wire and reads this file for it.

export const JEV_MODEL = 'typesafe-ai/jev';
export const JEV_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/evaluate';

/** Both flags: zero retention on (CR_JEV_ZDR on, the default). Frozen, so nothing downstream can switch a flag off. */
export const JEV_PROVIDER_OPTIONS = Object.freeze({
  gateway: Object.freeze({ disallowPromptTraining: true as const, zeroDataRetention: true as const }),
});
/** No training only: CR_JEV_ZDR off, for public text on a team that isn't on Pro. */
export const JEV_PROVIDER_OPTIONS_NO_ZDR = Object.freeze({
  gateway: Object.freeze({ disallowPromptTraining: true as const }),
});

/** The provider options for a request; zero retention unless the caller says it's off. */
export function jevProviderOptions(zdr: boolean) {
  return zdr ? JEV_PROVIDER_OPTIONS : JEV_PROVIDER_OPTIONS_NO_ZDR;
}

/** Statuses that mean "busy — ask again later". */
export const JEV_RETRY_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);
/** Rides out MindBinder's worst stretch: 112 s of 503s. */
export const JEV_MAX_ATTEMPTS = 12;
export const JEV_ATTEMPT_TIMEOUT_MS = 30_000;
/** A Retry-After longer than this is clamped. */
export const JEV_MAX_RETRY_WAIT_MS = 180_000;
/** Under five requests a minute, which gave MindBinder zero refusals. */
export const JEV_DEFAULT_MIN_INTERVAL_MS = 12_500;
/** A raw body kept for the record (the go/no-go call) is cut here: 64 KiB. */
export const RAW_MAX_CHARS = 65_536;

export type JevQuestionWire =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'boolean'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'score'; instructions: string; criteria: string[] };

export interface ParsedAnswer {
  type: 'choice' | 'boolean' | 'score';
  /** choice: the chosen key, one that was offered. */
  choice?: string;
  /** choice: a probability per offered key. score: per level index ("0", "1", …). */
  probabilities?: Record<string, number>;
  /** boolean: P(true). */
  probability?: number;
  /** score: the raw, 0-BASED probability-weighted level. Convert once, in verdict.ts. */
  rawScore?: number;
  /** The vendor's statistic, recorded and never used to decide (handoff §2.3). */
  vendorConfidence?: number;
}

export interface ParsedResponse {
  answers: Record<string, ParsedAnswer>;
  /** What the Gateway says served it — in practice the bare alias (handoff §1.1). */
  model: string | null;
  inputTokens: number;
}

/** PURE: the exact request body. `zdr` is required, so no caller gets a shape by default. */
export function buildJevRequestBody(state: unknown, questions: Record<string, JevQuestionWire>, opts: { zdr: boolean }) {
  return { model: JEV_MODEL, state, questions, providerOptions: jevProviderOptions(opts.zdr === true) };
}

const isProb = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * PURE: validate a response against the questions that were asked. An answer
 * that names an option not offered, a probability outside 0–1, a choice
 * without a probability for its own pick, or a score outside its levels is
 * DROPPED — never repaired. Null when the body isn't a response at all.
 */
export function parseJevResponse(raw: unknown, questions: Record<string, JevQuestionWire>): ParsedResponse | null {
  if (!isObj(raw) || !isObj(raw.answers)) return null;
  const answers: Record<string, ParsedAnswer> = {};
  const meta = isObj(raw.providerMetadata) && isObj(raw.providerMetadata.typesafe) && isObj(raw.providerMetadata.typesafe.confidence)
    ? raw.providerMetadata.typesafe.confidence : {};
  for (const [id, q] of Object.entries(questions)) {
    const a = raw.answers[id];
    if (!isObj(a)) continue;
    if (a.type !== undefined && a.type !== q.type) continue;
    const conf = isProb(meta[id]) ? meta[id] : isProb(a.confidence) ? a.confidence : undefined;
    if (q.type === 'choice') {
      const keys = Object.keys(q.criteria);
      if (typeof a.choice !== 'string' || !keys.includes(a.choice)) continue;
      if (!isObj(a.probabilities)) continue;
      const got = a.probabilities;
      // A foreign key or a bad value spoils the whole answer. An option left out
      // is left out (read as 0 by the verdict) — but never the chosen one.
      if (Object.entries(got).some(([k, v]) => !keys.includes(k) || !isProb(v))) continue;
      if (!isProb(got[a.choice])) continue;
      const probabilities = Object.fromEntries(keys.filter((k) => k in got).map((k) => [k, got[k] as number]));
      answers[id] = { type: 'choice', choice: a.choice, probabilities, ...(conf !== undefined ? { vendorConfidence: conf } : {}) };
    } else if (q.type === 'boolean') {
      // TypeSafe's native API calls P(true) "noul"; the Gateway, "probability".
      const p = isProb(a.probability) ? a.probability : isProb(a.noul) ? a.noul : undefined;
      if (p === undefined) continue;
      answers[id] = { type: 'boolean', probability: p };
    } else {
      const levels = q.criteria.length;
      if (typeof a.score !== 'number' || !Number.isFinite(a.score) || a.score < 0 || a.score > levels - 1) continue;
      const got = isObj(a.probabilities) ? a.probabilities : {};
      if (Object.entries(got).some(([k, v]) => !/^\d+$/.test(k) || Number(k) >= levels || !isProb(v))) continue;
      const probabilities = got as Record<string, number>;
      answers[id] = { type: 'score', rawScore: a.score, probabilities, ...(conf !== undefined ? { vendorConfidence: conf } : {}) };
    }
  }
  const usage = isObj(raw.usage) ? raw.usage : {};
  const tokens = Number(usage.inputTokens ?? usage.input_tokens ?? 0);
  return {
    answers,
    model: typeof raw.model === 'string' ? raw.model : null,
    inputTokens: Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : 0,
  };
}

/**
 * PURE: the wait before the next attempt, in ms. A Retry-After wins — seconds
 * or an HTTP date — clamped to [1 s, 180 s]. Without one: 2 s doubling, capped
 * at 60 s. `attempt` is the one that just failed (1-based).
 */
export function jevRetryDelayMs(attempt: number, retryAfter: string | null | undefined, nowMs: number): number {
  const clamp = (ms: number) => Math.min(JEV_MAX_RETRY_WAIT_MS, Math.max(1_000, Math.round(ms)));
  const v = (retryAfter ?? '').trim();
  if (v) {
    if (/^\d+(?:\.\d+)?$/.test(v)) return clamp(Number(v) * 1000);
    const at = Date.parse(v);
    if (Number.isFinite(at)) return clamp(at - nowMs);
  }
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt - 1));
}

export type DropReason =
  | 'no-key' | 'queue-full' | 'retries-exhausted' | 'network' | 'malformed' | `http-${number}` | 'unanswered'
  | 'out-of-time'
  /** A private lane's request with zero retention off: refused before it's sent. */
  | 'zdr-required';

/** `raw`: the body as it came back, cut at RAW_MAX_CHARS — only when the caller asked to keep it. */
export type AttemptOutcome =
  | { kind: 'answered'; response: ParsedResponse; status: number; raw?: string }
  /** `shared`: the wait holds every request (the Gateway is busy), not just this one (a network error). */
  | { kind: 'retry'; waitMs: number; shared: boolean; status: number | null; note: string; raw?: string }
  | { kind: 'drop'; reason: DropReason; status: number | null; note: string; raw?: string };

/**
 * One attempt. Never throws. The key is read by the caller and passed in, so
 * this file never touches the environment.
 */
export async function jevAttempt(opts: {
  key: string;
  state: unknown;
  questions: Record<string, JevQuestionWire>;
  /** Ask for zero data retention (CR_JEV_ZDR). */
  zdr: boolean;
  attempt: number;
  fetchImpl: typeof fetch;
  nowMs: () => number;
  timeoutMs?: number;
  /** Keep the raw body on the outcome (the go/no-go call). */
  keepRaw?: boolean;
}): Promise<AttemptOutcome> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? JEV_ATTEMPT_TIMEOUT_MS);
  try {
    const res = await opts.fetchImpl(JEV_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildJevRequestBody(opts.state, opts.questions, { zdr: opts.zdr })),
      signal: ctl.signal,
    });
    const text = await res.text().catch(() => '');
    const kept = opts.keepRaw ? { raw: text.slice(0, RAW_MAX_CHARS) } : {};
    if (!res.ok) {
      const note = text.slice(0, 300);
      if (JEV_RETRY_STATUSES.has(res.status)) {
        return { kind: 'retry', waitMs: jevRetryDelayMs(opts.attempt, res.headers.get('retry-after'), opts.nowMs()), shared: true, status: res.status, note, ...kept };
      }
      // Any other 4xx, including the fail-closed privacy refusal and the 403
      // account gates: asking again gets the same answer.
      return { kind: 'drop', reason: `http-${res.status}`, status: res.status, note, ...kept };
    }
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    const parsed = parseJevResponse(body, opts.questions);
    if (!parsed) return { kind: 'drop', reason: 'malformed', status: res.status, note: 'the body is not an evaluate response', ...kept };
    return { kind: 'answered', response: parsed, status: res.status, ...kept };
  } catch (error) {
    // A timeout or a dropped connection says nothing about the Gateway's window:
    // back off for this request only.
    return { kind: 'retry', waitMs: jevRetryDelayMs(opts.attempt, null, opts.nowMs()), shared: false, status: null, note: String(error).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}
