# The esbuild / `@netlify/blobs` rule — findings and a corrected rule (CR-1, D-15)

**Mason (Dispatch 05 §7), 2026-09-24.** Investigated, tested, **not changed**: how existing
functions are bundled is Casanova's call (decisions D-15).

## The short version

- **The rule is backwards for this repo's functions.** `CLAUDE.md` says functions that use
  `@netlify/blobs` must not be esbuild-bundled. But every function here is a modern (v2) function,
  and **Netlify bundles every v2 function with `nft` whatever `node_bundler` says**. `nft` ships the
  `node_modules` each function imports, so the global `node_bundler = "esbuild"` in `netlify.toml`
  has no effect on any of them.
- **Obeying the rule is what broke the agent CMS.** `[functions."agent-store"] node_bundler = "none"`
  is the one bundler setting that does take effect, and `none` ships **no `node_modules` at all**.
  `agent-store` can't load `@netlify/blobs`:
  - production: **HTTP 502** ("error decoding lambda response");
  - a deploy preview of the same code: `Cannot find package '@netlify/blobs' imported from
    /var/task/agent-store.mjs`.

  The CMS backend (Dispatch 03) can't work in production until that override goes.
- `site`, `sessions` and `agents` do work in production (GET → 200 JSON), because `nft` ships
  `@netlify/blobs` with them.

## Evidence

1. **Production and preview, read-only GETs:** `site`, `sessions`, `agents` and `brand` return 200
   JSON, while `agent-store` returns 502 in production and the module error above on
   `deploy-preview-48`.
2. **Netlify's own bundler, locally:** I ran `@netlify/zip-it-and-ship-it` 16.1.0 (what Netlify's
   build uses) over `netlify/functions/` with `netlify.toml`'s settings.

   | Function | Bundler used | `node_modules/@netlify/blobs` in the zip |
   |---|---|---|
   | `site`, `sessions`, `agents` (and every other v2 function) | `nft` | yes (4 files) |
   | `agent-store` with `node_bundler = "none"` | `none` | **no (0 files)** |
   | `agent-store` without the override | `nft` | yes (4 files) |
   | `_lib` (no default export) | `esbuild`, deployed as a v1 function | — |

3. **Netlify's source** (`zip-it-and-ship-it/src/runtimes/node/bundlers/index.ts`), since
   2023-10-09: *"For V2 functions, we force the bundler to NFT. The only exception is when a
   `none` override was provided."* The docs' description of `node_bundler` predates that and
   doesn't say so.
4. **No source anywhere** — Netlify docs, the `netlify/blobs` and `netlify/primitives` issues, the
   forums — says `@netlify/blobs` fails under esbuild. The nearest real failure is
   `MissingBlobsEnvironmentError` in **v1** (Lambda-compatible, `exports.handler`) functions that
   don't call `connectLambda(event)`. That is probably where the rule came from.

## Recommendation (for Casanova, D-15)

1. **Delete `[functions."agent-store"]` from `netlify.toml`.** That fixes the CMS: it bundles with
   `nft` and ships `@netlify/blobs`, verified locally above. Check afterwards that
   `GET /.netlify/functions/agent-store` answers 401/503 JSON instead of 502.
2. **Optionally drop the global `node_bundler = "esbuild"`.** It does nothing to v2 functions. It
   only bundles `_lib.mjs`, which isn't a function: it's a helper module that sits in the
   functions folder and so gets deployed as a stray v1 function. Moving `_lib.mjs` out of
   `netlify/functions/` removes that stray deploy (and needs its three importers — `copy`, `img`, `import` — updated).
3. **Replace the `CLAUDE.md` rule** (in "Hard constraints" and `casa-blanca.md` §2) with:

   > **Functions are v2** (`export default async (req, context) => Response`). Netlify bundles
   > v2 functions with `nft`, which ships the `node_modules` each function imports; `node_bundler`
   > doesn't apply to them. **Never set `node_bundler = "none"` on a function that imports a
   > package** — it ships no `node_modules` at all. `@netlify/blobs` needs no setup in a v2
   > function. Lambda-compatible v1 functions (`exports.handler`) are deprecated (deploys stop
   > mid-2027) and would need `connectLambda(event)` before `getStore()` — don't write new ones.

The comp report's functions follow that rule already: v2, no bundler override, and they import
server code from `tools-src/comp-report/` (the deploy preview proved `nft` resolves those `.ts`
imports).
