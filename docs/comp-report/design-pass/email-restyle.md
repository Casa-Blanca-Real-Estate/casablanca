# The Designed email restyle: the build brief, from the design canvas

**For the build thread that restyles the Designed email** (Mason's lane; `tools-src/comp-report/src/views/send/designed.ts`
and what feeds it). Designed by Kimani on the design canvas, 2026-11-05/06; this file is the hand-off. Signed: the design
session (claude/loving-cerf-6nx1a5).

**The spec is the canvas.** https://claude.ai/artifact/1zFam3mkm1orxhCrLmhx8W (Comp Report Design): the artboard
**"Email · PROPOSED restyle"** (`project/Main.dc.html`) is the target; **"Email · TODAY"** beside it is today's
`designed.ts` rendered with the 17L sample on `claude/main` at #131. Read the artboard with the Artifact tool (`action:
read`, `path: project/Main.dc.html`): its inline styles hold every size, weight, colour and spacing, and win over any
number in this file if they differ (Kimani edits the canvas directly). It is HTML with flexbox, not email HTML: translate
it into the tables and inline styles `designed.ts` already uses (design-pass README §3 rule 7, §6.13). Don't paste it.

Kimani's calls are marked **decided**; the rest is **open** (a decision for Kimani, on the Answer Sheet) or **proposed**.

## Top to bottom

1. **Header** (decided, unchanged). Black bar, the white wordmark image (`assets/brand/casa-blanca-wordmark-white.png`),
   the lavender "COMP REPORT" eyebrow.
2. **Hero: the text on the photo** (decided; rule 7 relaxed for it, see "Decided" below). A 340px photo of
   the home; at its foot, over a gradient from clear to about 90% ink: "PREPARED FOR JORDAN AND SAM · NOV 2026" (10px,
   white), the address (36px, Object Sans Heavy, white), "3 bd, 3 ba · 2,000 SF" (13px, light grey). With the overlay
   off, the old layout: the photo, then the same text dark on white.
3. **The greeting and the lead-in** (decided). "Hi Jordan and Sam," then a blank line, then the agent's lead-in, which
   ends where the number starts: "I looked at the closest recent sales to see where 17L stands. The three most like it
   put it at:". 14px regular, line-height 1.4.
   - **The headline becomes this lead-in: no numbers in it.** `headlineDrafts` (`workspace/email.ts`) trims each draft
     to end before its figures ("…put 17L at:"); the agent writes a lead-in, not a sentence with figures.
   - The plain-text email and the text message join the lead-in and the range into one sentence ("…put it at
     $4.23M – $4.92M."); `sms.startsWith(HEADLINE)` and its test change with it.
   - D-21 (a headline is required) and the numbers check stand; a lead-in without figures passes the numbers check.
4. **The range, on white** (decided). No black block. "$4.23M – $4.92M": 44px, Object Sans Heavy, ink, the first big
   black text in the email. "($2,112 – $2,457 / SF)": 13px grey, at the right end of the same line, baseline-aligned.
   Neither wraps (two cells of one row, `white-space:nowrap`); check the fit at 536px. No "from 3 sales close by", no
   eyebrow. Co-ops without sizes: the $/SF cell drops out.
5. **The agent's paragraph** (decided). 28px under the range, 14px, three or four lines: how the comps were chosen,
   which one weighs most, the size caveat, what the listings further down are for.
6. **The closest match** (decided). 2px ink border. On white inside its top: "THE CLOSEST MATCH" (section-header style,
   below) with the yellow ★ (#e8b923, 28px) at the right. Then the photo, full width of the card, 330px: the address
   (22px, Object Sans Heavy, white) over its top; the price (26px bold, Helvetica, white) and "$2,112 / SF" over its
   foot. Each on a **tight** gradient barely taller than its text (about 64px: 88% ink, 70% at the middle, clear).
   Below the photo, off it: the status line ("Sold Aug 2026 · Floor 10 · 2,201 sq ft", 12px grey, ink square) and the
   client paragraph (14px). 18px side padding.
7. **Also sold nearby** (decided). The same card at half size, two up, **built from one pattern** (one function, called
   per comp: `compBox` already works this way). 1px ink border, a 190px photo; the address (15px, Object Sans Heavy)
   over its top and the price (18px bold) with $/SF (12px) over its foot, gradients about 46px. Below the photo, 14px
   down: the status line (11px), then 10px down the paragraph (13px), 16px bottom padding.
8. **On the market now · asking, not sold** (decided). One row per listing: a **137×137 square photo** at the left; to
   its right a column as tall as the photo. Its top half: the address (15px, Object Sans Heavy) with the ask at the
   right ("$4.84M ask"), then the status line (11px grey, lavender square for in contract, white for active). The
   agent's note **starts at the photo's vertical middle** (60px down) and wraps normally, down to the photo's foot:
   **four lines at most, a 200-character limit** on the client's-words step for listings (about 55 characters a
   line at 13px in the 385px column). Enforce the limit where it's written; mail clients can't clamp lines.
9. **Things to consider** (decided, unchanged in substance).
10. **The sign-off** (decided). After Things to consider: "Best," and the agent's first name, 14px, in the body's
    voice. The closing word is the agent's to choose (Best, Thanks, Sincerely…): a field on Send with "Best,"
    as the default.
11. **The signature** (decided). Above a 2px ink rule: a **square** headshot (92px, no rounding; the roster's clean
    square, `server/agent-card.ts`), then in ink: the name (13px bold: not heavy, barely bigger than the rest), "Casa
    Blanca Real Estate", the title (the roster's `title`: "Licensed Real Estate Agent" or "Salesperson", as the agent
    has it), their email, their phone (all 12px regular). The **Plan the offer** button at the right (kept: the
    reply is how a client acts). The office address is **not** here.
12. **Footer** (decided). Black: the wordmark centred, under it the office address ("10 Hubert St, Tribeca", 11px
    light grey, centred), then the disclaimer.

**Section headers** (decided): "THE CLOSEST MATCH", "ALSO SOLD NEARBY", "ON THE MARKET NOW · ASKING, NOT SOLD", "THINGS
TO CONSIDER" all share one style: 10px, weight 600, 0.24em tracking, ink.

## Type (decided)

**Helvetica Neue, Helvetica, Arial** for everything, except the main headers in **Object Sans Heavy**: the hero
address, the range, and each comp's address (closest match, nearby, on the market). Prices other than the range,
labels, body text and the signature stay Helvetica: cleaner at small sizes. For this build, Helvetica Bold stands in for Object Sans in the email (see "Decided").

## Decided (Kimani, 2026-11-06)

1. **Text over photos: rule 7 relaxed for it.** The hero, the closest match and the nearby cards use the photo as the
   cell's background with the text on it, and every such cell carries `bgcolor="#0f0f0f"`, so a stripped or blocked
   photo leaves white text on black (the canvas's Photos off tweak shows it). Rule 7 otherwise stands.
2. **Object Sans: not in this build.** Build with Helvetica Bold where the canvas shows Object Sans Heavy; every
   client shows Helvetica today anyway. Loading the hosted font from the email (`@font-face` to
   `assets/fonts/ObjectSans-Heavy.woff2`, Apple Mail and iOS only) is a later change: `follow-ups.md`, item 5.
3. **Co-op:** no $/SF anywhere. The range line shows the range alone (the parenthetical drops), and each card shows
   its price alone. Nothing replaces it.
4. **Not needed:** a dark-mode design, a new place for Plan the offer (it stays where it is), a designed look for the
   text message (the agent sends their own text). Kimani checks the look with real photos on the platform once this
   is built.

## Not designed yet

A comp with no paragraph: the card closes up under the status line.

Cross-cutting follow-ups (the repeated-component audit, the font mix in the tool, blocked images): `follow-ups.md`
beside this file.
