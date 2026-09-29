# Jev, as MindBinder uses it: the handoff for Casa's comp report

**From:** a Claude Code session in the MindBinder repo, 2026-09-29, `main` @ `5cc386d4`.
**For:** Casa Blanca's comp report (`01-design.md` §7.1, decision D-12), answering
`docs/comp-report/jev-handoff-request.md`.
**Contents:** this file, plus copied code in `code/` (listed in §3.5).

**Secrets.** Nothing here holds a secret, key, token, user record or client record. Where MindBinder keeps
a key, this names the variable, never its value. The examples in §4.3 are redacted. MindBinder's data is a
writer's unpublished fiction, so story text is replaced with placeholders, and only probabilities and
shapes are kept. The copied test fixtures (§6) do still name a few characters from MindBinder's fictional
test corpus. They are invented people, not records.

**How much to trust each claim.** MindBinder has run Jev for six days. It has made about 3,000 real
requests across four full pipeline runs, plus six offline probes. So:
- a claim marked **measured** comes from a MindBinder run or probe;
- a claim marked **vendor** or **third-party** was read from someone else's documentation or benchmark
  and was not reproduced;
- a claim marked **unknown** is one MindBinder never settled.

---

## 0. The short version

1. **Transport.** MindBinder calls Jev through **Vercel AI Gateway**, not TypeSafe directly:
   - `POST https://ai-gateway.vercel.sh/v1/evaluate`, with `Authorization: Bearer $AI_GATEWAY_API_KEY`
     and model `typesafe-ai/jev`;
   - plain `fetch`, with no SDK.
2. **It is not on MindBinder's critical path anywhere.** Every Jev use is one of two things:
   - watch mode: ask, record the answer, act on nothing;
   - an opt-in second reader.

   **MindBinder has no provider interface and no Haiku fallback in production.** If Jev fails, MindBinder
   simply keeps the decision it would have made anyway. Casa's design needs more than that (§3.3).
3. **The hard part was the transport, not the model.** Two things have lost MindBinder data:
   - Since the free window closed on 2026-09-25, the Gateway rate-limits to about **5 requests a minute**
     and sometimes returns **503 for up to ~2 minutes**.
   - Two account gates (card verification, then paid credits) each silently refused every call on a run.

   The fix is one paced queue per process, plus a ledger of every dropped question (§3.2, §7).
4. **What goes in `state` matters more than which model reads it.** On the same facts, Jev's agreement went
   from **48% to 86%** only because each fact was shown the sentence that actually supports it (§5.2).
5. **Ask every choice twice, the second time with the options reversed.** Jev's probabilities move with
   option order. An answer only counts if both orders agree and the mean probability is at or above the
   bar. MindBinder's bar is **0.8**, the one number it has evidence for (§5.1).
6. **Confidence is calibrated only when the options are clearly distinct.**

   | question | Jev ≥ 0.90 | Jev 0.70–0.90 | Jev < 0.70 |
   |---|---|---|---|
   | yes/no ("does this passage state this fact?") | 94–95% agreement | 83% | 66% |
   | 13-way "what kind of thing is this?" (overlapping classes) | 62–68% | — | — |

   So one global threshold is wrong. Casa's view, condition and service classes will behave like the
   13-way kind question unless their option wording keeps them apart (§4.1).
7. **Score answers are 0-based.** A 5-level score comes back from 0 to 4, not 1 to 5. MindBinder's first
   score probe read every answer one level low (§4.4).

---

## 1. Access

### 1.1 Authentication, endpoint, model

| | |
|---|---|
| Base URL | `https://ai-gateway.vercel.sh` |
| Endpoint | `POST /v1/evaluate` |
| Header | `Authorization: Bearer <key>` and `Content-Type: application/json` |
| Key's environment variable | **`AI_GATEWAY_API_KEY`**. It is set on the production host (Railway) and in each developer's gitignored `.env`. The code only ever tests whether it is present (`jevKeyPresent()`); it never logs or returns it. |
| Model id | `typesafe-ai/jev` |
| Other environment variables | `JEV_ZERO_DATA_RETENTION` (opt-in, §1.3) · `JEV_MIN_INTERVAL_MS` (pacing, §1.2) · `JEV_SHADOW` (MindBinder's watch-mode switch) · `IDENTITY_JEV` (one opt-in lane) |

- **Why the Gateway and not TypeSafe directly?** TypeSafe's own API was waitlisted when MindBinder
  started. Its documentation says a direct call pins `jev-1.13.x`.
- 🔴 **Whether the Gateway id pins a version is unknown.** Every response MindBinder has recorded
  reports its model as the bare alias `typesafe-ai/jev`, never a version (see the `served by` line
  of the agreement audit). So an upstream model change would be **invisible** in MindBinder's
  records.
- **Use the Gateway's own credentials, not a bring-your-own key.** The no-training and zero-retention
  filters do not apply to BYOK keys (vendor).

### 1.2 What the account allows, and the limits actually hit (measured)

| date | what happened | effect |
|---|---|---|
| 2026-09-23 | First test call refused: **HTTP 403 `customer_verification_required`**. | Fixed by adding a card to the Vercel account. The re-test answered in 787 ms. |
| until 2026-09-25 | Jev free on the Gateway. No rate limit was felt. | Runs of about 400 requests went through with bursts. |
| from 2026-09-25 | **Per-minute rate limit.** A **429** carries a `Retry-After` counting down from about 60 s. About **5 requests per 60 s** get through (early probes saw 2–4 a minute in bursts). | Two offline probes took **2 h 6 min** (424 requests) and **2 h 25 min** (514 requests). |
| from 2026-09-25 | **HTTP 503 for up to ~2 minutes** at a stretch. The worst seen was **112 s** straight. | MindBinder's first client, which tried twice with the second try immediate, would have lost almost everything. |
| 2026-09-28 | Every call refused: **HTTP 403 "Free tier users do not have access to this model. Upgrade to paid credits"**. | A full run lost its Jev data: **294 requests (2,338 questions)** were refused and recorded as drops. Fixed by buying Vercel credits. |

- **Pacing that works.** With `JEV_MIN_INTERVAL_MS=12500` (one request start every 12.5 s, i.e. under
  5 a minute), two full runs gave **0 refusals**: 392 requests, then 419 requests, 100% of questions
  answered. The peak queue was about 21 requests, and the longest wait about 7 minutes.
- **Throughput is set by the rate limit, not by latency.** Batch questions into as few requests as you
  can (§2.4).

### 1.3 Pricing (vendor, confirmed against MindBinder's ledger)

- **$0.042 per million input tokens. Output is free.** The Gateway adds no markup.
- There is no prompt cache of any kind, so every request pays full input price.

Observed spend:

| run | requests | input tokens | cost |
|---|---|---|---|
| full run 19 (watch mode) | 405 | — | $0.0226 |
| full run 20 (watch mode) | 392 | — | $0.0298 |
| person-or-group probe | 240 | 191,767 | $0.0081 |
| citation re-ask (up to 40 atoms and passages per request) | 424 | 1,091,726 | $0.046 |

A test request of 337 input tokens costs about **$0.000014**.

- **Record Jev with its own price row.** MindBinder's cost ledger at first priced Jev at its fallback
  rate (Sonnet, $3 per million), about **71× too high**. `code/excerpts/cost-accounting-jev-row.ts` is
  the fix.

### 1.4 Data handling and retention (what MindBinder knows)

Taken from primary pages on 2026-09-23. **None of it is independently audited.**
- **TypeSafe's privacy policy** (last updated 2025-11-19): *"We will not train or fine tune any
  artificial intelligence or machine learning models on your prompts or other Input."*
- **Gateway `providerOptions.gateway.disallowPromptTraining: true`.** Available on every plan at no
  extra cost. The request is sent only to providers that do not train on it, and **fails closed**: it
  errors rather than falling back. **MindBinder sends this on every request, with no switch.**
- **Gateway `zeroDataRetention: true`.** Also fails closed. TypeSafe is listed as ZDR, with the clause
  *"TypeSafe shall not retain (a) prompts that are Customer Data for any longer than is necessary to
  generate Output"*.
  - 🔴 **Per-request ZDR needs a Vercel Pro or Enterprise team.** MindBinder's is on Hobby, so ZDR is
    opt-in (`JEV_ZERO_DATA_RETENTION=true`) until the plan is upgraded. It is meant to become
    unconditional after that.
  - Team-wide ZDR costs $0.10 per 1,000 requests.
- **Gaps:**
  - TypeSafe's DPA does not mention training at all.
  - No SOC 2 report was found. A trust center exists at trust.typesafe.ai, and it was not reviewed.
  - The company has been public since 2026-09-16.
- **For Casa:**
  - Get your own Vercel team, key and terms.
  - Decide whether you need Pro for ZDR before anything client-adjacent goes out.
  - Keep client names out of `state`, as D-12 says. Listing text can still carry owner or agent names,
    so scrub it too.

---

## 2. The API, as MindBinder uses it

### 2.1 Request

```jsonc
{
  "model": "typesafe-ai/jev",
  "state": { /* any JSON: a string, an object or an array. The ONLY place data goes. */ },
  "questions": {
    "<question id>": { /* one of the three shapes below */ }
  },
  "providerOptions": { "gateway": { "disallowPromptTraining": true /* , "zeroDataRetention": true */ } }
}
```

| type | question shape | returns | limit |
|---|---|---|---|
| choice | `{ "type": "choice", "instructions": string, "criteria": { "<option key>": "<description>" , … } }` | the chosen key and a probability per option | ≤ 255 options (vendor) |
| boolean | `{ "type": "boolean", "instructions": string, "criteria": { "true": string, "false": string } }` (criteria optional) | P(true) | — |
| score | `{ "type": "score", "instructions": string, "criteria": [ "<level 1>", "<level 2>", … ] }` (ordered, lowest first) | the probability-weighted mean level (**0-based**) and a distribution | 2–10 levels (vendor) |

- **Size limits.**
  - TypeSafe documents 64k tokens per request, with 32k for state plus the longest question.
  - The Gateway, OpenRouter and Cloudflare all list a flat **32k**.
  - MindBinder plans for 32k and guards at about 24k tokens.
- **MindBinder's own caps,** all well inside that:
  - kind context 4,000 characters;
  - 1,500 characters of passage per atom, and 40 atoms per request;
  - 20,000 characters of passages in the pronoun lane;
  - the largest probe state was 89k characters (about 22k tokens).
- **Behaviour (vendor).** Accuracy falls as irrelevant state is added. MindBinder saw the same: a larger
  state made Jev unsure more often (§5.3).

### 2.2 How structured state is passed next to text

- `state` is a JSON object with named fields. Questions point into it by path, for example:
  - `"…the element named in state.name. Use state.context…"`
  - `"Does atom 3's passage (state.atoms[2].passage) state atom 3's fact…"`
- **Numbered items.** When one state carries many items, they are numbered inside it
  (`state.atoms[n] = { n, subject, fact, passage }`), and each question refers to its item by number.
  One request then asks up to 40 booleans over one state.
- **Rule: user-controlled text goes only in `state`, never in question or option text.** Question and
  option text come from fixed registries in code. This is prompt-injection hygiene, since the vendor
  says Jev is susceptible to instructions injected in state. It is asserted by a test
  (`verify-jev-shadow.ts` §6).
- **Mark each passage's origin inside state,** e.g. `[upload] …`, `[note] …`, `[chat] …`, when origin
  matters to the judgment.

### 2.3 Response, and what comes back

MindBinder's parser (`parseJevResponse` in `code/server/lib/jev.ts`) reads these fields:

```jsonc
{
  "model": "typesafe-ai/jev",                   // the served model; in practice the bare alias (§1.1)
  "answers": {
    "<choice id>":  { "type": "choice",  "choice": "<option key>", "probabilities": { "<key>": 0.84, … } },
    "<boolean id>": { "type": "boolean", "probability": 0.98 },       // P(true); TypeSafe's native API calls it "noul"
    "<score id>":   { "type": "score",   "score": 2.37, "probabilities": { … } }  // score is 0-based (§4.4)
  },
  "usage": { "inputTokens": 337 },              // input_tokens is accepted too
  "providerMetadata": { "typesafe": { "confidence": { "<choice id>": 0.91 } } }  // optional; a per-question statistic
}
```

- **Scale.** Everything is 0–1, except `score`, which runs from 0 to (levels − 1).
- **Validated, never repaired.** The parser drops, rather than fixes:
  - an answer naming an option that was not offered;
  - a probability outside 0–1;
  - a missing `answers` object.

  A dropped answer is treated as "no answer".
- **The vendor `confidence` statistic** is recorded but never used for a decision. MindBinder's design
  treats it as derived from the same distribution, so it decides on the top probability (and, where
  used, the margin over the second option).
- 🔶 **MindBinder never archived a raw response body verbatim.** The shape above is what the parser
  accepts, and the parser was written to be tolerant (`probability` or `noul`, `inputTokens` or
  `input_tokens`, confidence in `providerMetadata` or on the answer). **Casa should save one raw body
  per question type from its first test calls** and pin the parser to them.
- **Answers are not strictly deterministic (measured).**
  - Re-asking a whole run's 2,518 questions under the same conditions reproduced **95.8%** of verdicts.
  - One re-asked choice moved from 0.84 to 0.69.
  - The vendor quotes a standard deviation of 0–0.008 across repeats. Near 0.5, answers flip.

### 2.4 Batching and latency

- **Several questions per request, one state.** Questions are answered independently, and state is
  billed once. This is the only batching that exists. There is no multi-state batch and no cache.
  - MindBinder batches up to **40 booleans** per citation request, and **23 booleans** per request for a
    46-item yes/no sweep.
  - Vendor figures: 13 questions over one article cost $0.0005 and took 0.27 s, against $0.0061 and
    2.71 s as 13 separate calls, with the same answers.
- **Latency.**
  - Measured single calls: 551 ms, and 787 ms for 337 tokens.
  - Third-party p50: about 127–370 ms, which is 2.6–5.4× faster than Claude Haiku 4.5.
  - Per-call duration is stored in MindBinder's ledger, but **p50/p95 at volume was never computed**.
  - Under the rate limit, time waiting in the queue dominates everything else (§1.2).

---

## 3. The client code

### 3.1 Modules

| file (copied under `code/`) | what it is |
|---|---|
| `server/lib/jev.ts` | **The client.** See the table below. |
| `server/lib/jev-shadow.ts` | **Watch mode.** Two lanes ask Jev beside a decision the platform already made, and record both: *what kind of thing is this new name?* (one choice over 13 kinds) and *does this cited passage state this fact about this subject?* (one boolean per atom). Fire-and-forget (`void`), off unless `JEV_SHADOW=true`, and it writes only its two instrument tables. |
| `server/lib/identity-jev.ts` | **An opt-in second reader** (`IDENTITY_JEV=true`): which pronouns does the writer use for this character? It asks in both orders, averages, and gives an answer only if it is order-stable and at or above the bar. It is the cleanest small example of the two-order pattern. |
| `db/migrations/116_…`, `117_…` | `jev_observations` (every answer, next to the platform's own decision) and `jev_watch_drops` (every question asked and not answered, with its reason). |
| `excerpts/two-order-verdict-and-second-judge.ts` | The two-order acceptance rule, the two-judge agreement table, and **the Claude Haiku 4.5 "second judge"**: the same question and state, rendered as a prompt. This was probe-only (§3.3). |
| `excerpts/cost-accounting-jev-row.ts` | The price row and model matcher. |
| `excerpts/shutdown-hook.ts` | Drains the queue on SIGTERM, so a redeploy records its lost requests as `shutdown` drops. |
| `scripts/verify-jev-transport.ts`, `scripts/verify-jev-shadow.ts` | Tests with no network (§6). |
| `scripts/audit-jev-agreement.ts` | The calibration read-back (§5). |

What `server/lib/jev.ts` holds:

| piece | what it does |
|---|---|
| `buildJevRequestBody` | builds the exact request (pure) |
| `parseJevResponse` | validates the answer strictly (pure) |
| `jevRetryDelayMs` | computes the wait before a retry (pure) |
| `JevQueue` | the paced queue |
| `jevEvaluateDetailed` / `jevEvaluate` | the calls: an outcome with a reason, or `null` on any failure |
| `jevShutdown` | drops what is still queued when the process stops |

**The copies are reference, not drop-in.** They import MindBinder helpers you won't have:
- `./mb-log` is structured logging;
- `./cost-accounting` (`recordUsageAmbient`) is a cost-ledger row;
- `../db` is Drizzle over Postgres;
- `../pipeline/step-classify` is the kind vocabulary.

Replace them with Casa's own.

### 3.2 Transport behaviour (`JevQueue`)

- **One serial queue per process.** Requests start at least `JEV_MIN_INTERVAL_MS` apart (default 1 s;
  use 12,500 on the post-free-window Gateway, §1.2). Serial is deliberate: the limit is per minute, so
  parallel requests only reach the 429 sooner.
- **Retries on 429, 502, 503 and 504, with a shared cool-down.**
  - The wait is set by `Retry-After` when the Gateway sends it (as seconds or an HTTP date), clamped
    to between 1 s and 180 s.
  - Without one, the wait is exponential backoff from 2 s, capped at 60 s.
  - The cool-down applies to the **whole queue**, so the next request doesn't spend an attempt learning
    what the last one was just told.
- **Also retried:** timeouts and network errors, which back off for that request only.
- **Not retried:** any other 4xx, or a malformed body. Asking again would get the same answer.
  - This includes the fail-closed privacy refusal and the 403 account gates.
- **Limits:**
  - **12 attempts** per request, which rides out the 112 s of 503s;
  - **30 s** per attempt;
  - at most **5,000** requests queued; beyond that a request is dropped at once as `queue-full`.
- **Every way of ending without an answer has a name:** `no-key`, `queue-full`, `shutdown`,
  `retries-exhausted`, `network`, `malformed`, `http-<status>`, plus `unanswered` for a 200 missing some
  answers. The watch writes each one to `jev_watch_drops`, so coverage is a measured number.
- **Idempotency.** `/evaluate` is read-only, so a retry is always safe. MindBinder sends no idempotency
  key.
- **Caching.** None. A memo on `sha256(model, state, questions)` was designed and never built.
- **Error handling.** Nothing throws into a caller. `jevEvaluate` returns `null` on any failure, and the
  caller keeps its own decision.

### 3.3 Provider interface and fallback: what MindBinder has, and what Casa needs

**MindBinder has neither.** It never needed them, because Jev never makes a decision there:
- In watch mode the platform's own decision is already made and used, and Jev is only recorded.
- In the opt-in lanes, a `null` means "no witness", and the lane goes on without one.

The fallback is **today's behaviour**, not another model.

The nearest thing to a fallback is the **offline stale-tiebreaker probe**
(`excerpts/two-order-verdict-and-second-judge.ts`). It asked Claude Haiku 4.5 as a *second judge*
alongside Jev:
- **The same question object** (`staleVerdictQuestion(order)`) is rendered twice: once as Jev's
  `choice`, and once as a Haiku prompt listing the same option keys and descriptions in the same order.
  Haiku's reply is JSON mapping each option to a probability, at temperature 0 with `max_tokens` 200.
- **Both answers go through the same two-order rule** (`judgeAnswer`: mean of both orders, top option
  stable across orders, p ≥ 0.8).

How it did:
- Over 257 facts (514 requests to each judge, one per option order), the two judges each accepted an
  answer on 60 facts and **conflicted on only 2**.
- On the 18 hand-labelled facts, when both judges accepted the same answer, it was **never wrong**
  (5 of 5).
- Haiku cost **$2.74**, against Jev's **$0.096**, for the same questions.

**Recommendations for Casa's decision provider:**
1. **Keep one question registry: the source of truth.** Each judgment is `{ id, type, instructions,
   options with descriptions, abstain option, level list }`. Both providers render from it, so the
   wording cannot drift apart.
2. **Use structured outputs for the Haiku path.** MindBinder's probe parsed free JSON text, which is the
   weaker way. Constrain the choice with an `enum` of the option keys and have it return probabilities,
   or at least the choice.
3. **Keep a threshold per provider.** Haiku's self-reported probabilities are not Jev's calibrated ones.
   Both can be measured against Casa's labels, and they should never share a single number.
4. **Record which provider answered** on every judgment, and the provider's model string, so calibration
   can be split by provider.
5. **Plan for "neither answered".** Rate limits and credit gates are the common case, not the edge
   (§1.2). A judgment that gets no answer should be *asked of the agent*, never guessed.

---

## 4. Prompting that works

### 4.1 Wording options

- **Give every option a description that says what it is and what it is not.** For example, the kind
  lane's `character` option: *"One individual person or being with a mind … Never a group, organization,
  market or place."* A bare label is not enough.
  - Jev is **confidently wrong (0.93–0.99) when two options overlap in meaning** (vendor and
    third-party).
  - MindBinder's kind lane is the living example: concept vs item, demographic vs faction, and concept
    vs organization produce most of its disagreements. Its confidence there barely predicts agreement
    (§5.2).
- **Always offer an abstain option**, such as `none`, `not_stated` or `not_enough`. It must be a real
  option with its own description, e.g. *"The passages never refer to this character with a third-person
  pronoun, or it cannot be told which pronoun is theirs."*
- **Keep a fixed, declared option order**, and **ask twice, the second time reversed** (§5.1). Jev's
  probabilities move with order.
- **In yes/no questions, name exactly what "true" means.** In the citation lane, the passage must state
  the fact *about this subject*, "rather than about someone or something else". That wording is what
  caught facts cited to another person's sentence.
- **Instructions should restrict the evidence:** "use only state.facts", "judged ONLY by
  state.newer_evidence". Also warn about the specific misreading you expect. For example: "not a 'they'
  for a group that includes X".

### 4.2 Context size and option count

- **Put in only the relevant evidence.**
  - The same citation question agreed **40.5%** on a 400-character head cut from the segment, and
    **84.8%** on the fact's own sentence (§5.2).
  - A bigger state made Jev unsure more often: median 18k against 11k characters, and "sure and right"
    fell from 11 to 8 of 18.
  - The platform's code finds and ranks the evidence; Jev chooses among what is laid side by side.
- **Jev cannot do dates or arithmetic** (vendor jaggedness page; MindBinder designs around it). It reads
  "S2", "2019" and "$1.2M" as text. Compute comparisons in code and hand Jev the result as a field, e.g.
  `"size_vs_subject": "comp is 14% larger"`, not two raw numbers. For comps this matters: price, square
  footage, dates and distance are code's job.
- **Option count.**
  - 13 options (the kinds) works for the top pick.
  - 46 options (archetypes): the top pick was right (hit@3 was 9 of 9, against about 19% chance) and
    the same in both orders for all 10 characters.
  - But **ranks 2–3 were list-order filler at probability 0.00**. Of the 14 keys that appeared in only
    one order's top three, 8 were simply the first or second option listed.
  - So with many options, trust the top pick and its probability, not the ranking below it. For a real
    second or third choice, ask yes/no per option instead (23 booleans per request worked).
  - Casa's 3-way tier and intent questions are in the comfortable range. For the classes from listing
    text, keep each list short and mutually exclusive.

### 4.3 Representative examples (redacted)

Story text is replaced by `[…]`. The probabilities are real.

**A. Test call, no user data** (from the go/no-go check before a run):
- A made-up passage with a true/false question whose answer is true.
- → `probability` **0.98**, 337 input tokens, 787 ms.

**B. Choice: what kind of thing is this new name?** (13 options; the context is what the writer said)
```jsonc
// state
{ "name": "corporations", "context": "[one sentence: other corporations copy a policy model]" }
// question id "kind": choice over character, location, event, organization, faction, demographic,
//   episode, season, item, theme, concept, meta, arc — each with a "what it is / what it is not" line
// answer → organization, p 0.99   (the platform had filed it as "concept"; Jev is right)
```
Two more from the same lane:
- `"new property"` → location, **0.99**. The platform filed it as a concept; Jev is right.
- `"news feeds"` → item, **0.48**, below any bar. The honest answer is "ask".

**C. Boolean, batched: does each atom's passage state its fact about its subject?**
```jsonc
// state
{ "atoms": [
  { "n": 1, "subject": "[person A]", "fact": "[person A] has status deceased", "passage": "[a sentence about person B's death]" },
  { "n": 2, "subject": "[person B]", "fact": "[person B] has status deceased", "passage": "[the same sentence]" }
] }
// questions a1, a2: "Does atom N's passage (state.atoms[N-1].passage) state atom N's fact ABOUT atom N's
//   subject — rather than about someone or something else?"
// answers → a1 0.12 (false: the sentence is about someone else) · a2 0.93 (true)
```
- **Three observed failure shapes:** a generic sentence cited for a specific trait (0.06–0.13, correct);
  an unrelated passage (0.05–0.10, correct); and a paraphrase read strictly (0.48 on a sentence that does
  say it — the wobble near 0.5).

**D. Choice asked in both orders:** one person or a group?
- Evidence was the writer's own passages, 6 windows.
- Answer: individual, **0.98** (the mean of the two orders), with the same top option in both.
  Stable, so accepted.
- The same question over the platform's stored summary said **group, 1.00**. That was the platform's
  own earlier error being read back, which is the lesson in §4.2.

**E. Score:** where does a character stand in one period, on a 5-level axis (level 1 at one end, level 5
at the other)?
- The raw `score` came back **0.19**. Read on the 1–5 scale that is **1.19**, near the "level 1" end,
  which is the expected band.
- Read naively as 1–5 it would have been below the scale. See §4.4.

### 4.4 The score trap

A score answer's `score` is the **probability-weighted mean of the levels' 0-based indices**:
- 0–4 for five levels, not 1–5.
- MindBinder's probe read every answer one level low until this was found.
- MindBinder's parser stores the raw value in the answer's `probability` field (a quirk). The first
  product consumer must add 1 if it uses a 1-based scale.

For Casa's comparability score: decide the scale in code, convert once, and assert it in a test.

---

## 5. Confidence in practice

### 5.1 The thresholds MindBinder uses, and why

| where | rule | where it came from |
|---|---|---|
| Every opt-in lane and probe | **Order-stable, mean p ≥ 0.8.** The same top option in both option orders, and the mean of the two orders' probabilities for that option ≥ 0.8. Otherwise "unsure", which never settles anything. | Pre-registered before the first probe, then tested. On the stale-tiebreaker run: at **0.8**, 0 settled wrong and 5 of 5 agreed labels settled right; at 0.85, 3 of 18; at **0.9, none of the 18 labels settled** and there was no safety difference the data could see. So 0.8 is recommended, to be re-checked on volume. |
| Pronoun lane | 0.8, **a placeholder** until its own pre-registered run sets it. | — |
| Design placeholders, never calibrated | Reversible routing at top p ≥ 0.7 with margin ≥ 0.2. Destructive or trust-spending actions (dismiss, merge, mark someone deceased) at p ≥ 0.9 with margin ≥ 0.3, and **cards only**, never applied, until the lane has two measured runs. | `jev-decision-layer` design, §5 and §6. |

- **Never use a single global number.**
  - Third-party calibration was good in-domain (ECE 0.02–0.05) and **0.107 out of domain**.
  - The direction differs by type: **choice and score read overconfident, boolean underconfident.**
  - Key thresholds by **question × type × model version**, and send a lane back to shadow when the model
    changes.
- **Decide on the probability and the margin over the second option.** Not on the vendor `confidence`
  field.

### 5.2 Did the confidence prove calibrated? (measured, against the platform's own decision)

This is **agreement with the incumbent, not accuracy.** MindBinder has not finished hand-labelling the
disagreements (§5.3).

| lane | run | agreement | Jev ≥ 0.90 | 0.70–0.90 | < 0.70 |
|---|---|---|---|---|---|
| citation (boolean) | full run 20 | **87.0%** of 3,036 | **94%** of 1,679 | 83% of 973 | 66% of 384 |
| citation | full run 20, recovered | **87.2%** of 3,044 | **95%** of 1,684 | 83% of 964 | 66% of 396 |
| kind (13-way choice) | full run 20 | 56.0% of 159 | 62% of 84 | 59% of 34 | 41% of 41 |
| kind | full run 20, recovered | 54.8% of 186 | 68% of 87 | 45% of 40 | 42% of 59 |

- **The boolean is well behaved.** Agreement rises steadily with Jev's confidence.
- **The overlapping-class choice is not.**
  - Even at ≥ 0.90, Jev and the platform agree only about two times in three.
  - In a hand read of 20 of the kind lane's disagreements (full run 19), Jev was *better* on about 8
    and the platform on about 2. The rest sat on boundaries the taxonomy leaves open.
  - So low agreement there is partly the incumbent being wrong, and only labels can tell.
- **Earlier, the citation lane agreed only 48.5%.** The difference is entirely what was in `state`: a
  400-character head of the passage, not the supporting sentence.
  - Replaying the same 2,518 facts with the right sentence moved agreement **48.3% → 86.1%**.
  - A control, asked with the old quote, repeated 95.8% of verdicts.

### 5.3 How MindBinder calibrates

1. **Watch mode first.** Jev is asked beside the incumbent decision and both are recorded
   (`jev_observations`); nothing acts on Jev.
2. **Coverage before agreement.** `audit-jev-agreement.ts` §0 reports answered versus dropped questions
   per lane. An agreement rate measured on whatever got through the rate limit means nothing.
3. **Agreement by Jev's probability band** (the tables above). A threshold is only honest if agreement
   rises with it.
4. **Humans label the disagreements.** A labels file is keyed by observation id, and the audit then
   reports "Jev right / platform right / neither".
   - 🔶 **This is still unfinished in MindBinder.** The labels file is empty, and the §4 line of the
     audit reads UNMEASURED, by design, rather than guessing.
5. **Pre-registered probes.**
   - Labels and hypotheses are committed **before** any call, so the result cannot shape them.
   - A `--dry` mode prices the run; a `--render` mode reprints a saved run.
   - Each hypothesis is scored mechanically by the probe itself.
6. **Ask both orders**, and count an order flip as "unsure".

---

## 6. Tests

All tests run without a network, in MindBinder's CI battery. None of them needs a real key; they set
`AI_GATEWAY_API_KEY=test-key-not-real`.

**`verify-jev-transport.ts` — a simulated Gateway on a fake clock.**
- A fixed per-minute window (e.g. 3 requests); past it, a 429 whose `Retry-After` counts down to the
  window's end.
- It checks that:
  - 20 simultaneous requests are all answered;
  - no request starts until the `Retry-After` has passed, for the whole queue;
  - requests are paced apart;
  - a 112 s run of 503s is ridden out;
  - network errors are retried;
  - 403 and malformed bodies are not;
  - `queue-full` and `shutdown` behave as described;
  - every failure maps to a named drop.
- It also replays the old two-try client on the same simulated Gateway, to show the loss: 3 of 20
  answered.

**`verify-jev-shadow.ts` — an injected `fetch` plus source-reading checks.**
- The no-training flag is on the wire, and no code path sets either privacy flag to false.
- No key means nothing is sent.
- A foreign option is dropped, and so is an out-of-range probability.
- The price row resolves.
- The watch module writes nothing but its two instrument tables, and its call sites never read its
  result.
- No story text appears in question text.
- The fixtures use a few names from MindBinder's fictional test corpus.

**Other checks.**
- Probe suites (not copied) test the pure builders: the option order is reversed exactly, the verdict
  math, and the pre-registered labels are unchanged.
- **Not built:** a fake HTTP Jev server, and recorded raw responses (§2.3).

---

## 7. Gotchas

### 7.1 Failure modes and surprises, in the order they cost MindBinder

1. **Account gates look like outages, and they fail every call.**
   - First `403 customer_verification_required` (add a card), then, after the free window,
     `403 "Free tier users … Upgrade to paid credits"` (buy credits).
   - The second cost a whole run's measurements.
   - **Make a tiny test call with no user data before any batch job, and stop if it fails.**
2. **The post-free-window rate limit** (about 5 a minute) and **multi-minute 503 streaks.** A naive
   client loses most of a burst silently. Queue, pace and back off per §3.2, and **count what you
   drop**.
3. **The state decides the answer.** Garbage evidence gives confident "no" answers that look like model
   error. Most of MindBinder's early "disagreement" was its own quote being cut short.
4. **Option order changes the probabilities,** and long option lists produce list-order filler below
   the top pick.
5. **Confidently wrong on overlapping options.** The option-order flip does *not* catch it; only
   labels do.
6. **Score answers are 0-based.**
7. **Answers are not deterministic.** Re-asking reproduces about 96%; answers near 0.5 wobble. Don't
   re-ask in the hope of a better number; treat the 0.4–0.6 band as "ask the human".
8. **The model can change under you invisibly.** The Gateway reports only `typesafe-ai/jev`. Re-run a
   fixed fixture set weekly and watch for movement.
9. **Literal reading.** Negation, scope words and implied outcomes trip Jev. An implied event ("a fatal
   crash") is not read as a stated one.
10. **Privacy flags are per request and fail closed.** A refusal is a 4xx. Don't retry it, and don't
    silently drop the flag to make it pass.

### 7.2 What MindBinder would do differently from the start

- **Build the paced queue and the drop ledger on day one.** MindBinder shipped a two-try client, lost
  data to the rate limit and the credit gate, and then built the queue.
- **Record a raw response per question type,** and assert the parser against them.
- **Ask every choice in both orders from the first probe.** MindBinder's watch-mode kind lane still asks
  once. Its pronoun lane and probes ask twice.
- **Pre-register labels before the first call, and start human labelling of disagreements at once.**
  Agreement with the incumbent was all MindBinder could report for a week.
- **Build the provider interface up front if anything depends on the answer** (§3.3). Watch mode let
  MindBinder skip it; Casa's high-confidence auto-apply can't.
- **Log the model string, the option-order hash and the state hash with every answer,** so a later
  drift or re-ask can be matched row for row. MindBinder logs the model; the hashes were designed and
  not built.

---

## 8. Mapping Casa's judgments onto what MindBinder learned

| Casa judgment | Jev shape | notes from MindBinder |
|---|---|---|
| Comparability (ordered levels, for sorting) | `score` | 0-based (§4.4). Compute the numeric differences in code and pass them as fields; Jev reads numbers as text. The level descriptions must be anchored ("differs on 3+ major factors …"). |
| Tier: primary, secondary or excluded | `choice`, 3 options + both orders | Easy size. Give each tier a "not for" line; primary vs secondary is the overlap to watch. |
| View, outdoor, condition, service level, sale conditions | one `choice` each, batched over one listing state | Add `not_stated` to each. Keep the classes mutually exclusive in their descriptions, or expect kind-lane behaviour (§5.2): confident and wrong on the boundary. Pass only the listing text, not the whole file. |
| Same floor plan? Sponsor unit? | `boolean`, with explicit `true`/`false` criteria | Booleans were Jev's best-calibrated type here. Say exactly what counts as evidence. |
| Does the agent use "carry" the way the glossary defines it? | `boolean` | Put the glossary definition in the question text (it is fixed) and the agent's text in `state` (it is not). |
| Which of three kinds of argument (intent) | `choice`, 3 options + both orders | Include an abstain option ("unclear, ask") rather than forcing one of the three. |
| Comp differs from the subject on a factor, which way, and how much | per factor: a `choice` of direction (better / same / worse / not stated) plus a `score` of degree | Matches MindBinder's pattern of code computing, Jev classifying, and code turning the class into a number. |

For Casa's **high / middling / low** landing:
- **Start with MindBinder's one evidenced rule** as the bar for "high": order-stable and mean p ≥ 0.8.
- **Treat 0.4–0.6 as "ask", whatever the bands say.**
- **Calibrate each question separately** on Noble's examples before anything auto-applies. MindBinder's
  booleans and its 13-way choice differ enough that a shared threshold would be wrong for one of them.

---

## 9. Where things are in MindBinder (for follow-up questions)

- **Design:** `docs/design/jev-decision-layer-2026-09-22.md` has the research, the vendor and
  third-party numbers with sources (§1, §13), the integration contract (§5) and the calibration plan
  (§6).
- **Transport incident and the re-ask measurement:** `docs/handoffs/JEV-REASK-633-2026-09-26.md`.
- **Full runs with Jev watching:**
  - `docs/handoffs/FULL-RUN-19-2026-09-23.md` (§3);
  - `docs/handoffs/FULL-RUN-20-2026-09-26.md` (§3);
  - `docs/handoffs/FULL-RUN-20-RECOVERED-2026-09-28.md` (§0, §3).
- **Probes:**
  - `docs/design/person-or-group-probe-2026-09-24.md` §9;
  - `docs/design/archetype-stance-scores-2026-09-24.md` §1.4 and §2.4 (option order, the 0-based score);
  - `docs/design/stale-tiebreaker-r35-2026-09-25.md` §13 (two judges, the accept bar).
