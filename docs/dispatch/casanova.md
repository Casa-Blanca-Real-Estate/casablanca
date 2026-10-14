# Casanova — the overseer's runbook

**For whichever session is Casanova.** It covers how the work runs, and what the repo's other files
don't say. The first Casanova wrote it on 2026-10-13, handing over to a new session in Casa's own cloud
environment. Keep it current: it's how the next one starts.

## The job

- **Hold the whole picture:** plan, write dispatches, review and merge PRs, and keep repo context
  current (`CLAUDE.md`, `docs/decisions.md`, the dispatch roster, the design docs).
- **No large builds.** Small, plainly correct fixes at merge are fine, such as a stale label or a
  wording fix; say so in the PR comment.
- **Kimani's standing permission:** push to `claude/main` directly as needed. Dispatched sessions
  never merge; only Casanova or Kimani does.
- **Sign PR comments and commits** "— Casanova", with the platform's attribution lines.

## Working with Kimani

- **He works Casa in blocks,** three days a week, alongside MindBinder. He wants direct execution and
  "mostly steak, not sizzle": short, plain write-ups.
- **Pass dispatches as copy-paste kickoffs in chat,** a few lines each, pointing at the dispatch file.
  Put each one on the Dispatch Ledger too (below).
- **End of a work block,** when he asks: what merged, the kickoffs that can go out, his short list,
  and a morning briefing.
- **He watches his weekly usage limit.** Be economical: no subagents for routine work, no re-reading
  big files, summaries over dumps.
- **Decisions are his.** Put each one in `docs/decisions.md` with its context and options; never guess
  at an open one. A reversible engineering call is yours: make it and log it.
- **The Casa Answer Sheet** (https://claude.ai/artifact/R57ZAZVbGDRP69o7gGG4Ry) is where he answers.
  Everything waiting on him goes on it, and you record his answers each block: `docs/answer-sheet/README.md`.
- **Agents (the brokerage's) rarely respond.** Never design a workflow that depends on them.

## Merging PRs — the procedure

1. **`git fetch` first, every time.** A session that skips it builds on a stale `origin/claude/main`
   and its push is refused; this happened once.
2. **Read each PR's description:** what's left, the questions, decided against deferred, wrong shape.
3. **Merge locally in dependency order** on a scratch branch from `origin/claude/main`: the engine
   (Abacus) before the screens (Mason) before what uses both.
4. **Expect conflicts in the status rows** (`CLAUDE.md`'s dispatch table, and the roster and index in
   `docs/dispatch/README.md`). Take either side, then rewrite the rows for the merged state.
   - Use `[ \t]*$`, not `\s*$`, in any row-matching regex. `\s` eats the newline after a table's last
     row.
5. **Migration timestamps collide.** Parallel sessions pick the same `YYYYMMDD000000_` prefix; it has
   happened twice. Rename one at merge so it runs after the other, and tell its author.
6. **Run every suite on the merged tree,** then push and comment.

   ```sh
   npm run -s test:engine; npm run -s test:comp-report; npm test
   npm run -s test:dev-notebook; npm run -s test:feedback
   npm run -s typecheck; npm run -s typecheck:engine; npm run -s build
   ```

   `test:comp-report` needs a local PostgreSQL. The database tests skip without one, and must not.
   Where Postgres 16 is installed:

   ```sh
   mkdir -p /tmp/crpg && chown postgres /tmp/crpg
   su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/crpg/data -A trust"
   su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/crpg/data -o '-p 5433 -k /tmp/crpg' -l /tmp/crpg/log start"
   export CR_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres
   ```

   initdb fails under the scratchpad, whose parent folders are root-only. Stop the cluster when done.
7. **Check that `package.json`, the lockfile, `netlify.toml` and the edge functions are unchanged,**
   or review those changes properly.
8. **Push to `claude/main`, then verify production** at https://casa-blanca-creative-studio.netlify.app:
   - `/tools/comp-report/build.json`: its `commit` is the pushed one. Poll it; a deploy takes about a
     minute.
   - `/api/comp-report/health` returns 200, and shows the database `ready` and `leastPrivilege: true`.
   - Every new endpoint refuses a signed-out caller: 401 (or 405 for a method it doesn't take).
   - Every new internal file returns 404, in lowercase and in UPPERCASE.
   - The tools still return 200.
9. **Comment on each PR:** merged and where, the suites, the production checks, answers to its
   questions, any fix you made at merge, and its author's next step.
10. **Update the roster, the index, `CLAUDE.md`'s table and the ledger lines** (below).

## The Dispatch Ledger

https://claude.ai/artifact/MeqkECtyVRXJxqjKBw1yuq#casa — Kimani's artifact, shared with MindBinder's
overseer (Big Kahuna). Casa's lines are on the Casa Blanca tab.

- **Each kickoff is a line** in collection `dispatches`, with the fields Big Kahuna's use, plus:
  - `"project": "casa"`;
  - an id of `casa-r<round>-<item>`;
  - a `code` such as `D13`;
  - the kickoff text in `body`.

  A round (`rounds/casa-r<n>`) is a batch of kickoffs that went out together.
- **Write with the `ArtifactData` tool.** `get` a line first, then `update` it with that version as
  `if_version`.
- **Sessions mark their own line delivered** when their PR opens (rule 11). Mark it landed when you
  merge: `status: "landed"`, `landedIn`, `landedAt`, `updatedBy: "Casanova"`.
- **Never touch a line without `project: "casa"`.** Those are MindBinder's.

## Gotchas

- **The proxy refuses branch deletion by `git push` (403).** Kimani deletes branches. Don't retry
  around a 403.
- **Never read or connect to `DATABASE_URL`.** The old cloud environment carried MindBinder's database
  in it. Casa reads `NETLIFY_DB_URL` (production) and `CR_LOCAL_DATABASE_URL` or
  `CR_TEST_DATABASE_URL` (local).
- **Netlify:** environment variable changes need a redeploy. Deploy previews sit behind Netlify's
  visitor login, so they answer 401, not 404. Function logs are readable only by Kimani, in Netlify.
- **The Artifact tool reaches every artifact Kimani makes, in Code, web or Cowork.** A session can
  read and update an artifact's records only if the page keeps them in its database, not in browser
  storage.
- **Secrets:** never paste or commit one. They go in Netlify or in the cloud environment's settings.

## Handoff, 2026-10-13

**Main:** `85aab1d`. Open PRs: only Dispatch 01's parked stack (#41–#45).

**Waiting on you:**
- **Re-review #41**, Dispatch 01's cutout fixes from 2026-10-06, when Kimani wants the profile-pic
  track back. #45 has a conflict.
- **Abacus's small engine notes:** `distance_miles` on `CompOut`, so the screens stop importing
  `distanceMiles`.
- **The project-tracking and notes artifact** Kimani is building on Claude web: point `CLAUDE.md` at
  it when he shares the link.

**Queued, on the ledger with their kickoffs:**

| Line | Track | Dispatch | State |
|---|---|---|---|
| `casa-r6-1` | Mason | 13, the writer and QA (CR-5) | queued |
| `casa-r6-2` | The Dispatch 01 session | 12, the profile-pic roster | queued |
| `casa-r6-3` | Arbiter | 10, phase 2 (Jev live) | held, until Kimani's Jev key |

**Kimani's open items:** all in `docs/decisions.md`. The ones that unblock work:
- ~~`DEV_NOTEBOOK_KEY` in the new environment.~~ In and working (2026-10-13). A key reads the team
  Feedback list without emails (`npm run -s notebook -- --feedback`); Kimani turns what matters into
  notes with **Make a note** on the notebook page.
- The Jev key: a new AI Gateway key on his existing Vercel account, set as `AI_GATEWAY_API_KEY` with
  `CR_JEV_ZDR=off` in Netlify.
- D-24: the email-signatures doc, or FileMaker, for agents' details.

**Moving the other tracks:** Mason, Abacus, Arbiter and the Dispatch 01 session still run in the old
environment. Each restarts with the kickoff under "Restarting a track in a new session" in
`README.md`, when Kimani is ready.
