# Surface 3 — Closed Carousel Builder

> Read [`../README.md`](../README.md) first. It carries the brand system, the technical
> constraints, and the deliverable contract that apply to every surface.

**File:** `tools/closed-carousel/index.html` — one self-contained file, ~2980 lines
**Route:** `/tools/closed-carousel/`
**Near-identical sibling:** `tools/forsale-carousel/` (~2996 lines) is the same tool with
a different badge and template. Whatever is decided here should port to it directly, and
to `tools/incontract-carousel/` with more adaptation.

---

## 1. What this tool does

A **multi-deal announcement carousel**: one slide per closed deal, wrapped in a fixed
cover and a fixed end slide. Where the Editorial builder is *one listing, many angles*,
this is *many listings, one slide each*.

Deck shape is rigid:

```
COVER  →  D1  →  D2  →  …  →  Dn  →  END
 ↑                                    ↑
 "RECENTLY CLOSED" + hero photo       fixed artwork, accent-tinted only
```

Per deal: an agent photo, a property photo, an address, a neighborhood, a price, and a
short description. The typical session is 5–15 deals assembled in one sitting, usually
from a list of StreetEasy URLs — which is why **Bulk Create** exists and matters more
here than anywhere else in the platform.

The canvas render is locked, same as every builder. This redesign is the interface.

---

## 2. Current layout

Fundamentally different from the Editorial builder — a **top filmstrip over a single
scrolling column**, not a side rail beside a stage.

```
┌────────────────────────────────────────────────────────────┐
│ ‹ Studio (injected)                 [Feedback] [● email]   │
├────────────────────────────────────────────────────────────┤
│ BLACK HEADER  [logo]                     Closed Carousel   │  sticky
├────────────────────────────────────────────────────────────┤
│ FILMSTRIP  ▯COVER ▯D1—Hannah B ▯D2 ▯D3 … ▯END              │  resizable
│ [+ Deal][↑ Sort by Price][☰ Save][↓ All][✚ Bulk][⟲ New]    │  ← drag handle
│ ✓ Saved            click to select · hover to ↓ or 🗑 · …   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  FILL IN THE                                               │
│  BLANKS.                        ← 700px-ish column, scrolls│
│                                                            │
│  ┌ panel for the selected slide (cover | deal | end) ────┐ │
│  ┌ accent color bar (end slide only) ────────────────────┐ │
│  ┌ Session History ──────────────────────────── collapse ┐ │
│  ┌ Instagram Caption ────────────────────────────────────┐ │
│  ┌ Agent Library ────────────────────────────── collapse ┐ │
│  [ ↓ Download All N Slides ]                             │ │
│  Files never leave your device.          [ Start Over ]   │ │
│  ✶ Open build chat · v1.2 · May 27, 2026      ⚙ Dev       │ │
└────────────────────────────────────────────────────────────┘
```

**There is no persistent large preview.** The filmstrip thumbnails are the only view of
the work until you open the **lightbox** (click a thumbnail) — a full-screen overlay with
prev/next, a label, and a download button.

The filmstrip is **user-resizable** by dragging a handle beneath it (100–300px, also
`[` / `]` keys), with the height written into a `--strip-item-h` custom property.

---

## 3. Full element inventory

### 3.1 Filmstrip

Each item: an uppercase label above a live 1080×1350 canvas thumbnail.

| Label | Slide |
|---|---|
| `COVER` | index 0 |
| `D1 — Hannah B` / `D1` | deals, labelled with the agent name once known |
| `END` | last |

Per-thumbnail hover buttons: **↓** (download this slide) on every slide, **🗑** (remove
deal) on deal slides only. Deal slides are draggable to reorder; drop target shows an
amber border, dragged item drops to 35% opacity. Cover and End are pinned.

### 3.2 Filmstrip action bar

| Button | Does |
|---|---|
| **+ Deal** | Append an empty deal |
| **↑ Sort by Price** | Reorder every deal high → low by parsed price |
| **☰ Save** | Save the session to history *without* downloading |
| **↓ All** | Download every slide |
| **✚ Bulk Create** | Open the bulk modal |
| **⟲ New** | Clear everything (native `confirm()`) |
| save status | `✓ Saved` / `• Unsaved` / **`Not signed in`** (red) |
| hint text | "click to select · hover to ↓ or 🗑 · drag to reorder" |

### 3.3 Panels — one shows at a time, driven by the selected slide

**Cover panel** — a two-column card:
- *Left:* "Hero Photo" dropzone, plus a **"When no cover uploaded:"** `<select>` choosing
  which deal's property photo stands in as the cover background.
- *Right:* a **vertical** accent swatch column — the same six presets plus a native color
  input — with the note "Tints cover & end slide. Auto-detected from Deal 1 agent photo."

**Deal panel** — two cards:

*Photos* (two-up):
- **Agent Photo** dropzone → then a **＋ Save to library** button (appears only once a
  photo is loaded), an **agent library search** input with a results dropdown, and an
  **"Accent detected"** badge with a color dot that appears when a background color was
  sampled from the photo.
- **Property Photo** dropzone — supports drop, click, **and paste**, and once filled is
  replaced by an inline **pan + zoom manipulator**.

*Deal Info*:
- **StreetEasy URL** + **Fetch →** — label carries the aside "— paste to auto-fill below"
- Address · Neighborhood (two-up)
- Price (full width)
- Listing Description (textarea, 4 rows) with a **`0 / 280 chars`** counter and a
  **✦ Condense** button

**End panel** — a single note: *"The end slide is fixed — only the accent color below
affects it."* Nothing else.

**Accent Color bar** — shown for the End slide only (the Cover has its own embedded
copy, the Deal panel hides it). Six swatches + custom, plus a longer explanatory note.

### 3.4 Session History (collapsible)

Header row: "Session History" + a count, a **↓ Save JSON** button, an **⬆ Load JSON**
file label, a **Google Drive link** (a hard-coded folder URL, full-color Drive logo), and
a chevron. Body: the list of saved sessions.

Sessions persist to `/.netlify/functions/sessions` (Netlify Blobs, **last 3 only**,
server-enforced). Text only — no images.

### 3.5 Instagram Caption panel

Hidden on deal slides; shown on Cover and End.

A read-only textarea, then **✦ Cover / Range**, **✦ Deal Callout**, a character count,
and a **Copy** button (disabled until there's output). Footnote: "Pulls all deals from
the current session. Edit the output freely before copying."

The two caption formats are genuinely different products — one narrates the *breadth* of
the whole post, the other writes a line per deal.

### 3.6 Agent Library (collapsible)

- **Recently Spotlighted** — agents from the last 3 sessions ("last 3 sessions")
- **Bulk upload dropzone** — multi-file, names parsed from filenames
  (`hannah_b_SQ4_blue.jpg` → "Hannah B"), then an editable queue, then **⇧ Upload All**
- **Current Library** — the full grid, with **↻ Refresh**

Backed by `/.netlify/functions/agents` (Netlify Blobs).

### 3.7 Footer region

**↓ Download All N Slides** (primary, count in the label) · "Files never leave your
device. Nothing is uploaded." · **Start Over** · then a chat-foot line reading
**"✶ Open build chat · v1.2 · May 27, 2026"** and a **⚙ Dev** button.

### 3.8 Modals

**Bulk Create** — the workhorse. One row per deal; each row takes a StreetEasy URL and a
Fetch, or manual fields. **＋ Add Row**, **⚡ Fetch all URLs**, a status line, and
**Create Deals**. Descriptions are condensed on create; agent names matching the library
get photos attached automatically.

**Dev: AI Prompts** — three big textareas holding the live prompt templates (Condense,
Caption Cover/Range, Caption Deal-Callout), each with Save and "Reset to default".
Placeholders `{LISTING}` and `{DEALS}`. Stored per-browser in
`localStorage.cb_prompt_*`.

**Lightbox** — full-screen slide view: close (Esc), canvas, ← label →, and Download.

### 3.9 Toast

Same black pill pattern as the other tools.

---

## 4. State model

```js
S = {
  accent: '#aaa3cf',
  coverImg, coverSrc, coverOX, coverOY, coverScale,
  coverSourceIdx: 1,          // which deal's property photo backs the cover
  deals: [ { agentImg, agentSrc, agentName,
             propImg, propSrc, propOX, propOY, propScale,
             address, neighborhood, price, description } ]
}
activeIdx  // 0 = cover, 1..N = deals, N+1 = end
```

Derived: `stripLen() = 2 + deals.length`, `endIdx()`, `activeType()`.

**Accent auto-detection:** loading a Deal 1 agent photo samples seven points along its
top edge, discards near-black / near-white / low-saturation pixels, averages the rest,
and adopts that as the post accent — surfacing an "Accent detected" badge. Casa Blanca
agent headshots are shot on flat color backgrounds, so this usually lands.

### Autosave — **dev-only**, same pattern as the Editorial builder

`localStorage.cb_autosave_closed`, every 15s + `pagehide` + tab-hide, restore-on-load
toast, quota fallback that drops image data. Signed-out users get the literal red text
**"Not signed in"** where the save state would be — the clearest statement anywhere on
the platform that a whole capability is off, but no explanation of what to do about it.

### Keyboard

`←` / `→` move between slides · `Esc` closes modals and the lightbox ·
`⌘/Ctrl+Enter` submits · `[` / `]` resize the filmstrip

---

## 5. Backend contracts

| Endpoint | Use |
|---|---|
| `POST /.netlify/functions/streeteasy*` (via `assets/se-import.js`) | Listing fetch — single row and Bulk Create |
| `POST /.netlify/functions/claude` | Condense + both caption formats. Model: **`claude-haiku-4-5-20251001`** (the Editorial builder uses Opus for its copy — a deliberate speed/cost split). |
| `GET|POST /.netlify/functions/agents` | Agent headshot library |
| `GET|POST /.netlify/functions/sessions` | Session history, last 3, text only |

All AI prompts are user-overridable via the Dev modal.

---

## 6. DOM hooks the JS binds to

Keep these ids, or supply an old → new mapping. There are ~90 — a symptom in itself.

**Strip:** `strip-section` · `strip-scroll-wrap` · `strip` · `strip-resize-handle` ·
`btn-add` · `btn-sort` · `btn-quick-save` · `btn-quick-dl` · `btn-bulk` · `btn-clear` ·
`save-status`

**Panels:** `p-cover` · `p-deal` · `p-end` · `sw-section` · `sw-row` · `cust-sw`

**Cover:** `dz-cover` · `f-cover` · `th-cover` · `cover-source-sel` · `cover-sw-col` ·
`cover-cust-sw`

**Deal:** `dz-agent` · `f-agent` · `th-agent` · `btn-save-agent` · `agent-search` ·
`agent-results` · `accent-detected` · `accent-detected-txt` · `accent-dot` ·
`dz-prop` · `f-prop` · `th-prop` · `i-se-url` · `btn-se-fetch` · `i-addr` · `i-nbr` ·
`i-price` · `i-desc` · `char-cnt` · `btn-condense`

**History:** `history-panel` · `history-toggle` · `hist-count` · `hist-chevron` ·
`history-body` · `history-list` · `btn-save-json` · `f-import`

**Caption:** `caption-out` · `btn-caption-cover` · `btn-caption-callout` ·
`caption-char` · `btn-copy-caption`

**Library:** `lib-panel` (class) · `lib-toggle` · `lib-count` · `lib-chevron` ·
`lib-body` · `recent-agents` · `lib-dz` · `f-lib-bulk` · `lib-queue` · `lib-upload-row` ·
`btn-lib-upload` · `lib-upload-status` · `lib-current` · `btn-lib-refresh`

**Footer:** `btn-dl` · `btn-reset` · `chat-link` · `dev-tools-btn`

**Lightbox:** `lb-overlay` · `lb-close` · `lb-canvas` · `lb-prev` · `lb-next` ·
`lb-label` · `lb-dl-btn`

**Dev modal:** `dev-modal` · `dev-modal-close` · `prompt-condense-edit` ·
`prompt-condense-save` · `prompt-condense-reset` · `prompt-caption-cover-*` ·
`prompt-caption-callout-*`

**Bulk modal:** `bulk-modal` · `bulk-modal-close` · `bulk-rows` · `bulk-add-row` ·
`bulk-fetch-all` · `bulk-status` · `bulk-create-btn`

**Toast:** `toast`

---

## 7. Known problems

1. **No persistent preview.** The thing being made is only visible as a ~143px thumbnail
   unless you open a modal. Every other builder on the platform shows the live slide.
2. **One scrolling column mixes four unrelated jobs.** Slide editing, session history,
   caption generation, and agent-library administration are stacked vertically with equal
   weight. Library management in particular is an admin task that has nothing to do with
   building the current post.
3. **The accent control exists in three places** with three different layouts: embedded
   vertically in the Cover panel, as a horizontal bar for the End slide, and hidden
   entirely on Deal slides — for one post-level setting.
4. **The End panel is an empty room.** Selecting End shows one sentence explaining that
   there's nothing to edit, then the accent bar appears below it.
5. **Bulk Create is the real entry point and it's the fifth button in a toolbar.** For a
   10-deal post, nobody adds deals one at a time — yet the single-deal path is the
   default and bulk is a modal behind a `✚`.
6. **Two AI caption formats, no way to tell them apart.** "✦ Cover / Range" vs
   "✦ Deal Callout" — the difference is real and significant but undocumented in the UI.
7. **Icon-prefixed button labels are doing the categorizing.** `+ Deal`, `↑ Sort by
   Price`, `☰ Save`, `↓ All`, `✚ Bulk Create`, `⟲ New`, `✦ Condense`, `⇧ Upload All`,
   `↻ Refresh`, `⬆ Load JSON` — ten different glyphs, no system.
8. **Save vs. Save vs. Save.** `☰ Save` (to history), `↓ Save JSON` (to disk), the
   autosave indicator, and the sessions backend all mean different things and are never
   distinguished.
9. **Destructive actions are everywhere and inconsistent.** `⟲ New` in the toolbar and
   `Start Over` in the footer both reset; per-deal 🗑 appears on hover with no undo.
10. **"Not signed in" in red** is the only feedback a signed-out agent gets about losing
    autosave — no explanation, no way in from this page.
11. **Session history caps at 3** server-side, but the UI says "last 3 sessions" only in
    the Agent Library sub-header. The cap is invisible where it matters.
12. **A hard-coded Google Drive folder link** sits in the history header with a
    full-color third-party logo — the only non-brand color in the tool's chrome.
13. **A stale build-chat link** in the footer: "✶ Open build chat · v1.2 · May 27, 2026"
    pointing at `https://claude.ai`. Not a user-facing feature.
14. **The 280-character counter is unexplained.** It's there because the render fits
    about four lines — but nothing says so, and nothing stops you exceeding it.
15. **The property photo dropzone silently becomes a pan/zoom manipulator** once filled,
    changing component identity in place.
16. **Inline `style=` attributes throughout the markup** — the strip hint, the save
    status, the cover-source select, the library sub-headers, and most buttons carry
    their own overrides rather than classes.

---

## 8. Questions worth answering in the design

- Where does the preview live? A persistent stage like the Editorial builder, a bigger
  filmstrip, or an always-open lightbox?
- Should the four stacked concerns split into modes/tabs (Build · Caption · Library ·
  History), or should library and history move out of the tool entirely?
- Should bulk entry be the default path, with single-deal entry as the exception?
- Deal slides are a repeating record. Would a table/list editor beat a one-slide-at-a-time
  form for 10+ deals — and if so, how does per-deal photo placement fit?
- What's the right home for one post-level accent control?
- Should the two caption formats be shown as a choice with previews rather than two
  identical buttons?
- This tool and `forsale-carousel/` are near-identical, and `incontract-carousel/` is
  close. Should the design be explicitly parameterized so one layout serves all three?
