# Dispatch 22 — Comp report: who sees what, the sign-in log and the activity log (CR-7e)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Mason
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/06-platform-access-and-data.md` (read its
"Security and RLS" table twice), ledger line `casa-r12-2` (the sign-in log Kimani asked for after Noble's
refused sign-in), and D-8 (mentors and admins see an agent's work).
**Depends on:** Dispatch 15 merged (you both edit `server/api/comps.ts` and `server/api/workspace.ts`). In
Mason's queue it comes after 21; if Kimani names a second builder for this week, it can start as soon as 15
merges.
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Mason (CR-7e)"** in the PR, its comments and your commits. Ledger line: `casa-r13-8`. It
supersedes `casa-r12-2`, and takes the "practice in Access" item of `casa-r12-1`.

## The goal

Kimani couldn't see Noble's report from the list, couldn't see why Noble's sign-in failed, and can't review
what anyone did without asking them to do it again. Fix all three, without widening any write.

## In scope

1. **NW-088 a · everyone's reports, read-only.**
   - `GET /reports?scope=all` for admins and mentors, with `?owner=` and a 200-row cap; the owner shows in the
     existing client line, so the table keeps its shape.
   - **First split `can_see_report` into `can_read_report` (owner, admin, mentor) and `can_edit_report`
     (owner).** Point every insert and update policy at `can_edit_report`. Then add mentors to reads:
     `reportFor(write=false)`, `messages.ts`, `reports.ts` GET `?id=`, `reports_select`, and
     `observations_select` (widened to `can_read_report` for rows with a report, or a mentor sees comps with no
     facts).
   - Non-owners stay read-only. No "act as owner". Hubert stays owner-only.
   - Build on the recommendation (mentors see every agent's report) unless Kimani answers otherwise; say in the
     agent-facing copy that mentors and admins can read reports.
2. **NW-091 a · the invite's stale session.** `@netlify/identity` 2.0.0's `acceptInvite()` never writes the
   `nf_jwt` cookie (`dist/main.js:851`; `login()` does at `:409`), so the first `/me` goes out with no token.
   After `acceptInvite` succeeds, call `login(email, password)` (or fall back to `hydrateSession()` in
   `token()`, `src/session.ts:76`). On `NotAuthorised` (`src/views/SignIn.tsx`), a 401 gets Try again and the
   code on screen ("signed_out, no token").
3. **NW-091 b and `casa-r12-2` · the sign-in log.** `comp_report.access_events`:
   - every Identity gate decision (`server/identity-events.ts`): event, provider, allowed or not, via;
   - `session_start` when `last_seen_at` is over 30 minutes old (`requireUser` already writes then);
   - `refused` where Identity verified someone (`not_authorised`, `disabled`, `unconfirmed`,
     `address_unverified`);
   - `viewed_other` when someone opens another person's report (once per 30 minutes per pair);
   - the error Google or Identity hands back in the sign-in URL (`error`, `error_description`, such as
     `admin_policy_enforced` or `access_denied`), through an unauthenticated endpoint that is rate-limited and
     size-capped, so a Google-side block can be told from our gate refusing.

   A refused non-user is stored by domain only (CR-1.1). No IP addresses. Insert-only for the app role; a
   scheduled function trims rows past 13 months. The Access panel shows the last 100 lines.
4. **NW-099 · the activity log.** `comp_report.activity (at, user_email, report_id, session_id, kind
   screen|action|error, name, detail)`.
   - Semantic events from a closed list, mostly emitted on the server where the handler already knows:
     `import.read`, `comp.added`, `comp.tiered`, `comp.removed`, `comp.restored`, `call.given`,
     `narrative.copied`, `report.sent`.
   - From the client only `screen.*` (the router's screen ids) and `error.*` from `ErrorBoundary`.
   - `detail` holds a few validated enums and counts. No free text, no addresses, no client names.
   - A per-user, per-report timeline in the Access panel. No analytics vendor.
5. **NW-098 · the Feedback box keeps its draft.** In `assets/feedback.js`: save name, email and message to
   `localStorage` on input (try/catch), restore on open, clear on a successful send; don't close on an outside
   click while the message has text. It loads on every tool: check two. `assets/studio-header.js` stays
   untouched.
6. **From Dispatch 14's follow-ups:** a way for an admin to set an agent to `practice` in Access.

## Not in scope

Sharing a report (NW-089 a, phase B: its entry point is Design's), duplicate and transfer (NW-090 c, phase B),
the list's Mine / Everyone's control and search (NW-088 b, Design), the inspection API and the test user
(Dispatch 23).

## Data and constraints

- **One migration, `20261016120000_comp_report_access_and_activity.sql`:** the function split, the mentor
  reads, both tables with the `comp_report_app` grant block. No other open PR uses the timestamp; re-check.
- Sessions never connect to production. Prove the policies on a local Postgres: a test per role (owner, admin,
  mentor, agent, external) that reads and tries to write another's report.
- The unauthenticated error endpoint is the only new open door: cap the body, rate-limit by a hash, never
  store more than the domain and the error code.
- 91 a can't be proven in the sandbox (no Identity). The PR asks Kimani for one real invite to a second
  address after deploy.

## Definition of done

- An admin and a mentor see every report in the list and open any read-only; an agent sees only their own;
  no role gains a write (tests prove it).
- The Access panel shows sign-in lines, refusals with their reason and Google's error code, and one report's
  activity timeline.
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`.
- A Playwright walk of Reports as admin and as agent, and the Access panel. Screenshots in the PR.

— Casanova
