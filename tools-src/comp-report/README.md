# Comp report — source

The comp report tool: React + Vite + TypeScript, the scoped exception to the studio's
single-file rule (`/CLAUDE.md`). Design: `docs/comp-report/01-design.md`. Setup and what's waiting
on Kimani: `docs/comp-report/cr1-setup.md`.

| Path | What | Owner |
|---|---|---|
| `src/` | The browser app — sign-in, reports, the new-comp modal (`views/newcomp/`), the workspace, the assistant chat, admins' access list | CR-1 → CR-3 |
| `engine/` | The calculation engine and parser — pure TS, runs in the browser and in functions | Abacus (CR-2) |
| `server/` | Everything the functions run: the access rule, the per-request check, database access, the API handlers, the streamed turn | CR-1 → CR-4 |
| `server/decide/` | The decision layer: the question registry, Jev's transport, the durable paced queue and its drainer, the Haiku fallback, the verdict (Dispatch 10) | Arbiter (CR-D) |
| `db/` | Database tests (row-level security, the API, the turn) and the test harness | CR-1 |
| `workspace/` | The workspace's shared model, in the browser and the functions: stored state → the engine's input, comps from every source, the home from its page, which links can be read | CR-3 |
| `dev/` | Local development only — the dev API server, stub sign-in, a fake Messages API, a fake Firecrawl, the local migrator. **Never imported by a deployed function.** | CR-1 |
| `vite.config.ts` | The build: this folder → `tools/comp-report/`, served at `/tools/comp-report/` | CR-1 |
| `tsconfig.json` | Type-checking for all of the above and the functions | CR-1 |

Outside this folder:

- `netlify/functions/comp-report-*.mts`: thin entry points (`/api/comp-report/…`). Each passes
  production dependencies to a handler in `server/api/`. `comp-report-links-background.mts` is a
  background function (up to 15 minutes): it reads one StreetEasy page.
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
node tools-src/comp-report/dev/fake-firecrawl.ts 8792              # optional: StreetEasy links, no credit
CR_LOCAL_DATABASE_URL=… CR_DEV_ANTHROPIC_BASE_URL=http://127.0.0.1:8791 \
  CR_DEV_FIRECRAWL_BASE_URL=http://127.0.0.1:8792 npm run dev:comp-report
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
| `FIRECRAWL_API_KEY` | Netlify | Reading StreetEasy links (already set for the carousel tools). Never reaches the browser |
| `CR_LINK_READS_PER_DAY` | Netlify, optional | Links a person may have read in any 24 hours; default 60 (admins at least 200). Each read costs Firecrawl credit |
| `CR_LOCAL_DATABASE_URL` | local only | Ignored wherever `NETLIFY_DB_URL` exists |
| `CR_TEST_DATABASE_URL` | tests, CI | A server the tests may create databases on |
| `CR_JEV_MODE` | Netlify | The decision layer (CR-D): `off` (the default; nothing is queued or sent) or `watch` (judgments recorded, never shown) |
| `AI_GATEWAY_API_KEY` | Netlify | Casa's own Vercel AI Gateway key, for Jev. Without it, every judgment is recorded as dropped `no-key` |
| `JEV_MIN_INTERVAL_MS` | Netlify | Pacing between Jev requests; default 12,500 (under the Gateway's ~5 a minute) |
| `CR_DECIDE_FALLBACK` | Netlify | `haiku` turns on the Claude Haiku 4.5 fallback for when Jev can't answer; default off. Uses `ANTHROPIC_API_KEY` |

Nothing reads `DATABASE_URL`: in the Claude Code cloud environment it's another project's database.

## Adding comps (CR-3b)

Three ways in, one list (`docs/comp-report/02-screens.md`):

- **StreetEasy links.** `POST /api/comp-report/links` queues a read per link: signed in, the
  report's owner, StreetEasy sale listings only (checked in `workspace/links.ts`, and again by the
  database), within the person's daily limit, and never the same link twice in a report. The
  browser then starts each read in the background function and polls until its row fills in. The
  function claims the read (exactly once), reads the page with Firecrawl using Abacus's
  `LISTING_EXTRACT_SCHEMA`, and turns the extract into a comp record (`compRecordFromListing`). It
  records the property, what the page said as an observation (`property_observations.raw` holds
  the extract), and the comp in the report, **unconfirmed**. It counts in neither result until the
  agent confirms the row (`PATCH /comps {confirmed: true}`). No photos are fetched. A failed read
  says why and offers "type it in".
- **The export**, as before (`POST /api/comp-report/imports`).
- **Typed in**: `POST /api/comp-report/comps {manual}` (`compRecordFromManual`).

Every comp's record comes from its newest observation: an export's is read from the stored file, a
link's from its page, a typed-in one from what was typed. The browser and the server read each with
the same parser (`workspace/engine-input.ts`). **The home** can come from its link the same way; its
details fill in on the modal's second screen, marked "From StreetEasy" until the agent changes them.

## The three screens (CR-3b)

The workspace is Sort, Findings and Send (`docs/comp-report/02-screens.md`), with the assistant as
a drawer on all three. Each reads the engine's output; none computes a figure.

- **Sort** (`SortStep.tsx`): a row per comp. The tier is three choices, and the note is the tier's
  reason. Every tier or changed note appends a reason (`POST /comps`, reason type `property`); a
  tier with no note waits for one. Kara's checks (`comps[].checks`, §6.10) are the row's flags,
  marked when one rests on an inferred value or the agent's estimate, and their labels lead the
  note chips; the other chips word what else the engine compared (`workspace/sort.ts`). Opening
  a row marks it reviewed and shows the checks with their suggested tiers, and the facts with
  their sources. The anchor is the star in an opened row. The rows' saves run one at a time, so
  each returned workspace lands in order.
- **Findings** (`Findings.tsx`): the agent's number first (D-1). Then the one-sentence reading,
  from `headline_facts`, and the number against it, from `agent_number`, which only Findings
  shows (`workspace/reading.ts`). Then the evidence by status, with didn't sell as its own row
  and its lowest ask as the ceiling line; the price table (`results.*.price_table`); and the
  comps that count. The target and offer details sit under those (D-4). "How this was worked
  out" holds the pairs and what clean pairs show (§6.6). Both results show only when the agent's
  estimates change the answer.
- **Send** (`SendStep.tsx`, `workspace/email.ts`): the headline first, required to copy (D-21).
  Its drafts cite only `headline_facts` and its names, never the agent's number;
  `workspace/grounding.ts` proves it in the tests, and QA warns on a headline number that matches
  no fact. The email is in Frankie's order, in three lengths (the price table is in the full
  one), with QA as one line.
- **Build notes**: the About boxes, stub and decision tags, and the sample fills sit behind one
  switch, admins only and off by default (`buildNotes.tsx`). A sample report shows one banner.

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
