# Send: the build brief, from the design canvas

**For the build thread that reworks Send** (Mason's lane: `src/views/workspace/SendStep.tsx`, `src/views/send/`,
`styles/send.css`). Designed with Kimani on the design canvas, 2026-11-06; this file is the hand-off. Signed: the design
session (claude/loving-cerf-6nx1a5).

**The spec is the canvas.** https://claude.ai/artifact/1zFam3mkm1orxhCrLmhx8W (Comp Report Design), artboard
**"5 · Send"** (`project/Send.dc.html`). It's clickable: press Play. Read it with the Artifact tool (`action: read`,
`path: project/Send.dc.html`); its markup and logic are the reference for layout and behaviour, not code to paste. The
email it previews is the **"Email · PROPOSED restyle"** artboard (`project/Main.dc.html`), built from its own brief:
`email-restyle.md` (PR #137). Build this after, or alongside, the email restyle; Send doesn't depend on its looks.

Background: design-pass README §6.11 (Send today) and §6.12 (the client's words).

## The problem it solves

Today Send is 5,700px tall at 1440 wide and the copy button is at the very bottom. The email is the product, so the
page is built around it: everything the agent does to send it sits in a left rail beside the preview, visible without
scrolling.

## Layout

- **The header row:** the address block at the left; at the right the progress row (1 Sort ✓ · 2 Findings ✓ · 3 Send),
  then **the step button** (below), last, as the step after Send (decided: the right end of the row is for moving forward,
  never for the step crumbs). This is the rule for every workspace screen: Review comps → / Findings → / Send → sit
  top right.
- **36px** between the header row and the columns (was 20: it read cramped). The same spacing on every workspace
  screen.
- **Below, two columns, their tops flush:** the left rail (max 360px) and the email preview panel.
- **The preview panel** is the grey mat itself, in its own scroll box (max ~860px tall), so the rail stays put while
  the agent reads. No header above it: its label ("EMAIL PREVIEW") and the **✎ Edit** button are **sticky in the mat's
  top-left margin**, so they stay in reach while scrolling and never push the email down.

## The rail

1. **Before you send** (decided: rail list *and* marks on the preview). The issues, numbered, from the issues panel.
   Each has two small text links (10px, regular, underlined, grey, darker on hover): **Hide in the email** / **Show in
   the email** (the marks on the preview: a yellow number badge and the highlight `#fbf0c4` on the words it's about),
   and, where the words are the fix, **Fix in place**, which turns on editing and becomes **Done: mark it fixed**. A
   fixed issue leaves the list. No manual checks (no "read the client's words", no "every comp has a photo"): reading
   is the step button's gate. **Empty state:** "All good. Ready to send." with a tick.
2. **1 · Email subject** (decided; Kimani's heading).
   - The subject itself, no separate label: an editable field that **wraps** (two lines, more as needed), underlined
     so it reads as one (darker on hover, deep lavender when focused), with a **copy icon** button (two overlapping
     squares; `aria-label` "Copy the subject"). The Gmail link uses whatever it says.
   - **Copy & open in Gmail** (primary) with a **copy icon** button beside it for copying the email alone ("Copy the
     email only"): the icons replace the Copy and Copy only text buttons. Copy & open copies the Designed email as HTML
     and opens Gmail's compose window with the subject filled in: `https://mail.google.com/mail/?view=cm&fs=1&su=…`
     (as the property sign tool's **Open in Gmail** does). A Gmail link can't carry a formatted body, so the agent
     pastes (⌘V). Under it, one line: "Then paste it into the message (⌘V)." with a **?** that shows the rest on hover
     or focus. When the report has the client's email (no field yet; 7.3 client fields), it goes in `to=`.
   - **Gmail draft · soon**: a disabled placeholder. Its hover card says what it will be: the finished email straight
     into the agent's Gmail drafts, formatted and addressed, nothing to paste (NW-102, Gmail's API, once Casa's Google
     sign-in is set up; after 11-13). That's the difference from Copy & open: no paste step.
   - **Plain text (Full · Short)**: a small text link that opens **Copy full** and **Copy short**.
3. **2 · Text msg** (decided; Kimani's heading). Locked until the email is out: until the agent has used **Copy & open in Gmail** or
   **Copy only**, it shows one muted line ("A short text for after the email. It opens here once you've copied or
   opened the email."). Then the text appears as a bubble with **Copy the text**. The text is drafted as today.
## The step button: read, then copy, then mark as sent (decided)

One button with three states, built as **one component** shown in two places: at the top right of the header row,
and **sticky at the bottom right of the preview panel** (inside the scroll box, with a soft shadow), so it's always in
reach without the page itself scrolling. Nothing below the panel.

1. **Read the full email ↓**: greyed (`#dddbd5` on `#555550`), not clickable, until the agent has scrolled the preview
   to its end. No line anywhere explains the unlock; the button's label is the instruction.
2. **Copy & open in Gmail**: once read. Same action as the email card's button.
3. **Mark as sent ✓ →**: once the email has been copied or opened (from here or the email card). Marks the report sent
   and goes to **Done**.

Reading is the gate: copying from the email card first doesn't skip it; the step button still asks for the full read.

## Editing the words in place (decided, NW-079 b)

**Clicking any of the agent's words in the preview starts editing it** (`contenteditable` on each piece), right in the email: the greeting and lead-in,
the overview paragraph, each comp's paragraph, each listing's note (its 200-character limit shows as a count while
typing), Things to consider, and the sign-off. Figures, addresses and photos are never editable here. The sticky
**✎ Edit** button turns on outlines for all of them at once (dashed deep lavender, `#3c3654`), for an agent looking for
what can change; it reads **✓ Done** while on. Three states for each editable piece, so the one being changed is never in doubt:
outlined (editing on), **hovered** (lavender tint `#f1effa`, solid outline), **focused** (white, 2px solid outline and
a soft lavender ring). Hovering **✎ Edit** shows a small hint card: "Click any words you wrote
to change them, right in the email. Prices, sizes and dates come from the report; change those on Sort." No banner
above the preview.

Edits in place save to the same fields the client's words modal writes (`send.headline`, `send.chosen`, each comp's
client line, …), so the modal and the preview are two views of one text: the modal stays for writing from scratch and
for Hubert's feedback (practice agents still write first there). The fair-housing screen and the numbers check run on
save, as they do for the modal.

## Done

**Mark as sent** leads to Done as today. The text moved to Send (above), so Done drops "Text them" and keeps the rest.

## Open, low priority

- A client email field (with the other client fields, design-pass 7.3) would let **Copy & open in Gmail** fill `to=`.

## Bug to fix in the same build (from design-pass §6.11)

The 100 Barclay sample fills Send with seller lines on a buyer report: "The next step" says "List in October…" and
"About the client" says the owners are listing. The canvas shows it as issue 1 ("Things to consider says 'List in
November…': a seller's line on a buyer report"). Fix the sample so a buyer report gets buyer lines.

## Hover states, everywhere (decided)

Everything clickable has a hover state: the primary (ink) buttons go deep lavender (`#3c3654`); outlined buttons tint
lavender (`#f1effa`); text links go from grey to ink; the crumbs and step links go deep lavender. Copy-type buttons are
ink text on white with an ink border (Kimani's contrast fix), not grey.
