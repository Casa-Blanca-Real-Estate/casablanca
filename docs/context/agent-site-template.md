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

### Fields the prototype schema was missing

Licence number · past deals (address, unit, sq ft, price) · LinkedIn · buyer's-guide PDF
reference · team members · per-page SEO fields · custom domain · publish state.

All of these now exist — see **`agents/SCHEMA.md`**, which is the contract. Still not carried:
the legal pages (Accessibility / Terms / Privacy), which are brokerage-level rather than
per-agent, and the contact form, which is Slice 5.

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

**Fixed in Slice 0** (dispatch 02) — kept here as the record of what the prototype shipped with:

- ~~**The brand font never loads.**~~ `.otf` converted to `.woff2`, self-hosted, Google Fonts link
  dropped from both templates. Verified in Chromium: both faces fetch 200, nothing goes off-site.
- ~~**Photos don't work.**~~ `agents/photos/` exists and is wired; initials on a gradient are now
  the *documented* fallback for the (common) case of an agent with no photo.
- ~~**`build.js` does no HTML escaping.**~~ Everything escapes by default; only markup the build
  itself assembled can be emitted raw. Covered by `agents/build.test.js`.
- ~~Testimonial initials produce `S&` from "Sarah & Leo W."~~ — initials skip punctuation.
- ~~Content is placeholder and factually wrong~~ — the five fictional agents are deleted, and the
  footer carries the real founding year (2019), the real HQ, and the current year.
- Also fixed, and not previously listed: `build.js` could not run at all. `package.json` sets
  `"type": "module"` and the script was CommonJS, so `node agents/build.js` threw on line 4.

**Still open — these are the visual port's (Slices 2–3):**

- **The footer is unstyled** — raw bullet lists, `ig in se` where social icons belong, overlapping
  the CTA section. Untouched by Slice 0; the content is now correct, the styling is not.
- The "See all agents" button is invisible, light on light.
- Reveal animations hold content at `opacity: 0` until JavaScript runs. Fragile — reveals should
  animate from a visible baseline.
- Nav and footer links point into `index.html`, which is the internal Creative Studio dashboard,
  not a public site. The public-facing IA has to be decided with the port.
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

---

## 6. The source of truth for a faithful port is the CSS, not the screenshots

The served pages carry **~670KB of inline CSS** — 169 `font-size` declarations, 232 `@media`
blocks, 187 `grid-template-*` declarations, and the real `letter-spacing` values
(`-0.04em`, `-0.5px`, `1px`, `5px` …). Every number the Wix editor is holding is already in the
page, per breakpoint.

So don't reconstruct type scale, spacing, or grid behaviour by eye from a PNG. Extract the actual
declarations for the elements being ported and use those; the screenshots are the **visual
acceptance check**, and the record of what CSS can't express — motion, hover, focus, the iframed
PDF app, and what "correct" is supposed to feel like.

Practical method: fetch the page, pull the `<style>` blocks, find the element's class in the
rendered DOM, and read its rules at each of the three breakpoints. A headless Chromium pass over
the live page can dump computed styles if the cascade gets hard to follow by hand.

**On Claude Design:** it earns its place on the *deltas* — the refinements Kimani wants that Wix
couldn't do (the section-title-to-square-vector treatment, anything new) — where iterating by eye
beats describing in prose. For faithful reproduction it adds a lossy hop: artboards are
fixed-width static compositions and can't express `clamp()`, container queries, scroll-linked
motion, or hover state, which is precisely where past clone attempts have fallen down. Port from
the CSS; design the changes.
