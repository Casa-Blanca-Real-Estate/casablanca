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

## Setup (one time)

1. **Environment variables** — Netlify → Site settings → Environment variables:
   - `FIRECRAWL_API_KEY` — used by `import` and `streeteasy`
   - `ANTHROPIC_API_KEY` — used by `copy` and `claude`
   - `ALLOWED_ORIGIN` *(optional)* — lock CORS for the `/api/*` functions (defaults to `*`)
2. **Blobs** — `agents` and `sessions` use `@netlify/blobs`, which is zero-config on Netlify.
3. **Function timeout** — bump to 26s (the AI calls can be slow) under Functions settings.
4. Push; Netlify installs deps from the repo-root `package.json` and bundles the functions.

## GitHub Pages note

Static tools can live on GitHub Pages, but **these functions only run on Netlify**.
Each tool reaches them via a configurable backend base (stored in `localStorage.cb_backend`):
empty = same-origin (Netlify), or set it to the Netlify origin to call from Pages.
