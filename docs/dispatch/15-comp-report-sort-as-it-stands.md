# Dispatch 15 — Comp report: Sort, as it stands (CR-7a)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Mason
**Builds from:** Noble's walk-through, `docs/comp-report/feedback/2026-10-15-noble/` (`00-items.md` for the
points, `02-sort.md` for the code map and the six decisions, `05-hubert-and-ai.md` for NW-023). The design of
record is the port as merged in #77 (`docs/dispatch/14-comp-report-design-port.md`, D-27).
**Depends on:** everything merged through #77. Nothing new. Runs alongside Dispatch 16 (Abacus) and 17
(Surveyor); see "Files" for the one shared file.
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Mason (CR-7a)"** in the PR, its comments and your commits. Ledger line: `casa-r13-1`.

## The goal

Kimani goes into Claude Design next. Before he does, Sort should have every control Noble and Kimani asked for
that fits today's layout, so Design redraws the card and the table around the real thing. Add controls and
data; don't move the card's sections, the table's columns or the flow. One PR.

## In scope

1. **NW-026 · the ★ in the tier control.** A fourth segment, ★ · 1st · 2nd · ✕, always visible (today the ★
   is `opacity: 0` until hover, `src/styles/sort.css:96`). Title: "The main comp you're comparing to. The
   email leads with it." Build on the recommendation unless Kimani says otherwise on the answer sheet:
   **★ sets 1st, and picking 2nd or ✕ clears the star.** Enforce it on the server too (`setAnchor`,
   `server/api/comps.ts:77`).
2. **NW-027 · tier hints.** A `title` on each segment (✕ says "Excluded"; keep the ✕). An ⓘ on the Tier
   header, reusing the one in `src/views/newcomp/Frame.tsx`: "1st: counts. Only 1st-tier comps set the range.
   2nd: context, shown but not counted. ✕: out of every figure. ★: the main comp; the email leads with it."
3. **NW-028, NW-047 · the word.** **Kimani, 2026-10-21 (NB-5): "Tags", with an ⓘ**, not "Comp tags"; the ⓘ says a
   tag can be a difference as well as a similarity. Change it in
   `needText`, `readinessLine`, `SortFirst`, `CompForm.tsx`, the card and the filter ("Needs tier, note, comp
   tags"). Show the Filter control only once some comp has a tag.
4. **NW-030 · the note on its own.** The empty note line becomes "+ Add a note"; a filled note gets a ✎. Either
   opens a note-only textarea that saves with `PATCH {note}` (the endpoint takes a note on its own).
5. **NW-033 a · the comp's neighborhood** in the card's facts row, from `CompRecord.neighborhood`
   (`engine/types.ts:244`). Comps only; the home's neighborhood comes with Dispatch 20.
6. **NW-038 · markers that lead somewhere.** A yellow marker on the empty tier control, the note line and the
   tag section, driven by the row's `needs`. "Needs tier, note, comp tags" becomes links that open the card at
   that spot.
7. **NW-040 a · a label on the tag section** ("Tags" with its ⓘ, per NB-5, with the yellow required marker), in read and edit
   modes (`src/views/sort/CompCard.tsx:225`).
8. **NW-043 · leaving edit mode.** A collapse attempt in edit mode: with no changes, leave edit mode and
   collapse; with changes, an inline "Save changes? Save · Discard" on the card (not `window.confirm`).
9. **NW-044 a · locked facts you can correct.** Replace "Its facts are from StreetEasy's export, so they stay
   as they are" (`CompCard.tsx:194`) with a lock on each source fact in edit mode. Hover says where it came
   from: "From StreetEasy's export, row 12." or "From its StreetEasy page, read <date>.", then "Unlock to
   correct it." Unlocking turns the fact into an input.
   - A migration, `20261016000000_comp_report_fact_overrides.sql`, adds `report_comps.fact_overrides jsonb not
     null default '{}'` with `check (octet_length(fact_overrides::text) <= 2048)`.
   - **The keys are a closed list:** `price`, `size`, `date`, `floor`, the four facts the card lets you correct.
     Each value is `{ value, by, at }`. In `comps.ts`, `compEdits` accepts only those four keys and refuses any
     other, `__proto__`, `constructor` and `prototype` included. It checks each value with the rules a typed-in
     comp's matching field gets in `compRecordFromManual` (a whole-dollar price, a size, an ISO date not in the
     future, a whole floor) and refuses a string where a number belongs. `by` and `at` are stamped from the
     session and the clock; whatever the body says for them is dropped. A key sent as `null` clears it.
   - `workspace/engine-input.ts` lays an override over a copy of the record as `source: 'agent'`, by an explicit
     assignment per key (`price` to `sale_price` for a sold comp and `list_price` otherwise, `size` to
     `area_sqft`, `date` to `status_date`, `floor` to `floor`). Never a generic path-set: this runs in the
     shared warm function. Build on the recommendation for NW-044 b: **it counts as a fact, marked
     "changed"**. StreetEasy's value stays in "Where it came from". The checks re-run on the new value.
   - It reaches the client as `CompJudgment.factOverrides` (`workspace/state.ts`), filled by `loadJudgments` in
     `server/api/workspace.ts`; `WorkspaceData`, which `src/api.ts` re-exports, types it.
   - Clearing an override puts StreetEasy's value back.
10. **NW-053 · the CTA at the bottom.** Repeat the Findings button and its helper/filter line at the end of
    `SortStep`, from the same `rowCta` and `readinessLine`, same disabled state.
11. **NW-056, NW-057 · remove and put back.**
    - A trash button in the card's actions.
    - No confirm: remove at once, with Undo in the toast.
    - A "Removed (N)" fold at the bottom of Sort, each with "Put back" (`PATCH {removed: false}`, already on
      the server, `comps.ts:257`; removed judgments already reach the client with `removedAt`).
    - Removing isn't ✕. A removed export row still feeds Hubert's "You might also look at".
12. **NW-046 · note and tags, only if Kimani has answered.** If the answer sheet says "practice agents need
    both; full agents need tags and the note is optional" (the recommendation), apply it in `needsOf`
    (`src/views/workspace/screens.ts:27`; the lock is client-side today, so no server change). Change
    `CompForm.tsx`'s Save rule to match, and say in the PR that this reverses D-27's "Saving a comp needs a
    note and a tag for every agent"; Casanova updates D-27 item 3 in `docs/decisions.md`, not you. `needsOf`
    now takes the agent's level (the workspace's `level`, practice or full), and the yellow note marker of
    item 6 follows it: a full agent's empty note is no longer marked required. If not answered, leave it all
    as it is and say so in the PR.
13. **NW-023 · Hubert's markdown.** His replies print raw (`src/views/Chat.tsx:135`, `:145`, in a pre-wrap
    `<p>`). Add a small renderer, `src/views/hubert/markdown.tsx`, that builds React elements: bold, italic,
    inline code, lists, headings as bold lines, `http(s)` links only. No images, no raw HTML; an unclosed
    marker stays literal while streaming. Hubert reads third-party listing text, so a link can point
    anywhere: render each with `target="_blank" rel="noopener noreferrer nofollow"`, show the destination
    host beside the label when the label isn't the URL itself, and refuse a URL with userinfo
    (`https://x@evil.example`), which stays plain text. Hubert's text only; the agent's bubble stays plain. It fixes old
    transcripts too. Tests for a script tag, a `javascript:` link, a userinfo link, the `rel` and `target` on a good link, the
    host shown beside a labelled link, and half-streamed text. It's in this
    dispatch because the drawer opens on Sort; Collister owns `Chat.tsx` from Dispatch 24 on.

## Not in scope (Claude Design, phase B)

The card's re-layout with facts, features and checks under the photo and Edit off its own row (NW-035,
NW-041); the note's place in it (NW-036); the column chooser, sideways scroll and a pinned Tier (NW-034); a
Neighborhood column (NW-033 b); features and tags looking different (NW-040 b); the home panel (NW-049) and the
progress row on the title line (NW-050); the compare view (NW-052); the drawer's motion and side (NW-025);
NW-056's margin hover affordances (a ✎ and a trash in the row's margins). Also not here: tag groups and
suggested tags (Dispatch 16 makes the data, 20 shows it), photos (16, 20), sample reset (23).

## Data and constraints

- **One migration, `20261016000000`.** No other open PR uses it; re-check before you open. Carry the
  `comp_report_app` grant block. `fact_overrides` is written under the same policy as the table's other
  columns: it follows `report_comps`' policies, whichever function they call (`can_see_report` today;
  Dispatch 22 splits it into `can_read_report` and `can_edit_report` and rewrites those policies).
- **Files.** You also edit `server/api/workspace.ts` (`loadJudgments`) and `server/api/comps.ts`; Dispatch 22
  rebases on you for both. Don't edit `workspace/features.ts` or `workspace/subject.ts`: Dispatch 16 owns them
  this round.
  You and 16 both edit `workspace/state.ts` (you `CompJudgment`, 16 `Intake`): whichever PR opens second
  rebases on the first before review. Dispatch 19 (Abacus) edits `engine-input.ts` after this merges.
- Don't edit `TAGS` or `isTag`: Dispatch 16 adds strings to them. Don't assert the tag count in a test.
- The Findings lock is unchanged: every comp needs a tier, a note and a tag, except as item 12 says.
- `assets/studio-header.js` stays untouched.

## Definition of done

- Every item above works on the dev server, in buyer and seller, co-op and condo, on the seeded sample
  (`dev/seed-report.mjs`) and on a report built from a link.
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local` first), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and
  `typecheck`, `typecheck:engine`, `build`. New tests cover the ★ rule on the server, overrides in the engine
  input, put-back, and the markdown renderer. The override tests refuse an unknown key, `__proto__` (sent as
  raw JSON text, not an object literal), `constructor`, `prototype`, and a string where a number belongs;
  prove that a body's `by` and `at` are ignored; and check `Object.prototype` has no new key afterwards.
- A Playwright walk of Sort (`dev/walk-screens.mjs`, 1440px): the tier control with ★, a marked incomplete row,
  a card in edit mode with a lock, the Removed fold, a Hubert reply with a list and bold. Screenshots in the PR.
- The PR description covers rule 6 and lists every decision you built on a recommendation (NW-026, NW-028,
  NW-044 b, and NW-046 only if he answered it "A"; otherwise it is left as it is), so Kimani can overturn one
  before merge.

— Casanova
