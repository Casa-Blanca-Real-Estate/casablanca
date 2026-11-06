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
2. **Hero with the text over the photo** (open: needs Kimani's sign-off on rule 7). The "Prepared for … · Nov 2026"
   line, the address and the beds/baths/size line sit at the foot of a 340px photo, in white over a gradient from clear
   to about 90% ink. In an email that needs the photo as a cell background, which rule 7 bans because some clients strip
   it. If allowed: the cell carries `bgcolor="#0f0f0f"` so a stripped photo leaves white text on black, never white on
   white. Without a photo, the old layout: text on white below where the photo would be.
3. **The headline is a lead-in to the range** (decided, Kimani 2026-11-06). There's no eyebrow. The agent's headline
   opens with the greeting and runs one or two full lines that end where the number starts:
   "Hi Jordan and Sam, I looked at the closest recent sales to see where 17L stands. The three most like it put it at"
   then the range. 17px bold, line-height 1.4, 12px above the range.
   - The headline has **no numbers**; the range line supplies them. `headlineDrafts` (`workspace/email.ts`) trims each
     draft to end before its figures ("…put 17L at"); the agent writes a lead-in, not a sentence.
   - The greeting moves into the lead-in, so the email doesn't open with a separate "Hi Jordan and Sam," line.
   - Plain-text email and the text message join the lead-in and the range into one sentence
     ("…put it at $4.23M – $4.92M."); `sms.startsWith(HEADLINE)` and its test change with it.
   - D-21 (a headline is required) and the numbers check stand; a lead-in with no figures passes the numbers check
     trivially.
4. **The range, on white** (decided). The black range block is gone. "$4.23M – $4.92M" in ink, 44px heavy, the first
   big black text in the email. "$2,112 – $2,457 / SF" small (13px, grey) at the right end of the same line, baseline
   aligned; neither wraps (both `white-space:nowrap`; in a table, two cells of one row). No "from 3 sales close by".
   Co-ops without sizes: the $/SF cell drops out. Check the fit at 536px in Helvetica.
5. **The agent's paragraph** (decided). 28px under the range, 14px, three or four lines: how the comps were chosen,
   which one carries the most weight, the size caveat, what the listings below are for.
6. **The closest match** (decided: today's box, kept). 2px ink border; inside it "THE CLOSEST MATCH" eyebrow with the
   yellow ★ (#e8b923, 34px) on the same line, then the address (22px bold), the photo at **330px**, price (22px bold)
   with $/SF at the right ("$2,112 / SF"), a grey status line ("Sold Aug 2026 · Floor 10 · 2,201 sq ft"), the
   client paragraph.
7. **Also sold nearby: two-up boxes** (proposed, not yet reviewed). 1px ink border, address, 150px photo, price and
   $/SF, status line, paragraph.
8. **On the market now · asking, not sold: a compact list** (proposed, not yet reviewed). 96×72 thumb, address, ask,
   status line, one paragraph each. Keeps the long tail of in-contract and active comps short.
9. **Things to consider, sign-off, footer** (unchanged in substance). The footer wordmark is centred.

## Type

**Helvetica Neue, Helvetica, Arial** in the email (decided in practice): mail clients don't load web fonts, so Object
Sans never reaches the client; the canvas previews Helvetica by default (Tweaks › fontFallback off shows Object Sans).
Kimani finds Object Sans Heavy dense at these sizes; the repo has only Regular and Heavy (no Medium). The tool itself
keeps Object Sans.

## Not yet designed

Co-op version (no $/SF anywhere), missing-photo and missing-paragraph states beyond the hero, dark mode in Gmail and
Apple Mail, the CTA's target, the Text's look.
