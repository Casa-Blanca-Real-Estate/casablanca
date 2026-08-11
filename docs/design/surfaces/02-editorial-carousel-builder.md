# Surface 2 — Editorial Carousel Builder

> Read [`../README.md`](../README.md) first. It carries the brand system, the technical
> constraints, and the deliverable contract that apply to every surface.

**File:** `tools/carousel/cb_editorial.html` — one self-contained file, ~335KB
(most of it base64 fonts + wordmark), ~1030 lines
**Route:** `/tools/carousel/cb_editorial.html`
**Canvas layout spec:** `tools/carousel/README.md` — the measured 1080×1350 geometry
**Sibling tools sharing this interaction model:** `tools/closed-carousel/`,
`tools/forsale-carousel/`, `tools/incontract-carousel/`

---

## 1. What this tool does

One listing → a multi-slide editorial Instagram carousel, exported as 1080×1350 PNGs.

The intended flow:

1. Paste a StreetEasy URL → **Import** pulls address, price, beds/baths/sqft, agent,
   description, listing status and the full photo gallery.
2. Auto-fill drops photos into slides in gallery order and writes captions with AI in
   the Casa Blanca voice.
3. The user adjusts — swaps photos, repositions and zooms them, edits copy, adds or
   removes slides, reorders them.
4. Download one slide or all of them.

**Draw the boundary clearly:** the canvas render (the actual slide artwork) is locked.
Its positions and type sizes were measured pixel-for-pixel off official brand templates.
This redesign is the *editor around* that canvas — the panels, fields, controls,
filmstrip, status, and flow.

---

## 2. Current layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ‹ Studio (injected, fixed)      [Feedback] [● email] (injected)  │
├──────────────────────────────────────────────────────────────────┤
│ BLACK HEADER   [logo]                    Editorial Carousel B…   │
│ BLACK SUBHEAD  One listing. / The editorial carousel.            │
│                A single property → a multi-slide post. Click any │
│                text or photo on the slide to edit it.            │
├─────────────────────┬────────────────────────────────────────────┤
│ EDITOR RAIL         │ STAGE                                      │
│ 392px fixed, white  │ ┌────────────────────────────────────────┐ │
│                     │ │ Slide 3 of 7 · Single A  [DL slide][DL │ │
│ ── .etop ──────     │ ├────────────────────────────────────────┤ │
│ Import panel        │ │        Zoom ──○──  drag to reposition  │ │
│  (collapsible)      │ │        ┌────────────────┐              │ │
│ Show placeholders ⬤ │ │        │                │              │ │
│ ●●●●●●◐ accents     │ │        │  canvas 1080   │              │ │
│ ── .ebody ─────     │ │        │        ×1350   │              │ │
│ (scrolls)           │ │        │  max-height    │              │ │
│  slide type eyebrow │ │        │  60vh          │              │ │
│  Slide name         │ │        └────────────────┘              │ │
│  [ field ]          │ ├────────────────────────────────────────┤ │
│  [ field ]          │ │ FILMSTRIP  ▯ ▯ ▯ ▯ ▯ ▯ ▯  [+ Add ▾]   │ │
│  …                  │ └────────────────────────────────────────┘ │
└─────────────────────┴────────────────────────────────────────────┘
                          [ toast, fixed bottom center ]
```

`body` is `height:100vh; overflow:hidden` — the page never scrolls; only the editor rail
body and the filmstrip scroll. Below 820px the rail stacks above the stage and gets
`max-height:46vh`. Below 560px the tool name in the header hides.

---

## 3. Full control inventory

### 3.1 Page header + subhead (black)

- Wordmark image (base64, injected into `#hlogo` at boot) + tool name
  "Editorial Carousel Builder" in 10px/800/`.2em` sand caps.
- Subhead block: `h1` "One listing.<br>The editorial carousel." (22px, 800, `.92`
  line-height, uppercase, `-.04em`) and a `p` explaining the click-to-edit interaction.

### 3.2 Editor rail — top block (`.etop`, fixed, doesn't scroll)

**Import panel** (`#impanel`) — collapsible, open by default. Header reads
**"1 · Import from StreetEasy"** with a chevron. Contents:

| Control | Detail |
|---|---|
| URL input | `#imUrl`, placeholder "Paste a StreetEasy listing URL, then Import" |
| **Import listing** | Dark button. Runs the scrape. |
| **Auto-fill slides ✨** | Ghost button. Distributes already-imported photos into slots, then writes captions. |
| **Captions only** | Ghost button. Runs the AI copy pass alone. |
| Auto checkbox | `#imAuto`, checked by default: "Auto-fill photos + captions right after import" |
| Hint line | Explains what Import fills |
| Status line | `#imStatus` — live progress ("Importing… 12s", "Reading the listing…", "✓ Captions written"), turns red on error |
| Photo tray | `#imTray` — a 4-column grid of imported photos as base64 thumbnails. Tap one to drop it on the current slide. Preceded by the hint "Tap a photo to drop it on the current slide:" |
| Footer row | Text links **Save now** and **Start fresh**, plus a save-state indicator (`• Unsaved` / `✓ Saved`) |

**Show placeholder text** — a labelled pill toggle. On by default. Ghosts unfilled
fields at 40% opacity on the canvas so the user can see what's still empty. Exports
always force it off regardless.

**Accent swatches** — six 20px circles (Purple / Golden / Green / Marine / Pink / Red)
plus a seventh conic-gradient swatch wrapping a native color input for a custom accent.
Selected state is a 2px black ring. This recolors *slide elements*, not the UI.

### 3.3 Editor rail — body (`#ebody`, scrolls)

Rebuilt from scratch every time the active slide changes. Starts with:

- Slide-type eyebrow — 10px / 800 / `.2em` / accent (e.g. "Detail · Single A")
- Slide name — 18px / 800 (e.g. "Single A 2")

Then the fields for that slide kind. **Field controls in the current system:**

| Builder | Renders |
|---|---|
| `fld()` | Label + single-line text input |
| `taField()` | Label + textarea (real newlines preserved) — *carries its own inline styles that don't match `.fld textarea`* |
| `richField()` | Label + a right-aligned **Bold** button + a `contenteditable` div. Stores text as bold/plain runs. |
| `seg()` | Label + a segmented button group (2–4 options, joined, active = black fill) |
| `slider()` | Label + a native range input, accent-colored |
| `dzField()` | Label + a click-or-drop zone. Empty: dashed border, "Click or drop image". Filled: the image with a small "remove" button. |
| `toggleRow()` | Inline label + pill toggle |
| `agentPicker()` | A search input + a dropdown list of matching agents with 30px thumbnails — *entirely inline-styled, outside the design system* |
| `divlabel()` | An uppercase section divider with a top hairline |
| `delButton()` | Full-width destructive button, "Delete this slide" |
| tips | A 14px circular `?` next to a label; hover shows a 190px dark tooltip |

Focus/active: the focused field gets an accent border + 3px accent glow, **and** the
corresponding region on the canvas gets a highlighted overlay. That two-way link is the
best idea in the current UI — preserve it.

### 3.4 Fields by slide kind

#### Cover — always slide 1, cannot be deleted or reordered

| Field | Control | Notes |
|---|---|---|
| **Deal side (whole post)** | Segmented: Sell side / Buy side | ⚠️ Post-level setting living inside a slide's editor |
| **Status (whole post)** | Segmented: Listed / Exclusive / In Contract / Closed | ⚠️ Same |
| Badge | Text | Placeholder derives from side+status. Free to override. |
| Badge color | Segmented: Black / White / Accent | |
| Cover photo | Dropzone (1080×1076) | + border toggle + border color |
| Subhead | Textarea — "press Enter for a hard line break" | Each line becomes an ALL-CAPS display line |
| Subhead alignment | Segmented: Left / Center / Right | |
| Subhead size | Slider 60–104 | |
| Subhead vertical position | Slider 0.02–0.92 | |
| Subhead color | Segmented: White / Black / Accent | |

#### Teaser

Address line · Price lead-in · Price · **divider: "Listing specs (Listed / Exclusive
posts) — fill any to switch the teaser to the MLS-style header."** · Beds · Baths ·
Sqft · Agent lead-in · Agent name · Photo (+ border) · Description (rich) ·
**✨ Condense description with AI** · Delete this slide

#### Single A
Photo (+ border) · Description (rich) · Delete

#### Single B
Photo, near full-bleed (+ border) · Overlay text (rich) · Text color · Text alignment ·
Text X position (slider .02–.6) · Text Y position (slider .05–.95) · Delete

#### Double A
Top photo (+ border) · Bottom photo (+ border) · Description, centered between photos
(rich) · Delete

#### Building / Neighborhood ("context")
Type segmented (Building / Neighborhood) · Name · Photo (+ border) · Description (rich)
· Delete

#### End · Contact
Address line · Price · then **per agent (1 or 2)**: a divider "Agent N", the agent
library search picker, an upload dropzone ("…or upload your own (pre-formatted
square)"), an Instagram handle field, and a "Remove agent N" button when there are two.
Then "+ Add second agent" when there's only one. Then Contact line · Delete.

> Every photo dropzone is followed by an **"Image border (2px)"** toggle, and when it's
> on, a **Border color** segmented control (White / Accent / Black).

### 3.5 Stage head

- Nav label: `Slide 3 of 7 · Single A`
- **Download slide** (ghost) · **Download all** (dark). Download-all loops with a 350ms
  gap between files, no progress indication beyond a toast at the end.

### 3.6 Zoom row

`Zoom [range 1–3] drag image to reposition`. Shown **only** when the active slide has at
least one loaded image; hidden otherwise. Binds to the last-touched image on that slide,
or the first one.

### 3.7 Canvas

1080×1350, displayed at `max-height: 60vh`. Interactions:

| Action | Result |
|---|---|
| Click a text region | Focuses the matching field in the rail and scrolls it into view |
| Click an empty photo frame | Opens the OS file picker |
| Drag a filled photo | Pans it within its frame (clamped to the frame edges) |
| Hover | Cursor becomes pointer over text, grab over a filled photo, pointer over an empty frame |
| Active field | The region is outlined with a rounded accent stroke + 10% accent fill |

Hit regions are recorded during render with a 5px outward pad.

### 3.8 Filmstrip

70×87.5px live canvas thumbnails with a label under each ("Cover", "Teaser",
"Single A 2", "Building"…). Active = accent border. Mid slides are draggable to
reorder; the cover is locked to position 1. Drag states: `.dragging` at 40% opacity,
`.drag-over` shows a dashed accent border.

At the end: **a native `<select>` styled as a dashed thumbnail-sized tile**, reading
"+ Add slide ▾", with options Teaser / Single A / Single B / Double A / Building /
Neighborhood / End slide.

### 3.9 Toast

Fixed bottom-center, black pill, uppercase 11px/800/`.15em`, auto-dismiss 2.6s.
Messages: `✓ Downloaded slide` · `✓ Downloaded all` · `✓ Headshot placed` ·
`Could not load headshot` · `Condensing description…` · `✓ Description condensed` ·
`Condense failed: …` · `Add or import a description first` · `✓ Saved to this device` ·
`✓ Started fresh` · `↩ Restored your last session on this device` ·
`Keep at least one slide after the cover` · `This slide has no photo to replace` ·
`Sign in as Dev to save on this device` · `Nothing to save yet`

Note that the toast is doing several different jobs — success confirmation, refusal,
progress, and error — in one undifferentiated black pill.

---

## 4. State model

### Post-level (applies to the whole carousel)

| Key | Values | Where it's edited today |
|---|---|---|
| `accent` | 6 presets + custom | Top of rail |
| `showPlaceholders` | bool | Top of rail |
| `side` | `sell` / `buy` | **Inside the Cover editor** |
| `status` | `listed` / `exclusive` / `incontract` / `closed` | **Inside the Cover editor** |

Side + status drive derived defaults across slides:

| Status | Badge | Price lead-in (sell) | Price lead-in (buy) |
|---|---|---|---|
| Listed | LISTED | "Listed at" | "Listed at" |
| Exclusive | EXCLUSIVE | "Offered at" | "Offered at" |
| In Contract | IN CONTRACT | "In contract at" | "In contract at" |
| Closed | CLOSED | "Sold for" | "Acquired for" |

Agent lead-in: `with agent` (sell) / `by agent` (buy), abbreviating to `w/ agent` once
the name reaches 20 characters. Every derived string stays editable — they're defaults,
not locks. **None of this derivation is visible in the UI**; the user sees a placeholder
change and has to infer why.

### Slide-level

Deck = `cover` + an ordered array of mid slides. Default new deck:
Cover · Teaser · Single A · Double A · Building · Single B · End.
Minimum one mid slide (deleting the last one is refused with a toast).

Each image slot carries `{src, ox, oy, scale, border, bc}` — the pan offsets and zoom
are per-image and persist.

### Autosave — **dev-only**

Serialized to `localStorage.cb_autosave_editorial` (images inline as data URLs; on quota
failure it retries with image sources stripped). Triggers: every 15s, on `pagehide`, on
tab hide, and on **Save now**. Restores on load with a toast. A "• Unsaved / ✓ Saved"
indicator refreshes every 1.5s. **Start fresh** wipes the deck behind a native
`confirm()`.

For a signed-out agent, none of this runs — no autosave, no restore, and the save
indicator renders empty. Closing the tab loses everything, silently.

---

## 5. Backend contracts

**Listing import** — via `assets/se-import.js` → `window.CBImportStreetEasy(url, opts)`.
Async by design: POST to `streeteasy-import-background` (202 immediately), then poll
`streeteasy-status` every ~3s until `done` or `error`, with a 170s client timeout and a
fallback to the legacy synchronous endpoint if the async one isn't deployed. Imports
routinely take **30–90 seconds** — a real progress state matters.

```jsonc
{ "address": "", "neighborhood": "", "price": "", "beds": "", "baths": "",
  "sqft": "", "agent": "", "description": "", "heroImage": "",
  "photos": ["data:image/…"],       // base64 so canvas export stays untainted
  "warning": "", "blocked": false }
```

Import fills only **empty** fields — address, price, specs, agent, description and the
cover subhead are left alone if the user already typed them. The two exceptions are the
post **status** and the cover **badge**, which the import overwrites from the listing's
own status ("for sale" → Listed, "in contract" → In Contract, "sold"/"closed" → Closed).

> Endpoint note: `netlify/functions/README.md` lists `/api/import` and `/api/copy` for
> this tool. Those routes don't exist — there are no `/api/*` redirects in
> `netlify.toml`. The paths above are what the code actually calls.

**AI copy** — `POST /.netlify/functions/claude`, an Anthropic Messages proxy. Two uses:

1. *Write captions* — one call returns `{coverSubhead, teaser, slides[{heading, body}]}`
   for every mid slide. The prompt carries a **hard per-slide-kind word budget** derived
   from the canvas geometry (Single A/B and Building: 5 lines; Double A: 3 lines;
   Single B counts ~5 words/line, the rest ~9) because text that overruns is drawn off
   the frame.
2. *Condense description* — teaser-only, returns one or two tight sentences.

Both can fail; failures currently land in the small import status line or a toast.

> **Design consequence:** those copy budgets are real and invisible. A user typing into
> a description field has no idea how much text the slide can hold until they look at
> the canvas and see it overflow (or, on Double A, auto-shrink down to 26px). A visible
> capacity signal is one of the more valuable things this redesign could add.

**Agent headshot library** — `assets/agents/agents-taupe.json`, a name + filename index
fetched at boot, searched client-side, images at `assets/agents/<file>`.

---

## 6. DOM hooks the JS binds to

Keep these ids, or supply an old → new mapping.

**Chrome:** `hlogo`

**Import panel:** `impanel` · `imToggle` · `imChevron` · `imbody` · `imUrl` ·
`imImport` · `imFill` · `imAI` · `imAuto` · `imStatus` · `imTray` · `edSave` ·
`edFresh` · `ed-save-status`

**Rail:** `phToggle` · `accents` · `ebody`

**Stage:** `navlbl` · `dlOne` · `dlAll` · `zoomrow` · `zoom` · `big` (the canvas)

**Filmstrip:** `filmstrip`

**Toast:** `toast`

**Generated markup the JS depends on** (class contracts, since fields are built in JS —
if you rename these, the field builders need rewriting; that's fine, just flag it):

- `.fld` wrapper, with `data-fieldid="<id>"` — this is what links a canvas region to its
  input. Gets `.active` when focused.
- `.fld > label`, `.fld input[type=text]`, `.fld textarea`, `.rich`, `.seg`,
  `.seg button.on`, `.dz`, `.dz.has`, `.dz.drag`, `.dz .clear`, `.sw-toggle`,
  `.sw-toggle.on`, `.sw`, `.sw.on`, `.tip[data-tip]`, `.divlabel`, `.delbtn`, `.boldbtn`
- `.thumb`, `.thumb.on`, `.thumb.movable`, `.thumb.dragging`, `.thumb.drag-over`,
  `.thumb.add`, `select.addsel`, `.thumb canvas`, `.thumb .lbl`

**Canvas field ids** (the `data-fieldid` values used for click-to-edit):
`badge` · `subhead` · `address` · `price` · `beds` · `sqft` · `agent` · `desc` ·
`subtitle` · `contact` · `handle0` · `handle1`

---

## 7. Known problems — what "messy" means here

Observations from the code and from how the flow actually plays out. Not prescriptions.

1. **One long undifferentiated scroll.** The Cover has ten controls in a 392px rail with
   no grouping — content, styling and layout controls all stacked in one column with
   identical visual weight.
2. **Post-level settings are hidden inside a slide.** *Deal side* and *Status* change
   text on the Teaser and every derived lead-in, but they only exist in the Cover's
   editor. Nothing tells you they're global except the parenthetical "(whole post)" in
   the label.
3. **Labels are carrying instructions.** "Description · select text + Bold", "Subhead ·
   press Enter for a hard line break", "…or upload your own (pre-formatted square)". The
   label is a name; the instruction needs somewhere else to live.
4. **Three import buttons with unclear boundaries.** "Import listing", "Auto-fill slides
   ✨" and "Captions only" sit in one row with equal weight. Only one is the entry
   point; the other two are re-runs of stages that already happened automatically.
5. **The "1 ·" in the import header implies a wizard that doesn't exist.** There's no
   step 2.
6. **Destructive and AI actions share a component.** "✨ Condense description with AI"
   is styled with `.delbtn` — the same red-tinted class as "Delete this slide" — and both
   sit at the bottom of the same scroll. So does "+ Add second agent".
7. **Some controls are outside the design system entirely.** The agent picker, the
   `taField` textarea, and the import panel's inputs each carry their own inline styles
   with different border colors (`#d8d3c8`), radii (8px) and paddings than `.fld` (6px,
   `--cb-border`). Three visual languages in one rail.
8. **Copy capacity is invisible.** See §5. The tool knows each slide's word budget
   exactly and never shows it.
9. **No deck-level overview of what's missing.** Filmstrip thumbnails show the render,
   so an empty slide reads as "DROP IMAGE" grey — but there's no summary of which slides
   still need a photo or copy before export.
10. **The add-slide control is a native `<select>`** shaped like a filmstrip tile, and
    the seven slide kinds are named by layout ("Single A", "Double A") rather than by
    purpose. A new user cannot tell what "Single B" is without adding one.
11. **Save state is buried.** The "• Unsaved / ✓ Saved" indicator lives in the footer of
    a *collapsible import panel* — collapse it and the save state disappears.
12. **Autosave silently does nothing for agents.** The exact users most likely to lose
    work get no persistence and no warning.
13. **No undo.** Deleting a slide, "Start fresh", and re-running AI captions (which
    overwrites every description) are all unrecoverable. Two of the three are behind a
    native `confirm()`; re-running captions isn't behind anything.
14. **Long operations have thin feedback.** Import shows a seconds counter in a 12px
    grey line. "Download all" gives no per-file progress. AI failures appear as small
    red text that the next status message overwrites.
15. **Pan and zoom are barely discoverable.** Panning is only advertised by the words
    "drag image to reposition" in the zoom row, and the zoom row only appears once an
    image is loaded.
16. **The canvas is capped at 60vh** while the rail is a fixed 392px, so on a laptop the
    preview — the thing being made — is often the smallest region on screen.

---

## 8. Questions worth answering in the design

- What's the right home for post-level settings (side, status, accent, placeholders)?
  A header strip? A "Post" pseudo-slide at the head of the filmstrip? A settings tray?
- Should the rail be organized by **section** (Content / Photo / Layout / Style), by
  **progressive disclosure** (essentials visible, styling behind a disclosure), or by
  **task** (Import → Fill → Refine → Export)?
- Import takes 30–90 seconds and is the first thing a user does. Should it be a modal /
  full-screen first-run step rather than a collapsible panel in the corner of a rail?
- How should text capacity be shown — a character/line counter, a fill meter, a live
  overflow warning on the canvas, or something else?
- Is there a better naming scheme for slide kinds than "Single A / Single B / Double A"?
  (The layouts are fixed; the names are not.)
- Should the filmstrip carry per-slide readiness state (photo missing, copy missing)?
- Does the 392px rail / 60vh canvas split hold up, or should the stage lead — with the
  editor as an overlay or drawer near the region being edited?
- What should exist for a signed-out agent — should autosave apply to everyone?
