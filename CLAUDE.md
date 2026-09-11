# Casa Blanca Creative Studio — repo guide for Claude sessions

Internal browser-based tools for Casa Blanca, a boutique NYC residential brokerage.
Deployed on Netlify. Used by ~200 agents and by Kimani (sole marketing/content/tools person,
3 days a week, working in blocks across several tracks).

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

## Layout

| Path | What |
|---|---|
| `index.html` | Creative Studio dashboard (redesigned 2026-08-28, reference for other surfaces) |
| `tools/*/` | One directory per tool, single-file HTML each |
| `agents/` | Static agent-site generator: `template.html` + `data/*.json` → `build.js` → `<slug>/index.html` (prototype, fictional demo agents) |
| `netlify/functions/` | Serverless: StreetEasy import, Claude copy generation, image proxy, sessions |
| `css/`, `js/` | Shared front-end (`main.css`, `animations.css`, `nav.js`, `scroll.js`) |
| `docs/design/` | Design briefs per surface — start at `docs/design/README.md` |
| `docs/context/` | Company + project context — start with `casa-blanca.md`, not the full file |
| `docs/dispatch/` | Scoped briefs handed to dedicated sessions |

## Session roles

Work is split across Claude Code sessions with defined ownership.

- **Casanova** — overseer. Holds the whole picture, plans, writes dispatches, reviews and merges
  PRs, keeps repo context current. Does not take on the large builds itself.
- **Dispatched sessions** — own one brief from `docs/dispatch/` end to end. Branch per phase,
  PR to `claude/main`, Casanova reviews. Don't self-merge.

Open dispatches:

| # | Brief | Owner |
|---|---|---|
| 01 | [Profile Pic Generator — cutout quality + torso outpainting](docs/dispatch/01-profile-pic-cutout-and-outpaint.md) | unassigned |

## Conventions

- Social/IG copy uses normal capitalization and punctuation — **not** casual lowercase. This is a
  CB-specific house-style override. See `docs/context/casa-blanca.md` §7 and the `cb-copy` skill.
- Kimani prefers direct execution over walkthroughs, and "mostly steak, not sizzle" in writeups.
- Agents are very hard to get assets or responses from — **don't design workflows that depend on
  agent responsiveness.**
