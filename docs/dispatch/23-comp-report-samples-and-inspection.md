# Dispatch 23 — Comp report: samples that reset, and reading production safely (CR-7f)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Mason
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/06-platform-access-and-data.md` (NW-054, NW-090),
`02-sort.md` (NW-054 a and b), and `server/api/decide.ts` (the key pattern to copy).
**Depends on:** items 1–2: Dispatch 15 merged, nothing else. Items 3–4: Dispatch 22 merged (the access and
activity logs this reads and writes, `can_read_report`, and the migration before yours), and Kimani's answer
to NW-090 a. Items 1–2 also wait on who may use samples (NW-054); build admins only until he says otherwise.
**Two PRs.** Items 1–2 hold no key and change no flow, and Design reviews the co-op flow on the co-op sample
(NW-066 b), so they ship first as their own PR, from whichever account Mason is in. Items 3–4 are the second
PR, in Casa's account only. Both go under ledger line `casa-r13-9`: mark it delivered at the first PR and
note the second.
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Mason (CR-7f)"** in the PR, its comments and your commits. Ledger line: `casa-r13-9`.

## The goal

Testing ruins the sample, there is no co-op sample, and a session can't look at production to see what an
agent saw. Give admins (and mentors, if Kimani agrees) a sample that resets in one click, in condo and co-op,
and give sessions a read-only, redacted, logged view of production that never connects to the database.

## In scope

1. **NW-054 a · reset by replacement.** A server function `buildSampleReport('condo' | 'coop')` does in one
   transaction what the browser stitches together today (`Workspace.tsx` `fillSample`). "Reset the sample"
   builds a fresh report with the same title and archives the old one (`status = 'archived'`). In-place reset
   can't work: `reasons` and `messages` are append-only, so Hubert would remember the last test. Fill with
   sample calls the same function.
   - **Buttons.** Put Reset the sample beside Fill with sample in the Dev tools strip (`DevStrip` in
     `Pieces.tsx`, and the dev tools on the new-report screen, `NewComp.tsx`). Both are gated today by
     `devTools`: admin plus the Build notes switch (`Workspace.tsx:478`, `NewComp.tsx:37`). Add no other
     button and move nothing. Admins only, unless Kimani says mentors; then widen both `devTools` gates to
     admin or mentor, change the server rule below, and say so in the PR.
   - **The server decides, not the buttons.** The reset endpoint rejects any role but admin with 403, in the
     handler (and mentor, only if Kimani answers NW-054 that way: that is the one place the check changes).
     Put the rule in one function, `mayUseSamples(user)`, that returns `role === 'admin'` today. The three
     existing gates (`api/sample.ts`, `api/comps.ts:173`, `api/imports.ts:46`) stay as they are in effect and
     call it, and the new endpoint calls it too. None is widened.
   - **Which report is reset is looked up server-side.** The body gives the report id; the handler runs
     `select … where id = $1 and owner_email = $caller and sample_data = true and status = 'active' for update`
     and answers 404 if there is no such row. The title comes from that row, never the body. The new report is
     always owned by the caller and has the old one's `property_type`. Create and archive happen in the one
     transaction, so a second click on a report already archived gets 404 and the screen reloads the list.
     `reports_update` lets an admin update any report at RLS level, so the `where` above is the only guard:
     keep it in the `update … set status = 'archived'` too.
2. **NW-054 b · a co-op sample.** For now, port `coopCsv()` from `dev/seed-report.mjs` into `server/sample/`:
   the Barclay export as Co-op, no sizes, the intake without `areaSqft`, `SAMPLE_TIERS` without the size tags.
   When Kimani pulls a real co-op export, it replaces this (a generated file, as `barclay-17l-export.ts` is).
   `buildSampleReport('coop')` uses it, and the sample parses as `property_type = 'coop'` with no size column.
3. **NW-090 a · the inspection API, if Kimani says so.** `/api/comp-report/inspect` behind `X-Inspect-Key`
   (`CR_INSPECT_KEY`), in `netlify/functions/comp-report-inspect.mts`.
   - **The key.** At least 32 characters; unset or shorter means the endpoint is off and answers 401 to every
     call. That is the kill switch: Kimani unsets `CR_INSPECT_KEY` in Netlify, and the PR says so. Compare
     with `sameKey` (sha256 and `timingSafeEqual`): move it from `api/decide.ts` into a shared
     `server/keys.ts` that `decide.ts`, the inspect handler and the test key (item 4) all import. A missing or
     wrong `X-Inspect-Key` is a 401. The handler never calls `requireUser` and never falls through to
     Identity. A failed attempt is written to the function log as JSON (time, reason, never the supplied
     value). It is not written to the database: this is an open door, and a guesser should not be able to
     write rows.
   - **Named views only, no SQL, no raw SELECT:** `reports` (stage, counts), `workspace`, `comps` (comps and
     reasons) and `messages` (each for one report, `report=<uuid>`), `usage`, `access` (the access log),
     `activity` (the activity log), `health`.
   - **Redaction is an allowlist, not a list of names.** Each view is defined in `server/inspect/views.ts`
     as the exact fields it returns, and each field is one of three kinds:
     - `pass`: ids, numbers, booleans, dates and timestamps, and enums from a closed list (a value outside
       the list becomes `[redacted]`). Server-set labels (`usage.model`, `usage.purpose`, `provider`, stage,
       tier, `evidence_class`) pass only against the closed lists the code defines.
     - `text`: any other string. It is `[redacted]` unless `?text=1` (below).
     - never: not returned, with or without `text=1`. `imports.content`, `narratives.input`, link-read page
       bodies and raw `extract`, and anything not listed.
     Anything a view does not list is dropped. The `text` kind covers `reports.title`; the home's address,
     unit and notes; every `state.send` field; `agent_call` and its note; `target.*`; all deal-terms text
     and money (price, target, rate, down payment, `preApprovalAmount`); `reasons.reason`; comp notes and
     free-text tags; `imports.filename`; the addresses, keys and facts in `properties`,
     `property_observations` and comps (so a comp typed by hand, `source = 'agent'`, and a comp read from an
     export are treated alike); `brief.*`; Hubert's text, thinking (`progress`) and tool results; and
     narrative `content`. Phone numbers and emails typed into any of those are inside them.
     User emails (`owner_email`, `created_by`, `reviewed_by`, `user_email`) come out as a short stable
     hash, HMAC-SHA256 of the email keyed on `CR_INSPECT_KEY`, first 8 hex characters, **with or without
     `text=1`**.
   - **`?text=1`** returns the `text` fields as stored (never the `never` fields, and the emails stay
     hashed). It is accepted only on the single-report views (`workspace`, `comps`, `messages`) and needs
     `report=<uuid>`; on any other view it is a 400. At most 20 `text=1` calls an hour and 100 a day across
     the key, then 429 (counted from the audit rows below, under a `pg_advisory_xact_lock` so two calls
     can't both take the last place).
   - **The audit.** Every call that returns data first writes one `access_events` row, event `inspect`
     (`inspect_text` for `text=1`): view, report id if any, the text flag, time, and nothing of the key. It
     is written by the system actor `inspect-audit` in its own transaction, **before** the data transaction
     opens. If it can't be written, `text=1` answers 503 and returns nothing; the redacted views log the
     failure to the function log and go on; `health` writes no row. The migration adds the two event names to
     22's list, an insert policy on `access_events` admitting only
     `current_setting('cr.system_actor', true) = 'inspect-audit'`, and a select policy letting that actor read
     only `inspect` and `inspect_text` rows (for the count). If 22's table has no column for the report id or
     the flag, add nullable ones. The rows follow 22's trim.
   - **A third actor kind, `inspect`, with select-only policies. Not `system`:** several policies admit any
     system actor broadly (`users_select`, `users_update`, `allowlist_select`).
     - The migration replaces `comp_report.enter()` (same signature, so the `migrated` check in `db.ts` still
       holds) to accept `inspect`, with no email, role or system actor. Add `{ kind: 'inspect' }` to `Actor`
       in `db.ts`. Where roles can be managed, `enter()` sets role `comp_report_inspect`, which holds SELECT
       grants only, with column lists that leave out `imports.content` and `narratives.input`; where they
       can't, the policies below are the guard and `views.ts` never names those columns.
     - The inspect actor may SELECT only from: `reports`, `report_comps`, `reasons`, `messages`, `usage`,
       `access_events`, `activity`, `properties`, `property_observations`, `imports`, `narratives`,
       `link_reads`, `geocodes`. Add `or comp_report.actor_kind() = 'inspect'` to 22's `can_read_report` (not
       to `can_edit_report`) and to the select policies of the tables that don't use it. It gets **no policy**
       on `users`, `allowlist`, `decide_requests`, `decide_runtime`, `judgments`, `decide_probes`, the
       sign-in error buckets and their salt table, or anything else; those stay unreadable to it. It appears
       in no INSERT, UPDATE or DELETE policy. The inspect transaction never writes.
     - `loadWorkspace` and `reportFor` take a `Reader` (`{ mode: 'user', email, role }` or
       `{ mode: 'inspect' }`) instead of a `SessionUser`. No admin user is fabricated for the inspect views,
       and `reportFor(…, write = true)` doesn't accept the inspect reader (the type refuses it). The inspect
       handler calls `loadWorkspace`, then passes the result through the allowlist in `views.ts`.
4. **NW-090 b · a test user for writes.** `CR_TEST_KEY` makes `requireUser` return one fixed user. The key
   gets every safeguard the inspect key has.
   - **The key.** At least 32 characters; `sameKey` from `server/keys.ts`; unset or shorter means test mode is
     off. An `X-Test-Key` header with test mode off, or with a wrong value, is a 401 and **never falls
     through to Identity**. The check is the first thing `requireUser` does, before it parses a bearer token,
     so every function that calls `requireUser` honors it, the background ones (write, link read) included.
     Each use is logged to the function log without the key; each failed attempt too, without the value.
   - **The user.** `CR_TEST_USER_EMAIL`, which must end in `@test.invalid` or test mode refuses to start
     (every call 503 `test_mode_misconfigured`, logged). `decide()` refuses that domain for real sign-in,
     whatever `CR_ALLOWED_DOMAINS` or `CR_ADMIN_EMAILS` say, so the Identity gate functions refuse it too,
     and `POST /allowlist` refuses it (400). Role (`agent`) and capability (`practice`) are constants in code,
     never from the environment or the allowlist, and the Access panel can't change them (the test user is not
     listed, and a role change aimed at it is a 404).
   - **The row.** `users.is_test boolean not null default false`, with
     `check (not is_test or email like '%@test.invalid')` and a trigger that refuses any change to `is_test`
     after insert, so an admin can't hide a real user with it. Only the test-key path inserts `is_test = true`,
     through a system actor in `requireUser`. If a row with that email already exists with `is_test = false`,
     the call is refused (503). RLS confines the user to its own rows like any agent.
   - **Out of the lists.** `is_test` users are left out of `GET /reports?scope=all`, the Access panel's
     lists and counts, the activity timeline picker, and the usage totals (their spend shows only in the
     inspect `usage` view, by hash).
   - **Its AI calls.** Hubert and the writer use `CR_EVAL_ANTHROPIC_API_KEY` **only**. If it is unset, the
     call is refused with 503 `eval_key_not_set`, and `ANTHROPIC_API_KEY` is never read for this user.
     `deps.anthropic` takes the user (`productionAnthropic(user)`), and the background write function resolves
     the key the same way. Before each call the server sums that user's `usage.estimated_cost_usd` for the UTC
     day in a transaction holding `pg_advisory_xact_lock(hashtext(email))` and refuses at or over $2 (429
     `test_budget`). A row with a null cost counts as $0.25 (a named constant). Calls already in flight can
     overshoot by their own cost; that is accepted, and the PR says so.
   - **`copy-to-test`** (`/api/comp-report/inspect?view=copy-to-test&report=<uuid>`, POST) is a test-key
     action, not an inspect one. It takes **no `text` parameter** (one is a 400) and always applies item 3's
     allowlist: every `text` field is written as a fixed placeholder, never a left-out key the client then
     crashes on (`[redacted]`; a redacted `property_key` becomes `pk1|redacted-<n>`, unique per property).
     The copy is for exercising the screens and the engine on real shapes and numbers, not real addresses;
     the PR says so. The destination is always `CR_TEST_USER_EMAIL`, never a parameter.
     - Both `X-Inspect-Key` and `X-Test-Key` are verified, in constant time, before any query. Either one
       missing or wrong is a 401 with no partial work.
     - The new report's uuid is generated in code. The audit row (event `inspect_copy`, the source report id
       and the new one) is written first, by `inspect-audit` in its own transaction. If that fails, the copy
       answers 503 and nothing was read or written.
     - Then two transactions: read the source as the inspect actor, then write the copy as the test user under
       its own RLS. The inspect actor never writes and the test user never reads the source.
     - The same sentinel test as item 3 must pass on the copied report as the test user reads it back through
       its own endpoints (`/workspace`, `/messages`, `/narratives`, `/reports`).

## Not in scope

Duplicate and transfer for users (NW-090 c), sharing (NW-089): phase B. A read-only database role (the option
Kimani would have to choose instead of item 3; it would rewrite the repo's rule that sessions never connect to
production). Any change to what Sort, Findings or Send show, or where anything sits on a screen.

## Data and constraints

- **Items 1–2: no migration.** **Items 3–4: one migration, `20261017000000_comp_report_inspect.sql`:** the
  `inspect` actor kind in `enter()`, the `comp_report_inspect` role and grants, the select policies, the
  `inspect-audit` policies and event names on `access_events`, `users.is_test` with its check and trigger, and
  a check on `allowlist` refusing `@test.invalid`. No other open PR uses the timestamp; re-check. If NW-090 a
  is unanswered when you reach this, ship items 1–2 and list items 3–4 as held; Casanova queues them as a
  follow-up line, and `20261017000000` stays unused until then.
- **Keys:** `CR_INSPECT_KEY`, `CR_TEST_KEY`, `CR_TEST_USER_EMAIL` and `CR_EVAL_ANTHROPIC_API_KEY` are made
  fresh on the Casa side (NW-096, D-26): Kimani sets them in Netlify and in the Casa account's Claude Code
  environment, never in the repo. Netlify variables default to every deploy context, so the PR asks him to
  scope all four to the Production context only, or a PR deploy preview carries them. Say so in the PR.
- `netlify/` is already guarded; the route is key-gated.
- A session uses the inspect API with `curl` and the key from its environment. It never reads `NETLIFY_DB_URL`
  or `DATABASE_URL`, and never connects to production.
- Items 1–2 hold no key and run in any account. Items 3–4, and any session that holds `CR_INSPECT_KEY` or
  `CR_TEST_KEY`, run only in Casa's Claude account. If Kimani names a second builder for them, start it in
  Casa's account too.
- Items 1–2 edit `api/comps.ts` and `api/imports.ts`, which 15, 20, 21 and 22 also edit: rebase on whichever
  has merged.

## Definition of done

- Items 1–2:
  - Reset gives a clean sample, condo or co-op, with an empty Hubert; the old one is archived and gone from the
    list. The co-op sample has no size column and no `areaSqft`.
  - Tests for the server rule: an agent and an external get 403 from the reset endpoint and from the three
    existing sample gates; a mentor gets 403 too (until Kimani answers); an admin passing another person's
    report id, or the id of one of their own reports with `sample_data = false`, or one already archived, gets
    404 and nothing is archived or created; the new report is owned by the caller and carries the title read
    from the row; a body title is ignored; create and archive are one transaction (a forced failure leaves the
    old report active and no new one).
  - A Playwright walk: reset the condo sample, then the co-op one, through Sort and Findings. Screenshots in the
    PR.
- Items 3–4 (the second PR), each with a test:
  - **Redaction.** A sentinel test plants a unique string (a client name, a phone number, an email and an
    address, each different) in every text column and every jsonb path of a fully populated report: title,
    `brief`, `state.intake`, `state.send`, `state.dealTerms`, `agent_call.note`, `target`, `reasons`, comp
    notes and tags, typed-comp facts, messages, `progress`, narratives, import filenames. It asserts that no
    sentinel appears in any default inspect view or in the `copy-to-test` result. A second test fails if a
    column of any `comp_report` table, or a key in the jsonb fixtures, is not classified in `views.ts`. A
    third shows `?text=1` returns the sentinels from the `text` fields and never from the `never` ones, and
    that emails stay hashed.
  - **`?text=1`.** Is a 400 on `reports`, `usage`, `access` and `activity`, and without `report=`; writes an
    `inspect_text` audit row with the report id before returning; answers 503 and returns nothing when the
    audit insert is forced to fail; answers 429 on the 21st call in an hour.
  - **The key.** Unset, short, missing and wrong keys are each 401 and never reach Identity; a failed attempt
    is logged without the value and writes no row; the hash of an email is stable and differs under another key.
  - **The inspect actor.** Runs INSERT, UPDATE and DELETE on every `comp_report` table and each fails. A walk
    of `pg_policies` fails if any non-SELECT policy mentions the inspect kind or if a policy on `users`,
    `allowlist`, the decide tables or the bucket tables mentions it. `reportFor` with the inspect reader and
    `write = true` doesn't compile (a type test).
  - **The test key.** An unset key, a short key, a wrong key and a real-domain `CR_TEST_USER_EMAIL` are each
    refused; with a correct key every endpoint and the background functions act as the test user and no one
    else; a row with that email and `is_test = false` is refused; `is_test` can't be changed after insert
    and can't be true on a real address; `decide()`, the Identity gate and `POST /allowlist` refuse the test
    address; the Access panel and `scope=all` don't list the test user.
  - **Its AI.** With the eval key unset the test user's turn and write are 503 and a spy shows
    `ANTHROPIC_API_KEY` was never read; with it set, a call at $2 for the day is refused before it is made,
    and a null-cost row counts.
  - **`copy-to-test`.** With only one of the two keys, nothing is written and no row appears in the test
    user's data; with a `text` parameter it is a 400; with both, the copy lands in the test user's account
    only, passes the sentinel test as the test user reads it, writes an `inspect_copy` row naming both ids,
    and fails with no copy when that row can't be written; the test user can't read a real user's report.
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`.
- The second PR gives Kimani the exact `curl` to try the inspect API once the key is set, and the kill switch.

— Casanova
