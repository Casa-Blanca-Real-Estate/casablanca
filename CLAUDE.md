# Casa Blanca Creative Studio — repo guide for Claude sessions

Internal browser-based tools for Casa Blanca, a boutique NYC residential brokerage.
Deployed on Netlify. Used by ~200 agents and by Kimani (sole marketing/content/tools person,
3 days a week, working in blocks across several tracks).

**Current priority (from 2026-09-23): the comp report tool.** The master design is
`docs/comp-report/01-design.md` — every comp report dispatch builds from it; `00-orientation.md`
holds the research and sources behind it. Everything that was in flight before it
is parked, with state and a resume order, in `docs/parked/2026-09-23-threads.md`.

**Pending decisions for Kimani, across every track, are in `docs/decisions.md`** — each with its
context and a field to answer in. Don't guess at an open decision; check there first.

**Read `docs/context/casa-blanca.md` before substantive work.** It's the condensed working
reference: who the company is, the hard constraints, the brand tokens, the stack and its gotchas,
current tool state, and ways of working. Tool state drifts — confirm anything load-bearing with
Kimani. `docs/context/casa-blanca-full.md` is the archival version (full company research, design
system component library, buyer's guide, IG playbook, Framer brief, IG API setup); the condensed
file points you there by section when you need it.

## Hard constraints — read before building

- **Single-file HTML per tool. No frameworks, no build pipeline.** Assets embedded as base64.
- Object Sans (Regular 400 / Heavy 800) is the brand font — embedded, never linked externally.
- Internal users are agents: zero-install, browser-based, no accounts.
- `netlify.toml` must explicitly declare the functions directory.
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
  until you add it to both. After deploy, `curl` the live site — including an UPPERCASE variant.
- **The comp report tool is a scoped exception to two rules:** it's React + Vite + TypeScript
  (source in `tools-src/comp-report/`, built to `tools/comp-report/`), and it has accounts
  (Netlify Identity) and retained data (Netlify Database). See `docs/comp-report/01-design.md`.
  Single-file HTML and no accounts still hold for every other tool.

## Layout

| Path | What |
|---|---|
| `index.html` | Creative Studio dashboard (redesigned 2026-08-28, reference for other surfaces) |
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

## Session roles

Work is split across Claude Code sessions with defined ownership. **The protocol and the session
roster are in `docs/dispatch/README.md`** — read it before taking on a dispatch.

- **Casanova** — overseer. Holds the whole picture, plans, writes dispatches, reviews and merges
  PRs, keeps repo context current. Does not take on the large builds itself.
- **Dispatched sessions** — own one brief from `docs/dispatch/` end to end, open a PR to
  `claude/main` when done, and sign their work with their session name.
  **They never merge. Only Casanova or Kimani merges**, unless Kimani tells a session otherwise.

| # | Dispatch | To | State |
|---|---|---|---|
| 01 | [Profile Pic Generator — cutout quality + torso outpainting](docs/dispatch/01-profile-pic-cutout-and-outpaint.md) | unnamed | **Parked.** Stack #41–#45 open; #41 has changes requested |
| 02 | [Agent sites, Slice 0 — data model + build hardening](docs/dispatch/02-agent-sites-foundations.md) | unnamed | Done — merged #46 |
| 03 | [Agent sites, Slice 4 — the CMS](docs/dispatch/03-agent-cms.md) | unnamed | Done — merged #47 |
| 04 | [Comp report — adjustment research (CR-R)](docs/dispatch/04-comp-report-research.md) | Surveyor | Done — merged #49 |
| 05 | [Comp report — foundations (CR-1)](docs/dispatch/05-comp-report-foundations.md) | Mason | Merged #48, #52; step 6 waits on Kimani (a Gmail on no list) |
| 06 | [Comp report — engine and parser (CR-2)](docs/dispatch/06-comp-report-engine.md) | Abacus | Done — merged #50, #51 |
| 07 | [Comp report — the walkthrough scaffold (CR-3a)](docs/dispatch/07-comp-report-walkthrough-scaffold.md) | Mason | Done — merged #53 |
| 08 | [Comp report — the engine for a buyer's argument (CR-2.2)](docs/dispatch/08-comp-report-buyers-argument-engine.md) | Abacus | Ready |
| 09 | [Comp report — the first-class start, and the screens (CR-3b)](docs/dispatch/09-comp-report-first-class-start.md) | Mason | Ready |

The agent-site port runs in slices. Slices 0 and 4 (Dispatches 02 and 03) are done; Slices 2–3,
the visual port, wait on the template capture in `agent-site-template.md` §5; Slice 5 (SEO and
Google reviews) is unblocked but not dispatched. All parked — see `docs/parked/`.

## Conventions

- Social/IG copy uses normal capitalization and punctuation — **not** casual lowercase. This is a
  CB-specific house-style override. See `docs/context/casa-blanca.md` §7 and the `cb-copy` skill.
- Kimani prefers direct execution over walkthroughs, and "mostly steak, not sizzle" in writeups.
- Agents are very hard to get assets or responses from — **don't design workflows that depend on
  agent responsiveness.**
