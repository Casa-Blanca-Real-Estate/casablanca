# New comp: the button, then the target property in steps — the build brief

**For the build thread** (Mason's lane, ported by Casanova). Designed with Kimani on the design canvas, 2026-11-11;
this file is the hand-off. Signed: the design session (claude/loving-cerf-6nx1a5). Its companions:
`reports-and-workspace.md`, `send.md`, `email-restyle.md`.

**The spec is the canvas.** https://claude.ai/artifact/1zFam3mkm1orxhCrLmhx8W (Comp Report Design), page
**"New comp · round 1"**, artboard **"P1 · + New comp expands → Start → the multi-step window"**
(`project/NewComp.dc.html`). Press Play. Read it with the Artifact tool (`action: read`,
`path: project/NewComp.dc.html`); its markup and its `renderVals()` are the reference for layout and behaviour,
not code to paste. The page **"Live today"** has production (#165) captured screen by screen, for comparison.
The bottom-right "CANVAS ONLY · SAMPLE LINK / SAMPLE ADDRESS" control is the canvas's, not the app's.

The code: `src/views/newcomp/` (`NewComp.tsx`, `Frame.tsx`, `Home.tsx`, `Details.tsx`, `HomeHero.tsx`, `inputs.tsx`),
`src/views/Reports.tsx`, Hubert's panel in `src/views/hubert/`, the facts in `workspace/state.ts` and
`workspace/features.ts`, and Hubert's `set_home_fact` in `server/assistant.ts`.

## 1. Starting: the button morphs (decided)

- Reports keeps **+ NEW COMP** in the row with "Your reports". Clicking it grows a field out to its left
  ("Paste a StreetEasy link, or type the address": it slides open and fades in) and the button itself becomes
  **START →**. A × folds it back. Enter starts; Esc folds it back.
- **The hero's Start with Hubert field goes** (`HomeHero.tsx`). The hero keeps Pick up where you left off.
- **No sample links under the field.** A dev fill, if one's wanted, goes somewhere team-only, not here.
- START makes the report with today's `startReport()`, so today's step 1 ("Which home?") is gone:
  - a **link** opens the window with the home being read;
  - a **typed address** opens it with every field empty.
  - Buyer or seller, the type, the client and the budget move into the window's first step (Basics).

## 2. The window gets its own page (decided)

- When the window opens, Reports goes: nothing behind it but the page colour and the Studio's top bar.
  No overlay on top of Reports.
- **Hubert's panel is on the left**, before the window: the agent tells him, and he fills the fields. It slides in
  from the left as the window fades in from the right, and opens by default.
- The window is centred in the space beside the panel, vertically too, and moves as the panel opens, closes or is
  resized.
- **The panel resizes:** drag the seam on its right edge (lavender `#aaa3cf` on hover, focus or drag), 300–640px,
  double-click resets to 400, arrow keys when the seam has focus. Closed, it leaves a ✦ HUBERT tab on the left edge;
  the top bar's ✦ HUBERT and the panel's ‹ toggle it.

## 3. The window (decided)

Top to bottom:

1. **TARGET PROPERTY** (the label; **COMPS TO COMPARE** on the last step) and ×.
2. **The home:** thumbnail, address, a line of what was read (type · neighborhood · beds · baths · floor). At the
   right, the **StreetEasy logo ↗** button opens the listing, with **● Filled from StreetEasy** under it: that's where
   the dot is explained. A typed address shows **+ Add its [StreetEasy] link** instead.
   - While the listing is read, a **0–100% counter in Object Sans Heavy** counts up at the right. It replaces the
     progress bar. Kimani wants this counter for any fetch that fills fields.
3. A line, then **the step rail**: seven segments with "n · Name" under each. Any step reached can be jumped to.
   A segment's bar fills when it's first reached.
4. **The step's title**, large and regular weight (32px, 400).
5. The step's fields, then its **Notes** (every step but Basics).
6. The footer: **← BACK** at the left (on Basics it goes back to Reports). At the right: ✓ Saved as you go,
   Skip for now (on the four optional steps), **NEXT: [STEP] →**; on the last step, **OPEN WORKSPACE →**.

**Between steps** only the step's content moves: in from the right going forward, from the left going back (0.32s).
The window scrolls up and down only. Its scrollbar is thin, white with a black edge, with no arrow buttons.

A lavender dot after a field's **label** (never on the value) marks what came from StreetEasy.

**Field labels are regular-weight caps in black** (Kimani's pick over bold, and over grey).

### The steps

| # | Rail label | What's on it |
|---|---|---|
| 1 | Basics | **Client type**: Buyer \| Seller. **Property type**: Co-op \| Condo as the main toggle, then Condop, Townhouse, House, Multi-family as small chips beside it. Picking one of those four adds "· priced as a co-op or a condo?" to the label, and Co-op \| Condo then sets the pricing basis (`HomeFacts.kind` is the label, the report's type stays condo or co-op, as today). **Client name(s)**, "Optional". **Their budget** (buyer) or **Their target price** (seller), placeholder "$ 4,000,000 · optional" / "$ 4,250,000 · optional". No notes. |
| 2 | General | Three rows: **Interior size** with Estimate beside "sq ft"; **Beds, Baths, Rooms, Floor**; **Asking price, Common charges / mo (Maintenance / mo for a co-op), Taxes / mo**. |
| 3 | Own or shared *(name not final)* | **Laundry**: the home's own (In the unit, Allowed, not installed, None) and the building's (On the floor, In the building, None). **Outdoor space**: the home's own (None, Balcony, Terrace, Private roof, Garden, Patio; **Its size** appears once one is picked) and the building's (None, Roof deck, Courtyard, Garden, Terrace, Patio, Deck, Other; several allowed). |
| 4 | Home amenities | Condition, Views, Exposure, Corner, Dishwasher, Central air, Working fireplace. |
| 5 | Building amenities | Neighborhood, Year built, Resale or new development, Services and facilities (laundry has moved to step 3), Wellness and recreation, Policies. |
| 6 | Client info | Buyer: Financing; Pre-approved Yes \| Not yet, with **For how much? $** on the same row only once it's Yes; How soon (**Ready to buy now** \| **Can wait for the right one**); What's moving them. Seller: How soon (**Needs to sell soon** \| **Can wait for the right price**); What's moving them. |
| 7 | Comps | **Add comps**: the paste field and ADD, then a dashed drop zone ("Drop StreetEasy's export here" · "The export as CSV, XLSX or its PDF, or listing screenshots · or browse"). Once comps are in, it shrinks to one line under them ("Drop another export or more screenshots"). **This step is a stand-in:** today's step 3 (reading each link, confirming each comp) moves in as it is, inside this frame. |

**Nothing is picked by default.** None is a choice the agent clicks, not a default: a blank means nobody said, and
a pre-picked None would tell the numbers "no washer/dryer" for a home that may have one (Kimani, 2026-11-11).
Single-choice rows toggle off when clicked again; in a several-allowed row, None clears the others and any other
choice clears None.

### Controls, one size each

| Control | Size | Notes |
|---|---|---|
| Primary (black) and outline buttons | 44px high | |
| Segments (Buyer \| Seller, Co-op \| Condo) and chips | 36px | |
| The less common property types | 28px, 11px text, regular weight | |

Every control has a hover state and a 2px lavender focus ring, and its colours fade in 0.15s rather than snapping.

### Hubert in the window

- **"You're on / New comp · [step]"** at the top.
- **His notes:**
  - One about the listing (reading, read, or nothing to read for a typed address).
  - One for the step, written per step on the canvas (`STEPS()` in the artboard's script).
- **Under "Try":** two suggestions per step, then a box to type to him.
- **How it moves:** his replies rise in, and three dots pulse while he thinks.
- **What he fills.** He fills the window from the agent's words. His `set_home_fact` already covers everything on
  steps 2–5 (views, exposure, condition, laundry, outdoor, building, policies), so this is existing capability.
  **New for him:** Client info (financing, pre-approval and amount, pace, what's moving them).

## 4. What the build needs that doesn't exist yet

1. **Notes per step.** Today the home has one Notes field (`HomeFacts.notes`). Each step's notes need keeping, with
   Hubert's "add to the notes" going to the step's.
2. **The building's laundry.**
   - What exists today:
     - the home's laundry is `LaundryState` (`installed`, `permitted`, `prohibited`, `none_listed`);
     - "Laundry in building" is a building feature.
   - What the canvas asks for:
     - "None" on the home's side, which today could map to `none_listed` or `prohibited`; the build decides which;
     - a building row with **On the floor**, **In the building** and **None**. "On the floor" is new.
3. **Hubert fills Client info**: `set_home_fact` (or a sibling tool) gains the client fields.
4. **The step rail, the transitions, the counter, the morphing button, the resizable panel on the left.**
5. **Edit details** (a workspace's ✎) used the details step's body. It isn't drawn. The obvious default: this
   window, headed EDIT TARGET PROPERTY, every step reachable, today's Cancel and Save.

## Open (Kimani)

- **Step 3's name.** "Own or shared" is a placeholder Kimani doesn't love.

## Not in this round

- Phone widths (laptop and tablet only, as the design pass README says).
- The comps step's own redesign: next.
- The Casa Blanca building as a loader (windows lighting up). It was tried and dropped until there's a true vector
  of the mark.
