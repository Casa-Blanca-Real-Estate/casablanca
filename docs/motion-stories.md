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
- **You can transcribe DaVinci numbers directly.** A keyframe at frame 7 with Ease Out is
  `[0.23, value, 'outCubic']`. There's a JSON editor in the tool's Motion panel that
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

## 4. The story, as it stands

**Fixed 10 seconds, 30 fps, 300 frames.** The length is a constant, not something the
photo count drives — the stack divides whatever time is left instead. One photo lingers,
four move along.

### Shape of the clip

| | |
|---|---|
| **0.0 – 0.35 s** | Logo, rule and status headline come in. |
| **0.35 – 2.35 s** | **Opening card** (optional): the agent, centred, quarter-second fade in, 1.5 s on screen, quarter-second fade out. |
| **2.35 s →** | Photo frame arrives with the address, neighborhood, price and description. The corner agent credit fades in as the big headshot leaves. |
| **→ 9.30 s** | Photos crossfade through the stack with a slow push-in. |
| **9.30 – 9.92 s** | Everything fades out together. |

Switching the opening card off collapses that window and the listing simply starts at
zero. Nothing needs rewriting: layers tagged `group:'listing'` run on their own clock,
offset by `intro.end`, so every listing keyframe is written relative to *when the listing
starts* rather than to absolute story time. The end fade is one scene-level `outro`
property rather than an out-key bolted onto all eighteen layers.

The opening card needs an agent to open on. With none picked it's skipped automatically
rather than holding 2.35 s of near-empty frame.

### Two designs

| | |
|---|---|
| **Framed** | Photo in a paper frame, type stacked underneath. The default. |
| **Full Bleed** | Photo carries the whole frame, type over scrims top and bottom. |

They share one field list and one set of layer parts — they differ in composition, not in
what a listing is. Switching between them keeps everything you've typed and every photo
you've loaded. **Adding a third is roughly twenty lines of layout numbers.**

### Layout and Instagram's chrome

Everything sits between **y=210 and y=1665**, so Instagram's own furniture — the profile
bar along the top, the reply bar along the bottom — never covers anything. The photo is
932 × 876, a touch wider than square.

### The rest of the tool

- **1080×1920 live preview** with play/pause, scrubber and timecode.
- **Auto-generated form** — opening card toggle, status (4-way), address, neighborhood,
  price, description, agent.
- **Agent dropdown** wired to the real `assets/agents/agents.json` (112 agents), which
  pulls the headshot and auto-fills the displayed name.
- **1–4 photos**, drag-drop or picker, crossfading with a slow push-in.
- **StreetEasy import** via the existing `CBImportStreetEasy` client.
- **Keyframe timeline readout** — every layer a row, every keyframe a diamond, with a
  playhead. Keys are drawn where they actually land, delay included.
- **Live-editable motion JSON** — the transcription surface for DaVinci numbers.
- **Export MP4** and **Still frame** (JPEG at the playhead, for a static post).

### Headshots

The library's squares have the agent's name printed across the bottom, which collides
with the story printing the name as type. So, exactly as the carousels do, the tool
prefers a nameless crop at `assets/agents/clean/<same filename>` — the Profile Pic tool's
"SQ · Clean" export. **That folder is currently empty**, so today every agent falls back
to the named square, and the tool crops the bottom 17% off to remove the baked-in name
(`trimName` on the layer). Dropping clean crops into that folder makes the full frame
usable with no code change.

---

## 5. Effort estimate

| Phase | What | Size |
|---|---|---|
| ~~0~~ | ~~Prove the browser can export an Instagram-ready MP4~~ | ~~**done**~~ |
| ~~1~~ | ~~10 s timing, opening card, layout, second design~~ | ~~**done**~~ |
| 2 | More designs for agents to pick from | small each |
| 3 | Session save/restore + history, matching the carousel builders | small |
| 4 | Populate `assets/agents/clean/` from the Profile Pic tool | not code |
| 5 | Add to the studio dashboard with a thumbnail | trivial |

**Music is out of scope by decision** — agents add sound in the Instagram app.

---

## 6. Known gaps

- **Not linked from the studio dashboard** — deliberately. It shouldn't appear to agents
  before the designs are signed off.
- **No session persistence** yet (the carousels save to `/.netlify/functions/sessions`).
- **Two templates.** More are cheap; there are two.
- **`clean/` is empty**, so every headshot is currently the cropped named square.
- **Blur is declared as an animatable property but not implemented** — `ctx.filter` works
  but is slow enough per frame to be worth measuring before adopting.
- **The photo stack's `hold` is recomputed** whenever the photo count or the opening card
  changes. Setting `holdAuto:false` on the layer in the JSON panel pins it if you want to
  hand-time the stack.
