# Surface 4 — The Watermark Tools (a combination brief)

> Read [`../README.md`](../README.md) first. It carries the brand system, the technical
> constraints, and the deliverable contract that apply to every surface.

**Files:**
`tools/watermarker/index.html` — ~800 lines, self-contained
`tools/watermark-remover/index.html` — ~1195 lines, self-contained
**Routes:** `/tools/watermarker/` · `/tools/watermark-remover/`

---

## 1. Why these two are briefed together

**This brief asks for one tool, not two.** The intent is to combine the Watermarker and
the Watermark Remover into a single surface, and the design decides how.

They are already halves of one idea, and the code says so — each tool ends with a
footnote pointing at the other:

> Watermarker: *"Need to **remove** a watermark instead? That's the Watermark Remover."*
> Remover: *"Need to **add** a watermark instead? That's the Watermarker."*

They share the same wordmark artwork (the remover's mask is byte-identical to the
watermarker's embedded logo — that's what makes removal exact), the same
everything-runs-locally promise, the same drop-a-photo entry, the same multi-file model,
and the same download-what-you-made exit. A user with a folder of listing photos is
doing one job — *getting the mark right* — and currently has to know which of two tools
that job lives in.

**Read §5 before designing.** The two tools differ in ways that make naïve merging wrong,
and those differences are the actual design problem.

---

## 2. Tool A — Watermarker (add the mark)

Public. Anyone can use it. A single centered ~700px column.

### Layout

```
BLACK HEADER  [logo]                        Image Watermarker
─────────────────────────────────────────────────────────────
UPLOAD A PHOTO,          ← hero type, font-size computed at
GET IT WATERMARKED.        runtime as (dropzone height / 4)

┌ drop zone ───────────────────────────────┐ [ Start Over ]
│  Drop photos here or click to upload      │
│  JPG · PNG · WEBP · Multiple files        │
└───────────────────────────────────────────┘

┌ settings bar ─────────────┬───────────────┐
│ Color  [selected only]    │ Virtually     │
│ ○White ●Black [Apply all] │ Staged  [Off] │
└───────────────────────────┴───────────────┘

┌ dev tools bar (hidden) ───┬───────┬───────┐
│ Position ▾ │ Opacity ──○─ │ Size S M L    │
└────────────┴──────────────┴───────────────┘

Preview  1/8                              8 photos
┌───┬───┬───┐   3-col grid of live thumbs,
│ ▣ │ ▢ │ ▢ │   plus an "add more" tile and
├───┼───┼───┤   a black "download all" tile
│ ▢ │ + │ ↓ │
└───┴───┴───┘

┌ large preview of the selected photo ─────┐
│                                    [ ↓ ] │
└──────────────────────────────────────────┘
filename.jpg

Need to remove a watermark instead? …
All processing happens locally.        dev tools
```

### Controls

| Control | Detail |
|---|---|
| Drop zone | Multi-file. **Collapses to a compact row** after the first upload and relabels itself "+ Add more photos". |
| Start Over | Appears beside the compact drop zone once there's work |
| **Color** | White / Black radio swatches. **Per-image** — with an "Apply to all" button and a "selected photo only" note that both appear only in multi-file mode. |
| **Virtually Staged** | Off/On toggle. Draws the words `VIRTUALLY STAGED` bottom-left in the same color and opacity as the mark. A legal disclosure, sitting in the UI as a styling option. |
| Gallery | 3-up grid. Unselected thumbs sit at 45% opacity; the active one gets a lavender border. Filename appears on hover/active. Includes an add-more tile and a download-all tile inline in the grid. |
| Large preview | The selected photo at full width with a floating download button |

### Hidden dev tools

Revealed by clicking a faint **"dev tools"** word in the footer (there's also a
`Ctrl+Shift+D` comment in the markup). Exposes **Position** (4 corners), **Opacity**
(10–100%, default 80), **Size** (S 15% / M 20% / L 30% of image width, default L).

These are the settings that most affect output, hidden from the people using the tool.

### Render

Mark drawn at `size%` of image width, `2.5%` padding from the chosen corner, recolored by
compositing (`source-in`) so one white PNG serves both colors. Export is
**JPEG quality 0.95**, named `originalname_cb.jpg`. Download-all loops with a 250ms gap.

---

## 3. Tool B — Watermark Remover (take the mark off)

**Members-gated.** A script in `<head>` runs before anything renders and
`location.replace('../../')` — bouncing anyone whose `cb_auth` isn't on the four-email
allowlist straight back to the Studio home.

### Layout

```
BLACK HEADER  casa blanca              Watermark Remover
─────────────────────────────────────────────────────────
TAKE THE MARK
OFF.
[ a 4-line paragraph explaining the algorithm ]

┌ Photo ───────────────────────────────────┐
│ [ drop, click, or paste ]                 │
│ [ …or paste an image URL ] [ Load URL ]   │
└───────────────────────────────────────────┘

┌ work card (hidden until a photo loads) ──┐
│ ▯ ▯ ▯  photo strip                        │
│ Mark [Casa Blanca][Anything] │ Fill       │
│      [Structure-first][Texture] [↶ Undo][Reset]
│ ┌──────────────────────────┐              │
│ │  stage canvas + overlay  │ ← drag a box │
│ └──────────────────────────┘              │
│ Drag a box around a watermark.            │
│ 1 · Casa Blanca mark · 214px · match 0.87 │
│     · opacity 85% · patchmatch        [✕] │
│ [⇉ Apply marks to all]  [↓ This][↓ All]   │
└───────────────────────────────────────────┘
```

### The interaction that defines it

**Drag a box on the canvas around a watermark.** Everything else is settings for what
happens next. The overlay canvas draws the marquee; releasing runs the removal.

### Controls

| Control | Detail |
|---|---|
| Drop zone | Multi-file. Drop, click, **or paste**. |
| URL loader | Loads a remote image through `/.netlify/functions/img?u=` (a CORS proxy) — so a StreetEasy photo can be pulled in by link |
| Photo strip | Thumbnails; the active photo is the one being worked |
| **Mark: Casa Blanca / Anything** | *Casa Blanca* template-matches the real wordmark inside the box, solves for its actual size, position and opacity, and un-blends it. *Anything* skips detection and just fills the box. |
| **Fill: Structure-first / Texture** | Two inpainting algorithms — Criminisi (follows edges and structure) vs PatchMatch (texture synthesis). |
| ↶ Undo · Reset | Disabled until there's an op |
| **Marks list** | Every removal listed with its measurements — size in px, match score, detected opacity, method — each with an **✕** that removes *just that one* and replays the rest |
| **⇉ Apply marks to all photos** | Runs this photo's ops across the whole batch. Disabled with fewer than 2 photos. |
| Downloads | "↓ This photo" and "↓ Download all" |
| Status line | A running sentence with **bolded** numbers |

### The model underneath — it constrains the UI

Each photo holds its **original pixels** plus an **ordered list of ops**. The canvas is
always the original replayed through those ops. That's what lets one mark be pulled out
of the middle of the list without disturbing the others — a genuinely good design, and
the reason non-linear undo works here and nowhere else on the platform.

Detection reports real numbers (match score, detected opacity, chosen method) because
the result isn't guaranteed — above ~60% opacity the un-blend amplifies noise and the
tool switches to pure fill. Removal is **exact** at low opacity and **reconstructed** at
high opacity, and the UI is honest about which happened. **Preserve that honesty.**

---

## 4. What they share

- The same wordmark artwork, and both process entirely in-browser
- "Nothing is uploaded" as an explicit promise, stated in both footers
- Multi-file batches with a thumbnail strip and an active selection
- Per-image settings plus an "apply to all" escape hatch
  (Watermarker: color · Remover: the whole op list)
- Download-this / download-all
- Toast, hero display type, black sticky header, the same `:root`-ish tokens
- Cross-links to each other

---

## 5. What differs — the real design problem

| | Watermarker | Remover |
|---|---|---|
| **Access** | Public — any agent | **Members-only, hard redirect** |
| **Entry** | Files only | Files **or a URL** (via CORS proxy) |
| **Core gesture** | Pick settings, look at result | **Drag a box on the canvas** |
| **Interaction weight** | Instant, pure preview | Seconds of computation, `busy` flag, `await yieldUI()` |
| **Reversibility** | Stateless — change a setting, re-render | Ordered ops, undo, per-mark removal, replay |
| **Certainty** | Deterministic | Probabilistic — can fail with "✗ No match" |
| **Output** | JPEG q0.95, `_cb.jpg` suffix | Full canvas download |
| **Layout idiom** | Settings bar + gallery grid + large preview | Photo strip + single stage canvas + marks list |
| **Fonts** | Object Sans embedded as base64 (2 faces) | **Declares `'ObjectSans'` but never loads it** — silently renders in system-ui |

### Five decisions the design has to make

1. **What happens to the members gate?** Today the remover hard-redirects. Options: keep
   removal gated inside a shared shell (mode disabled with an explanation), open it to
   everyone, or gate only the expensive path. **Note the existing bug:** the dashboard
   card for the remover carries an `Internal` chip in the *Internal Tools* tab, not a
   `Members` chip — so agents see a card that bounces them home with no message. Whatever
   is decided, this needs to stop.
2. **Is it one mode switch, or one continuous flow?** A photo could plausibly need both
   (strip a mark, restamp it in the right corner). Add/Remove as a toggle is the obvious
   answer; a pipeline where both are steps on the same batch is the ambitious one.
3. **Do the hidden dev tools come out of hiding?** Position, opacity and size are the
   settings that most change the output and they're behind a faint word in the footer.
   If they surface, they need to not overwhelm the two settings that matter daily.
4. **Can the two batch models be one?** Both hold an array of photos with an active index
   and per-photo settings. Unifying the strip/gallery, the selection model, and the
   download controls is most of the win — and would make "apply to all" mean one thing.
5. **Where does "Virtually Staged" belong?** It's a legal disclosure, not a style option,
   and it currently sits beside Color as a peer.

### Constraints on combining

- **Don't flatten the remover's honesty.** The match score, detected opacity, and chosen
  method must stay visible. Users need to know whether they got an exact recovery or a
  reconstruction.
- **Don't lose non-linear undo.** Per-mark ✕ with replay is the remover's best feature.
- **Removal is slow.** Design real busy states — it blocks on computation, unlike
  anything else on the platform.
- **The remover currently has no brand font.** Fix in the merge: embed the same two
  base64 faces the watermarker carries.
- **Keep the local-processing promise visible.** It's the reason agents trust the tool
  with client photos.

---

## 6. DOM hooks

**Watermarker:** `cta-hero` · `drop-zone` · `image-file` · `drop-icon` · `add-btn` ·
`settings-bar` · `color-note` · `apply-all-btn` · `vs-btn` · `dev-tools-bar` ·
`dev-tools-toggle` · `position` · `opacity-slider` · `opacity-label` · `size-segment` ·
`gallery-wrap` · `gallery-grid` · `gallery-counter` · `gallery-total` · `preview-large` ·
`preview-canvas` · `btn-dl-single` · `preview-filename` · `toast`

> Its handlers are inline `onclick=`/`onchange=` attributes calling globals
> (`addFiles`, `resetAll`, `onColorChange`, `applyColorToAll`, `toggleVS`, `setSize`,
> `setOpacity`, `rerenderAll`, `downloadSingle`, `toggleDevTools`). Since this is a
> merge, those will be rewritten — no need to preserve the attribute style.

**Remover:** `input-card` · `dz` · `file` · `url` · `btn-url` · `work-card` · `strip` ·
`mode-auto` · `mode-fill` · `fill-cr` · `fill-pm` · `btn-undo` · `btn-reset` · `stage` ·
`overlay` · `status` · `marks` · `btn-apply-all` · `btn-dl` · `btn-dl-all` · `toast`

Because this is a combination, an **old → new mapping table is expected** rather than
preserved ids. The wiring will be a rewrite either way — the mapping is what makes it
tractable.

---

## 7. Known problems

**Watermarker**
1. The settings that matter most (position, opacity, size) are hidden behind a faint
   word in the footer.
2. Hero type size is computed in JS from the drop zone's measured height — layout logic
   living in a script.
3. Per-image vs. all-image color is signalled by a small note that only appears in
   multi-file mode; easy to change one photo thinking you changed all.
4. Functional tiles (add-more, download-all) are mixed into the photo grid, so the grid
   holds three kinds of thing.
5. Unselected thumbnails at 45% opacity read as disabled.
6. "Virtually Staged" is a legal disclosure presented as a styling toggle.
7. Export is JPEG-only at q0.95 — a PNG in, a JPEG out, with no say in it.

**Remover**
1. **No brand font.** Declares `'ObjectSans'`, never loads it.
2. Header shows a plain text "casa blanca" span instead of the logo every other tool uses.
3. Members gate is a silent redirect — no message, and the dashboard card doesn't warn.
4. The four-line algorithm explainer in the hero is doing the work an interface should.
5. Two axes of algorithm choice (Mark × Fill) are exposed as four peer buttons in one
   row, with jargon labels — "Structure-first" vs "Texture", "Casa Blanca" vs "Anything".
6. The core gesture — drag a box — is discoverable only from a status line.
7. Failure is a red-free plain sentence plus a "✗ No match" toast; recovery advice is
   buried in the same sentence.
8. "⇉ Apply marks to all photos" is a heavy, hard-to-undo batch action sitting as a
   normal-weight button.

**Both**
9. Two tools, two layouts, two idioms for the same batch-of-photos job.
10. Neither has autosave of any kind. Reload and the batch is gone.

---

## 8. Questions worth answering in the design

- One page with an Add/Remove mode switch, or one flow where both are available per photo?
- Should the batch strip be shared chrome — one photo list, one selection, one download
  cluster — with only the working area swapping between modes?
- How much of the removal algorithm should the user see? Can "Structure-first vs Texture"
  become a choice about the *photo* ("mostly straight lines" vs "grass, sky, fabric")
  rather than about the algorithm?
- Should removal offer a suggested box (auto-detect the mark) rather than requiring the
  drag every time?
- What does a signed-out agent see where removal would be?
- Does the combined tool keep two dashboard cards, or become one?
