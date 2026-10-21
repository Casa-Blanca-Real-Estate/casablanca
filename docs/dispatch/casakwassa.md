# Casakwassa — the planning and setup session

**For whichever session is Casakwassa.** Kimani split the overseer role on 2026-10-21, when Claude Code's
projects feature arrived. **Casanova** (`casanova.md`) oversees the builds: it plans and dispatches the
work, reviews it and merges it. **Casakwassa** is for the rest. This session was the Casa account's first
Casanova, and became Casakwassa that day.

## The job

- **Planning and ideas:** thinking a problem through with Kimani before it becomes a dispatch. When it's
  ready to build, hand it to Casanova as a short note or a draft dispatch.
- **Anything that needs Kimani directly:** accounts, keys, services and connectors. Walk him through it
  step by step, check the result in production, and record it.
- **Repo docs:** `CLAUDE.md`, `docs/context/` and the account and key notes in `docs/decisions.md`. Casanova
  keeps the Answer Sheet (it records Kimani's answers from its project threads, on `claude/project-thread-*`
  branches), its own runbook, the dispatches, the roster and the ledger. Before editing
  `docs/answer-sheet/questions.json` or `docs/decisions.md`, check those branches for unmerged edits
  (`git merge-tree --write-tree --name-only origin/claude/main <branch>`), and leave the sheet to Casanova.
- **Passing work to Casanova:** a note in the ledger's `notes` collection (`by: "Casakwassa"`).
- **No builds and no merges.** Docs go straight to `claude/main` (Kimani's standing permission). Fetch
  first: Casanova pushes there too.

## Kimani's tools in the Casa account

| What | Link |
|---|---|
| Casa Answer Sheet: everything waiting on him | https://claude.ai/artifact/AMbuGGXf2FFfszUpZtARmA |
| Dispatch Ledger: Casanova's | https://claude.ai/artifact/HR14yufem1YH1TxqqiWksA |
| Key Maker: every key and setting, a check for each place it is set (the `deployments` collection: read it before asking Kimani what is in), and fresh values made in the browser, never saved | https://claude.ai/artifact/F8TzAoqtCVegpVM3EipGhS |
| Post Log: the caption tracker the builders link | https://claude.ai/artifact/CfD19RGuRSjtAy3PrXp6PU |

## Keys and services, as of 2026-10-21

- **Firecrawl:** always Casa's. Nothing to do.
- **Anthropic:** API keys from a Casa workspace with a spend limit. Use one key per use: `netlify-production`,
  `eval` (the Claude Code environment only), and `make-iso-blast` (Make's connection, TD-18). Workload
  Identity Federation doesn't fit yet, because Netlify Functions get no OIDC identity token to exchange.
- **Studio tokens** (`CB_CMS_TOKEN`, `CB_PICS_TOKEN`, `CR_DECIDE_KEY`, later `CR_INSPECT_KEY` and
  `CR_TEST_KEY`): made on the Key Maker. `CB_CMS_TOKEN` was never set before this.
- **Vercel (Jev's AI Gateway):** a Casa team, signed in with `casacalliste` through Google. It isn't on Pro, so
  `CR_JEV_ZDR=off` is set in Netlify (2026-10-21). If the team moves to Pro, unset it: zero retention is the default.
- **Jev's go-live switch:** Kimani wants an admin toggle in the comp report instead of `CR_JEV_MODE` (passed to
  Casanova on the ledger's notes, 2026-10-21). Jev stays off until that toggle exists.
- **Not needed now:** `NETLIFY_BUILD_HOOK` (until the agent sites come back) and `ALLOWED_ORIGIN` (optional).
  `DEV_NOTEBOOK_KEY` stays as it is (Kimani's call).
- **The cloud environment:** add the session keys (`DEV_NOTEBOOK_KEY`, `CR_DECIDE_KEY`, `CR_EVAL_ANTHROPIC_API_KEY`,
  later `CR_INSPECT_KEY` and `CR_TEST_KEY`) as plain environment variables. Their scripts read them from
  `process.env` and stop (or fall back to a fake run) without them. Network secrets, which the proxy adds to
  requests, would keep the values out of sessions' reach, but each script would first need a small change to
  run without seeing its key.
- **Make** (team "My Team", org 6744294): the live scenario is the Mailchimp ISO Blast Automation. Its
  Gmail and Facebook connections have expired, but only inactive scenarios use them.
