# Dispatch 22 — Comp report: who sees what, the sign-in log and the activity log (CR-7e)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Mason
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/06-platform-access-and-data.md` (read its
"Security and RLS" table twice), ledger line `casa-r12-2` (the sign-in log Kimani asked for after Noble's
refused sign-in), and NW-088 a's recommendation (mentors read every report, read-only). D-8's spirit, not its
letter.
**Depends on:** Dispatch 15 merged. Also edited by: 20 (`server/api/comps.ts`), 21
(`server/api/workspace.ts`), 24 (`server/api/messages.ts`, Collister's lane). Whichever of 20, 21 and 22 opens
second rebases on the first. In Mason's queue it comes after 21, except items 1 and 2: if no second builder is
named by the time 18 merges, Mason takes those two first, before 20. If Kimani names a second builder for this
week, it can start as soon as 15 merges.
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Mason (CR-7e)"** in the PR, its comments and your commits. Ledger line: `casa-r13-8`. It
supersedes `casa-r12-2`, and takes the "practice in Access" item of `casa-r12-1`.

**One PR or two.** Items 1 and 2 may go first. Then they are **PR 22a** (migration `20261016120000`: the
function split and the mentor reads) and everything else is **PR 22b** (migration `20261016120100`: the
tables). Both are signed CR-7e. Mark `casa-r13-8` delivered when 22a opens, and add 22b's PR number to the
line when it opens. **Dispatch 24 waits on 22a merged**, not 22b: item 1 is what edits `messages.ts`. If all
six items go in one PR, it is one migration, `20261016120000_comp_report_access_and_activity.sql`, and 24 waits
on it.

**NW-088 a was answered 2026-10-27 as NB-23 A: every report, read-only.** 22a's migration shipped as
`20261027120000_comp_report_mentor_reads.sql`, since migrations up to `20261022000000` had landed by then;
22b takes a timestamp after it. What follows is the brief as written.

**NW-088 a is still open** (`docs/decisions.md`). Item 1 builds on its recommendation, and PR 22a is marked
"do not merge until Kimani answers NW-088 a". If he answers "assigned agents only", only the mentor clause
changes, in the two places item 1 names. Item 2 does not depend on his answer: if he hasn't answered when it is
ready, open it as its own small PR so the sign-in fix isn't held.

## The goal

Kimani couldn't see Noble's report from the list, couldn't see why Noble's sign-in failed, and can't review
what anyone did without asking them to do it again. Fix all three, without widening any write.

## In scope

### PR 22a

1. **NW-088 a · everyone's reports, read-only.**
   - `GET /reports?scope=all` for admins and mentors, with `?owner=` (a normalised email, else 400) and a
     200-row cap. The owner shows in the existing client line, so the table keeps its shape. For admins and
     mentors the list asks for `scope=all` by default, with no control (the Mine / Everyone's control is
     Design's); without `scope` the server still returns the caller's own.
   - **`scope=all` from any other role is ignored**: the caller gets their own reports and no `viewed_list` is
     written. The owner clause stays in the SQL, so the handler never relies on RLS alone (§12): the query
     carries `($2 or owner_email = $1)`, where `$2` is true only for admin and mentor, and `owner_email = $3`
     when `?owner=` is given.
   - **Split `can_see_report` into `can_read_report` (owner, admin, mentor) and `can_edit_report` (owner or
     admin).** `can_edit_report` is today's rule with a new name, so no write is gained or lost: the handlers
     still insist on ownership through `reportFor(write=true)`, and `reports_update` and `reports_insert` stay
     as they are, with no mentor. Name every policy:
     - select on `report_comps`, `reasons`, `messages`, `imports`, `link_reads`, `narratives`, plus
       `observations_select`, use `can_read_report`. `observations_select` widens to it for rows that have a
       `report_id`; without that a mentor sees comps with no facts;
     - **`reports_select` does not call `can_read_report`.** The function selects from `reports`, which has
       FORCE RLS, so the policy would recurse ("infinite recursion detected in policy"). It states
       `owner_email = actor_email() or actor_role() in ('admin','mentor')` inline, and the other tables'
       function reaches a mentor only because that policy admits them;
     - insert and update on the six tables above, plus `observations_insert`, use `can_edit_report`;
     - then **drop `can_see_report`**, so no caller is left. Any later migration (20, 21, 23, 24) uses the new
       two.
   - **The mentor clause lives in exactly two places**: `can_read_report` and `reports_select`, each with a
     comment naming the other. A test fails if the two disagree for any role (owner, admin, mentor, agent,
     external). The PR says plainly that every account with the mentor role can read every report once it
     deploys, and that it waits on NW-088 a.
   - **One read path.** `messages.ts` and `reports.ts` GET `?id=` call `reportFor(tx, user, id, false)`
     instead of their own owner test. `reportFor(write=false)` admits the owner, admins and mentors.
     `reportFor(write=true)` and `turn.ts` stay owner-only. Hubert stays owner-only.
   - Non-owners stay read-only. No "act as owner". Say in the agent-facing copy that mentors and admins can
     read reports.
2. **NW-091 a · the invite's stale session.** `@netlify/identity` 2.0.0's `acceptInvite()` never writes the
   `nf_jwt` cookie (`dist/main.js:851`; `login()` does at `:409`), so the first `/me` goes out with no token.
   After `acceptInvite` succeeds, call `login(email, password)` (or fall back to `hydrateSession()` in
   `token()`, `src/session.ts:76`). On `NotAuthorised` (`src/views/SignIn.tsx`), a 401 gets Try again and the
   code on screen ("signed_out, no token").

### PR 22b

3. **NW-091 b and `casa-r12-2` · the sign-in log.** `comp_report.access_events`. **The gate comes first: it
   never refuses a real sign-in because of logging, size, a missing IP or a database error.** Kinds and when
   they are written:
   - `gate`: every Identity gate decision (`server/identity-events.ts`).
   - `session_start`: in `requireUser`, when `existing.last_seen_at` is over 30 minutes old, or the user is
     new. This is its own condition. The existing 5-minute refresh (`SEEN_REFRESH_MS`) stays as it is and
     writes nothing here.
   - `refused`: where Identity verified someone. The reasons are `not_authorised`, `disabled`, `unconfirmed`,
     `address_unverified` and `provider_not_allowed`.
   - `viewed_other`: someone reads another person's report; `viewed_list`: an admin or mentor loads
     `scope=all`.
   - `signin_error`: the error Google or Identity hands back in the sign-in URL, sent by `SignIn.tsx` to
     `POST /api/comp-report/signin-error` with no sign-in. A Google-side block can then be told from our gate
     refusing. This goes against 06's advice on open endpoints because `casa-r12-2` asked for it; say so in
     the PR.
   - `capability_change`: written by item 6.

   **Where the writes happen.** Every access-log write runs in its own transaction, as the system actor
   `does: 'access-log'`, after the request's work, and **is awaited, inside its own try/catch, before the
   response is returned** (a floating promise is frozen when the function returns). It never runs inside a
   transaction that can throw, and a failure to log never changes the HTTP result.
   - `requireUser` catches the refusal, logs it, then rethrows it. Today the `not_authorised` throw is inside
     the `withActor` callback, so a row written there would roll back with it.
   - `reportFor` keeps its shape and its module holds no state: it returns `{id, owner_email}`. When
     `write=false` and `owner_email !== user.email`, the handler writes `viewed_other` once its transaction has
     committed (the functions are warm and shared between requests, so nothing is "marked" in a variable).
     `workspace` compares `data.report.ownerEmail`. Every read path logs: workspace, messages, narratives,
     links GET and `reports?id=`.

   **Dedupe is a unique index, not a read.** Mentors and the system actor can't select from `access_events`,
   and no select policy is widened to let them. The table has a nullable `dedupe_key text unique`; the insert
   is `... on conflict do nothing`. The key is the lowercase hex SHA-256 of
   `kind | subject | report_id or '' | floor(epoch / window)`. The subject is `by_email` for `viewed_other` and
   `viewed_list` (the viewer, so a second mentor's or admin's view of the same report in the window gets its
   own row), and for `refused` the stored email or stored domain, plus `|reason`. **The database computes the
   key** from the columns as stored, in the same trigger that decides email versus domain (below), so a
   non-user's address never enters it. Windows: 30 minutes for `viewed_other` and `viewed_list`, 15 for
   `refused`. `gate`, `session_start`, `signin_error` and `capability_change` have no key.
   `check (dedupe_key is null or dedupe_key ~ '^[0-9a-f]{64}$')`.

   **What a row holds, and what is checked in the database.** Columns: `at`, `kind`, `source`
   (`server`, `gate` or `public`), `event`, `provider`, `allowed`, `via`, `reason`, `error`, `error_code`,
   `capability`, `email`, `domain`, `by_email`, `report_id`, `owner_email`, `dedupe_key`. Every text column
   except the addresses is a CHECK against a closed list:
   - `kind` in `gate`, `session_start`, `refused`, `viewed_other`, `viewed_list`, `signin_error`,
     `capability_change`; `source` in `server`, `gate`, `public`;
   - `event` in `validate`, `signup`, `login`, `other`; `provider` in `google`, `email`, `other`;
     `via` in `admin`, `allowlist`, `domain`; `reason` in the five above;
   - `error` in `access_denied`, `admin_policy_enforced`, `invalid_request`, `server_error`, `other`;
   - `error_code` in `gate_webhook`, `signups_not_allowed`, `other`; `capability` in `practice`, `full`;
   - `domain` matches `^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$`. A domain that doesn't is stored as null;
   - `(kind = 'gate') = (source = 'gate')` and `(kind = 'signin_error') = (source = 'public')`;
   - for `source in ('gate', 'public')`, `by_email`, `owner_email`, `report_id`, `reason` and `capability`
     are null; for `signin_error`, also `email`, `domain`, `allowed` and `via` are null.

   **Whose address is stored, and the mechanism.** A BEFORE INSERT trigger on `access_events` sets `email`,
   `by_email` and `owner_email` to null unless a `users` row exists for the address. For `source = 'server'`
   only, when `email` is dropped it sets `domain` from that address, or null if it fails the regex. For
   `source in ('gate', 'public')` the trigger never derives a domain from an address: the caller passes
   `domain` already filtered through the closed list below, or null, and the trigger leaves it as given.
   Callers pass an address and never choose whose is kept; a different code path (any system actor) can't
   write an email for a non-user. No IP address is stored or logged anywhere (CR-1.1).

   **The open doors.** There are four, not one: `POST /api/comp-report/signin-error`, and the
   `identity-validate`, `identity-signup` and `identity-login` functions. None has a caller check, so anyone
   can POST them any JSON. Netlify gives no signature on Identity calls that this repo uses. Check Netlify's
   docs for one; if there is one, verify it and say so in the PR. A failed or missing signature only marks the
   row `unverified`; it never changes the gate's answer. Until there is a signature their rows are
   `source = 'gate'`, and the Access panel marks them unverified. `session_start` and `refused` come from a
   verified token and are the record to trust.
   - **Gate rows:** `event` and `provider` come from the closed lists, whatever the body says (anything else
     is `other`). `allowed` and `via` come from `decide()`, never from the body. The system actor name
     `identity-${event}` and the gate's console line take the closed `event`, not the raw one. `domain` is
     stored only if it is one of `CR_ALLOWED_DOMAINS`, `gmail.com`, `googlemail.com`, `outlook.com`,
     `hotmail.com`, `icloud.com` or `yahoo.com`; any other domain is stored as null, so an anonymous caller
     can't plant text through it. `session_start` and `refused` keep the regex rule.
   - **`signin_error`** takes `provider` (closed list) and `error` (closed list, anything else is `other` and
     the raw value is dropped). `error_description` is never stored as text: it is matched against the two
     known descriptions `src/sign-in-errors.ts` already tests for (the webhook failure, "signups not
     allowed") and stored as `error_code`, else `other`. The response is the same empty 204 whether the row
     was stored, dropped or rate-limited.
   - **Size.** `signin-error` only: a `Content-Length` over 1024, or a body that streams past 1,024 bytes,
     gets 413 before it is parsed (a byte-counting bounded reader in `server/http.ts`; `readJsonObject` counts
     characters after reading everything). **The three identity functions never answer 413.** Netlify's event
     body carries the whole user object and is routinely over 1 KB, and a non-2xx refuses the sign-in. They
     read the body as they do today, and its size never changes their answer. If it is over 64 KB they still
     decide on it and write no log row; if it isn't valid JSON there is no email, so 403 as today, and no row.
   - **The IP.** Only `context.ip` (Netlify's), never `X-Forwarded-For`, which the caller controls. The
     identity functions and `signin-error` take `(req, context)`. An IPv6 address is cut to its /64 first.
     For `signin-error`, no IP means answer 204 and store nothing. For the identity functions, **no IP means
     write no log row and the gate answers exactly as `decide()` says.** The IP never changes the gate's
     decision or status code (204 there means allow; `context.ip` is likely absent on Identity's own calls
     and in tests).
   - **The salt.** No new key for Kimani to set. A random salt per day, made by the server and kept in
     `comp_report.signin_salt (day, salt)`, `day` the primary key, readable and writable by the system actor
     only. It is created with `insert ... on conflict (day) do nothing`, then selected. The bucket key is
     HMAC-SHA256 of the IP under that day's salt. The purge deletes the salt with the buckets, so a day's
     hashes can't be reversed afterwards.
   - **Limits.** `comp_report.signin_error_buckets (hour, scope, ip_hash, n)`, primary key
     `(hour, scope, ip_hash)`, with a global counter row per scope and hour (`ip_hash = '*'`). Count with one
     atomic `insert ... on conflict do update set n = n + 1 returning n`. The global counter goes first; past
     its cap the call is dropped, and a per-IP row is created only for calls that passed it. `signin-error`:
     20 an hour per IP, 200 an hour overall. Gate rows: 600 an hour per IP, 1,000 an hour overall. Netlify
     Identity's own calls probably arrive from one address, so the gate numbers are guesses. To size them, the
     gate's console line gains `ip: { present, family: 'v4' | 'v6', bucket }`, where `bucket` is the first 8
     hex characters of the day's HMAC of the address (null if the salt step was skipped). The raw address is
     never logged, stored or pasted into the PR; the PR quotes that line from a real sign-in.
   - **The logging step cannot refuse a sign-in.** In the identity functions the whole step (salt, counters,
     insert) runs after the decision is made, in its own try/catch, in a transaction that starts with
     `set local lock_timeout = '500ms'` and `set local statement_timeout = '500ms'`, and is raced against a
     one-second timer. Any error, timeout, hit cap or `DatabaseUnavailable` is written to the console and
     skipped, and the gate answers as `decide()` said. The global counter is one hot row; a lock wait on it
     is a skip, not a failure. A full table never blocks a sign-in.
   - Retention is below. Rows from the open doors (`source` `gate` or `public`) are kept 30 days. The rest are
     kept 13 months, whatever their kind: that includes the inspect audit rows Dispatch 23 adds to this table.

4. **NW-099 · the activity log.** `comp_report.activity (at, user_email, report_id, session_id uuid, kind
   screen|action|error, name, detail)`.
   - Server-emitted semantic names: `import.read`, `comp.added`, `comp.tiered`, `comp.removed`,
     `comp.restored`, `call.given`, `narrative.copied`, `report.sent`. The handler writes them after its
     transaction commits, as the system actor (`does: 'activity-log'`), `kind = 'action'`, awaited like the
     access-log writes.
   - **The client sends only `screen.<id>` (the router's screen ids) and `error.<code>` (a fixed set of
     `ErrorBoundary` kinds; the PR lists them).** `POST /api/comp-report/activity` behind `requireUser` rejects
     any other name with 400. The check is against closed lists, not a pattern: `SCREEN_IDS`, exported from the
     module that defines `ScreenId` plus the top-level screens (reports, access, new report), and `ERROR_CODES`,
     exported by `ErrorBoundary`. A practice agent with devtools can't forge `call.given` or store chosen text. `kind` comes from the
     name on the server. `user_email` is the session's. `session_id` must be a UUID. `report_id` must be a
     report the caller can read (`can_read_report`), else it is dropped.
   - The database holds the same line: `check ((kind = 'screen' and name ~ '^screen\.[a-z0-9-]{1,40}$') or
     (kind = 'error' and name ~ '^error\.[a-z0-9_]{1,40}$') or (kind = 'action' and name in (<the eight server
     names>)))`, so a handler bug can't store `call.given` as a `screen`.
   - `detail` is a JSON object of validated enums and counts, 500 characters at most, checked per name and by
     a CHECK. No free text, no addresses, no client names.
   - **Limits.** 60 events a minute and 2,000 a day per user, counted from the user's own `activity` rows
     (not process memory), and the body capped at 2 KB. Counting under READ COMMITTED doesn't serialise
     parallel requests, so the handler's first statement in the transaction is
     `select pg_advisory_xact_lock(hashtextextended(email, 0))`, then the two counts, then the insert. 90 days'
     retention.
   - A per-user, per-report timeline in the Access panel. No analytics vendor.
5. **NW-098 · the Feedback box keeps its draft.** In `assets/feedback.js`: save name, email and message to
   `localStorage` on input (try/catch), restore on open through `.value` only (never `innerHTML`), clear on a
   successful send; don't close on an outside click while the message has text. It loads on every tool:
   check two. `assets/studio-header.js` stays untouched.
6. **From Dispatch 14's follow-ups:** a way for an admin to set an agent to `practice` in Access.
   `POST /api/comp-report/capability {email, capability}`, admin only (403 `admins_only` before any query).
   The target must be an existing `users` row (404). `capability` is `practice` or `full` (else 400). The
   UPDATE names only `capability`, `unlocked_by`, `unlocked_at` and `unlocked_reason`, and its WHERE is
   `email = $1`; nothing else on the row is writable from it. Moving to `full` fills `unlocked_by`,
   `unlocked_at` and a `unlocked_reason` the admin gives (up to 200 characters). Moving to `practice` sets all
   three to null. Each change writes a `capability_change` row (`email` the target, `by_email` the admin,
   `capability` the new value). That row is written after the update commits, because only the system actor
   may insert into `access_events`; if the write fails, log it at `console.error` with the target and the
   admin and answer as the update did.

## Retention and deletes

The app role has no DELETE on any of these tables and no other DELETE policy for its own queries. Deletion is
through **three `security definer` functions owned by the migration role**: `comp_report.purge_access_events()`,
`purge_activity()` and `purge_signin_buckets()` (which also removes old salt rows).
- Each sets `search_path = comp_report, pg_temp`, requires `is_system()` and `cr.system_actor = 'log-purge'`,
  and deletes by fixed cutoffs only: `access_events` 13 months (30 days for `source` `gate` or `public`),
  `activity` 90 days, buckets and salt older than today. It deletes by age and source, never by a list of
  kinds, so a kind added later is trimmed too. `revoke all ... from public`; execute granted to
  `comp_report_app`, **inside the same guarded `DO` block as the table grants** (foundations skips that block
  where the role can't be managed, and a plain grant would fail the deploy on a local or preview database).
- `access_events` and `activity` follow the repo's append-only pattern: `refuse_change`-style triggers for
  update, delete and truncate. The delete trigger lets a delete through only while a transaction-local
  `cr.purging` flag is on, set by the purge functions (like `cr.applying_reason`). Each purge function sets
  `cr.purging` back to `'off'` before it returns.
- The tables are `FORCE ROW LEVEL SECURITY` like the rest, so the function's owner is subject to policies too.
  **The only delete policy on the four new tables is `<table>_purge_delete`:**
  `using (comp_report.is_system() and current_setting('cr.purging', true) = 'on' and current_user <> 'comp_report_app')`.
  "No delete" elsewhere in this dispatch means no other policy and no grant. Prove it on the local Postgres.
- One scheduled function, `netlify/functions/comp-report-purge-logs.mts`, runs daily at an off-hour minute and
  only calls the three functions, as the system actor `log-purge`.

## Policies

- `access_events`: select for admins; insert `with check (comp_report.is_system() and
  coalesce(current_setting('cr.system_actor', true), '') <> 'inspect-audit')`. Dispatch 23 adds the one policy
  that admits `inspect-audit`, with its own kind, source and address limits; policies are ORed, so a bare
  `is_system()` here would let that actor write any row. No update, and no delete except
  `access_events_purge_delete`. Inserts never use `RETURNING`, which would need a select policy.
- `activity`: select for admins, and each user's own rows (the rate-limit count is the one consumer). Insert:
  a user may insert only `kind in ('screen', 'error')` with `user_email = actor_email()` and
  `report_id is null or can_read_report(report_id)`; the system actor may insert any. No update, and no delete
  except `activity_purge_delete`.
- `signin_error_buckets`, `signin_salt`: `is_system()` only (select, insert, and update on buckets), plus
  their `_purge_delete`. No admin, mentor, user or inspect policy. Dispatch 23's inspect actor gets a select
  on `access_events` and `activity` in its own migration, and none here.
- **`activity_insert` is the only insert policy that may reference `can_read_report`, and it uses nothing
  else of the two.** A test walks `pg_policies` for the `comp_report` schema. It fails if any insert, update
  or all policy references `can_read_report` or `can_see_report`, or admits the mentor role, except
  `activity_insert`; it asserts `activity_insert` does reference `can_read_report`. It also fails if any
  delete policy other than the four `_purge_delete` ones exists on the new tables, or if one of those lacks
  `is_system()`.

## The readers

`GET /api/comp-report/access-log?view=signin|timeline|audit&user=&report=` is the only reader of both tables.
- The handler checks `user.role === 'admin'` first and answers 403 `admins_only` to anyone else. `user` is a
  normalised email and `report` a UUID, or 400.
- `view=signin` returns `gate`, `session_start`, `refused` and `signin_error` rows. `view=timeline` requires
  `report` (else 400) and returns that report's `activity` rows together with its `viewed_other` rows.
  `view=audit` returns `viewed_list` and `capability_change` rows. An unknown `view` is 400. Every query names
  its kinds in the WHERE clause.
- Every query names its filters in its WHERE clause (both layers, §12) and has an explicit `limit 100`. The
  Access panel shows the last 100 lines.
- The panel and the inspect view render every stored value as a code or plain text, never as markup or
  instructions. The closed lists make the labels; there is no free text to show.

## Not in scope

Sharing a report (NW-089 a, phase B: its entry point is Design's), duplicate and transfer (NW-090 c, phase B),
the list's Mine / Everyone's control and search (NW-088 b, Design), the inspection API and the test user
(Dispatch 23), who may reset samples (NW-054, Dispatch 23).

**Test users, left to 23.** This dispatch doesn't mention `users.is_test` and works without it. Once Dispatch 23
adds `users.is_test`, 23 adds the exclusion of those users to `GET /reports?scope=all`, the Access panel's
lists and counts and the usage totals. 23 also owns the `@test.invalid` refusal on `POST /allowlist` (its check
on `allowlist`); 22 adds none, and doesn't touch that endpoint.

## Data and constraints

- **Migrations.** 22a: `20261016120000_comp_report_mentor_reads.sql`: the function split and the mentor
  reads. 22b: `20261016120100_comp_report_access_and_activity.sql`: `access_events`, `activity`,
  `signin_error_buckets`, `signin_salt`, the purge functions, and the `comp_report_app` grant block. One PR:
  one migration, as above. No other open PR uses these timestamps; re-check. The grants are select and insert
  on `access_events`, `activity` and `signin_salt`; select, insert and update on `signin_error_buckets`; and
  execute on the three purge functions, all inside foundations' guarded `DO` block.
- Sessions never connect to production, and never to `DATABASE_URL`. `db.ts` ignores it on purpose. Prove the
  policies on a local Postgres (`npm run db:local`).
- **New functions:** `signin-error`, `activity`, `access-log`, `capability`, and the scheduled
  `comp-report-purge-logs`. Each is a v2 function with its own `config.path` (the scheduled one a `schedule`).
  The three `identity-*` functions change only to pass `context` through and to run the logging step.
- No new environment variable.
- 91 a can't be proven in the sandbox (no Identity). The PR asks Kimani for one real invite to a second
  address after deploy, and for the gate's console line from a real sign-in (its `ip` field shows the bucket,
  never the address).

## Definition of done

- An admin and a mentor see every report in the list and open any read-only; an agent sees only their own.
  Tests, as SQL under `withActor` without the handler's owner clause, for owner, admin, mentor, agent and
  external: a catalog-driven pass over every `comp_report` table with a `report_id` column that attempts
  INSERT and UPDATE for each role and compares with the writes allowed before the migration. No role gains or
  loses a write; a mentor can't write anywhere. Additionally the mentor attempts UPDATE on another agent's
  `reports` row and on `users` and `allowlist`, and INSERT into `reports` with another owner; all fail.
- `scope=all` as an agent or external user returns only their own reports and writes no `viewed_list`; a
  non-normalised `?owner=` is 400.
- `reports_select` and `can_read_report` agree for every role (a test over owner, admin, mentor, agent,
  external); `reports_select` does not call the function (no recursion error).
- A mentor can read comps with facts (`observations_select`), messages, imports, narratives and links of
  another agent's report. `can_see_report` no longer exists.
- **The gate never refuses because of logging.** Each identity function, with a database that throws, with
  the salt create failing, with a lock held on the global counter row, with the caps hit, with `context.ip`
  absent, with a 100 KB body and with a 2 KB valid user object, answers exactly what `decide()` says (204 for
  an allowed user, 403 for a refused one), never 413 or 500; a body over 64 KB or invalid writes no row.
- Access log: one test per kind. A spoofed `X-Forwarded-For` doesn't change the bucket. A 2 KB body to
  `signin-error` gets 413; with no `context.ip` it answers 204 and stores nothing. Posted `error_description`
  text, `provider` and `event` values never appear in any stored column, and a gate POST for `x@ignore-previous-instructions.net` stores a null `email` and a null `domain`. An email is stored only for an existing `users`
  row (the trigger nulls `email`, `by_email` and `owner_email` otherwise, whatever the inserting code passes),
  and a non-user's address is not in any `dedupe_key`. The CHECKs reject a row with a `kind` and `source` that
  don't pair, and a gate row with a `reason` or `report_id`. The same IP has different hashes on two days,
  and the purge removes old salt rows. The gate's console output never contains the address (its `ip` field
  shows `present`, `family` and the bucket only).
- `access_events` insert: as the system actor `inspect-audit`, a row of kind `gate` and a row with an email
  set both fail (Dispatch 23 adds that actor's own narrower policy).
- Dedupe: two mentors viewing the same report in one window leave two rows; one mentor viewing it twice leaves
  one.
- Refused and viewed: 50 requests as a refused user, and 50 as a mentor viewing another report, each leave one
  row. A refusal for `not_authorised` is logged (it is thrown inside the transaction today). A failing log
  write doesn't change the response, and the write is awaited (the row exists when the response returns).
  `session_start` is written once per 30 minutes, not every 5.
- Activity: POSTing `call.given`, a `report_id` the caller can't read, a non-UUID `session_id` and a 3 KB body
  are each rejected or dropped. The 61st event in a minute and the 2,001st in a day are refused, and 100
  parallel POSTs store at most 60. `screen.ignore-previous-instructions` is a 400; every id the router can
  show is in `SCREEN_IDS`. `detail` with free text fails the CHECK, and so does a row with `kind`
  `screen` and the name `call.given`.
- Deletes: as an admin user, as the system actor `decide-key`, and as `comp_report_app`, a direct UPDATE or
  DELETE on `access_events` and `activity` fails. The purge, called as `log-purge`, removes only rows older
  than its cutoffs, trims an old row of a kind Dispatch 23 may add, fails for any other actor, and leaves
  `cr.purging` off afterwards. The policy test passes as described under Policies, and the migration applies on
  a database where the role can't be managed.
- Access reader: admin sees rows; agent, mentor and external get 403 at the handler and zero rows at the SQL
  level. `view=audit` shows `viewed_list` and `capability_change`; `view=timeline` without `report` and an
  unknown `view` are 400. Capability: admin only; unknown email 404; `capability` outside `practice` and
  `full` 400; the change is logged; moving to `practice` nulls the three `unlocked_*` fields; a failing log
  write is a `console.error` and the change stands.
- The Access panel shows sign-in lines (gate lines marked unverified), refusals with their reason and Google's
  error code, and one report's activity timeline.
- `test:feedback` covers the draft: saved on input, restored on open (into `.value`; a draft containing
  markup shows as text), cleared on send, kept on an outside click.
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`.
- A Playwright walk of Reports as admin and as agent, and the Access panel. Screenshots in the PR.

— Casanova
