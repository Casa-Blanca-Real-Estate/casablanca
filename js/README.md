# Shared front-end

Plain scripts, loaded with `<script src="../../js/…">`. No build step, no bundler, no
module graph — each file wraps itself in an IIFE and hangs one object off `window`.

| File | What | Used by |
|---|---|---|
| `nav.js`, `scroll.js` | Dashboard nav + scroll behaviour | `index.html` |
| `cb-cutout.js` | `CBCutout` — RMBG mask → RGBA cutout: soft alpha, connected-component despeckle, guided-filter refine, edge colour decontamination | Profile Pic Generator |
| `cb-inpaint.js` | `CBInpaint` — PatchMatch / Criminisi / diffusion fill for a hole in an RGBA buffer | Watermarker, `cb-extend.js` |
| `cb-extend.js` | `CBExtend` — extend a cut-out subject downward: hem silhouette, body-only source, exemplar fill, texture-collapse check | Profile Pic Generator |

## The rule for these three

**Parameters in, no assumptions out.** None of them knows how big a canvas is, what
colour it sits on, or what shape the hole is. Every threshold, radius and iteration
count lives in a `defaults` object that the caller overrides:

```js
CBCutout.cutout(img, mask, mW, mH, { maxEdge: 2048, gamma: 1.4 });
CBInpaint.fill(rgba, w, h, hole, { method: 'criminisi', patch: 13, seed: 20240917 });
CBExtend.extend(cutCanvas, region, rows, { workWidth: 384 });
```

`CBInpaint` has two options that only matter when a hole has context on *one* side, as
a torso extension does — `seed_mode: 'random'` and `vote_sharpness` below 1. Both default
to the watermarker's behaviour, which is what a small mark surrounded by photo wants.

Each tool keeps its own tuning object next to the call site (`CUTOUT_TUNING`,
`EXTEND_TUNING`, `WATERMARK_INPAINT`) so they can diverge without any of these files
growing a special case.
The watermarker fills small rectangular marks inside a real photo; the profile-pic
generator extends a body against flat brand colour. Same maths, different numbers.

## What this costs

Tools are still single-file HTML with embedded assets, but a tool that loads one of
these is no longer double-clickable from an arbitrary folder — it needs the repo
served (Netlify publishes `.`, so `/js/…` resolves in production, and the tools already
load `../../assets/studio-header.js` the same way). `cb-cutout.js` throws a named error
rather than failing mysteriously if it didn't load.

Changing this arrangement is a Casanova decision, not a drive-by one.
