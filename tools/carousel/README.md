# Casa Blanca — Editorial Carousel Builder

A browser-based, **single-file HTML** tool for building Casa Blanca's single-property
editorial Instagram carousels. One listing → a multi-slide editorial post, rendered to
1080×1350 PNGs.

`cb_editorial.html` is the deployable. Open it directly in a browser — no build step,
no server, works fully offline. Everything (CSS, JS, brand fonts, wordmark) is embedded
as base64 in the one file.

---

## What it does

- **Cover + six middle slide kinds**, each matching the spec
  (`SINGLE_EDITORIAL_LISTING_BUILDER_Positions`):

  | Kind | Image frame | Description | Wordmark |
  |---|---|---|---|
  | **Cover** | 1080×1076 @ Y=161 | badge above (35→30pt), subhead over image (14–20pt, LS 85%) | black, centered @ Y=1277 |
  | **Teaser** (Closed) | 1080×720 @ Y=290 | header 12pt @ X=57 Y=48, desc @ Y=1050 | black @ X=666 |
  | **Single A** | 972×650 @ Y=220 | desc @ Y=928 | black @ X=666 |
  | **Single B** | 1034×1306 centered | flex overlay text (white/accent) | white @ X=50 Y=50 |
  | **Double A** | two 972×520 @ Y=54 / Y=760 | desc centered in the gap | none |
  | **Building / Neighborhood** | 972×705 @ Y=54 | bold label + name @ Y=785, desc @ Y=900 | black @ X=666 |

- Body text: 10pt / 11pt line height, letter-spacing −0.05em (VA −50), `#191919`, X=53,
  width 974, justified — per spec. (Scale: 1 InDesign pt → 3 canvas px.)

### Interactions
- Click any text or photo on the canvas to focus its editor field.
- Drag a photo to reposition within its frame; zoom slider for the active photo.
- Click an empty frame to pick an image.
- Filmstrip thumbnails with drag-to-reorder (cover is locked first).
- Add-slide buttons: + Teaser / + Single A / + Single B / + Double A / + Building / + Neighborhood.
- Placeholder toggle ghosts unfilled fields at 40%.
- Inline **Bold** for emphasis (price, agent name, lead phrases) in any description.
- Download one slide or all slides as PNGs (untainted — all assets are inline base64).

---

## Architecture (non-negotiable, matches the Casa Blanca tool stack)
- Single-file HTML. No frameworks, no bundler, no `node_modules`.
- Vanilla JS + Canvas rendering.
- Brand fonts (Object Sans 400/800) embedded as base64 OTF.
- Wordmark embedded as base64; recolored on the fly (black on white slides, white on Single B).
- No backend calls in the core flow — fully offline.

The render/interaction infrastructure (dispatcher, `HITS` hit-detection, pointer pan,
filmstrip, editor builder) is lifted from the proven `listing_carousel_builder.html`
sibling tool; only the slide kinds were swapped for the editorial layouts.

---

## Deploy

### GitHub Pages (chosen)
1. Repo **Settings → Pages → Build and deployment → Deploy from a branch**.
2. Branch: `main` (or this feature branch), folder: **/ (root)**.
3. The repo root already includes `.nojekyll` so files serve verbatim.
4. Tool URL: `https://<owner>.github.io/casablanca/tools/carousel/cb_editorial.html`

### Netlify drag-and-drop (parity with the sibling tools)
The file is self-contained — drag `cb_editorial.html` onto Netlify, or drop this folder.
No `netlify.toml` required for a single static file.

---

## Known discrepancy to confirm
The **cover badge** renders at the spec size (35pt max → 30pt min). In the reference
`Cover_Slide_-_CLSD.png` the "CLOSED" badge appears visibly larger (roughly half-again).
Current build follows the written spec; bumping the max is a one-line change if you'd
rather match the reference PNG exactly.

---

## Roadmap — tool consolidation
This is step one. The plan is to fold the three sibling tools — **Editorial**,
**Just-Listed** (`listing_carousel_builder`), **Closed** — into one builder with a
top-level template selector that swaps the slide registry, badges, and add-buttons.
The reference template already carries a `BADGES = {editorial, announcement}` seed to
build on. Editorial was finished standalone first to avoid regressing the proven
interaction wiring.
