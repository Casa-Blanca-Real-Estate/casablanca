# Dispatch 14 — Comp report: the design port, for Noble (CR-6)

**Dispatched by:** Casanova · 2026-10-14 · **To:** Mason
**Builds from:** the design handoff in `docs/comp-report/design-port/` (Kimani, 2026-10-14) — start with its
`README.md` and `Handoff Notes.md`, then `Comp Report Prototype.dc.html` (the main reference; open it in a
browser with `support.js` beside it, or read it in slices) and `screenshots/`. Where the handoff and
`01-design.md` / `02-screens.md` differ, **the handoff wins** (D-27), except the rules this file keeps.
**Depends on:** everything merged through #76 (the writer and QA). Dispatch 13 phase 2 waits behind this.
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Mason (CR-6)"** in the PR, its comments and your commits. Ledger line: `casa-r11-1`.

## The goal, and the clock

Kimani wants **Noble to walk through the comp report on production tomorrow (2026-10-15)**, with Kimani
leaving dev notes as they go. So this is one PR that ports the whole flow to the new design, working end to
end on real data, merged and live by tomorrow. Polish, narrow widths and the follow-ups below come after.
Open the PR the moment the definition of done holds; don't sit on it for extras.

## How to run it: Ultracode, with a set agent budget

Run it in one go at Ultracode effort, orchestrating with workflows. **Kimani's agent budget for this
dispatch, total across every workflow you run:**

| Model | At most |
|---|---|
| Fable | **1** agent |
| Opus | **5** agents |
| Sonnet | **10** agents |
| Haiku | as many as the work needs (mechanical checks, screenshots, copy diffs, grep sweeps) |

Pass `model` on every `agent()` call so nothing inherits a bigger model by accident, and `log()` the running
count per model. Kimani is watching his weekly limit, so spend Fable and Opus where judgment matters (the
data model, the Sort gate, Send's annotations, the final adversarial review) and push everything mechanical
to Haiku. A shape that fits:
1. **You, first, alone:** the global restyle (tokens, radius 0, type scale, buttons, page padding in
   `src/styles.css`) and the data-model call below, in their own commits. Every screen shares these classes;
   parallel edits to them will conflict.
2. **Screen groups in parallel**, each in its own worktree: shell + Reports; the new-report modals; Sort +
   Hubert; Gate + Findings; Send + Done. Integrate them yourself.
3. **Verify:** Haiku agents walk each screen against its screenshot and the prototype's copy, in buyer and
   seller, co-op and condo; one Opus or Fable agent reviews the whole diff adversarially. Fix, then open.

## What's already true (mapped 2026-10-14, so you don't rediscover it)

- **Object Sans is already embedded** (`src/styles.css`, `index.html` preloads). The Studio chrome (Studio
  back pill, Feedback, account chip) is injected by `assets/studio-header.js`, shared by every tool: **leave
  that file alone**; retune `.bar` around it.
- **Missing tokens:** `#3c3654`, `#e8b923`, `#d6402b`, `#fbf0c4`, `#eeece7`, `#e4e2dc`. Radii today are
  6–14px; the design is 0 (top-bar pills 6px, the Sample badge 4px).
- **The engine always receives `property_type: 'condo'`** (`workspace/engine-input.ts`, about lines 145 and
  298). The Co-op toggle must really pass `coop`, with the no-SF path, or co-op reports compute wrong.
- **Side (`Audience`) and client name live in the workspace JSON**, not report columns; stage isn't stored.
- **Everyone's `users.capability` is `full`** by default; `practice` is the new-agent level (D-11).
- **Send's edit model is plain text** (`send.draft.body`, the stale fingerprint, `htmlFromText`), and
  `workspace/qa.ts` is fresh from #76 with tests.

## In scope: the whole flow, per the prototype

1. **Shell.** Tokens, radius 0, type scale, primary button, page padding; the top bar; the workspace header
   (← Reports, address 28px/800, ✎ edit opening Details, the sub line); the 3-step progress row with the
   CTA; Sign-in restyled. **Remove the "Signed in as … · Sign out" line, but keep a real Identity sign-out**
   (in an account menu in `.bar`): the Studio chip clears only `localStorage`, so deleting the line outright
   strands people. Hide the dev scaffolding (About this screen, Build notes, Fill with sample) from everyone
   but admins, and off by default for admins too.
2. **Reports.** The hero, the table (thumb, address + client + Sample badge, side, stage, updated), header
   sort, 10 rows then "Show N more", the empty state. Read client, side and stage **in one query**, not one
   per row. Keep the admin Access panel, folded.
3. **New report, 1 of 3: the home.** Link + matched home, For a (Buyer/Seller), Client, **Type Co-op/Condo
   (default Co-op), passed to the engine for real**, Target price (optional, with the ⓘ; Buyer: "Offer
   target"). The target keeps **D-4 exactly**: Hubert never sees it until the neutral result exists; it is
   never in the email; it stays editable on Findings.
4. **2 of 3: details.** General (size with Estimate, or none for co-ops; floor, asking, charges, taxes),
   **About the home** pickers (Outdoor space, Views, Exposure, Unit condition, Building) and Year built, then
   Notes. Keep the engine's other fact fields (laundry, dishwasher, central air, fireplace, corner, new
   development) in a folded "More about the home" section rather than dropping what the engine uses. Reused
   as Edit details.
5. **3 of 3: comps.** The paste/type bar, drag-drop of a StreetEasy export, rows that read then confirm, and
   the add/edit form: status (incl. Didn't sell), price, size (hidden with no SF), floor, date, **Why it's a
   comp (required)**, **Tags (at least one; the prototype's list, several per comp)**, **Features** (the same
   pickers, the home's options outlined lavender). Save stays disabled until the note and a tag are in.
6. **Sort.** The table rows grouped by status; tiers **1st / 2nd / ✕**; the ★ anchor (one per report, any
   status, starring another moves it); header sort; the filter row (+ Add comps inline, N to finish, tag
   filters); the expanded card (facts incl. days on market and floor, Features with "N shared with {unit}",
   tags, note, StreetEasy link) and its edit mode. **Findings stays locked until every comp has a tier, a
   note and a tag**; incomplete rows get the 3px yellow edge and "Needs …"; the helper link filters to them.
   Comps still to confirm must be confirmed or removed; comps that can't be sorted don't count. No SF: hide
   $/ft and Size.
7. **Hubert.** Rename the assistant to Hubert in the UI and in its system prompt (guide only: it answers and
   suggests; it never tiers, writes notes or picks tags). The 380px drawer, open by default on the first Sort
   visit, the greeting, two preset chips per screen and side, the input, context Q&A elsewhere. **"You might
   also look at" shows only sales that exist in data already in the report** (rows of an imported export the
   agent didn't add); with none, the section doesn't show. **Hubert never names a listing that isn't in the
   data.** Real suggestions are a follow-up.
8. **The Gate.** Its own screen: Low, High, Why. **`practice` agents must give low, high and a why of 100+
   characters and can't skip; `full` agents can skip** (the why marked optional). Enforce it on the server
   too. Give admins a way to view the Gate as a new agent, so it can be shown to Noble.
9. **Findings.** The top card (True estimate 48px, per-SF line with SF only), the legend and the range bar on
   the **fixed axis** (the step rule in the README's Interactions), the verdict line, then **How Hubert got
   there** beside **Your reasoning (from the gate)**, the status tiles, and the accordions (Price table with
   SF only, Comps that count, Target price, Pricing details, How this was worked out). "How Hubert got
   there" is **built from the engine's 1st-tier comps, deterministically**: names, prices, sizes, dates and
   the range, nothing the engine doesn't know. Handle no guess (skipped), no range, and both results
   (estimates changing the answer). "True estimate" is a Findings label only, never in the email. Pricing
   details shows only rows with data.
10. **Send.** The issues panel ("N to fix", numbered, each with Show), **✦ Fix both as deterministic fixes**
    where QA knows the fix (rounding to the range, the missing disclaimer or size note), inline annotations
    as an overlay on the plain-text body (keep plain text the source of truth; changes to `qa.ts` are
    additive, its tests still pass), the headline line with its drafts (D-21: Copy waits for a headline),
    and tabs **Full / Designed / Short / Text**. **Designed renders the Full draft** into the branded 600px
    HTML email (no separate writer run): the wordmark from a public path you add (`docs/` is not public),
    photos as neutral blocks until a photo source exists. Copy as HTML with annotations stripped ("Copied.
    Paste into Gmail."). **Mark as sent** (after a copy; reversible with Reopen) stores a sent state.
11. **Done.** Sent confirmation, headline, estimate tiles, and **How did it go?** as typed-in entries (D-19's
    one-tap manual fallback); automatic fill from records is a follow-up.
12. **Buyer and seller copy** throughout, from the prototype's `renderVals()` (search `buyer ?`). The default
    side stays **Buyer** (02-screens: buyer first) unless Kimani says otherwise on the answer sheet.

**Data.** Comp notes, tags, features, the anchor, the home's features, the sent state and the outcomes need a
home. Put them where the build already keeps the matching thing (tiers and reasons, the workspace state),
and add a migration only where that would lose data or break the writer's and QA's reads; mind the state
PATCH's full replace and 64 KB cap. A new migration takes a timestamp no open PR uses. The writer (#76) and
Hubert should see notes and tags where they already see tiers.

## Not in this dispatch (follow-ups; say so in the UI where a user would hit them)

- **Screenshots → comps** (a vision call): the drop zone says "type it in for now" for images.
- **Hubert's real suggestions** from market data. **Comp and home photos** (a source and hosting decision).
- **Inheriting the Studio session** (the Studio has no server-verifiable sign-in today).
- **Outcomes filled from records** (D-19 automatic). **Responsive and narrow widths** (the handoff defers them).

## Definition of done

- Every screen in the handoff works end to end on real data: a new report from a StreetEasy link through
  Sort, the Gate, Findings and Send to Done, in **buyer and seller**, **co-op (no SF) and condo**.
- The engine receives `coop` for co-op reports; nothing shows a per-SF figure without SF.
- Hubert never invents a listing; the target never reaches Hubert before the neutral result or the email.
- Every suite passes with nothing skipped (`test:engine`, `test:comp-report` on a local Postgres, `test`,
  `test:dev-notebook`, `test:feedback`, `test:agent-pics`), `typecheck`, `typecheck:engine`, `build`.
- A Playwright walk of all 11 screens against the screenshots, at 1440px, with the screenshots in the PR.
- The PR description covers rule 6, **the agent count per model you actually used**, and what Kimani must do
  before Noble's walk-through.

— Casanova

---

## Handoff — Mason (CR-6), 2026-10-15

**State:** the port is in one PR to `claude/main` (see the roster row). Every screen of the handoff
works end to end on the dev server, in buyer and seller, co-op and condo; every suite passes.

**Where things are:**
- **Data** (migration `20261015000000_comp_report_design_port`): a comp's `note`, `tags`, `features`
  and `removed_at` on `report_comps`. A tier given before a note records "(no note yet)"; a changed
  note on a tiered comp appends a reason (PATCH, and a typed-in comp sent again). Removing keeps the
  row; an export's removed rows are Hubert's only "You might also look at", and `get_numbers` lists
  them as facts. The workspace state gains `reached`, `hubertSeen`, `outcomes`, `send.format` and
  `send.sentAt`; the home's pickers write `exposures`, `building` and the wider `condition` into the
  intake. The reports list reads client, side, stage and unsorted in its one query.
- **Rules on the server:** the Gate (`checkCall` in `server/api/workspace.ts`: practice agents can't
  skip and need a why of 100+ characters, trimmed); `propertyType` on the workspace PATCH, which the
  engine reads (`numbers.ts`, `engine-input.ts`); Hubert's prompt `cr6-2026-10-15`.
- **Shared front-end:** `workspace/features.ts` (tags, pickers, the home's features),
  `src/views/workspace/screens.ts` (screens, readiness, `hasSF`, `homeName`), `src/views/comp/`
  (the comp form, pickers, paste bar and drop target, the type-mismatch notice), the tokens and
  primitives in `src/styles.css`.
- **Screens:** the shell in `src/views/shell/` (top bar with the account menu and the real sign-out,
  the workspace header and progress row, Reports' list logic); the new-report modal in
  `src/views/newcomp/`; Sort in `SortStep.tsx` and `src/views/sort/`; Hubert in `Hubert.tsx`,
  `Chat.tsx` and `src/views/hubert/`; the Gate and Findings in `Gate.tsx`, `Findings.tsx`, `Terms.tsx`
  and `src/views/findings/` (the fixed axis and "How Hubert got there", pure and tested); Send and Done
  in `SendStep.tsx`, `Done.tsx` and `src/views/send/` (issues, fixes, the designed email, pure and
  tested). Each screen's CSS is its own file in `src/styles/`, with a class prefix.
- **Dev:** `dev/seed-report.mjs` makes a report at any stage, side and type;
  `dev/walk-screens.mjs` screenshots all 11 screens (it needs `npm i --no-save playwright-core`).

**Gotchas for the next session:**
- **A co-op report counts co-op comps only** (the engine's like-for-like rule). The sample building is
  a condo, so the seed's co-op walk imports the sample export as co-ops with no sizes. Sort and
  Findings say when the type doesn't match the comps.
- **This cloud machine has 4 CPUs, so a workflow runs two agents at a time.** Parallel builders need
  separate workflows.
- **The top bar is 50px and sticky** (the Studio chrome's fixed pills centre on it); anything sticky
  sits at `top: 50px`. The account menu is ours; the Studio's own chip is hidden while it shows.
- **State setters in one event build on each other** through `stateRef` (Edit details' Cancel needed
  it). Keep it that way.
- **Send keeps one edited draft at a time** (`send.draft`); its length is read from the fingerprint.
- **Dev tools** (About this screen, Fill with sample) and **View the Gate as a new agent** are in the
  account menu, for admins, off by default.

**Follow-ups (not in this dispatch; the UI says so where a user meets them):** screenshots read into
comps; Hubert's real suggestions; photos; inheriting the Studio session; outcomes from records; narrow
widths. And from the build: one edited draft per length; Hubert's "Fix both" chip reaching Send's fix;
a way to set an agent to `practice` in Access; Escape in the new-report modal drops a half-filled comp
form; changing the home's address on step 1 doesn't retitle the report; Mark as sent records the open
tab, which may not be the one last copied.

**Next for Mason:** Dispatch 13, phase 2.

— Mason (CR-6)
