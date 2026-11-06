# Reports, the shared top bar, and a pass on Sort, the Gate and Findings: the build brief

**For the build thread** (Mason's lane). Designed with Kimani on the design canvas, 2026-11-06; this file is the
hand-off. Signed: the design session (claude/loving-cerf-6nx1a5). Its companions: `email-restyle.md` (the Designed
email) and `send.md` (Send).

**The spec is the canvas.** https://claude.ai/artifact/1zFam3mkm1orxhCrLmhx8W (Comp Report Design). Artboards:
**"1 · Reports"** (`project/Reports.dc.html`), **"Component · Top bar"** (`project/TopBar.dc.html`), **"2 · Sort"**,
**"3 · The Gate"**, **"4 · Findings"**, **"6 · Done"**. They're clickable: press Play. Read them with the Artifact tool
(`action: read`, `path: project/<file>`); their markup is the reference for layout and behaviour, not code to paste.
The code: `src/views/Reports.tsx`, `src/views/shell/` (`TopBar.tsx`, `WorkspaceHeader.tsx`), `styles/shell.css`, and the
workspace steps in `src/views/workspace/`.

## 1. The top bar: one component, every screen (decided)

`TopBar.tsx` becomes the single bar every comp report screen renders (the canvas's `TopBar.dc.html` is imported by
every artboard). Left to right:

- the Casa Blanca wordmark (white),
- **‹ STUDIO**: plain lavender text (`#aaa3cf`), no outline, white on hover; back to the Studio dashboard,
- a small dot, then the tool's label (**COMP REPORT**, white, 10px, 0.32em tracking). **On Reports the label is
  omitted**: the page's own hero already says it,
- then, at the right: a role badge for team views ("MENTOR VIEW", "ADMIN VIEW"), **Sample** (yellow), **✦ Hubert**
  (lavender; opens his drawer), the account pill, **Feedback**.

Its side padding matches the page (`clamp(16px, 2.6vw, 40px)`). Kimani will design the Studio button and label for the
Studio's other tools separately: this is the comp report's bar.

## 2. Reports (decided)

- **Hero:** "COMP REPORT" and its line at the left, as today. At the right, two actions:
  - **Pick up where you left off**: the agent's most recently updated open report: address, stage square and stage,
    **Continue →**. On hover its background ramps to deep lavender (`#3c3654`, about 0.45s ease).
  - **✦ Start with Hubert**: the ✦ at 22px (the tool's `sh-spark`), the label, a **?** whose hover card says "Hubert
    reads the listing and fills in the home. You check it, then add comps."; then a field ("Paste a StreetEasy link,
    or type the address") and **Start →**. No box around it. It opens the New report window filled from the read;
    it depends on Hubert in the New report window (design-pass §7.1), so it may land after the rest.
- **The list's header row:** "Your reports" (agents, as a heading) or the tabs **Your reports · Mentee reports**
  (mentors and admins), then the numbers, each a heavy number with a small caps label: **N REPORTS · N OPEN · N SENT
  THIS MONTH** (on a mentor's Mentee reports: REPORTS · MENTEES · SENT THIS MONTH). On Mentee reports, **Edit
  mentees** sits on the numbers' baseline. At the right: a **search** button (magnifying glass) that opens a field
  filtering the list by address, client or agent as you type ("No reports match …" when none do), then **+ New comp**.
- **The table:** columns **(photo) · Home · Side · Range · Comps · Stage · updated**.
  - The photo is large: 206 × 150 (Kimani's size).
  - Home: the address (17px heavy), the Sample badge, the client; on Mentee reports the agent's name, their level
    (PRACTICE / FULL tag) and "Read only".
  - **Range**: the report's range once Findings has one ("$4.23M – $4.92M"), "—" before.
  - **Comps**: "6 comps · 3 untiered".
  - **Stage · updated**: the stage square and word, then the date inline in thin grey ("Sent · Nov 4"). The separate
    Updated column is gone.
  - **Every column sorts**: click a header for ascending (↑), again for descending (↓), a third time to clear. Home
    A–Z, Side, Range by its low end, Comps by count, Stage · updated by recency (the default, ↓).
  - **Archive and Delete leave the table**: an archive icon and a trash icon in the page margin to the right of the
    row, shown on hover or keyboard focus of the row. The trash turns red on hover and appears only on sample
    reports (real reports are never deleted). Other agents' rows have neither.
- **Below:** the read-only line, **Archived (N)** with Restore, and for admins **Access · admins only** (Dispatch 22,
  unchanged).
- **Width:** content to 1840px with `clamp(16px, 3.5vw, 56px)` sides. Under 900px the rows drop to the photo (110 ×
  80) and the home column.
- **The canvas's "PROTOTYPE · VIEW AS" switch** (bottom left) is for previewing roles on the canvas only. Don't build
  it.

**New data the list needs** (decisions for the build, not the design): each report's range (the engine computes it;
the list doesn't receive it today), its comp count (the untiered count exists as `unsorted`), the sent date, the
owning agent's level on Mentee reports, and three counts for the numbers row.

## 3. A pass on Sort, the Gate, Findings and Done (decided: "a little zhuzh")

Kimani's direction for the whole tool: **consolidate, less loud, fewer lines of small text.** Applied here:

- **Every workspace screen** uses the top bar above, content up to 1840px with `clamp(16px, 2.6vw, 40px)` sides,
  **36px** between the header row and the content, the forward action at the top right after the step crumbs
  (Review comps →, Findings →, Send →), and hover states on everything clickable (ink buttons → deep lavender;
  outlined → lavender tint; crumbs → deep lavender).
- **Sort:** as designed earlier in this pass (the compact card, the review modal, Hubert's drawer), with the above.
- **The Gate:** the eyebrow ("Before the range · your call first") is gone; the line under the question is one
  sentence: "Commit a number before you see what your 3 first-tier comps say."
- **Findings:** the range's sub-line is "$2,112 – $2,457 / SF · 3 sales"; your number's is "Inside the range"; the
  accordion headers tint on hover.
- **Done:** "Text them" is gone (the text is on Send now); "Follow up in two days" and "Plan the offer together" stay.

Sort, the Gate and Findings haven't had a full design review with Kimani yet; they're ahead of today's screens and
can be built as they stand, with a later pass expected.
