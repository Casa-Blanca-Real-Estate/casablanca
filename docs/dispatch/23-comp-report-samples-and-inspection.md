# Dispatch 23 — Comp report: samples that reset, and reading production safely (CR-7f)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Mason
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/06-platform-access-and-data.md` (NW-054, NW-090),
`02-sort.md` (NW-054 a and b), and `server/api/decide.ts` (the key pattern to copy).
**Depends on:** items 1–2: Dispatch 15 merged, nothing else. Items 3–4: Dispatch 22b merged (the tables
`access_events` and `activity`, which this reads and writes; 22a, with `can_read_report`, comes before it),
your migration timestamp after 22b's `20261016120100`, and Kimani's answer to NW-090 a. Items 1–2 also wait
on who may use samples (NW-054); build admins only until he says otherwise.
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
   transaction what the browser stitches together today (`Workspace.tsx` `fillSample`, `NewComp.tsx`). "Reset
   the sample" builds a fresh report with the same title and archives the old one (`status = 'archived'`).
   In-place reset can't work: `reasons` and `messages` are append-only, so Hubert would remember the last test.
   - **What it builds.** `buildSampleReport` sets `reports.sample_data = true` on the new report and
     `sample = true` on its import. Without that, the reset's own `where` below would 404 on the report it
     just made, and a second reset would fail.
   - **Fill with sample.** On the new-report screen, "Use the 100 Barclay sample" creates a new sample report
     through `buildSampleReport` (title from the body, 1–200 characters, else 400). On an open report, Fill with
     sample is unchanged: it fills that report in place.
   - **The routes.** Both ride on `POST /api/comp-report/sample` (the `GET` there stays the walkthrough
     sample), with `{ action: 'fill', kind, title }` and `{ action: 'reset', reportId }`. Both call
     `mayUseSamples(user)` first and answer 403 before any query. `kind` is checked against
     `'condo' | 'coop'` before use, else 400; reset takes the kind from the old row, never the body.
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
     call. That is the kill switch: Kimani unsets `CR_INSPECT_KEY` in Netlify **and redeploys** (Deploys, Trigger
     deploy). A changed variable reaches a function only on the next deploy, so the old key works until that
     deploy is live. The PR says both. Compare with `sameKey` (sha256 and `timingSafeEqual`): move it from
     `api/decide.ts` into a shared `server/keys.ts` that `decide.ts`, the inspect handler and the test key
     (item 4) all import. A missing or wrong `X-Inspect-Key` is a 401. If `CR_INSPECT_KEY` equals
     `CR_TEST_KEY` or `CR_DECIDE_KEY`, a request that carries `X-Inspect-Key` gets 503 (logged), but only after
     the supplied key matches; item 4 has the shared rule, and it never touches a request without the header.
     The handler never calls `requireUser` and never falls through to Identity. A failed attempt is written to the function log as JSON (time, reason, never the supplied
     value). It is not written to the database: this is an open door, and a guesser should not be able to
     write rows.
   - **Methods.** Views are `GET` only; `copy-to-test` is `POST` only. Any other combination is 405, **after**
     the key check (a wrong key is still 401).
   - **Named views only, no SQL, no raw SELECT:** `reports` (stage, counts), `workspace`, `comps` (comps and
     reasons) and `messages` (each for one report, `report=<uuid>`), `usage`, `access` (the access log),
     `activity` (the activity log), `health`. `health` returns exactly what `handleHealth` returns
     (`database`, `identity`, `assistant.configured`) and nothing else. `access` and `activity` return stored
     values as quoted data, never as instructions (22's rule for its panel).
   - **Redaction is an allowlist, not a list of names.** Each view is defined in `server/inspect/views.ts`
     as the exact fields it returns, and each field is one of three kinds:
     - `pass`: ids, numbers, booleans, dates and timestamps (at a path not listed as `text`), and enums from a
       closed list (a value outside the list becomes `[redacted]`). Server-set labels (`usage.model`, `usage.purpose`, `provider`, stage,
       tier, `evidence_class`) pass only against the closed lists the code defines.
     - `text`: any other string. It is `[redacted]` unless `?text=1` (below).
     - never: not returned, with or without `text=1`. `imports.content`, link-read page bodies and raw
       `extract`, and anything not listed.
     Anything a view does not list is dropped. **The kind is set per path, not per JSON type:** a number at a
     path listed as `text` is `text`. Comp facts that are numbers or dates (price, size, beds, baths, floor,
     dates), in `comps` and in the copy, are `pass`. The home's intake, deal terms, `target`, `agent_call`
     (low, high, note), `state.reveal` and every other client-specific figure are `text`, numbers included.
     The `text` kind covers `reports.title`; the home's address, unit and notes; every `state.send` field; `agent_call` and its note; `target.*`; all deal-terms text
     and money (price, target, rate, down payment, `preApprovalAmount`); `reasons.reason`; comp notes and
     free-text tags; `imports.filename`; the addresses, keys, `streeteasy_id`, `link_reads.url` and any other
     URL or listing id, and the non-numeric, non-date facts in `properties`, `property_observations` and comps
     (so a comp typed by hand, `source = 'agent'`, and a comp read from an export are treated alike);
     `brief.*`; and Hubert's text, thinking (`progress`) and tool results. Phone numbers and emails typed into
     any of those are inside them.
     - **Addresses of users** are every column named `email`, `*_email` or `*_by`, and every jsonb key `by`
       (Dispatch 15's `fact_overrides.by`), in any view. A value starting `system:` passes as is; any other
       value comes out as a short stable hash, HMAC-SHA256 of the email keyed on `CR_INSPECT_KEY`, first 8
       hex characters, **with or without `text=1`**. A column or key matching that pattern and not hashed
       fails the classification test.
     - **`loadWorkspace` with the inspect reader never selects `imports.content`** (it returns an empty
       `contentBase64`) **or `link_reads.extract`** (selected as null), so the column grant below holds and
       nothing `never` is read into memory.
     - **No inspect view reads `narratives`.** Adding one needs a new dispatch.
   - **`?text=1`** returns the `text` fields as stored (never the `never` fields, and the emails stay
     hashed). It is accepted only on the single-report views (`workspace`, `comps`, `messages`) and needs
     `report=<uuid>`; on any other view it is a 400. At most 20 `text=1` calls an hour and 100 a day across
     the key, then 429 (counted from the audit rows, as below).
   - **The audit.** Every call that returns data first writes one `access_events` row: view, report id if any,
     the text flag, time, and nothing of the key. It is written by the system actor `inspect-audit` in its
     own transaction, **before** the data transaction opens. If it can't be written, `text=1` answers 503 and
     returns nothing; the redacted views log the failure to the function log and go on; `health` writes no
     row. The rows follow 22's trim.
     - **Columns.** `kind` is `inspect`, `inspect_text` (for `text=1`) or `inspect_copy` (item 4); the
       migration adds these three to 22's `kind` CHECK, and `event` stays null. `source = 'server'`. The
       migration adds nullable `view text` (CHECK: one of the named views, or `copy-to-test`), `text_flag
       boolean` and `target_report_id uuid`; `report_id` is 22's column. For `copy-to-test`, `report_id` is the
       source and `target_report_id` the new report.
     - **Policies.** An insert policy admits `current_setting('cr.system_actor', true) = 'inspect-audit'` only
       with `kind in ('inspect','inspect_text','inspect_copy')`, `source = 'server'`, and `email`, `by_email`,
       `owner_email` and `domain` null. A select policy lets that actor read only `inspect_text` rows (for the
       count). Dispatch 22's insert policy excludes this actor by name, so this policy is the
       only one that admits it. `inspect-audit` issues exactly two statements, the 60-minute and 24-hour
       `inspect_text` count and the one audit insert; a query spy asserts nothing else runs under that actor
       name. The inspect actor itself gets a select on `access_events` and `activity` here, and none on 22's
       `signin_error_buckets` and `signin_salt`.
     - **The count and the insert are one transaction.** For `text=1`, the audit transaction takes
       `pg_advisory_xact_lock`, counts `inspect_text` rows for the last 60 minutes and the last 24 hours, and
       inserts the new row only if both are under their caps (20 and 100), all in that one transaction. A call
       refused with 429 writes no row.
   - **A third actor kind, `inspect`, with select-only policies. Not `system`:** several policies admit any
     system actor broadly (`users_select`, `users_update`, `allowlist_select`).
     - The migration replaces `comp_report.enter()` (same signature, so the `migrated` check in `db.ts` still
       holds) to accept `inspect`, with no email, role or system actor. Add `{ kind: 'inspect' }` to `Actor`
       in `db.ts`. Where roles can be managed, `enter()` sets role `comp_report_inspect`, which holds SELECT
       grants only, with a column list on `imports` that leaves out `content` and one on `link_reads` that
       leaves out `extract`; where they can't, the policies below are the guard and `views.ts` never names
       those columns.
     - The inspect actor may SELECT only from: `reports`, `report_comps`, `reasons`, `messages`, `usage`,
       `access_events`, `activity`, `properties`, `property_observations`, `imports`, `link_reads`,
       `geocodes`. **Do not change `can_read_report`, `can_edit_report` or any other function.** 22 already
       calls `can_read_report` from a non-select policy (the `activity` insert), so a clause inside it would
       open a write path. Instead, drop and recreate each SELECT policy on those tables with
       `or comp_report.actor_kind() = 'inspect'` added to its own `using`, and touch no other policy. (Use
       `can_read_report` and `can_edit_report` only; 22 drops `can_see_report`.) The inspect transaction opens
       `begin read only`: `withActor` gets a read-only option, used only for `kind: 'inspect'`. It gets **no
       policy** on `users`, `allowlist`, `decide_requests`, `decide_runtime`, `judgments`, `decide_probes`,
       the sign-in error buckets and their salt table, or anything else (`narratives` included); those stay
       unreadable to it. It appears in no INSERT, UPDATE or DELETE policy. The inspect transaction never writes.
     - `loadWorkspace` and `reportFor` take a `Reader` (`{ mode: 'user', email, role }` or
       `{ mode: 'inspect' }`) instead of a `SessionUser`. No admin user is fabricated for the inspect views,
       and `reportFor(…, write = true)` doesn't accept the inspect reader (the type refuses it). The inspect
       handler calls `loadWorkspace` (which selects as above), then passes the result through the allowlist in
       `views.ts`.
     - **Comp facts come from observations, never from the export.** `loadWorkspace` returns export comps as
       `{ kind: 'export', importId }` only; the client gets their prices and sizes by parsing
       `imports.content`, which is `never` here. So `views.ts` reads comp facts itself for the inspect reader:
       for each comp, `property_observations.facts` of `report_comps.observation_id`, with a fixed allowlist
       of numeric and date keys as `pass` and every other key `text` or dropped. `observations.raw` is
       classified the same way, key by key.
4. **NW-090 b · a test user for writes.** `CR_TEST_KEY` makes `requireUser` return one fixed user. The key
   gets every safeguard the inspect key has.
   - **The key.** At least 32 characters; `sameKey` from `server/keys.ts`; unset or shorter means test mode is
     off. An `X-Test-Key` header with test mode off, or with a wrong value, is a 401 and **never falls
     through to Identity**. Header presence, even an empty value, means the test-key path. The check is the
     first thing `requireUser` does, before it parses a bearer token, so every function that calls
     `requireUser` honors it, the background ones (write, link read) included. Each use is logged to the
     function log without the key; each failed attempt too, without the value. If `CR_TEST_KEY` equals
     `CR_INSPECT_KEY` or `CR_DECIDE_KEY`, one check in `server/keys.ts` applies the same rule to all three, so
     one leaked key is never two.
   - **Misconfiguration is scoped to the key's own header.** When `X-Test-Key` is absent, `testUser()` reads
     only `env` and the header: no database access, no error, and it returns nothing, so `requireUser` goes
     on to Identity as today. A collision (two of `CR_TEST_KEY`, `CR_INSPECT_KEY`, `CR_DECIDE_KEY` set to the
     same value; a key counts only if it is set and at least 32 characters) or a `CR_TEST_USER_EMAIL` outside
     `@test.invalid` makes 503 only (a) a request that carries `X-Test-Key`, and (b) `copy-to-test`; `inspect`
     503s only for requests that carry `X-Inspect-Key`, and `decide` only for requests that carry its key. The
     supplied key is verified first: a wrong or empty key is 401 whatever the config, and 503 comes only after
     it matches. A request without any of the three headers behaves exactly as if the keys did not exist.
   - **Where it lives.** The check and the provisioning are `testUser(req, env, pool)` in
     `server/test-user.ts`. `requireUser` calls it first, and the `copy-to-test` branch calls it. The inspect
     handler never calls `requireUser`.
   - **The user.** `CR_TEST_USER_EMAIL`, which must end in `@test.invalid`; otherwise a request carrying
     `X-Test-Key` (and only such a request, see above) gets 503 `test_mode_misconfigured`, logged. `decide()` refuses that domain for real sign-in,
     whatever `CR_ALLOWED_DOMAINS` or `CR_ADMIN_EMAILS` say, so the Identity gate functions refuse it too,
     and `POST /allowlist` refuses it (400). Role (`agent`) and capability (`practice`) are constants in code,
     never from the environment or the allowlist, and the Access panel can't change them (the test user is not
     listed, and a role change aimed at it is a 404).
   - **The row.** `users.is_test boolean not null default false`, with
     `check (not is_test or email like '%@test.invalid')` and a trigger that refuses any change to `is_test`
     after insert, so an admin can't hide a real user with it. Only the test-key path inserts `is_test = true`,
     in a transaction run as the system actor `does: 'test-key'`, and the database enforces it:
     `users_insert` becomes
     `is_system() and (not is_test or current_setting('cr.system_actor', true) = 'test-key')`. If a row with
     that email already exists with `is_test = false`, the call is refused (503). RLS confines the user to its own rows like any agent.
   - **Out of the lists.** This item adds the exclusion to 22's queries (they exist by then; 22 doesn't add it).
     `is_test` users are left out of `GET /reports?scope=all`, the Access panel's
     lists and counts, the activity timeline picker, and the usage totals (their spend shows only in the
     inspect `usage` view, by hash).
   - **Its AI calls.** Hubert and the writer use `CR_EVAL_ANTHROPIC_API_KEY` **only**. If it is unset, the
     call is refused with 503 `eval_key_not_set`, and `ANTHROPIC_API_KEY` is never read for this user.
     `deps.anthropic` takes the user (`productionAnthropic(user)`), and the background write function resolves
     the key the same way. For an `is_test` user, `enqueueListingJudgments` (the Jev and Haiku layer, which
     reads `ANTHROPIC_API_KEY` and the Jev gateway key) returns `{ queued: false, why: 'off' }` without
     reading either key; its callers pass whether the user is `is_test`. Link reads for this user keep the
     existing per-user daily limit.
     Before each call the server sums that user's `usage.estimated_cost_usd` for the UTC day in a transaction holding `pg_advisory_xact_lock(hashtext(email))` and refuses at or over $2 (429
     `test_budget`). A row with a null cost counts as $0.25 (a named constant). Calls already in flight can
     overshoot by their own cost; that is accepted, and the PR says so.
   - **`copy-to-test`** (`/api/comp-report/inspect?view=copy-to-test&report=<uuid>`, POST only) is a test-key
     action, not an inspect one. It takes **no `text` parameter** (one is a 400) and always
     applies item 3's allowlist: every `text` field is written as a fixed placeholder, never a left-out key
     the client then crashes on. A `text` string becomes `[redacted]`; a `text` number becomes a fixed
     placeholder number the engine accepts (named constants per path, chosen so `checkCall` and
     `checkTarget` pass; the PR lists them); `pass` fields (comp prices, sizes, dates) are copied. A redacted
     `property_key` becomes `pk1|redacted-<new report uuid>-<n>`, inserted with a plain `insert` and no
     `on conflict`, so it is unique across copies and never attaches the copy to another report's property
     row; `properties.streeteasy_id` is written null and `address` as `[redacted]`. The copy is for exercising
     the screens and the engine on real shapes and numbers, not real addresses; the PR says so. The destination is always `CR_TEST_USER_EMAIL`, never a parameter.
     - Both `X-Inspect-Key` and `X-Test-Key` are verified, in constant time, before any query. Either one
       missing or wrong is a 401 with no partial work.
     - The new report's uuid is generated in code. The audit row (`kind = 'inspect_copy'`, `report_id` the
       source, `target_report_id` the new one) is written first, by `inspect-audit` in its own transaction. If
       that fails, the copy answers 503 and nothing was read or written.
     - Then two transactions: read the source as the inspect actor, then write the copy as the test user under
       its own RLS. The inspect actor never writes and the test user never reads the source.
     - The same sentinel test as item 3 must pass on the copied report as the test user reads it back through
       its own endpoints (`/workspace`, `/messages`, `/reports`). The copy takes no narratives.
     - **The copy never copies, re-encodes or derives anything from `imports.content`,** and writes no
       `imports` row from the source. It writes one import for the new report whose content the server
       generates from the `pass` facts and the placeholders, using the CSV writer ported from `coopCsv()` /
       `barclay-17l-export.ts`, with `[redacted]` addresses. The `property_observations` rows it writes carry
       the same `pass` facts. The sentinel test also asserts that the copy's `imports.content` contains no
       sentinel and that its `content_sha256` differs from the source's.

## Not in scope

Duplicate and transfer for users (NW-090 c), sharing (NW-089): phase B. A read-only database role (the option
Kimani would have to choose instead of item 3; it would rewrite the repo's rule that sessions never connect to
production). Any change to what Sort, Findings or Send show, or where anything sits on a screen.

## Data and constraints

- **Items 1–2: no migration.** **Items 3–4: one migration, `20261017000000_comp_report_inspect.sql`:** the
  `inspect` actor kind in `enter()`, the `comp_report_inspect` role and grants, the recreated select policies,
  the `inspect-audit` policies, the three `kind` names and the `view`, `text_flag` and `target_report_id`
  columns on `access_events`, `users.is_test` with its check and trigger, the `users_insert` change, and a
  check on `allowlist` refusing `@test.invalid`. No other open PR uses the timestamp; re-check. If NW-090 a
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
- Items 1–2 edit `api/sample.ts`, `api/comps.ts` and `api/imports.ts`, the last two of which 15, 20, 21 and 22 also edit: rebase
  on whichever has merged.

## Definition of done

- Items 1–2:
  - Reset gives a clean sample, condo or co-op, with an empty Hubert; the old one is archived and gone from the
    list. The co-op sample has no size column and no `areaSqft`.
  - A reset sample is itself resettable: `buildSampleReport` marks the report `sample_data = true` and its
    import `sample = true`, and a second reset of the new report works. Fill with sample on the new-report
    screen creates its report through `buildSampleReport`; on an open report it fills in place as before. A
    `kind` outside `condo` and `coop` is 400.
  - Tests for the server rule: an agent and an external get 403 from the reset and fill routes (before any
    query runs: a spy sees none) and from the three existing sample gates; a mentor gets 403 too (until Kimani answers);
    an admin passing another person's report id, or the id of one of their own reports with `sample_data = false`, or one already archived, gets
    404 and nothing is archived or created; the new report is owned by the caller and carries the title read
    from the row; a body title is ignored; create and archive are one transaction (a forced failure leaves the
    old report active and no new one).
  - A Playwright walk: reset the condo sample, then the co-op one, through Sort and Findings. Screenshots in the
    PR.
- Items 3–4 (the second PR), each with a test:
  - **Redaction.** A sentinel test plants a unique string (a client name, a phone number, an email and an
    address, each different) in every text column and every jsonb path of a fully populated report: title,
    `brief`, `state.intake`, `state.send`, `state.dealTerms`, `agent_call.note`, `target`, `reasons`, comp
    notes and tags, typed-comp facts, messages, `progress`, import filenames. It asserts that no
    sentinel appears in any default inspect view or in the `copy-to-test` result. A second test fails if a
    column of any `comp_report` table, or a key in the jsonb fixtures, is not classified in `views.ts`. A
    third shows `?text=1` returns the sentinels from the `text` fields and never from the `never` ones, and
    that emails stay hashed. The sentinels include unique numbers at the numeric `text` paths (price, target,
    rate, `agent_call` low and high, `state.reveal`), which must not appear by default; a comp price, size or
    date passes. The classification test also fails for any column or jsonb key named `email`, `*_email` or
    `*_by` (and `fact_overrides.by`) that is not hashed. A query spy shows `loadWorkspace` with the inspect
    reader never selects `imports.content` or `link_reads.extract`, and that no inspect query touches
    `narratives`.
  - **`?text=1`.** Is a 400 on `reports`, `usage`, `access` and `activity`, and without `report=`; writes an
    `inspect_text` audit row with the report id before returning; answers 503 and returns nothing when the
    audit insert is forced to fail; answers 429 on the 21st call in an hour, and that refused call writes no row. Two concurrent calls with
    one place left: exactly one succeeds. The `inspect-audit` actor can't insert a row of another kind, one
    with an email set, or one with `source` other than `server`, and can't read any kind but `inspect_text`.
  - **The key.** Unset, short, missing and wrong keys are each 401 and never reach Identity; a failed attempt
    is logged without the value and writes no row; the hash of an email is stable and differs under another
    key. A view on POST and `copy-to-test` on GET are each 405 with a good key and 401 with a bad one.
    `health` returns exactly `handleHealth`'s payload. Any two of `CR_INSPECT_KEY`, `CR_TEST_KEY` and
    `CR_DECIDE_KEY` set equal make a request carrying the matching key's header 503, and a wrong key 401. With
    colliding keys and a real-domain `CR_TEST_USER_EMAIL`, a normal Bearer request, the three `identity-*`
    gates and an Identity admin on `/decide` answer exactly as with no keys set.
  - **The inspect actor.** Runs INSERT, UPDATE and DELETE on every `comp_report` table and each fails. A walk
    of `pg_policies` and `pg_get_functiondef` fails if any non-SELECT policy, or any function a non-SELECT
    policy calls, mentions the inspect kind, or if a policy on `users`, `allowlist`, the decide tables or the
    bucket tables mentions it. The statements use otherwise-valid rows and assert SQLSTATE `42501` (RLS or
    privilege) when run in a plain transaction as the inspect actor, and `25006` (read-only) through
    `withActor`; any other error fails the test. `reportFor` with the inspect reader and `write = true`
    doesn't compile (a type test).
  - **The test key.** An unset key, a short key, a wrong key and a real-domain `CR_TEST_USER_EMAIL` are each
    refused; with a correct key every endpoint and the background functions act as the test user and no one
    else; an empty `X-Test-Key` header is 401; a row with that email and `is_test = false` is refused; a system
    actor other than `test-key` inserting `is_test = true` fails in the database; `is_test` can't be changed
    after insert and can't be true on a real address; `decide()`, the Identity gate and `POST /allowlist` refuse the test
    address; the Access panel and `scope=all` don't list the test user.
  - **Its AI.** With the eval key unset the test user's turn and write are 503 and a spy shows
    `ANTHROPIC_API_KEY` was never read, `enqueueListingJudgments` included (it returns `why: 'off'` for this
    user); with it set, a call at $2 for the day is refused before it is made, and a null-cost row counts.
  - **`copy-to-test`.** With only one of the two keys, nothing is written and no row appears in the test
    user's data; with a `text` parameter it is a 400; with both, the copy lands in the test user's account
    only, passes the sentinel test as the test user reads it, writes an `inspect_copy` row naming both ids,
    and fails with no copy when that row can't be written; a second copy of the same report succeeds and
    gets different `property_key`s; the engine runs on the copy (`checkCall` and `checkTarget` accept its
    placeholder numbers); `GET` is 405; the test user can't read a real user's report.
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`.
- The second PR gives Kimani the exact `curl` to try the inspect API once the key is set, and the kill
  switch (unset `CR_INSPECT_KEY`, then redeploy; the old key works until that deploy is live).

— Casanova
