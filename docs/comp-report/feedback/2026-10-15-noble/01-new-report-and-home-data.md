# The new-report modal and the home's data

**In short**
- The StreetEasy read already asks for neighborhood, year built, type, sponsor/HDFC, new development, amenities and policies. The home drops most of it: `homeFromListing` never fills the Building picker, the type, the neighborhood, rooms or policies. That gap is why Noble had to set the pickers by hand.
- Ships now (Mason and Abacus, no layout change): fill every picker the read can, capture the neighborhood, the condition scale, policies, photo URLs, the copy fixes (link, target hint, notes), the clean link in the field, size as a plain field when typed in.
- Goes to Claude Design: splitting the home from the building (NW-008 b, NW-014, NW-016, NW-039 b), the categorized amenity list (NW-009 b). Kimani decides the target's meaning (NW-002), the type model (NW-018 a) and photos in the email (NW-020 b).

| Id | Who | What | Class | Track | Phase |
|---|---|---|---|---|---|
| NW-001 a | Noble | Say that typing an address doesn't search: a link fills the home in, an address means you fill it in | FIX | Mason | A-now |
| NW-001 b | Noble | Real address search | LATER | Abacus | C-later |
| NW-002 | Both | Offer target: one number or a range, and which number | DECIDE | Kimani | A-now |
| NW-003 | Both | Target ⓘ: say "AI assistant", say what the rest means | FIX | Mason | A-now |
| NW-004 | Noble | Strip StreetEasy's tracking from a pasted link | FIX | Mason | A-now |
| NW-005 | Kimani | When does a report first save | NOOP | Kimani | A-now |
| NW-006 | Kimani | Typed-in home: size is a plain field with Estimate beside it | FIX | Mason | A-now |
| NW-007 | Noble | Floor, ask, charges, taxes: good | NOOP | — | A-now |
| NW-008 a | Noble | "Outdoor space" becomes "Private outdoor space"; shared outdoor goes with the building | FIX | Mason | A-now |
| NW-008 b | Noble | Separate the home's features from the building's | DESIGN | Claude Design | B-after-design |
| NW-009 a | Noble | Building amenities in StreetEasy's categories: the vocabulary, the data, the mapping from the read | BUILD | Abacus | A-now |
| NW-009 b | Noble | How a long categorized amenity list shows, in the modal and on the comp card | DESIGN | Claude Design | B-after-design |
| NW-010 | Kimani | Capture policies (pets, smoking…), filled from the read | BUILD | Abacus | A-now |
| NW-011 | Noble | The read fills every picker it can, for the home and for comps | BUILD | Abacus | A-now |
| NW-012 | Noble | Condition scale: add Good and Needs work, explain Original | BUILD | Mason | A-now |
| NW-013 | Kimani | Year built: auto-fills (already does when the page shows it); make it look like a field | FIX | Mason | A-now |
| NW-014 | Kimani | Laundry first-class; About the home / About the building; Building below the home's fields | DESIGN | Claude Design | B-after-design |
| NW-015 | Noble | Notes: clearer prompt, an ⓘ | FIX | Mason | A-now |
| NW-016 | Kimani | New development belongs to the building | DESIGN | Claude Design | B-after-design |
| NW-017 a | Noble | Capture the home's neighborhood, fill it from the read, show it in the modal | BUILD | Mason | A-now |
| NW-017 b | Noble | Suggest nearby neighborhoods in Add comps | LATER | Abacus | C-later |
| NW-018 a | Noble | More property types (HDFC, sponsor, townhouse, condop, house): how the tool models them | DECIDE | Kimani | A-now |
| NW-018 b | Noble | Fill type, neighborhood and resale/new development from the grey line, once the probe lands | BUILD | Abacus | A-now |
| NW-019 | Kimani | A townhouse has a number of floors, not a floor | LATER | Mason | C-later |
| NW-020 a | Kimani | Read photo URLs with the page, show them on the comp card and the home | BUILD | Abacus | A-now |
| NW-020 b | Kimani | Photos in the Designed email: linked or hosted | DECIDE | Kimani | A-now |
| NW-039 a | Kimani | Mark each feature group as unit or building, and which types it applies to | BUILD | Abacus | A-now |
| NW-039 b | Kimani | The comp card split into unit and building, deciding fields first | DESIGN | Claude Design | B-after-design |

## What the StreetEasy read gives today, and what the home keeps

The read is Firecrawl with `LISTING_EXTRACT_SCHEMA` (`tools-src/comp-report/engine/parser/listing.ts:43`), turned into a record by `compRecordFromListing`, then into the home's intake by `homeFromListing` (`workspace/subject.ts`), applied once per read in `src/views/workspace/Workspace.tsx:380`.

| Field | Asked for | Into the record | Fills the home |
|---|---|---|---|
| Address, unit | yes | identity | yes |
| Size, beds, baths, floor, charges, taxes | yes | facts | yes |
| Asking price | yes | `list_price` | yes, active or in contract only |
| Rooms | yes | `rooms` | **no** (the intake has no rooms field) |
| Neighborhood | yes | `record.neighborhood` | **no** (no intake field) |
| Property type | yes ("Condo, Co-op, Condop or Townhouse") | `property_type` | **no** (the report's type stays what step 1 said) |
| Year built | yes | `year_built` | yes |
| New development | yes ("yes" only) | `new_development` | yes, but "Resale" reads as unknown, not false |
| Sponsor unit, HDFC/income-restricted | yes | facts | **no** (no intake field) |
| Building stories, units | yes | facts | **no** |
| Features (tags) | yes | views, private outdoor, unit type, central air, dishwasher, fireplace, laundry, the rest as finishes | views, outdoor, the four yes/no systems, laundry |
| Amenities (tags) | yes | doorman level, concierge, parking, shared outdoor (true/false), the rest | **no** (the Building picker is never filled) |
| Policies (tags) | yes | `policies`, lowercased | **no** |
| Photos | **no** | — | — |
| Exposure, corner, condition | not asked | corner lands in finishes | **no** |

For comps, `featuresFromRecord` (`workspace/features.ts:140`) fills only Outdoor, Views and Doorman. The raw tag lists are kept on every record (`record.tags`), so nothing needs a re-read to map more.

## NW-001 a: the link field

Today: placeholder "Paste the home's StreetEasy link, or type its address" (`src/views/newcomp/Home.tsx:63`). Once 3+ letters are typed, the match line says "typed in: you fill in its details next", which is right but late.
Do: change only the placeholder, keep the field. Proposed: "Paste its StreetEasy link to fill it in, or type the address and fill it in yourself". The same idea on Add comps' bar (`src/views/comp/AddBar.tsx:128`, "or start typing an address", which also reads like search).

## NW-002: what the target is

Today: one number, `TargetState.price` (`workspace/state.ts`). It never moves a figure: the engine evaluates it as a named price at the reveal (`workspace/engine-input.ts:223`), Findings draws one marker for it, Hubert never sees it (`server/assistant.ts:78`), the email never carries it.
Options:
- A. One number, said plainly. Buyer: "Most your client would pay". Seller: "Price you want to justify". Copy only.
- B. A range toggle. Touches the state, the named prices (two), Findings' marker (a band) and QA's agent figures. Needs a Findings design.
Recommend A now. A range doesn't change the math either way; if wanted, it goes to Claude Design with Findings (NW-064).

## NW-003: the target hint

Today (`Home.tsx:21`): "Hidden from Hubert, the assistant, so it can't steer the range. It's never in the email, and you can change it on Findings."
Proposed: "Hubert, the AI assistant, never sees this, so it can't sway his read of the comps. It's never in your client's email and doesn't change any number. Findings shows it against the range, and you can change it there."

## NW-004: the query string

Already stripped where it matters: `checkListingLink` (`workspace/links.ts:20`) runs every link through `parseStreetEasyUrl` (`engine/parser/property-key.ts:127`), which drops `?…` and `#…`, and `link_reads.url` refuses a query string (migration `20260930000000`). What Noble saw is the field keeping his pasted text.
Do: when a pasted link checks out, replace the field's text with `check.url` (step 1 in `Home.tsx` `HomeLineInput`, and `AddBar.tsx`). Then he sees it clean and stops doing it by hand.

## NW-005: when a report first saves (answer)

- **Nothing saves before Next on step 1.** Side, client, type and target are local state in `NewCompStart` (`src/views/newcomp/NewComp.tsx:29`). Closing the modal there leaves nothing behind. Side and type always have a value (Buyer, Co-op by default), so "after side and type are set" is effectively "on Next".
- **Next (or Enter) makes it.** "Starting the report…" shows while it runs: `POST /api/comp-report/reports` with the title and type, then one save of the brief (side, client), the typed address and the target, then the home's link is queued to read (`NewComp.tsx:43-75`).
- **From then on everything autosaves**, 500 ms after the last change, one save at a time, a failed save kept and retried, and leaving with a save outstanding asks first (`useAutosave`, `src/views/workspace/Workspace.tsx:52`). Steps 1 to 3 run over the workspace, so the modal saves as you type too. The home's read fills the details once and that saves the same way. Comps save through their own calls as they're added.
- Side effect: a report abandoned on step 2 or 3 stays in the list.

## NW-006: size when typed in

Today (`src/views/newcomp/Details.tsx:150`): with no size, it shows "Not listed" and "+ Add an estimate", and a value typed there is marked an estimate. That reads right after a link read that gave no size, wrong for a typed-in home.
Do: when there's no home read, show the size field open (the layout it already has once a size exists), the value not marked an estimate, with the existing Estimate toggle beside it. Keep "Not listed" only after a read that gave none.

## NW-008 a: private outdoor space

The home's and comps' "Outdoor space" means private (the engine's `outdoor_private`). Rename the group "Private outdoor space" in `FEATURE_GROUPS` (`workspace/features.ts:39`); stored values are keyed by `outdoor`, so nothing stored changes. Shared roof, terrace and courtyard go with the building (NW-009). The split itself is NW-008 b. `FeaturePicker` already takes `only` (`src/views/comp/Pickers.tsx:49`), so the build half of the split is cheap once it's designed.

## NW-009 a, NW-010, NW-039 a: the building's vocabulary

Today the Building group is six options (Doorman, Gym, Pool, Storage, Parking, Roof deck), not passed to the engine for the home. The read already returns the page's amenity and policy tags.
Do, as data in `workspace/features.ts`:
- Building amenities in StreetEasy's categories (Services and facilities, Wellness and recreation, Shared outdoor space, and whatever else the probe finds), mapped from the raw `amenities` tags.
- A Policies group (pets, smoking, and the co-op ones the probe finds: pied-à-terre, subletting, guarantors, gifting, financing), filled from `policies`.
- Each group marked `unit` or `building`, and which types it applies to (no concierge for a house), so the split and NW-039's "deciding fields first" can be drawn.
Keep the existing option labels: `cleanFeatures` drops unknown labels, so renaming one would lose stored picks on comps (`report_comps.features`). Adding is safe.
The category and value lists come from the same StreetEasy probe as NW-018. Until the design lands, new groups render as more rows in the existing picker.

## NW-011: fill every picker the read can

In `workspace/subject.ts` (home) and `featuresFromRecord` (comps), from what the read already has:
- Building: Doorman from `service.doorman`, Parking from `parking`, Gym, Pool, Storage, Roof deck from the raw amenity tags, shared outdoor from `outdoor_shared`.
- Corner unit from a "Corner unit" feature tag (today it lands in finishes).
- Policies (NW-010), neighborhood (NW-017 a), rooms (worth an intake field: co-ops price by rooms, factor 1 in `01-design.md`).
- Type: when the page's type differs from the report's, say so on the details with a one-tap switch. The type is picked on step 1 before the read, and the default (Co-op) can't be told from a choice, so don't overwrite it silently.
Condition and exposure aren't on the page as tags; they stay the agent's. Tests in `workspace/features.test.ts`.

## NW-012: condition scale

Today: Original, Updated, Renovated, Mint. The state already has CR-3's `good` and `needs_work` (`workspace/state.ts`), shown today as Updated and Original (`features.ts:83`), and the design of record's factor 8 scale is "Mint, renovated, good, original, needs work" (`01-design.md:1057`).
Do: Needs work · Original · Good · Updated · Renovated · Mint, low to high, with an ⓘ: "Original: never redone, as built. Good: well kept, not redone. Needs work: dated or worn, a fixer-upper or gut." Map `good` and `needs_work` to their own labels. Six chips is one row's width question for Design, but it ships in the current row.

## NW-013: year built

Already auto-fills when the page shows it (`subject.ts`, `fill('yearBuilt')`). The empty state is a bare "—" with no underline (`Details.tsx:200`, `.nr-year`). Give it the tile's underline and ✎, as Floor has.

## NW-015: notes

Hubert reads the home's notes (the whole intake goes into his summary, `workspace/summary.ts:113`); the email doesn't. Proposed ⓘ beside the label: "What someone would notice walking through that the facts don't say: light, views, layout, condition, noise, storage. Hubert reads it. Your client never sees it."

## NW-017 a: neighborhood

Comps already carry it from the export and the page (`record.neighborhood`); nothing shows it. For the home: add `neighborhood` to `Intake`, fill it in `homeFromListing`, a text field on the details, and it shows in step 1's match line ("Condo · Turtle Bay · …"). The Sort column and the home's line on Sort are NW-033 and NW-034 (Design); the data will be there.

## NW-018: property types (where it lives)

Two layers exist today:
- The report's type, `reports.property_type`, checked `condo | coop` (migration `20260925000000`, line 209), `ReportPropertyType` (`engine/types.ts:59`). It drives the math: a co-op shows no per-SF figure.
- A comp's type, `facts.property_type`: `condo | coop | condop | townhouse | multi_family | other` (`engine/types.ts:57`). The read also gets `sponsor_unit` and `income_restricted` (HDFC) as yes/no.

Options:
- A. Keep the report's type as how it's priced (condo or co-op), and add a "kind" on the intake for the label (HDFC, condop, townhouse, house), with sponsor unit and HDFC as flags. No migration, no engine change.
- B. Widen `reports.property_type` and the engine's report type, deciding how each new type is priced (a townhouse per SF? an HDFC as a co-op?). Migration, engine work, Abacus.
Recommend A: sponsor and HDFC are attributes of a co-op or condo sale, not types, and the pricing basis stays two. A townhouse or house waits on a pricing answer (NW-019).
NW-018 b, after the probe: ask the extract for the grey line's three parts, so "Resale" reads as `new_development: false` (today it's unknown) and the neighborhood comes from the same line.

## NW-020: photos

**What it takes (a):** small. The read doesn't ask for photos today (`server/links.ts:8`: "No photos are fetched or stored"). The carousel tools' import already gets them from the same Firecrawl call with two schema fields, `photos` and `heroImageUrl`, and a junk filter (`netlify/functions/streeteasy-import-background.mjs:27-41`). Do the same in `LISTING_EXTRACT_SCHEMA`, keep the URLs in `link_reads.extract` (it holds 256 KB), and show them in Sort's photo area (`src/views/sort/CompCard.tsx:172`) and on the home with a plain `<img src>`: display needs no proxy (only canvas needs `/api/img`). Bump `PARSER_VERSION`. Limits: only new reads get photos (a re-read costs credit and counts against the daily limit); exports and typed-in comps have none; the 100 Barclay sample has none.

**The email (b), for Kimani:**
- A. Link StreetEasy's own image URLs in the Designed email. It's what the design of record says ("listing photos linked, not hosted", `01-design.md:757` and `:883`). No storage. Risk: the images go blank when StreetEasy pulls or rotates them, which matters more for a sent email than a page.
- B. Store a copy in Blobs at copy time, served from a public, unguessable URL. Images last. It means a new public route outside the guarded paths, and it is hosting StreetEasy's photos, which the design ruled out.
Recommend A now, and revisit B only if blank images show up in sent emails.

## NW-019: floors

Waits on NW-018 a. When it comes, the data is already read: `building_stories` is a house's floor count. The Floor tile would read "Floors" for a townhouse.

## Questions for Kimani

1. NW-002: is the buyer's target the most the client would pay (Noble's instinct), or what they hope to pay? One number either way?
2. NW-018: keep two ways of pricing (condo, co-op) and add a type label with HDFC and sponsor as flags (A), or make townhouse and house real types with their own math (B)?
3. NW-020: photos in the Designed email linked from StreetEasy (A, the design of record), or copies hosted by Casa (B)?
4. NW-012: is "Good" the right word for the well-kept, not-redone unit, or "Well kept"? ("Like new" sits too close to Mint.)
