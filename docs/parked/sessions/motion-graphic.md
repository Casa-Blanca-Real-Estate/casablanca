# Motion graphic session — handoff (retiring 2026-10-14)

The session that built the Instagram Stories motion builder and the React spike, in August 2026.
Everything it built is on one branch. Nothing is merged, nothing has a PR except this doc.

## What was built, and where

**Branch: `claude/motion-graphic-stories-hlpirk`** — three commits on top of `ae61001` (mid-August
`claude/main`, now far behind):

| Commit | What |
|---|---|
| `02ae06d` | `tools/story/index.html` — the Stories builder. `assets/vendor/mediabunny.min.mjs` + its MPL-2.0 licence. `docs/motion-stories.md` |
| `6f5a50c` | Opening card, fixed 10 s, the second design, layout pass |
| `4f55b75` | React spike: `tools-src/react-demo/`, root `vite.config.js`, `package.json` scripts, `netlify.toml` build command, `docs/react-in-the-studio.md` |

**The Stories builder** (`tools/story/index.html`, ~1,150 lines, vanilla JS, one file):

- 1080×1920, 30 fps, **fixed 10 s** (300 frames). Kimani set the length.
- **Export is MP4 in the browser**, no server: canvas → WebCodecs → H.264 via Mediabunny
  (v1.53.1, vendored). Frame-by-frame and deterministic, not a screen recording. Measured: 300
  frames in ~7 s, ~1 MB. Also a still-frame JPEG export.
- **Templates are data, not code.** Each layer has a box in story pixels and keyframe tracks
  (`[time, value, ease]`) for opacity / tx / ty / scale / rotate / clip (wipe). The engine is generic.
  The form is generated from the layers' `bind` fields. A **live JSON editor** in the Motion panel
  applies keyframe edits instantly — meant for transcribing DaVinci/Canva numbers.
- **Two designs:** *Framed* (photo in a paper frame, type under it) and *Full Bleed* (photo fills
  the frame, type over scrims). Shared field list and layer parts (`PART.*`); switching keeps inputs.
- **Clip shape:** logo, rule and status headline come in → optional **opening card** (agent
  centred, 0.25 s fade in, 1.5 s on, 0.25 s out; ends at 2.35 s) → photo frame with address,
  neighborhood, price, description; corner agent credit → photos crossfade with a slow push-in →
  everything fades out 9.30–9.92 s. Listing layers carry `group:'listing'` and run on a clock offset by
  the opening card, so toggling it rewrites nothing. The fade-out is one scene-level `outro`.
- Fields: opening card on/off, status (Just Listed / In Contract / Sold / Open House), address,
  neighborhood (unit number removed at Kimani's request), price, description, agent (from
  `assets/agents/agents.json`, auto-fills the name), 1–4 photos (drop, or StreetEasy import via
  `CBImportStreetEasy`, remote photos through `/.netlify/functions/img`).
- Layout keeps everything in y=210–1665 so Instagram's top bar and reply bar cover nothing.
- Deliberately **not linked from the dashboard**.

Kimani's verdict (2026-08-18): the motion "looks good", "pretty damn good already"; he liked the
setup enough that he no longer needed to send screenshots or DaVinci settings.

## Unfinished or broken, and the fix

- **Not single-file.** It loads Object Sans from `assets/fonts/*.otf`, the logo from
  `assets/cb-logo-white.png`, and Mediabunny from `assets/vendor/`. See the port below.
- **The branch is stale.** It forks from `ae61001`. Don't merge or rebase it: its React commit
  conflicts with the comp report's Vite setup. Cherry-pick the story files (below).
- **Opening card skips itself when no agent is picked** (by design, not a bug) — the card *is* the
  agent, so it won't hold 2.35 s of empty frame.
- **Headshots:** library squares have the name baked across the bottom. The tool prefers
  `assets/agents/clean/<same file>` (the carousels' convention) and otherwise crops the bottom ~17%
  (`trimName` on the layer). `clean/` was empty then and still is, so every headshot is the cropped
  square. Dispatch 12 (profile pic roster) may change what the clean source should be — check.
- **H.264 only on Chrome/Edge 94+ or Safari 26+.** Elsewhere the tool names the fallback codec and
  asks before exporting (Instagram rejects VP9). Headless Chromium has no H.264 encoder, so automated
  tests export VP9 — that's the test rig, not the tool.
- **`blur` is declared as an animatable prop but not drawn.** Measure `ctx.filter` cost per frame
  before using it.
- **Photo `hold` is recomputed** when photo count or the opening card changes; `holdAuto:false` on
  the layer pins a hand-set value.
- No session save/restore (the carousels have it). No dashboard card or thumbnail.
- `clean/` probes log four 404s per agent pick — same as the carousels; harmless.

## Porting it into the studio (the single-file rule) — start here

1. From `claude/main`, take only the story files from the old branch:
   `git checkout origin/claude/motion-graphic-stories-hlpirk -- tools/story/index.html docs/motion-stories.md`.
   Leave `assets/vendor/` and the React commit behind.
2. **Fonts:** swap the two `@font-face` `url()`s for the base64 `data:font/otf` blocks the carousels
   already carry (copy lines 30–31 of `tools/closed-carousel/index.html`).
3. **Logo:** inline `cb-logo-white.png` as a `data:image/png;base64` URL (33 KB).
4. **Mediabunny** (632 KB minified, MPL-2.0) is the one hard part. Inline it as a
   `<script type="text/plain" id="mb">` and load it at export time with
   `import(URL.createObjectURL(new Blob([mb.textContent], {type:'text/javascript'})))` — the export
   code already imports it lazily, so only that one line changes. Keep the MPL header comment.
   Cost: the file grows to roughly 1.5 MB with fonts. Acceptable for a tool page; if not, the
   alternative is asking Kimani for a scoped exception for one vendored file, as the comp report has.
5. Keep `studio-header.js`, `se-import.js` and the backend shim as external scripts — every studio
   tool still loads them that way.
6. Restyle against the redesigned dashboard (2026-08-28), add a card, then retest an export in real
   Chrome and post a test story to Instagram from a phone before calling it done.

The old prototype was written before the rule was codified; the logic needs no changes for the port.

## Decisions and findings that existed only in the conversation

- **Music: out**, by Kimani's decision — agents add sound in the Instagram app.
- **Remotion: no.** Not because of React — it now renders client-side via `@remotion/web-renderer`,
  which encodes with Mediabunny, the library we already use. The blocker is the licence: free only to
  3 employees; an internal tool agents render with is the Automators tier ($0.01/render, $100/month
  minimum, ~$1,200/year floor) to wrap an engine we call for free. My first doc said "it's React" —
  wrong; corrected in `docs/react-in-the-studio.md` on the branch.
- **HyperFrames (HeyGen):** Apache-2.0, no fees, but renders via a CLI driving headless Chrome and
  aims at AI-composed video, not template filling. Worth a look only if the goal becomes Claude
  composing videos end to end.
- `MediaRecorder` rejected: real-time, drops frames, WebM. `ffmpeg.wasm` rejected: ~30 MB, slower.
- **The React spike is superseded.** The comp report adopted React + Vite under the scoped exception
  in `CLAUDE.md`. The spike's evidence (incontract-carousel: 3,633 lines, 235
  `getElementById`/`querySelector`, a hand-written `syncForm()`) and its deploy-fragility warning fed
  that decision. Don't revive its root `vite.config.js` or `netlify.toml` command.
- **Correction for `docs/decisions.md`:** it calls the Stories generator "a Vite-built React
  prototype to port". It isn't — the Stories builder is single-file vanilla JS; only the separate
  `react-demo` spike was React. This doc doesn't edit `decisions.md`; Casanova should fix that line.
- More designs are cheap: a third is ~20 lines of layout numbers using `PART.*`.

## Waiting on Kimani

- **When to unpark the Stories generator** (already queued in `docs/decisions.md`).
- **Whether ~1.5 MB for a single-file tool is fine**, or a scoped exception for the vendored encoder.
- **Delete `claude/motion-graphic-stories-hlpirk`** once the story files are ported (sessions can't
  delete branches).
- Which further designs agents should get; and whether clean headshots should come from Dispatch 12.

— the Motion graphic session (retiring)
