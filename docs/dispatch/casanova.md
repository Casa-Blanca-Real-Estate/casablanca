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
- **The Casa Answer Sheet** (https://claude.ai/artifact/AMbuGGXf2FFfszUpZtARmA) is where he answers.
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
8. **Push to `claude/main`.** That isn't live any more (from 2026-10-21): Netlify publishes production
   from `release`, and a merge costs no deploy. **Release** when Kimani asks, before a demo, or about
   once a day when something user-facing has merged: run the `release to production` workflow
   (`.github/workflows/release.yml`, a workflow_dispatch on `claude/main`). It fast-forwards `release`
   to `claude/main` once its checks are green; each release is one production deploy, out of a budget
   Netlify meters (15 credits each). Batch merges into one release; never release just to check
   something — the `claude/main` branch deploy and the deploy previews are free. Then verify
   production at https://casa-blanca-creative-studio.netlify.app:
   - `/tools/comp-report/build.json`: its `commit` is the released one. Poll it; a deploy takes about a
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

https://claude.ai/artifact/HR14yufem1YH1TxqqiWksA — Casa's own, in the Casa Blanca Claude account. Stood up 2026-10-21 from
`docs/dispatch/ledger-export/` (the Casa side of the ledger Kimani's personal account shares with MindBinder).

- **Each kickoff is a line** in collection `dispatches`, with these fields, plus:
  - `"project": "casa"`;
  - an id of `casa-r<round>-<item>`;
  - a `code` such as `D13`;
  - the kickoff text in `body`.

  A round (`rounds/casa-r<n>`) is a batch of kickoffs that went out together.
- **Write with the `ArtifactData` tool.** `get` a line first, then `update` it with that version as
  `if_version`.
- **Sessions mark their own line delivered** when their PR opens (rule 11). Mark it landed when you
  merge: `status: "landed"`, `landedIn`, `landedAt`, `updatedBy: "Casanova"`.
- **Keep `project: "casa"` and the `casa-` id prefix on every line,** so the lines match the old ledger's.
  Follow-ups are ordinary lines with code `FU·<pr>`. The page is `docs/dispatch/ledger-export/ledger.html`;
  republish from it if it changes.
- **The old shared ledger** (`MeqkECtyVRXJxqjKBw1yuq`, personal account) isn't reachable from here. Kimani
  drops its Casa lines once this one is confirmed.

## Gotchas

- **The proxy refuses branch deletion by `git push` (403).** Kimani deletes branches. Don't retry
  around a 403.
- **Never read or connect to `DATABASE_URL`.** The old cloud environment carried MindBinder's database
  in it. Casa reads `NETLIFY_DB_URL` (production) and `CR_LOCAL_DATABASE_URL` or
  `CR_TEST_DATABASE_URL` (local).
- **Netlify deploys are metered** (credit plan, 2026-10): each successful production deploy is 15
  credits; deploy previews, branch deploys, failed and cancelled builds are free. Production is the
  `release` branch; `netlify/ignore-build.sh` cancels a production build whose changes are only
  docs (`docs/`, `.github/`, `*.md`). The agent CMS's build hook must target `release`, or a publish
  never goes live.
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


## Handoff, 2026-10-21 — the Casa Blanca Claude account

Casanova now runs in Casa's own Claude account. The repo is `Casa-Blanca-Real-Estate/casablanca`, and
Netlify is relinked to it (Kimani).
- **New artifacts, made in this account:** the Dispatch Ledger (`HR14yufem1YH1TxqqiWksA`, seeded with the
  64 documents in `ledger-export/`) and the Answer Sheet (`AMbuGGXf2FFfszUpZtARmA`, built from
  `questions.json`, with no answers carried over because there were none). Kimani rebuilt the Post Log
  here (`CfD19RGuRSjtAy3PrXp6PU`), and the four carousel builders now link to it.
- **The old personal-account artifacts** (the shared ledger, the old sheet, the old Post Log
  `U5g6cCuSs1igsswBWn5Jxc`) can't be reached from here. Kimani retires them.
- **Keys:** Kimani is setting them up on Casa's side, using the walkthrough from this session. Firecrawl
  was always Casa's. `CB_CMS_TOKEN` was never set. The dev notebook key stays as it is (Kimani: no risk).
