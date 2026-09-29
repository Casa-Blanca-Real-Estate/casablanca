<!-- The handoff this notebook was built from (MindBinder, 2026-09), kept as it arrived for reference.
     What applies in this repo is docs/dev-notebook/README.md; its last section lists the differences. -->

# Handoff: add a dev notebook to this project

**For:** the Claude Code session working in this repo.
**From:** a session on another project (MindBinder), where this feature has been in daily use since
2026-09-08. This file is portable: it names no MindBinder tables and assumes nothing about your stack.
**Goal:** the developer can write a note about the app *while using it*, from any screen, in about two
seconds. Later, **you** (a Claude Code session) read those notes straight from the database or API,
act on them, and mark them resolved against a PR.

> Read all of §0 before writing any code. Every decision below it depends on what your stack actually
> is, and the most expensive mistakes in the original build came from assuming a shape without checking.

---

## 0. First: find out what you are building on (≈10 minutes, no code)

Answer each of these from the repo itself, not from memory, and write the answers down in your PR body.

| Question | Where to look | Why it matters |
|---|---|---|
| **Database and access layer?** (Postgres / MySQL / SQLite / Mongo / Supabase / Firebase / none) | ORM config, `DATABASE_URL`, `prisma/schema.prisma`, `drizzle.config.*`, `supabase/`, `firebase.json` | Decides §2's schema and §6's read-back script |
| **How do migrations run?** Are they applied by hand or on deploy? | `package.json` scripts, the deploy config (`railway.toml`, `vercel.json`, `fly.toml`, `render.yaml`, Dockerfile), and a `migrations/` directory | Decides whether merging the PR is what applies it. Find out **before** you tell anyone to run a migration |
| **What is the next free migration number/name?** | The *applied* migrations table (`schema_migrations`, `_prisma_migrations`, `drizzle.__drizzle_migrations`…), **not** the directory listing | Two branches can each claim the same number, and the directory will not show that |
| **Auth?** Is there a user id on the request? Is there a notion of "developer / admin"? | Auth middleware, the user table, any `is_admin` / `role` column | Notes must be owner-scoped and the routes gated to dev |
| **Frontend framework and router?** (React / Vue / Svelte / Next / Remix / plain server-rendered) | `client/`, `app/`, `pages/`, router setup | Decides §4's capture component and how you read the route |
| **Client data cache?** (React Query / SWR / Apollo / Redux / Pinia / none) | Providers near the app root | Lets capture record *names* without extra fetches (§4.3) |
| **File/image storage?** (S3 / R2 / Supabase Storage / a DB `bytea` table / local disk) | Any existing upload route | Screenshots (§3.4). If nothing exists, ship without screenshots first |
| **Deploy host?** | Deploy config | Decides which env var carries the commit SHA (§3.1) |
| **Existing name collisions?** Search for `dev_note`, `devnote`, `feedback`, `notes`, `/api/dev` | `grep -ri` over the repo | See §1, rule 1 |
| **Keyboard shortcuts already bound?** | `grep -r "keydown\|useHotkeys\|metaKey\|ctrlKey"` | So the capture chord does not collide with one (§4.1) |

If the project has **no database at all**, jump to §2.6 (the file-backed fallback) and skip the parts of
§3 that talk about the store.

---

## 1. The rules that make it work (keep these; the rest is detail)

These are what the original build learned. Each one is here because breaking it caused a real defect,
or nearly did.

1. **Give it its own name, one nothing else uses.** MindBinder already had a `dev_notes` table (an AI
   agent's scratchpad), so this one became `platform_notes`, served at `/api/dev/platform-notes` and read
   by `scripts/platform-notes.ts`. Two features under one name breaks every grep a later session runs.
   Search first. If `feedback` or `notes` is taken, pick something unambiguous.
2. **Notes are about the software, not about the user's data. Keep them structurally apart.**
   - **No foreign keys into domain data.** Record the project, document or record that was on screen as
     *plain values* (an id plus its display name), in columns prefixed `ctx_`. A note saying "deleting a
     workspace corrupts X" has to **outlive** the workspace. A cascade would delete the bug report along
     with its evidence, and `ON DELETE SET NULL` erases the id, which is the evidence.
   - **The only FK allowed is the owner (the user), with `ON DELETE CASCADE`**, so account deletion
     still removes them.
   - **Do not name the context column like a scoping column.** If the codebase has conventions keyed
     on a column name (`workspace_id`, `org_id`, `project_id` enrols a table in a purge, export or tenancy
     filter), use `ctx_workspace_id`. Exporting a user's data must never include your bug notes, and
     purging a workspace must never delete them.
   - **Nothing in the app's business logic, AI pipeline, search index or embeddings may read this
     table.** Add a test that fails if one does (§7). A note about a button must never be ingested as
     content.
3. **Gate every route behind "developer only", by prefix.** Put the routes under one prefix
   (`/api/dev/…`) that a middleware gates *before* any handler runs. A handler added there later cannot
   ship ungated by accident. Wrap the client capture UI in the same dev check.
4. **Owner-scope every query.** `WHERE owner_id = <current user>` on every read, write and re-status.
5. **Context is captured automatically, and shown before save.** The only required input is the text.
   A line under the textbox shows exactly what will be recorded, so a wrong capture is visible before
   saving, not weeks later.
6. **URL params are captured from an ALLOWLIST, never "everything present".** Some params carry things
   the user typed (search boxes, chat drafts, tokens, emails). Capture only params you know are
   coordinates (`?id=`, `?tab=`, `?view=`…).
7. **The server stamps the commit SHA, not the client.** A stale browser bundle can be wrong about its
   own build. The process answering the request cannot be.
8. **The status history is append-only.** Every change records `{status, at, by, note?, pr?}`. Nothing
   is ever overwritten, so "who marked this wontfix, and why" survives a later reopen.
9. **Resolving a note requires a PR number.** A resolved note with no PR cannot be verified.
10. **Claude Code sessions cannot delete.** The session-facing CLI has **no delete verb** at all. That
    is a property of the tool, not a rule to remember. Deletion happens only in the human UI
    (`/dev/notebook`). Sessions use `wontfix` or `duplicate` instead.
11. **Unknown is null. Never store a plausible-looking wrong value.** See §8. Each of those bugs was a
    believable value, not a crash, which is the worst failure a dev tool can have: a wrong coordinate
    sends the reader chasing it.

---

## 2. Data model

### 2.1 The fields (stack-neutral)

| field | type | notes |
|---|---|---|
| `id` | string PK | Prefixed, e.g. `pn_<uuid>`, so an id in a log is recognisable |
| `owner_id` | FK → users, cascade | The only FK |
| `body` | text, required | Cap it (8,000 chars) so a runaway paste can't write an unbounded row |
| `tags` | string[] | From a fixed vocabulary (§3.2). Empty is fine |
| `status` | string, default `open` | `open` `read` `resolved` `deferred` `wontfix` `duplicate` |
| `status_at` | timestamp | When the status last changed |
| `status_log` | JSON array | Append-only `[{status, at, by, note?, pr?}]`. The first entry is `{status:"open", by:<owner>, note:"captured"}` |
| `resolved_pr` | int, nullable | Set when the status becomes `resolved` |
| `route` | text | `location.pathname` |
| `surface` | text | A coarse label **derived server-side from the route** (§3.2), so it can be re-derived later for old notes |
| `params` | JSON object | Allowlisted query params only |
| `ctx_<scope>_id` / `ctx_<scope>_name` | plain values | e.g. the workspace/project on screen. **No FK** |
| `ctx_<item>_id` / `ctx_<item>_name` | plain values | e.g. the record or document open on screen. **No FK** |
| `commit_sha` | text | Stamped by the server |
| `user_agent` | text | From the request header |
| `viewport` | text, nullable | `"1512x945"`; **null** when unknown, never `"0x0"` |
| `shot_ids` | string[] | Screenshot ids in your storage layer. No FK (§3.4) |
| `created_at` | timestamp | |

The indexes that matter are `(owner_id, status, created_at DESC)`, because the common read-back is
"my open notes, newest first", and one on `tags` if your DB supports array containment.

### 2.2 Postgres (raw SQL, Drizzle, Knex, Kysely)

```sql
CREATE TABLE IF NOT EXISTS platform_notes (
  id              text PRIMARY KEY,
  owner_id        integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- match your users.id type
  body            text NOT NULL,
  tags            text[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'open',
  status_at       timestamptz NOT NULL DEFAULT now(),
  status_log      jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_pr     integer,
  route           text,
  surface         text,
  params          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ctx_scope_id    integer,       -- rename to your scope (ctx_workspace_id, ctx_project_id…). NO FK.
  ctx_scope_name  text,
  ctx_item_id     text,          -- NO FK
  ctx_item_name   text,
  commit_sha      text,
  user_agent      text,
  viewport        text,
  shot_ids        text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_notes_owner_status_idx ON platform_notes (owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_notes_tags_idx ON platform_notes USING gin (tags);
CREATE INDEX IF NOT EXISTS platform_notes_ctx_scope_idx ON platform_notes (ctx_scope_id) WHERE ctx_scope_id IS NOT NULL;
```

Make it additive and idempotent (`IF NOT EXISTS`). Put the reasoning (why there is no FK, why it is
named `ctx_`) in the migration header, because that is where the next person looks. If you use Drizzle
or Prisma, declare the model in the schema file as well. Some tools (`drizzle-kit push`, `prisma db
push`) **drop** tables that are missing from the schema.

### 2.3 Supabase

Use the same SQL, with `owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, and
**enable RLS**:

```sql
ALTER TABLE platform_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notes" ON platform_notes
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- Deliberately NO delete policy for the anon/authenticated key if you want deletes UI-only via a
-- server route using the service role; or add a DELETE policy and keep deletes out of the CLI.
```

The read-back script (§6) uses the **service-role key from `.env`**, filters by owner explicitly, and
never prints the key.

### 2.4 MySQL / MariaDB / SQLite

- MySQL: `JSON` for `tags`, `params`, `status_log` and `shot_ids`; `DATETIME(3)` for times. Filter tags
  with `JSON_CONTAINS(tags, '"bug"')`.
- SQLite: `TEXT` columns holding JSON, `TEXT` ISO timestamps. Filter tags with `EXISTS (SELECT 1 FROM
  json_each(tags) WHERE value = 'bug')`. SQLite is fine here: the table is tiny and read by one person.

### 2.5 Mongo / Firestore

- A top-level collection `platform_notes`, **not** a subcollection under the domain document. A
  subcollection is a cascade by construction, which is exactly what rule 2 forbids.
- Firestore: add a security rule so only `request.auth.uid == resource.data.owner_id` can read or write,
  and deny deletes from the client unless you want deletes from the UI. Add the composite index
  `(owner_id, status, created_at desc)`.
- Store `status_log` as an array and append with `arrayUnion`, or with read-modify-write in a
  transaction, capped (§3.2).

### 2.6 No database: the file-backed fallback

If the app has no DB (a static site, a CLI, a desktop app), write one JSON file per note to a git-ignored
directory (`.devnotes/pn_<id>.json`), or append to `.devnotes/notes.jsonl`. The dev server exposes the
same `/api/dev/…` routes over that directory. The read-back script reads the files directly. Everything
else in this doc still applies.

---

## 3. Server

### 3.1 The build SHA helper

It resolves once, is cached, returns a short SHA, and never throws.

```ts
// server/lib/build-info.ts
import { execFileSync } from "node:child_process";
let cached: string | null | undefined;
export function buildCommitSha(): string | null {
  if (cached !== undefined) return cached;
  const fromEnv =
    process.env.RAILWAY_GIT_COMMIT_SHA ||   // Railway
    process.env.VERCEL_GIT_COMMIT_SHA ||    // Vercel
    process.env.RENDER_GIT_COMMIT ||        // Render
    process.env.CF_PAGES_COMMIT_SHA ||      // Cloudflare Pages
    process.env.COMMIT_REF ||               // Netlify
    process.env.HEROKU_SLUG_COMMIT ||       // Heroku (dyno metadata)
    process.env.SOURCE_VERSION ||           // Heroku build / some CI
    process.env.GITHUB_SHA ||               // GitHub Actions-built images
    process.env.GIT_COMMIT_SHA;             // your own: set it in the Dockerfile / build step
  if (fromEnv) return (cached = fromEnv.slice(0, 12));
  try {
    // execFile, not exec: no shell. 2s timeout so a missing git never hangs a request.
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { timeout: 2000, stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
    return (cached = sha ? sha.slice(0, 12) : null);
  } catch { return (cached = null); }
}
```

Check which env var your host sets. **Fly.io and plain Docker set none**, so pass `--build-arg
GIT_COMMIT_SHA=$(git rev-parse HEAD)` and add `ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA` in the Dockerfile.
Python and Go equivalents are trivial (`subprocess.run(["git","rev-parse","HEAD"], timeout=2)`).

### 3.2 One shared vocabulary module (pure: no DB, no framework)

The client and the server both import it, and it is the **only** place the tags live.

```ts
// shared/platform-notes.ts
export const PLATFORM_NOTE_TAGS = [
  { id: "bug",      label: "Bug",      hint: "something is broken" },
  { id: "uiux",     label: "UI/UX",    hint: "works, but looks or feels wrong" },
  { id: "critique", label: "Critique", hint: "an opinion about how it should be" },
  { id: "feature",  label: "Feature",  hint: "something that should exist" },
  { id: "question", label: "Question", hint: "why does it do this?" },
  { id: "copy",     label: "Copy",     hint: "wording" },
  { id: "perf",     label: "Perf",     hint: "slow" },
] as const;
export type PlatformNoteTag = (typeof PLATFORM_NOTE_TAGS)[number]["id"];

export const PLATFORM_NOTE_STATUSES = ["open", "read", "resolved", "deferred", "wontfix", "duplicate"] as const;
export type PlatformNoteStatus = (typeof PLATFORM_NOTE_STATUSES)[number];
export const isPlatformNoteStatus = (s: unknown): s is PlatformNoteStatus =>
  typeof s === "string" && (PLATFORM_NOTE_STATUSES as readonly string[]).includes(s);

/** Keep only known tags, dedupe, and order by the vocabulary's own order (stable diffs). */
export function normalizeTags(raw: unknown): PlatformNoteTag[] {
  const set = new Set(Array.isArray(raw) ? raw : []);
  return PLATFORM_NOTE_TAGS.map(t => t.id).filter(id => set.has(id));
}

/** Route → coarse surface. MOST SPECIFIC FIRST. Derived, so old notes can be re-derived if this changes. */
const SURFACE_RULES: Array<[RegExp, string]> = [
  // [/^\/projects\/\d+\/settings/, "project-settings"],
  // [/^\/projects\/\d+/,           "project"],
  // [/^\/settings/,                "settings"],
  // [/^\/dev\//,                   "dev"],
  // [/^\/$/,                       "home"],
];
export function surfaceForRoute(route: string | null | undefined): string {
  if (!route) return "unknown";
  for (const [re, label] of SURFACE_RULES) if (re.test(route)) return label;
  return "other";
}

export interface StatusLogEntry { status: PlatformNoteStatus; at: string; by: string; note?: string; pr?: number }
/** Append-only. Capped at 50, always keeping the first ("captured") entry plus the most recent ones. */
export function appendStatus(log: StatusLogEntry[], entry: StatusLogEntry, cap = 50): StatusLogEntry[] {
  const next = [...log, entry];
  return next.length <= cap ? next : [next[0], ...next.slice(next.length - (cap - 1))];
}

/** Guards "no value" → null. Number(null) === 0 passes isFinite; that bug stored "workspace 0" everywhere. */
export function positiveIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The CLI's opening line: "7 open dev notes, 3 tagged bug, 1 tagged perf." */
export function describeOpen(notes: Array<{ tags: string[] }>): string {
  if (notes.length === 0) return "No open dev notes.";
  const counts = new Map<string, number>();
  for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const parts = [...counts].sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c} tagged ${t}`);
  return `${notes.length} open dev note${notes.length === 1 ? "" : "s"}${parts.length ? ", " + parts.join(", ") : ""}.`;
}
```

Fill `SURFACE_RULES` in from your real routes.

### 3.3 The store and routes

Keep every DB call for this table in **one store module**. Routes never query it directly, which also
makes the isolation test in §7 easy to write.

| Method + path | Does | Notes |
|---|---|---|
| `GET  /api/dev/platform-notes/tags` | returns the vocabulary | |
| `POST /api/dev/platform-notes` | create | `body` required. Server derives `surface`, stamps `commit_sha`, reads `user-agent` from the header, and runs `positiveIntOrNull` on ids. Returns `201 {note}` |
| `GET  /api/dev/platform-notes?status=open\|all\|…&tag=&scope=&surface=&limit=` | list, newest first | default `status=open`; cap `limit` at 500 |
| `GET  /api/dev/platform-notes/:id` | one note | 404 if it is not yours |
| `PATCH /api/dev/platform-notes/:id` `{status, by, note?, pr?}` | re-status | **400 if `status=resolved` and there is no `pr`**. Appends to `status_log`, sets `status_at`, and sets `resolved_pr` |
| `POST /api/dev/platform-notes/:id/shot` (multipart `file`) | attach a screenshot | image mime types only; cap the size (≈10 MB) and the count (8 per note) |
| `DELETE /api/dev/platform-notes/:id` | **UI only** | deletes the screenshots **first**, then the row |

Gate the `/api/dev/` prefix in middleware (`requireDev`: the user has `is_dev` / `is_admin` / an allowlisted
email) and mount the gate **before** the router. For Next.js, use a `middleware.ts` matcher on
`/api/dev/:path*`. For Python, use a dependency on the router (FastAPI) or a decorator (Flask/Django).

### 3.4 Screenshots

Store them wherever the app already stores uploads, tagged so they are identifiable: a `role='devnote'`
column, an S3 prefix `devnotes/<owner>/…`, or a bucket folder. Rules:

- **No link to domain data.** If your media table has a `workspace_id` FK with cascade, leave it
  **null** on devnote rows, so deleting the workspace a bug was found in cannot delete the picture of it.
- **The note deletes its screenshots first.** Nothing else points at them, so otherwise they strand:
  invisible to every gallery and reachable by nothing. (This happened.)
- The screenshot is uploaded **after** the note is created, in a second request, so a failed upload
  never loses the note text.
- If there is no storage layer yet, **ship without screenshots** and add them as a second PR.

---

## 4. Client capture

### 4.1 Gestures: exactly two

- **A keyboard chord.** MindBinder uses **⌘. / Ctrl+.**. Check it is free in your app (§0). It must work
  **inside text fields**, because the field you're standing in is often the thing you want to complain
  about. So listen on `window` for `keydown` and do not skip inputs:
  ```ts
  const isChord = (e: KeyboardEvent) =>
    (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "." || e.code === "Period");
  ```
  Call `preventDefault()` when it matches.
- **A small corner button (✎)**, so the feature can be found before the chord is habit. Put it in a
  corner that no toast or upload widget already uses.
- **Do not add Shift+right-click.** It was built, it worked, and it was cut: Firefox reserves that chord
  as its "bypass the page's context menu" escape, so it fails silently for some users, which loses the
  note exactly when the user believes they took it. It also can't be discovered, and it records nothing
  the URL doesn't.

### 4.2 The box

- Render into `document.body` (a portal in React, `<Teleport to="body">` in Vue) so no parent's
  `overflow` or `z-index` clips it.
- Focus the textarea on open. **⌘/Ctrl+Enter** saves, **Escape** closes.
- Tags are optional one-click chips, from the shared module.
- **Paste** a screenshot (`clipboardData.files`) or **drag and drop** one in, and show thumbnails.
- **The context preview line** sits under the box: `/projects/12/board · Acme Q3 · card "Fix login" ·
  1512×945`. Show exactly what will be saved.
- On save: `POST` the note, then `POST` each screenshot to `/:id/shot` (with `credentials: "include"`, or
  your CSRF header if the app uses one), then invalidate any cached notes list.
- Mount it **once**, at the app shell, inside the dev gate: `<DevGate><DevNotebook/></DevGate>`.

### 4.3 What context to capture, and from where

```ts
export interface CapturedContext {
  route: string;                        // location.pathname
  params: Record<string, string>;       // ALLOWLISTED only
  scopeId: number | null; scopeName: string | null;   // the workspace/project on screen
  itemId: string | null;  itemName: string | null;    // the record/document open on screen
  viewport: string | null;              // "WxH", or null
}
const CAPTURED_PARAMS = ["id", "tab", "view"]; // ← your coordinate params. NEVER free-text ones.
```

- **Route and params** come from `window.location`. Clip each value (200 chars).
- **Ids come from the URL; names come from the client cache already in memory** (React Query
  `queryClient.getQueryData(key)`, SWR `cache.get`, the Apollo cache, the Redux store). So capture makes
  **no network request of its own** and needs no product-code changes. **Check the real shape of each
  cached response before reading it.** The original assumed an array where the API returned an
  object map keyed by id, so every note recorded a bare id instead of a name. Nobody noticed, because
  "not found" and "cache cold" both come back as null. Handle all the shapes you find, and test them.
- **Viewport:**
  ```ts
  function readViewport(): string | null {
    const w = window.innerWidth || document.documentElement.clientWidth;
    const h = window.innerHeight || document.documentElement.clientHeight;
    return w > 0 && h > 0 ? `${w}x${h}` : null;   // hidden/embedded frames report 0 → null, never "0x0"
  }
  ```
- **State that isn't in the URL.** If a screen keeps the open item in component state (a modal, a
  side panel), give it a way to publish that item:
  ```ts
  const extras = new Map<string, unknown>();
  export function publishCaptureContext(key: string, value: unknown) {
    if (value == null) extras.delete(key); else extras.set(key, value);
  }
  // in that surface:  useEffect(() => { publishCaptureContext("openItem", item && {id:item.id, name:item.title});
  //                                    return () => publishCaptureContext("openItem", null); }, [item]);
  ```
  Any surface that skips this will record the route and nothing finer.

### 4.4 The notebook page (`/dev/notebook`)

This is a simple list of your own notes: filter by status and tag, open one to see its full context and
status history, re-status it, and **delete it**. This page is the **only** place deletion exists. Add a
link to it wherever your dev tools are listed. The original was routed, gated, working, and had no
link to it anywhere.

---

## 5. Server-side isolation, restated as checks

- Only the store module touches the table.
- Business logic, background jobs, AI and LLM pipelines, search and embedding indexers, data export, and
  tenant purge never import the store or name the table.
- Only one FK: the owner.
- No context column named like a scoping column.
- Every route sits under the gated prefix.
- The client capture sits inside the dev gate.

§7 turns each of these into an automated test.

---

## 6. Read-back: how a Claude Code session reads the notes

This is the point of the feature. Build **a CLI script that uses the project's own DB client and its
`.env`**, so a session can read notes with **no server running**. Keep the HTTP routes as a second path.

### 6.1 The CLI

`scripts/platform-notes.ts` (or `.py`/`.go`, whatever the repo's script language is):

```
npx tsx -r dotenv/config scripts/platform-notes.ts                     # open notes
npx tsx -r dotenv/config scripts/platform-notes.ts --status=all
npx tsx -r dotenv/config scripts/platform-notes.ts --tag=bug --scope=12 --surface=board --limit=20
npx tsx -r dotenv/config scripts/platform-notes.ts --id=pn_…           # one note, full context + status log

npx tsx -r dotenv/config scripts/platform-notes.ts --id=pn_… --set=read --by=claude
npx tsx -r dotenv/config scripts/platform-notes.ts --id=pn_… --set=resolved --pr=123 --note="off-by-one in pager"
npx tsx -r dotenv/config scripts/platform-notes.ts --id=pn_… --set=deferred --note="needs the auth refactor"
```

The requirements:

- **The first line is always `describeOpen` over OPEN notes**, whatever the filters are:
  `7 open dev notes, 3 tagged bug, 1 tagged perf.` It is the first thing a session reads.
- Then one line per note: `pn_ab12…  2026-09-28  [bug,uiux]  board  /projects/12/board  "The save button…"`,
  with the body truncated to about 100 characters.
- `--id=` prints everything: the body in full, tags, route, params, the scope and item (id **and**
  name), the commit SHA, viewport, user agent, screenshot ids (or URLs), and the whole status log.
- `--set=` goes through the same store function as the PATCH route, so the append-only log and the
  "resolved needs `--pr`" rule are enforced in one place. Exit non-zero on a missing PR.
- **The owner comes from `--owner=<email>`, or a `.env` var** (MindBinder uses `BYPASS_USER_EMAIL`).
  Still filter by owner.
- **There is no `--delete`, and the script never calls a delete.** Enforce this with a test (§7).
- **Never print the connection string or any keys.**
- Use a read-only replica URL if one exists, **except** for `--set`, which needs to write.

### 6.2 Adapting it to your stack

| Stack | The script uses |
|---|---|
| Postgres + Drizzle / Prisma / Knex / Kysely | the app's own `db` export (import it; do not create a second pool) |
| Supabase | `@supabase/supabase-js` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env`, plus an explicit `.eq("owner_id", …)` |
| Firebase / Firestore | `firebase-admin` with the service account JSON path from `.env`, plus `.where("owner_id","==",…)` |
| Mongo | the app's Mongoose models or the `MongoClient` from `MONGODB_URI` |
| SQLite | `better-sqlite3` against the app's db file |
| Django / Rails / Laravel | a management command / rake task / artisan command (`manage.py devnotes --status=open`) instead of a script |
| No DB (§2.6) | read `.devnotes/*.json` directly |
| DB unreachable from the session (e.g. a cloud sandbox) | the HTTP routes with a dev token, **or** a nightly export to a git-ignored file. Say which in CLAUDE.md |

### 6.3 Tell future sessions about it in CLAUDE.md

Add a short block like this to the repo's `CLAUDE.md`, so every session finds the notes without being told:

```md
## Dev notebook (developer feedback captured in-app)
The developer files notes while using the app (⌘. / Ctrl+. anywhere, or the ✎ button).
Read them at session start when the task is open-ended, or when asked "what's on the list":
  npx tsx -r dotenv/config scripts/platform-notes.ts            # open notes
  npx tsx -r dotenv/config scripts/platform-notes.ts --id=<id>  # one note with full context
When you pick one up: --set=read --by=<session>. When your PR fixes it: --set=resolved --pr=<n> --note="…".
🔴 Never delete a note (the CLI can't). Use --set=wontfix / --set=duplicate with a --note.
The table is NOT app data: never read it from app code, pipelines, search, or exports.
```

---

## 7. Tests to add (they are what make the rules real)

A test fails the build; a comment does not. Add these, in whatever runner the repo uses:

**Pure logic** (`platform-notes.test`):
- `normalizeTags` drops unknown tags, dedupes, and orders.
- `surfaceForRoute`: one case per rule, plus `null` gives `"unknown"` and an unmatched route gives
  `"other"`, and the more specific rules win.
- `appendStatus`: the cap keeps the first entry and the latest entries.
- `positiveIntOrNull`: `null`, `undefined`, `""`, `"0"`, `0`, `-1`, `1.5` and `"abc"` all give null;
  `"12"` and `12` give 12.
- `describeOpen` wording.
- The cache-shape reader for names: **every** response shape you found (array, object map, `{items}`),
  plus a cold cache.
- `readViewport`: 0×0 gives null.

**Isolation** (`platform-notes-isolation.test`): these read source files as text, which is cheap and
effective.
- No file under the business-logic / pipeline / search / export / purge directories imports the store
  or names the table.
- The migration's only `REFERENCES` is the users table, and it cascades.
- No column is named like a scoping column (`workspace_id` etc.). Only the `ctx_` form exists.
- The CLI source contains no `delete(` call and no `--delete` flag, **and** the route file still has
  its delete, so the UI keeps the ability.
- Every notebook route path starts with `/api/dev/`, and that prefix really is in the gated list.
- The capture component is mounted inside the dev gate.

**The resolve rule:** PATCH or `--set=resolved` with no PR gives 400 or a non-zero exit.

---

## 8. What the original smoke test caught (check for these on purpose)

Each of these was a **plausible-looking wrong value**, not a crash:

1. **The cached list was an object map, not an array.** Every note recorded a bare id instead of a
   name, forever. (§4.3)
2. **`viewport: "0x0"`** from a hidden or embedded frame. Layout bugs depend on width, so that reads as
   a measurement. Store null. (§4.3)
3. **`Number(null) === 0`** made every note captured off-project record `scope_id = 0`. Use
   `positiveIntOrNull`. (§3.2)
4. **Deleting a note orphaned its screenshots.** Delete the assets first, scoped to the owner. (§3.4)
5. **The notebook page had no link to it.** It was routed, gated, working, and invisible. (§4.4)
6. **A doc cited a script name that never shipped.** Make sure the handoff, CLAUDE.md and the real
   script names agree.

To smoke test it, run the app, capture a note from **three different screens** (one with no scope in the
URL, one with a scope, one with an item open), attach a pasted screenshot, then run the CLI with
`--id=` on each note and read every field. Then re-status one to `resolved` without `--pr` (it must
fail), with `--pr` (it must succeed and append to the log), and delete one from the UI (its screenshot
must return 404 afterwards).

---

## 9. Acceptance checklist

- [ ] §0 answers written in the PR body (stack, migration mechanism, next free migration, auth/dev gate, cache, storage, host SHA var, collisions, free chord)
- [ ] Table/collection created, additive; owner FK only; `ctx_` context columns; indexes
- [ ] Shared vocabulary module (tags, statuses, `surfaceForRoute`, `appendStatus`, `positiveIntOrNull`, `describeOpen`)
- [ ] `buildCommitSha()` returns a real SHA on the deployed host (check one note's `commit_sha` in prod)
- [ ] Store module; routes under the gated `/api/dev/` prefix; owner-scoped; resolve-needs-PR
- [ ] Capture: the chord works inside inputs; corner button; portal; ⌘↵ / Esc; paste and drop screenshots; context preview line
- [ ] Context: allowlisted params; names from the cache (shapes tested); viewport null when unknown; `publishCaptureContext` on surfaces with non-URL state
- [ ] `/dev/notebook` page with the only delete, linked from dev tools
- [ ] CLI: opener line, filters, `--id`, `--set` (resolve requires `--pr`), **no delete**, never prints secrets
- [ ] CLAUDE.md block added (§6.3)
- [ ] Pure, isolation and resolve-rule tests, enrolled in CI
- [ ] Smoke test across three screens done (§8), with results in the PR

---

## 10. Out of scope (do not build these unless asked)

- A triage workflow, assignees or priorities. `status` plus the log is enough.
- Notifications, or sending notes to Slack or GitHub Issues. (A later `--export-issue` is easy if wanted.)
- An AI agent **writing** notes into this table. If an agent needs a scratchpad, give it a separate
  table with a different name (rule 1).
- Letting non-developer users file feedback into this table. User feedback is a product feature with
  different privacy and moderation needs, so give it its own table.
