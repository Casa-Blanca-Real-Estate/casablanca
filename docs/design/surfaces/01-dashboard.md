# Surface 1 — Creative Studio Dashboard

> Read [`../README.md`](../README.md) first. It carries the brand system, the technical
> constraints, and the deliverable contract that apply to every surface.

**File:** `index.html` (single file, CSS and JS inline)
**Route:** `/` — the front door of the whole platform
**Reference:** `home-legacy.html` is the previous, non-tabbed version
**Prior planning doc:** `docs/homepage-tabs-and-live-edit-plan.md`

---

## STATUS — redesign shipped 2026-08-28

**This brief describes the OLD dashboard.** The redesign came back as the Claw design
pass and is now live in `index.html`; everything below §4 documents what was replaced.
Read it for history, not for current state.

What shipped: a single-column list (one row per tool), four tabs — Home · Instagram ·
Print & forms · Photos — a fixed left sidebar (next workshop, utilities, theme switch,
feedback), and a Day/Night palette. Tools reuse these primitives: `.trow`, `.badge`,
`.rail` + `.preview`, `.ucard`, `.themebtn`, and the `:root` token block.

**DOM hooks — old → new.** Kept as-is: `workshop` · `wMonth` · `wDay` · `wTitle` ·
`wMeta` · `wEdit` · `whatsnewBtn` · `devBtn` · every `wsModal` / `clModal` /
`loginModal` field · `workshop-data` · `cl-data` · `igGlyph`.

| Old | New | Note |
|---|---|---|
| `tabs` + `data-tab` | `tabs` + `data-tab` | Now four `<a href="#…">`; hash routing, `aria-current` marks the active tab |
| `membersTab` | — | Gone. Team-badged rows simply aren't rendered when signed out |
| `p-home` / `p-instagram` / `p-internal` / `p-brand` / `p-members` | `toolList` | One list, re-rendered per tab from the `TOOLS` inventory |
| `igGlyph` (gradient fill) | `igGlyph` (`currentColor`) | Same id; recoloured so the tab and the row icon can share it |
| — | `toolSearch` · `themeBtn` · `feedbackBtn` · `acctTile` · `acctName` · `tabHeading` · `tabSubline` · `tabCount` · `noteCell` · `comingNext` · `emptyState` | New |

**Still open** (carried from the pass): real tool screenshots for the hover preview;
samples for For sale roundup, In contract and Ordering guide (dashed placeholder until
they land); the sub-900px breakpoint, which is a holding pattern, not a design.

---

## 1. What this page is for

It is the launcher. An agent lands here and needs to get into the right tool in one or
two clicks. Secondarily it's a noticeboard: the next workshop and a "what's new" log.
Signed-in devs also edit both of those from here.

Everything on the page is either **a way into a tool**, **a piece of news**, or **the
dev mode switch**.

---

## 2. Full element inventory

### 2.1 Header (black bar)

| Element | Content | Notes |
|---|---|---|
| Logo | `assets/cb-logo-white.png`, 22px tall | |
| Eyebrow | "Creative Studio" | 10px / 800 / `.32em` tracking / accent color. Hidden below 760px. |
| Brand Assets pill | Icon + "Brand Assets" → `tools/brand/` | Accent fill, plum text, 999px radius. A deliberate fast path that duplicates the Brand tab. |

### 2.2 Hero (black, continues from header)

- `h1`: "The Casa Blanca *Creative* Studio." — the word *Creative* is italic, weight 400,
  accent color, inside an otherwise 800-weight tight-tracked heading.
- `p`: "In-house tools for the brand — carousels, cards, watermarks, headshots and more."

### 2.3 Tab bar

Sticky (`top: 0`), horizontally scrollable, bottom hairline. Active tab: plum text +
2px accent underline. Tabs deep-link via `location.hash` (`#home`, `#instagram`, …)
and the page restores the tab from the hash on load.

| Tab | `data-tab` | Panel id | Visibility |
|---|---|---|---|
| Home | `home` | `p-home` | always (default) |
| Instagram & Content | `instagram` | `p-instagram` | always |
| Internal Tools | `internal` | `p-internal` | always |
| Brand | `brand` | `p-brand` | always |
| Members | `members` | `p-members` | **only when signed in** (`#membersTab` toggles `hidden`) |

### 2.4 Workshop banner — Home panel only, conditional

A plum-gradient card, hidden entirely when there's no upcoming date.

| Part | Detail |
|---|---|
| Date chip | 46×46 accent square: month abbreviation over day number. Hidden below 560px. |
| Eyebrow | "Next workshop" — 10px / 800 / `.26em` / accent |
| Title | e.g. "Social Media & Content Workshop" |
| Meta line | `Thursday, Jul 16 · 11:00 AM · at the office · every other Thursday`, assembled from whichever fields exist. If the workshop is a one-off whose date has passed: *"Next date TBA — check with the team. (Usually every other Thursday.)"* |
| Edit button | Top-right, `hidden` unless signed in. Opens the workshop modal. |

The date is **self-advancing**: a repeating workshop stores an `anchor` date plus
`recurEveryDays` (14), and the page rolls the anchor forward until it lands on or after
today. So the card is always showing a future date without anyone touching it.

### 2.5 Tool cards — the main content of four panels

One card component, used everywhere. Anatomy:

```
[ thumbnail 16:10 ]        ← either a real screenshot (assets/thumbs/*.jpg,
                             object-fit:cover, top-left anchored) or a
                             "placeholder" variant: plum radial gradient +
                             a line-art SVG + a small caption strip
[ chips        ]           ← 0–2 category chips
[ h3 title     ]
[ p description]           ← flexes to push the link down, so cards in a row align
[ "Open →"     ]           ← the arrow nudges 3px right on card hover
```

Hover: lifts 3px, border turns accent, soft plum shadow.
Grid: `repeat(auto-fill, minmax(250px, 1fr))`, 22px gap, max page width 1200px.

**Chip taxonomy** (each has its own color pairing):

| Chip | Colors | Used for |
|---|---|---|
| Instagram | plum on accent, with a gradient Instagram glyph | Social carousel builders |
| Internal | warm grey on `--paper2` | Internal tools |
| Brand | same style as Internal, different label | Brand sub-cards |
| Members | white on plum | Dev-only tools |
| Form | warm grey on `--paper2` | External form links |
| Mailchimp | near-black on `#ffe01b` | The one Mailchimp-backed form |
| PDF | white on `#b4452f` | PDF downloads |

> The Instagram glyph is defined once as an inline SVG `<symbol id="igGlyph">` with a
> radial gradient, then `<use>`d by every chip. Keep that pattern.

### 2.6 Complete tool inventory

`✓` = card appears in that panel. Note the deliberate duplication: Home is a
"most used" shortcut list, so its three cards also live in their real category.

| Tool | Route | Chips | Thumb | Home | IG | Internal | Brand | Members |
|---|---|---|---|:--:|:--:|:--:|:--:|:--:|
| Editorial Carousel Builder | `tools/carousel/cb_editorial.html` | Instagram | `editorial.jpg` | ✓ | ✓ | | | |
| Closed Carousel Builder | `tools/closed-carousel/` | Instagram | `closed.jpg` | ✓ | ✓ | | | |
| For Sale Roundup Builder | `tools/forsale-carousel/` | Instagram | `forsale.jpg` | | ✓ | | | |
| Brand Assets | `tools/brand/` | Internal | placeholder | ✓ | | ✓ | | |
| Business Card Generator | `tools/business-card/` | Internal | `bizcard.jpg` | | | ✓ | | |
| Watermarker | `tools/watermarker/` | Internal | `watermarker.jpg` | | | ✓ | | |
| Business Card Ordering Guide | `assets/biz-card-ordering-guide.pdf` ↗ | Internal + PDF | placeholder | | | ✓ | | |
| ISO Request Form | Google Forms ↗ | Form + Mailchimp | placeholder | | | ✓ | | |
| Logos | `tools/brand/#logos` | Brand | placeholder | | | | ✓ | |
| Colors | `tools/brand/#colors` | Brand | placeholder | | | | ✓ | |
| Typography | `tools/brand/#type` | Brand | placeholder | | | | ✓ | |
| Guidelines | `tools/brand/#guidelines` | Brand | placeholder | | | | ✓ | |
| Profile Pic Generator | `tools/profile-pic/` | Members | `profilepic.jpg` | | | | | ✓ |
| In Contract Roundup Builder | `tools/incontract-carousel/` | Members | `incontract-template-ref.png` | | | | | ✓ |

↗ = opens in a new tab.

Each panel also has a `.panel-intro` line above its grid:
- Home — "Most used — jump straight in."
- Instagram & Content — "Social carousels & content builders."
- Internal Tools — "Brand assets & production utilities."
- Members — "Signed-in members & dev tools."

### 2.7 Brand panel feature block

Above the Brand grid: a plum-gradient panel with a heading ("The Casa Blanca brand
kit."), a paragraph, an accent CTA button to `tools/brand/`, and a **palette peek** —
six 46px swatches showing `#0f0f0f`, `#aaa3cf`, `#1e1a2e`, `#f4f3f0`, `#e8e6e0`,
`#ffe01b`.

### 2.8 Footer (black)

Logo, the line "Creative Studio · built in-house", and two ghost buttons:

- **What's new** — opens the changelog modal. Carries an 8px accent dot in its top-right
  corner when the newest entry hasn't been seen (compares newest entry date against
  `localStorage.cb_changelog_seen`). Opening the modal clears the dot.
- **Dev** — opens the sign-in modal. When signed in, its label becomes
  "Signed in · Log out" and it takes the accent outline; clicking then signs out.

### 2.9 Modals — three of them

All share: full-screen scrim `rgba(10,9,15,.62)` + 3px backdrop blur, white rounded box,
click-outside-to-close, a `.err` line for messages.

**A · Dev sign-in** (`#loginModal`, 380px)
Heading "Dev sign-in", explainer, one email input, error line, Cancel / Sign in.
Enter submits. On success: store email, close, apply dev mode, jump to the Members tab.
On failure: *"That email isn't on the list."*

**B · What's new** (`#clModal`, 520px, scrolls, left-aligned)
- When signed in, an **add-entry block** at the top on a `--soft` background: a date
  picker + title on one row, a textarea ("Items — one per line"), a "Publish update"
  button, and an error/status line. Hidden for everyone else.
- The entry list. Each entry: uppercase date, title, bulleted items, hairline separator.
  When signed in, each entry also gets a red text "Delete" button top-right which
  confirms before deleting *for everyone*.
- A "Close" button at the bottom.

**C · Edit next workshop** (`#wsModal`, 460px)
Fields: Title · Date + Time (two-up) · Location + Cadence (two-up) · a checkbox
"Repeat automatically every other week (the date rolls forward on its own)" · error
line · Cancel / Save.
The Date label changes to **"Start / next date"** when Repeat is checked. Saving POSTs
to the backend; the button disables and the error line shows "Saving…", then either
closes or shows the failure.

---

## 3. State model

| State | Source | Affects |
|---|---|---|
| Signed in | `localStorage.cb_auth` ∈ allowlist | Members tab visible · workshop Edit button · changelog add-form and Delete buttons · Dev button label & style |
| Active tab | `location.hash`, default `home` | Which panel renders |
| Changelog unseen | newest entry date ≠ `localStorage.cb_changelog_seen` | Accent dot on What's new |
| Workshop present | computed next date exists | Whole banner shows or hides |
| Backend reachable | fetch outcome | Live content vs. inline fallback; save success/failure messages |

---

## 4. Data contracts

**Endpoint:** `GET|POST {backend}/.netlify/functions/site`

```jsonc
// GET response
{
  "workshop": {
    "title": "Social Media & Content Workshop",
    "date": "",                 // fixed one-off date, OR…
    "anchor": "2026-07-16",     // …a repeating anchor
    "recurEveryDays": 14,
    "time": "11:00 AM",
    "location": "the office",
    "cadence": "every other Thursday"
  },
  "changelog": [
    { "date": "2026-06-23", "title": "Brand Assets + tabbed home", "items": ["…", "…"] }
  ]
}
```

POST accepts `{workshop}` (replace whole object), `{entry}` (prepend one changelog
entry), `{changelog}` (replace array), or `{deleteChangelogDate}`. Server caps: title
140 chars, item 400 chars, 20 items per entry, 50 entries total.

**Progressive enhancement, important:** the page ships inline `<script
type="application/json">` fallbacks (`#workshop-data`, `#cl-data`) that render
immediately, then a background fetch replaces them if the backend answers. If the
backend is unreachable the page is fully functional with stale content. Preserve this —
never let the page show a spinner or an empty state waiting on the network.

---

## 5. DOM hooks the JS binds to

Keep these ids, or supply an old → new mapping.

**Tabs & panels:** `tabs` · `membersTab` · `p-home` · `p-instagram` · `p-internal` ·
`p-brand` · `p-members` (tabs are matched by their `data-tab` attribute)

**Workshop:** `workshop` · `wMonth` · `wDay` · `wTitle` · `wMeta` · `wEdit`

**Workshop modal:** `wsModal` · `wsTitle` · `wsDate` · `wsDateLbl` · `wsTime` ·
`wsLoc` · `wsCad` · `wsRepeat` · `wsErr` · `wsCancel` · `wsSave`

**Changelog:** `whatsnewBtn` · `clModal` · `clList` · `clAdd` · `clDate` · `clTitle` ·
`clItems` · `clSave` · `clErr` · `clClose` (delete buttons are found via the
`data-cldel` attribute)

**Auth:** `devBtn` · `loginModal` · `emailInput` · `loginErr` · `goBtn` · `cancelBtn`

**Inline data:** `workshop-data` · `cl-data`

**SVG:** `igGlyph` (+ its `ig` gradient)

---

## 6. Known problems — what "messy" means here

Observations from the code, not prescriptions. Solve them however the design wants.

1. **Cards duplicate across tabs.** Editorial, Closed and Brand Assets each appear
   twice. Home is meant to be a shortcut layer, but nothing visually signals "this is a
   shortcut, not a separate thing," so the tool count looks inflated.
2. **The tab set mixes axes.** Home (recency/frequency), Instagram & Content (output
   channel), Internal Tools (audience), Brand (subject), Members (permission). Five
   tabs, four different organizing principles.
3. **No search or filter.** Fine at 14 cards. Already a little unwieldy, and the tool
   count only goes up.
4. **The Brand tab is nearly all links out.** Its four cards are anchors into a
   different page's sections, plus a feature block that links to that same page, plus a
   header pill that links to that same page. Three routes to one destination.
5. **The changelog modal is doing two jobs.** It's a read surface for agents *and* an
   authoring form for devs, in the same 520px box, with the authoring form on top.
6. **Dev mode is an unexplained button in the footer.** "Dev" doesn't say what it does
   or who it's for, it's the least prominent element on the page, and it's the only way
   to reach the Members tools.
7. **Placeholder thumbnails vs. real ones are visually unrelated.** Six cards use
   screenshots, eight use a plum gradient with line art. The grid reads as two
   different systems.
8. **The workshop banner is orphaned.** It's the only piece of news on the page and it
   sits above a grid of tools with no relationship to it, only on the Home tab.
9. **Modal form styling is ad-hoc.** Inputs, two-up rows, and the checkbox row each
   carry inline `style` overrides rather than coming from a shared form component — the
   same underlying issue as the builder tools.
10. **No loading or error state for the live content fetch.** Silent success, silent
    failure. Save errors surface as small red text inside a modal.

---

## 7. Questions worth answering in the design

- Should Home stay a curated shortcut tab, become a genuine "recently used", or should
  the tabs collapse into one searchable/filterable surface?
- Do agents ever need to *find* a tool they've never used? If so, the card description
  is doing the explaining — does it need more room, or a different affordance?
- Should dev/members mode be a visible mode switch (a persistent indicator) rather than
  a hidden fifth tab?
- Where does news belong — a banner, a sidebar, a dedicated tab, or the footer?
- Is the `assets/thumbs/*.jpg` screenshot approach worth keeping, or should every card
  get a consistent designed thumbnail? (If the latter, note that new artwork would need
  producing — flag it in `CHANGES.md`.)
