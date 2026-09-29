/**
 * verify-jev-transport.ts — PURE. The Jev watch survives the Gateway's rate limit: requests are queued
 * and paced, a 429's Retry-After holds the WHOLE queue, 503 streaks are ridden out, and every request
 * that still ends without an answer ends with a named reason the watch records.
 *
 *   DATABASE_URL=postgres://x:x@127.0.0.1:5432/x npx tsx scripts/verify-jev-transport.ts
 *
 * The Gateway is simulated as #967 measured it after Jev's free window closed (2026-09-25): a per-minute
 * window of a few requests, a 429 whose Retry-After counts down to the window's end, and 503 for up to
 * ~2 minutes at a stretch (docs/handoffs/JEV-REASK-633-2026-09-26.md §4). No network, no real time: the
 * queue runs on a fake clock.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JEV_MAX_ATTEMPTS, JEV_MAX_RETRY_WAIT_MS, JevQueue, jevEvaluateDetailed, jevRetryDelayMs, type JevQuestion,
} from "../server/lib/jev.js";
import { CITATION_ATOMS_PER_REQUEST, buildCitationQuestions, dropOf } from "../server/lib/jev-shadow.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks: { ok: boolean; note: string }[] = [];
const ok = (cond: boolean, note: string) => { checks.push({ ok: cond, note }); if (!cond) console.log(`  ❌ ${note}`); };
const code = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const QS: Record<string, JevQuestion> = { b: { type: "boolean", instructions: "?" } };
const ANSWER = JSON.stringify({ model: "jev-test", answers: { b: { type: "boolean", probability: 0.9 } }, usage: { inputTokens: 100 } });

function fakeClock() {
  const c = { t: 0, now: () => c.t, sleep: async (ms: number) => { c.t += Math.max(0, ms); } };
  return c;
}

/** A Gateway with a fixed per-minute window: `perMinute` requests, then 429 + Retry-After to the window's end. */
function rateLimitedGateway(clock: { now(): number }, perMinute: number) {
  let windowStart = 0, used = 0;
  const starts: number[] = [], rejectedAt: number[] = [];
  const fetchImpl = (async () => {
    const t = clock.now();
    if (t >= windowStart + 60_000) { windowStart = t - (t % 60_000); used = 0; }
    starts.push(t);
    if (used >= perMinute) {
      rejectedAt.push(t);
      const secs = Math.ceil((windowStart + 60_000 - t) / 1000);
      return new Response("rate limited", { status: 429, headers: { "retry-after": String(secs) } });
    }
    used++;
    return new Response(ANSWER, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, starts, rejectedAt };
}

async function main() {
  const savedKey = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test-key-not-real";

  console.log("── 1 · the wait before a retry ──");
  ok(jevRetryDelayMs(1, "60") === 60_000, "Retry-After: 60 → 60 s");
  ok(jevRetryDelayMs(1, "0") === 1_000 && jevRetryDelayMs(1, "0.2") === 1_000, "a zero or sub-second Retry-After waits 1 s, never 0");
  ok(jevRetryDelayMs(1, "86400") === JEV_MAX_RETRY_WAIT_MS, `an absurd Retry-After is clamped to ${JEV_MAX_RETRY_WAIT_MS / 1000} s`);
  const now = Date.parse("2026-09-26T12:00:00Z");
  ok(jevRetryDelayMs(1, "Sat, 26 Sep 2026 12:00:30 GMT", now) === 30_000, "an HTTP-date Retry-After is measured against now (30 s)");
  ok([1, 2, 3, 4, 5, 6, 7].map((a) => jevRetryDelayMs(a, null)).join(",") === "2000,4000,8000,16000,32000,60000,60000",
    "no Retry-After → 2 s doubling, capped at 60 s");

  console.log("── 2 · a burst under a per-minute limit: every request answered ──");
  {
    const clock = fakeClock();
    const gw = rateLimitedGateway(clock, 3);
    const queue = new JevQueue(clock, { minIntervalMs: () => 1_000 });
    const outs = await Promise.all(Array.from({ length: 20 }, () => jevEvaluateDetailed({}, QS, { scope: "t", queue, fetchImpl: gw.fetchImpl })));
    ok(outs.every((o) => o.ok), `20 requests fired at once, 3 allowed a minute: ${outs.filter((o) => o.ok).length} answered, ${outs.filter((o) => !o.ok).length} dropped`);
    ok(gw.rejectedAt.length <= 7, `the shared cool-down keeps 429s to about one per window (${gw.rejectedAt.length} for 7 windows)`);
    const afterReject = gw.rejectedAt.every((r) => !gw.starts.some((s) => s > r && s < r + 1_000));
    ok(afterReject, "after a 429, NO request starts until the Retry-After has passed — the whole queue waits, not just the one told");
    ok(clock.t >= 6 * 60_000 && clock.t < 8 * 60_000, `it takes as long as the limit says (${(clock.t / 60_000).toFixed(1)} min for 20 at 3/min)`);
    ok(queue.stats.answered === 20 && queue.stats.dropped === 0 && queue.stats.enqueued === 20, "the queue's own counts agree: 20 enqueued, 20 answered, 0 dropped");
  }
  {
    // The OLD client, replayed on the same Gateway: two tries, the second at once.
    const clock = fakeClock();
    const gw = rateLimitedGateway(clock, 3);
    let answered = 0;
    for (let i = 0; i < 20; i++) {
      for (let a = 1; a <= 2; a++) { const r = await gw.fetchImpl("x" as any); if (r.ok) { answered++; break; } }
    }
    ok(answered === 3, `before: the old two-try client keeps ${answered} of the same 20 — the rest were lost behind a log line`);
  }

  console.log("── 3 · pacing ──");
  {
    const clock = fakeClock();
    const starts: number[] = [];
    const queue = new JevQueue(clock, { minIntervalMs: () => 1_000 });
    await Promise.all(Array.from({ length: 5 }, () => jevEvaluateDetailed({}, QS, { scope: "t", queue,
      fetchImpl: (async () => { starts.push(clock.now()); return new Response(ANSWER, { status: 200 }); }) as any })));
    const gaps = starts.slice(1).map((s, i) => s - starts[i]);
    ok(gaps.every((g) => g >= 1_000), `requests start at least the interval apart (${gaps.join(", ")} ms)`);
  }

  console.log("── 4 · a 503 streak is ridden out ──");
  {
    const clock = fakeClock();
    const queue = new JevQueue(clock, { minIntervalMs: () => 0 });
    let calls = 0;
    const out = await jevEvaluateDetailed({}, QS, { scope: "t", queue, fetchImpl: (async () => {
      calls++; return clock.now() < 112_000 ? new Response("upstream down", { status: 503 }) : new Response(ANSWER, { status: 200 });
    }) as any });
    ok(out.ok && calls <= JEV_MAX_ATTEMPTS, `503 for 112 s straight (#967's worst stretch), then fine → answered after ${calls} attempts`);
  }
  {
    const clock = fakeClock();
    const queue = new JevQueue(clock, { minIntervalMs: () => 0 });
    let calls = 0;
    const out = await jevEvaluateDetailed({}, QS, { scope: "t", queue, fetchImpl: (async () => {
      calls++; if (calls < 3) throw new Error("socket hang up"); return new Response(ANSWER, { status: 200 });
    }) as any });
    ok(out.ok && out.attempts === 3, "a dropped connection or timeout is retried (answered on attempt 3)");
    let calls2 = 0;
    const net = await jevEvaluateDetailed({}, QS, { scope: "t", queue, fetchImpl: (async () => { calls2++; throw new Error("ECONNRESET"); }) as any });
    ok(!net.ok && net.reason === "network" && calls2 === JEV_MAX_ATTEMPTS, `a network that never comes back → dropped as network after ${calls2} attempts`);
  }

  console.log("── 5 · what is not retried, and every drop has a name ──");
  {
    const clock = fakeClock();
    const queue = new JevQueue(clock, { minIntervalMs: () => 0 });
    let n = 0;
    const bad = await jevEvaluateDetailed({}, QS, { scope: "t", queue, fetchImpl: (async () => { n++; return new Response("{not json", { status: 200 }); }) as any });
    ok(!bad.ok && bad.reason === "malformed" && n === 1, "a malformed body is dropped as malformed, not asked again");
    const forbidden = await jevEvaluateDetailed({}, QS, { scope: "t", queue, fetchImpl: (async () => new Response("no", { status: 403 })) as any });
    ok(!forbidden.ok && forbidden.reason === "http-403", "a 403 is dropped as http-403 at once");
    delete process.env.AI_GATEWAY_API_KEY;
    const nokey = await jevEvaluateDetailed({}, QS, { scope: "t", queue, fetchImpl: (async () => { throw new Error("must not be called"); }) as any });
    ok(!nokey.ok && nokey.reason === "no-key", "no Gateway key → dropped as no-key, nothing sent");
    process.env.AI_GATEWAY_API_KEY = "test-key-not-real";
  }
  {
    const clock = fakeClock();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const queue = new JevQueue(clock, { minIntervalMs: () => 0, maxQueue: 2 });
    const f = (async () => { await gate; return new Response(ANSWER, { status: 200 }); }) as any;
    const ps = Array.from({ length: 5 }, () => jevEvaluateDetailed({}, QS, { scope: "t", queue, fetchImpl: f }));
    const early = await Promise.race([Promise.all(ps.slice(3)), new Promise((r) => setTimeout(() => r(null), 50))]) as any[] | null;
    ok(!!early && early.every((o: any) => !o.ok && o.reason === "queue-full"), "one running + 2 queued: the 4th and 5th are dropped at once as queue-full");
    release();
    const done = await Promise.all(ps.slice(0, 3));
    ok(done.every((o) => o.ok), "…and the three it took are answered");
  }
  {
    const clock = fakeClock();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const queue = new JevQueue(clock, { minIntervalMs: () => 0 });
    const f = (async () => { await gate; return new Response(ANSWER, { status: 200 }); }) as any;
    const ps = Array.from({ length: 4 }, () => jevEvaluateDetailed({}, QS, { scope: "t", queue, fetchImpl: f }));
    await new Promise((r) => setTimeout(r, 10));
    const n = queue.shutdown();
    ok(n === 3, `shutdown drops the 3 still queued (the one in flight finishes) — ${n}`);
    release();
    const outs = await Promise.all(ps);
    ok(outs.filter((o) => !o.ok && o.reason === "shutdown").length === 3 && outs[0].ok, "each dropped request settles as `shutdown`, so the watch records it");
    const late = await jevEvaluateDetailed({}, QS, { scope: "t", queue, fetchImpl: f });
    ok(!late.ok && late.reason === "shutdown", "a request after shutdown is dropped as shutdown, never sent");
  }

  console.log("── 6 · the watch records every drop ──");
  ok(dropOf({ ok: false, reason: "retries-exhausted", attempts: 12, lastStatus: 503, waitedMs: 300_000 })?.reason === "retries-exhausted", "a failed outcome becomes a drop row");
  ok(dropOf({ ok: true, result: { answers: {}, model: null, inputTokens: 0 }, attempts: 1, waitedMs: 0 }) === null, "an answered one does not");
  const shadow = code("server/lib/jev-shadow.ts");
  ok(!/\bjevEvaluate\(/.test(shadow) && (shadow.match(/jevEvaluateDetailed\(/g) ?? []).length === 2,
    "the watch asks through jevEvaluateDetailed (which says WHY) in both lanes, never the null-only jevEvaluate");
  const kindFn = shadow.slice(shadow.indexOf("export async function jevShadowKind"), shadow.indexOf("async function askCitations"));
  ok((kindFn.match(/recordDrop\(/g) ?? []).length === 2, "kind lane: a failed request AND a reply without a kind are both recorded");
  const cit = shadow.slice(shadow.indexOf("async function askCitations"));
  ok((cit.match(/recordDrop\(/g) ?? []).length === 3, "citation lane: no passage, a failed request, and each atom left unanswered are all recorded");
  ok(/INSERT INTO jev_watch_drops/.test(shadow), "drops go to jev_watch_drops, never into jev_observations (whose readers treat a row as an answer)");
  const atoms = Array.from({ length: 95 }, (_, i) => ({ subject: `s${i}`, predicate: "p", quote: "q" }));
  ok(Object.keys(buildCitationQuestions("x", atoms).questions).length === CITATION_ATOMS_PER_REQUEST, "one request still holds at most 40 atoms…");
  ok(/for \(let from = 0; from < askable\.length; from \+= CITATION_ATOMS_PER_REQUEST\)/.test(shadow),
    "…and a segment with more is asked in further requests, not silently cut at 40");

  console.log("── 7 · wiring ──");
  const jev = code("server/lib/jev.ts");
  ok(!/attempt <= 2/.test(jev) && /export const jevQueue = new JevQueue\(\)/.test(jev), "one process-wide queue; the two-try loop is gone");
  ok(/return \(opts\.queue \?\? jevQueue\)\.enqueue\(/.test(jev), "every request made through jev.ts goes through the queue");
  const idx = code("server/index.ts");
  ok(/const shutdown = \(sig: string\) => \{[\s\S]{0,400}jevShutdown\(\);/.test(idx), "a SIGTERM/SIGINT settles the queue's leftovers as `shutdown` drops before exit");
  const mig = readFileSync(path.join(ROOT, "db/migrations/117_add_jev_watch_drops.sql"), "utf8");
  ok(/CREATE TABLE IF NOT EXISTS jev_watch_drops/.test(mig) && /questions\s+integer NOT NULL/.test(mig) && /reason\s+text NOT NULL/.test(mig),
    "migration 117: one row per dropped request, with its question count and reason");
  const audit = code("scripts/audit-jev-agreement.ts");
  ok(/FROM jev_watch_drops/.test(audit) && /UNMEASURED/.test(audit), "the agreement audit reports coverage, and a run older than the ledger reads UNMEASURED, not 100%");

  if (savedKey === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = savedKey;
  for (const c of checks) if (c.ok) console.log(`  ✅ ${c.note}`);
  const pass = checks.filter((c) => c.ok).length;
  console.log(`\nverify-jev-transport: ${pass}/${checks.length} passed`);
  console.log(pass === checks.length ? "PASS" : "FAIL");
  process.exit(pass === checks.length ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
