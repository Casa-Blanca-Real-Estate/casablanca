# Dispatch 22 — Comp report: who sees what, the sign-in log and the activity log (CR-7e)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Mason
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/06-platform-access-and-data.md` (read its
"Security and RLS" table twice), ledger line `casa-r12-2` (the sign-in log Kimani asked for after Noble's
refused sign-in), and NW-088 a's recommendation (mentors read every report, read-only). D-8's spirit, not its
letter.
**Depends on:** Dispatch 15 merged. Also edited by: 20 (`server/api/comps.ts`), 21
(`server/api/workspace.ts`), 24 (`server/api/messages.ts`, Calliste's lane). Whichever of 20, 21 and 22 opens
second rebases on the first. In Mason's queue it comes after 21, except items 1 and 2: if no second builder is
named by the time 18 merges, Mason takes those two first, before 20. If Kimani names a second builder for this
week, it can start as soon as 15 merges.
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Mason (CR-7e)"** in the PR, its comments and your commits. Ledger line: `casa-r13-8`. It
supersedes `casa-r12-2`, and takes the "practice in Access" item of `casa-r12-1`.

**One PR or two.** Items 1 and 2 may go first. Then they are **PR 22a** (migration `20261016120000`: the
function split and the mentor reads) and everything else is **PR 22b** (migration `20261016120100`: the
tables). Both are signed CR-7e. Mark `casa-r13-8` delivered when 22a opens, and add 22b's PR number to the
line when it opens. **Dispatch 24 waits on 22a**, not 22b: item 1 is what edits `messages.ts`. If all six items
go in one PR, it is one migration, `20261016120000_comp_report_access_and_activity.sql`, and 24 waits on it.

## The goal

Kimani couldn't see Noble's report from the list, couldn't see why Noble's sign-in failed, and can't review
what anyone did without asking them to do it again. Fix all three, without widening any write.

## In scope

### PR 22a

1. **NW-088 a · everyone's reports, read-only.**
   - `GET /reports?scope=all` for admins and mentors, with `?owner=` (a normalised email) and a 200-row cap.
     The owner shows in the existing client line, so the table keeps its shape. For admins and mentors the
     list asks for `scope=all` by default, with no control (the Mine / Everyone's control is Design's);
     without `scope` the server still returns the caller's own.
   - **Split `can_see_report` into `can_read_report` (owner, admin, mentor) and `can_edit_report` (owner or
     admin).** `can_edit_report` is today's rule with a new name, so no write is gained or lost: the handlers
     still insist on ownership through `reportFor(write=true)`, and `reports_update` and `reports_insert` stay
     as they are, with no mentor. Name every policy:
     - select on `report_comps`, `reasons`, `messages`, `imports`, `link_reads`, `narratives`, plus
       `reports_select` and `observations_select`, use `can_read_report`. `observations_select` widens to it
       for rows that have a `report_id`; without that a mentor sees comps with no facts;
     - insert and update on those six tables, plus `observations_insert`, use `can_edit_report`;
     - then **drop `can_see_report`**, so no caller is left. Any later migration (20, 21, 23, 24) uses the new
       two.
   - Mentor read lives in one clause of `can_read_report`. If Kimani answers NW-088 a with "assigned agents
     only", that clause is the only thing that changes. The PR says plainly that every account with the
     mentor role can read every report once it deploys.
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

3. **NW-091 b and `casa-r12-2` · the sign-in log.** `comp_report.access_events`. Kinds and when they are
   written:
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

   **Where the writes happen.** Every access-log write runs in its own transaction, as the system actor
   `does: 'access-log'`, after the request's work. It never runs inside a transaction that can throw, and a
   failure to log never changes the HTTP result.
   - `requireUser` catches the refusal, logs it, then rethrows it. Today the `not_authorised` throw is inside
     the `withActor` callback, so a row written there would roll back with it.
   - `reportFor` keeps its shape. When `write=false` and the owner isn't the caller it marks the request, and
     the handler writes `viewed_other` once its transaction has committed. Every read path logs: workspace,
     messages, narratives, links GET and `reports?id=`.

   **Dedupe is a unique index, not a read.** Mentors and the system actor can't select from `access_events`,
   and no select policy is widened to let them. The table has a nullable `dedupe_key text unique`; the insert
   is `... on conflict do nothing`. The key is the kind, whom it is about, the report if any, and
   `floor(epoch / window)`. Windows: 30 minutes for `viewed_other` and `viewed_list`, 15 for `refused`
   (per email-or-domain and reason). `gate`, `session_start` and `signin_error` have no key.

   **What a row holds, and what is checked in the database.** Columns: `at`, `kind`, `source`
   (`server`, `gate` or `public`), `event`, `provider`, `allowed`, `via`, `reason`, `error`, `error_code`,
   `capability`, `email`, `domain`, `by_email`, `report_id`, `owner_email`, `dedupe_key`. Every text column
   except the addresses is a CHECK against a closed list:
   - `event` in `validate`, `signup`, `login`, `other`; `provider` in `google`, `email`, `other`;
     `via` in `admin`, `allowlist`, `domain`; `reason` in the five above;
   - `error` in `access_denied`, `admin_policy_enforced`, `invalid_request`, `server_error`, `other`;
   - `error_code` in `gate_webhook`, `signups_not_allowed`, `other`; `capability` in `practice`, `full`;
   - `domain` matches `^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$`. A domain that doesn't is stored as null;
   - a `signin_error` row has no email, no domain and no owner.

   **Whose address is stored.** The insert takes the address and decides itself: the email if a `users` row
   exists for it, else the domain only (CR-1.1). Callers never choose. No IP address is stored anywhere.

   **The open doors.** There are four, not one: `POST /api/comp-report/signin-error`, and the
   `identity-validate`, `identity-signup` and `identity-login` functions. None has a caller check, so anyone
   can POST them any JSON. Netlify gives no signature on Identity calls that this repo uses. Check Netlify's
   docs for one; if there is one, verify it and say so in the PR. Until then their rows are `source = 'gate'`,
   and the Access panel marks them unverified. `session_start` and `refused` come from a verified token and
   are the record to trust.
   - Gate rows: `event` and `provider` come from the closed lists, whatever the body says (anything else is
     `other`). `allowed` and `via` come from `decide()`, never from the body. The existing
     the system actor name `identity-${event}` and the gate's console line take the closed `event`, not the raw one.
   - `signin_error` takes `provider` (closed list) and `error` (closed list, anything else is `other` and the
     raw value is dropped). `error_description` is never stored as text: it is matched against the two known
     descriptions `src/sign-in-errors.ts` already tests for (the webhook failure, "signups not allowed") and
     stored as `error_code`, else `other`. The response is the same empty 204 whether the row was stored,
     dropped or rate-limited.
   - **Size.** A `Content-Length` over 1024, or a body that streams past 1,024 bytes, gets 413 before it is
     parsed. Add a byte-counting bounded reader to `server/http.ts`; `readJsonObject` counts characters after
     reading the whole body.
   - **The IP.** Only `context.ip` (Netlify's), never `X-Forwarded-For`, which the caller controls. The
     identity functions and `signin-error` take `(req, context)`. No IP, no row: answer 204. An IPv6 address
     is cut to its /64 first.
   - **The salt.** No new key for Kimani to set. A random salt per day, made by the server and kept in
     `comp_report.signin_salt (day, salt)`, readable and writable by the system actor only. The bucket key is
     HMAC-SHA256 of the IP under that day's salt. The purge deletes the salt with the buckets, so a day's
     hashes can't be reversed afterwards.
   - **Limits.** `comp_report.signin_error_buckets (hour, scope, ip_hash, n)`, primary key
     `(hour, scope, ip_hash)`, with a global counter row per scope and hour (`ip_hash = '*'`). Count with one
     atomic `insert ... on conflict do update set n = n + 1 returning n`. The global counter goes first; past
     its cap the call is dropped, and a per-IP row is created only for calls that passed it. `signin-error`:
     20 an hour per IP, 200 an hour overall. Gate rows: 600 an hour per IP, 1,000 an hour overall. Netlify
     Identity's own calls probably arrive from one address, so the gate numbers are guesses; the PR says what
     `context.ip` showed on a real sign-in. **When a cap is hit the row is skipped and the gate answers
     normally.** A full table never blocks a sign-in.
   - Retention is below. Rows from the open doors (`source` `gate` or `public`) are kept 30 days. The rest are
     kept 13 months.

4. **NW-099 · the activity log.** `comp_report.activity (at, user_email, report_id, session_id, kind
   screen|action|error, name, detail)`.
   - Server-emitted semantic names: `import.read`, `comp.added`, `comp.tiered`, `comp.removed`,
     `comp.restored`, `call.given`, `narrative.copied`, `report.sent`. The handler writes them after its
     transaction commits, as the system actor (`does: 'activity-log'`), `kind = 'action'`.
   - **The client sends only `screen.<id>` (the router's screen ids) and `error.<code>` (a fixed set of
     `ErrorBoundary` kinds; the PR lists them).** `POST /api/comp-report/activity` behind `requireUser` rejects
     any other name with 400. A practice agent with devtools can't forge `call.given`. `kind` comes from the
     name on the server. `user_email` is the session's. `session_id` must be a UUID. `report_id` must be a
     report the caller can read (`can_read_report`), else it is dropped.
   - `detail` is a JSON object of validated enums and counts, 500 characters at most, checked per name and by
     a CHECK. No free text, no addresses, no client names.
   - **Limits.** 60 events a minute and 2,000 a day per user, counted from the user's own `activity` rows
     inside the same transaction (not process memory), and the body capped at 2 KB. 90 days' retention.
   - A per-user, per-report timeline in the Access panel. No analytics vendor.
5. **NW-098 · the Feedback box keeps its draft.** In `assets/feedback.js`: save name, email and message to
   `localStorage` on input (try/catch), restore on open, clear on a successful send; don't close on an outside
   click while the message has text. It loads on every tool: check two. `assets/studio-header.js` stays
   untouched.
6. **From Dispatch 14's follow-ups:** a way for an admin to set an agent to `practice` in Access.
   `POST /api/comp-report/capability {email, capability}`, admin only (403 `admins_only` before any query).
   The target must be an existing `users` row (404). `capability` is `practice` or `full`, and nothing else on
   the row is writable from it. Moving to `full` fills `unlocked_by`, `unlocked_at` and a `unlocked_reason`
   the admin gives (up to 200 characters). Each change writes a `capability_change` row (`email` the target,
   `by_email` the admin).

## Retention and deletes

The app role has no DELETE on any of these tables and no DELETE policy for its own queries. Deletion is
through **three `security definer` functions owned by the migration role**: `comp_report.purge_access_events()`,
`purge_activity()` and `purge_signin_buckets()` (which also removes old salt rows).
- Each sets `search_path = comp_report, pg_temp`, requires `is_system()` and `cr.system_actor = 'log-purge'`,
  and deletes by fixed cutoffs only: `access_events` 13 months (30 days for `source` `gate` or `public`),
  `activity` 90 days, buckets and salt older than today. `revoke all ... from public`; execute granted to
  `comp_report_app`.
- `access_events` and `activity` follow the repo's append-only pattern: `refuse_change`-style triggers for
  update, delete and truncate. The delete trigger lets a delete through only while a transaction-local
  `cr.purging` flag is on, set by the purge functions (like `cr.applying_reason`).
- The tables are `FORCE ROW LEVEL SECURITY` like the rest, so the function's owner is subject to policies too.
  Each table gets a delete policy that passes only while `cr.purging` is on and `current_user` is not
  `comp_report_app`. Prove it on the local Postgres.
- One scheduled function, `netlify/functions/comp-report-purge-logs.mts`, runs daily at an off-hour minute and
  only calls the three functions, as the system actor `log-purge`.

## Policies

- `access_events`: select for admins; insert for the system actor only; no update, no delete. Inserts never
  use `RETURNING`, which would need a select policy.
- `activity`: select for admins, and each user's own rows (the rate-limit count is the one consumer). Insert:
  a user may insert only `kind in ('screen', 'error')` with `user_email = actor_email()` and
  `report_id is null or can_read_report(report_id)`; the system actor may insert any. No update, no delete.
- `signin_error_buckets`, `signin_salt`: `system` only (select, insert, and update on buckets). No admin,
  mentor, user or inspect policy. Dispatch 23's inspect actor gets a select on `access_events` and `activity`
  in its own migration, and none here.
- A test walks `pg_policies` for the `comp_report` schema. It fails if any insert, update or all policy
  references `can_read_report` or `can_see_report`, or admits the mentor role.

## The readers

`GET /api/comp-report/access-log?view=signin|timeline&user=&report=` is the only reader of both tables.
- The handler checks `user.role === 'admin'` first and answers 403 `admins_only` to anyone else. `user` is a
  normalised email and `report` a UUID, or 400.
- Every query names its filters in its WHERE clause (both layers, §12) and has an explicit `limit 100`. The
  Access panel shows the last 100 lines.
- The panel and the inspect view render every stored value as a code or plain text, never as markup or
  instructions. The closed lists make the labels; there is no free text to show.

## Not in scope

Sharing a report (NW-089 a, phase B: its entry point is Design's), duplicate and transfer (NW-090 c, phase B),
the list's Mine / Everyone's control and search (NW-088 b, Design), the inspection API and the test user
(Dispatch 23), who may reset samples (NW-054, Dispatch 23).

## Data and constraints

- **Migrations.** 22a: `20261016120000_comp_report_mentor_reads.sql`: the function split and the mentor
  reads. 22b: `20261016120100_comp_report_access_and_activity.sql`: `access_events`, `activity`,
  `signin_error_buckets`, `signin_salt`, the purge functions, and the `comp_report_app` grant block. One PR:
  one migration, as above. No other open PR uses these timestamps; re-check. The grants are select and insert
  on `access_events`, `activity` and `signin_salt`; select, insert and update on `signin_error_buckets`.
- Sessions never connect to production, and never to `DATABASE_URL`. `db.ts` ignores it on purpose. Prove the
  policies on a local Postgres (`npm run db:local`).
- **New functions:** `signin-error`, `activity`, `access-log`, `capability`, and the scheduled
  `comp-report-purge-logs`. Each is a v2 function with its own `config.path` (the scheduled one a `schedule`).
  The three `identity-*` functions change only to pass `context` through.
- No new environment variable.
- 91 a can't be proven in the sandbox (no Identity). The PR asks Kimani for one real invite to a second
  address after deploy, and for the function log line that shows `context.ip` on a real sign-in.

## Definition of done

- An admin and a mentor see every report in the list and open any read-only; an agent sees only their own.
  Tests, as SQL under `withActor` without the handler's owner clause, for owner, admin, mentor, agent and
  external: a catalog-driven pass over every `comp_report` table with a `report_id` column that attempts
  INSERT and UPDATE for each role and compares with the writes allowed before the migration. No role gains or
  loses a write; a mentor can't write anywhere.
- A mentor can read comps with facts (`observations_select`), messages, imports, narratives and links of
  another agent's report. `can_see_report` no longer exists.
- Access log: one test per kind. A spoofed `X-Forwarded-For` doesn't change the bucket. A 2 KB body gets 413.
  Posted `error_description` text, `provider` and `event` values never appear in any stored column. With the
  caps hit, the identity functions still answer as before. An email is stored only for an existing `users` row.
  The same IP has different hashes on two days, and the purge removes old salt rows.
- Refused and viewed: 50 requests as a refused user, and 50 as a mentor viewing another report, each leave one
  row. A refusal for `not_authorised` is logged (it is thrown inside the transaction today). A failing log
  write doesn't change the response. `session_start` is written once per 30 minutes, not every 5.
- Activity: POSTing `call.given`, a `report_id` the caller can't read, a non-UUID `session_id` and a 3 KB body
  are each rejected or dropped. The 61st event in a minute and the 2,001st in a day are refused. `detail`
  with free text fails the CHECK.
- Deletes: as an admin user, as the system actor `decide-key`, and as `comp_report_app`, a direct UPDATE or
  DELETE on `access_events` and `activity` fails. The purge, called as `log-purge`, removes only rows older than
  its cutoffs and fails for any other actor. A policy test shows no policy names the buckets or salt tables
  except `system`.
- Access reader: admin sees rows; agent, mentor and external get 403 at the handler and zero rows at the SQL
  level. Capability: admin only; unknown email 404; `capability` outside `practice` and `full` 400; the change
  is logged.
- The Access panel shows sign-in lines (gate lines marked unverified), refusals with their reason and Google's
  error code, and one report's activity timeline.
- `test:feedback` covers the draft: saved on input, restored on open, cleared on send, kept on an outside
  click.
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`.
- A Playwright walk of Reports as admin and as agent, and the Access panel. Screenshots in the PR.

— Casanova
