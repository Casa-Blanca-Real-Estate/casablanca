# Comps: Add comps as the workspace's first step, then Sort — the build brief

**For the build thread** (Mason's lane, ported by Casanova). Designed with Kimani on the design canvas, 2026-11-11 to
2026-11-18; this file is the hand-off. Signed: the design session (claude/loving-cerf-6nx1a5). It follows
`new-comp.md` (built: the New comp window, #171 and before it) and changes one thing in it (§1).

**The spec is the canvas.** https://claude.ai/artifact/1zFam3mkm1orxhCrLmhx8W (Comp Report Design), page
**"Add comps · round 1"**, artboard **"Option A (draft 3)"** (`project/Comps.dc.html`). Press Play; it opens on Add
comps. **Kimani's pick (2026-11-18): Option A with the masthead.** The board's TARGET: CARD / MASTHEAD switch shows the
card too; build the masthead. The other boards on the page are references:
- **BEFORE:** today's Sort.
- **AFTER:** the one-page alternative, not chosen.
- **Live:** today's Add comps screens.

The "TARGET" and "CANVAS ONLY" controls at the bottom right belong to the canvas. Read the board with the
Artifact tool (`action: read`, `path: project/Comps.dc.html`). Its markup and `renderVals()` are the reference for
layout and behaviour, not code to paste.

The code:
- the window: `src/views/newcomp/` (`steps.ts`, `Window.tsx`, `StepBodies.tsx`);
- the comps: `src/views/workspace/` (`AddComps.tsx`, `SortStep.tsx`, `comps.tsx`, `screens.ts`, `Workspace.tsx`), and
  `src/views/comp/AddBar.tsx`;
- the shell: `src/views/shell/` (the workspace header, Hubert's panel).

## 1. The window ends at Client info (decided)

The New comp window has six steps: Basics → General → Own or shared → Home amenities → Building amenities →
Client info. Add comps leaves the window. Client info's button is **NEXT: ADD COMPS →**, and it opens the workspace
on its new first step.

In `steps.ts`, `comps` comes out of `STEP_KEYS`. `?start=comps` should land on the workspace's Add comps, so old links
still work. Update `new-comp.md` §3 to match.

## 2. The workspace: four steps, its header, Hubert on the left (decided)

- **The steps are 1 Add comps · 2 Sort · 3 Findings · 4 Send**, the tabs at the top of every workspace screen
  (`PROGRESS` in `screens.ts`).
  - At the right of the tabs: the next button, with what's left beside it in small grey type.
    - Add comps: "2 still reading" or "4 comps in", then **NEXT: SORT →** (live once a comp is read).
    - Sort: "3 to check" or "All checked", then **REVIEW COMPS →** (live once every comp is checked).
- **The masthead is the target property:**
  - ← Reports.
  - The address, large and heavy.
  - ✎ Edit, which opens the window on the step to change.
  - **All details ▾**, which drops every fact open in a white panel under it: type, size, beds and baths, floor,
    asking price, charges, taxes, laundry, outdoor, building, area.
  - Under the address, a line: side, client, type, area, size, beds, baths, floor, asking, ✓ Saved.
- **The page centres in the space beside Hubert,** open or closed, and moves as the panel is resized.
- **Hubert's panel is on the left in the workspace too,** resizable, with the window's seam, tab and toggle
  (`new-comp.md` §2). One panel, the same everywhere.
- **Add comps keeps a footer:** ← BACK (to Client info), what's still reading, NEXT: SORT →.

## 3. Add comps (decided)

Top to bottom:

1. **A white block with the paste field and ADD** ("Paste StreetEasy links, or type an address"; Enter adds).
   **The drop zone sits right under it**:
   - empty, it's big: "Drop StreetEasy's export here", with "The export as CSV, XLSX or its PDF, or listing
     screenshots · or browse";
   - once a comp is in, it shrinks to one line: "Drop another export or more screenshots".
   Today's drop-anywhere-on-the-screen stays.
2. **The tally:** Sold, In contract, Active, Didn't sell, each "n / 3" with a thin bar filling toward three (the
   guidance: about three of each, where there are that many).
3. **The comps, grouped by status** (Sold, In contract, Active, Didn't sell), with what's still reading in a group
   at the top. Each row shows:
   - the thumbnail and the address;
   - a line: price · size · beds and baths · date · distance;
   - **"vs 17L: +201 sq ft · 7 floors lower · same bedrooms"**: how it compares with the target;
   - Hubert's flag, if any (a yellow square and a few words);
   - where it came from (From its link / From the export / Hubert's find);
   - × to remove.
   - While being read, the row shows its own 0–100% counter (the same counter as the window's read).
4. **A failed read** turns the row faint red with a red edge and a red square: "StreetEasy didn't let this page be
   read", **TRY AGAIN**, Type it in, ×. Today's reasons for the failure stay where there's one to give.

**No Confirm on Add comps.** Comps are taken in and read here and checked once, on Sort (§4). Today's "n to confirm"
in step 3 goes.

### Hubert on Add comps

- **Checks each comp against the guidance as it lands:** distance (a quarter mile), age (three to six months), a floor
  outside the band, an estimated size, a different type. He says the tally ("2 sold, 1 in contract, no actives yet;
  about three of each is the aim") and names what he flagged.
- **Adds comps from the agent's words:** "Add 200 Chambers 10A and 5 Franklin 14A". They're read like pasted links.
- **Suggests comps:** cards under "Comps I'd look at". Each card has:
  - a thumbnail, the address and a line (status · price · distance);
  - StreetEasy ↗ in the card's top corner, a plain link with an outline only on hover;
  - why he suggests it, in a sentence;
  - **Not this one**, then **+ ADD**.
  An added suggestion is marked "Hubert's find" and is checked on Sort like any other. The card stacks to fit the
  panel at its narrowest (300px).
  **To check before building:** he has web search, but whether he can reach StreetEasy's listings is unknown. If he
  can't, suggestions come from what he can find (and say so), or wait.
- **Answers questions,** as today.

## 4. Sort: checking each comp, side by side with the target (decided)

Sort keeps today's list (grouped by status; Sale or Ask, $/ft, Size, Date) and gains:

- **A banner** above the list: "3 comps to check against its page, then a tier for each", "n of n checked" with a
  bar, and **CHECK THE NEXT →**. When all are checked: "All n checked. Give each a tier, then Review comps."
- **A yellow edge** on each row until it's checked, with **CHECK** where its tier will go.
- **The first unchecked comp opens by itself** when Sort opens. The open comp shows:
  - **"Side by side with the target, 17L":** each fact as read (Sale, $/SF, Size, Date, Beds and baths, Floor,
    Distance, Days on market), a dot on its label when it was read from the page, and **the target's value under it**
    ("17L · 2,000").
  - Hubert's note when it's flagged (a lavender-edged note: why, and what he'd do).
  - **✓ LOOKS RIGHT**: marks it checked and opens the next unchecked one.
  - **FIX A FACT**: the facts become fields; "✓ SAVE AND MARK CHECKED" / CANCEL.
  - StreetEasy ↗, and "Remove from the report".
- **Once checked, the tier:** ★ (the closest, one per report: starring one moves the star) · 1st · 2nd · × (out of
  the numbers). This is today's tier control, shown after the check.
- Comps still being read sit in a "Still reading" group with their %; failed ones in "Couldn't read".

What "checked" is in the data: today's `unconfirmed` flag, cleared on Sort instead of in the window.

## 5. Carried over from New comp (decided)

Apply these on Add comps, Sort and the workspace shell:

- field labels in regular-weight caps, black;
- one size per control: 44px buttons, 36px choices and chips;
- hover states, a lavender focus ring, colour fades of 0.15s;
- content sliding in from the right going forward and from the left going back;
- Hubert's replies rising in, with three dots while he thinks;
- the thin white scrollbar with a black edge.

The rest of the workspace (the Gate, Findings, Send, Done) should pick these up as it's touched. Kimani wants them
across the platform.

## Open (Kimani)

- Step 3's name in the window ("Own or shared" is a placeholder; `SHARED_NAME` in `steps.ts`).

## Not in this round

- Phone widths.
- A target card beside the comps. Drawn, not chosen: the masthead's All details does that job.
