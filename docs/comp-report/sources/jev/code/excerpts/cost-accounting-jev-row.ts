// EXCERPT — server/lib/cost-accounting.ts (MindBinder @ main 5cc386d4). The Jev price row and the matcher line.
// Without an explicit row, MindBinder's ledger priced Jev at its Sonnet fallback ($3/M), ~71x too high.

  // TypeSafe AI's Jev via Vercel AI Gateway (vercel.com/ai-gateway/models/jev + docs.typesafe.ai/models,
  // verified 2026-09-22): $0.042 per 1M input tokens, output NOT billed (it returns choices and
  // probabilities, never text). No prompt cache exists, so the cache rates equal input and stay inert.
  // Without this row Jev fell through to FALLBACK_PRICING (Sonnet 4.6, $3/M) — ~71× too high.
  "typesafe-jev":      { input: 0.042, output: 0,   cacheRead: 0.042, cacheWrite: 0.042 },
  // …

// inside pricingKeyFor(model):
  if (m.includes("typesafe-ai/jev") || m === "jev" || m.startsWith("jev-")) return "typesafe-jev";
