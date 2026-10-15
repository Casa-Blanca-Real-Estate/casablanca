# Sort

**In short**
- Most of Sort's points fit today's layout: a trash and a bin (the server can already restore a removed comp), the ★ in the tier control, yellow markers, a bottom CTA, an edit guard, a note you can start without Edit, labelled tag groups, and locked StreetEasy facts you can override.
- Ships now (Mason, mostly small): NW-026, 027, 030, 038, 040a, 043, 045, 053, 054, 056, 059a. NW-044a needs a migration. Five calls for Kimani come first: the word for "tag", ★ and 1st tier, note vs tags, pre-fill vs suggest, and the tag list.
- Goes to Claude Design: the card re-layout (035/036), the column chooser (034), the home panel (049), the progress row on the title line (050), the compare view (052), and how features and tags look different (040b).

| Id | Who | What | Class | Track | Phase |
|---|---|---|---|---|---|
| NW-022 | Kimani | "Lavender outline: Test has it too" read oddly because the test home is called Test | NOOP | Mason | A-now |
| NW-026 | Noble, Kimani | ★ found only by hovering. Move it into the tier control, with a hint | BUILD | Mason | A-now |
| NW-027 | Kimani | ✕ says "Excluded" on hover; ⓘ on the Tier header | BUILD | Mason | A-now |
| NW-028 | Noble | "Tag" is jargon; the filter row confused him | DECIDE | Kimani, then Mason | A-now |
| NW-029 | Noble | Expanding with + (the row click works too) | NOOP | — | — |
| NW-030 | Kimani | Start the note without hunting for Edit | BUILD | Mason | A-now |
| NW-031 | Kimani | Brief on "Checks, sources and history" | NOOP | Mason | — |
| NW-032 | Kimani | First-run onboarding walkthrough | LATER | Claude Design | C-later |
| NW-033 a | Kimani | Neighborhood on the home's line, and on each comp's card | BUILD | Mason | A-now |
| NW-033 b | Kimani | A Neighborhood column | DESIGN | Claude Design | B-after-design |
| NW-034 | Kimani | Column chooser, sideways scroll, Tier pinned | DESIGN | Claude Design, then Mason | B-after-design |
| NW-035 | Kimani | Card re-layout: everything under the photo, Edit off its own row | DESIGN | Claude Design | B-after-design |
| NW-036 | Kimani | Note feels first-class | DESIGN | Claude Design | B-after-design |
| NW-037 a | Kimani | Nearest subway lines, from the coordinates already mapped | BUILD | Surveyor, then Mason | A-now |
| NW-037 b | Kimani | Where the MTA bullets show (row, card, home) | DESIGN | Claude Design | B-after-design |
| NW-038 | Kimani | Yellow markers on the empty tier, note and tags | BUILD | Mason | A-now |
| NW-039 a | Kimani | Split unit from building features on comps; hide groups by type | BUILD | Mason | A-now |
| NW-039 b | Kimani | How the split shows on the card | DESIGN | Claude Design | B-after-design |
| NW-040 a | Kimani | Label the tag section "Comp tags", with the required marker | BUILD | Mason | A-now |
| NW-040 b | Kimani | Make features and tags look different | DESIGN | Claude Design | B-after-design |
| NW-041 | Kimani | Same as NW-035 | NOOP | — | — |
| NW-042 | Kimani | Same as NW-025 (the drawer, Hubert topic) | NOOP | — | — |
| NW-043 | Kimani | Collapse while editing: ask Save or Cancel when there are changes | BUILD | Mason | A-now |
| NW-044 a | Kimani | A lock on StreetEasy's facts instead of the line; unlock to override, keep StreetEasy's value | BUILD | Mason (Abacus for engine input) | A-now |
| NW-044 b | Kimani | Does an overridden fact count as a fact or as an estimate? | DECIDE | Kimani | A-now |
| NW-045 | Kimani | Tags grouped by kind, size as an ordered scale, labelled section | BUILD | Mason | A-now |
| NW-046 | Kimani | Are a note and tags redundant? | DECIDE | Kimani | A-now |
| NW-047 | Kimani | Same as NW-028 ("Needs tier, note, comp tags") | NOOP | — | — |
| NW-048 | Kimani | Faint outline on features the home has, in edit view | NOOP | — | — |
| NW-049 | Kimani | Read-only view of the home on Sort (panel or sticky header) | DESIGN | Claude Design | B-after-design |
| NW-050 | Kimani | Progress row on the title's line | DESIGN | Claude Design | B-after-design |
| NW-051 | Noble, Kimani | Expanding one row doesn't collapse others: keep | NOOP | — | — |
| NW-052 | Kimani | Compare view, home and one comp side by side | DESIGN | Claude Design, then Mason | B-after-design |
| NW-053 | Noble | Repeat the Findings CTA at the bottom | BUILD | Mason | A-now |
| NW-054 a | Kimani | One-click reset of the sample report | BUILD | Mason | A-now |
| NW-054 b | Kimani | A co-op sample | BUILD | Mason | A-now |
| NW-055 | Kimani | Noble's notes are gibberish: not data | NOOP | — | — |
| NW-056 | Kimani | Trash in the card, hover pencil and trash on the row, a bin to restore | BUILD | Mason | A-now |
| NW-057 | Kimani | Same as NW-056 | NOOP | — | — |
| NW-058 | Kimani | Same as NW-020 (photos, new-report topic) | NOOP | — | — |
| NW-059 a | Kimani | Contradictions cleared, and tags the data settles offered | BUILD | Abacus, then Mason | A-now |
| NW-059 b | Kimani | Pre-fill derived tags, or suggest them? | DECIDE | Kimani | A-now |
| NW-060 | Kimani | Filter offers the tags in use | NOOP | — | — |

## What's true in the code today

**Removing a comp.** There are two ways to remove a comp today. The first is ✎ Edit, then "Remove from the report" (`src/views/sort/CompCard.tsx:142`, `:260`). The second is the row's "Remove" link, which shows only on a comp read from a link that hasn't been confirmed yet (`src/views/sort/SortTable.tsx:180`). Both send `PATCH {removed: true}`, which sets `removed_at`/`removed_by` and clears the anchor (`server/api/comps.ts:251`; migration `20261015000000` keeps a removed comp from being the anchor). **The server already restores a comp:** `removed: false` clears `removed_at` (`comps.ts:257`). The workspace load returns removed comps with `removedAt` (`server/api/workspace.ts:143`). The client drops them from Sort (`workspace/engine-input.ts:86`) and keeps the export ones for Hubert's "You might also look at" (`removedExportComps`). So the bin needs only client work, and a restored comp comes back with its tier, note, tags and reason history. Retyping a removed typed-in comp already un-removes it (`comps.ts:157`).

**"Facts from a StreetEasy export stay as they are"** is `CompCard.tsx:194`: a `<p className="so-fixed">` that shows only in edit mode, on a comp from an export or a link. Only a typed-in comp's facts are editable. A typed-in edit saves as a new observation through `addManual` (`CompCard.tsx:110`). **No override field exists** for an export or link comp: the record is the source's, and the engine reads it as is.

**Tags.** The list is `TAGS` in `workspace/features.ts:196`, 18 fixed strings in the handoff's order. They are stored in `report_comps.tags` (text[], up to 30) and validated by the server's `isTag` (`comps.ts`, `compEdits`). A save that carries a tag not on the list gets a 400, so renaming or dropping a tag needs a data migration of stored arrays. Adding tags is free.

**Which tags the data already settles, and what the engine computes** (`engine/compute/checks.ts`, thresholds in `engine/house-method/production.json`):

| Tag | Derivable from | Engine today |
|---|---|---|
| Same building | both identities | yes: `same_building` check; `workspace/distance.ts` `same_building` |
| First floor | comp floor | yes: `first_floor` check (when the home isn't on 1) |
| Much smaller / Much bigger | both sizes | partly: `size_far_off` past 25%, one flag, no scale |
| Smaller / Similar size / Bigger | both sizes | no: needs thresholds (decision 6) |
| Similar floor | both floors | partly: `floor_far_off` past 3 floors |
| Lower / Higher floor | both floors | keep manual (Kimani: depends on the building's height) |
| 6+ months | comp date | yes: `sale_age` at 3, 6 and 12 months |
| New development | the new-development fact | yes: `new_development_vs_resale` |
| No outdoor space, Water views, Renovated, Full service | the comp's own features | n/a: they restate a feature picker |

Four of the 18 tags restate a feature, and two more restate an engine check. That overlap is much of why NW-040 and NW-046 feel muddled.

**"Needs …" and the Findings lock.** `needsOf` (`src/views/workspace/screens.ts:27`) lists `tier` if there's none, `note` if `noteOf` is empty (it falls back to the last reason that isn't "(no note yet)"), and `tag` if there are no tags. A link comp that isn't confirmed needs "Confirm or remove" instead. `sortReadiness` makes `ws.readiness`. The row gets a yellow left edge and "Needs tier, note, tag" (`SortTable.tsx:135`, text from `table.ts` `needText`). "N to finish" filters to those rows. The Findings button is disabled, with a helper link that filters (`src/views/shell/WorkspaceHeader.tsx:46`). The Gate, Findings and Send all render `SortFirst` while Sort isn't finished, whichever way the agent got there (`Workspace.tsx:573`).

## Points that need more than their row

**NW-026 ★.** Today the ★ sits after the address with `opacity: 0` until the row is hovered (`src/styles/sort.css:96`). It works for any tier, one per report (`setAnchor`, `comps.ts:77`). Build it as a fourth segment of the tier control (★ · 1st · 2nd · ✕), always visible, with the title "The main comp you're comparing to. The email leads with it." See decision 2 for whether ★ also means 1st.

**NW-027.** ✕'s `aria-label` is already "Excluded" (`SortTable.tsx:20`). Add `title` on all three segments, and an ⓘ on the Tier header: "1st: counts. Only 1st-tier comps set the range. 2nd: context, shown but not counted. ✕: out of every figure. ★: the main comp; the email leads with it." (Only primary comps enter statistics: `engine/README.md:292`.)

**NW-028 / NW-047.** In the code, the filter row starts closed (`filterOpen` is false, `SortStep.tsx:24`). With no tags it says "No tags yet. Tags you give comps show here." Noble most likely clicked Filter, or meant the 18 dashed "+ tag" chips in edit mode. After decision 1, change the word everywhere: `needText`, `readinessLine`, `SortFirst`, the card, `CompForm.tsx:205` and the filter. Also show Filter only once some comp has a tag.

**NW-030.** The empty note line becomes a "+ Add a note" button, and a filled note gets a small ✎. Either opens a note-only textarea that saves with `PATCH {note}`. The endpoint already takes a note on its own, and a note change on a tiered comp appends a reason (`comps.ts`).

**NW-031: how "Checks, sources and history" works (for Kimani).** It is a fold at the bottom of each comp card (`src/views/sort/More.tsx`), with up to five parts:
1. **Kara's checks.** The engine runs the mentors' rules on every comp against the home: same building, first floor, private outdoor space on one side only, new development against resale, co-op against condo, HDFC, sponsor sale, sale age (3, 6 and 12 months), size more than 25% off, floor more than 3 floors off, and distance past ¼ and ½ mile. Each flag says what it saw and which tier the rule suggests. It never changes a tier or a number. The thresholds are configuration ("Kara's rule, pending Noble"). A flag that rests on a value still waiting for the agent's confirm says so. It shows "None flagged" when the comp is clean, and checks it couldn't run (no coordinates yet) appear in grey.
2. **Distance.** "Same building", or miles between the two buildings' mapped locations (NYC Planning GeoSearch), with the address each one matched; otherwise, why it isn't known yet.
3. **Where it came from.** The export row and its pull date, the StreetEasy page and the day it was read (confirmed or not), or the day it was typed in. Then every fact with its value, its source where it differs from the rest, and how sure it is (approximate, inferred, an estimate). "Not listed" means the source says nothing, not "no".
4. **From the import.** The parser's notes on that row or that page.
5. **History.** Every tier given and every note changed on a tiered comp, oldest first, with who and when. It is append-only (§12), and sample entries are marked.

**NW-032.** LATER. Do the ⓘ hints first (NW-027, 040, 045). Decide on a walkthrough after the design round, if new agents still stall.

**NW-033 a.** Comps already carry `neighborhood` from the export and from link reads (`engine/types.ts:244`), and nothing shows it yet. Show it in the card's facts row now. For the home's sub line (`src/views/shell/subline.ts`), wait for NW-017 to capture the home's neighborhood.

**NW-037 a.** Surveyor finds the station data (the MTA's open station list, with lines and coordinates) and the official line colours (in GTFS `routes.txt`). Draw the bullets as plain coloured circles, not MTA artwork. Mason computes the nearest stations from the coordinates already geocoded (`ws.geocodes`) and shows them as a line in the card's Distance section. Transit stays out of the engine: it is context, not a valuation input.

**NW-038.** Use the row's `needs`. Put a yellow square on the empty tier segment, the note line and the tag section. "Needs tier, note, tag" becomes three small links that open the card at the right spot.

**NW-039 a.** The comp pickers are `FEATURE_GROUPS` (`features.ts:218`), the same groups the home uses. Do the split once, for the home and comps together, with NW-008/009/016 (unit groups, then building groups by StreetEasy's categories). Groups that depend on the type key off `property_type`, which comps already carry. The comp's stored features are JSON, so this needs no migration, but `cleanFeatures` must map the old keys.

**NW-043.** Today `toggle()` simply ignores a click while the card is in edit mode (`SortTable.tsx:81`). The fix: with no changes, leave edit mode and collapse. With changes, show an inline "Save changes? Save · Discard" on the card rather than `window.confirm`. The card reports whether it is dirty (`same(draft, initial())`).

**NW-044 a.** Replace the line with a 🔒 on each source fact in edit mode. Hovering it says "From StreetEasy's export, row 12. Unlock to correct it." Unlocking turns the fact into an input. Data: a new migration (unique timestamp, after `20261015000000`) adds `report_comps.fact_overrides jsonb`, with the agent's value, when and who. `engine-input.ts` lays an override over the record as `source: 'agent'`. The card shows the agent's value first, marked "changed". StreetEasy's value stays in "Where it came from". The checks re-run on the new value.

**NW-045.** Make tag groups data in `features.ts` (`TAG_GROUPS`). Size and multi-floor allow one choice each. Render group labels inside the existing tag area, under a section label with the yellow marker. Keep every current tag string, because stored reports use them. New ones are Penthouse and One, Two and Three floors. Their placement is decision 5.

**NW-048.** This already works. In edit mode (Sort's card and the add form), an option the home also has gets the lavender outline and "The home has this too" (`src/views/comp/Pickers.tsx:55`). That outline is also what NW-022 read.

**NW-053.** Repeat `rowCta` and the helper line from `WorkspaceHeader.tsx` at the end of `SortStep`, using the same disabled state and filter link.

**NW-054 a.** For admins, a "Reset the sample" item in the account menu's dev tools. It is a server call that, in one transaction: puts back every sample comp that was removed, removes comps that aren't in the sample, re-applies `SAMPLE_TIERS`, the notes, tags and anchor (the `POST {sample: true}` path, `comps.ts:172`), and refills the intake, target, call and send. The current fill doesn't un-remove comps or drop added ones, so it isn't a reset. **b:** a co-op sample needs a co-op export. The seed's co-op walk only re-types Barclay without sizes (`dev/seed-report.mjs`). See question 7.

**NW-056.** Add a 🗑 in the card's action area and, on row hover, a ✎ in the right margin and a 🗑 in the left. Both send `PATCH {removed: true}`. Removing doesn't confirm; the toast offers Undo instead. Add a "Removed (N)" fold at the bottom of Sort, listing those comps with "Put back" (`removed: false`). Hover-only won't reach touch screens, so the card's 🗑 stays. Removing is not ✕: a removed comp leaves the report (and becomes a Hubert suggestion if it came from an export), while ✕ keeps it, out of the figures.

**NW-059 a.** A pure function in `workspace/` takes the comp, the home and the engine's checks, and returns the tags the data settles and the tags the facts contradict. Picking an outdoor-space option other than None removes "No outdoor space". "First floor" is hidden when the comp's floor is known and isn't 1. Same building, the size scale, Similar floor (within the 3-floor band), 6+ months and New development come from the table above. Lower and Higher floor stay manual.

## Decisions (each with a recommendation; Mason can build on the recommendation unless Kimani objects)

1. **The word for "tag" (NW-028).** Options: "Comp tags", "Similarity tags", or "Tags" with an ⓘ. **Recommend "Comp tags"** ("Needs tier, note, comp tags"). The list holds differences as well as similarities, so "Similarity tags" would be wrong half the time.
2. **★ and 1st tier (NW-026).** Options: ★ stays independent of tier (today), or ★ sets 1st, and picking 2nd or ✕ clears the star. **Recommend the second**: today a 2nd-tier or ✕ comp can be the anchor the email leads with.
3. **An overridden fact (NW-044 b).** Options: it counts as a fact, marked "changed", or it counts as an estimate ("with estimates" only). **Recommend as a fact**: the use is correcting StreetEasy's mistakes, and StreetEasy's value stays on record.
4. **Note and tags (NW-046).** Options: (a) both required for everyone (today); (b) a note only when there are no tags; (c) `practice` agents need both, while `full` agents need tags and the note is optional. **Recommend (c).** The note is the learning part, and the levels already exist (D-11, D-27).
5. **Pre-fill or suggest (NW-059 b).** Options: pre-fill the derived tags (the agent can remove them); show them as one-click suggestions marked "from the data"; or pre-fill for `full` agents and suggest for `practice` agents. **Recommend suggesting for everyone, but clearing contradictions automatically.** `features.ts` says tags are the agent's, and a pre-filled tag would also meet the "needs a tag" rule without the agent doing anything.
6. **The size scale.** **Recommend:** similar within ±10%; smaller or bigger from 10% to 25%; much smaller or much bigger past 25%, matching the engine's `size_far_off`. These are house-method configuration, pending Noble.

## Questions for Kimani

1. Decisions 1 to 6 above.
2. The tag list (NW-045). Your four groups leave out No outdoor space, 6+ months, Full service, Renovated, Water views and New development. Should they go in Similarities, in a fifth "Differences" group, or be dropped because a feature or check already says them? (Dropping one means migrating the stored tags.)
3. Is Penthouse a floor tag only, or also a fact we capture?
4. The co-op sample (NW-054 b): which co-op? You pull its StreetEasy export, and we make it the second sample.
