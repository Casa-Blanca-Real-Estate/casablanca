# Comp report — the screens, and what goes on each

**Casanova · 2026-09-29 · v0.2: Kimani's answers to D-20 to D-23 are in.** This is the information architecture: for
each screen, what the agent must give, what's shown, what folds away, and what moves elsewhere. It
isn't a visual design; that's Kimani's (Claude Design), on top of this. It builds on:
- Kara's workshop (how Casa's mentors teach comps), `sources/kara-comp-reports-workshop-transcript.txt`
- Frankie's email (what a good one looks like to a buyer), `sources/2026-07-29-frankie-delessio-comp-email-111-fulton-517.pdf`
- Hannah's briefing and export
- Noble's two goals: the one-sentence headline, and adjustments that may never need values
- a walk through the CR-3a scaffold with sample data

The master design (`01-design.md` v0.5) points here for the screens.

## What changes from the scaffold

- **The start is one guided flow, in a modal:** the home, then its details, then add comps. The agent
  lands in the workspace with the comps already in.
- **"Export" becomes "Add comps",** in three ways: paste StreetEasy links (one or many), drop the
  StreetEasy export, or type one in. Many agents never use StreetEasy's comps export. Kara never
  does: "it misses obvious comps and brings in things that I don't really think are comps."
- **Three workspace screens, not six steps:** Sort, Findings, Send.
  - The agent's own number becomes the gate into Findings.
  - The headline, the one sentence, heads Send.
  - The assistant is a drawer, open from any of the three.
- **Each screen shows what's needed now.** The rest folds away or moves to where it matters.
  - The target price and deal terms move after the reveal.
  - The brief shrinks to buyer or seller, plus the client's name.
- **The build's own notes go behind one switch.** Sections, stubs and decision IDs sit behind
  "Build notes", for admins only and off by default. Agents never see them.
- **A sample report gets one banner,** not a "Sample" tag on every field.

## Principles

1. **The report exists to support one sentence.** Noble: the goal is a one-sentence headline of what
   the comps show. Everything upstream feeds it, and everything downstream backs it up.
2. **Buyer first.** About 95% of Casa's comps are for buyers deciding what to offer. Kara: "the
   comparative market report is the logic" behind an offer. Seller pricing uses the same screens with
   seller wording.
3. **The agent's notes are the substance.** Kara calls the notes column "unbelievably important", and
   Frankie gives every comp one to three plain lines on how it differs. The tool makes notes quick to
   write, suggests them from what it can compare, and puts them in the email.
4. **The rules mentors teach are checks the tool runs.** First floors, private outdoor space against
   none, new development against resale, co-op against condo, distance, and a sale's age are all
   flags on a comp. They're not blocks: the agent decides.
5. **"Required" means the numbers or the headline can't do without it.** Everything else is
   optional, folded away, or asked for when it starts to matter.
6. **Numbers up front, where they came from on demand.** A value's source and certainty are one tap
   away, not printed beside it.
7. **Empty sections disappear.** Kara: "delete it … make sure this looks like it's tailored for your
   buyer, not a form that was lazily filled out."

## The flow

```
New comp (modal)                          Workspace
  1 The home → 2 The details → 3 Add comps  →   Sort  →  Findings  →  Send
                                                 (the assistant is a drawer on all three)
```

## New comp — 1 · The home

**For:** which home, and who it's for.

| Must | Shown | Later, elsewhere |
|---|---|---|
| A StreetEasy link to the home, **or** an address and unit | Buyer or seller (buyer preselected) | The client note: Send |
| | Property type: condo (co-op shown as "coming soon") | Target price: Findings, after the reveal (D-4) |
| | The client's name (optional; used in the email greeting) | Deal terms: Findings |

- **A link fills in everything it can:** the building, neighborhood, beds, baths, size, floor, ask,
  charges and features. The agent confirms on the next screen.
- **Edge cases:**
  - A link that isn't a StreetEasy listing: "Paste a StreetEasy listing link, or type the address."
  - A home that's off the market is fine.
- **Admins** get a "Use the 100 Barclay sample" link here, which fills all three screens.

## New comp — 2 · The details

**For:** what the numbers and the comparisons need to know about the home.

| Must | Shown | Folded ("More about the home") |
|---|---|---|
| Interior size, in sq ft, with a "my estimate" switch. Without it there's no $/sq ft value, and the tool says so | Beds · baths · floor | Private outdoor space: kind, size |
| | The asking price (prefilled from the link) | Views · exposure · corner unit |
| | Monthly charges and taxes (for a co-op, maintenance) | Condition: renovated, good, needs work |
| | **Notes: what stands out?** Light, views, condition, layout, storage | In the unit: washer/dryer, dishwasher, central air, fireplace |
| | | The building: doorman, amenities, year built, new development or resale |

- **Values prefilled from the link** carry a small "from StreetEasy" mark, and a hover says so.
  Changing one makes it the agent's.
- **The notes box** is free text, two or three lines. Kara: "just basic qualities of the apartment …
  you really go crazy on the notes." The assistant can turn the notes into the structured fields later
  and ask before it does.
- **Hidden:** input-confidence wording. The estimate switch says enough, and a tooltip covers the
  rest.

## New comp — 3 · Add comps

**For:** getting the comps in, however the agent found them.

**Three ways in, one list:**
1. **Paste StreetEasy links**, one or many, one per line. Each becomes a row as it loads: address,
   status, price, size, $/sq ft. A detail the page didn't give is marked missing, not guessed. What
   the tool read from the page waits for a one-tap confirm, since reading a page can misread it.
2. **Drop the StreetEasy comps export** (CSV or XLSX).
3. **Type one in:** address, status, price, size, floor, date. For a comp without a link.

**The list**
- Grouped by status: sold, in contract, active, and **didn't sell** (listings that came off the
  market). Frankie lists the building's unsold listings as evidence of a ceiling.
- Each group counts against "about three each". Kara: "three in each section is great."
- A guidance line, not a rule: *"Same building first. Within a quarter mile. Sales from the last three
  to six months."* (Kara)

**Flags, as each row lands:**
- Same building: a good sign.
- First floor.
- Private outdoor space the home doesn't have, or the other way round.
- New development against resale.
- Sold more than six months ago.
- Much bigger or smaller: more than about a quarter either way. Frankie cut 550 and 800 sq ft for a
  725 sq ft home.
- Far away, once the tool knows distances.

**Also:**
- **Must:** nothing. "Done" works with no comps, and lands on an empty Sort with its add bar.
- **Folded:** the import's notes, shown as a count ("2 notes from the import") that opens.
- **Hidden:** the export's raw columns and the engagement stats (views, saves).

## Workspace — Sort

**For:** deciding which comps count, and noting how each differs from the home.

**One compact row per comp, grouped by status.** A row shows:
- the address and unit, linking out to the listing
- the price, marked sale or ask
- $/sq ft, size, floor, the date, and days on market (Kara: "please please please put in days on
  market")
- the flags from Add comps
- **Primary / Secondary / Excluded**: the tier (D-20; plainer labels on hold)
- **Notes:** one to three short lines, Frankie-style. There are quick-pick chips from what the tool
  compared: "Smaller", "Lower floor", "No outdoor space", "Same layout", "Same building". The note is
  also the reason, so there's no separate reason field and no Record button.

**Also:**
- **Folded, when a row is opened:** every fact and where it came from, the import's notes, the history
  of tier changes, and a star for "closest comp" (the anchor).
- **Hidden:** the reviewed checkbox (opening a row counts as reviewing it), engagement, the provenance
  line, and "in both results".
- **The range stays hidden** until the agent gives their number or skips it (D-1).
- **An "Add comps" bar** at the top: the same three ways in.
- After the reveal, a **slim live line** above the list shows the range moving as tiers change.

## Workspace — Findings

**Your number first** (first visit only, D-1): *"Before you see what the comps say: what do you
think it's worth?"* The agent gives a low and a high, with an optional line, or skips.

**Then, top to bottom:**
1. **What the comps say, in one sentence.** The tool's neutral reading from the numbers, for example
   *"The three closest sales put 17L at $2,112–$2,457 a sq ft — about $4.2M–$4.9M."* The agent's own
   headline is written on Send.
2. **The range**, on one line. Both results appear side by side **only when the agent's estimates
   change the answer**; otherwise one.
3. **The agent's number against it:** *"Your $3.4M–$4.2M sits below what the sales support."* This is
   the teaching moment (§8.4).
4. **By status:** sold, in contract, active and didn't sell. Each shows its count and median $/sq ft,
   plus sale against last ask for sales. Asks never mix with sales.
5. **A price table** for the home: $/sq ft steps and the price each implies, as in Frankie's email.
6. **The comps that count**, with their notes. These are the lists the email uses.
7. **The target price** (after the reveal, D-4), where it sits, and Path to target (later).
8. **Offer details** (folded): for a buyer, the offer price and terms; for a seller, pricing.

**Folded ("How this was worked out"):**
- the method (median $/sq ft, the default until Noble picks one)
- how comps differ from each other: pairs and their price gaps (§6.6)
- the factors considered but not calculated
- what the tool still needs, with links to fill each one
- warnings, carry detail, and the engine version

## Workspace — Send

1. **The headline, required to send.** One sentence, the agent's. The assistant offers two or three
   drafts from the numbers, and the agent picks or rewrites. QA checks every number in it traces to
   the engine. Newer agents write first and get feedback; experienced agents get drafts (D-5).
2. **The email**, in Frankie's order:
   - greeting
   - the headline
   - one line on how the comps were chosen, from the agent's sorting (*"I focused on lower floors and
     homes close in size…"*)
   - sold, in contract, active and didn't sell: each comp as a link, its price and its notes
   - things to consider: the agent's points, and buildings that trade higher or lower
   - the price table
   - the next step (the offer advice)
   - sign-off
   - the approved disclaimer (D-13)
3. **Length:** full, short, or a text message.
4. **QA** is one status line, "Ready to send" or "2 things to fix", which opens to the checks.
5. **Copy the email.** The PDF comes with Kimani's template (CR-6).
- **Hidden:** the result selector, unless estimates are in play. Then it says *"Uses your estimate of
  the size — the email says so."*

## The assistant drawer

- It opens on Sort, Findings and Send. The modal doesn't need it.
- After the reveal it reads the numbers. It never sees the agent's number or the target (§8.4).
- It offers a starter question for each screen:
  - Sort: *"Which of these are closest to the home?"*
  - Findings: *"What's the strongest case for offering at…?"*
  - Send: *"Tighten my headline."*

## For admins while it's built

- **"Use the sample"** on the modal's first screen, "Fill the rest with the sample" on its others, and
  "Fill with sample" per screen in a strip under the header. All of them show for an admin or a guest
  whatever the build-notes switch says (Kimani's demo, 2026-10-22: with the switch off there was no way
  through without typing).
- **Build notes:** the scaffold's "About this step" boxes, section references, stub labels and
  decision IDs, behind one switch, off by default.

## From the scaffold: what goes

| Now | Becomes |
|---|---|
| Six steps in a tab rail | A three-screen modal, then three workspace screens |
| "About this step" boxes | Behind the build-notes switch |
| A "Sample" tag on every field | One "Sample report" banner |
| The brief: question, audience, client note | Buyer or seller, and the client's name, in the modal. The client note on Send |
| Target and deal terms on Home | On Findings, after the reveal |
| Sort's reason field, Record button, reviewed box and anchor box | One notes field; the anchor as a star in the opened row; reviewing implied by opening it |
| "Work it through" as a step | The drawer |
| Both results always side by side | One, unless estimates change the answer |

## Decided (2026-09-29)

1. **Tier labels:** Primary / Secondary / Excluded, for now (D-20). The plainer "Counts / Context /
   Leave out" is on hold; revisit after testing with Noble.
2. **A headline is required before the email can be copied** (D-21). Revisit after testing.
3. **The client's name is asked in the modal**, beside buyer or seller (D-22).
4. **"Didn't sell" is a fourth group in v1** (D-23).
