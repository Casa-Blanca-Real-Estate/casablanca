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
**Never use `DATABASE_URL`.** This cloud environment carries MindBinder's database address by mistake
(`docs/decisions.md`), and MindBinder's code reads that variable. Casa's code reads `NETLIFY_DB_URL` in
production and `CR_LOCAL_DATABASE_URL` locally (`npm run db:local`). Keep it that way, and make sure
no ported script or test falls back to `DATABASE_URL`.

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
3. **No training on every request, with no switch. Zero retention whenever the text isn't public.**
   - `disallowPromptTraining` is available on every Vercel plan, and is always on.
   - `zeroDataRetention` needs a Vercel Pro team. Casa starts on Kimani's existing account, which
     isn't on Pro (2026-10-06), so zero retention is a switch: `CR_JEV_ZDR`, `on` by default.
   - **Each lane declares its text** as `public` (a listing's own words) or `private` (anything an
     agent or a client wrote). With zero retention off, a private lane's request is refused before
     it's sent, as a named drop.
   - Both flags fail closed. A refusal is a 4xx, so the go/no-go call catches a wrong setting.
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
   - no training on the wire with no way to turn it off; zero retention on unless switched off, and never off for a private lane
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

## Phase 1 follow-ups (after #56; small, no key)

1. **Check ids from the engine.** #58 gives every check a `code`. Import those in place of the
   registry's own `CHECK_IDS`. If the engine doesn't export them as a constant, add the one-line
   export and say so in your PR (rule 8).
2. **Wire the link import.** Put `enqueueListingJudgments` in Mason's link import
   (`tools-src/comp-report/server/api/links.ts`), after the observation's transaction commits. The
   mode stays `off`.
3. **Settled on #56:**
   - The Haiku fallback stays off until phase 2's numbers.
   - A 401, 402 or 403 falls back, as built.
   - Yes/no questions are asked once.
   - Casanova renamed your migration to `20260930120000_comp_report_decide.sql` at merge, because
     Mason's had the same timestamp.

## Before phase 2: run on Kimani's existing Vercel account (2026-10-06)

Kimani adds a new Gateway key from his existing Vercel account, the one MindBinder uses. It draws on
the same credits and is not on Pro. Before the key goes live:
1. **Make zero retention a switch** as in "Where Casa differs" 3: `CR_JEV_ZDR`, a public or private
   lane declared in the registry, the `zdr-required` drop, and tests. The listing lane is `public`.
   Kimani sets `CR_JEV_ZDR=off` with the key.
2. **Expect to share MindBinder's rate limit.** It's unknown whether the limit is per key or per team.
   Measure 429s against MindBinder's run times; the coverage numbers in phase 2 will show any contention.

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

## Handoff, 2026-10-13

*Written by Arbiter on 2026-10-14, as Casa's tracks move to a new cloud environment.*

### Where it stands

- **Phase 1, its follow-ups and the zero-retention switch are merged and live:** #56, #59, #61, on
  `claude/main`.
- **Production is unchanged for agents.** `CR_JEV_MODE` is unset, so it's off: nothing is queued or
  sent. `/api/comp-report/decide` answers 401 when signed out, as Casanova checked on #61.
- **What exists,** all in `tools-src/comp-report/server/decide/`:
  - the registry: seven listing-lane questions; the lane is declared `public` in `LANE_TEXT`;
  - Jev's transport, with no training always on and zero retention behind `CR_JEV_ZDR`;
  - the durable queue and drop ledger, `decide_requests`;
  - the background drainer, with its lease, shared pacing and cool-down in `decide_runtime`;
  - the Haiku 4.5 fallback, off;
  - the verdict, with every bar uncalibrated, so everything lands as `watch`;
  - the scrub;
  - the admin readout at `/api/comp-report/decide`;
  - `enqueueListingJudgments`, called from Mason's link import after a read commits.
- **Migrations:** `20260930120000_comp_report_decide.sql` and `20261006120000_comp_report_decide_zdr.sql`.
  Both were renamed at merge because their timestamps clashed with Mason's.
- **Open PRs:** none of mine. The only one is this handoff's docs PR.

### What's next: phase 2, held until Kimani's Jev key is in (ledger line `casa-r6-3`)

Don't start phase 2 until the readout's `setup` shows `"jevKey": true, "zdr": false`. Read it signed
in as an admin with `GET /api/comp-report/decide`. Then work through the phase 2 steps above, in
order. Some steps have no code yet:

1. **The go/no-go call has no code yet.** Build it as an admin-only action on the readout endpoint,
   e.g. `POST {action: "probe"}`. It sends one fixed request with no user data, keeps the raw body,
   and stops at any 4xx. The account gates look like outages.
2. **Labels before any live call.** Export rows carry no listing description: the listing lane reads
   `record.listing.description`, which only a link read has. The export's "Agent Commentary" column
   isn't used. So the ~30-listing set needs its text from link reads, which cost Firecrawl credit
   against the daily read limit. Alternatively, Casanova and Kimani decide that "Agent Commentary"
   counts as public listing text. Ask before choosing; that's a lane-text decision.
3. **"Haiku asked alongside as a second judge" doesn't exist yet.** Today Haiku runs only as a
   fallback, when Jev can't answer. The labelled batch needs both providers asked on every listing,
   kept apart by `provider` in `judgments`. Build it for the admin batch only. Leave the fallback's
   semantics alone, and keep `CR_DECIDE_FALLBACK` off: that was settled on #56.
4. **Pin the parser to the raw bodies.** It accepts a choice whose non-chosen options are missing
   (they read as 0), and both `probability` and `noul` for a yes/no. Tighten it to what Jev actually
   sends, and turn the raw bodies into fixtures.
5. **The weekly drift check needs a scheduler.** None exists here; the drainer is started only by
   kicks. A Netlify scheduled function can kick it, or call the admin probe weekly.

### Gotchas

- **Never use `DATABASE_URL`.** In the old environment it held MindBinder's database. Code reads
  `NETLIFY_DB_URL`, or `CR_LOCAL_DATABASE_URL` locally. Tests use `CR_TEST_DATABASE_URL`, which needs
  a server where that user can create roles and databases. Arbiter ran PostgreSQL 16 locally: as the
  `postgres` user, `initdb -A trust` into `/var/tmp`, port 5433, then
  `CR_TEST_DATABASE_URL=postgres://postgres@localhost:5433/postgres`. Run tests with `env -u DATABASE_URL`.
- **Migrations.** Check `netlify/database/migrations/` for a free timestamp, because two sessions'
  clashed twice. Never edit one that has shipped.
- **The cool-down is shared, and it persists.** `decide_runtime.cool_until` and `next_start_at` hold
  across invocations and across tests on one database. A drainer will rightly wait out a cool-down
  that an earlier test left behind; `db/decide.test.ts` resets it.
- **No sweep.** A drainer starts only from an import's kick, an admin's `POST {action: "drain"}`, or
  itself when it runs out of time. A drain that stops on a database error doesn't hand on, so its
  queue waits for the next kick.
- **The rate limit may be shared with MindBinder.** Kimani's key is on the same Vercel account and
  credits, and nobody knows whether the limit is per key or per team. The ledger keeps `attempts`,
  `last_status` and `waitedMs` per request. Each 429 goes only to the function log, as a `retry`
  event, so compare those log times against MindBinder's run times.
- **Wire ids are `<question>__fwd` and `<question>__rev`.** Which characters the Gateway accepts in
  an id isn't documented, and the first live call will show it. If it refuses them, change `wireId()`
  in `render.ts` only.
- **Any wording change bumps the version.** That's the question's `version` and `REGISTRY_VERSION`,
  and its calibration starts over. Kimani hasn't yet skimmed the seven questions (#56's description;
  `docs/decisions.md`).
- **Every new lane must declare its text in `LANE_TEXT`.** A lane that declares nothing counts as
  private, and with `CR_JEV_ZDR=off` it's refused as `zdr-required`.
- **#61's Netlify deploy preview reported failed, but the merged deploy was fine.** Read a preview's
  deploy log before assuming a failure is yours.

### Waiting on Kimani or Casanova

- **Kimani:** the Jev key, which unblocks phase 2. Make a new AI Gateway key on his existing Vercel
  account, and set it in Netlify (Functions scope) as `AI_GATEWAY_API_KEY`, with `CR_JEV_ZDR=off`.
  Leave `CR_JEV_MODE` alone: Arbiter turns it on after the go/no-go call.
- **Kimani:** skim the seven questions' wording before phase 2 goes live.
- **Kimani, or Hannah:** fill in the labels sheet once Arbiter commits it (phase 2 step 2).
- **Casanova:** decide where the labelled set's text comes from, link reads or "Agent Commentary"
  (gotcha in "What's next" step 2).

### Restart kickoff

> You're **Arbiter**, continuing a Casa Blanca Creative Studio track. Read `/CLAUDE.md`, then
> `docs/dispatch/README.md` (your roster row says where you are), then your dispatch file in full,
> `docs/dispatch/10-comp-report-decision-provider.md`, then your latest PR and its comments. Carry on
> from what's next there: Dispatch 10 phase 2, held until Kimani's Jev key is in (ledger line
> `casa-r6-3`). Start with the "Handoff, 2026-10-13" section at the end of the dispatch file. Never use
> `DATABASE_URL`. Never merge. Sign as "— Arbiter (CR-D)".

— Arbiter (CR-D)
