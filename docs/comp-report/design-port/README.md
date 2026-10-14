# Handoff: Casa Blanca Comp Report

## Overview
A tool inside Casa Blanca's Creative Studio for agents to build a comparative market analysis (comp report) for a home. The agent picks the home, adds comps from StreetEasy, sorts and explains each comp in their own words, commits to their own price guess (the Gate), compares it against the assistant's estimate (Findings), then sends a client email. The flow is deliberately built to make agents reason before the AI does. The assistant is **Hubert** (named after the office at 10 Hubert St, Tribeca). Hubert guides and answers questions. He never tiers, writes notes or picks tags.

Target: a working port for a demo with Noble and a few agents. Polish, responsive and more refinements will follow in a later handoff.

## About the Design Files
The files in this bundle are **design references created in HTML**. They're prototypes that show the intended look and behavior, not production code to copy directly. Recreate them in the target codebase's environment (Creative Studio's stack) using its patterns and libraries. If there's no environment yet, pick the most appropriate framework (React + a typed backend is a sensible default).

Open `Comp Report Prototype.dc.html` in a browser (it needs `support.js` beside it). A black nav bar at bottom-left jumps between every screen. The Tweaks panel has two prototype switches: **agentLevel** (New / Graduated) and **clientSide** (Seller / Buyer).

## Fidelity
**High fidelity** for color, type, layout and copy. Spacing and hover/loading states still need a polish pass, and narrow widths haven't been worked through yet. Build to the prototype as it is now.

## Screens / Views
All workspace screens share: a black top bar (Studio back button, wordmark, "COMP REPORT" eyebrow in #aaa3cf, Feedback, account pill), a page header (← Reports, address 28px/800, ✎ edit that opens Details, a sub line with side · client · size · beds · baths · floor), and a 3-step progress row (Sort → Findings → Send) with the primary CTA on the right. Content padding is 28px 56px 64px 48px on #f4f3f0. White cards sit on top.

1. **Sign in**: Google button (primary). Email sign-in sits behind a link.
2. **Reports**: black hero ("COMP REPORT" 112px/800, uppercase). Table of reports: thumb, address + client, side, stage (colored square), updated. Columns sort on header click. 10 rows, then "Show N more". Has an empty state.
3. **New: home (modal 1 of 3)**: StreetEasy link field and the matched home. Then For a (Buyer/Seller), Client (optional), Type (Co-op/Condo, default Co-op) and Target price (optional). Field headers are 11px, 400 weight, 0.1em tracking, uppercase, #0f0f0f. The target header has a gray parenthetical and an ⓘ hover: "Hidden from Hubert, the assistant, until the math is done…" Buyer mode: "Offer target · optional (what your client hopes to pay)".
4. **New: details (modal 2 of 3)**: side/type/client on one compact row. General (interior size with Estimate, or none for co-ops; floor, asking, common charges, taxes). **About the home** feature pickers: Outdoor space (single), Views (multi), Exposure (multi), Unit condition (single), Building (multi), plus Year built. Then Notes. This modal is reused as "Edit details" from any workspace.
5. **New: comps (modal 3 of 3)**: paste a StreetEasy link, type one in, or drag-drop an export or screenshots (rows show "Reading…", then "Confirm"). The add/edit form has: address, photo, status (Sold / In contract / Active / Didn't sell), price, size (hidden with no SF), floor, date, **Why it's a comp** (required), **Tags** (≥1 required) and **Features** (the same pickers as Details; options the home has get a lavender outline). Save is disabled until the note and a tag are filled in.
6. **Sort**: comps grouped by status. Columns: caret, address + tags + "Needs …" flag + ★ anchor, price, $/ft, size, date, tier (1st / 2nd / ✕). $/ft and Size are removed when there's no SF. Headers sort. The filter row has "+ Add comps" (inline add form), "N to finish" and tag filters. An expanded card shows the photo, StreetEasy link, facts (price, $/SF, size, date, days on market, floor), **Features** (shared with the home in lavender #aaa3cf/#3c3654, with "N shared with 17L"), tags and the note. Edit mode makes the fields, features, tags, note and photo editable. **Findings → stays disabled** until every comp has a tier, a note and a tag. Incomplete rows get a 3px #e8b923 left border.
7. **Gate**: "What do you think it's worth?" Low, High and Why. New agents must write ≥100 characters. Graduated agents can skip.
8. **Findings**: True estimate (48px/800), with the per-SF range as a smaller gray line under it when SF exists. A legend, then the range bar on a **fixed axis** (see Interactions). Headline. Then two columns: **How Hubert got there** (a short explanation built from 1st-tier comps only) and **Your reasoning (from the gate)**. Below that: status medians, then accordions (Price table, hidden with no SF; Comps that count; Target price; Pricing details; How this was worked out).
9. **Send**: an issues panel on the left ("2 to fix", with "✦ Fix both"). The email on the right has tabs **Full / Designed / Short / Text**. Full has an editable headline (3 drafts) and an editable body with inline issue annotations. **Designed** is a branded 600px client email (see below). Copy to clipboard as HTML, or as plain text for Text. "Mark as sent" goes to Done.
10. **Done**: Sent confirmation, headline, estimate tiles and "How did it go?" (list/offer, contract, sold; these fill in from deal records).

**Hubert drawer**: fixed on the right, 380px wide, white, with a left border #dddbd5 and shadow -12px 0 32px rgba(15,15,15,.08). It opens by default when the agent first reaches Sort from the add modal. On Sort it shows a greeting, the guide-only rules and "You might also look at" suggestions with "+ Add" (which adds the comp untiered, needing a note). Other screens show context Q&A. It has two preset chips and an input.

**Designed email**: black header (wordmark 18px, COMP REPORT eyebrow), 240px hero photo, "Prepared for {client} · {month}", address 30px/800, a black range block (eyebrow #aaa3cf, range 44px/800, per-SF line), an advice paragraph, "★ The closest match" anchor card, "Other comps" rows (72×52 thumb, status square, price), agent sign-off with a black CTA, and a black footer with the wordmark and disclaimer. Eyebrows are 10px/800 with 0.24em tracking.

## Interactions & Behavior
- **Findings axis**: step by price tier, based on the midpoint of the guess and estimate. Under $750K the step is $100K, under $1.5M it's $250K, under $4M it's $500K, under $10M it's $1M, and above that it's $2.5M. Axis low is floor((min − step/2)/step)·step, and axis high is ceil((max + step/2)/step)·step. There are ticks and labels at every step. The estimate bar is #0f0f0f, 28px tall, and the guess bar is #aaa3cf, 12px, inset 8px.
- **No square footage** (Co-op with no estimate): hide every SF element on every workspace.
- **Anchor**: one ★ per report (#e8b923). It's hover-revealed on other rows, and the email leads with it.
- **Target price**: never shown to Hubert until his estimate is computed, and never put in the email.
- **Buyer mode** changes copy only: target label, Hubert intro and chips, Findings leverage line, Pricing details rows, all email variants and the Done labels. Strings are in the prototype's `renderVals()` (search `buyer ?`).
- **Gate rule**: new agents need low, high and a ≥100-character why. Graduated agents can skip. Gating needs an agent-level permission.
- **Screenshots → comps**: needs AI extraction of address, price, size, floor and date, then shows the row as "to confirm".
- Copy email: HTML clipboard with the annotations stripped. Toast: "Copied. Paste into Gmail."

## State Management
Report: home (address, type, side, client, target, size/estimate, fields, features, notes), comps[] (id, status, address, price, size, est flag, floor, date, DOM, tier, anchor, tags[], note, features{}, photo), gate (low, high, why), estimate (range, per-SF, explanation), email (format, headline, body), outcomes (list/offer, contract, sold), stage (Sort / Findings / Send / Sent), updatedAt. User: agentLevel. UI: drawer open (defaults to open on the first Sort visit), filter, sort key/dir, expanded rows, row edit draft.

## Design Tokens
- Ink #0f0f0f · Page #f4f3f0 · Outer #e9e7e2 · Card #ffffff
- Lavender #aaa3cf (accent/shared) · Deep lavender #3c3654 (text on lavender)
- Gray text #888680 · Lines #eeece7 / #dddbd5 / #e4e2dc · Sage #c0c2b5 (✕ tier, didn't sell)
- Attention yellow #e8b923 · Issue red #d6402b · Highlight #fbf0c4
- Status squares: Sold #0f0f0f · In contract #aaa3cf · Active #fff with a 1px ink border · Didn't sell #c0c2b5
- Type: Object Sans, Regular 400 and Heavy 800 (`assets/fonts`). Sizes 10/11/12/13/14/15/18/20/22/26/28/30/44/48/112. Eyebrows are uppercase, 0.1–0.32em tracking.
- Radius 0 everywhere, except the top-bar pills (6px), the Sample badge (4px) and the SMS bubble.
- Primary button: #0f0f0f, white text, 12px/800, 0.06em tracking, uppercase, 13px 22px padding. Disabled is 0.35 opacity.

## Assets
- `assets/brand/casa-blanca-wordmark-white.png`: Casa Blanca wordmark (white).
- `assets/fonts/ObjectSans-*.woff2`: brand font.
- Photos are striped placeholders. Real photos come from StreetEasy or agent uploads.

## Screenshots
`screenshots/` holds one capture per screen at 1440px wide (modals are cropped to the card): 01 sign in, 02 reports, 03 new home, 04 details, 05 add comp form, 06 sort (comp expanded, Hubert open), 07 gate, 08 findings, 09 send (Full), 10 send (Designed), 11 done. Seller mode, co-op with no square footage.

## Files
- `Comp Report Prototype.dc.html`: the full clickable flow (main reference).
- `Comp Report.dc.html`: the earlier design canvas with A/B options. It's behind the prototype, so if the two differ, follow the prototype.
- `Handoff Notes.md`: product decisions and backend notes (read these).
- `support.js`: runtime needed to open the .dc.html files locally.
