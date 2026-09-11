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

**Profile Pic Generator** (`/tools/profile-pic/`)
| Method | Path | Notes |
|--------|------|-------|
| `GET`  | `/.netlify/functions/outpaint?w=&h=` | Probe: `{ready, provider, label, estimatedUsd}` — the tool asks before offering the button |
| `POST` | `/.netlify/functions/outpaint` | `{image, mask, prompt?, provider?}` (both data URLs) → `{image, provider, estimatedUsd, ms}` |
| `POST` | `/.netlify/functions/outpaint?dry=1` | Returns the input unchanged — exercises the client path without a key or a cent |

Generative torso extension for chest-cropped headshots. Provider-agnostic: `flux` (BFL,
the default recommendation), `gemini`, `stability`, `fal`. Which one runs comes from
`OUTPAINT_PROVIDER`, or from whichever key is present. **With no key set it returns 501
naming the variable to add** — nothing here spends anything on its own, and the client
only calls it on an explicit click. Results are cached in the browser (IndexedDB, keyed
by a hash of the exact bytes sent), so a re-render never pays twice. The reasoning behind
the default is in `docs/dispatch/01-outpaint-provider-comparison.md`.

Note: `ANTHROPIC_API_KEY` cannot serve this — the Anthropic API does not generate or
edit images.

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
   - `ANTHROPIC_API_KEY` — used by `copy` and `claude`
   - one image key for `outpaint` *(optional, feature is off without it)* —
     `BFL_API_KEY` (recommended), `GEMINI_API_KEY`, `STABILITY_API_KEY` or `FAL_KEY`,
     plus `OUTPAINT_PROVIDER` if more than one is set
   - `ALLOWED_ORIGIN` *(optional)* — lock CORS for the `/api/*` functions (defaults to `*`)
2. **Blobs** — `agents` and `sessions` use `@netlify/blobs`, which is zero-config on Netlify.
3. **Function timeout** — bump to 26s (the AI calls can be slow) under Functions settings.
4. Push; Netlify installs deps from the repo-root `package.json` and bundles the functions.

## GitHub Pages note

Static tools can live on GitHub Pages, but **these functions only run on Netlify**.
Each tool reaches them via a configurable backend base (stored in `localStorage.cb_backend`):
empty = same-origin (Netlify), or set it to the Netlify origin to call from Pages.
