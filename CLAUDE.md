# Casa Blanca Studio — repo guide for Claude sessions

Internal browser-based tools for Casa Blanca, a boutique NYC residential brokerage. Called **Casa Blanca Studio**,
or the Studio, on every surface (Erez renamed it from "Creative Studio", 2026-10-28; older docs keep the old name).
Deployed on Netlify. Used by ~200 agents and by Kimani (sole marketing/content/tools person,
3 days a week, working in blocks across several tracks).

**Current priority (from 2026-09-23): the comp report tool.** Noble's walk-through (2026-10-15) set the
next round: `docs/comp-report/feedback/2026-10-15-noble/` (its `09-plan.md` orders Dispatches 15–24;
`08-claude-design-handoff.md` is what goes to Claude Design). The demo to Erez, Hannah and Kara (2026-10-22)
reorders it: `docs/comp-report/feedback/2026-10-22-bosses-demo/notes.md` (Kimani's decisions at its end win).
**Deadline: in Noble's hands for agent training 2026-11-13.** The schedule, its case and its risks are in `09-plan.md`, "Status and dates".
The master design is
`docs/comp-report/01-design.md` — every comp report dispatch builds from it; `00-orientation.md`
holds the research and sources behind it. Everything that was in flight before it
is parked, with state and a resume order, in `docs/parked/2026-09-23-threads.md`.

**Pending decisions for Kimani, across every track, are in `docs/decisions.md`** — each with its
context and a field to answer in. Don't guess at an open decision; check there first. Kimani answers them, and
everything else waiting on him, on the **Casa Answer Sheet** (https://claude.ai/artifact/AMbuGGXf2FFfszUpZtARmA),
which Casanova keeps current: `docs/answer-sheet/README.md`.

**Kimani's notes on the site are in the dev notebook** — he writes them while using it (Ctrl+. / ⌘. on
any studio page). Read them at the start of open-ended work, or when asked what's on the list:

```sh
npm run -s notebook                          # open notes; the first line counts them
npm run -s notebook -- --id=<id> --shots     # one note: its context, history and screenshots
npm run -s notebook -- --feedback            # the team Feedback list (no emails); Kimani makes notes of it
```

Picking one up: `--set=read --by=<session>`. A note on it: `--note="…" --by=<session>`. Fixed in your
PR: `--set=resolved --pr=<n> --note="…" --by=<session>`. It needs `DEV_NOTEBOOK_KEY` in the environment;
without it, say so and carry on. You can't delete a note: use `--set=wontfix` or `--set=duplicate`
with a `--note`. The notes aren't app data: no tool may read them. See `docs/dev-notebook/README.md`.

**Read `docs/context/casa-blanca.md` before substantive work.** It's the condensed working
reference: who the company is, the hard constraints, the brand tokens, the stack and its gotchas,
current tool state, and ways of working. Tool state drifts — confirm anything load-bearing with
Kimani. `docs/context/casa-blanca-full.md` is the archival version (full company research, design
system component library, buyer's guide, IG playbook, Framer brief, IG API setup); the condensed
file points you there by section when you need it.

## Hard constraints — read before building

- **Single-file HTML per tool. No frameworks, no build pipeline.** Assets embedded as base64.
- Object Sans (Regular 400 / Heavy 800) is the brand font — embedded, never linked externally.
- Internal users are agents: zero-install, browser-based. **One sign-in for the whole Studio** (PR #116, Kimani
  2026-10-29): every Studio page loads `assets/studio-auth.js` first, which reads the comp report's Netlify
  Identity session (Casa Google, or email and password) and asks `/api/comp-report/me` who's allowed; signed
  out, it goes to the comp report's sign-in and back. The team (`isTeam()`: the old four-email dev list, a
  comp report admin, or a preview's guest) gets the team-only tools. It hides pages, it doesn't protect
  them: anything secret still needs its function to check the token. The public agent sites never load it.
- `netlify.toml` must explicitly declare the functions directory.
- **Merging isn't deploying.** PRs merge to `claude/main`; Netlify publishes production from the
  `release` branch, which the `release to production` workflow fast-forwards to `claude/main`
  (Casanova or Kimani runs it, batched — each production deploy is metered). Docs-only changes never
  build in production (`netlify/ignore-build.sh`). See `docs/dispatch/casanova.md` step 8.
- **Functions are v2** (`export default async (req, context) => Response`). Netlify bundles them
  with `nft`, which ships the `node_modules` each imports; `node_bundler` doesn't apply to them.
  **Never set `node_bundler = "none"` on a function** — it ships no `node_modules` at all.
  `@netlify/blobs` needs no setup in a v2 function. Don't write v1 (`exports.handler`) functions.
- Image proxying genuinely needs the server (canvas taint) — cannot go client-side.
- Fork the working reference template rather than clean-room rewriting. Patch surgically,
  validate each step. No big-bang rewrites.
- **`publish = "."` serves the entire repo root to the public web.** Internal-only paths are refused
  in two places — keep both in step: the edge function `netlify/edge-functions/block-internal.js`
  (the real guard: it lowercases and decodes the path, because Netlify serves files
  case-insensitively and `/DOCS/x` slips past case-sensitive rules), and the forced-404 list in
  `netlify.toml` (a second layer). `docs/`, `netlify/`, `.github/`, `agents/data/`, `tools-src/`,
  every `.md` file, specs, tests and root config files are covered. A new internal folder is public
  until you add it to both. After release, `curl` the live site — including an UPPERCASE variant.
- **The comp report tool is a scoped exception to two rules:** it's React + Vite + TypeScript
  (source in `tools-src/comp-report/`, built to `tools/comp-report/`), and it has accounts
  (Netlify Identity) and retained data (Netlify Database). See `docs/comp-report/01-design.md`.
  Single-file HTML still holds for every other tool; they share the comp report's sign-in (above).

## Layout

| Path | What |
|---|---|
| `index.html` | Studio dashboard (redesigned 2026-08-28, reference for other surfaces) |
| `tools/*/` | One directory per tool, single-file HTML each |
| `agents/` | Static agent-site generator: `data/*.json` + `template.html` → `build.js` → `<slug>/index.html`. Schema and build contract: `agents/SCHEMA.md`. Runs on deploy |
| `netlify/functions/` | Serverless: StreetEasy import, Claude copy generation, image proxy, sessions |
| `css/`, `js/` | Shared front-end (`main.css`, `animations.css`, `nav.js`, `scroll.js`) |
| `docs/design/` | Design briefs per surface — start at `docs/design/README.md` |
| `docs/context/` | Company + project context — start with `casa-blanca.md`, not the full file; `agent-site-template.md` for the Wix agent-site port |
| `docs/agent-cms/` | The agent CMS (Dispatch 03) — start at its `README.md`; carries the storage and security decisions |
| `docs/dispatch/` | Scoped briefs handed to dedicated sessions — `README.md` has the protocol and the session roster |
| `docs/decisions.md` | Pending decisions for Kimani, with context and answer fields |
| `docs/comp-report/` | The comp report tool — `01-design.md` (the master design), `02-screens.md` (what each screen shows), `00-orientation.md` (research, requirements), `sources/` (kickoff transcripts, the reference StreetEasy export, Frankie's email, Kara's workshop, the ChatGPT workflow audit) |
| `docs/parked/` | Work paused for a priority change, with the state it was left in and how to resume |
| `docs/dev-notebook/` | The dev notebook: Kimani's in-app notes for Claude Code sessions — `README.md` (setup, the CLI, the rules), and the handoff it was built from |
| `tools/dev-notebook/`, `assets/dev-notebook.js` | The notebook page (sign-in, notes, keys, the only delete) and the capture box it turns on across the studio; the API and CLI are in `tools-src/dev-notebook/` |

## Session roles

Work is split across Claude Code sessions with defined ownership. **The protocol and the session
roster are in `docs/dispatch/README.md`** — read it before taking on a dispatch.

- **Casanova** — overseer. Holds the whole picture, plans, writes dispatches, reviews and merges
  PRs, keeps repo context current. Does not take on the large builds itself. Its runbook and latest
  handoff: `docs/dispatch/casanova.md`.
- **Casakwassa** — Kimani's planning and setup session (from 2026-10-21): ideas and plans, anything
  that needs Kimani directly (accounts, keys, services), and repo docs. Casanova keeps the builds. Its
  runbook: `docs/dispatch/casakwassa.md`.
- **The Dispatch Ledger** (https://claude.ai/artifact/HR14yufem1YH1TxqqiWksA) tracks every kickoff from queued to landed. It's Casa's
  own, in the Casa Blanca Claude account (split from the ledger shared with MindBinder, 2026-10-21). Sessions mark their own
  lines with the `ArtifactData` tool (rule 11 in `docs/dispatch/README.md`).
- **Dispatched sessions** — own one brief from `docs/dispatch/` end to end, open a PR to
  `claude/main` when done, and sign their work with their session name.
  **They never merge. Only Casanova or Kimani merges**, unless Kimani tells a session otherwise.

| # | Dispatch | To | State |
|---|---|---|---|
| 01 | [Profile Pic Generator — cutout quality + torso outpainting](docs/dispatch/01-profile-pic-cutout-and-outpaint.md) | Painter | **Parked.** Stack #41–#45. #41's fixes (2026-10-06) await Casanova's re-review; #45 has a conflict |
| 02 | [Agent sites, Slice 0 — data model + build hardening](docs/dispatch/02-agent-sites-foundations.md) | retired session; Concierge next | Done — merged #46 |
| 03 | [Agent sites, Slice 4 — the CMS](docs/dispatch/03-agent-cms.md) | retired session; Concierge next | Done — merged #47 |
| 04 | [Comp report — adjustment research (CR-R)](docs/dispatch/04-comp-report-research.md) | Surveyor | Done — merged #49 |
| 05 | [Comp report — foundations (CR-1)](docs/dispatch/05-comp-report-foundations.md) | Mason | Merged #48, #52, and CR-1.1 item 3 in #57. Step 6: Kimani confirms the refusal in Netlify's function log |
| 06 | [Comp report — engine and parser (CR-2)](docs/dispatch/06-comp-report-engine.md) | Abacus | Done — merged #50, #51 |
| 07 | [Comp report — the walkthrough scaffold (CR-3a)](docs/dispatch/07-comp-report-walkthrough-scaffold.md) | Mason | Done — merged #53 |
| 08 | [Comp report — the engine for a buyer's argument (CR-2.2)](docs/dispatch/08-comp-report-buyers-argument-engine.md) | Abacus | Done — merged #55, #58 |
| 09 | [Comp report — the first-class start, and the screens (CR-3b)](docs/dispatch/09-comp-report-first-class-start.md) | Mason | Done — merged #57 (phases 1–2), #60 (phase 3) |
| 10 | [Comp report — the decision provider, Jev first (CR-D)](docs/dispatch/10-comp-report-decision-provider.md) | Arbiter | Phase 1, follow-ups and the zero-retention switch merged #56, #59, #61; phase 2's pre-live build merged #75. The live run waits on Kimani's keys and the labels sheet |
| 11 | [Comp report — distance, from coordinates (CR-3c)](docs/dispatch/11-comp-report-distance.md) | Mason | Done — merged #62 |
| 12 | [Profile pics — the roster, the store and the email signature](docs/dispatch/12-profile-pic-tracker.md) | Painter | Phase 1 merged #71. Phase 2 (storage) in review; the roster import reads the signatures doc (D-24) |
| 13 | [Comp report — the writer and QA (CR-5)](docs/dispatch/13-comp-report-writer-and-qa.md) | Mason | Phase 1 merged #76. Its production check and the real eval wait on Kimani; phase 2 next |
| 14 | [Comp report — the design port, for Noble (CR-6)](docs/dispatch/14-comp-report-design-port.md) | Mason | Done — merged #77. Follow-ups listed at the end of the dispatch |
| 15 | [Comp report — Sort, as it stands (CR-7a)](docs/dispatch/15-comp-report-sort-as-it-stands.md) | Mason | Ready — runs with 16 and 17 |
| 16 | [Comp report — the listing read and the home's vocabulary (CR-2.3)](docs/dispatch/16-comp-report-listing-read-and-vocabulary.md) | Abacus | Ready |
| 17 | [Comp report — StreetEasy's lists, and the subway (CR-R2)](docs/dispatch/17-comp-report-streeteasy-lists-and-subway.md) | Surveyor | Ready |
| 18 | [Comp report — Send and Done (CR-7b)](docs/dispatch/18-comp-report-send-and-done.md) | Mason | Queued behind 15 |
| 19 | [Comp report — the engine for Findings (CR-2.4)](docs/dispatch/19-comp-report-engine-for-findings.md) | Abacus | Queued behind 15 and 16 |
| 20 | [Comp report — the new report, filled from the read (CR-7c)](docs/dispatch/20-comp-report-new-report-from-the-read.md) | Mason | Queued behind 16 and 18 |
| 21 | [Comp report — Findings, target and client (CR-7d)](docs/dispatch/21-comp-report-findings-target-and-client.md) | Mason | Queued behind 19 and 20 |
| 22 | [Comp report — access, the sign-in log and the activity log (CR-7e)](docs/dispatch/22-comp-report-access-and-activity-log.md) | Mason, or a second builder | 22a in review (NB-23 answered A, 2026-10-27); 22b after 21 |
| 23 | [Comp report — samples that reset, reading production safely (CR-7f)](docs/dispatch/23-comp-report-samples-and-inspection.md) | Mason, or a second builder | Items 1–2 after 22a; items 3–4 from the Casa account, after 22b |
| 24 | [Calliste — Hubert sees what the agent sees (CR-H1)](docs/dispatch/24-calliste-hubert-sees-what-the-agent-sees.md) | Calliste (new) | Waits on the move to the Casa account |
| 25 | [Comp report — the per-comp review, the human first (CR-8a)](docs/dispatch/25-comp-report-per-comp-review.md) | a build thread (Mason's lane) | Ready after the live listing read fix (D-29) |
| 26 | [Comp report — the Designed email is the report, with photos (CR-8b)](docs/dispatch/26-comp-report-designed-email-first.md) | a build thread (Mason's lane) | After 25; items 1 and 5 can go first |

The agent-site port runs in slices. Slices 0 and 4 (Dispatches 02 and 03) are done; Slices 2–3,
the visual port, wait on the template capture in `agent-site-template.md` §5; Slice 5 (SEO and
Google reviews) is unblocked but not dispatched. All parked — see `docs/parked/`.

## Conventions

- Social/IG copy uses normal capitalization and punctuation — **not** casual lowercase. This is a
  CB-specific house-style override. See `docs/context/casa-blanca.md` §7 and the `cb-copy` skill.
- Kimani prefers direct execution over walkthroughs, and "mostly steak, not sizzle" in writeups.
- Agents are very hard to get assets or responses from — **don't design workflows that depend on
  agent responsiveness.**
