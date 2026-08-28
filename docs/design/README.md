# Casa Blanca Creative Studio — Design Briefs

**Start here.** This folder is the handoff pack for redesigning the Creative Studio's
interfaces. It is written for a designer (human or AI) who has read access to this repo
and will produce a redesign package that gets wired back into the real code.

Read this file first — it carries the product context, the brand system, the hard
technical constraints, and the deliverable contract that apply to **every** surface.
Then read the one surface brief you're working on.

## Surfaces

| # | Surface | Brief | Lives at | State |
|---|---------|-------|----------|-------|
| 1 | Creative Studio dashboard (home) | [`surfaces/01-dashboard.md`](surfaces/01-dashboard.md) | `index.html` | **Redesigned and shipped** (2026-08-28) |
| 2 | Editorial Carousel Builder | [`surfaces/02-editorial-carousel-builder.md`](surfaces/02-editorial-carousel-builder.md) | `tools/carousel/cb_editorial.html` | Briefed |
| 3 | Closed Carousel Builder | [`surfaces/03-closed-carousel-builder.md`](surfaces/03-closed-carousel-builder.md) | `tools/closed-carousel/` | Briefed |
| 4 | The Watermark tools — **combine into one** | [`surfaces/04-watermark-tools.md`](surfaces/04-watermark-tools.md) | `tools/watermarker/` | **Merged in code**, redesign pending |

Surface 4 was different in kind: it briefed **two existing tools with the goal of merging
them into a single surface**. That merge has now happened in code — one tool, both
directions, at `tools/watermarker/` — so the design pass redesigns a single existing
surface rather than deciding the combination. See the status block in its brief for the
decisions the merge already made and what it left open. The others are one-file-in,
one-file-out redesigns.

**Surface 1 is done and is the reference for the rest.** The dashboard carries the token
vocabulary, the Day/Night pair, and the primitives the tool screens should reuse (row,
badge, media rail, utility card, theme switch). Later surfaces should adopt those names
rather than inventing a parallel set — the token-unification note in §3 is what that
solved.

Not yet briefed: For Sale Roundup, In Contract Roundup, Business Card, Profile Pic,
Brand Assets. For Sale and In Contract are near-clones of the Closed builder — decisions
made on surface 3 should port to them, ideally by design rather than by copy-paste.

---

## 1. What this product is

Casa Blanca is a New York City luxury real-estate brokerage. The **Creative Studio** is
its in-house web toolkit: a set of browser tools that turn a listing into on-brand
Instagram assets, plus a place to grab brand files.

Everything is static HTML served from Netlify (and GitHub Pages). There is no login
system in the real sense — see *Auth* below.

### Who uses it

| User | Context | What they need |
|---|---|---|
| **Agents** (the majority) | Non-designers. Busy, often between showings, on a laptop. Use the tools occasionally — days or weeks between sessions, so nothing can rely on memory. | To get from "I have a listing URL" to "I have PNGs to post" without reading instructions. |
| **Creative / dev team** (4 people on an allowlist) | Maintain the platform, build the more finicky posts, publish updates. | Everything agents need, plus the editing and members-only tools. |

The tone the product should carry: the brand is *understated, confident, editorial —
like a design magazine, not a hype ad.* That's the literal copy voice used in the AI
prompts inside the tools, and the UI should feel like it belongs to the same brand.

### The core complaint driving this work

The current UI grew feature-by-feature. It works, but it reads as messy: form fields
stacked in one long undifferentiated scroll, labels that carry instructions instead of
names, controls whose scope (this slide? the whole post?) isn't visible, and several
buttons whose difference from each other is unclear. The redesign is about **making the
existing capability legible and intuitive**, not about adding features.

---

## 2. Hard technical constraints

These are not preferences. Breaking them breaks the product.

- **No frameworks, no build step, no bundler, no `node_modules` at runtime.** Vanilla
  JS and plain CSS only. This is a deliberate, load-bearing architecture decision — the
  tools must run by opening an HTML file.
- **Each tool is a single self-contained HTML file** with its CSS and JS inline. The
  Editorial builder additionally embeds the brand fonts and the wordmark as base64
  (~335KB file) so that (a) it works fully offline and (b) canvas export stays
  "untainted" and can produce PNGs. Do not propose splitting assets out to separate
  files or a CDN.
- **No external requests for assets.** No Google Fonts, no CDN CSS, no icon packages.
  Icons in the current code are hand-written inline SVG; keep that approach.
- **The canvas output is locked.** In the builders, the deliverable is a 1080×1350
  Canvas 2D render whose geometry was measured pixel-for-pixel off official brand
  templates. The redesign covers the *interface around* the canvas, never the artwork
  the canvas produces.
- **The backend is optional.** Netlify Functions provide listing import, AI copy,
  and shared site content. Every one of them can be unreachable — the UI must degrade
  gracefully and say so, never hang or break.
- **Targets:** current Chrome/Safari on desktop is the primary case. It must remain
  usable down to ~820px (tablet). It is not a phone-first product, but it should not
  be broken on a phone.

### Auth, honestly

"Dev sign-in" is a client-side email gate, nothing more: an allowlist of four addresses
compared against `localStorage.cb_auth`. There is no server-side auth and the backend
does not check anything. It is a UX affordance to hide advanced tools from agents, not
a security boundary. Design it as a mode switch, not as a login.

As of 2026-08-28 the allowlist gates the two Team-badged dashboard rows (In contract,
Profile pic) and the dev-only editing affordances. The Watermarker is no longer gated —
its removal half used to hard-redirect, which the redesigned dashboard contradicted.

Allowlist (identical in `index.html`, `assets/studio-header.js`, and
`tools/carousel/cb_editorial.html`):
`creative@email.casa-blanca.com`, `derek@casa-blanca.com`, `emma@casa-blanca.com`,
`erez@casa-blanca.com`.

### localStorage keys in play

| Key | Set by | Meaning |
|---|---|---|
| `cb_auth` | dashboard sign-in | The signed-in email. Presence in the allowlist = "dev mode". |
| `cb_backend` | manual only (no UI) | Backend origin override. Empty = same origin. |
| `cb_changelog_seen` | dashboard | Date of the newest changelog entry the user has seen; drives the unread dot. |
| `cb_autosave_editorial` | Editorial builder | Serialized post state (dev-only autosave). |

---

## 3. The brand system as it exists today

### Typeface

**Object Sans**, weights 400 and 800 (plus slanted variants). Files in `assets/fonts/`.

> Naming inconsistency to resolve: the dashboard declares the family as
> `'Object Sans'` (with a space, loaded from `assets/fonts/*.otf`); the Editorial tool
> declares it as `'ObjectSans'` (no space, base64-embedded). Pick one convention and
> note it in the handoff.

### Color

Both surfaces use the same *values* under different *names* — unifying the token
vocabulary is in scope.

| Value | Dashboard token | Tool token | Role |
|---|---|---|---|
| `#0f0f0f` | `--ink` | `--cb-black` | Near-black. Headers, footers, primary buttons, body text. |
| `#f4f3f0` | `--paper` | `--cb-bg` | Warm paper background. |
| `#e8e6e0` | `--paper2` | — | Secondary paper (chips). |
| `#ffffff` | — | `--cb-surface` | Card / panel surface. |
| `#faf9fd` | `--soft` | — | Faint lavender-tinted surface (inline edit blocks). |
| `#aaa3cf` | `--accent` | `--cb-lavender` | **The brand accent.** Focus rings, active tabs, selected states, CTA fills. |
| `#1e1a2e` | `--plum` | — | Deep plum. Feature gradients, text on accent. |
| `#2d2640` | `--plum2` | — | Lighter plum, gradient partner. |
| `#dddbd5` | `--line` | `--cb-border` | Hairline borders. |
| `#888680` | `--muted` | `--cb-mid` | Muted / secondary text. |
| `#c0c2b5` | — | `--cb-sand` | Sand. Small caps labels on black. |
| `#ffe01b` | `--mc` | — | Mailchimp yellow (one chip only). |
| `#b4452f` | (inline) | (inline) | Error red. |
| `#191919` | — | `BODY` (JS) | Canvas body-text ink. Render-only, not UI. |

Additional colors that appear inline and should be tokenized: `#b04545` / `#e7c9c9` /
`#fbf3f3` (destructive button), `#c7c0b7` (taupe, used on the End slide render),
`#8a8270` (muted-on-warm text in the import panel).

The Editorial builder also carries a **six-swatch accent palette** the user picks from,
plus a custom color input. These recolor the *rendered slide*, not the UI:
`#aaa3cf` Purple · `#e3b462` Golden · `#4e5b41` Green · `#72878c` Marine ·
`#e88f81` Pink · `#d55554` Red.

### Type mannerisms already in the brand

- **Micro-labels:** 10–11px, weight 800, `text-transform: uppercase`, letter-spacing
  `.1em`–`.32em`. Used for eyebrows, field labels, button text, chips.
- **Display headings:** weight 800, tight negative tracking (`-.02em` to `-.04em`),
  sometimes uppercase with a `0.92` line-height.
- **Italic accents:** the dashboard hero italicizes one word in the accent color
  (`The Casa Blanca *Creative* Studio.`).
- **Body:** 13–14px, `line-height: 1.5`, `#55514a`-ish warm grey.

### Shape & depth

| | Dashboard | Tools |
|---|---|---|
| Card radius | 14px | — |
| Panel/input radius | 10px | `--r: 6px` |
| Small radius | — | `--rsm: 4px` |
| Chips | 999px | — |
| Shadow | Card hover `0 18px 34px -22px rgba(30,26,46,.55)`; modal `0 40px 80px -30px rgba(0,0,0,.5)` | Canvas `0 8px 30px rgba(0,0,0,.16)` |

Again: two radius scales for one product. Unify.

### Focus / active convention

Currently: `border-color: var(--accent)` plus
`box-shadow: 0 0 0 3px rgba(170,163,207,.28)`. It's a decent starting point — keep an
equivalent, visible, non-color-only focus state.

### Logos

In `assets/brand/`: `casa-blanca-mark-black.png` (the building mark),
`casa-blanca-wordmark-black.png` / `-white.png`, `casa-blanca-stacked-black.png` /
`-white.png`. Plus `assets/cb-logo-white.png` used in the dashboard header/footer.

---

## 4. Shared chrome — read this before designing any tool header

Every tool page (not the dashboard) loads `assets/studio-header.js`, which injects,
**fixed-position and on top of the page**:

- `.cb-home` — a "‹ Studio" back button, fixed at `top:11px; left:14px`, z-index 100000.
- `#cb-chrome-r` — a dock at `top:11px; right:14px` holding, right-to-left: the
  signed-in account chip (only when signed in; click = sign out) and a **Feedback**
  button injected by `assets/feedback.js` (opens a 300px tray with name / email /
  message and POSTs to the feedback function).

It then **forcibly restyles the page's own header** with
`justify-content: flex-start !important` and `padding-left: 112px !important` to stop
the injected button from covering the logo. Below 560px it switches to
`padding-left:14px; padding-top:46px` and hides the account chip and the tool name.

This is a hack, and it constrains every tool header design. Two options for the
redesign — **please pick one and say which**:

- **(a)** Design tool headers around the injected chrome, keeping the reserved
  top-left and top-right zones clear.
- **(b)** Design a proper unified header component that owns the back button, the tool
  name, the account state, and Feedback — and we rewrite `studio-header.js` to render
  *that* instead of overriding page styles. This is the better outcome if you have
  the room for it.

---

## 5. What to hand back (the deliverable contract)

The package comes back into Claude Code and gets wired into the real files, so it needs
to be implementable, not just viewable.

**Please deliver, per surface:**

1. **A static HTML + CSS prototype.** Self-contained, no external assets, real markup
   (not an image of a design). Stub or omit JS behavior — we'll wire the real logic.
2. **A `:root` token block** as the single source of truth for color, radius, spacing,
   and type scale. One vocabulary for the whole platform, not per-page.
3. **Preserved DOM hooks.** Each surface brief lists every element `id` the existing JS
   binds to. Either keep those ids on the equivalent new elements, **or** include an
   explicit old → new mapping table. This is the single biggest factor in how cleanly
   the wiring goes.
4. **Component states drawn, not just described:** default, hover, focus-visible,
   active/selected, disabled, error, loading, empty, and filled.
5. **A short `CHANGES.md`** noting: anything you merged, moved, renamed, or propose
   cutting; anything that needs new JS behavior beyond what exists today; and any
   open questions.

**Constraints on the design work itself:**

- Framework-free HTML/CSS. Assume the CSS lands inline in a single file.
- **Nothing in the capability inventory may silently disappear.** If you think a
  control should be cut, merged, or moved behind progressive disclosure, do it and
  *call it out in `CHANGES.md`* — don't just drop it.
- Accessibility: real `<label>` elements bound to inputs, visible focus, hit targets
  ≥32px, never color as the only signal, sensible tab order.
- Don't redesign the 1080×1350 canvas artwork. It's locked.

A zip is fine — it'll be unzipped into the repo.

---

## 6. Repo orientation

```
index.html                      Dashboard (surface 1)
home-legacy.html                Previous non-tabbed dashboard, for reference
css/                            Stylesheets for the agent-profile pages (not the Studio)
assets/
  studio-header.js              Injected tool chrome (back button + account chip)
  feedback.js                   Injected feedback widget
  se-import.js                  Shared StreetEasy import client (async + polling)
  fonts/                        Object Sans OTFs
  brand/                        Logos + the building mark
  thumbs/                       Tool card thumbnails on the dashboard
  agents/                       Agent headshot library + agents-taupe.json index
tools/
  carousel/cb_editorial.html    Editorial Carousel Builder (surface 2)
  carousel/README.md            Its layout spec — measured canvas geometry
  closed-carousel/              Closed Carousel Builder
  forsale-carousel/             For Sale Roundup Builder
  incontract-carousel/          In Contract Roundup Builder (members only)
  watermarker/                  Watermarker — add AND remove (surface 4, merged)
  watermark-remover/            Redirect stub to watermarker/
  business-card/  profile-pic/  brand/
netlify/functions/              Backend (see its README.md for the endpoint table)
docs/design/                    ← you are here
```

Worth skimming: `tools/carousel/README.md` (the canvas layout spec) and
`netlify/functions/README.md` (the endpoint table).
