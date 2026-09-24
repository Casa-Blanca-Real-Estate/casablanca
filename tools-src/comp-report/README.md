# Comp report — source

The comp report tool: React + Vite + TypeScript, the scoped exception to the studio's
single-file rule (`/CLAUDE.md`). Design: `docs/comp-report/01-design.md`.

| Path | What | Owner |
|---|---|---|
| `src/` | The browser app | CR-1 → CR-3 |
| `engine/` | The calculation engine and parser — pure TS, runs in the browser and in functions | Abacus (CR-2) |
| `vite.config.ts` | The build: this folder → `tools/comp-report/`, served at `/tools/comp-report/` | CR-1 |
| `tsconfig.json` | Type-checking for the app, server code and the `comp-report-*` functions | CR-1 |

## Commands (from the repo root)

```bash
npm ci
npm run dev:comp-report     # dev server → http://localhost:5173/tools/comp-report/
npm run typecheck           # tsc, no emit
npm run build               # what Netlify runs: agent sites, then this tool
```

## How it's wired

- **Build output is gitignored.** `tools/comp-report/` is generated on every Netlify deploy by
  `npm run build` (`netlify.toml`). Vite writes nothing else; the Vite config refuses to run if
  its output folder is anything but `tools/comp-report/`, because it empties that folder first.
- **Shared studio files by absolute path.** `/assets/studio-header.js` (the "‹ Studio" button and
  Feedback), `/assets/fonts/…`, `/assets/brand/…` — the same files every tool uses. The dev
  server serves them from the repo.
- **This folder is never served.** `publish = "."` publishes the repo root; `/tools-src/*` is on
  the forced-404 list in `netlify.toml`.
- **`/tools/comp-report/build.json`** says which commit is deployed, from which branch and
  context, built on which Node. Nothing secret goes in it.
- **CI** (`.github/workflows/site-build.yml`) runs the same build on every PR, type-checks, and
  fails if the build writes anything outside its own output folder.
