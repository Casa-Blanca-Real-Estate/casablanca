# The design pass: every surface of the comp report, and what still needs design

**For Claude Design, and Kimani, for the design pass in the week of 2026-11-02.** Written 2026-10-29 against
`claude/main` at #110 (everything merged so far), with screenshots of that build in `screens/` beside this file.
It replaces `feedback/2026-10-15-noble/08-claude-design-handoff.md` as the thing to design from: that file was
written before Dispatches 20–26 landed and before the bosses' demo changed the plan. Read it only for the history
behind an item (the `NW-` ids point there and to `feedback/2026-10-15-noble/00-items.md`).

This file is meant to be enough on its own. Where it points elsewhere, it's for depth, not to fill a gap.

**Read the code from `claude/main`, never `release`.** `claude/main` is where every PR merges; `release` is
only what's live on production, and it runs behind. Anything this brief calls "built" is on `claude/main`.

**Design for laptop and tablet widths only (Kimani, 2026-10-29).** Agents won't use the tool on phones for
now; phone layouts get their own design later. Don't design phone breakpoints, and skip the phone screenshots.

## Contents

1. [What the tool is, in one minute](#1-what-the-tool-is-in-one-minute)
2. [How to use this file](#2-how-to-use-this-file)
3. [Rules a design can't change](#3-rules-a-design-cant-change)
4. [Look and tokens](#4-look-and-tokens)
5. [The surfaces at a glance](#5-the-surfaces-at-a-glance)
6. [Surface by surface](#6-surface-by-surface) — chrome, sign-in, reports, Access, the New report window, the
   workspace shell, Sort, Review comps, the Gate, Findings, Send, the client's words, the Designed email, Done,
   Hubert, phones
7. [New pieces to design for](#7-new-pieces-to-design-for) — Hubert in the New report window, first-run
   orientation and the guide button, client fields, the sign-off
8. [Problems that cut across screens](#8-problems-that-cut-across-screens)
9. [What to design first](#9-what-to-design-first)
10. [Open questions for Kimani](#10-open-questions-for-kimani)
11. [Not in this pass](#11-not-in-this-pass)
12. [Screenshots](#12-screenshots)

---

## 1. What the tool is, in one minute

Casa Blanca is a boutique residential brokerage in New York (about 200 agents). The **comp report** is one tool in
**Casa Blanca Studio** (the "Studio"; renamed from "Creative Studio" on 2026-10-28), the company's set of
browser tools for agents. An agent uses it to work out what a home is worth from comparable sales ("comps") and
send the client a branded email that explains it.

The flow:

```
Reports list → New report window (1 The home → 2 The details → 3 Add comps)
             → Sort (+ Review comps, one comp at a time) → the Gate ("what do you think it's worth?")
             → Findings → Send (+ The client's words, one step per comp) → Done
Hubert, the AI assistant, is a drawer beside every workspace screen.
```

- **Who uses it.** Agents, on laptops mostly, sometimes phones. Two levels: **practice** agents (in mentorship;
  the tool makes them think first) and **full** agents (graduated; the tool drafts and they edit). Mentors and
  admins can read everyone's reports. Most agents aren't technical, and they're slow to respond to anything,
  so no flow may wait on an agent answering someone.
- **Who it's for, by 2026-11-13.** Noble (Casa's head of training) builds it into agent training. The week
  before, Kimani runs it end to end with Noble and an agent. "Ready" means: an agent signs in, starts a report
  from a StreetEasy link, reviews and tiers each comp on Sort, reads Findings, and sends the Designed email with
  real photos, on production, with no hiccups.
- **Teaching is the product** (Kimani, 2026-10-22). The tool halves the time a CMA takes while teaching new
  agents how one is done. New agents learn the flow; experienced agents move through it faster.
- **What the bosses asked for** (the demo, 2026-10-22): one branded piece for the client, a box per comp with
  its photo, $/sq ft and a short paragraph; see it live with real photos. Erez, the owner, decides.

## 2. How to use this file

- **Section 6 is the core.** Each surface has: where it lives in the code, its screenshot, **what's on it
  today**, **what still needs design**, and **open** questions. "What still needs design" is the work list.
- **Section 7** is pieces that don't exist yet, or exist only as rough placeholders, that Kimani wants designed
  now so they have an anchor (Hubert in the New report window, orientation and a guide button, client fields).
- **Section 9** is the order to design in, if the pass runs short. Two days is the budget.
- **Ids.** `NW-0xx` are Noble's walk-through items (`feedback/2026-10-15-noble/00-items.md`). `D-xx` and `NB-xx`
  are decisions (`docs/decisions.md`). `Dispatch nn` is a build brief in `docs/dispatch/`. You don't need to read
  them; they're there so the build threads can trace a design back.
- **The code** is React + TypeScript in `tools-src/comp-report/src/`. Screens are in `src/views/`, styles in
  `src/styles/*.css`. File names are given per surface so the build can find what a design touches.
- **Output.** Designs per surface, in the existing look (section 4), that the build threads can implement in
  the week of 11-02. Mark what's a restyle (cheap) and what's a new layout or new behaviour (a build). Anything
  you design that changes what's stored or what the engine computes is a decision for Kimani, not a design call:
  flag it.

## 3. Rules a design can't change

These come from decisions already made. A design that needs one changed has to say so.

1. **The agent thinks first; Hubert carries out their thinking, never does it for them** (Kimani, 2026-10-21).
   Tiers, notes and tags are the agent's call. Hubert can put in what the agent says ("make 1 and 2 second tier"),
   and that's fine whether the agent types, clicks or dictates it (Kimani, 2026-10-29).
2. **Practice agents write before they see Hubert's take**, on Sort's review and on the client's words. They ask
   for feedback first; only then can they reveal his version. Full agents see his take first and edit it.
3. **The neutral number comes first and never moves for anyone's wish.** The client's budget (buyer) or target
   (seller) is shown against the range on Findings, but never enters the calculation (D-4). Hubert sees it only
   after the agent's number and the range are revealed; the email never carries it.
4. **The agent commits a number before the reveal** (the Gate). Practice agents can't skip and must write 100+
   characters of why; full agents can skip.
5. **Only 1st-tier comps set the range.** 2nd tier is context; ✕ (excluded) is out of every figure. ★ marks the
   closest comp (the anchor); the email leads with it.
6. **No invented comp data.** Every fact shows where it came from on demand. Hubert never takes a sale price or
   listing from the web; web search is for context (the building, the block, the subway) and its sources show.
7. **The client's email is a pasted HTML email** for now: tables and inline styles, no web fonts, no background
   images (Gmail strips them), photos that can fail to load. A hosted page or PDF link is later.
8. **No protected characteristics** anywhere: no prompts or fields that invite them. Free text is screened for
   fair housing on save.
9. **Single brand look**, Object Sans only (section 4). The Studio's shared header (`assets/studio-header.js`) is
   used by every Studio tool: change it only as its own careful change.

## 4. Look and tokens

The look was ported in #77 from the first Claude Design handoff (`docs/comp-report/design-port/README.md` has the
full spec and the prototype, `Comp Report Prototype.dc.html`). In short:

- **Colour.** Ink `#0f0f0f` · Page `#f4f3f0` · Outer `#e9e7e2` · Card `#ffffff` · Lavender `#aaa3cf` (accent,
  "shared with the home") · Deep lavender `#3c3654` · Grey text `#888680` · Lines `#eeece7` / `#dddbd5` /
  `#e4e2dc` · Sage `#c0c2b5` (✕ tier, didn't sell) · Attention yellow `#e8b923` · Issue red `#d6402b` ·
  Highlight `#fbf0c4`. Status squares: Sold ink, In contract lavender, Active white with an ink border, Didn't
  sell sage.
- **Type.** Object Sans Regular 400 and Heavy 800, embedded (`assets/fonts`). Eyebrows uppercase, 0.1–0.32em
  tracking. Sizes 10–48, and 112 for the reports hero.
- **Shape.** Radius 0 everywhere except the top-bar pills (6px), the Sample badge (4px) and the SMS bubble.
- **Buttons.** Primary: ink, white 12px/800 uppercase, 0.06em tracking. Secondary: outlined. Disabled: 0.35
  opacity.
- **Black blocks.** The hero, the range block and the email's header and footer are solid ink; Erez liked that
  dark look in the demo. There is no separate dark mode in the tool.
- **Bosses' feedback on the look:** they liked the branding and that it uses no random colours. Keep that.

## 5. The surfaces at a glance

| # | Surface | Who sees it | State today | Design need |
|---|---|---|---|---|
| 6.1 | Studio chrome (top bar) | everyone | Built | Rename, pill crowding, phone |
| 6.2 | Sign in | everyone | Built | Light |
| 6.3 | Reports list | everyone; tabs for mentors/admins | Built | Hero height, Studio name, Everyone's list |
| 6.4 | Access panel and logs | admins | Built, plain | Light; admin-only |
| 6.5 | New report window (3 steps) | agents | Built | Home vs building, long pickers, Hubert in it, read progress |
| 6.6 | Workspace shell (header, progress row, actions) | agents | Built | **Crowded action row**, short screens |
| 6.7 | Sort | agents | Built | **Card re-layout**, tags vs features, row hovers, compare, home panel |
| 6.8 | Review comps (modal) | agents | Built (Dispatch 25) | Polish, Hubert's area, practice vs full |
| 6.9 | The Gate | agents | Built | Light |
| 6.10 | Findings | agents | Built (Dispatch 21) | Accordions, client section, budget, take as chips |
| 6.11 | Send | agents | Built (Dispatch 26) | **Order of the page**, editing Designed, issues panel |
| 6.12 | The client's words (modal) | agents | Built (Dispatch 26) | Polish, matches Review comps |
| 6.13 | The Designed email (client-facing) | clients | Built (Dispatch 26, #108) | **The restyle**: this is what Erez judges |
| 6.14 | Done | agents | Built | Is it a step? |
| 6.15 | Hubert's drawer, chat, guides, trail | agents | Built, rough | **Presence, sections, trail cards** |
| 6.16 | Phones | agents | Top bar only (#106) | Which screens must work on a phone |
| 7.1 | Hubert in the New report window | agents | Being built, rudimentary | Design it properly |
| 7.2 | First-run orientation + guide button | practice agents first | Not built | Design it |
| 7.3 | Client fields | agents | Data only, in an accordion | Where they're asked and shown |
| 7.4 | The email's sign-off from the roster | clients | Built (#108) | Part of the email restyle |

---

## 6. Surface by surface

### 6.1 Studio chrome: the top bar

**Code:** `src/views/shell/TopBar.tsx`, `slots.tsx`, `styles/shell.css`; the Studio button comes from the shared
`assets/studio-header.js`. **Screens:** the top of every screenshot.

**Today.** A black bar: "‹ Studio" (back to the Studio dashboard), the Casa Blanca wordmark, a lavender
"COMP REPORT" label. On the right, pills: **Sample** (when the report uses sample data), **✦ Hubert** (opens his
drawer), the **account** pill (email; menu with Sign out), **Feedback** (the Studio's team feedback box). Kimani
also has a dev-notebook capture box on Ctrl+. (admins only, not part of the design).

**Needs design.**
- **The name.** The bar and the reports hero still say "Comp report". The Studio is now "Casa Blanca Studio"; decide
  whether the tool's label changes with it (it probably stays "Comp report", under the Studio).
- **Pill crowding.** With Sample, Hubert, the account and Feedback, the right side is busy; the Hubert pill
  duplicates the vertical "HUBERT" tab on the page edge (6.15). Pick one way to open Hubert, or give each a reason.
- **Phones.** #106 made the bar fit at 360–390px; nothing below it is laid out for phones yet (6.16).

### 6.2 Sign in

**Code:** `src/views/SignIn.tsx`. **Screen:** `screens/01-sign-in-*.png`.

**Today.** A card: Google first, the email form behind a link. Other states keep the same card: an invitation, a
new password, a refusal ("this email isn't on the list", with Try again), Identity not switched on.
Google's own screen still says "Netlify Identity" until Casa's Google client is set up (Kimani's task, optional).

**Needs design.** Light: the card in the Studio name and voice, and the refusal state's words. Low priority.

### 6.3 Reports list

**Code:** `src/views/Reports.tsx`, `Mentees.tsx`. **Screens:** `screens/02-reports-*.png`; the mentor and admin
tabs in Kimani's project files (`mentor-tabs/screens/`).

**Today.**
- A black hero: "COMP REPORT" at 112px over two lines, a one-line intro. About 340px tall.
- **Your reports / Everyone's** tabs (mentors and admins only), a count, **+ New comp**.
- A table: thumb, home and client, a Sample badge, side, stage (coloured square + word), updated, with **Archive**
  (any report) and **Delete** (sample reports only; real reports are never deleted). Headers sort. 10 rows, then
  "Show N more". A line: "Mentors and admins can read your reports. Only you can change them."
- Folds: **Archived** (with Restore), **Access · admins only** (6.4).
- **Everyone's** (mentors): filtered to the mentor's mentees by default, with a picker to choose mentees by name,
  and "all agents". The owner shows in the client line. Others' reports open read-only.

**Needs design.**
- **NW-092: short laptop screens.** The hero pushes the list below the fold at 1280×720. Make the hero
  height-aware or shrink it after the first visit.
- **NW-088 b: Everyone's list.** Search, sort by agent, the mentee picker's look (today a plain list).
- **Entry points for later features** (leave room, don't design in full): Share, Duplicate, Transfer (NW-089 b,
  NW-090 c) come after 11-13.
- **The guide button** (7.2) should be reachable from here for a first-time agent.

### 6.4 Access panel and logs (admins only)

**Code:** `src/views/Access.tsx`, `AccessLog.tsx`. **Screens:** Kimani's project files
(`activity-log-dispatch-22b/screens/`).

**Today.** A fold on the reports list: who beyond Casa's domain may use the tool, roles (agent, mentor) for Casa
people, each agent's **level** (practice or full), and the logs: sign-ins (who and when, and refused
attempts) and one report's activity timeline.

**Needs design.** Light: it works and only admins see it. A cleaner table style and the level switch's look.
Not on the 11-13 path.

### 6.5 The New report window

**Code:** `src/views/newcomp/` (`NewComp.tsx`, `Home.tsx`, `HomeHero.tsx`, `Details.tsx`, `Frame.tsx`),
`workspace/AddComps.tsx`, `ReadingNotice.tsx`, `comp/CompForm.tsx`, `comp/Pickers.tsx`, `styles/newreport.css`.
**Screens:** `screens/03-new-home-*.png`, `04-new-details-*.png`, `05-new-comps-add-form-*.png`; the read's
progress in Kimani's project files (`new-report-dispatch-20/screens/`).

A modal of three steps over the reports list (or over Sort, when reopened as **Edit details**). A thin
three-segment progress bar and "1 of 3" at the top, ✕ to close.

**Step 1, Which home?**
- One line that takes a StreetEasy link or a typed address. A link is cleaned and checked; the matched home shows
  under it ("100 Barclay #17L · Condo · its details are read from StreetEasy next"), with ✕ to clear.
- **For a** Buyer / Seller. **Type** Co-op / Condo (plus a "Property type" label for HDFC, condop, townhouse and
  others on step 2). **Client** (optional, name). **Client's budget** (buyer) or **Client's target price**
  (seller), optional, with an ⓘ saying it never enters the numbers.
- Admins: "Use the 100 Barclay sample: Condo · Co-op". **Next** creates the report; after that everything
  autosaves.

**Step 2, the details.** A title (the address), a compact row (side, type, property type, client).
- **General:** interior size with an **Estimate** toggle (co-ops often have no size; then $/sq ft disappears
  everywhere), beds, baths, rooms; floor, asking price, common charges (or maintenance), taxes. Read values have
  a pencil; a typed one becomes the agent's.
- **The home:** washer/dryer, private outdoor space, views, unit condition (six steps with an ⓘ), then
  "More about the home" (exposure, corner, and so on).
- **The building:** services and facilities, policies, neighborhood, year built, then "More about the building"
  (wellness and recreation, shared outdoor space, new development).
- **Notes** ("Light, views, condition, layout, storage"): read by Hubert, never shown to the client.
- While the link is still being read, a progress bar shows above the fields (Dispatch 20).

**Step 3, Add comps.** One input: paste StreetEasy links (one or many), or type an address and **Type one in**.
Or drop the StreetEasy export (CSV, XLSX or **PDF**; agents mostly get the PDF, and only its links are used) or
listing screenshots anywhere on the window. Each comp lands as a row grouped by status (Sold, In contract,
Active, Didn't sell) with price and $/ft, a ✓ when confirmed and a pencil. "Type one in" opens the full comp
form: address, photo, status, price, size, floor, date, **Why it's a comp** (optional here), **Tags** (grouped:
Similarities, Size, Floor, Multi-floor, Differences, Your own) and **Features** (the same pickers as step 2; the
ones the home has too get a lavender outline). "2 notes from the import" folds at the bottom. Done lands on Sort.

**Needs design.**
- **NW-008 b, 014, 016: the home and the building apart.** Step 2 now has "The home" and "The building" sections
  in one long scroll; the comp form still runs every picker in one list. Decide tabs vs one scroll, and match the
  comp form and the Sort card to it (NW-039 b).
- **NW-009 b: long amenity lists.** Services, wellness, shared outdoor and policies are long chip clouds. Design a
  denser picker (collapsed groups, "show all", or a search).
- **The comp form is very long** (screenshot 05): tags and features together push Add comp off screen. Erez:
  "crush it a little" (the tags). Consider features folded by default in the add form.
- **Reading states.** Link checked, reading, read with gaps, read failed. The live read failed in the bosses'
  demo; failure must read as "type it in" not "broken".
- **Hubert in this window** (7.1).
- **NW-064: setting the budget/target more easily** (a money field with no context today).

**Open.** Whether step 2 should show Hubert's "what I couldn't read" summary at the top (7.1).

### 6.6 The workspace shell: header, progress row and actions

**Code:** `src/views/shell/WorkspaceHeader.tsx`, `ReportBar.tsx`, `Pieces.tsx`, `workspace/Workspace.tsx`,
`styles/shell.css`. **Screens:** the top of every workspace shot (`06`–`11`).

**Today.**
- "← Reports", the address (28px/800) with a pencil (opens Edit details), a sub line (side · client · size ·
  beds · baths · floor), "Saved" on the right. "Read only" badge for a non-owner.
- **Progress row:** 1 Sort — 2 Findings — 3 Send, with the primary action on the right ("Findings →",
  "Send →").
- On Sort before every comp is tiered, the row also carries **Sort with sample** (admins), "11 comps need a tier
  or tags" (a link that filters), **Review comps (11)** (primary) and a disabled **Findings →**
  (`screens/04-new-details-*.png` shows it behind the modal). Four controls jammed into the progress row.
- Under it, for admins and guests, a dashed **Sample** strip: "Fill with sample: Sort · Findings · Send · All",
  "Reset the sample". A dev-tools switch ("View the Gate as a new agent", build notes).
- Toasts at the bottom (with an action, e.g. Undo).

**Needs design.**
- **The action row on Sort** is the most crowded spot in the app. One primary at a time: Review comps until every
  comp is reviewed and tiered, then Findings. The "needs" count belongs with the table, not the progress row.
- **NW-050: the progress row on the title's line**, freeing vertical space; and NW-092, the header on short
  laptop screens.
- **NW-049: a read-only view of the home on Sort** (side panel or an expanding header) so the agent can compare
  without opening Edit details. It competes with Hubert's drawer for the side.
- **Done isn't a step** in the row (NW-086 b, 6.14).
- The **Sample strip** is admin/guest only and fine as is; keep it visibly "not for agents".

### 6.7 Sort

**Code:** `src/views/workspace/SortStep.tsx`, `src/views/sort/` (`SortTable.tsx`, `CompCard.tsx`, `More.tsx`,
`Reads.tsx`, `RowThumb.tsx`), `comp/CompForm.tsx`, `comp/AddBar.tsx`, `styles/sort.css`, `compform.css`.
**Screens:** `screens/06-sort-*.png`, `06b-sort-empty-*.png`, `06c-sort-expanded-*.png`.

**Today.**
- Above the table: **+ Add comps** (the same input as step 3, inline), a "N to finish" chip (yellow square) that
  filters to unfinished rows, **Filter by tags ▾**, "11 comps" on the right.
- **One table per status** (Sold, In contract, Active, Didn't sell), with a header row: Sale/Ask, $/ft, Size,
  Date, Tier ⓘ. Each row: + to expand, a photo thumb, the address (linked, underlined), its tags as grey words, a
  yellow **Weak** chip when Hubert flagged it, price, $/ft, size (with "~" and a ○ for an estimate), date, and the
  tier control: **★ · 1st · 2nd · ✕** (★ yellow when set, 1st ink, 2nd lavender, ✕ sage). Unfinished rows have a
  3px yellow left border and "Needs tier" or "Needs note" in yellow-squared text.
- **The expanded card:** photo on the left (striped placeholder when there's none); on the right a row of
  actions (**Review with Hubert**, **StreetEasy ↗**, **✎ Edit**, a trash can); the facts (sale, $/SF, size, date,
  days on market, floor, distance, neighborhood); **Features** with "N shared with 17L" (shared in lavender) as a
  label/chips grid of every group, even empty ones ("—"); **Tags ⓘ** as outlined chips; the note as a line with a
  pencil; **+ Checks, sources and history** (the house's checks, subway lines, where each fact came from, the tier
  history). Several cards can be open.
- **Edit** turns the card into the comp form (6.5); StreetEasy's facts can be overridden and are marked
  "changed".
- **Removed (N)** fold at the bottom with "Put back"; a removed comp keeps its tier, note and tags.
- **Findings →** repeated under the table.

**Needs design.**
- **NW-035, 041, 036: the card re-layout.** The card is tall (each open card is ~800px; screenshot 06c). Facts
  and features under the photo, the actions in the card header, the note near the top (it's the substance), empty
  feature groups hidden. Aim for a card you can read without scrolling.
- **NW-040 b: tags and features look the same** (both outlined chips). They mean different things: tags are the
  agent's reasons; features are facts about the place.
- **NW-056, 057: row hovers.** An edit pencil and a trash in the row's margins, so an agent needn't open a row and
  hunt for Edit.
- **Where the per-comp review lives on the row.** "Review with Hubert" is inside the card; the review modal (6.8)
  is how most agents will tier. Consider the row's tier control opening the review when the comp hasn't been
  reviewed.
- **NW-037 b: subway lines.** MTA circles in the tool (Kimani, NW-037), plain text with a coloured dot in client
  emails. Today they're only inside "Checks". Row, card or home panel?
- **NW-034, 033 b: a column chooser** (Price and Tier always on; $/sf, size, date, neighborhood, days on market
  optional). Not built.
- **NW-052: compare view** (the home and one comp side by side). Not built; the review modal may be the better
  home for it.
- **Empty Sort** (`06b`): what a new agent sees with no comps.

**Constraints.** Only list tags count toward "needs a tag"; group labels are display only. Link comps not yet
confirmed show "Confirm or remove". The lavender "the home has this too" outline stays.

### 6.8 Review comps: one comp at a time (modal)

**Code:** `src/views/review/ReviewFlow.tsx`, `styles/review.css`. **Screens:** `screens/review-*.png`;
more (practice, coop, phone) in Kimani's project files (`per-comp-review-dispatch-25/screens/`).

**Today.** Opened from **Review comps (N)** or a card's **Review with Hubert**. A wide modal: "REVIEW COMPS",
‹ 1/11 ›, a segmented progress bar, ✕. Untiered comps first.
- **Left:** the photo with the status and address over it, the facts (sale, $/SF, size, floor, date, DOM,
  distance), the features as small chips (the home's in an ink outline), the checks as yellow-squared lines
  ("Has private outdoor space", "0.56 miles away").
- **Right:** the agent's reasoning box ("Why is it a comp for 17L, or not?"), the tags (quick picks; **Edit tags**
  opens the full grouped picker), then **Hubert's area** on a grey panel: a yellow **Looks weak:** line with
  "✕ Exclude" when he flags it; **Hubert's take** ("would tier 2nd") with **Copy to note**; "What's he missing?"
  with **Ask again**.
- **Practice agents:** the take is hidden. They write, then **Get feedback** ("What holds up", "Look again"),
  as many rounds as they like; only after one round does **Hubert's take** unlock. "Done ⓘ".
- **Bottom:** the tier control (★ 1st 2nd ✕) centred, **Next →** on the right.

**Needs design.**
- Polish to the same standard as Sort: the right column is a stack of boxes of different weights.
- **The practice path's states** (writing, feedback shown, take revealed, tiered) need to read as a sequence.
- **Hubert's presence here.** This is a step, not a chat; his feedback and take are separate calls. Make it read
  as him (his mark, his voice) without the drawer.
- **The compare view** (NW-052) could live here: the home's facts beside the comp's.
- Phone layout (see 6.16).

### 6.9 The Gate: "What do you think it's worth?"

**Code:** `src/views/workspace/Gate.tsx`. **Screens:** `screens/07-gate-*.png` (practice), `07b-gate-full-agent-*.png`.

**Today.** A centred card: Low, High, **Why** ("What in the home or the market puts it there?"), a counter
("0 / 100 minimum" with a yellow square) for practice agents, "All three required until you graduate",
**Show the comps** (disabled until filled). Full agents can skip. Hubert's drawer says he can't help.

**Needs design.** Light. This works as intended (NW-062). The moment of "commit, then reveal" could carry more
weight visually; it's the teaching moment Erez called smart.

### 6.10 Findings

**Code:** `src/views/workspace/Findings.tsx`, `Terms.tsx`, `src/views/findings/`, `styles/findings.css`.
**Screens:** `screens/08-findings-*.png`; every accordion open in Kimani's project files (`findings-dispatch-21/`).

**Today, top to bottom.**
- A white block: "The 3 closest sales", **TRUE ESTIMATE** (with "· with estimates" when the agent estimated a
  size) at 48px, the $/SF range under it, a "Uses your size" toggle when estimates change the answer, an "On the
  facts" side note.
- A legend and **the range bar** on a fixed axis: true estimate (ink), the agent's guess (lavender, inset), the
  client's budget or target (a yellow tick). A sentence: "Your guess sits below the true estimate, by about
  $25.4K."
- Two columns: **✦ How Hubert got there** (built in code, not a model reply; comp names bold and underlined
  inline) and **Your reasoning (from the gate)** with "Change your number".
- **Status medians:** four tiles (Sold, In contract, Active, Didn't sell) with count and median $/SF (or price
  for a co-op).
- **Accordions,** numbered: **Price table** (five rows, Low to High, plus a calculator; condo with a size only),
  **Comps that count**, **Client's budget / Client's target price** (amount, whose it is: client, agent or both;
  how far later changes moved the range toward it), **Pricing details** (the deal terms and the client fields,
  7.3), **How this was worked out** ("8 still needed": what the agent can act on, then warnings).

**Needs design.**
- **The accordion numbering** starts at 03 or 04 (the first numbers are implied by the blocks above). Either
  number everything or nothing.
- **NW-063 b: comps as chips** in "How Hubert got there" instead of bold underlined names in a paragraph.
- **NW-071 b: a strip chart** of each sold comp's sale against its ask, beside the range bar.
- **NW-073 b, 074 b: client and deal details as a first-class section**, out of the "Pricing details" accordion
  (7.3).
- **NW-069 b, 075: the loop after Findings.** What could move the number toward the budget or target, and Hubert
  helping with it. Large; sketch only.
- **NW-076: "How this was worked out"** as a list of every factor under "How Hubert got there".
- **NW-066 b: the co-op flow** end to end (no $/sq ft, no price table). Co-ops are most of Casa's business
  (Kara); review this on the co-op sample (`08-findings-seller-coop.png`).
- **"How Hubert got there"** is the engine's text, not Hubert's. Its label suggests the AI wrote it; consider
  whether it's labelled as the tool's reading.

**Constraints.** The neutral range is pinned at the reveal; later changes are shown as movement, not hidden.
The calculator runs in the browser and is never saved.

### 6.11 Send

**Code:** `src/views/workspace/SendStep.tsx`, `src/views/send/` (`designed.ts`, `IssuesPanel.tsx`,
`AnnotatedText.tsx`, `ClientOverview.tsx`), `styles/send.css`. **Screens:** `screens/09-send-*.png`,
`10-send-designed-*.png`; Kimani's project files (`designed-email-dispatch-26/screens/`).

**Today, top to bottom** (the page opens the client's words modal by itself the first time; 6.12).
- **Left column:** the issues panel ("1 to fix", each issue with a number, Show, and "Fix" where the tool can), and
  "The email uses: On the facts / With your estimates" when estimates change the answer.
- **01 The client's words:** "The overview · ✓ 6 of 6 comps written for the client", a line on how it works,
  **Keep writing** (reopens the modal).
- **02 Email · Template:** tabs **Designed email** | **Then text them**; a **Plain-text fallback** disclosure with
  Full and Short; **+ Write it** (the writer drafts the headline and lines). A Subject line with **Copy subject**.
- The **Designed** preview (6.13) on a grey mat, "What you send: the overview, then a box per comp".
- At the bottom: "Copies as HTML for Gmail, with Casa's copies of the photos. Send the text next." **Copy the
  designed email** (primary) and **Mark as sent**.

**Needs design.**
- **The page is very long** (5,700px at 1440 wide) and the copy button is at the very bottom. The email is the
  product; design the page around it: what to do (copy, send the text, mark as sent) should be visible without
  scrolling to the end.
- **NW-079 b: editing what's in the Designed email.** The preview has no fields. Today the agent edits through
  the client's words modal and the headline. Decide: in place, a side form, or "Edit" per box opening the modal at
  that comp.
- **NW-084 b:** how Full and Short look while edited (they're fallbacks now, so lower priority).
- **NW-086 b, 101: Mark as sent** is the forward step. Where it sits after a copy, and whether Done greys until
  it's marked.
- **NW-102: Create Gmail draft** (Kimani wants it; after 11-13, needs Casa's Google client). Leave a place for
  it beside Copy.
- **Then text them:** the follow-up text message; how it's shown (an SMS bubble today) and copied.
- **The issues panel** sits apart from what it marks; consider marks on the preview itself.
- **Bug for the build (not design):** the 100 Barclay sample fills Send with seller lines even on a buyer report:
  "The next step" says "List in October…" and "About the client" says the owners are listing
  (`client-01-full-overview-condo.png`, `10-send-designed-buyer-condo.png`).

### 6.12 The client's words: one step per comp (modal)

**Code:** `src/views/send/ClientFlow.tsx`, `ClientOverview.tsx`, `ClientRounds.tsx`, `styles/review.css`.
**Screens:** `screens/client-*.png`; Kimani's project files (`designed-email-dispatch-26/screens/`).

**Today.** The same frame as Review comps. Step 1 is **the overview**: Headline (with "4 drafts ▾" and **Draft from
notes**), To, Signed, How I chose the comps, Things to consider, The next step, **Tidy the wording**, **Get
Hubert's feedback**, and About the client (for the agent only; never quoted, Hubert doesn't see it). Then one step per
comp the email shows, the anchor first: the comp's box as the email will show it (photo, address, price, $/sq ft,
status, and the paragraph as it's typed), beside the agent's Sort note and Hubert's take from Sort, then the
paragraph for the client. Practice agents write, get feedback, and only then can see the writer's version; full
agents get the writer's draft and edit or approve it, or tell him what to change.

**Needs design.** Make it the twin of Review comps (6.8): same frame, same rhythm, same Hubert area, so an agent
learns one pattern. The box preview should be the restyled email box (6.13).

### 6.13 The Designed email (what the client gets)

**Code:** `src/views/send/designed.ts` (tables and inline styles), the photo route on the server, the sign-off from
the roster (#108). **Screens:** `screens/10-send-designed-*.png`; pasted into Gmail in Kimani's project files
(`designed-email-dispatch-26/screens/06-full-designed-pasted-*.png`).

**This is the single most important design in the pass.** Erez judges the whole tool by it: "one branded visual
… with the listings and a little story in it."

**Today, 600px wide, top to bottom.**
- Black header: wordmark, "COMP REPORT" eyebrow. (A yellow "SAMPLE DATA" bar on sample reports.)
- A 240px hero photo of the home (striped placeholder when there's none).
- "PREPARED FOR JORDAN AND SAM · OCTOBER 2026", the address (30px/800), "3 bd · 3 ba · Floor 17".
- A black range block: "WHAT 17L IS WORTH TODAY", the range (44px/800), "$2,112 – $2,457 a square foot".
- The overview: the headline (bold), then the agent's lines.
- **The closest match** (★): a bordered box, the address, a large photo, price and $/sq ft, a status line ("Sold
  Aug 2026 · Floor 10 · 2,201 sq ft"), the client paragraph.
- **Other comps:** one bordered box each, the same layout.
- **Things to consider**, then the sign-off (the agent's headshot, name, "Casa Blanca · 10 Hubert St, Tribeca",
  phone, from the roster) with a black **Plan the offer** button, then a black footer with the wordmark and the
  disclaimer.
- Photos are copied into Casa's storage at copy time and linked; no price table (Erez: per unit instead).

**Needs design.**
- **The restyle** (out of Dispatch 26's scope by design). Boxes are very tall (the photo is ~360px high in each);
  ten to fifteen comps make a very long email. Consider a smaller photo, two-up boxes, or a compact list for 2nd
  tier.
- **A box per comp:** Erez's spec is "thin line round it, address big and bold on top, the photo, price and $/sq
  ft, and a paragraph". Check the hierarchy against it.
- **Subway lines:** plain text with a coloured dot (Kimani, NW-037) if they're shown.
- **Co-op version** (no $/sq ft): what replaces it in the range block and the boxes
  (`10-send-designed-seller-coop.png`).
- **Missing photo and missing paragraph** must still lay out cleanly.
- **Dark mode in mail clients** (Gmail and Apple Mail invert some colours): the black blocks must survive.
- **The CTA** ("Plan the offer" / seller's equivalent): what it links to (today a mailto to the agent).
- **The Text** (follow-up message): its look in the tool.

**Constraints.** Tables, inline styles, no web fonts (Object Sans falls back; the design must survive Arial or
Helvetica), no background images, no italics (NW-081), addresses dark and plain, not auto-blue (NW-082). Kimani
checks every change by pasting into Gmail (web) and Apple Mail.

### 6.14 Done

**Code:** `src/views/workspace/Done.tsx`. **Screens:** `screens/11-done-*.png`.

**Today.** "Sent" with a check, "To Jordan and Sam · Oct 29, 2026 · Sent as the designed email". Three tiles:
what the sales support, per sq ft, your guess. **How did it go?**: offered at, contract price, sold for, typed by
the agent ("Filling these from Casa Blanca's deal records comes later"). **Back to reports**, **Copy the email
again**, "Reopen to edit".

**Needs design.** NW-086 b: is Done a fourth step in the progress row, or a state of Send? The outcomes are what
make the tool learn over time (did the estimate hold?); consider how an agent is reminded to fill them in weeks
later, without depending on them answering anything.

### 6.15 Hubert: the tab, the drawer, the chat

**Code:** `src/views/Hubert.tsx`, `Chat.tsx`, `src/views/hubert/` (`guides.ts`, `markdown.tsx`),
`shell/Pieces.tsx` (the tab, the resize handle), `styles/hubert.css`. Plan: `docs/comp-report/hubert-plan.md`.
**Screens:** the right side of `06`–`10`; Kimani's project files (`hubert-trail/`, `hubert-view/`).

**Who he is.** The AI assistant, named after Casa's office at 10 Hubert St, Tribeca. Hannah loves the name. He
answers questions, flags weak comps, and changes a comp or the email when the agent tells him what to change.

**Today.**
- **Two ways to open him:** the **✦ Hubert** pill in the top bar and a black vertical **HUBERT** tab on the page's
  right edge. The drawer is fixed on the right, 380px by default, resizable by dragging (double-click resets).
- **Header:** "✦ HUBERT" and › to close. A grey line under it per screen ("Hubert never sees your number or your
  target.").
- **The chat:** his greeting, then his **step guides** (a preset note the first time the agent reaches each step:
  New report, Sort, One comp at a time, Your number, Findings, Send, Done), each starting a section with a small
  centred eyebrow ("SORT", "YOUR NUMBER"). His messages are grey blocks; guides have a lavender left rule. The
  agent's messages are plain bubbles. Markdown renders (bold, lists, links).
- **The trail:** every change he makes shows under his reply: the comp, the field, before → after, **Show**
  (opens Sort at that comp and field), and **Undo** (#114, in review). **Web sources** show as links under a reply.
- **Two preset chips** per screen above the input ("How long has 17L been listed?"), an input ("Ask Hubert about
  the listings…") and a black send button.
- He knows which screen and which comp is open (#114, in review), so "this one" works.

**Needs design.**
- **NW-024 a: his look and presence.** A mark or avatar, bubbles, motion. Today he's grey boxes; the step guides
  and his replies look alike.
- **The sections.** Step guides were added on 10-28 with "a rough look; the design pass decides how the sections
  read" (`guides.ts`). How a long conversation reads in the order the work happened.
- **The trail entries** as cards (comp, field, before → after, Show, Undo): today they're plain lines.
- **NW-025, 042: open and close.** The drawer doesn't run the full page height (it stops under the input on long
  pages; see `06-sort`). Left or right, given the home panel (6.6).
- **One way in** (6.1): the tab and the pill do the same thing.
- **Copy inconsistency:** the Findings header says "Hubert never sees your number or your target" while his
  Findings guide mentions "where the client's budget sits". After Dispatch 24 he does see the target after the
  reveal; the line should say so then.
- **NW-093 e: a confirmation card** for a change he proposes (what, from, to, why; confirm, dismiss) and a
  capability sheet ("what Hubert can do"). Today he acts on the agent's say-so and the trail plus Undo is the
  safety net; a card may still help practice agents.

### 6.16 Phones

**Today.** #106 fitted the top bar to 360–390px (`phone-top-bar/` in Kimani's project files). Review comps, the
client's words and Send were checked at phone width in Dispatches 25 and 26. Everything else shows "Narrow
windows aren't laid out yet. Use a wider window for now."

**Decided (Kimani, 2026-10-29): not in this pass.** Laptop and tablet only; phones get their own design later.

---

## 7. New pieces to design for

### 7.1 Hubert in the New report window

**Kimani, 2026-10-29:** put Hubert in the New report window now, "rudimentary, just so it's there", and refine it
in the design pass, so there's an anchor to design against. A build thread is adding the rough version in
parallel with this brief; check `claude/main` for it.

**What it's for.**
- The first three step guides (the home, the details, the comps) show where they happen, not later on Sort.
- After a link is read: what he filled, and what's still missing ("I couldn't read the size or the floor").
- **Dictation:** "it's 1,850 feet, floor 12" fills the fields (a `set_home_fact` tool, with the trail).
- Later: a pasted StreetEasy link in the chat adds a comp.

**Design.** The modal is centred and full-height on step 2 and 3. Options: a narrow column inside the modal; the
drawer beside the modal (the modal shifts left); or a collapsed bar at the modal's foot that expands. It has to
share the conversation with the workspace drawer (it's one conversation per report).

### 7.2 First-run orientation, and a guide button

**Kimani, 2026-10-29:** orientation for users who are first using the tool, mainly practice agents on their first
run or two, that walks through it pointing at everything. After that it hides behind **a hint or guide button in a
bottom corner** that brings the walkthrough and instructions back. This is different from Hubert's step guides in
the chat (those are for everyone, and stay).

**What to design.**
- **The first run:** a short tour per screen (New report, Sort, Review comps, the Gate, Findings, Send), pointing
  at the parts a new agent meets cold: tiers (1st counts, 2nd is context, ✕ is out), notes, tags, ★, what Hubert
  sees and when, why the Gate comes first.
- **The guide button:** where it sits (bottom-left, so it doesn't fight Hubert on the right?), what it opens (the
  tour for this screen, a short "how this screen works", a link to an example report), and how it's dismissed.
- **Who gets it automatically:** practice agents on their first reports; full agents can open it.
- **The ⓘ hints** already on many headers (tier, tags, accordions) are the floor; the tour shouldn't repeat them
  word for word.

**Constraints.** It never waits on another person. It must survive a reload mid-tour. Store "seen" per agent, not
per browser, if it's to follow them between laptop and phone (a build call).

### 7.3 Client fields

**Kimani, 2026-10-29:** "we need to add client fields … it does change the estimated range of what a buyer can
offer, and how quickly a buyer client is trying to move." Pre-approval, yes or no plus the amount, is the
example.

**Today (Dispatch 21, data only).** Inside Findings' **Pricing details** accordion (`Terms.tsx`): for a buyer,
financing (cash or mortgage; cash hides rate, down payment and term), **pre-approved** and the amount, deposit,
target closing, timing and flexibility; for a seller, the target price, timing and flexibility. On the brief:
urgency, a close-by date, what they'd pay more for, non-negotiables, priorities. None of it moves the range.

**Design.**
- **NW-074 b: where they're asked.** Step 1 or 2 of the New report window (with the budget), a step after
  Findings, or a first-class "Client" section on Findings (NW-073 b). Every field optional.
- **Where they show:** Findings (the budget marker, and a line on what pre-approval means against the range),
  Hubert's context, maybe the email (only what the client would expect to see; never the budget).

**Decision for Kimani, not a design call.** Should the client's pre-approval, cash and urgency change what Findings
shows? Rule 3 (section 3) keeps them out of the true estimate. A separate **offer range** ("what this buyer can
offer, given pre-approval and urgency") beside the estimate would honour both. That's a new engine piece; it's in
section 10.

### 7.4 The email's sign-off, from the roster (#108)

The Designed email's sign-off now comes from Casa's agent roster: the agent's name, phone and headshot (merged
#108; the roster import, #113, fills it for every agent). An agent not in the roster gets their typed name and
no photo. Kimani said the looks work for now; the restyle (6.13) covers it. Design both states.

**Related (Kimani, 2026-10-29):** tie each person's sign-in to their record in the agent CMS, so the tool knows
their name, email, phone and photo. Hubert greets them by name; the email's sign-off and the client step fill
themselves. Design consequence: a small "this is you" profile line (in the account menu?) with a link to correct
it in the CMS.

---

### 7.5 A sale Hubert finds on the web: a card in his chat

**Kimani, 2026-10-29:** when Hubert finds a sale on the web, he brings it into his chat as a card, not straight
onto Sort. The card shows the listing link and an **Approve** button that only turns on after the agent has
clicked the link to check it. Approved, Hubert adds it to the comps; it stays untiered and counts toward nothing
until the agent says what tier it gets. A rough card ships first; the design pass gives it its look (address,
photo if any, price, date, source, the link, Approve and Dismiss, the "check it first" state).

This changes rule 6 (section 3) for this one path: the sale comes from the web, but only into the report through
the agent's check and approval.

## 8. Problems that cut across screens

1. **Two modals, one pattern.** Review comps (6.8) and the client's words (6.12) should look like one component:
   the frame, the step bar, the left "thing" and the right "your words + Hubert".
2. **Practice vs full.** Every screen with Hubert's words has two paths. Show the agent which path they're on
   (a quiet "Practice" marker?) so a practice agent knows why the take is hidden.
3. **Tags vs features vs checks.** Three kinds of chips with three meanings (the agent's reason, a fact about the
   place, the tool's warning). Give each its own look, everywhere.
4. **Long pages.** Sort with open cards, Send, and the Designed email all scroll a lot. The forward action should
   be reachable without scrolling to the bottom.
5. **Co-op.** No $/sq ft, no price table, sizes unreliable. Every screen needs its co-op version checked
   (screenshots `*-seller-coop.png`).
6. **States.** Reading, read failed, empty, read-only (someone else's report), sample. Design each once and reuse.
7. **The name.** "Casa Blanca Studio" on every surface (the tool label, the reports hero, the email header's
   eyebrow if it says "Comp report").

## 9. What to design first

If the pass runs short, in this order (what Erez and Noble will see on 11-13 first):

1. **The Designed email** (6.13), condo and co-op, with and without photos.
2. **Send's page** around it (6.11): copy, text, mark as sent without scrolling.
3. **Sort's card and action row** (6.7, 6.6).
4. **Review comps and the client's words** as one pattern (6.8, 6.12, 8.1).
5. **Hubert's presence**, sections and trail (6.15), and **Hubert in the New report window** (7.1).
6. **Orientation and the guide button** (7.2).
7. **Findings' client section and the co-op review** (6.10, 7.3).
8. The rest: reports hero, phones, Access, Done.

## 10. Open questions for Kimani

These change what gets designed. Each goes on the Casa Answer Sheet.

1. **An offer range from the client fields?** *Answered (Kimani, 2026-10-29, DP-11):* the true estimate never
   moves. Show a client-adjusted view as its own layer beside the true estimate, the agent's number and the
   target (separate or stacked bars, perhaps), designed in this pass.
2. ~~Which screens must work on a phone by 11-13?~~ None: laptop and tablet only (Kimani, 2026-10-29).
3. **Orientation:** a pointing tour, a first-run checklist, or a short video per screen? *Recommend: a pointing
   tour for practice agents' first report, behind the guide button after.*
4. **One way to open Hubert,** the top-bar pill or the edge tab? *Recommend: the pill, and drop the tab.*
5. **The tool's name on its own surfaces:** "Comp report" under "Casa Blanca Studio", or something new?

## 11. Not in this pass

Comps found from the anchor (Erez's phase 2), a hosted page or PDF for the client, Gmail drafts (leave room only),
sharing, duplicate and transfer (leave room only), Hubert across the whole Studio, rentals, townhouse pricing, and
Jev (the decision provider) going live.

## 12. Screenshots

Taken 2026-10-29 from `claude/main` at #110, on the local dev server with the fakes (no live StreetEasy reads, so
photos are striped placeholders, or a flat grey stand-in in the `client-*` and `review-*` shots; production shows
real photos), at 1440px wide, colours reduced to 256 to keep the files small. Two scenarios: **buyer, condo**
(with a size) and **seller, co-op** (no size). Hubert's drawer open where the walk opens it.

| File | Shows |
|---|---|
| `01-sign-in-*` | Sign in |
| `02-reports-*` | Reports list (admin: tabs, Archived, Access) |
| `03-new-home-*` | New report, step 1 |
| `04-new-details-*` | New report, step 2 (Sort behind it) |
| `05-new-comps-add-form-*` | New report, step 3, with "Type one in" open |
| `06-sort-*` | Sort, sample tiered, one card open, Hubert open |
| `06b-sort-empty-*` | Sort with no comps |
| `06c-sort-expanded-*` | Sort with two cards open |
| `07-gate-*` | The Gate, practice agent |
| `07b-gate-full-agent-*` | The Gate, full agent |
| `08-findings-*` | Findings |
| `09-send-*`, `10-send-designed-*` | Send (Designed email first) |
| `11-done-*` | Done |
| `newreport-*` | The New report window from a read link: step 1 cleaned link, step 2 filled from the read, step 3 |
| `review-*` | Review comps: the Sort CTA, full agent (take first, asked again, tiered), practice (write first, feedback, take beside), weak flags, phone |
| `client-*` | The client's words: overview, feedback, a comp's draft, redraft, Send; the practice path; the sample; the Designed email pasted; phone |
| `access-*` | The Access panel: levels, sign-ins, one report's timeline, the mentor's and agent's views, phone |

More screenshots of each round's PR (mentor tabs, phone widths, Hubert's trail, the email pasted into Gmail) are in
Kimani's project files, per PR folder. The original design handoff and prototype are in
`docs/comp-report/design-port/`.

— Written by the design-pass brief thread, for Kimani
