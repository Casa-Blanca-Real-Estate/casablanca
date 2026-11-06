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

- **The header row:** the address block, then the progress row (1 Sort ✓ · 2 Findings ✓ · 3 Send) beside it, and at
  the **top right the forward action, Mark as sent ✓ →** (decided: the right end of the row is for moving forward,
  never for the step crumbs). This is the rule for every workspace screen: Review comps → / Findings → / Send → sit
  top right.
- **Below, two columns, their tops flush:** the left rail (max 360px) and the email preview panel.
- **The preview panel** is the grey mat itself, in its own scroll box (max ~860px tall), so the rail stays put while
  the agent reads. No header above it: its label ("EMAIL PREVIEW") and the **✎ Edit** button are **sticky in the mat's
  top-left margin**, so they stay in reach while scrolling and never push the email down.

## The rail

1. **Before you send** (decided: rail list *and* marks on the preview). The issues panel's issues, numbered, each with
   **Show in the email** / **Hide in the email** and, where the words are the fix, **Fix in place** (turns on editing,
   below). Each issue also marks its spot in the preview: a yellow number badge and the highlight (`#fbf0c4`) on the
   words it's about. Below the issues, the checks as tick rows (the client's words written for every comp, every comp
   has a photo).
2. **1 · The email** (decided).
   - Subject, with **Copy**.
   - **Copy & open in Gmail** (primary). One click: copies the Designed email as HTML (as **Copy** does today) and
     opens a new tab on Gmail's compose window with the subject filled in: `https://mail.google.com/mail/?view=cm&fs=1&su=…`
     (the property sign tool's **Open in Gmail** builds the same link). A Gmail link can't carry a formatted body, only
     plain text, so the agent pastes (⌘V) into the body; the line under the button says so. When the report has the
     client's email (there's no field for it yet; 7.3 client fields), it goes in `to=`; until then `to` is left empty.
   - **Copy only** (secondary), for agents who send from somewhere else.
   - **Gmail draft · soon**: a disabled placeholder beside Copy only (NW-102: a real draft with the formatted body,
     made through Gmail's API, once Casa's Google sign-in is set up; after 11-13).
   - **Plain text (Full · Short)**: a link that opens two buttons, **Copy full** and **Copy short**. They're fallbacks
     now; nothing more on screen.
3. **2 · Then the text** (decided). Locked until the email is out: until the agent has used **Copy & open in Gmail** or
   **Copy only**, it shows one muted line ("A short text for after the email. It opens here once you've copied or
   opened the email."). Then the text appears as a bubble with **Copy the text**. The text is drafted as today.
Mark as sent isn't in the rail: it's the top-right forward action (Layout, above). Always available; it marks the
report sent and goes to **Done**.

## Editing the words in place (decided, NW-079 b)

**Clicking any of the agent's words in the preview starts editing it**, right in the email: the greeting and lead-in,
the overview paragraph, each comp's paragraph, each listing's note (its 200-character limit shows as a count while
typing), Things to consider, and the sign-off. Figures, addresses and photos are never editable here. The sticky
**✎ Edit** button turns on outlines for all of them at once (dashed deep lavender, `#3c3654`), for an agent looking for
what can change; it reads **✓ Done** while on. Hovering **✎ Edit** shows a small hint card: "Click any words you wrote
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
