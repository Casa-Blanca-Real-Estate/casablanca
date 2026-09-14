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
pointing a second person at it. `agent-store` is pinned to `node_bundler = "none"` in
`netlify.toml` because it imports `@netlify/blobs`.

Env: `CB_CMS_TOKEN` (required), `NETLIFY_BUILD_HOOK` (optional — POSTed on publish and on
suspend/restore; without it the CMS says plainly that nothing rebuilt).

**Home page live content** (`/`)
| Method | Path | Notes |
|--------|------|-------|
| `GET`  | `/.netlify/functions/site` | `{ workshop, changelog }` (strongly-consistent single-blob read) |
| `POST` | `/.netlify/functions/site` | Update: `{workshop}` (full object), `{entry}` (prepend a changelog entry), `{changelog}` (full array), or `{deleteChangelogDate}` |

Stored in Blobs store `cb-site` under key `config`. The home page hydrates the next-workshop
card and the "What's new" changelog from this on load and falls back to the inline JSON
blocks in `index.html` if the backend is unreachable. Signed-in devs edit both in-platform.

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
   - `NETLIFY_BUILD_HOOK` *(optional)* — build hook URL so publishing rebuilds the site
   - `ALLOWED_ORIGIN` *(optional)* — lock CORS for the `/api/*` functions (defaults to `*`)
2. **Blobs** — `agents` and `sessions` use `@netlify/blobs`, which is zero-config on Netlify.
3. **Function timeout** — bump to 26s (the AI calls can be slow) under Functions settings.
4. Push; Netlify installs deps from the repo-root `package.json` and bundles the functions.

## GitHub Pages note

Static tools can live on GitHub Pages, but **these functions only run on Netlify**.
Each tool reaches them via a configurable backend base (stored in `localStorage.cb_backend`):
empty = same-origin (Netlify), or set it to the Netlify origin to call from Pages.
