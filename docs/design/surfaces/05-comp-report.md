# Surface 5 — The comp report

**State: the structure is built and live** (CR-3b, #57, 2026-09-30), and the visual design hasn't
started. Every screen works with sample data and with real StreetEasy links. This brief is for the
visual pass, in Claude Design.

**Lives at** `/tools/comp-report/`, which is team-only for now. It's the one React + Vite +
TypeScript tool: its source and styles are in `tools-src/comp-report/src/`.

## 0. Read first

1. **This folder's `README.md`:**
   - §1, the product;
   - §3, the brand system: reuse the dashboard's tokens and primitives, don't invent a parallel set;
   - §4, the shared chrome.

   §2's single-file rule and §5's deliverable contract don't fit this tool as written; §5 here
   replaces them.
2. **`docs/comp-report/02-screens.md`**, the information architecture. For each screen it says what's
   required, what's shown, what folds and what's hidden. **The design follows it; it doesn't
   re-decide it.**
3. **`docs/comp-report/01-design.md`** §1 (what it's for) and §3 (the flow), if you want the why.

## 1. What it is

An agent picks a home and adds the comparable sales. The tool sorts them, shows what they say about
the price, and helps the agent write **one sentence for the client** and the email around it.
- **Buyers first:** about 95% of Casa's comps answer "what should we offer?".
- **Noble's test:** the report exists to support one sentence.

**Who uses it:** Casa's ~200 agents, from new ones in mentorship to seniors, often on a phone between
showings. Mentors and admins see more (build notes, the sample).

## 2. The screens: all built, walk them on production

| Where | Screen | Its job | On it |
|---|---|---|---|
| New comp (modal) | 1 · The home | Which home, and for whom | StreetEasy link or address · buyer or seller · the client's name · condo (co-op "coming soon") |
| | 2 · The details | What the numbers need | Size (the one required field) · beds, baths, floor · ask · charges · notes · values marked "From StreetEasy" |
| | 3 · Add comps | Get the comps in | Paste links (each row fills in as its page is read, then **Confirm**) · drop the export · type one in · one list, grouped, with flags |
| Workspace | Sort | Which comps count, and why | One compact row per comp, grouped Sold / In contract / Active / Didn't sell · tier (Primary / Secondary / Excluded) · a note with quick-pick chips · flags · an opened row with every fact, the history and the "closest comp" star |
| | Findings | What the comps say | "Your number first" gate · the one-sentence reading · the range · your number against it · by status · the price table · the comps that count · target and offer details, folded · "How this was worked out", folded |
| | Send | The client's email | The headline, required, with drafts · the email in Frankie's order · full, short or text · one QA line · Copy |
| Everywhere | The assistant | Ask about the comps | A drawer on all three screens, with a starter question per screen |

## 3. The states to design

- **Empty:** no comps yet. Sort opens with its add bar.
- **A link being read:** the row appears at once and fills in. **A failed read** offers "Type it in".
- **Unconfirmed rows:** values read from a page wait for one tap. Until then they count in neither
  result.
- **The gate:** Findings before the agent gives their number, and after.
- **One result, or two side by side,** shown only when the agent's estimates change the answer.
- **QA:** "Ready to send", or "1 thing to fix" opening to the checks.
- **A sample report:** one banner, nothing per field. **Build notes:** an admin-only switch, off by
  default.
- **Phone width**, for every screen above.

## 4. Rules the numbers carry

- **$/sq ft is truncated,** as StreetEasy shows it.
- **Prices are in client figures** ($4.23M), with exact dollars on hover.
- **A sale and an ask are never shown as the same kind of number.** Each price says which it is.
- **Where a value came from, and how sure it is, is one tap away, not printed beside it**
  (`02-screens.md` principle 6). One quiet visual language is needed for:
  - "from StreetEasy";
  - "unconfirmed";
  - "your estimate".
- **Empty sections disappear.**

## 5. What to hand back

- **A visual system for the tool:** type scale, spacing, colour and states, mapped onto the
  dashboard's tokens (README §3).
- **The screens and states above,** at desktop and phone width.
- **Mason implements it in the existing components.** Name things by screen and element, as in §2,
  so each maps to a component. Design changes patch the components; nothing gets rewritten.

## 6. Decisions the design makes

1. **A Sort row on a phone:** what shows, and what waits for the opened row.
2. **Provenance and certainty:** the one quiet language from §4.
3. **Findings' hierarchy:** the sentence, the range and the agent's number. The sentence leads.
4. **Send:** the headline's prominence, and how the email preview reads.
5. **The drawer:** a side panel on desktop; a bottom sheet on a phone?

## 7. Still moving: design for it, don't wait for it

- **Arriving with Dispatch 09 phase 3,** shaped in `02-screens.md`: Kara's checks as flags and chips
  on Sort, and the price table, the pairs and "didn't sell" on Findings.
- **Later:** suggestions from Jev, such as a condition read from the listing. These need one
  "suggested — confirm?" treatment.
- **The tier labels may change** after testing with Noble (D-20).

## 8. Getting it into Claude Design

1. On production, open **New comp → Use the 100 Barclay sample** (admins see it), then turn on
   Build notes and use **Fill the whole report**.
2. Screenshot each screen and state from §2 and §3, at desktop and phone width.
3. Give Claude Design those screenshots, this brief, `02-screens.md`, and README §3's tokens.
