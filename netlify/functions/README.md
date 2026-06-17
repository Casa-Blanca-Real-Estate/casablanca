# Casa Blanca tools backend (Netlify Functions)

These functions back the carousel builder in `tools/carousel/`. The tool itself is
static (it runs fine on GitHub Pages); these endpoints hold the secrets and do the
work that can't run in the browser.

## Endpoints

| Method | Path          | What it does |
|--------|---------------|--------------|
| `POST` | `/api/import` | `{ url }` → scrapes a StreetEasy (or similar) listing via **Firecrawl**, returns `{ facts, photos[] }`. |
| `POST` | `/api/copy`   | `{ facts, status, slides[] }` → **Claude (Opus 4.8)** writes Casa Blanca editorial copy: `{ coverSubhead, teaser, slides[] }`. |
| `GET`  | `/api/img?u=` | Proxies a listing photo with permissive CORS so the browser can draw it onto the canvas without tainting it (StreetEasy's CDN otherwise blocks canvas export). |

## Setup (one time)

1. **Environment variables** — Netlify → Site settings → Environment variables:
   - `FIRECRAWL_API_KEY` — your Firecrawl key
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `ALLOWED_ORIGIN` *(optional)* — e.g. `https://kjcamron.github.io` to lock CORS down (defaults to `*`)
2. **Function timeout** — `/api/copy` calls Claude with adaptive thinking; bump the
   function timeout to 26s (Netlify → Site settings → Functions) so it never clips a slow response.
3. Push to the branch Netlify builds. Netlify installs `@anthropic-ai/sdk` from the
   repo-root `package.json` and bundles the functions automatically.

## Notes

- Functions are Netlify v2 (Web `Request`/`Response`), ESM, routed via `export const config = { path }`.
- Firecrawl is called at `v2/scrape` with a JSON-extraction schema. If your account is on a
  different API version, adjust the URL/format in `import.mjs`.
- The model is pinned to `claude-opus-4-8`. Change it in `copy.mjs` if needed.
