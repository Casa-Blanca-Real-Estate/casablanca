# The Wix Studio agent site template — what it contains, and what still needs capturing

Reference for the port of the agent sites off Wix Studio onto the `agents/` pipeline.
Sample site read: `casablancare2020.wixstudio.com/sam-valk` (Sam Valk, partly filled).

**Everything in §1–§3 was extracted from the live pages, September 2026.** The template is a
Wix Thunderbolt (React) site rendered from a JSON model — ~1.1MB of HTML per page wrapping
roughly 700–1,500 characters of actual copy. Don't clone the output; rebuild the design.

---

## 1. Structure

**Pages:** Sales (home) · Buyer's Guide · About · Deals. Plus a popup and several unnamed
`blank-*` pages in the site model that appear unused.

**Nav:** `SALES · BUYER'S GUIDE · ABOUT`, an `INQUIRE` CTA, and a `Menu` / `Close` pair for the
mobile drawer.

**Shared block repeated at the bottom of every page** — this is most of the template:

1. `DROP ME A NOTE` — phone, email, `Instagram | StreetEasy`
2. Agent identity — name, `Licensed Real Estate Agent`, **`Lic. #:`** licence number
3. **A contact form** — First name · Last name · Phone · Email · Subject · Message (200 char
   limit) · Submit. All marked required.
4. CTA — `START YOUR HOME SEARCH. CHANGE YOUR LIFE.`
5. Agent name, `Casa Blanca Real Estate`
6. Legal — `ACCESSIBILITY STATEMENT · TERMS & CONDITIONS · PRIVACY POLICY`, `© 2026 CASA BLANCA
   REAL ESTATE`
7. Social — `FOLLOW · INSTAGRAM · LINKEDIN`

**About:** intro block, `MEET SAM` bio, contact line, `MEET THE TEAM` with per-member cards.
**Deals:** `SAM'S PAST DEALS` — per deal: address with unit, square footage, sale price.
**Buyer's Guide:** a heading plus the PDF viewer; body copy is still Wix placeholder.

### Fields the current `agents/data/*.json` schema is missing

Licence number · past deals (address, unit, sq ft, price) · LinkedIn · StreetEasy (present) ·
buyer's-guide PDF reference · team members · the legal pages · per-page SEO fields ·
custom domain · publish state.

## 2. Third-party pieces

- **The PDF viewer is a Wix App Market product** — "PDF: View with 3D Flip Effects" /
  "PDF 3D Flipbook" (`appDefinitionId 3495efc2-56a9-41e9-bb3c-8c9b3b3ab501`), an iframed TPA.
  That is why its behaviour can't be controlled from Wix Studio. Self-hosted this becomes PDF.js
  and we own every pixel.
- **Wix Pro Gallery** is also in use.
- Images come off `static.wixstatic.com` as AVIF with generated `srcset`. We need our own
  optimisation step (Netlify Image CDN or build-time variants).
- Fonts: the template uses fonts uploaded to Wix (`static.wixstatic.com/ufonts/...`) plus Wix
  editor defaults. We own Object Sans already — but see the defect list below.

## 3. Responsive and motion

- **Three breakpoints, Wix Studio's stock set:** `≤750px`, `751–1000px`, `>1000px`. Two media
  queries reproduce it.
- **Motion is all stock Wix effects, not bespoke:** parallax (`parallaxSpeed: 1.5`), `ImageReveal`,
  and CSS-based time animations (their `motionTimeAnimationsCSS` flag is on). Reproducible with
  CSS `animation-timeline: view()` plus IntersectionObserver; Lenis (~3KB) if the weighted-scroll
  feel needs explicit control.

## 4. Known defects in the existing `agents/` prototype

Verified by building and rendering `agents/claire-dubois/` in Chromium.

- **The brand font never loads.** `template.html` requests `assets/fonts/ObjectSans-*.woff2`;
  the repo only has `.otf`. Pages silently fall back to DM Sans pulled from Google Fonts — which
  also breaks the "never link fonts externally" constraint.
- **Photos don't work.** `build.js` computes a photo path and never uses it; every agent renders
  as initials on a gradient. `agents/photos/` does not exist.
- **`build.js` does no HTML escaping.** An `&` or `<` in a bio breaks the page or injects markup.
- **The footer is unstyled** — raw bullet lists, `ig in se` where social icons belong, overlapping
  the CTA section.
- Testimonial initials produce `S&` from "Sarah & Leo W.". The "See all agents" button is
  invisible, light on light.
- Content is placeholder and factually wrong: "serving New York City since 2006" (founded
  February 2019), `© 2025`, `hello@casa-blanca.com`, neighbourhoods unrelated to the agent.
- Reveal animations hold content at `opacity: 0` until JavaScript runs. Fragile — reveals should
  animate from a visible baseline.
- The design is a generic real-estate template with a text wordmark instead of the CB mark. It
  has nothing to do with the Wix template. **Keep the pipeline, replace the design.**

*Not* defects, despite first appearances: the hero and the count-up stats render fine in a real
browser — they only looked broken in screenshots taken mid-animation.

---

## 5. What still needs capturing — Kimani's pass through Wix Studio

Structure and copy are covered above. What can't be read off the served HTML is motion, hover
state, and the editor's own values. One pass, so it doesn't need repeating:

**Per page** (Sales, Buyer's Guide, About, Deals) — full-page capture at **1440px, 900px, 390px**.

**States:**
- Nav closed, and the mobile drawer open
- Hover on: nav links, the `INQUIRE` CTA, `SUBMIT`, deal rows, team cards
- Form: empty, focused field, a validation error, the post-submit confirmation
- The PDF viewer: initial, opened, mid-page-turn
- **Scroll-mid captures** of any parallax section — a full-page screenshot flattens the effect

**Motion:** a short screen recording of one full scroll per breakpoint beats any number of stills.

**The known pain points** — capture these deliberately, they're the reason for the port:
- The section title aligned to the square vector, at all three widths
- Anything else that looks wrong in Wix and can't be fixed there

**From the editor, if quick:** the text style panel (font names, sizes, weights per breakpoint),
breakpoint settings, and any stack/grid spacing values.

**Assets:** original images at full resolution, the buyer's-guide PDF, and the wordmark file the
template uses.
