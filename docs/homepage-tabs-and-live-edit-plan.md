# Plan: Tabbed homepage + dev live-edit (workshop / changelog / links)

This is the design for the two pieces deliberately **left as a plan** so they don't
collide with in-flight `index.html` edits in another session. The Brand Assets
section (`tools/brand/` + `netlify/functions/brand.mjs`) is already built and shipped
separately; this doc covers the homepage restructure and live-editable content.

## 1. Tabbed Creative Studio homepage

Goal: turn the flat grouped homepage into tabs so the most-used tools are front and
center and the rest are one click away.

Proposed tabs:
- **Home** — most common things agents need (Editorial / Closed / For Sale carousels + the workshop card).
- **Instagram & Content** — all social/content tools.
- **Internal Tools** — Business Card, Watermarker, ordering guide, etc.
- **Brand** — embeds or links to the Brand Assets page (`tools/brand/`). Cheapest: a prominent card/link; richer: iframe or move the brand tab content inline.
- **Members** — current dev-only section, shown when signed in.

Implementation notes (keep it framework-free, matching the current site):
- Reuse the tab pattern already written in `tools/brand/index.html` (sticky `.tabs`
  bar + `.panel`/`.panel.on` toggling, `#hash` deep-linking). Lift that CSS/JS so the
  two pages feel identical.
- Keep each tool a `.tool` card exactly as today — only the *grouping* changes from
  `<div class="group">` headers to tab panels.
- Preserve the existing `#members` show/hide-on-auth logic and the workshop +
  changelog script blocks.
- Add a visible **Brand Assets pill** in the header (`<header>`) as a fast path, in
  addition to the tab.

## 2. Dev live-edit that propagates to everyone

Today the workshop card and changelog are static JSON blocks in `index.html`
(`#workshop-data`, `#cl-data`) — editing them needs a redeploy. To let a signed-in
dev edit them in-platform and have everyone see it, back them with Netlify Blobs,
mirroring the `brand` / `agents` functions.

New function `netlify/functions/site.mjs` (store `cb-site`):
- `GET /.netlify/functions/site` → `{ workshop:{...}, changelog:[...] }` (returns
  defaults if unset).
- `POST` (dev only by convention) → `{ workshop }` and/or `{ changelog }` to update.
- No real auth on the backend (matches the rest of the platform — the email gate is
  UX only). If stronger control is wanted later, add a shared secret header.

Homepage wiring:
- On load, `fetch` `site` and hydrate the workshop card + changelog from it; fall
  back to the inline JSON blocks if the backend is unreachable (progressive
  enhancement, so the page never breaks).
- When signed in, render small **Edit** affordances on the workshop card and the
  "What's new" modal that open a tiny inline form and `POST` the change. After save,
  re-fetch so the editor sees the live result.

### Reusable building blocks already in the repo
- Blobs CRUD pattern: `netlify/functions/agents.mjs` and the new
  `netlify/functions/brand.mjs`.
- Auth check (client-side email gate): `assets/studio-header.js` / the `ALLOWED`
  array in `index.html`.
- Backend base resolution: `localStorage.cb_backend` (empty = same origin).

## Suggested order
1. Land Brand Assets (done).
2. Add `site.mjs` + hydrate workshop/changelog from it (no visual change yet).
3. Add dev Edit forms for workshop + changelog.
4. Restructure homepage into tabs, adding the Brand tab + header pill last so it's a
   single, easy-to-rebase change.
