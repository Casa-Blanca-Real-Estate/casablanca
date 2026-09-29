# Dispatch 10 — Comp report: the decision provider, Jev first (CR-D)

**Dispatched by:** Casanova · 2026-09-29 · **To:** Arbiter (a new session; Kimani may rename it)
**Builds from:** **`docs/comp-report/sources/jev/jev-handoff.md`, read in full.** It's MindBinder's six
days with Jev, measured, plus copied code in `code/`, which is reference, not drop-in. Also
`docs/comp-report/01-design.md` v0.5.1: §7 and §7.1 (who decides what; Jev), §4 (non-negotiables),
§6.10 (the checks), §12 (`judgments`, `usage`).
**Depends on:**
- **Phase 1: nothing.** The listing text comes from Mason's link import (Dispatch 09 phase 1), stored
  as a property observation. Build against Abacus's `LISTING_EXTRACT_SCHEMA` (merged, #55) with
  fixtures, and wire in once Mason's PR merges.
- **Phase 2:** Casa's own Gateway key (Kimani's action in `docs/decisions.md`).

**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` per phase. Never merge — Casanova
or Kimani merges. Sign PRs, PR comments and commits "— Arbiter (CR-D)".**

## Why this exists

The design sends typed judgments to Jev. Examples: a listing's condition read from its text, whether a
comp is a sponsor unit, and later the tier suggestion and the intent of a request. Jev returns a
choice, a score or a yes/no with probabilities, never a number or a sentence (§7.1). MindBinder's
lessons shape this build:
- **The transport is the hard part:**
  - about 5 requests a minute;
  - 503s for up to two minutes;
  - two account gates that silently refused every call.
- **What goes in `state` matters more than the model.** Agreement went from 48% to 86% on the same
  facts, only because each fact was shown the sentence that supports it.
- **Option order moves the probabilities,** so every choice is asked twice.
- **Confidence is calibrated per question, never globally.**
- **Score answers are 0-based.**

## Where Casa differs from MindBinder

1. **Netlify has no long-lived process.**
   - MindBinder's queue lives in one server's memory. Here each invocation is short (a background
     function gets 15 minutes), so the queue, the pacing and the shared cool-down live in Postgres.
   - One drainer runs at a time, because the rate limit is per account. Hold that with a lease row
     that expires, not a session advisory lock: that would pin one pooled connection for up to 15
     minutes.
2. **Judgments have to land.** MindBinder only watches. Casa's judgments become suggestions and,
   later, applied values (§7.1). So the provider interface and the Haiku 4.5 fallback get built now
   (handoff §3.3).
3. **Both privacy flags go on every request from the first call, with no switch:**
   `disallowPromptTraining` and `zeroDataRetention`.
   - Casa's Vercel team is on Pro. Vercel requires Pro for commercial use, and it brings zero data
     retention.
   - Both flags fail closed, so a team that isn't on Pro gets refused, and the go/no-go call catches
     it.
   - In this dispatch `state` carries only public listing text, scrubbed.
   - Never in `state`: a client's name, an agent's notes, a message, the agent's call or a target.
4. **Nothing lands above "watch" until its question is calibrated.**
   - §7.1's high, middling and low bands need a measured bar per question and provider.
   - Until one exists, an answer is recorded and not shown.
5. **Both option orders go in one request** as two question ids. That halves the requests under the
   rate limit. The vendor says questions are answered independently; phase 2 checks it.

## Phase 1 — the decision layer, in watch mode (no key needed)

Build in `tools-src/comp-report/server/decide/`. The engine stays pure and imports none of it; this
layer may import the engine's factor and check ids.

1. **The question registry, the source of truth.**
   - **Each question:** `{ id, version, type, instructions, options with descriptions, abstain
     option, levels }`, its lane, and the engine factor or check it feeds.
   - **Both providers render from it.** Question and option text are fixed in code, and only `state`
     carries listing text.
   - **The first lane is the listing lane:** per listing, what its text says that its tags and
     extract don't. Candidates:
     - condition: renovated, good, needs work, not stated (the `02-screens.md` wording);
     - view and private outdoor space, only where the tags leave them open;
     - sale conditions, as yes/no questions: sponsor unit, estate or as-is sale, a tenant in place,
       parking or storage included in the price.
   - **Wording rules (handoff §4):**
     - every option says what it is and what it isn't;
     - every choice has a real abstain option;
     - lists are short and don't overlap;
     - use the glossary draft's definitions where they exist (`docs/comp-report/research/glossary-draft.md`).
   - **Code compares; Jev reads.** Jev never compares two listings and never gets numbers to reason
     about. Code turns the classes into the checks, the pairs' differing factors and the note chips.
   - **Put the registry's wording in the PR** for Kimani's review. Phase 2 goes live on the reviewed
     wording.
2. **The transport** (handoff §3.2, rebuilt for Netlify):
   - the request is built by a pure function, and the response is parsed by a strict pure one
     (validated, never repaired);
   - retries on 429, 502, 503 and 504, following `Retry-After`, with a cool-down that every
     invocation shares;
   - 12 attempts, 30 s per attempt, and pacing at `JEV_MIN_INTERVAL_MS` (default 12,500);
   - a queue cap;
   - nothing throws into a caller.
3. **The durable queue, which is also the drop ledger.**
   - Every request ends either answered or dropped with a named reason:
     - `no-key`
     - `queue-full`
     - `retries-exhausted`
     - `network`
     - `malformed`
     - `http-<status>`
     - `unanswered` (a 200 missing some answers)
     - one for a drainer that ran out of time; requeue that once first
   - A background function drains the queue. It re-invokes itself before its time runs out, and a
     dead drainer's lease expires.
4. **The provider interface.**
   - Jev answers first.
   - The Haiku 4.5 fallback (`claude-haiku-4-5-20251001`) uses structured outputs: an `enum` of the
     option keys, and a probability per option.
   - The fallback runs only when Jev can't answer (no key, an account gate, retries exhausted), and
     only if its own switch is on.
   - A question neither provider answers goes to the agent. It's never guessed.
5. **The verdict.**
   - **The two-order rule:** the same top option in both orders, and a mean probability at or above
     the bar.
   - **Between 0.4 and 0.6 is always "ask"**, whatever the bands say.
   - **Scores are converted from 0-based once,** and a test asserts it.
   - **A bar per question × provider × model.** Every bar starts as "uncalibrated". A bar can't be
     set without a pointer to its evidence, the same way house-method values stay null.
6. **The tables** (a migration, with row-level security like its neighbours):
   - the queue and drop ledger;
   - `judgments` (§12). Each row holds:
     - the target: a property observation for the listing lane; a report comp later;
     - the question id and registry version;
     - the provider, and the model string it was served;
     - both orders' probabilities, the verdict, and how it landed;
     - the state hash and the option-order hash, so a re-ask or a drift matches row for row;
   - a `usage` row per call, at Jev's own price: $0.042 per million input tokens, output free.
     MindBinder's first ledger priced Jev at Sonnet's rate, 71× too high.
7. **The scrub,** with tests. It takes out emails, phone numbers, links, contact and "listed by"
   lines, and names it can recognise, Casa's agents' included. Mark the text's origin in `state`
   (`[listing]`).
8. **The switch:** `CR_JEV_MODE` is `off` (the default) or `watch`. Production ships `off`, and with
   no key nothing is sent.
9. **Tests, with no network** (they sit where `npm run test:comp-report` finds them):
   - `verify-jev-transport.ts`'s simulated Gateway on a fake clock, ported to the durable queue. That
     includes two drainers racing for the lease, and a 112 s run of 503s.
   - the strict parser
   - both privacy flags on the wire, with no code path that turns either off
   - a source-reading check that no question or option text interpolates state
   - the verdict math and the score conversion
   - "nothing lands above watch while uncalibrated"
   - the fallback, through an injected client
   - the cost row
10. **The wiring:** an `enqueueListingJudgments(observation)` for the link import to call. If Mason's
    Dispatch 09 PR is still open, don't edit his files: say in your PR where the call goes.
11. **An admin-only readout:** coverage (answered against dropped, by reason), cost, and, once
    labels exist, agreement by probability band per question. It's an endpoint, since the database
    is reachable only from functions.

**Phase 1 is done when:**
- it's merged, with every test green;
- production is unchanged for agents: `CR_JEV_MODE` is off;
- the new endpoints refuse anyone signed out, or not an admin.

## Phase 2 — live watch mode, and calibration (needs Casa's key)

1. **The go/no-go call.** One tiny request with no user data before any batch, and stop if it fails.
   The account gates look like outages.
2. **Pre-register labels before any live call.** Commit a sheet of about 30 listings with the class
   columns blank. Draw them from Hannah's export and the 100 Barclay sample, spread across the
   classes. Kimani (or Hannah) fills it in before step 3.
3. **Turn watch mode on in production** (`CR_JEV_MODE=watch`) for link-imported listings. Then run
   the labelled set once from an admin-only batch, with Haiku asked alongside as a second judge.
4. **Save one raw response per question type,** and pin the parser to them. MindBinder never did.
5. **Measure it, and write it up** in `docs/comp-report/jev-calibration.md`:
   - coverage;
   - latency: in the queue, and per call;
   - cost per listing;
   - both orders in one request against separate requests, on 20 questions;
   - agreement with the labels by probability band, per question and per provider;
   - a proposed bar per question, or "not ready".
6. **A weekly drift check.** Re-ask a fixed fixture set with no user data. The Gateway reports only
   `typesafe-ai/jev`, never a version, so an upstream change is otherwise invisible.

**Phase 2 is done when** the write-up is in. Casanova then puts the next decision to Kimani, with
its numbers: which questions start showing agents a suggestion. Nothing is shown to agents in this
dispatch.

## Not in scope

- The screens that show suggestions. That's Mason's, once that decision is made.
- Jev inside the assistant: intent, statement capture, glossary checks (CR-4).
- Fair-housing screening (CR-5).
- The practice rubric (§11).
- The comp-against-subject lane (direction and degree per factor). It waits until the listing lane
  shows whether code comparing classes is enough.

## Definition of done

- Both phases are merged and verified as above.
- Every drop has a name, so coverage is a number.
- Nothing an agent or a client wrote reaches Jev, and nothing lands above watch.
- The existing tools still work. Internal paths still 404, including uppercase.
- PRs are open against `claude/main`, and signed.

— Casanova
