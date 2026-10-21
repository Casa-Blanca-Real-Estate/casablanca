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
- **Repo docs:** `CLAUDE.md`, `docs/decisions.md`, `docs/context/` and the Answer Sheet
  (`docs/answer-sheet/README.md`). Casanova keeps its own runbook, the dispatches, the roster and the
  ledger.
- **No builds and no merges.** Docs go straight to `claude/main` (Kimani's standing permission). Fetch
  first: Casanova pushes there too.

## Kimani's tools in the Casa account

| What | Link |
|---|---|
| Casa Answer Sheet: everything waiting on him | https://claude.ai/artifact/AMbuGGXf2FFfszUpZtARmA |
| Dispatch Ledger: Casanova's | https://claude.ai/artifact/HR14yufem1YH1TxqqiWksA |
| Key Maker: random tokens made in the browser, nothing saved | https://claude.ai/artifact/F8TzAoqtCVegpVM3EipGhS |
| Post Log: the caption tracker the builders link | https://claude.ai/artifact/CfD19RGuRSjtAy3PrXp6PU |

## Keys and services, as of 2026-10-21

- **Firecrawl:** always Casa's. Nothing to do.
- **Anthropic:** API keys from a Casa workspace with a spend limit. Use one key per use: `netlify-production`,
  `eval` (the Claude Code environment only), and `make-iso-blast` (Make's connection, TD-18). Workload
  Identity Federation doesn't fit yet, because Netlify Functions get no OIDC identity token to exchange.
- **Studio tokens** (`CB_CMS_TOKEN`, `CB_PICS_TOKEN`, `CR_DECIDE_KEY`, later `CR_INSPECT_KEY` and
  `CR_TEST_KEY`): made on the Key Maker. `CB_CMS_TOKEN` was never set before this.
- **Vercel (Jev's AI Gateway):** a Casa team on Pro, signed in with `casacalliste` through Google.
- **Not needed now:** `NETLIFY_BUILD_HOOK` (until the agent sites come back) and `ALLOWED_ORIGIN` (optional).
  `DEV_NOTEBOOK_KEY` stays as it is (Kimani's call).
- **Make** (team "My Team", org 6744294): the live scenario is the Mailchimp ISO Blast Automation. Its
  Gmail and Facebook connections have expired, but only inactive scenarios use them.
