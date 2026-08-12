# Story Motion Builder — feasibility, architecture, and what it takes

Lives at `tools/story/`. A working prototype is in the repo; this doc is the reasoning
behind it and the plan for turning it into a real studio tool.

---

## 1. The short answer

**Very doable, and it's the same tool you already have three times over.**

The carousel builders are: a fixed layout with hard-coded pixel boxes, a form bound to
those boxes, a `<canvas>` that draws them, and a download button. A motion graphic is
that exact thing with one extra argument — time. `draw(ctx)` becomes `draw(ctx, t)`.

The only genuinely new piece is turning frames into a video file, and that turned out to
be a solved problem that runs entirely in the browser. No render server, no queue, no
per-render cost. **This is already working in the prototype**: it exports a real
1080×1920 H.264 MP4 that Instagram accepts, in about 6 seconds for a 7-second story.

What makes it *not* just a fourth hard-coded builder is the one architectural decision
below.

---

## 2. The architecture decision that matters

You described this as an **aggregator**, not a generator — you design the thing, we
measure the pixels, and the measurements become the input slots. That's exactly right,
and it should be taken one step further:

> **The template is data. The renderer is generic.**

A template is a plain object: layers with absolute boxes in story space (1080×1920) and
keyframe tracks in seconds. The engine knows how to interpolate a number over time and
how to draw a text/photo/image layer. It knows *nothing* about "in contract" or "sold".

```js
{ id:'status', type:'text', bind:'status', box:[74, 338, 932, 120],
  size:104, weight:800, color:'#f4f3f0', transform:'upper', fit:true,
  anim:{
    opacity: [[0.22, 0], [0.70, 1, 'outQuad']],    // [time, value, ease-into-this-key]
    ty:      [[0.22, 54], [0.92, 0, 'outCubic']],  // slide up 54px
    clip:    [[0.22, 0], [1.02, 1, 'outQuint']]    // left→right wipe
  } }
```

Why this matters for what you asked for:

- **Adding "Just Sold" or "Open House" as a different layout is adding an object to an
  array, not writing new render code.** The five templates after the first one are
  nearly free.
- **You can transcribe DaVinci numbers directly.** A keyframe at 00:00:07 with Ease Out
  is `[0.23, value, 'outCubic']`. There's a JSON editor in the tool's Motion panel that
  live-applies edits, so tuning is a paste-and-look loop, not a rebuild.
- **The form generates itself** from whichever layers declare a `bind`. Add a layer with
  `bind:'openHouseTime'` and the input appears. That's the aggregator idea, literally.
- **The same scene data could render server-side later** if we ever want batch/API
  rendering, because it's just JSON.

The alternative — hand-coding each story like the carousels are hand-coded — works, but
you'd be paying the full build cost every time you want a new announcement type. Given
you already listed at least four (just listed / in contract / sold / open house), the
data-driven version pays for itself immediately.

---

## 3. How the video actually gets made

This was the risky part, so it got settled first.

**Mediabunny** (`assets/vendor/mediabunny.min.mjs`, MPL-2.0, vendored, 632 KB, zero
dependencies) wraps the browser's native **WebCodecs** API. We draw frame *n* to the
canvas, hand it to the encoder stamped at `n/30` seconds, and it muxes H.264 into an MP4.

The important property: **this is offline and deterministic, not a screen recording.**
Frames are encoded as fast as the machine can go, and every frame is rendered from the
timeline function rather than captured in real time. Nothing drops frames, nothing
depends on the agent's machine keeping up, and the same inputs always produce a
byte-identical video.

```js
const output = new Output({ format: new Mp4OutputFormat({fastStart:'in-memory'}),
                            target: new BufferTarget() });
const source = new CanvasSource(cv, { codec:'avc', quality: QUALITY_HIGH });
output.addVideoTrack(source, { frameRate: 30 });
await output.start();
for (let i = 0; i < totalFrames; i++){
  drawFrame(ctx, i/30);
  await source.add(i/30, 1/30);
}
await output.finalize();
```

**Measured in this repo:** 216 frames at 1080×1920 encoded in 5.9 s, 0.8 MB out. Read
back with a demuxer, the file reports MP4 / 1080×1920 / 7.2 s / 216 packets / exactly
30 fps, and decodes to correct pixels.

### Why not the obvious alternatives

| Option | Why not |
|---|---|
| **Remotion** | The best-known tool here, and genuinely good — but it's React, needs a build step, and renders via headless Chrome on a server (or paid Lambda). The studio is static HTML on Netlify with no build step. It would mean a second, incompatible stack. |
| **`MediaRecorder` + `canvas.captureStream()`** | Free and 10 lines, but it records in *real time* — a slow machine drops frames — and outputs WebM/VP8, which Instagram doesn't reliably take. |
| **`ffmpeg.wasm`** | ~30 MB payload, much slower, and WebCodecs makes it unnecessary for encode-only work. |
| **Server-side headless Chrome + ffmpeg** | Real per-render cost and a 26 s Netlify function ceiling to fight. Worth revisiting only if we ever want batch rendering. |
| **HeyGen HyperFrames** | Newer HTML/CSS→MP4 renderer, interesting, but also a CLI + server render model. Same mismatch as Remotion. |

### Browser support — the one real constraint

WebCodecs H.264 encoding needs **Chrome/Edge 94+ or Safari 26+**. Chrome and Edge on any
normal desktop are fine. Older Safari and most mobile browsers can't encode.

The tool checks up front and refuses to silently hand back a file Instagram will reject:
if H.264 isn't available it names the codec it *would* use and makes you confirm. Since
agents are exporting on a laptop and then posting from their phone, "use Chrome" is an
acceptable requirement — the same one the carousel builders already lean on for fonts.

---

## 4. What's in the prototype now

`tools/story/index.html` — one self-contained file, same shape as the carousel builders.

- **1080×1920 live preview** with play/pause, a scrubber, and a timecode readout.
- **Auto-generated form** — status (4-way toggle), address, neighborhood/unit, price,
  description, agent.
- **Agent dropdown** wired to the real `assets/agents/agents.json`, so picking a name
  pulls the headshot and auto-fills the displayed name.
- **1–4 photos**, drag-drop or file-picker, that crossfade with a slow push-in. Photo
  count drives the clip length automatically.
- **StreetEasy import** via the existing `CBImportStreetEasy` client — address, price,
  neighborhood, description and the first four photos in one paste.
- **Keyframe timeline readout** — every layer as a row, every keyframe as a diamond,
  with a playhead. Makes it obvious at a glance what's moving when.
- **Live-editable motion JSON** — the transcription surface for your DaVinci settings.
- **Export MP4** and **Still frame** (JPEG at the current playhead, for a static post).

The motion in it right now is a **placeholder built to be replaced.** It's a reasonable
staggered entrance — rule wipes out, status slides up behind a wipe, photo frame settles
in from 4.5% over, address/sub/price/description cascade, agent photo pops with a slight
overshoot. It is *not* your comp. It exists so there's something concrete to react to.

---

## 5. What I need from you

1. **Screenshots of one of your existing story videos** at several points — start, each
   element's entrance, mid-crossfade, end. Enough to read positions and order.
2. **The DaVinci/Canva settings**, however rough. What I actually need per element:
   - when it starts and when it lands (seconds, or frames at whatever fps)
   - what property moves — position, opacity, scale, or a wipe
   - the from/to values (px offsets are ideal)
   - the easing (Ease Out / Ease In and Out / Linear)
3. **The end card**, if there is one — does it hold on the last photo, cut to a logo
   card, anything else?
4. **Music.** Out of scope for now: audio would mean shipping and licensing a track, and
   most agents add sound in the Instagram app anyway. Say the word if it's wanted.

I don't need the source project file — screenshots plus the numbers are enough, and the
numbers are the part I can't recover from a screenshot.

---

## 6. Effort estimate

| Phase | What | Size |
|---|---|---|
| ~~0~~ | ~~Prove the browser can export an Instagram-ready MP4~~ | ~~**done**~~ |
| 1 | Rebuild the motion to match your real comp | small — it's data, not code |
| 2 | Design pass on the layout to match the studio's editorial look | medium |
| 3 | Templates 2–4 (just listed / sold / open house variants) | small each |
| 4 | Session save/restore + history, matching the carousel builders | small |
| 5 | Add to the studio dashboard with a thumbnail | trivial |

Phase 1 is the one gated on you. Everything else is independent.

---

## 7. Known gaps in the prototype

- **Not linked from the studio dashboard** — deliberately. It's a prototype until the
  motion is signed off, and it shouldn't appear to agents before then.
- **No session persistence** yet (the carousels save to `/.netlify/functions/sessions`).
- **One template.** The registry supports more; there's only one in it.
- **No audio track.** See above.
- **Blur is declared as an animatable property but not implemented** in the draw layer —
  `ctx.filter` works but is slow enough per-frame to be worth measuring before adopting.
- **Agent headshots** use the name-baked `accent/` variants. The carousels prefer the
  `clean/` crops when they exist; this should do the same.
