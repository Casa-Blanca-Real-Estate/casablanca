# Dispatch 05 — Comp report: foundations (CR-1)

**Dispatched by:** Casanova · 2026-09-24 · **To:** Mason
**Builds from:** `docs/comp-report/01-design.md` §5, §8.3 (rule 6), §8.8, §12, §13, §15, §16
**Depends on:** three of Kimani's actions for parts of it (below) — build everything else around them
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` per phase. Never merge — Casanova
or Kimani merges. Sign PRs, PR comments and commits "— Mason (CR-1)".**

## Why this exists

The comp report tool is the first thing in the Creative Studio with a build step, accounts and a
database. Every other tool is single-file HTML, in daily use by agents. This dispatch lays the
foundations and **retires the riskiest unknowns first**: whether auth enforces the domain rule, what the
function time limits really are, and whether the new build can coexist with the old tools.

**Abacus (Dispatch 06) is building the calculation engine in parallel** at
`tools-src/comp-report/engine/`. Don't touch that folder; import from it once it lands. Keep root config
changes (`package.json`, `tsconfig`) minimal and expect to merge with Abacus's.

## Scope

### 1. Scaffold
React + Vite + TypeScript, source at `tools-src/comp-report/`, built to `tools/comp-report/`
(gitignored). **Follow the wiring proven on `claude/motion-graphic-stories-hlpirk`** — read its
`docs/react-in-the-studio.md` and `vite.config.js` first.

### 2. Build and CI
One build that runs the existing agents build (`node agents/build.js`) and the Vite build, fails fast,
and is what `netlify.toml` runs. CI on every PR — `.github/workflows/agents-build.yml` is the pattern.

**The existing tools must keep working.** After the build change, open a deploy preview and verify the
dashboard and every tool still load. If anything regresses, stop and report before going further.

### 3. Keep internal files off the public web
`publish = "."` serves the entire repo root. Add every new internal-only path to the forced-404 list in
`netlify.toml` — `/tools-src/*`, `vite.config.*`, `tsconfig*.json`, anything else new. After deploy,
`curl` the live site: the internal paths return 404, and `/tools/comp-report/` is served.

### 4. Auth — Netlify Identity (§13)
- Google provider with **Casa's own OAuth client** (Kimani's action), so the consent screen says Casa
  Blanca; email invitations for authorised non-Casa people.
- A signup event function that refuses any email that is neither on Casa's Workspace domain nor on the
  allowlist. **Prove it by signing up with a non-Casa Google account and watching it fail.** Confirm the
  exact domain with Kimani — agents are on `casa-blanca.com`; the creative inbox is on
  `email.casa-blanca.com`.
- **A per-request check in every function**, independent of whatever Identity decided.
- Users keyed by email. Roles `agent`, `mentor`, `admin`, `external`; capability `practice` / `full`
  (scaffolded — nothing uses it yet).
- One fixed staging branch deploy registered as an OAuth origin. Google won't accept wildcard origins,
  so deploy previews can't do Google sign-in.

### 5. Database — Netlify Database (§12)
- Provisioning (needs a credit-based Netlify plan — Kimani's action; if it isn't one, stop this part and
  report the options: change plans, or Neon directly).
- Migrations tooling.
- Row-level security: each request sets the user and role on the connection; policies enforce them.
  Every query is scoped as well.
- The first slice of §12: `users`, `allowlist`, `properties`, `property_observations`, `reports`,
  `report_comps`, `reasons` (append-only), `messages`, `usage`. Every row records when it was created
  and by whom.

### 6. Streaming Claude, and the time limit
A function that calls **Claude Opus 5.5** (`claude-opus-5-5`), streamed, with the model, system prompt
and tools pinned server-side — **one model call per request** (§8.3, rule 6). Then run a deliberately
long, tool-using turn to **measure Netlify's function time limits for streamed responses**. Write up:
the limit, what happens at it, and your recommendation for CR-4. Follow §8.8 for Opus 5.5's specifics
(thinking always on, effort set explicitly, no forced `tool_choice`, refusal handling, fallbacks). Use
the `claude-api` skill.

### 7. The esbuild / `@netlify/blobs` question
`CLAUDE.md` says functions using `@netlify/blobs` must not be esbuild-bundled; `netlify.toml` bundles
everything with esbuild; `site.mjs`, `sessions.mjs` and `agents.mjs` import blobs and appear to work.
Find out whether they really work in production, test it, and **recommend** the corrected rule. **Don't
change how any existing function is bundled** — Casanova decides (decisions D-15).

## Waiting on Kimani

The Netlify plan type, enabling Identity, and the Google OAuth client. If they aren't done, build
everything else, put the blocked integration behind an interface with a stub, and list exactly what's
waiting in your PR.

## Security

The Anthropic key never reaches the browser. Sessions are verified server-side. No secrets committed.

## Definition of done

A signed-in agent creates a report that persists, and a non-Casa Google account is refused; one streamed
model turn completes; the time limit is measured and written up; the 404s are verified live; the existing
tools are verified working. PRs open against `claude/main`, signed.

— Casanova
