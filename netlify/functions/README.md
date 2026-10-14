# Casa Blanca tools backend (Netlify Functions)

One backend, one set of keys, shared by every tool on the platform. Functions are
Netlify v2 (Web `Request`/`Response`), ESM. The static tools can be served from
GitHub Pages and call these functions on the Netlify origin (CORS is open).

## Endpoints

**Editorial Carousel Builder** (`/tools/carousel/`)
| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/import` | Firecrawl v1 scrape+extract → `{ facts, photos[] }` |
| `POST` | `/api/copy`   | Claude (Opus 4.8, structured) → `{ coverSubhead, teaser, slides[] }` |
| `GET`  | `/api/img?u=` | CORS image proxy so photos can be drawn to canvas |

**Closed Carousel Builder** (`/tools/closed-carousel/`)
| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/.netlify/functions/streeteasy` | Firecrawl v1 extract → `{address,neighborhood,price,description,heroImage}` |
| `POST` | `/.netlify/functions/claude`     | Generic Anthropic Messages proxy (passes the request body through) |
| `GET/POST/DELETE` | `/.netlify/functions/agents`   | Agent headshot library (Netlify Blobs store `agents`) |
| `GET/POST` | `/.netlify/functions/sessions` | Saved sessions (Netlify Blobs store `cb-sessions`, last 3) |

**Brand Assets** (`/tools/brand/`)
| Method | Path | Notes |
|--------|------|-------|
| `GET`  | `/.netlify/functions/brand` | List asset metadata (no file bytes; colors include hex) |
| `GET`  | `/.netlify/functions/brand?file=KEY` | Raw bytes for one file asset (for `<img>` / download) |
| `GET`  | `/.netlify/functions/brand?key=KEY` | Full metadata JSON for one asset |
| `POST` | `/.netlify/functions/brand` | Add an asset — file: `{name,category,src(dataURL),filename}`; color: `{name,category:"color",hex}` |
| `DELETE` | `/.netlify/functions/brand` | `{key}` — remove an asset |

Categories: `logo`, `font`, `color`, `guideline`, `template`, `other`. Stored in Netlify
Blobs store `brand`. Logos, the Object Sans fonts and the palette ship as static
repo files (built-ins shown alongside live ones); dev-added assets persist in Blobs
and propagate to everyone.

**Agent CMS** (`/tools/agent-cms/`)

| Method | Path | Notes |
|--------|------|-------|
| `GET`  | `/.netlify/functions/agent-store` | Roster of every agent record (summaries) |
| `GET`  | `/.netlify/functions/agent-store?slug=X` | One full record — `{slug,status,draft,live,previewToken,…}` |
| `GET`  | `/.netlify/functions/agent-store?slug=X&preview=TOKEN` | **Read-only, no CMS token.** One agent's draft, for a shareable preview link |
| `POST` | `/.netlify/functions/agent-store` | `{action}` — `create`, `save`, `publish`, `status`, `rotatePreview`, `revertDraft` |
| `DELETE` | `/.netlify/functions/agent-store` | `{slug}` — remove a record |
| `POST` | `/.netlify/functions/agent-copy` | AI autofill, Haiku, fixed task set: `bio`, `seo`, `specialties`, `testimonial` |

Stored in Netlify Blobs store `cb-agents`, one key per slug plus an `_index` key
(`list()` is eventually consistent; a per-key `get` is not). Each record holds a `draft`
the CMS edits and a `live` snapshot the build renders — the build reads `live`, never
`draft`, and only when `status === "live"`.

**Both of these require `Authorization: Bearer $CB_CMS_TOKEN` on every request, reads
included** (the records carry agents' direct phone numbers and emails). With `CB_CMS_TOKEN`
unset the functions return 503 to everything rather than falling open. The only exception is
the per-agent `preview` token above, which is read-only and scoped to one agent.

**This is a shared secret, not authentication** — it says *authorised*, never *who*, and
anyone holding it can edit any agent. Read `docs/agent-cms/security-model.md` before
pointing a second person at it.

Env: `CB_CMS_TOKEN` (required), `NETLIFY_BUILD_HOOK` (optional — POSTed on publish and on
suspend/restore; without it the CMS says plainly that nothing rebuilt).

**Profile-pic roster** (`/tools/profile-pic/#roster`, Dispatch 12)

| Method | Path | Notes |
|--------|------|-------|
| `GET`  | `/.netlify/functions/agent-pics` | Every agent in `cb-agents`: name, title, the derived photo status, placements. No contact details |
| `GET`  | `/.netlify/functions/agent-pics?slug=X` | One agent's photo side |
| `POST` | `/.netlify/functions/agent-pics` | `{action:"update", slug, pic?, placements?}` — writes those two groups and nothing else |

It writes `pic` and `placements` onto the same `cb-agents` records, beside `draft` and `live`
rather than in them, so Publish can't carry them to a site. **Every request needs
`Authorization: Bearer $CB_PICS_TOKEN`**, a second token: it can't create, publish or delete an
agent or change anything outside those two groups, and `agent-store` refuses it. With it unset,
or equal to `CB_CMS_TOKEN`, the function refuses everything. Both functions read the store with
strong consistency, so neither writes a cached copy back over the other's change. Code, tests
and the one-time import: `tools-src/agent-pics/`.

**Home page live content** (`/`)
| Method | Path | Notes |
|--------|------|-------|
| `GET`  | `/.netlify/functions/site` | `{ workshop, changelog }` (strongly-consistent single-blob read) |
| `POST` | `/.netlify/functions/site` | Update: `{workshop}` (full object), `{entry}` (prepend a changelog entry), `{changelog}` (full array), or `{deleteChangelogDate}` |

Stored in Blobs store `cb-site` under key `config`. The home page hydrates the next-workshop
card and the "What's new" changelog from this on load and falls back to the inline JSON
blocks in `index.html` if the backend is unreachable. Signed-in devs edit both in-platform.

**Team Feedback button** (every studio page, `assets/feedback.js`)
| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/.netlify/functions/feedback` | `{name?, email?, message, tool?}` → `{ok:true}`. Open to anyone, CORS `*` (the tray posts cross-origin from GitHub Pages). Message up to 4,000 characters; the other fields are clipped to 200 |
| `GET`  | `/api/dev/notebook/feedback` | The dev notebook: every submission, newest first, each with an `id` and the `note` made from it (or `null`). A signed-in developer gets the emails; a notebook key never does |
| `POST` | `/api/dev/notebook/feedback/<id>/note` | **Signed-in developers only:** turns one submission into a dev note, once (409 with the note after that). The note carries the name, not the email |

The function itself answers nothing but `POST` (and its preflight): until 2026-09-29 a `GET` on it
returned the whole list, names and emails included, to anyone. Code in `tools-src/feedback/`. Stored
in Blobs store `cb-feedback`, one key per submission (`items/<time>-<random>`), so two sent at
once can't overwrite each other; the old single `list` key is still read, no longer written.

## Propagation note (important)

Live edits (brand assets, workshop, changelog) are written to Netlify Blobs by the
Functions above, so they only reach visitors who load the site **from the Netlify origin**
(same origin as the functions). If the site is also served from GitHub Pages, those
visitors will see only the static repo content (built-in logos/fonts/palette + the inline
workshop/changelog defaults) — `/.netlify/functions/*` does not exist there. To have
in-platform edits reach everyone, point agents at the Netlify URL (or set
`localStorage.cb_backend` to the Netlify origin on the Pages site).

## Setup (one time)

1. **Environment variables** — Netlify → Site settings → Environment variables:
   - `FIRECRAWL_API_KEY` — used by `import` and `streeteasy`
   - `ANTHROPIC_API_KEY` — used by `copy`, `claude` and `agent-copy`
   - `CB_CMS_TOKEN` — shared secret for `agent-store` and `agent-copy`. Generate a long
     random string (`openssl rand -hex 32`); the CMS prompts for it and holds it per tab.
   - `CB_PICS_TOKEN` — the profile-pic roster's own token for `agent-pics`. Generate it the
     same way; it must differ from `CB_CMS_TOKEN`.
   - `NETLIFY_BUILD_HOOK` *(optional)* — build hook URL so publishing rebuilds the site
   - `ALLOWED_ORIGIN` *(optional)* — lock CORS for the `/api/*` functions (defaults to `*`)
2. **Blobs** — `agents` and `sessions` use `@netlify/blobs`, which is zero-config on Netlify.
3. **Function timeout** — bump to 26s (the AI calls can be slow) under Functions settings.
4. Push; Netlify installs deps from the repo-root `package.json` and bundles the functions.

## GitHub Pages note

Static tools can live on GitHub Pages, but **these functions only run on Netlify**.
Each tool reaches them via a configurable backend base (stored in `localStorage.cb_backend`):
empty = same-origin (Netlify), or set it to the Netlify origin to call from Pages.
