# Dispatch 16 — Comp report: the listing read and the home's vocabulary (CR-2.3)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Abacus
**Builds from:** Noble's walk-through, `docs/comp-report/feedback/2026-10-15-noble/`: `01-new-report-and-home-data.md`
(what the read asks for and what the home drops), `07-streeteasy-taxonomy.md` (the grey line, the amenity
categories, the recommended data shape), and `02-sort.md` (the tag groups and the tags the data settles).
Design of record: `01-design.md` (factor 8's condition scale, "listing photos linked, not hosted" at :757 and
:883).
**Depends on:** everything merged through #77. Runs alongside Dispatch 15 (Mason) and 17 (Surveyor). 17
refines the lists you start from; it doesn't block you.
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Abacus (CR-2.3)"** in the PR, its comments and your commits. Ledger line: `casa-r13-2`.

## The goal

The StreetEasy read already gets the neighborhood, the type, year built, sponsor and HDFC flags, amenities and
policies, and the home throws most of it away (`homeFromListing`, `workspace/subject.ts`). Noble had to set
the pickers by hand. Make the read fill everything it can, for the home and for comps, and give the pickers
the vocabulary StreetEasy uses. Data and mapping only: Mason shows the new fields in Dispatch 20. One PR.

## In scope

1. **NW-018 b · the grey line.** Ask the extract (`LISTING_EXTRACT_SCHEMA`, `engine/parser/listing.ts:43`)
   for the grey line's three parts: type, neighborhood, and the sale kind ("Resale"). Add `sale_kind`
   (`resale | new_development | sponsor | restricted | foreclosure | auction | short_sale | other`) and its
   raw label to the comp facts, per `07-streeteasy-taxonomy.md`. "Resale" then reads as
   `new_development: false` (today it's unknown); "Sponsor Unit" fills `sponsor_unit` too. Keep raw labels
   when a value is unknown; never reject one.
2. **NW-020 a · photos.** Add `photos` and `heroImageUrl` to the extract, as the carousel import does
   (`netlify/functions/streeteasy-import-background.mjs:27-41`, junk filter included). Keep the URLs on the
   record from `link_reads.extract`; update the "no photos" note in `server/links.ts:8`. Bump
   `PARSER_VERSION`. Only new reads get photos. No proxy, no copies: display is Mason's (Dispatch 20).
3. **NW-008 a · "Private outdoor space".** Rename the group's label; its key stays `outdoor`.
4. **NW-009 a · the building's amenities in StreetEasy's categories:** Services and facilities, Wellness and
   recreation, Shared outdoor space, and whatever 07 or 17 add. Data in `workspace/features.ts`, mapped from
   the read's raw amenity tags (`deriveFromAmenities`, `engine/parser/derive.ts`). **Additive only:** keep
   every existing option label, because `cleanFeatures` drops unknown labels and comps store them
   (`report_comps.features`).
5. **NW-010 · Policies,** a group filled from the read's policy tags (pets, smoking, and the co-op ones the
   page shows). Derive `pets: 'allowed' | 'not_listed'` and `smoke_free`; never derive "no pets" from a blank.
6. **NW-039 a · each group marked `unit` or `building`,** and the property types it applies to (no concierge
   for a house). Data only; Mason hides groups by type in 20.
7. **NW-011 · fill every picker the read can,** in `homeFromListing` (the home) and `featuresFromRecord`
   (comps; today only Outdoor, Views and Doorman): Building from service, parking and amenity tags; corner from
   a "Corner unit" feature tag; rooms (add `intake.rooms`: co-ops price by rooms); policies; neighborhood. The
   page's type: **don't overwrite the report's type.** Return the page's type as data
   (`typeFromListing` or the like) so Mason's notice can offer a one-tap switch. Raw tags are already on every
   record (`record.tags`), so stored comps map without a re-read.
8. **NW-017 a (data) · the home's neighborhood:** `intake.neighborhood`, filled from `record.neighborhood`.
9. **NW-012 (data) · the condition scale:** Needs work · Original · Good · Updated · Renovated · Mint, low to
   high. Map the existing `good` and `needs_work` states to their own labels (today they show as Updated and
   Original, `features.ts:77`). Export the ⓘ text beside the scale: "Original: never redone, as built. Good:
   well kept, not redone. Needs work: dated or worn, a fixer-upper or gut." Use "Good" unless Kimani picks
   "Well kept".
10. **NW-045 (data) · tag groups.** `TAG_GROUPS` in `features.ts`: Similarities; Size as an ordered scale, one
    choice; Floor (adds Penthouse); Multi-floor (One, Two, Three floors; one choice); and, per the
    recommendation, Full service, Renovated, Water views and New development under Similarities, No outdoor
    space and 6+ months in a "Differences" group. **Every current tag string stays valid.** New strings go into
    `TAGS` so `isTag` accepts them.
11. **NW-059 a · the tags the data settles.** A pure function in `workspace/` (say `derived-tags.ts`) from the
    comp, the home and the engine's checks to two lists: tags the data supports (Same building; the size scale
    at ±10%, 10–25%, past 25%, matching `size_far_off`; Similar floor within the 3-floor band; 6+ months; New
    development) and tags the facts contradict (an outdoor pick other than None contradicts "No outdoor
    space"; a known floor other than 1 contradicts "First floor"). Lower and Higher floor stay manual. Put the
    size thresholds in the house method's configuration, not in code. Mason shows them as suggestions in 20
    (the recommendation for NW-059 b).
12. **NW-018 a, only if Kimani answers "A".** The report's type stays the pricing basis (condo or co-op). Add
    an intake `kind` label (HDFC, condop, townhouse, house) with sponsor and HDFC as flags, filled from the
    read. No migration, no engine change. If he answers B, or hasn't answered, leave it out and say so.

## Not in scope

- Showing any of it: the neighborhood field, the type notice, photos on the card and the home, tag groups and
  suggestions on screen, groups hidden by type. That's Mason's Dispatch 20, after this merges.
- The home/building split on screen and the long amenity list's look (NW-008 b, NW-009 b, NW-014, NW-016,
  NW-039 b): Claude Design.
- Photos in the Designed email (NW-020 b, Kimani's call). Floors for houses (NW-019, later). Neighborhood
  suggestions (NW-017 b, later). Engine changes for Findings: Dispatch 19.

## Data and constraints

- **No migration.** Features and tags are jsonb and text[]; the intake lives in the workspace state (64 KB
  cap; mind the full-replace PATCH).
- **Files you own this round:** `workspace/features.ts`, `workspace/subject.ts`, `engine/parser/*`,
  `engine/types.ts`, `engine/version.ts`. You and Dispatch 15 both edit `workspace/state.ts` (you `Intake`,
  15 `CompJudgment`): whichever PR opens second rebases on the first. Don't edit `src/views/` or
  `engine-input.ts`; if a new group shows up in an existing picker by itself, that's fine.
- Firecrawl costs credit and has a daily limit: test with `dev/fake-firecrawl.ts` fixtures, including a page
  with photos, a co-op and a page with no grey line.
- The read never invents a value. A field the page doesn't show stays unknown.

## Definition of done

- A pasted link (fixture) fills the home's neighborhood, rooms, Building, policies, corner and year built,
  and returns the page's type when it differs. Comps get the same pickers from their records.
- Stored comps keep every feature and tag they had (a test loads today's stored shapes through
  `cleanFeatures`).
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`.
- The PR lists the new fields and exports Mason needs for Dispatch 20, and every decision built on a
  recommendation (NW-012's word, NW-045's six tags, the size thresholds, NW-018 a).

— Casanova
