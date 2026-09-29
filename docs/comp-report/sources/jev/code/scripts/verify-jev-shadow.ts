/**
 * verify-jev-shadow.ts — PURE. Jev watch mode ACTS ON NOTHING, keeps a writer's fiction out of anyone's
 * training data, and is priced as what it is.
 *
 *   DATABASE_URL=postgres://x:x@127.0.0.1:5432/x npx tsx scripts/verify-jev-shadow.ts
 *
 * KJ (2026-09-23): Jev becomes the card mediator only after its accuracy is measured, so this slice
 * only WATCHES. The property that matters most is therefore a negative one — the watch path contains
 * no write but its own observation row — and a negative cannot be shown by running it, only by reading
 * it. §4 reads it. No network: the client is exercised through an injected fetch.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JEV_ENDPOINT, JEV_MAX_ATTEMPTS, JEV_MODEL, JEV_PROVIDER_OPTIONS, JEV_PROVIDER_OPTIONS_NO_ZDR, JevQueue, buildJevRequestBody, jevEvaluate,
  jevEvaluateDetailed, parseJevResponse, type JevQuestion,
} from "../server/lib/jev.js";
import { buildCitationQuestions, buildKindQuestion, jevShadowEnabled, KIND_OPTION_TEXT } from "../server/lib/jev-shadow.js";
import { ENTITY_KINDS } from "../server/pipeline/step-classify.js";
import { computeCostUsd, pricingFor, pricingKeyFor } from "../server/lib/cost-accounting.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks: { ok: boolean; note: string }[] = [];
const ok = (cond: boolean, note: string) => { checks.push({ ok: cond, note }); if (!cond) console.log(`  ❌ ${note}`); };
const code = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

async function main() {
  console.log("── 1 · no-training is hard-coded; ZDR is opt-in until the plan supports it ──");
  ok(JEV_PROVIDER_OPTIONS.gateway.disallowPromptTraining === true, "disallowPromptTraining: true (no provider that trains on input)");
  ok(JEV_PROVIDER_OPTIONS.gateway.zeroDataRetention === true, "the ZDR shape: zeroDataRetention: true");
  ok(JEV_PROVIDER_OPTIONS_NO_ZDR.gateway.disallowPromptTraining === true && !("zeroDataRetention" in JEV_PROVIDER_OPTIONS_NO_ZDR.gateway),
    "the default shape still refuses training; it only omits ZDR");
  const q1 = { q: { type: "boolean" as const, instructions: "?" } };
  const savedZdr = process.env.JEV_ZERO_DATA_RETENTION;
  delete process.env.JEV_ZERO_DATA_RETENTION;
  const bodyDefault = buildJevRequestBody({ x: 1 }, q1) as any;
  ok(bodyDefault.providerOptions === JEV_PROVIDER_OPTIONS_NO_ZDR && bodyDefault.model === JEV_MODEL, "default (Hobby): no-training only");
  process.env.JEV_ZERO_DATA_RETENTION = "true";
  const bodyZdr = buildJevRequestBody({ x: 1 }, q1) as any;
  ok(bodyZdr.providerOptions === JEV_PROVIDER_OPTIONS, "JEV_ZERO_DATA_RETENTION=true: both flags");
  if (savedZdr === undefined) delete process.env.JEV_ZERO_DATA_RETENTION; else process.env.JEV_ZERO_DATA_RETENTION = savedZdr;
  const jevSrc = code("server/lib/jev.ts");
  ok(!/disallowPromptTraining:\s*false|zeroDataRetention:\s*false/.test(jevSrc), "no code path in jev.ts sets either flag false");
  ok(!/providerOptions:(?!\s*jevProviderOptions\(\))/.test(jevSrc), "providerOptions only ever comes from jevProviderOptions()");

  console.log("── 2 · the client: no key → no call; failure → null, never a guess ──");
  const qs: Record<string, JevQuestion> = { kind: { type: "choice", instructions: "?", criteria: { character: "a", location: "b" } } };
  // A queue on a fake clock, so the transport's waits cost no real time (verify-jev-transport covers pacing).
  let t = 0;
  const queue = new JevQueue({ now: () => t, sleep: async (ms) => { t += ms; } }, { minIntervalMs: () => 0 });
  const savedKey = process.env.AI_GATEWAY_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  let called = 0;
  const noKey = await jevEvaluate({}, qs, { scope: "t", queue, fetchImpl: (async () => { called++; return new Response("{}"); }) as any });
  ok(noKey === null && called === 0, "no AI_GATEWAY_API_KEY → null, and nothing is sent");
  process.env.AI_GATEWAY_API_KEY = "test-key-not-real";
  let seen: any = null;
  const good = await jevEvaluate({ name: "The Ring" }, qs, { scope: "t", queue, fetchImpl: (async (url: string, init: any) => {
    seen = { url, init };
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers: { kind: { type: "choice", choice: "character", probabilities: { character: 0.2, location: 0.8 } } }, usage: { inputTokens: 300 } }), { status: 200 });
  }) as any });
  ok(seen?.url === JEV_ENDPOINT && seen.init.method === "POST", "POSTs to the Gateway evaluate endpoint");
  ok(/^Bearer /.test(seen?.init.headers.Authorization), "authenticates with the Gateway key (Gateway's own credentials, not BYOK)");
  const sent = JSON.parse(seen?.init.body ?? "{}");
  ok(sent.providerOptions?.gateway?.disallowPromptTraining === true,
    "the bytes on the wire carry the no-training flag");
  ok(good?.answers.kind?.choice === "character" && good?.model === "jev-1.13.0", "a valid answer parses, with the serving model recorded");
  let tries = 0;
  const failing = await jevEvaluateDetailed({}, qs, { scope: "t", queue, fetchImpl: (async () => { tries++; return new Response("down", { status: 503 }); }) as any });
  ok(!failing.ok && failing.reason === "retries-exhausted" && tries === JEV_MAX_ATTEMPTS,
    `a 503 that never clears is retried ${JEV_MAX_ATTEMPTS} times, then dropped as retries-exhausted (${tries} tries)`);
  const refused = await jevEvaluateDetailed({}, qs, { scope: "t", queue, fetchImpl: (async () => new Response("no ZDR provider", { status: 400 })) as any });
  ok(!refused.ok && refused.reason === "http-400" && refused.attempts === 1,
    "a 400 (e.g. the Gateway refusing: no ZDR/no-training provider) → dropped as http-400 at once, fail-closed, no fallback");
  if (savedKey === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = savedKey;
  ok(parseJevResponse({ answers: { kind: { type: "choice", choice: "starship" } } }, qs)?.answers.kind === undefined,
    "an answer naming an option we did not offer is DROPPED, never repaired");
  ok(parseJevResponse({ answers: { b: { type: "boolean", probability: 1.7 } } }, { b: { type: "boolean", instructions: "?" } })?.answers.b === undefined,
    "an out-of-range probability is dropped");
  ok(parseJevResponse(null, qs) === null && parseJevResponse({}, qs) === null, "a malformed body is null");

  console.log("── 3 · priced as Jev, not as Sonnet ──");
  ok(pricingKeyFor(JEV_MODEL) === "typesafe-jev", "typesafe-ai/jev resolves to its own price row (not the Sonnet-4.6 fallback)");
  ok(pricingFor(JEV_MODEL).input === 0.042 && pricingFor(JEV_MODEL).output === 0, "$0.042 per 1M input tokens, output free");
  ok(Math.abs(computeCostUsd(JEV_MODEL, { inputTokens: 1_000_000, outputTokens: 1_000_000 }) - 0.042) < 1e-12, "1M in + 1M out costs $0.042");
  ok(pricingKeyFor("claude-sonnet-5") === "claude-sonnet-5", "…and the new matcher did not capture any other model");

  console.log("── 4 · 🔴 WATCH MODE ACTS ON NOTHING ──");
  for (const f of ["server/lib/jev-shadow.ts", "server/lib/jev.ts"]) {
    const src = code(f);
    const inserts = Array.from(src.matchAll(/INSERT\s+INTO\s+([a-z_]+)/gi)).map((m) => m[1]);
    const allowed = f.endsWith("jev-shadow.ts") ? ["jev_observations", "jev_watch_drops"] : [];
    ok(inserts.every((x) => allowed.includes(x)), `${f}: INSERTs only into ${allowed.join(" / ") || "nothing"} (${inserts.join(", ") || "none"})`);
    ok(!/\bUPDATE\s+[a-z_]+\s+SET\b|\bDELETE\s+FROM\b/i.test(src), `${f}: no UPDATE, no DELETE`);
    ok(!/\bdb\s*\.\s*(insert|update|delete)\s*\(/.test(src), `${f}: no Drizzle write builder`);
    ok(!/from\s+"\.\.\/graph|from\s+"\.\/graph|graph-mutations|canon-branches|draft-review|story-store|entity-writer|mutation-primitives/.test(src),
      `${f}: imports no module that writes the story graph, cards or branches`);
  }
  const shadow = code("server/lib/jev-shadow.ts");
  ok(/import \{ ENTITY_KINDS \} from "\.\.\/pipeline\/step-classify"/.test(shadow), "jev-shadow takes only the kind VOCABULARY from step-classify");
  for (const [file, fn] of [["server/graph.ts", "jevShadowKind"], ["server/pipeline/canonize.ts", "jevShadowCitations"]] as const) {
    const src = code(file);
    const uses = Array.from(src.matchAll(new RegExp(`[^\\n]*\\b${fn}\\(`, "g"))).map((m) => m[0]);
    ok(uses.length === 1, `${file}: ${fn} is called exactly once (found ${uses.length})`);
    ok(uses.every((u) => /if \(jevShadowEnabled\(\)\) void /.test(u)),
      `${file}: …fire-and-forget (\`void\`), behind the switch, its result never read — so nothing downstream can depend on it`);
  }
  ok(/const kind = await classifyEntityKind\(name, ctx\);[\s\S]{0,600}?return kind;/.test(code("server/graph.ts")),
    "graph.ts: the kind returned is the platform's own, computed BEFORE the watch call and returned unchanged");

  console.log("── 5 · off by default ──");
  const saved = process.env.JEV_SHADOW;
  delete process.env.JEV_SHADOW; const off = jevShadowEnabled();
  process.env.JEV_SHADOW = "1"; const one = jevShadowEnabled();
  process.env.JEV_SHADOW = "true"; const on = jevShadowEnabled();
  if (saved === undefined) delete process.env.JEV_SHADOW; else process.env.JEV_SHADOW = saved;
  ok(!off && !one && on, "OFF unless JEV_SHADOW is literally \"true\" (an opt-in, like PREDICATE_MODEL_REVIEW)");

  console.log("── 6 · the questions ──");
  const k = buildKindQuestion("Black Markets", "Black Markets runs the fights in Cato City.");
  const opts = Object.keys((k.questions.kind as any).criteria);
  ok(JSON.stringify(opts) === JSON.stringify([...ENTITY_KINDS]), "the kind options are the platform's own 13 kinds, in fixed order — agreement compares like with like");
  ok(opts.length <= 255 && ENTITY_KINDS.every((x) => (KIND_OPTION_TEXT as any)[x]?.length > 20), "every kind has a real description, under Jev's 255-option cap");
  ok(!(k.questions.kind as any).instructions.includes("Black Markets") && k.state.name === "Black Markets",
    "story text lives in STATE only, never in question text (injection hygiene)");
  const c = buildCitationQuestions("Manx dies in the fire. Blaze escapes.", [
    { subject: "Blaze", predicate: "has_status", object: "deceased" }, { subject: "Manx", predicate: "has_status", object: "deceased" }]);
  ok(Object.keys(c.questions).length === 2 && c.state.atoms[0].subject === "Blaze", "one boolean per atom, numbered in state");
  ok(Object.values(c.questions).every((q) => !q.instructions.includes("Blaze") && !q.instructions.includes("Manx")), "…no subject name in any question text");
  ok(Object.keys(buildCitationQuestions("x", Array.from({ length: 60 }, () => ({ subject: "s", predicate: "p" }))).questions).length === 40, "capped at 40 atoms per request");

  for (const cc of checks) if (cc.ok) console.log(`  ✅ ${cc.note}`);
  const pass = checks.filter((cc) => cc.ok).length;
  console.log(`\nverify-jev-shadow: ${pass}/${checks.length} passed`);
  console.log(pass === checks.length ? "PASS" : "FAIL");
  process.exit(pass === checks.length ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
