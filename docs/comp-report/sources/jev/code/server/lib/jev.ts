/**
 * jev.ts — the Jev client (TypeSafe AI's evaluation model, via Vercel AI Gateway).
 *
 * Jev answers typed questions — choice / score / boolean, each with probabilities — about a `state`
 * it is handed. It never writes text. Design: docs/design/jev-decision-layer-2026-09-22.md (§5).
 *
 * ── Privacy, hard-coded (§0.1) ─────────────────────────────────────────────────────────────────
 * Every request carries `disallowPromptTraining: true` — ALWAYS, on every plan, with no switch. It is
 * FAIL-CLOSED on the Gateway: if no provider satisfies it the request errors rather than routing
 * somewhere that would train on a writer's unpublished fiction.
 *
 * `zeroDataRetention: true` is sent ONLY when `JEV_ZERO_DATA_RETENTION=true`. 🔴 TEMPORARY (KJ,
 * 2026-09-23): per-request ZDR needs a Vercel Pro/Enterprise team, the account is on Hobby, and with
 * ZDR hard-coded every Jev call would be refused — RUN-19 would collect nothing before Jev's free window
 * closes (2026-09-25). So ZDR is opt-in until the plan supports it. **The fix is: upgrade the Gateway
 * team to Pro, set `JEV_ZERO_DATA_RETENTION=true` on Railway + locally, then make this unconditional
 * again** (tracked in docs/handoffs/DISPATCH-QUEUE.md). When ZDR is on it also makes the Gateway SKIP
 * any bring-your-own key not explicitly marked ZDR. `scripts/verify-jev-shadow.ts` asserts both shapes.
 *
 * ── Failure is always "no answer", never a guess ───────────────────────────────────────────────
 * No key, a timeout, an HTTP error, a malformed answer → `null`. A caller treats null as "Jev said
 * nothing" and keeps its own decision. Nothing here throws into a caller.
 *
 * Plain `fetch`, like server/gemini.ts — no `ai` SDK dependency (experimental API surface, Node 22.18+,
 * and a dep-audit regen), per the design doc §5.1.
 */
import { recordUsageAmbient } from "./cost-accounting";
import { mblog, mbwarn } from "./mb-log";

export const JEV_MODEL = "typesafe-ai/jev";
export const JEV_ENDPOINT = "https://ai-gateway.vercel.sh/v1/evaluate";
/** Both privacy filters — sent when `JEV_ZERO_DATA_RETENTION=true` (needs a Pro/Enterprise team). */
export const JEV_PROVIDER_OPTIONS = {
  gateway: { disallowPromptTraining: true, zeroDataRetention: true },
} as const;
/** No-training only — the default while the Gateway team is on Hobby. See the header. */
export const JEV_PROVIDER_OPTIONS_NO_ZDR = {
  gateway: { disallowPromptTraining: true },
} as const;

/** Is per-request zero data retention requested? Opt-in (`=true`) until the plan supports it. */
export function jevRequiresZeroDataRetention(): boolean {
  return (process.env.JEV_ZERO_DATA_RETENTION ?? "").trim().toLowerCase() === "true";
}

/** The provider options every request carries. `disallowPromptTraining` is in both shapes. */
export function jevProviderOptions() {
  return jevRequiresZeroDataRetention() ? JEV_PROVIDER_OPTIONS : JEV_PROVIDER_OPTIONS_NO_ZDR;
}

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "boolean"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "score"; instructions: string; criteria: string[] };

export interface JevAnswer {
  type: "choice" | "boolean" | "score";
  /** choice: the chosen option key (validated against the options offered). */
  choice?: string;
  /** choice / score: per-option (or per-level) probabilities. */
  probabilities?: Record<string, number>;
  /** boolean: P(true). choice: the chosen option's probability, copied here for convenience. */
  probability?: number;
  /** choice / score: the vendor's confidence statistic, when returned. */
  confidence?: number;
}

export interface JevResult {
  answers: Record<string, JevAnswer>;
  /** The model the Gateway reports actually served the request (pin-drift evidence). */
  model: string | null;
  inputTokens: number;
}

/** PURE: the exact request body. Split out so the battery can assert it without a network. */
export function buildJevRequestBody(state: unknown, questions: Record<string, JevQuestion>) {
  return { model: JEV_MODEL, state, questions, providerOptions: jevProviderOptions() };
}

const isProb = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/**
 * PURE: validate a raw response against the questions that were asked. An answer that names an
 * option we did not offer, or carries an out-of-range probability, is DROPPED — never repaired.
 */
export function parseJevResponse(raw: any, questions: Record<string, JevQuestion>): JevResult | null {
  if (!raw || typeof raw !== "object" || !raw.answers || typeof raw.answers !== "object") return null;
  const conf = raw.providerMetadata?.typesafe?.confidence ?? {};
  const answers: Record<string, JevAnswer> = {};
  for (const [id, q] of Object.entries(questions)) {
    const a = raw.answers[id];
    if (!a || typeof a !== "object") continue;
    if (q.type === "choice") {
      const keys = Object.keys(q.criteria);
      if (typeof a.choice !== "string" || !keys.includes(a.choice)) continue;
      const probs: Record<string, number> = {};
      for (const k of keys) if (isProb(a.probabilities?.[k])) probs[k] = a.probabilities[k];
      const c = isProb(conf[id]) ? conf[id] : isProb(a.confidence) ? a.confidence : undefined;
      answers[id] = { type: "choice", choice: a.choice, probabilities: probs, probability: probs[a.choice], confidence: c };
    } else if (q.type === "boolean") {
      const p = isProb(a.probability) ? a.probability : isProb(a.noul) ? a.noul : undefined;
      if (p === undefined) continue;
      answers[id] = { type: "boolean", probability: p };
    } else {
      const probs: Record<string, number> = {};
      for (const [k, v] of Object.entries(a.probabilities ?? {})) if (isProb(v)) probs[k] = v as number;
      if (typeof a.score !== "number") continue;
      answers[id] = { type: "score", probabilities: probs, probability: a.score, confidence: isProb(conf[id]) ? conf[id] : undefined };
    }
  }
  const inputTokens = Number(raw.usage?.inputTokens ?? raw.usage?.input_tokens ?? 0) || 0;
  return { answers, model: typeof raw.model === "string" ? raw.model : null, inputTokens };
}

/** Is a Gateway key configured? (Never logs or returns the key.) */
export function jevKeyPresent(): boolean {
  return !!(process.env.AI_GATEWAY_API_KEY ?? "").trim();
}

let warnedNoKey = false;

// ─── Transport: one paced queue for the whole process ─────────────────────────────────────────────
//
// After Jev's free window closed (2026-09-25) the Gateway rate-limits by the minute: a 429 carries a
// Retry-After counting down from ~60 s and about 2–4 requests get through a minute, and it answers 503
// for up to ~2 minutes at a stretch (docs/handoffs/JEV-REASK-633-2026-09-26.md §4). The watch fires in
// bursts — one request per committed segment, one per new name — and the old client tried twice, the
// second time at once, with a 10 s timeout: a RUN-20 canonize would have kept only what fit each
// minute's window and lost the rest behind a log line.
//
// So every request goes through ONE serial queue:
//   · requests START at least JEV_MIN_INTERVAL_MS apart (default 1 s — the limit, not the pace, is
//     what decides throughput; a 429 is how the Gateway tells us the window is spent);
//   · a 429 / 502 / 503 / 504 sets a SHARED cool-down for the whole queue — Retry-After when sent
//     (seconds or an HTTP date), else exponential backoff — so the next request does not spend an
//     attempt learning what the last one was just told;
//   · a network error or timeout is retried the same way; a 4xx other than 429, or a malformed body,
//     is not (asking again gets the same answer);
//   · each request gets JEV_MAX_ATTEMPTS attempts of JEV_ATTEMPT_TIMEOUT_MS each, counted from when it
//     reaches the head of the queue, never from when it was queued;
//   · the queue is bounded (JEV_MAX_QUEUE); past that a request is dropped at once as `queue-full`.
// Every way a request can end without an answer is a named `JevDropReason`, so the caller can record
// the drop — the watch's coverage is measured, not assumed. What Jev is asked and what it answers are
// unchanged: this is transport only.

/** Statuses that mean "the Gateway or the upstream is busy — ask again later". */
export const JEV_RETRY_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);
/** Attempts per request. The probe needed twelve to ride out 112 s of 503s (#967). */
export const JEV_MAX_ATTEMPTS = 12;
/** One attempt's timeout. #944 made a citation request carry a passage per atom; 10 s was measured on
 *  the old, smaller requests only. */
export const JEV_ATTEMPT_TIMEOUT_MS = 30_000;
/** Longest wait a Retry-After can impose; longer values are clamped (a clock skew should not park the
 *  queue for an hour). */
export const JEV_MAX_RETRY_WAIT_MS = 180_000;
/** Queued requests beyond this are dropped as `queue-full`. A full RUN-19 canonize asked ~500. */
export const JEV_MAX_QUEUE = 5_000;
const DEFAULT_MIN_INTERVAL_MS = 1_000;

export type JevDropReason =
  | "no-key" | "queue-full" | "shutdown" | "retries-exhausted" | "network" | "malformed" | `http-${number}`;

export type JevOutcome =
  | { ok: true; result: JevResult; attempts: number; waitedMs: number }
  | { ok: false; reason: JevDropReason; attempts: number; lastStatus: number | null; waitedMs: number };

/**
 * PURE: how long to wait before the next attempt, in ms. A Retry-After header wins — as delta-seconds
 * or as an HTTP date (measured against `nowMs`) — clamped to [1 s, JEV_MAX_RETRY_WAIT_MS]. Without one,
 * exponential backoff from 2 s, capped at 60 s. `attempt` is the attempt that just failed (1-based).
 */
export function jevRetryDelayMs(attempt: number, retryAfter: string | null | undefined, nowMs: number = Date.now()): number {
  const clamp = (ms: number) => Math.min(JEV_MAX_RETRY_WAIT_MS, Math.max(1_000, Math.round(ms)));
  const v = (retryAfter ?? "").trim();
  if (v) {
    if (/^\d+(?:\.\d+)?$/.test(v)) return clamp(Number(v) * 1000);
    const at = Date.parse(v);
    if (Number.isFinite(at)) return clamp(at - nowMs);
  }
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt - 1));
}

/** The pacing interval between request starts. `JEV_MIN_INTERVAL_MS` overrides the 1 s default. */
export function jevMinIntervalMs(): number {
  const n = Number((process.env.JEV_MIN_INTERVAL_MS ?? "").trim());
  return Number.isFinite(n) && n >= 0 && (process.env.JEV_MIN_INTERVAL_MS ?? "").trim() !== "" ? n : DEFAULT_MIN_INTERVAL_MS;
}

interface QueueItem {
  state: unknown; questions: Record<string, JevQuestion>; scope: string; enqueuedAt: number;
  fetchImpl: typeof fetch; timeoutMs: number; resolve: (o: JevOutcome) => void;
}

/** Injected by the battery so the queue can be driven without real time. */
export interface JevClock { now(): number; sleep(ms: number): Promise<void> }
const realClock: JevClock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/**
 * The paced queue. One instance serves the process (`jevQueue`); the battery builds its own with a
 * fake clock. Serial on purpose: the Gateway's limit is per minute, so parallel requests only reach
 * the 429 sooner.
 */
export class JevQueue {
  private items: QueueItem[] = [];
  private running = false;
  private nextStartAt = 0;
  /** The shared cool-down: no request starts before this, whoever was told to wait. */
  private coolUntil = 0;
  private closed = false;
  readonly stats = { enqueued: 0, answered: 0, dropped: 0, retries: 0, cooldowns: 0, byReason: {} as Record<string, number> };

  constructor(private clock: JevClock = realClock, private opts: { minIntervalMs?: () => number; maxQueue?: number; maxAttempts?: number } = {}) {}

  get pending(): number { return this.items.length + (this.running ? 1 : 0); }

  enqueue(item: Omit<QueueItem, "resolve" | "enqueuedAt">): Promise<JevOutcome> {
    return new Promise<JevOutcome>((resolve) => {
      const full = this.items.length >= (this.opts.maxQueue ?? JEV_MAX_QUEUE);
      if (this.closed || full) {
        this.count(false, this.closed ? "shutdown" : "queue-full");
        resolve({ ok: false, reason: this.closed ? "shutdown" : "queue-full", attempts: 0, lastStatus: null, waitedMs: 0 });
        return;
      }
      this.stats.enqueued++;
      this.items.push({ ...item, enqueuedAt: this.clock.now(), resolve });
      void this.drain();
    });
  }

  /** Drop everything still queued as `shutdown` (a redeploy). Returns how many were dropped. */
  shutdown(): number {
    this.closed = true;
    const left = this.items.splice(0);
    for (const it of left) {
      this.count(false, "shutdown");
      it.resolve({ ok: false, reason: "shutdown", attempts: 0, lastStatus: null, waitedMs: this.clock.now() - it.enqueuedAt });
    }
    return left.length;
  }

  private count(ok: boolean, reason?: string) {
    if (ok) { this.stats.answered++; return; }
    this.stats.dropped++;
    if (reason) this.stats.byReason[reason] = (this.stats.byReason[reason] ?? 0) + 1;
  }

  private async waitTurn(): Promise<void> {
    const until = Math.max(this.nextStartAt, this.coolUntil);
    const now = this.clock.now();
    if (until > now) await this.clock.sleep(until - now);
    this.nextStartAt = this.clock.now() + (this.opts.minIntervalMs ?? jevMinIntervalMs)();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.items.length) {
        const it = this.items.shift()!;
        const out = await this.run(it);
        this.count(out.ok, out.ok ? undefined : out.reason);
        it.resolve(out);
      }
    } finally {
      this.running = false;
    }
  }

  private async run(it: QueueItem): Promise<JevOutcome> {
    const key = (process.env.AI_GATEWAY_API_KEY ?? "").trim();
    const waited = () => this.clock.now() - it.enqueuedAt;
    if (!key) return { ok: false, reason: "no-key", attempts: 0, lastStatus: null, waitedMs: waited() };
    const body = JSON.stringify(buildJevRequestBody(it.state, it.questions));
    const maxAttempts = this.opts.maxAttempts ?? JEV_MAX_ATTEMPTS;
    let lastStatus: number | null = null;
    let lastWasNetwork = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (this.closed) return { ok: false, reason: "shutdown", attempts: attempt - 1, lastStatus, waitedMs: waited() };
      await this.waitTurn();
      const startedAt = this.clock.now();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), it.timeoutMs);
      try {
        const res = await it.fetchImpl(JEV_ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body,
          signal: ctl.signal,
        });
        lastStatus = res.status;
        lastWasNetwork = false;
        if (!res.ok) {
          const text = (await res.text().catch(() => "")).slice(0, 300);
          if (JEV_RETRY_STATUSES.has(res.status)) {
            const delay = jevRetryDelayMs(attempt, res.headers.get("retry-after"), this.clock.now());
            this.coolUntil = Math.max(this.coolUntil, this.clock.now() + delay);
            this.stats.retries++; this.stats.cooldowns++;
            mblog("jev", "gateway_busy", { scope: it.scope, status: res.status, attempt, waitMs: delay, queued: this.items.length });
            continue;
          }
          mbwarn("jev", "http_error", { scope: it.scope, status: res.status, attempt, text });
          return { ok: false, reason: `http-${res.status}`, attempts: attempt, lastStatus, waitedMs: waited() };
        }
        const parsed = parseJevResponse(await res.json().catch(() => null), it.questions);
        if (!parsed) {
          mbwarn("jev", "malformed_response", { scope: it.scope });
          return { ok: false, reason: "malformed", attempts: attempt, lastStatus, waitedMs: waited() };
        }
        void recordUsageAmbient(JEV_MODEL, { inputTokens: parsed.inputTokens, outputTokens: 0 }, this.clock.now() - startedAt, it.scope);
        mblog("jev", "evaluated", { scope: it.scope, model: parsed.model, questions: Object.keys(it.questions).length, answered: Object.keys(parsed.answers).length, attempts: attempt, waitedMs: waited(), queued: this.items.length });
        return { ok: true, result: parsed, attempts: attempt, waitedMs: waited() };
      } catch (err) {
        // A timeout or a dropped connection: back off like a 503, but for this request only — it says
        // nothing about the Gateway's window.
        lastWasNetwork = true;
        this.stats.retries++;
        mbwarn("jev", "request_failed", { scope: it.scope, attempt, error: String(err).slice(0, 200) });
        if (attempt < maxAttempts) await this.clock.sleep(jevRetryDelayMs(attempt, null));
      } finally {
        clearTimeout(timer);
      }
    }
    mbwarn("jev", "retries_exhausted", { scope: it.scope, attempts: maxAttempts, lastStatus, waitedMs: waited() });
    return { ok: false, reason: lastWasNetwork ? "network" : "retries-exhausted", attempts: maxAttempts, lastStatus, waitedMs: waited() };
  }
}

/** The process's queue. Every Jev request made through this module goes through it. */
export const jevQueue = new JevQueue();

/** Drop everything still queued (the server is shutting down). Returns how many were dropped. */
export function jevShutdown(): number {
  const n = jevQueue.shutdown();
  if (n) mbwarn("jev", "shutdown_dropped", { dropped: n });
  return n;
}

/**
 * Ask Jev, and say how it went. Never throws. The request waits its turn in the paced queue, so the
 * promise can take minutes to settle under the Gateway's rate limit — callers that must not wait
 * (the watch) fire it with `void`. Jev input is priced by the `typesafe-jev` row ($0.042/Mtok, output
 * free) under `scope`. `fetchImpl` / `queue` are injectable for the battery.
 */
export async function jevEvaluateDetailed(
  state: unknown,
  questions: Record<string, JevQuestion>,
  opts: { scope: string; fetchImpl?: typeof fetch; timeoutMs?: number; queue?: JevQueue },
): Promise<JevOutcome> {
  if (!jevKeyPresent()) {
    if (!warnedNoKey) { warnedNoKey = true; mbwarn("jev", "no_gateway_key", { scope: opts.scope }); }
    return { ok: false, reason: "no-key", attempts: 0, lastStatus: null, waitedMs: 0 };
  }
  return (opts.queue ?? jevQueue).enqueue({
    state, questions, scope: opts.scope, fetchImpl: opts.fetchImpl ?? fetch, timeoutMs: opts.timeoutMs ?? JEV_ATTEMPT_TIMEOUT_MS,
  });
}

/** Ask Jev. Returns null on ANY failure (see the header); `jevEvaluateDetailed` says which. */
export async function jevEvaluate(
  state: unknown,
  questions: Record<string, JevQuestion>,
  opts: { scope: string; fetchImpl?: typeof fetch; timeoutMs?: number; queue?: JevQueue },
): Promise<JevResult | null> {
  const out = await jevEvaluateDetailed(state, questions, opts);
  return out.ok ? out.result : null;
}
