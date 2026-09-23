# Casa Blanca Creative Studio — repo guide for Claude sessions

Internal browser-based tools for Casa Blanca, a boutique NYC residential brokerage.
Deployed on Netlify. Used by ~200 agents and by Kimani (sole marketing/content/tools person,
3 days a week, working in blocks across several tracks).

**Current priority (from 2026-09-23): the comp report tool** — planning in
`docs/comp-report/`, starting from `00-orientation.md`. Everything that was in flight before it
is parked, with state and a resume order, in `docs/parked/2026-09-23-threads.md`.

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
- No esbuild bundling for functions that use `@netlify/blobs`.
- Image proxying genuinely needs the server (canvas taint) — cannot go client-side.
- Fork the working reference template rather than clean-room rewriting. Patch surgically,
  validate each step. No big-bang rewrites.
- **`publish = "."` serves the entire repo root to the public web.** Anything internal-only must
  be on the forced-404 list in `netlify.toml` — `docs/`, `netlify/`, `agents/data/` and the build
  and config files already are. A new top-level folder of notes, data or source is public until
  you add it there. Check with `curl` against the live site after deploy.
- **The comp report tool will need accounts and data retention** — a deliberate exception to
  "no accounts", being scoped in `docs/comp-report/`. Until its design doc lands, the rule
  stands for every other tool.

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
| `docs/dispatch/` | Scoped briefs handed to dedicated sessions |
| `docs/comp-report/` | The comp report tool — orientation, sources (kickoff transcripts, the reference StreetEasy export), and the master design doc when it's written |
| `docs/parked/` | Work paused for a priority change, with the state it was left in and how to resume |

## Session roles

Work is split across Claude Code sessions with defined ownership.

- **Casanova** — overseer. Holds the whole picture, plans, writes dispatches, reviews and merges
  PRs, keeps repo context current. Does not take on the large builds itself.
- **Dispatched sessions** — own one brief from `docs/dispatch/` end to end. Branch per phase,
  PR to `claude/main`, Casanova reviews. Don't self-merge.

Open dispatches:

| # | Brief | State |
|---|---|---|
| 01 | [Profile Pic Generator — cutout quality + torso outpainting](docs/dispatch/01-profile-pic-cutout-and-outpaint.md) | **Parked.** Stack #41–#45 open; #41 has changes requested |
| 02 | [Agent sites, Slice 0 — data model + build hardening](docs/dispatch/02-agent-sites-foundations.md) | Done — merged #46 |
| 03 | [Agent sites, Slice 4 — the CMS](docs/dispatch/03-agent-cms.md) | Done — merged #47 |

The agent-site port runs in slices. Slices 0 and 4 (Dispatches 02 and 03) are done; Slices 2–3,
the visual port, wait on the template capture in `agent-site-template.md` §5; Slice 5 (SEO and
Google reviews) is unblocked but not dispatched. All parked — see `docs/parked/`.

## Conventions

- Social/IG copy uses normal capitalization and punctuation — **not** casual lowercase. This is a
  CB-specific house-style override. See `docs/context/casa-blanca.md` §7 and the `cb-copy` skill.
- Kimani prefers direct execution over walkthroughs, and "mostly steak, not sizzle" in writeups.
- Agents are very hard to get assets or responses from — **don't design workflows that depend on
  agent responsiveness.**
