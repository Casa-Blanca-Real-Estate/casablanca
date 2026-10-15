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
11. **Put every follow-up on the ledger.** When a merge comment leaves work a track still owes (a next
    phase, a run waiting on a key, a fix for later), add a line for it in this round's follow-up round:
    code `FU·<pr>`, `"kind": "follow-up"`, a short `body` Kimani can paste to the track (naming the line's
    id), **queued** if it can go now, **held** with a `note` naming what it waits on (an answer-sheet id
    where there is one). Mark it landed when its work merges. Kimani reads the Casa tab to see which
    tracks still have work.

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
- **Don't change the ledger's page.** It's shared with MindBinder; everything Casa needs fits its fields
  (follow-ups are ordinary lines with code `FU·<pr>`).

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

## Handoff, 2026-10-15

**Main:** after round 13's docs (see `git log`). Open PRs: only Dispatch 01's parked stack (#41–#45).
Production runs #77 (the design port). Noble walked it on 2026-10-15.

**Round 13 is Noble's walk-through.** Everything is in `docs/comp-report/feedback/2026-10-15-noble/`
(`README.md` is the index). It has 102 items in `00-items.md`, reports 01–07, the Claude Design handoff
`08`, and the plan `09-plan.md`. Dispatches 15–24 are written and had four review passes. 22 and 23 got the most
attention, as they hold the security work. The ledger has `casa-r13-1` to `-10`:
- 15, 16 and 17 are queued.
- The rest are held, each with what it waits on.
- `casa-r12-1` and `-r12-2` are dropped as superseded.
- `casa-r10-1` is held: DP-6 moved to 20, and phase 2's voice and client profile wait on NB-20.

**Waiting on you:**
- Merge round 13's PRs in Mason's queue order:
  - Mason: 15, then 18, 22a, 23 items 1–2, 20, 21, 22b, 23 items 3–4.
  - Abacus: 16, then 19.
  - Surveyor: 17.
  - Calliste: 24, after the move.
- Hold 22a's merge until NB-23 is answered.
- Before 23 items 3–4 go out, run one more blockers-only check of 23. The last check found two blockers, fixed in
  602f408; 22's last check found none.
- At each merge, update D-27 if NB-8 is A. Dispatch 15 reverses its Save rule.
- Re-review #41 (Dispatch 01) whenever Kimani wants the profile-pic track back. #45 has a conflict.

**Kimani's open items:** the Casa Answer Sheet (version 5) has NB-1 to NB-28 and TD-12 to TD-17. D-28 in
`docs/decisions.md` lists which answers hold a build. The Casa account move (TD-12, D-26) comes before Calliste,
before 23 items 3–4, and before any production key.

**Agent budget for this round (Kimani's):** 5 Opus and 30–40 Sonnet or Haiku in total. The triage used the 5
Opus. Triage, fixes and checks used 24 Sonnet. Ask before going past 40.

