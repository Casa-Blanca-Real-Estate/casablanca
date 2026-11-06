# The Designed email restyle: build notes from the design canvas

**Canvas:** https://claude.ai/artifact/1zFam3mkm1orxhCrLmhx8W (Comp Report Design). The artboard **"Email · PROPOSED
restyle"** (`project/Main.dc.html`) is the target; **"Email · TODAY"** beside it is `designed.ts` rendered with the 17L
sample on `claude/main` at #131, for comparison. A build session reads both with the Artifact tool (`action: read`,
`path: project/Main.dc.html`); the markup there is the spec, not code to paste: the email stays tables and inline
styles in `tools-src/comp-report/src/views/send/designed.ts` (design-pass README §3 rule 7, §6.13).

Kimani's design calls on the canvas, 2026-11-05/06. Each is marked **decided** or **open**.

## Top to bottom

1. **Header** (decided). Black bar, the white wordmark image (`assets/brand/casa-blanca-wordmark-white.png`), the
   lavender "COMP REPORT" eyebrow. Unchanged from today.
2. **Hero with the text over the photo** (Kimani likes it; open only on rule 7, the same question as items 6 and 7). The "Prepared for … · Nov 2026"
   line, the address and the beds/baths/size line sit at the foot of a 340px photo, in white over a gradient from clear
   to about 90% ink. In an email that needs the photo as a cell background, which rule 7 bans because some clients strip
   it. If allowed: the cell carries `bgcolor="#0f0f0f"` so a stripped photo leaves white text on black, never white on
   white. Without a photo, the old layout: text on white below where the photo would be.
3. **The headline is a lead-in to the range** (decided, Kimani 2026-11-06). There's no eyebrow. The greeting
   ("Hi Jordan and Sam,") on its own line, a blank line, then the agent's lead-in, which ends where the number starts:
   "I looked at the closest recent sales to see where 17L stands. The three most like it put it at:" then the range.
   Both 14px regular, line-height 1.4 (Kimani's sizing on the canvas), 12px above the range.
   - The headline has **no numbers**; the range line supplies them. `headlineDrafts` (`workspace/email.ts`) trims each
     draft to end before its figures ("…put 17L at"); the agent writes a lead-in, not a sentence.
   - The greeting moves into the lead-in, so the email doesn't open with a separate "Hi Jordan and Sam," line.
   - Plain-text email and the text message join the lead-in and the range into one sentence
     ("…put it at $4.23M – $4.92M."); `sms.startsWith(HEADLINE)` and its test change with it.
   - D-21 (a headline is required) and the numbers check stand; a lead-in with no figures passes the numbers check
     trivially.
4. **The range, on white** (decided). The black range block is gone. "$4.23M – $4.92M" in ink, 44px heavy, the first
   big black text in the email. "($2,112 – $2,457 / SF)" small (13px, grey, in parentheses) at the right end of the same line, baseline
   aligned; neither wraps (both `white-space:nowrap`; in a table, two cells of one row). No "from 3 sales close by".
   Co-ops without sizes: the $/SF cell drops out. Check the fit at 536px in Helvetica.
5. **The agent's paragraph** (decided). 28px under the range, 14px, three or four lines: how the comps were chosen,
   which one carries the most weight, the size caveat, what the listings below are for.
6. **The closest match: the address and the price on the photo** (decided, Kimani 2026-11-06). 2px ink border.
   Inside it, on white above the photo: "THE CLOSEST MATCH" (10px) with the yellow ★ (#e8b923, 28px) at the right.
   Then the photo, full width of the card, 330px: the address (22px bold, white) over its top, the price (26px bold)
   and "$2,112 / SF" over its foot, each on a **tight** gradient, only a little taller than its text (about 64px:
   88% ink, 70% at the middle, clear), strong enough to read. Off the photo, below it: the grey status line
   ("Sold Aug 2026 · Floor 10 · 2,201 sq ft") and the client paragraph, 18px side padding. Like the hero, this puts
   text over a background photo, so it shares the hero's rule 7 question and its fallback: the cell's `bgcolor` is
   ink, so a blocked or missing photo leaves white text on black (the canvas's Photos off tweak shows it).
7. **Also sold nearby: the same card at half size** (decided, Kimani 2026-11-06). Built from one repeating pattern.
   1px ink border, 190px photo, the address (15px bold, white) over its top and the price (18px bold) with $/SF (12px)
   over its foot, gradients about 46px; below the photo the status line (11px) and the paragraph (13px).
8. **On the market now · asking, not sold: one row per listing** (decided, Kimani 2026-11-06). A 96×96 square photo
   at the left; beside it, a column exactly as tall as the photo: the address and the ask on top, the status line
   below them (lavender square for in contract, white for active), and the agent's one-line note anchored to the
   **bottom** of the photo, so a short note sits on the photo's baseline and a longer one grows upward. The note is
   **two lines at most: a 120-character limit** on the client's-words step for listings (about 65 characters a line
   at 13px in the 426px column). In the email that's a fixed-height cell with the note bottom-aligned
   (`valign="bottom"`), not a line clamp, which mail clients don't support.
9. **Things to consider, sign-off, footer** (unchanged in substance). Every section header (Also sold nearby, On
   the market now, Things to consider) matches "THE CLOSEST MATCH": 10px, weight 600, 0.24em tracking, ink. The footer wordmark is centred.

## Type

**Helvetica Neue, Helvetica, Arial** in the email (decided in practice): mail clients don't load web fonts, so Object
Sans never reaches the client; the canvas previews Helvetica by default (Tweaks › fontFallback off shows Object Sans).
Kimani finds Object Sans Heavy dense at these sizes; the repo has only Regular and Heavy (no Medium). The tool itself
keeps Object Sans.

## Not yet designed

Co-op version (no $/SF anywhere), missing-photo and missing-paragraph states beyond the hero, dark mode in Gmail and
Apple Mail, the CTA's target, the Text's look.

Cross-cutting follow-ups (the repeated-component audit, the font mix, real sample photos, blocked images):
`follow-ups.md` beside this file.
