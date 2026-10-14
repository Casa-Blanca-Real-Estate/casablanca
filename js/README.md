# Shared front-end

Plain scripts, loaded with `<script src="../../js/…">`. No build step, no bundler, no
module graph — each file wraps itself in an IIFE and hangs one object off `window`.

| File | What | Used by |
|---|---|---|
| `nav.js`, `scroll.js` | Dashboard nav + scroll behaviour | `index.html` |
| `cb-cutout.js` | `CBCutout` — RMBG mask → RGBA cutout: soft alpha, connected-component despeckle, guided-filter refine, edge colour decontamination | Profile Pic Generator |
| `cb-inpaint.js` | `CBInpaint` — PatchMatch / Criminisi / diffusion fill for a hole in an RGBA buffer | Watermarker |

## The rule for these two

**Parameters in, no assumptions out.** Neither file knows how big a canvas is, what
colour it sits on, or what shape the hole is. Every threshold, radius and iteration
count lives in a `defaults` object that the caller overrides:

```js
CBCutout.cutout(img, mask, mW, mH, { maxEdge: 2048, gamma: 1.4 });
CBInpaint.fill(rgba, w, h, hole, { method: 'criminisi', patch: 13, seed: 20240917 });
```

Each tool keeps its own tuning object next to the call site (`CUTOUT_TUNING`,
`WATERMARK_INPAINT`) so the two can diverge without either file growing a special case.
The watermarker fills small rectangular marks inside a real photo; the profile-pic
generator extends a body against flat brand colour. Same maths, different numbers.

## What this costs

Tools are still single-file HTML with embedded assets, but a tool that loads one of
these is no longer double-clickable from an arbitrary folder — it needs the repo
served (Netlify publishes `.`, so `/js/…` resolves in production, and the tools already
load `../../assets/studio-header.js` the same way). `cb-cutout.js` throws a named error
rather than failing mysteriously if it didn't load.

Changing this arrangement is a Casanova decision, not a drive-by one.
