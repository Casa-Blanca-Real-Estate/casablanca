# Claude Design handoff: Noble's walk-through, 2026-10-15

For Claude Design and Kimani. Picks up from `docs/comp-report/design-port/` (README, "Handoff Notes.md") and the build as merged in #77 (Dispatch 14). Source of every point: `00-items.md` (NW-001 to NW-102). Per-topic grounding: `01` to `06` in this folder.

## How to read this

- This file holds only what changes layout, flow or architecture (NW-095). Copy fixes, controls, data and back end ship first, without changing the layout, so you design against the tool as it really is.
- "Lands before you design" marks Phase A work that adds data or controls to a screen. It ships first. Design for the screen as it will be then, not as it is in the #77 screenshots.
- "Open" marks a question the design should answer or Kimani must decide first.
- Rules that hold everywhere: D-4 (Hubert sees the target only after the neutral result, never the writer, never the email), D-27 (what the port changed: Hubert is a guide, Send's Full and Short were plain text; NW-084 reverses that last line), the engine's numbers are never moved by a design choice, comp data is never invented, practice and full agent levels exist (D-11).
- Hubert is the AI assistant. The comp report data stays in production. Agents are slow to respond, so no flow may depend on an agent answering anyone.

## Walk screenshots (`docs/comp-report/design-port/walk-cr6/`)

Each exists for `buyer-condo` and `seller-coop`.

| File | Shows |
|---|---|
| 01-sign-in | Sign-in screen |
| 02-reports | Reports list: masthead, hero, the agent's reports |
| 03-new-home | New report step 1: side, client, type, link or address, target |
| 04-new-details | Step 2: home details (size, floor, price, charges, taxes, pickers, year built, notes) |
| 05-new-comps-add-form | Step 3: add comps, with the add form open |
| 06-sort | Sort table with comps |
| 06b-sort-empty | Sort with no comps yet |
| 06c-sort-expanded | An expanded comp card (the screen Kimani shared: photo placeholder, facts row, features, note, checks) |
| 07-gate | The Gate, practice agent (no skip, a why of 100+ characters) |
| 07b-gate-full-agent | The Gate, full agent |
| 08-findings | Findings: the range, the price table, the accordions |
| 09-send-full | Send, Full tab |
| 10-send-designed | Send, Designed tab (the preview of the HTML email) |
| 11-done | Done |

No screenshot shows Hubert's drawer or the column chooser; neither exists in the walk set. The drawer is unmounted when closed, so capture it open on Sort.

---

## 1. New-report modal (home, details, comps)

### What the build does today
- Step 1 (home): side, client, type, one line taking a StreetEasy link or a typed address, target, brief. Nothing saves until Next; Next creates the report, then everything autosaves 500 ms after each change (NW-005). A report abandoned on step 2 or 3 stays in the list.
- A link is read by Firecrawl. The read asks for neighborhood, year built, type, sponsor/HDFC, new development, amenities and policies, but only fills address, unit, size, beds, baths, floor, ask, charges, taxes, central air, dishwasher, fireplace, laundry, views, year built, new development and outdoor. Noble set the pickers by hand because of that gap.
- Step 2 (details): a tile grid (size, floor, ask, charges, taxes, year built), one feature-picker block (Outdoor space, Views, Exposure, Unit condition, Building, and so on), New development toggle, Notes. The home's unit features and the building's sit together.
- Step 3: add comps by link, address or export file; same bar as Sort's Add comps.

### Lands before you design
- Pickers fill from the read: Building from service, parking and amenity tags, corner, rooms, policies, neighborhood (NW-011, 017 a).
- Condition scale: Needs work, Original, Good, Updated, Renovated, Mint, each with an ⓘ (NW-012). Open for Kimani: the word "Good".
- Building amenities in StreetEasy's categories (Services and facilities, Wellness and recreation, Shared outdoor space and others) as data (NW-009 a). Policies group: pets, smoking, co-op rules (NW-010). Taxonomy in `07-streeteasy-taxonomy.md`.
- "Outdoor space" group renamed "Private outdoor space"; shared outdoor lives with the building's amenities (NW-008 a).
- Every feature group marked `unit` or `building`, plus which property types it applies to, so a house shows no concierge (NW-039 a).
- Neighborhood on the intake, shown in the step 1 match line (NW-017 a).
- Reads also fill "Resale / New development" (NW-018 b).
- Photo URLs from the read, shown only in Sort's card photo area (NW-020 a). Only new reads have photos. The home's photo in the modal, the home panel and photos in the Designed email are Phase B (NW-020 b, NB-3).
- Size becomes a plain open field when no home was read, with the Estimate toggle beside it (NW-006). Year-built field gets the tile's underline and pencil (NW-013). Link field shows the clean URL after a check (NW-004). Copy fixes for link field, target tip, notes ⓘ (NW-001 a, 003, 015).

### Design problems

| Id | Problem |
|---|---|
| NW-008 b | Separate the home's features from the building's in the modal. `FeaturePicker` already takes an `only` prop, so two pickers are possible. |
| NW-014 | Laundry as a first-class item. "About the home" and "About the building", as tabs or one scroll, not two steps. Building sits below the home's fields. |
| NW-016 | New development moves to the building section. |
| NW-009 b | How a long, categorized amenity list shows in the modal and on the comp card. |
| NW-039 b | Comp card and edit form split unit and building, type first, dependent groups hidden (also on Sort). |

### Constraints
- Stored keys stay (`outdoor` and the others). `cleanFeatures` drops unknown labels, so new labels are additive only.
- Type decides which groups show. Townhouse and house pricing is not decided (NW-019, floors instead of floor, is LATER).
- The home's Notes are read by Hubert and never shown to the client or put in the email.
- Target (NW-064 below) is a field on step 1.

### Open
- What the target means: one number or a range (NW-002, Kimani). Recommended: one number, relabelled by side. A range needs a Findings design.
- Type model (NW-018 a) decides whether the type picker has two options or five. If NB-2 = A, Dispatch 16 stores a type label (HDFC, condop, townhouse) and sponsor and HDFC flags as data only; the pricing basis stays condo or co-op. Where the label is shown and edited (step 1, the details, the comp card) is Design's.
- Photos in the Designed email: linked or hosted (NW-020 b). Recommended: linked. They arrive in Phase B, after Dispatch 20 carries the photo URLs to the client. Design for photos that can fail to load.

---

## 2. Sort

### What the build does today
- Table: tier control (1st / 2nd / ✕), ★ anchor (invisible until hover, independent of tier), address and unit, price, $/sf, size, date, days on market. Clicking a row expands it; several can be open. A filter row for tags starts closed.
- Expanded card (`06c`): photo placeholder on the left; "StreetEasy ↗" and "✎ EDIT" on a row of their own; facts row; "FEATURES · n shared with {home}" with pickers; a note line ("No note yet. Edit to say why it's here."); "+ CHECKS, SOURCES AND HISTORY". Tags appear as chips with no section label, and look like unshared feature chips.
- Remove sits inside Edit ("Remove from the report"). StreetEasy facts are locked in edit mode with a line saying they stay as they are.
- Header progress row sits under the title; the Findings button is disabled until each comp has a tier, a note and a tag, with a filter link.
- Edit details reopens the modal. There is no read-only view of the home.

### Lands before you design
- ★ becomes a fourth segment in the tier control, always visible (NW-026; Kimani decides whether ★ implies 1st, recommended yes). Tier segments get titles and a header ⓘ (NW-027).
- Yellow markers on the empty tier segment, note line and tag section, and "Needs tier, note, tag" becomes links that open the card at that spot (NW-038).
- "+ Add a note" button and ✎ on a filled note (NW-030). Edit-collapse guard "Save changes? Save · Discard" (NW-043).
- Tag section label (word chosen in NW-028, recommended "Comp tags") (NW-040 a). Tag groups as data: Similarities, Size scale, Floor, Multi-floor (NW-045). Suggested tags "from the data" and contradictions cleared (NW-059, Kimani decides pre-fill or suggest).
- Neighborhood in the card's facts row (NW-033 a). Subway lines in the Distance section as plain coloured circles (NW-037 a, waits on a station source).
- Photos in the photo area (NW-020 a). Fact locks with overrides, marked "changed", original kept in "Where it came from" (NW-044 a; Kimani decides how an override counts).
- Trash in the card actions, Undo toast, "Removed (N)" fold with "Put back" (NW-056). The hover pencil and trash in the row's margins are a design item, below. Findings CTA repeated at the bottom (NW-053). Admin sample reset (NW-054).

### Design problems

| Id | Problem |
|---|---|
| NW-035, 041 | Card re-layout: StreetEasy link, facts, features and checks go under the photo; Edit leaves its own row. Features visible without editing. |
| NW-036 | Where the note sits in the re-laid card. |
| NW-039 b | How the unit and building split shows on the card. |
| NW-056, 057 | Hover affordances in the row's margins: the edit pencil on the right, the trash on the left, so an agent need not expand a row and hunt for Edit. The trash, Undo and the Removed fold land first; the margins are yours. |
| NW-040 b | Make features and tags look different. |
| NW-034 | Column chooser: Price and Tier always on; $/sf, size, date, neighborhood, days on market optional; sideways scroll with Tier pinned. |
| NW-033 b | A Neighborhood column (after NW-034). |
| NW-037 b | Where subway bullets show: row, card or home panel. |
| NW-049 | Read-only view of the home on Sort (side panel or expanding sticky header). Edit details stays the modal. |
| NW-050 | The progress row moves onto the title's line, with the home panel expanding there. |
| NW-052 | Compare view: the home and one comp side by side, same fields in the same columns, arrows to step through. Build follows. |

### Constraints
- Only 1st-tier comps enter the statistics; 2nd is context; ✕ is out of every figure. The tier control must say so.
- The server accepts the fixed `TAGS` list (Dispatch 16 adds strings for the size scale, Penthouse and the multi-floor group) plus agent-typed free tags (40 characters, fair-housing screened). Group labels are display only. Only list tags count toward "needs a tag".
- A removed comp keeps tier, note and tags on restore.
- Link comps not yet confirmed show "Confirm or remove".
- The lavender outline ("The home has this too") exists in edit mode and the add form (NW-048). Keep it.
- Several rows open at once is intended (NW-051).
- Home panel (NW-049) and a left-placed Hubert drawer (NW-025) compete for the same side.

### Open
- NW-032: onboarding walkthrough is LATER. Do the ⓘ hints first, judge after this round.
- Whether the compare view needs its own route or lives in the panel.
- Which fields are default in the column chooser, and where the setting is remembered (per agent, per report).

---

## 3. Hubert's drawer

### What the build does today
- A drawer of fixed width (`--sh-drawer-w`, 380px), rendered only while open, so closing drops the draft and remounts the chat. Closing mid-reply is safe: the server finishes the turn.
- Hubert's replies print raw markdown in a pre-wrap paragraph. The agent's bubble is plain text. Greeting and mark are plain constants.
- Hubert has two tools (report, numbers). He does not know the screen. He cannot answer "Does 5 Franklin have a doorman?" today.
- Chat is owner-only; admins can read a transcript.

### Lands before you design
- A safe markdown renderer (bold, italic, code, lists, headings as bold lines, http(s) links, no images) for old and new messages (NW-023). Design the bubble for rendered text.
- Wider read: comp features, neighborhood, building, policies, days on market, the screen the agent is on, checks, the email once Send is reached (NW-093 b). The target after the reveal (NW-068 a). Role and capability gates on the server (NW-093 c).
- Persona and voice move into a new prompt version after you say who he is (NW-024 b).

### Design problems

| Id | Problem |
|---|---|
| NW-024 a | Look and presence: mark, bubbles, motion, avatar. |
| NW-025, 042 | Softer open and close, drag handle to widen, maybe on the left. A close animation means keeping it mounted. |
| NW-093 e | A confirmation card for when Hubert proposes a change (what, from, to, why; confirm, dismiss, undo) and where his actions show in the drawer. Also a capability sheet showing what he may do. |

### Constraints
- Hubert never tiers, writes notes or picks tags (D-27.6). Proposals cover facts, features, putting a removed export row back, and email fixes; confirm sends the same request the screen would, as the agent.
- Practice agents: read only; he asks before telling.
- He never changes a number or advises steering the estimate (§8.5).
- Chips on each screen depend on what he can see; chips for the target only make sense after the reveal.

### Open
- Kimani's call on what Hubert may write (NW-093 d). The confirmation card waits on it.
- Whether he sees the agent's own Gate number after the reveal (recommended yes).
- Left or right, given the home panel.

---

## 4. The Gate and Findings

### What the build does today
- Gate: the agent commits a low, a high and a why before seeing the range. Practice agents cannot skip and need 100+ characters (`07`); full agents can (`07b`). This works as intended (NW-062).
- Findings (`08`): the range, "The N closest sales" (the counting 1st-tier sold comps, NW-061), "How Hubert got there" (deterministic text built in code, not a model reply), a price table of 10 to 12 rows, six accordions (comps that count, pricing details, target, deal terms, client note, how it was worked out). "13 still needed" is the raw gap count.
- Target accordion: price and a note, "Whose, and why". Hubert is told he never sees it.
- Pricing details show "Timing: List in October" (the seller template's field), "Sales against ask" as a bare percentage, and days on market as a bare median.
- Terms dropdown offers both templates whatever the report's side. Client and deal details live in the sixth accordion.
- A co-op report gets no price table and raises $/sq ft gaps.

### Lands before you design
- Plainer "How Hubert got there", comp names as segments rather than one string with parentheticals (NW-063 a).
- Five-row price table (Low, quarter, middle, three-quarter, High) plus a calculator that runs in the browser and is never saved (NW-065 a). Kimani decides if the email gets five rows too (NW-065 b).
- Gap count only counts what the agent can act on, with plain words; the rest go under Warnings (NW-077). Co-op reports stop raising $/sq ft gaps (NW-066 a).
- An ⓘ on every accordion header and a line on top of "Comps that count" (NW-067 a).
- `target.owner` (client, agent, both) as a three-way toggle (NW-070). Copy: Hubert sees the target after the reveal, never changes a number, never in the email (NW-068).
- Neutral range pinned at the reveal, with how far later changes moved it toward the target (NW-069 a).
- Pricing details copy: Seller's timing, buyer's Target closing, the sales-against-ask and days-on-market sentences with spread and count (NW-071 a, 072). Terms dropdown shows only the report side's template (NW-073 a).
- Client fields as data, no layout: financing cash or mortgage (cash hides rate, down payment and term), pre-approved and amount, timing and flexibility; on the brief, urgency and a close-by date, what they'd pay more for, non-negotiables, priorities (NW-074 a). Free text is screened by fair-housing on save.

### Design problems

| Id | Problem |
|---|---|
| NW-063 b | Comps as chips in "How Hubert got there". |
| NW-064 | Make setting the target easier, in the modal and in the accordion. |
| NW-071 b | A strip chart of each sold comp's sale against its ask, beside the estimate bar. Data: `output.comps[].sale_to_ask_percent`. |
| NW-073 b | Client and deal details become a first-class section, out of the sixth accordion. |
| NW-074 b | Where the client fields are asked: intake step 2, or a step after Findings. |
| NW-069 b, 075 | The loop after Findings: client details, what could move, and Hubert helping the target move toward the supportable range (§8.5 path-to-target mode). Combines 069 b and 074 b. Large. |
| NW-076 | "How this was worked out" becomes a dropdown of every factor under "How Hubert got there". Data: the engine's bridge lines. |
| NW-066 b | Review the co-op flow end to end on the co-op sample (Fill with sample or Reset the sample in the Dev tools strip, admins only; both arrive with Dispatch 23 items 1–2), including whether a five-price ladder stands in for the price table. |

### Constraints
- The neutral result comes first and never moves. The target, the agent's call and the client's details never change the range (D-4, §8.4). The pinned neutral figure and its movement are shown, not hidden.
- Hubert reads the target only after the reveal. The writer and the email never see it.
- Sale-against-ask has a number only for the counting 1st-tier sold comps; with few comps, say how few.
- Co-op reports have no $/sq ft table. The calculator is browser-only.
- Free text in client fields is screened for fair-housing. Do not design prompts that invite protected characteristics.
- A step after Findings must work without the agent having the client's answers; every field optional unless the engine needs it.

### Open
- Target as a number or a range (NW-002); if a range, Findings needs a marker design.
- Is the client section before or after Findings, or both (NW-074 b)?
- What "could move" looks like: sliders, a list of levers, or only text from Hubert.
- Does Hubert see the agent's own Gate figure after the reveal?

---

## 5. Send and Done

### What the build does today
- Send: a strip with "Write it" (the writer drafts the headline and email), tabs Full, Short, Designed, Text (Full is default), a headline field, a subject input on Full and Short only (not copied, editing it freezes the body into a draft), copy buttons, a QA panel with issue marks, and "Mark as sent" as a quiet second button.
- Designed (`10`): a 600px HTML email preview with no fields. The pasted HTML is one table with no centring wrapper, so Gmail pastes it left. The title is plain text, so Gmail autolinks the address. Hatch-gradient photo placeholders arrive as flat grey in Gmail.
- Full and Short are plain text textareas; copying an untouched one gives formatted HTML, an edited one gives bare paragraphs with raw StreetEasy URLs.
- Done (`11`): hangs under Send, not a step in the progress row. Mark as sent is hidden on a read-only report and a hand copy never enables it.

### Lands before you design
- Order Designed, Full, Short, Text, Designed first by default (NW-079 a). The "Hubert drafts the headline" paragraph is gone (NW-078).
- Designed email markup fixed: centred wrapper, explicit fonts and no italics, address links dark and plain (NW-080, 081, 082).
- Subject shown above Headline on Full, Short and Designed (not the Text tab), with its own Copy button, stored apart from the draft (NW-083 a). Subject options from the writer (NW-083 c) come later, with Collister. Do not design for them yet. Headline labelled as also the first line (NW-083 b).
- One renderer produces the formatted HTML for Full and Short copies: bold headline, headings, StreetEasy as a labelled link, bullets (NW-084 a).
- "Mark as sent" becomes the primary action after a copy, works without a copy, and says why when read-only (NW-086 a). It moves to the right of Copy in the same row (NW-101 a), the one button move in Phase A.

### Design problems

| Id | Problem |
|---|---|
| NW-079 b | Designed has no fields. How does an agent edit what they see: in place, a side form, or beside Full? Until then a "Show" route to Full covers it. |
| NW-084 b | How Full and Short look while editing: a formatted preview beside or instead of the textarea, labels instead of raw URLs. A rich editor would break the offset-based issue marks. |
| NW-085 b | Where the example email link lives and how it opens, on Send and on other screens (a good note on Sort, a good headline). |
| NW-086 b | Done is not a step in the progress row. Make it a fourth step, or give Send a clearer "I sent it" moment. |
| NW-101 | Kimani, after the list: **Mark as sent is the forward step, so it belongs on the right**, as its own action. Dispatch 18 lands Mark as sent as its own primary button on the right of Copy in the same row, after a copy, and working without one. It does not grey Done. Whether to keep them paired, stack them, or set Mark as sent apart with Done greyed until it is marked sent is yours (NW-101 b, NW-086 b). |
| NW-102 | If Kimani says yes to Gmail drafts (NB-28), Send gains a third way out: **Create Gmail draft** (Casa Workspace accounts only), beside Copy. Where it sits, and how the one-time Google permission prompt reads, is yours. |

### Constraints
- QA marks issues by text offset in the plain text. Anything that edits rich text must keep those marks, or QA runs on a derived plain version.
- Plain text, the Text tab and QA stay unchanged. D-27's "Full and Short are plain text" line gets updated when NW-084 lands.
- Email-client limits: no background images (Gmail strips them), inline styles only, no web fonts, so the preview must not promise anything an inbox will drop.
- Copy events are logged; marking as sent without a copy must still be recorded as such.
- The email never carries the target, the home's notes or the agent's call.

### Open
- Which good email is the example and who writes it (NW-085 a, Kimani). Recommended: the 100 Barclay sample, drafted by the writer, edited by Noble. It needs the writer's real eval run, which waits on keys.
- Five price rows in the email, or the full steps (NW-065 b)?
- Does Done need its own screen at all, or only a state of Send?

---

## 6. Shell: reports list, masthead, short displays, sharing, onboarding

### What the build does today
- Reports list (`02`) shows only the owner's reports, even for an admin. The hero is a 112px two-line h1 plus padding and intro, about 340px tall, with only width-based media queries. On a short laptop screen the list starts below the fold. The shared Studio header must also be checked at 1280x720; `assets/studio-header.js` is used by every tool, so any change there is careful and separate.
- The report bar shows title, side, progress row and a "Read only" badge when the viewer is not the owner. Admins can open any report by its link.
- No sharing, duplicate or transfer UI.
- No onboarding. New agents meet tiers, notes and tags cold.

### Lands before you design
- Admin and mentor list of every report, with the owner shown in the existing client line, read-only for non-owners (NW-088 a, after Kimani confirms mentors see all).
- Server-side sample reports (condo, co-op) with a reset that replaces the report (NW-054). They arrive with Dispatch 23 items 1–2, a PR of their own that ships before the rest of 23 so the co-op sample exists when you review the co-op flow. Buttons live in the Dev tools strip (`DevStrip`, admins only; the server check changes only if Kimani answers NW-054 for mentors).
- Sign-in fix, activity and access logs (NW-091, 099): no visual change except a Try again button on the access error.
- Share, duplicate and transfer need the access model first (NW-089 a, 090 c) and land after this design pass.

### Design problems

| Id | Problem |
|---|---|
| NW-092 | Make the masthead and report bar work on short laptop screens (a height-aware layout). Check the Studio header at 1280x720. |
| NW-088 b | How other people's reports sit in the list: Mine / Everyone's, search, sort by agent. |
| NW-090 c | Entry points for duplicate and transfer (transfer is admin-only at first). The builds follow the design. |
| NW-089 b | Where Share lives, the people list and who-has-access display, a Shared badge in the list. Sharing is by typed email (agents cannot list teammates). Viewer and editor roles. |
| NW-032, NW-068 c | Onboarding for a first run (tiers, notes, tags, what Hubert sees and when). LATER: do the ⓘ hints first, decide after this round. |
| NW-050 | Progress row on the title's line (see Sort). |

### Constraints
- Non-owners see read-only. Hubert stays owner-only in the first version of sharing.
- Duplicate copies brief, state, target, imports, observations and comps; not Hubert's transcript or narratives. Transfer is admin-only at first.
- Any change to the shared Studio header is a separate, careful change, never folded into a comp report change.
- Agents are slow to respond: onboarding and sharing must not wait on another person.

### Open
- Do mentors see all agents' reports (NW-088 a, recommended yes) or only assigned ones?
- Who may start and reset a sample: admins only, or mentors too (NW-054)?
- Whether onboarding is a tour, a first-run checklist or only the ⓘ hints.

---

## Phase A changes that alter what the screens contain

| Change | Screens it alters |
|---|---|
| Fill every picker the read can; neighborhood, rooms, policies, building (NW-011, 017 a, 018 b) | Modal details, comp card, Sort sub line |
| Building amenities by StreetEasy category; Policies group; unit/building group tags (NW-009 a, 010, 039 a) | Modal, comp card, edit form |
| Condition scale of six, with ⓘ (NW-012) | Modal, comp card |
| Photos from the read (NW-020 a) | Sort photo area |
| ★ in the tier control; tier ⓘ; yellow needs markers (NW-026, 027, 038) | Sort table and card |
| Note button, tag label, tag groups, suggested tags (NW-030, 040 a, 045, 059) | Sort card, add form |
| Fact locks and overrides, "changed" mark (NW-044 a) | Sort card |
| Trash, Undo, "Removed (N)" fold, bottom CTA (NW-056, 053) | Sort table and footer |
| Neighborhood and subway lines (NW-033 a, 037 a) | Sort card, row |
| Five-row price table and calculator (NW-065 a) | Findings, maybe email |
| Plainer Hubert take, gap counts, accordion ⓘ (NW-063 a, 067 a, 077) | Findings |
| Target owner toggle; pinned neutral range (NW-070, 069 a) | Findings target accordion |
| Client and deal fields (NW-074 a) | Findings deal terms, brief |
| Hubert's wider read, role gates, markdown renderer (NW-023, 093 b, c, 068) | Hubert drawer, chips |
| Designed email markup; subject on Full, Short and Designed; one HTML renderer; Mark as sent on the right of Copy (NW-080 to 084 a, 086 a, 101 a) | Send, Done |
| Admin list of all reports (NW-088 a, Dispatch 22); sample reset and the co-op sample (NW-054, Dispatch 23 items 1–2) | Reports list, Dev tools strip |

Not in this file: NW-021 (rentals) and NW-095 (the process rule above) are not design points.
