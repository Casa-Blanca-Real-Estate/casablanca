# Dispatch 23 — Comp report: samples that reset, and reading production safely (CR-7f)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Mason
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/06-platform-access-and-data.md` (NW-054, NW-090),
`02-sort.md` (NW-054 a and b), and `server/api/decide.ts` (the key pattern to copy).
**Depends on:** Dispatch 22 merged (the activity and access logs this reads, and the migration before yours).
Items 3 and 4 wait on Kimani's answer to NW-090 a; items 1 and 2 on who may use samples (NW-054).
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
   sample calls the same function. Buttons go in the account menu's dev tools. Who sees them: admins and
   mentors (the recommendation) unless Kimani says admins only.
2. **NW-054 b · a co-op sample.** For now, port `coopCsv()` from `dev/seed-report.mjs` into `server/sample/`:
   the Barclay export as Co-op, no sizes, the intake without `areaSqft`, `SAMPLE_TIERS` without the size tags.
   When Kimani pulls a real co-op export, it replaces this (a generated file, as `barclay-17l-export.ts` is).
3. **NW-090 a · the inspection API, if Kimani says so.** `/api/comp-report/inspect` behind `X-Inspect-Key`
   (`CR_INSPECT_KEY`, 32+ characters, constant-time compare; a wrong key is a 401 and never falls through to
   Identity; every use logged without the key).
   - Named views only, no SQL: reports (stage, counts), one report's workspace (`loadWorkspace`), comps and
     reasons, usage, the access log, the activity log, health.
   - Redacted by default: `brief.clientName`, `clientNote`, `brief.client`, comp notes, Hubert's message text.
     `?text=1` returns them, and that call is logged with the report id.
   - Its own RLS actor kind with select-only policies. **Not `system`**: several policies admit any system
     actor broadly (`users_select`, `users_update`, `allowlist_select`).
4. **NW-090 b · a test user for writes.** `CR_TEST_KEY` makes `requireUser` return one fixed user
   (`CR_TEST_USER_EMAIL`, on a reserved domain such as `sessions@test.invalid` that `decide()` refuses for real
   sign-in). RLS confines it to its own rows. `users.is_test` drops it from lists and counts. An inspect action
   `copy-to-test` copies a real report into the test user with the client name scrubbed.

## Not in scope

Duplicate and transfer for users (NW-090 c), sharing (NW-089): phase B. A read-only database role (the option
Kimani would have to choose instead of item 3; it would rewrite the repo's rule that sessions never connect to
production).

## Data and constraints

- **One migration, `20261017000000_comp_report_inspect.sql`:** the actor kind and its policies, `users.is_test`.
  No other open PR uses it; re-check.
- **Keys:** `CR_INSPECT_KEY` and `CR_TEST_KEY` are made fresh on the Casa side (NW-096, D-26): Kimani sets them
  in Netlify and in the Casa account's Claude Code environment, never in the repo. Say so in the PR.
- Add the inspect function to `netlify/functions/` as `comp-report-inspect.mts`; `netlify/` is already guarded,
  the route is key-gated.
- A session uses the inspect API with `curl` and the key from its environment. It never reads `NETLIFY_DB_URL`
  or `DATABASE_URL`.

## Definition of done

- Reset gives a clean sample, condo or co-op, with an empty Hubert; the old one is archived and gone from the
  list.
- With items 3–4 built: a test per view proves redaction, `?text=1` is logged, the actor can't write anything,
  and the test user can't read a real user's report.
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`.
- A Playwright walk: reset the condo sample, then the co-op one, through Sort and Findings. Screenshots in the
  PR. The PR gives Kimani the exact `curl` to try the inspect API once the key is set.

— Casanova
