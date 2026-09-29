# Comp report — source

The comp report tool: React + Vite + TypeScript, the scoped exception to the studio's
single-file rule (`/CLAUDE.md`). Design: `docs/comp-report/01-design.md`. Setup and what's waiting
on Kimani: `docs/comp-report/cr1-setup.md`.

| Path | What | Owner |
|---|---|---|
| `src/` | The browser app — sign-in, reports, the assistant chat, admins' access list | CR-1 → CR-3 |
| `engine/` | The calculation engine and parser — pure TS, runs in the browser and in functions | Abacus (CR-2) |
| `server/` | Everything the functions run: the access rule, the per-request check, database access, the API handlers, the streamed turn | CR-1 → CR-4 |
| `server/decide/` | The decision layer: the question registry, Jev's transport, the durable paced queue and its drainer, the Haiku fallback, the verdict (Dispatch 10) | Arbiter (CR-D) |
| `db/` | Database tests (row-level security, the API, the turn) and the test harness | CR-1 |
| `dev/` | Local development only — the dev API server, stub sign-in, a fake Messages API, the local migrator. **Never imported by a deployed function.** | CR-1 |
| `vite.config.ts` | The build: this folder → `tools/comp-report/`, served at `/tools/comp-report/` | CR-1 |
| `tsconfig.json` | Type-checking for all of the above and the functions | CR-1 |

Outside this folder:

- `netlify/functions/comp-report-*.mts`: thin entry points (`/api/comp-report/…`). Each passes
  production dependencies to a handler in `server/api/`.
- `netlify/functions/identity-{validate,signup,login}.mts`: the sign-up and log-in gate.
- `netlify/database/migrations/`: the schema. Netlify applies it on deploy. **Never edit a
  migration once it has shipped**, previews included; add a new one.

## Commands (from the repo root)

```bash
npm ci
npm run typecheck           # tsc, no emit
npm run test:comp-report    # server + database tests; the database ones need CR_TEST_DATABASE_URL
npm run build               # what Netlify runs: agent sites, then this tool

# Local development with the real API handlers:
createdb comp_report_dev                                           # as a NON-superuser owner
CR_LOCAL_DATABASE_URL=postgres://you@localhost/comp_report_dev npm run db:local
node tools-src/comp-report/dev/fake-anthropic.ts 8791              # optional: no key, no cost
CR_LOCAL_DATABASE_URL=… CR_DEV_ANTHROPIC_BASE_URL=http://127.0.0.1:8791 npm run dev:comp-report
# → http://localhost:5173/tools/comp-report/ — "Dev sign-in" takes any email; the access rule still applies
```

The local database's owner must not be a superuser: superusers bypass row-level security, and the
server refuses to run on a role that does. `CR_TEST_DATABASE_URL` is different: it must be a user
that can create roles and databases, because each test file makes a throwaway database.

## Configuration

| Variable | Where | What |
|---|---|---|
| `NETLIFY_DB_URL` | set by Netlify | The database — production, or the deploy preview's branch |
| `CR_ADMIN_EMAILS` | Netlify | Admins, comma-separated: the only way to be one (an allowlist grant can't make an admin). Redeploy after changing it |
| `CR_ALLOWED_DOMAINS` | Netlify | Casa's sign-in domains; default `casa-blanca.com`, matched exactly |
| `ANTHROPIC_API_KEY` | Netlify | The assistant. Never reaches the browser |
| `CR_LOCAL_DATABASE_URL` | local only | Ignored wherever `NETLIFY_DB_URL` exists |
| `CR_TEST_DATABASE_URL` | tests, CI | A server the tests may create databases on |
| `CR_JEV_MODE` | Netlify | The decision layer (CR-D): `off` (the default; nothing is queued or sent) or `watch` (judgments recorded, never shown) |
| `AI_GATEWAY_API_KEY` | Netlify | Casa's own Vercel AI Gateway key, for Jev. Without it, every judgment is recorded as dropped `no-key` |
| `JEV_MIN_INTERVAL_MS` | Netlify | Pacing between Jev requests; default 12,500 (under the Gateway's ~5 a minute) |
| `CR_DECIDE_FALLBACK` | Netlify | `haiku` turns on the Claude Haiku 4.5 fallback for when Jev can't answer; default off. Uses `ANTHROPIC_API_KEY` |

Nothing reads `DATABASE_URL`: in the Claude Code cloud environment it's another project's database.

## How it's wired

- **Build output is gitignored.** `tools/comp-report/` is generated on every Netlify deploy by
  `npm run build` (`netlify.toml`). The Vite config refuses to run if its output folder is
  anything but `tools/comp-report/`, because it empties that folder first.
- **Shared studio files by absolute path**: `/assets/studio-header.js` (the "‹ Studio" button and
  Feedback), `/assets/fonts/…`, `/assets/brand/…`. The dev server serves them from the repo.
- **This folder is never served.** `/tools-src/*` is on the forced-404 list in `netlify.toml`.
- **`/tools/comp-report/build.json`** says which commit is deployed, from which branch and
  context, built on which Node.
- **`/api/comp-report/health`** says whether the setup is done: the database migrated and running
  requests as `comp_report_app`, Identity on and how it's configured, the API key set. It needs no
  sign-in and returns no user data.
- **The server code runs straight under Node** (type stripping) for tests, and is bundled by Netlify
  (`nft`) for functions. So imports carry their `.ts` extension, and only erasable TypeScript is
  allowed (no enums or namespaces).
- **The Anthropic SDK is `@comp-report/anthropic-sdk`**, an npm alias of a current
  `@anthropic-ai/sdk`. The existing functions keep the 0.104 they were built on; unify them when
  they're next touched.
