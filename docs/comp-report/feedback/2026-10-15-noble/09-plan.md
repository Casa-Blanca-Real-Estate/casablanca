# The plan from Noble's walk-through

Casanova, 2026-10-15. Built from `00-items.md` (NW-001 to NW-102) and the topic reports `01` to `07`.
**The plan follows Kimani's process (NW-095):** Phase A is functionality and data that don't change the
layout, flow or architecture, starting with what Claude Design needs to see the tool as it really is. Phase B
is Claude Design: layout, flow, polish, responsive and motion. Small things keep shipping while he designs.

## The phases

| Phase | What | Who |
|---|---|---|
| **A, now** | Every FIX and BUILD that fits today's layout: ten dispatches, 15 to 24, design-blocking work first | Mason, Abacus, Surveyor; Calliste from Casa's account |
| **B, after Claude Design** | Kimani's design pass on the items listed below, then the builds that follow it | Kimani in Claude Design, then the tracks |
| **C, later** | Real, not now; each with its reason | — |

## Phase A: the dispatches, in order

| # | Dispatch | Track | Ledger | Launch from | Waits on | Supersedes |
|---|---|---|---|---|---|---|
| 15 | Sort, as it stands (CR-7a) | Mason | `casa-r13-1` | this account, now | nothing | — |
| 16 | The listing read and the home's vocabulary (CR-2.3) | Abacus | `casa-r13-2` | this account, now | nothing | — |
| 17 | StreetEasy's lists, and the subway (CR-R2) | Surveyor | `casa-r13-3` | this account, now | nothing | — |
| 18 | Send and Done (CR-7b) | Mason | `casa-r13-4` | this account | 15 merged (queue) | part of `casa-r12-1` |
| 19 | The engine for Findings (CR-2.4) | Abacus | `casa-r13-5` | this account | 16 and 15 merged | — |
| 20 | The new report and the home, filled from the read (CR-7c) | Mason | `casa-r13-6` | this account | 16 and 18 merged; 17 for transit only | part of `casa-r12-1`; DP-6 from `casa-r10-1` |
| 21 | Findings: plainer, whose target, the client's facts (CR-7d) | Mason | `casa-r13-7` | this account | 19 and 20 merged | — |
| 22 | Who sees what, the sign-in log, the activity log (CR-7e) | Mason | `casa-r13-8` | this account (Mason); Casa's account if a second builder takes 22 then 23 | 15 merged; after 21 in Mason's queue (items 1 and 2 first if no second builder, see below) | `casa-r12-2`; part of `casa-r12-1` |
| 23 | Samples that reset, and reading production safely (CR-7f) | Mason | `casa-r13-9` | **Casa's account** (its keys live there; D-26 Q3) | 22 merged; Kimani on NW-090 a and NW-054 | — |
| 24 | Calliste: Hubert sees what the agent sees (CR-H1) | Calliste (new) | `casa-r13-10` | **Casa's account** | the account move; 15 merged; 22 merged before it edits `api/messages.ts`; item 1 after 21; copy last, after 20 and 21 | part of `casa-r12-1` |

The existing tracks keep working in this account this week and restart in Casa's account from their
kickoffs (README, "Restarting a track"). Their state is in the repo, so a restart costs one kickoff. Calliste
is new, so it starts there and is never started twice. Dispatch 23, and any session that holds `CR_INSPECT_KEY`
or `CR_TEST_KEY`, runs only in Casa's account: a key in a session on Kimani's account would bring production
client data into it, and D-26 question 3 (where comp reports and client data are kept) is still open.

**What happens to the earlier lines:**
- `casa-r12-1` (the port's leftovers): superseded, split by where each item lives. One draft per length and
  "Mark as sent records the copied tab" go to 18. Escape and the retitle go to 20. Setting an agent to
  practice goes to 22, and the Fix-both chip to 24. The pixel polish goes to Claude Design.
- `casa-r12-2` (the sign-in log): superseded by 22, which keeps its URL-error capture.
- `casa-r10-1` (Dispatch 13 phase 2 and free-text tags): free-text tags move to 20. The voice and the
  client profile become Calliste's second dispatch, after 21 lands `brief.client`, if Kimani agrees the writer
  is Calliste's (NW-093 a). Until then the line stays held.
- `casa-r10-3` (Arbiter, Jev live) and `casa-r10-4` (Painter, Dispatch 12 phase 2) are unchanged.

## What runs in parallel

```
Mason     15 ──► 18 ──► 20 ──► 21 ──► 22 ──► 23
Abacus    16 ──────► 19
Surveyor  17
Calliste                 (after the move) 24
```

- **Now, together:** 15, 16 and 17. Their only shared file is `workspace/state.ts` (15 edits `CompJudgment`,
  16 edits `Intake`). Whichever PR opens second rebases on the first.
- **Abacus 19** starts when 16 merges and rebases on 15 for `workspace/engine-input.ts`.
- **Mason 20** needs 16's data; **Mason 21** needs 19's output.
- **Calliste 24** does its server work at once, except item 1 (it reads 21's reveal marker) and any edit to
  `api/messages.ts` (22 merges first). Its copy lines in `Home.tsx` and `Terms.tsx` come last, after 20 (`Home.tsx`) and 21 (`Terms.tsx`)
  merge.
- **Until 22 lands,** Kimani opens Noble's report by its `?report=` link (admins already can). If no second
  builder is named by the time 18 merges, Mason takes 22's items 1 and 2 before 20.
- **If Kimani names a second builder this week,** it takes 22 then 23 (the platform lane) as soon as 15
  merges. 22 rebases on 15 for `server/api/comps.ts` and `workspace.ts`, and whichever of 20, 21 and 22 opens
  second rebases on the first. Mason's UI lane then runs 15, 18, 20 and 21 alone.

**Files with an owner this round.** `workspace/features.ts` and `subject.ts` belong to Abacus (16). Mason edits
`Chat.tsx` once (15), then hands it to Calliste. Nobody touches `assets/studio-header.js`.
**Migrations.** Reserved: `20261016000000` (15), `20261016120000` (22), `20261017000000` (23). 20, only if
needed, takes a timestamp later than every migration on `claude/main` when its PR opens (e.g.
`20261018000000`). If 22 ships items 1 and 2 first, its tables follow in `20261016120100`.

**Design-blocking first.** Before Kimani opens Claude Design, these matter most: 15 (the ★ in the tier control,
note button, markers, trash and bin, locks, Hubert's markdown), 16 and 20 (filled pickers, neighborhood,
photos, tag groups), 18's Designed-first tab, and 21's five-row table and target owner. 22 and 23 change
nothing in the layout Design draws (the list and the Dev tools strip gain content only), so they go last, except 22's items 1 and 2, which are small and urgent.

## What waits on Kimani

Each one has a recommendation the dispatch builds on unless he says otherwise before merge. They go on the
Casa Answer Sheet.

| Id | Question | Recommended | Blocks |
|---|---|---|---|
| NW-026 | Does ★ also make a comp 1st tier? | Yes: ★ sets 1st; 2nd or ✕ clears it | 15 |
| NW-028 | The word for "tag" | "Comp tags" | 15 |
| NW-044 b | An overridden StreetEasy fact counts as | A fact, marked "changed", StreetEasy's value kept | 15 |
| NW-046 | Note and tags both required? | Practice agents need both; full agents need tags, the note is optional | 15 (applied only if answered). It reverses D-27's "Saving a comp needs a note and a tag for every agent", so 15 changes `CompForm.tsx`'s Save rule to match |
| NW-012 | The well-kept, not-redone step | "Good" | 16 |
| NW-045 | Where the six ungrouped tags go | Four to Similarities, two to a "Differences" group, drop nothing | 16 |
| NW-045, 059 | The size scale | Similar ±10%, smaller/bigger 10–25%, much past 25% | 16 |
| NW-059 b | Derived tags pre-filled or suggested? | Suggested, "from the data"; contradictions clear themselves | 16, 20 |
| NW-018 a | Type model | A: two pricing types; an intake kind label with HDFC and sponsor flags | 16 (built only on A) |
| NW-002 | The target: one number or a range? | One number, relabelled | 20 (relabel only on A) |
| NW-020 b | Photos in the Designed email | Link StreetEasy's URLs (the design of record) | phase B |
| NW-086 a | Mark as sent without a copy? | Yes | 18 |
| NW-065 b | Five rows in the email too? | Yes, one table everywhere | the email's table (after 19) |
| NW-070 | Default owner of the target | Client | 21 |
| NW-074 | Pre-approval: yes/no, or with the amount? | With the amount | 21 |
| NW-088 a | Mentors see every report, or assigned agents only? | Every report, read-only | 22 |
| NW-054 | Who may reset samples; is a new link per reset OK? | Admins and mentors; yes. Built admin-only on the server until he answers; the server check changes with his answer | 23 |
| NW-090 a | Reading production: inspection API or a database role? Text on request? | The API, redacted, `?text=1` logged | 23 items 3–4 |
| NW-093 a | Is the writer Calliste's? | Yes; Mason keeps Send and QA | Calliste's second dispatch |
| NW-093 d | What may Hubert write? Does he see the agent's own number after the reveal? | Propose-and-confirm for facts, features, add-back and email fixes, never tier, note or tag; yes, after the reveal | 24 (`get_call`), phase B |
| NW-068 a | Deal terms to Hubert after the reveal? | Not yet; decide with NW-074's privacy rules | 24 |
| NW-085 a | Which good email is the example? | The 100 Barclay sample, drafted by the writer, edited by Noble | phase B |
| NW-096 | When to start relative to the account move | Existing tracks now in this account, Calliste in Casa's; D-26 questions 1 and 2 before the move. Recommended overrides the item's own text (move first); costs about a week if he wants that | 15 to 22 (start now on A); 23 and 24 (Casa's account) |
| NW-097 | Recording the next walk-through | Record on Kimani's machine; the activity log (22) as backstop | — |
| NW-021 | Is a rental-comps report wanted, and when? | Later; today's gate stays | — |
| NW-102 | Create the email as a Gmail draft, for Casa Workspace accounts, through a Casa-internal Google client? (Answer sheet NB-28) | Yes: set up the Casa Google client now, build it in phase B | phase B (the Gmail draft build) |

Also for Kimani:

- Surveyor's five-minute StreetEasy checklist if fetches are refused (17).
- A real co-op export to replace the stand-in sample (23).
- One real invite to a second address after 22 deploys.
- A two-minute paste into Gmail and Apple Mail after 18.
- `CR_INSPECT_KEY` and `CR_TEST_KEY` set on the Casa side (23).
- **If NW-102 is a yes:** create the Google Cloud project and the OAuth client under Casa's Workspace, with
  the consent set to Internal and the `gmail.compose` scope. A checklist comes with the Phase B dispatch. The
  same Casa Google client also lets Workspace trust the comp report's Google sign-in (Noble's refusal).

## Phase B: to Claude Design

The brief for it is `08-claude-design-handoff.md`. It covers NW-101 and NW-102 in its Send and Done table.

| Screen | Items |
|---|---|
| New report | Home and building split, laundry first-class, New development with the building (NW-008 b, 014, 016); the categorized amenity list (009 b); where the type label and its sponsor and HDFC flags are shown and edited, if NB-2 = A (018 a) |
| Sort | Card re-layout with facts, features and checks under the photo, Edit off its own row (035, 041); the note's place (036); unit/building split on the card (039 b); features and tags looking different (040 b); column chooser, sideways scroll, pinned Tier (034); Neighborhood column (033 b); transit bullets' place (037 b); the home panel (049); progress row on the title line (050); the compare view (052); the hover pencil and trash in the row's margins (056, 057) |
| Hubert | Look, presence and persona (024 a); drawer motion, widening, side (025, 042); the confirmation card for proposals (093 e) |
| Findings | Comps as chips (063 b); setting the target (064); the sale-against-ask chart (071 b); a first-class client and deal section and where client fields are asked (073 b, 074 b); the loop after Findings and the justification step (069 b, 075); the factor dropdown (076); the co-op flow review on the co-op sample (066 b) |
| Send and Done | Editing what Designed shows (079 b); Full and Short while editing (084 b); where the example email lives (085 b); Done in the progress row, Mark as sent stacked or set apart (101 b), and Done greyed until it's marked sent (086 b); where a "Create Gmail draft" button sits (102) |
| Platform | Mine / Everyone's in the list (088 b); Share's entry point and who-has-access (089 b); the masthead and report bar on short screens, checking the shared Studio header at 1280x720 (092); duplicate and transfer entry points (090 c) |

**Builds that follow the design:** Hubert's persona in a prompt version (024 b, Calliste); sharing
(089 a, Mason); duplicate and transfer (090 c, Mason); propose-and-confirm tools (093 f, Calliste); then the
build halves of 034 and 052; photos in the Designed email (020 b: Mason, after 20 carries the photo URLs to the client);
the loop after Findings and the client section (069 b, 073 b, 074 b, 075: Mason for the screens, Calliste for the path-to-target prompt); the masthead for short screens (092: Mason; the shared Studio header only as a separate change); the co-op ladder if Design and Kimani want one (066 b: Abacus).

**The Gmail draft (NW-102, Mason, if Kimani says yes).** "Create Gmail draft" on Send puts the Designed email
into the agent's Drafts, built as it should arrive. The browser asks Google for a short-lived token with the
`gmail.compose` scope through Casa's internal OAuth client. No Gmail token is stored on our side. Casa
Workspace accounts only; personal Gmail keeps Copy. It needs Kimani's Google Cloud project and client first (see
"Also for Kimani"), Send's design, and a dispatch of its own.

## Phase C: later

| Id | What | Why later |
|---|---|---|
| NW-001 b | Real address search | Units and keeping listings current make it hard; a link does the job |
| NW-017 b | Nearby neighborhoods in Add comps | Needs 16's neighborhood capture, 17's list and a researched adjacency table |
| NW-019 | Floors for houses | Waits on the type model (018 a) and a way to price houses |
| NW-021 | Rental-comps reports | The engine prices sales; a rental-comps report is a new report kind. Today's gate stays. |
| NW-032, 068 c | A first-run walkthrough | Try the ⓘ hints first (15, 20, 21); decide after Design |
| NW-067 b | Hubert's reason per comp | He's a guide only (D-27.6); Calliste's later work |
| NW-094 | Hubert reviews the tool | After round one, as a script on the seeded samples (about $1 a run) |
| NW-083 c | Subject drafts from the writer | Needs the writer's real eval (Dispatch 13, keys) and NW-093 a's answer on who owns the writer; it goes with Calliste's second dispatch. |

## No action, and process

- **Already true:** NW-005 (nothing saves before Next; then autosave), 007, 022, 029, 031 (the brief is in
  `02-sort.md`), 048, 051, 060, 061, 062, 087.
- **Duplicates:** 041 (035), 042 (025), 047 (028), 057 (056), 058 (020).
- **FYI:** 055 (Noble's notes and tiers aren't data).
- **Process:** 095 is this plan. 100: the dictation isn't in the repo, so there's no word count to give;
  more subagents is Kimani's call. 093 a's roster row and 096's timing are Casanova's, done with this plan.

## The points no report classified

| Id | Class | What |
|---|---|---|
| NW-021 | LATER | The engine prices sales; a rental-comps report is a new report kind. Today's gate stays. |
| NW-095 | NOOP | Kimani's process; this plan follows it |
| NW-101 a | FIX | Mark as sent is its own button, on the right of Copy, primary after a copy (in 18, with NW-086 a) |
| NW-101 b | DESIGN | Stacked, or set apart with Done greyed until marked sent (with NW-086 b) |
| NW-102 | BUILD | Gmail drafts: Kimani's call now (NB-28), the build in phase B; see Phase B |

— Casanova
