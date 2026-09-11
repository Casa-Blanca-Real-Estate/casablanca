# Dispatch 01 — Profile Pic Generator: cutout quality + torso outpainting

**Owner:** a dedicated Claude Code session (this is that session's whole job).
**Dispatched by:** Casanova (overseer session) · 2026-09-11
**Reviewed/merged by:** Casanova. Open PRs against `claude/main`; do not self-merge.
**Read first:** `/CLAUDE.md`, then `docs/context/casa-blanca.md` §6 (hard constraints) and §8.2 (design system).

---

## Why this exists

Kimani runs portraits through `tools/profile-pic/index.html` constantly. Two things force him
out of the tool and into Canva or Photoshop on a regular basis:

1. **Hard backgrounds don't cut cleanly.** Busy, low-contrast, or hair-heavy portraits come out
   with chewed edges and a color fringe.
2. **Chest-cropped photos can't be extended.** The frame needs more torso than the photo has,
   so he rebuilds it in Canva (generative fill) or Photoshop (marquee + content-aware fill),
   then brings the fixed file *back* into the generator for final output.

Every round trip is minutes of app-switching per agent, on a tool that otherwise does the whole
job in one shot. Goal: **the round trip stops happening.**

---

## Current state — read the code before changing it

**`tools/profile-pic/index.html`** (1763 lines, single file, 237KB)

| What | Where |
|---|---|
| Model load — RMBG-1.4 via Transformers.js 3.0.2 from jsDelivr, ~175MB, browser-cached | `:814-846` |
| `removeBackground()` — 1024² pass, 3×3 box smooth, threshold remap, writes alpha | `:848-897` |
| `drawSubject()` — bare `drawImage` with scale / vertical / horizontal sliders | `:1240-1254` |
| `drawLogo()` — wordmark bottom edge at **0.8065×size** (round) / **0.963×size** (square) | `:1257-1272` |
| `drawName()` — name baseline at **0.972×size** | `:1274-1295` |
| `renderAll()` — 10 outputs at 1080px, round + square, brand beige `#c8beb8` or IG color | `:1516+` |

**The specific defect in the alpha pipeline** (`:887`):

```js
val = Math.max(0, Math.min(1, (val - 0.30) / (0.80 - 0.30)));
```

Everything under 0.30 alpha is discarded, everything over 0.80 is forced opaque, *after* a 3×3
box blur has already smeared the mask. Hair wisps, knit texture, and defocused shoulder edges
live in exactly the band being thrown away. There is also **no color decontamination** — edge
pixels keep the original background's color mixed in, so a cutout from a green room lands on the
brand beige with a green rim. That rim is most of the "looks badly cut out" impression even when
the mask is right.

**`tools/watermarker/index.html`** already contains working exemplar-based inpainting:

| What | Where |
|---|---|
| `patchMatchFill(buf, cw, ch, hole, P, iters, outer)` — coarse-to-fine, 4-level pyramid | `:1086` |
| `criminisiFill(...)` — structure-first alternative | `~:1153` |
| Call site with real parameters + diffusion fallback | `:1380-1400` |
| Replay caching (removals are expensive — read the comment at `:434` before reusing) | `:434-437` |

Both take an RGBA buffer plus a `hole` mask and fill in place. Clean signatures, liftable.
**Kimani's note: the current PatchMatch output is "not the cleanest" even in the watermarker** —
so improving it is in scope here, not just reusing it.

---

## Phases

Ship each phase as its own PR. Phase 1 alone should be visibly better on Kimani's hard portraits —
get it in front of him before starting Phase 2.

### Phase 1 — Fix the alpha pipeline *(no new dependencies, no download change)*

- Stop crushing the soft alpha band. Keep the model's gradient; if a floor is needed for noise,
  make it far lower and shape it, don't window it to 0.30–0.80.
- Drop the 3×3 box blur as a pre-threshold step. If despeckling is needed, do it as a connected-
  component pass on near-zero regions, not a blur over the whole mask.
- Add **color decontamination**: in a narrow band around the silhouette, estimate the background
  contribution and unmultiply it out of the RGB so partial-alpha pixels carry the subject's color,
  not the old room's.
- Consider running the model at native aspect rather than a squashed 1024² if the processor allows
  it — check whether the current call is distorting non-square inputs.

**Validation:** you cannot eyeball this from code. Build a small comparison harness (scratchpad,
not committed) that renders before/after side by side at 1080px on both `#c8beb8` and a dark IG
color, and check the edge at 400% zoom. Ask Kimani for 3–5 of his genuinely hard portraits and
report with images.

### Phase 2 — Alpha touch-up brush

No model is 100%, so this is the piece that actually kills the Photoshop trip for edge cases.

- Erase / restore brush painting directly on the alpha mask, live composite behind it so he sees
  the real output while brushing.
- Adjustable radius, soft edge, undo/redo.
- Follow the house UX conventions in `docs/context/casa-blanca.md` §8.2 — this is an internal
  tool for agents: zero-install, no accounts, keyboard shortcuts welcome.

### Phase 3 — Shared module, tailored per tool

**Kimani's explicit requirement: shared, but each tool can tune it.** The profile-pic generator
and the watermarker want different defaults and different behavior from the same algorithms.

- Extract cutout + inpainting into a shared module (the repo has `js/` with `nav.js`, `scroll.js`
  as precedent for shared front-end code).
- **Design for per-tool configuration, not one-size-fits-all**: parameters in, no hardcoded
  assumptions about canvas size, background, or hole shape. The watermarker fills small
  rectangular marks inside a photo; the generator extends a body silhouette against flat color.
  Same math, different tuning.
- Note the constraint in §6: single-file HTML, no build pipeline, embedded base64 assets. A shared
  `js/` module that both tools `<script src>` is fine; a bundler is not. **Confirm with Casanova
  before changing how any tool is assembled or deployed.**

### Phase 4 — Torso extension via PatchMatch, with an editable region

Geometric/mirror extension was **considered and rejected** — Kimani's inputs vary too much for
shoulder-taper heuristics to be reliable. Don't build it.

PatchMatch is the free default, but only earns its place if two things are true:

1. **Detection is right** — the extension region is derived correctly from the cutout silhouette
   and the target frame, not guessed.
2. **He can alter the shape of the output** — a marquee-style region editor, deliberately echoing
   the Photoshop workflow he already trusts: define the area to fill, run it, adjust, re-run.
   Cache aggressively; see the replay note at `tools/watermarker/index.html:434`.

Useful leverage: the composite sits on **flat brand color**, and the wordmark/name occupy the
bottom of the frame (see the coordinates in the table above). The fill only has to be plausible
clothing, and part of it ends up covered. That's a much lower bar than general scene outpainting —
exploit it. Expect honest failure on patterned fabric, lapel lines, and visible hands; fail
visibly rather than shipping mush.

### Phase 5 — Generative outpaint, server-side *(the real target)*

**Kimani has approved per-image spend.** This is the one that matches what Canva is doing for him,
because it is the same class of model.

- New Netlify function alongside `netlify/functions/img.mjs`. Follow the existing patterns:
  `_lib.mjs` `cors()` helper, `netlify.toml` must declare the functions directory, **no esbuild
  bundling for functions touching `@netlify/blobs`** (§6).
- **`ANTHROPIC_API_KEY` is already in the environment but is not usable for this** — it backs the
  Haiku text features. The Anthropic API does not generate or edit images. This needs a new key.
- **Kimani's leading candidate is Google's Nano Banana 2**, via the Gemini API. Start there, but
  compare it against the other options that expose an API and per-image pricing — Black Forest
  Labs' FLUX Fill (built for inpaint/outpaint with a supplied mask), Stability, and the
  fal/Replicate-hosted models — on: **torso quality specifically** (not general image quality),
  price per generation, latency, whether you can hand it an explicit mask, and whether output
  resolution clears 1080px without upscaling.
- **Check pricing against the provider's live pricing page — don't trust a remembered number,
  these move.** Bring Casanova the comparison; Kimani picks and adds the key. Don't sign up for
  anything yourself.
- Send the cutout plus the target frame and fill region, get the extended torso back, composite
  in the existing pipeline. Keep Phase 4 as the offline fallback when the call fails or he doesn't
  want to spend on a given image.
- Cost control: this fires per image, on a tool used in batch. Cache by input hash, make the call
  explicit (a button, not automatic on every render), and surface what a batch will cost.

---

## Non-goals

- Don't redesign the tool's UI. Surface 5 has no design brief yet; `docs/design/` covers the
  dashboard and the other four surfaces.
- Don't touch the 10 output variants, naming conventions, or the batch/tabs system — they're
  shipped and in daily use.
- Don't change how tools are built or deployed without clearing it with Casanova first.

## Working agreement

- Branch per phase. PR to `claude/main` with before/after images in the body. Casanova reviews and merges.
- Kimani works Casa in blocks, 3 days a week, across several tracks — **don't block on his review
  mid-phase.** Bank the work, open the PR, move to the next phase's groundwork.
- He prefers direct execution over walkthroughs, and "mostly steak, not sizzle" in writeups.
- If a phase turns out to be the wrong shape once you're in the code, say so in the PR with what
  you'd do instead. The tier structure is a plan, not a contract.
