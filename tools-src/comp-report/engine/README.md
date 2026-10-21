# The comp report engine

Every number in every comp report comes from here. The assistant argues and writes; it never produces
a figure (design §4.1). This folder is the calculation engine and the StreetEasy export parser —
design §6, built under Dispatch 06 (CR-2).

It is plain TypeScript with **no DOM, no network and no clock**: dates come in as inputs, and the same
inputs always give the same output, byte for byte. The same module runs in the browser (so the range
moves the instant a comp is toggled) and in Netlify functions (so every stored version is computed
authoritatively), and both get the same answer — checked: an esbuild bundle in headless Chromium and
one in Node produce the same output hash.

**Version 0.4.1** — design v0.5, CR-2.2 phase 2: the engine for a buyer's argument. Didn't sell,
the mentors' checks, the differences between comps, the price table and the headline's facts.
0.4.1 adds each comp's `distance_miles`. 0.5.0 (CR-2.4) is the engine for Findings: the five-row
price table, no $/sqft gaps on a co-op, and gaps an agent can act on. Nothing here has been piloted yet.

---

## For Kimani and Noble — what it guarantees

- **Sold, in contract, active and didn't sell never share a statistic.** Each has its own $/sqft
  figures. Only sold comps make the base and the range; asks are shown against them, never averaged
  in, and an ask that didn't sell is a ceiling signal.
- **The mentors' checks suggest; the agent decides.** Kara's rules flag each comp (first floor,
  outdoor space on one side, a sale past six months …) with a suggested tier and the facts behind
  it. A flag never changes a tier and never moves a number.
- **The differences between comps are evidence, never values.** Two comps apart in one factor are a
  clean pair, and their gap is shown as what that factor adds here. No gap is ever applied.
- **A headline cites only the headline's facts:** each a number with its provenance, for QA to match.
  The agent's own number is kept apart from what the assistant sees.
- **It never returns StreetEasy's blended figures.** StreetEasy's report for 100 Barclay #17L
  headlines "Average sale price $4,535,000" (closed sales and asking prices averaged together) and a
  "$2.2M–$6.0M range" (the cheapest home to the dearest, every status). A test rebuilds both from
  the raw export and proves the engine never outputs either, in any configuration.
- **A range, never a point.** The range runs from the lowest to the highest value implied by the
  agent's *primary sold* comps. One comp can't make a range, and nor can comps that all imply the
  same value; the engine says so instead.
- **No invented numbers.** The adjustment catalog has all 39 factors, and **every magnitude is null**
  until Noble sets it. A factor that applies but has no value shows as *considered — value not yet
  determined* and moves nothing. A file of test values exists only to check the arithmetic, and the
  engine refuses to load it anywhere but a test run.
- **Two results, side by side.** *On the facts* uses what's exact or marked approximate at source.
  *With estimates* adds the agent's rough figures and their adjustment values. The gap between them
  shows how much the answer rests on guesses. Anything uncertain from a listing or from Jev counts in
  neither until the agent confirms it.
- **Everything missing is said, not assumed.** No subject area → no $/sqft value for the subject, and
  a gap saying so. No floor on a comp → that comparison is marked unknown.
- **Every figure says where it came from** — computed by the engine, as of the analysis date, as sure
  as its weakest input, and how it was worked out.
- **Every result is pinned**: the engine version, the house-method version and its hash, a hash of
  the inputs and a hash of the output. A stored version can be recomputed and checked.
- **School zone never moves a number.** It's a recognised steering signal, so it's analyst view only
  (§14): the engine compares it and shows it to the analyst, but applies no value for it — the house
  method's or the agent's.
- **A missing tag counts, but only as approximate.** A comp whose listing tags name no terrace reads
  as having none, so an agent's terrace value can apply to it. But a listing agent types those tags
  and may leave one out, so the comparison and everything it feeds are marked `approx`.

What it does not do: set a tier (it suggests, from the mentors' rules), judge what only a person
can — condition, light, layout — or read listing text (that's Jev and the assistant); co-ops beyond
switching $/sqft off everywhere; rent credits, deposits over time,
closing timelines (full offer modelling comes later); any rent or yield figure — the export carries
no rent data, so the engine cannot produce one.

### What Hannah's export gives, through the engine

| Figure | Engine | StreetEasy |
|---|---|---|
| Sold $/sqft, all five: mean / median | $1,906.12 / $2,112.68 | $1,906 (mean only) |
| Sold $/sqft, floor 10 and up: mean | $2,279.88 | — |
| In contract $/sqft (ask basis): 101 Leonard · 25 N Moore · 108 Leonard | $1,625.34 · $2,387.15 · $2,400.70 | 1,625 · 2,387 · 2,400 |
| Active $/sqft (ask basis): 77 Reade · 111 Murray | $2,763.95 · $3,091.80 | 2,763 · 3,091 |
| Sale-to-last-ask: 200 Chambers · 181 Hudson · 5 Franklin · 66 Leonard | −3.0% · +12.3% · −4.0% · −4.2% | "100% — selling at asking" |
| Sale-to-last-ask, median / mean | −3.5% / +0.3% | — |
| Sold days on market, mean | 114 (four listings) | 91 (counts the closing's 0 as a real zero) |
| "Average sale price" | never computed | $4,535,000 (sales and asks mixed) |
| "Estimated range" | lowest–highest implied value among primary sold comps | $2.2M–$6.0M (every status) |

### Displaying $/sqft

The engine returns exact values (`2112.676…`). **StreetEasy truncates** to whole dollars, and the
figures in the design are truncations too. To match what agents and clients see from StreetEasy,
display $/sqft **truncated**, not rounded — rounding would show the sold median as $2,113, the floor
10+ mean as $2,280 and 108 Leonard as $2,401. Money is always whole dollars; percentages are in
percent (−3.02 means −3.02%) and read naturally to one decimal. Rounding prices to three significant
figures for clients is presentation, done outside the engine (§6.1).

---

## Using it

```ts
import { compute, compInputsFromExport, identify, parseExport } from '../engine/index.ts';

const parsed = parseExport(fileBytes, { as_of: '2026-09-23' });        // CSV or XLSX, detected
const comps = compInputsFromExport(parsed, { tier: 'primary' });       // then the agent tiers each one
const out = compute({
  as_of: '2026-09-24',                                                 // the analysis date
  property_type: 'condo',
  subject: {
    identity: identify({ address: '100 Barclay Street, New York, NY', unit: '#17L' }),
    facts: { area_sqft: { value: 2000, source: 'agent', as_of: '2026-09-24', confidence: 'exact' } },
  },
  comps,
});
out.results.on_facts.base;       // { value: 4225352, unit: 'usd', confidence: 'approx', … }
```

- **Imports.** Import from `engine/index.ts`. Relative imports carry their `.ts` extension and the
  house method is a JSON module (`with { type: 'json' }`), so Node runs the files directly and Vite
  and esbuild bundle them unchanged — checked with Vite 8.3 and esbuild 0.25. A TypeScript config
  that type-checks the engine needs `allowImportingTsExtensions` (with `noEmit`) and JSON modules,
  which `moduleResolution: "bundler"` turns on; the comp report's own `tsconfig.json` (CR-1) takes it
  as it is — checked with TypeScript 7.0.
- **No dependencies.** The engine imports nothing outside this folder — not even for XLSX, which it
  reads with its own small ZIP, DEFLATE and XML readers.
- **Tests:** `npm run test:engine` (Node's built-in runner, no build step). **Type check:**
  `npm run typecheck:engine` — the engine is checked with no DOM or Node types, so neither can creep
  in; the tests are checked separately with Node's.
- **Errors.** `parseExport` throws `ParseError` for an empty file or a bad `as_of`; XLSX problems
  (corrupt, encrypted) throw with a clear message. `compute` throws `EngineInputError` — listing every
  problem at once — for a malformed input (a non-integer price, an unknown factor, two comps with one
  id). Data that's merely missing is never an error; it's a gap in the output.

---

## The parser

`parseExport(bytes, { as_of, filename? })` → `ParsedExport`. Also `parseCsvExport(text, …)` and
`parseXlsxExport(bytes, …)`. `as_of` is the date the export was pulled — every value's as-of date.

- **Columns are found by header name, never position** — case, spacing and known alternative names
  don't matter ("Bedrooms" is Beds, "List Price" is Listing Price). A shuffled export parses
  identically. **Unknown columns are kept** on each comp (`extra_columns`) and reported; **missing
  ones are warnings** that say what the gap costs. "Year Built" is recognised if a variant carries it.
  The header row is the one that names the most known columns, so a title line above it is skipped.
- **Values:** `"$4,650,000"` → 4650000; `"2,201 ft²"` → 2201; a leading `~` (`"~1,840 ft²"`) marks
  the value **approximate**; `"8/27/2026"` → `2026-08-27`; XLSX numbers and date serials read directly
  (including 1904-dated workbooks). A figure written like `"$4.65M"` is read but marked approximate.
  **The parser never emits a value `compute()` would refuse** — both check facts against the same
  `FACT_CHECKS`. A $0 sale price (usually a non-market transfer) or $0 ask is read as no price
  (`zero_price`); anything else out of bounds, such as a building of 0 units, is read as missing
  (`unreadable_value`). Each is warned; none stops the report.
- **The export's `$/Sqft` column is never used.** StreetEasy switches it from sale price to asking
  price by status and truncates it. It's kept on each comp (`ignored_export_price_per_sqft`) for
  audit; the engine recomputes $/sqft itself, with its basis.
- **Public-record closings** (`/closing/` links, like 79 Laight #1A) are flagged. They have no ask,
  no days on market, no engagement, no features — their zeros are read as "no data", not zero.
- **Tags:** Home Features, Building Amenities and Building Policies are split on `;`. From them:
  views; private outdoor space (**presence and kind only — the export has no size**); shared outdoor
  space; service level (doorman full-time, part-time, virtual, hours not stated, none listed; and
  concierge); parking (garage, valet — deeded or not can't be told); unit type (loft, duplex,
  triplex, penthouse); factor 9's systems — central air, dishwasher, a working fireplace (gas
  counts; decorative doesn't) and in-unit laundry (`installed` for a washer/dryer tag, `permitted`
  for "washer/dryer allowed"; laundry in the building is an amenity); and the
  remaining finishes and amenities. A blank tag column tells nothing, so nothing is derived
  (unknown). **A column with tags but none of a kind is "none listed"** — an empty list, `false`, or
  `none_listed` — **with confidence `approx`**, because a listing agent types the tags and may leave
  one out (§6.2). A tag that is there is `exact`. Service is `exact` only when both a doorman and a
  concierge are listed. The note says which, and the agent can correct it. A penthouse suggested
  only by a unit label ("#PHA") goes in the
  record's `suggestions` as *inferred*: it waits for the agent to confirm, and the Home Features'
  exact unit type stands meanwhile. `deriveFromFeatures` and `deriveFromAmenities` are exported, so
  the app can build a subject's facts from listing tags exactly as the parser builds a comp's.
  Tags compare without regard to case or spacing, and "City views", "city view" and "City" are one
  view.
- **Encoding:** UTF-8, or Windows-1252 when Excel has re-saved the file (warned).
- **Stable property key** — design §12 — so a property's records accumulate across imports:
  `pk1|<state>|<city>|<street>|<unit>`, e.g. `pk1|ny|new york|200 chambers st|10A`. Streets are
  normalised ("Fifth Avenue" and "5th Ave" → `5 ave`; "North Moore Street" → `n moore st`; "Avenue of
  the Americas" → `6 ave`), units too ("Apt 10-A" → `10A`, "Penthouse A" → `PHA`). The StreetEasy link
  is kept without its query string (the export's share token is dropped), with any listing or closing
  id. `pk1` is the rule set's version: a change to the rules gets a new prefix, never a silent re-key.
  `identify()` builds the same identity for a subject entered by hand; `sameBuilding()` tolerates a
  missing city.

**`ParsedExport`:** `parser` (`version`, `schema`) · `format` (`csv` / `xlsx`) · `as_of` ·
`filename` · `columns` (`mapped`, `unknown`, `missing`) · `comps` (below) · `warnings`.

**Each comp record (`CompRecord`):** `identity` (key, building key, address, unit, StreetEasy link and
ids) · `status` (`raw`, `evidence_class`, and `listing_status` for a link or a typed-in comp — below)
· `facts` (every value sourced — below) · `engagement` (page views, saves, shares — context only,
never a valuation input; null for closings) ·
`building_name` · `neighborhood` · `agent_commentary` · `tags` · `ignored_export_price_per_sqft` ·
`flags` (`closing_record`, `approx_area`) · `origin` (parser version, row, as-of date, and `via`:
`export`, `listing` or `manual`) · `extra_columns` · `suggestions` (inferred values for the agent to
confirm, each `{ field, value }`; a stated fact or the record's own value always wins over one) ·
`listing` (a link's comp only — below).

**Parse warnings** (`code`, `message`, `row?`, `column?`): `missing_column`, `unknown_column`,
`duplicate_column`, `renamed_column`, `unreadable_value`, `value_adjusted`, `zero_price`,
`closing_record`, `approx_area`, `unrecognised_status`, `missing_address`, `duplicate_property`,
`ragged_row`, `encoding`, `file_note`, `no_rows`; and for links and typed-in comps, `off_market`,
`rental_listing`, `not_a_listing`, `status_conflict`, `partial_address`.

### Comps from a StreetEasy link, or typed in (§6.2)

Many agents add comps one listing at a time, and Kara never uses StreetEasy's comps generator. So
there are three ways in, and all three make the same `CompRecord`.

**From a link.** The server reads the page with Firecrawl, passing `LISTING_EXTRACT_SCHEMA` and
`LISTING_EXTRACT_PROMPT`. It hands the extract to `compRecordFromListing(extract, { as_of, url })`,
which returns `{ record, warnings }`.
- **The schema asks for text, not numbers.** Every value is copied as the page shows it
  (`"$4,650,000"`, `"~1,840 ft²"`, `"Aug 27, 2026"`) and left empty when the page doesn't show it. The
  engine reads them with the export's own readers, so a figure is typed by rules, not by the model
  that read the page.
- **Every value is `inferred`** (source `listing`), because reading a page can misread it. The comp
  counts in **neither result** until the agent confirms the row in one tap.
  `confirmListingRecord(record)` returns a new record with each value `exact`, or `approx` where the
  page marks it approximate or lists none of a kind. A guess beyond the page, such as a penthouse
  from a "PH" label, stays pending.
- **Nothing missing is guessed.** No size comes from rooms. A unit label that reads cleanly as a floor
  (`10A` → 10, `1004` → 10) gives a floor *suggestion* when the page has none: `inferred`, noted "from
  the unit label", and pending until the agent confirms it, like the "PH" penthouse suggestion. `G`,
  `R1`, `PHA` and bare letters give none. The export and a typed-in comp get the same suggestion, so
  101 Leonard #5B's missing floor now comes with a suggested 5 — still in neither result.
- **The key is the export's.** A comp added by link and by export is one property. The city and
  state come from the page, or failing that from the link's building slug (`…-new_york/10a` means New
  York, NY). Without either, a `partial_address` warning says the key won't match an export's.
- **The status** comes from the page's label, or its history where the label is missing. A recorded
  sale wins over an "off market" label (`status_conflict`). A relisting starts a new listing period,
  so an old sale doesn't make a relisted home sold. A rental page is flagged (`rental_listing`), and
  so is a link that isn't a sale listing (`not_a_listing`).
- **The page's history fills blanks,** with a note: the original ask, the list date, the contract
  date, the last ask, and a sale's price and date. A sale price on a page that isn't sold is an
  earlier sale, and it's left out.
- **`record.listing`** holds what only the page gives: `url`, `confirmed`, `on_confirm` (the input
  confidence each value takes on confirmation), `history` (oldest first: `date`, `event` as worded,
  `kind`, `price`) and `description`.
- **Warnings use the export's codes** where they overlap: `unreadable_value`, `value_adjusted`,
  `zero_price`, `approx_area`, `closing_record`, `unrecognised_status`, `missing_address`. Blank
  markers ("n/a", "—") are blanks.
- **The home itself can come from its link** the same way. Its `record.identity` is the subject's
  identity. Once the agent confirms the details, `confirmListingRecord(record).facts` are the
  subject's facts.

**Typed in.** `compRecordFromManual(fields, { as_of })` takes the address (with or without the unit),
the status, the price, size, floor and date, and optionally beds, baths, property type and the
monthly charges. Values are numbers or text as typed.
- **It's the agent's record:** source `agent`, `exact`. A value given as
  `{ value, estimate: true }` is `guesstimate`, so it counts in "with estimates" only.
- **`price`** is the sale price for a sold comp and the asking price otherwise.
- **`date`** is the closing date (sold), the contract date (in contract, and `contract_date` too), the
  listing date (active, and `list_date` too), or the day it came off the market.

**Didn't sell is the fourth evidence status** (D-23). A listing that came off the market unsold has
`evidence_class: 'off_market'`, read from a link's status or its history, or typed in. Its price is
its last ask, and its status date the day it came off. The export doesn't carry it: the export's
statuses stay sold, in contract and active. A record from parser 0.3.0, which kept it only as
`status.listing_status`, reads the same.

**New facts from links:**
- `original_list_price`, `list_date` and `contract_date`
- `rooms`, where halves are allowed
- `new_development`, `sponsor_unit` and `income_restricted` (HDFC and the like)

The comparability checks read the three flags, and the recency rules read the contract date. Those
three flags are "yes" or unknown, never "no" by omission, because a page that doesn't mention
sponsorship says nothing about it. `coordinates` (`{ lat, lng }`) is a fact for the distance check;
neither the export nor a page gives it.

---

## The engine's input

`compute(input, options?)`. `options.houseMethod` defaults to production; `options.mode` is `report`
(default) or `what_if`.

### Sourced values

Every fact is `{ value, source, as_of, confidence, note? }` (§6.1). `source` is `se_export`,
`se_pdf`, `listing`, `agent`, `hypothetical` or `engine`. Money is whole dollars, areas whole square
feet. How confidence routes a value:

| Confidence | Meaning | On the facts | With estimates |
|---|---|---|---|
| `exact` | as its source states it | ✓ | ✓ |
| `approx` | marked approximate at source (`~1,840 ft²`) | ✓ | ✓ |
| `guesstimate` | the agent's estimate | — | ✓ |
| `inferred` | from listing text or a Jev judgment, unconfirmed | — (pending) | — (pending) |

A `hypothetical` value is used only in `what_if` mode, where the whole output is a what-if.

### Fields

- **`as_of`** — the analysis date (`YYYY-MM-DD`). Ages and recency windows are measured to it.
- **`property_type`** — `condo`, or `coop` (the same engine with $/sqft switched off, §6.3).
- **`subject`** — `identity` (from `identify()`) and `facts`.
- **`comps`** — each `{ id, record, tier, tier_reason?, anchor? }`. `id` must be unique; the
  property key is the natural choice (`compInputsFromExport` uses it). `tier` is `primary`,
  `secondary` or `excluded` — only primary comps enter statistics. At most one comp is the
  `anchor`: the single most comparable sold comp.
- **`method`** —
  - `lead: { indicator, reason? }` — which indicator makes the base. Default: the median (unit rate
    for condos), labelled as the default, pending Noble.
  - `recency: { months } | { since }` — each comp counts only if its market date falls inside the
    window: a sale's contract date where a listing's history gives one (when the price was agreed),
    else its closing date; an in-contract comp's contract date; a didn't-sell comp's last day on
    the market. Active listings are exempt: an ask is current evidence. A method setting, so it
    applies to both results; a comp with no date to test is left out and says so, and one outside
    says which date it used. The export gives sold comps only their closing date, so an export sale
    reads fresher than it was by the contract-to-close lag (§6.5); a comp added by link doesn't.
  - `narrowing: { low?, high?, reason, as_of }` — the agent narrowing the range: a low, a high or
    both. It carries a number, so it's the agent's estimate: "with estimates" only, and it must sit
    inside the comps' bracket.
- **`stated_facts`** — `{ id, target: 'subject' | { comp_id }, field, value }`: a fact the agent
  gives ("the terrace is 400 sq ft"). It beats the export. The latest statement wins (by `as_of`;
  on the same date, the later one in the list). If it contradicts the export, the agent's value is
  used and a `contradiction` warning is raised — trust but verify (§2).
- **`assessments`** — a judgment that a comp differs from the subject on a factor:
  `{ id, comp_id, factor, facet?, direction, degree?, source, confidence, probability?, as_of, note? }`.
  `direction` is `comp_superior`, `comp_inferior`, `similar` or `differs`; `degree` is `small`,
  `moderate` or `large`. From Jev, its fallback or the agent. It carries no number. `confidence` is
  the input confidence (Jev's are `inferred` until the agent confirms); `probability` is Jev's
  judgment confidence (§7.1), a calibrated probability. A judgment that agrees with the engine's
  comparison, or settles a "differs" it left open, rests on the same facts, so it's as sure as they
  are. One that overrides them stands alone. A factor with several lines needs its `facet`.
- **`agent_adjustments`** — the agent's value for a factor ("add 5% for the terrace"):
  `{ id, factor, facet?, value, comp_ids?, reason?, as_of }`. Lands in "with estimates" only. **A
  value is a magnitude; the comparison supplies the direction**, so a negative one is refused — to
  say which side is better, record a judgment (an assessment). The one exception is the market's
  monthly movement (`recency_market`), which can fall. `value` is one of:
  - `{ percent }` or `{ dollars }` — per comp that differs, signed by the comparison: a comp without
    the terrace moves up, one with a better terrace moves down, one where it can't be told which is
    better doesn't move (and says why). Percent is written as percent: `5` means 5%.
  - `{ percent_per_unit }`, `{ dollars_per_unit }` — for per-unit factors: floor, bedrooms,
    bathrooms, months of market movement.
  - `{ elasticity }` (interior size), `{ multiplier }` (carrying costs), `{ weights }` (outdoor space
    by kind) — the factor's own shape.
  - `comp_ids` limits it to named comps.

  Where the agent's value can't apply to a comp (outdoor weights where the outdoor sizes aren't
  known, say) and the house method's can, the house method's is used and the line says so: "with
  estimates" is the facts plus the estimates, never less. A value for school zone is recorded, never
  applied, and raises `analyst_only_factor`.
- **`prices`** — prices the agent names: `{ id, label, kind, price }`, `kind` one of `list`,
  `offer`, `target`, `call`, `what_if`, `other`. **Evaluated against the results; never an input
  to them** — a test proves adding a target or the agent's call changes no result.
- **`financing`** — the optional monthly cost estimate: `price` (`'base'` or `{ named_price_id }`),
  `down_payment` (`{ percent }` or `{ dollars }`), `annual_rate_percent` (6.25 means 6.25%),
  `term_years`, `interest_only?`, `insurance_monthly?`, `other_ownership_costs_monthly?`.
- **`deal_terms`** — the intake module (§6.7): `template` (`buyer_traditional`,
  `buyer_rent_to_own`, `seller_pricing`), `price?`, `deposit?`, `financing?`, `target_closing?`,
  `interim_rent?` (`monthly`, `credit_percent?` 0–100), `seller_target?`, `timing?`, `flexibility?`.

---

## The output — every field

Figures the engine computes are a **`Figure`**: `value`, `unit` (`usd`, `usd_per_sqft`, `percent`,
`days`, `usd_per_month`, `usd_per_sqft_per_month`, `sqft`), `source: 'engine'`, `as_of` (the
analysis date), `confidence` (its weakest input's) and `derivation` (how, in words). A **statistic**
(`StatSummary`) is `n`, `comp_ids`, and `median`, `mean`, `min`, `max` as Figures. Values taken
straight from an input stay sourced values.

### `meta`

`engine_version` · `house_method` (`id`, `kind`, `version`, `hash`, `all_null`) · `property_type` ·
`as_of` · `mode` · `parser_versions` (of the imports the comps came from) · `inputs_hash` · 
`output_hash`. Both hashes are `sha256:` over canonical JSON. `inputs_hash` covers the whole input
plus the engine version, the house-method hash and the mode, with comps in id order (their order
carries no meaning). `output_hash` is over the output with `output_hash` set to `""`;
`verifyOutputHash(output)` checks it.

### `subject`

`identity`, and `facts.on_facts` / `facts.with_estimates` — the value each result used for each
field, with its provenance.

### `comps[]` — every comp, including excluded ones

- `id`, `identity`, `building_name`, `evidence_class` (the evidence status: `sold`, `in_contract`,
  `active`, `off_market` — didn't sell), `status_raw`, `basis` (`sale` for sold, `ask` otherwise),
  `tier`, `tier_reason`, `anchor`.
- `flags`: `closing_record`, `approx_area`, `area_missing`, `price_missing`, `floor_missing`,
  `same_building_as_subject`, `same_unit_as_subject`, `property_type_mismatch`,
  `unrecognised_status`, `outside_recency_window`, `off_market` (didn't sell),
  `unconfirmed` (a link's row the agent hasn't confirmed: it counts in neither result).
- `status_date`, `age_days` (to the analysis date), `days_on_market`, `sale_to_ask_percent` (sold
  comps with a last ask: sale ÷ last ask − 1), `engagement`.
- `market_date` — the date its price speaks for, and which date that is (§6.5): `date`, `basis`
  (`contract_date` — a sale's where a listing's history gives one, or an in-contract comp's;
  `closing_date`; `list_date`; `off_market_date`) and `age_days`. On the facts.
- `checks` — the mentors' comparability checks (§6.10); see below. They never change `tier`.
- `distance_miles` — miles from the home's building to the comp's, from the `coordinates` on both
  sides (each building's mapped location); null without both. It's there for every comp, flagged or
  not, unrounded, and it's the very number the `distance` check measures, so a row and its flag
  never disagree. A comp in the home's building is 0.
- `per_result.on_facts` and `per_result.with_estimates`, each:
  - `included`, `not_included_because` — whether it counts toward this result's statistics, and if
    not, why (tier, status, like for like, recency window).
  - `price` (sale price for sold, ask otherwise), `area_sqft`, `price_per_sqft`,
    `no_unit_rate_because` ("no interior area — it can't give a $/sqft" for 100 Barclay #11F; for
    every comp in a co-op report, that co-ops don't use $/sqft).
  - `comparisons` — factor by factor: `line`, `factor`, `facet`, `name`, `status` (`compared`,
    `unknown`, `pending_confirmation`), `direction`, `degree`, `units` (the difference, signed so
    positive means the comp is worse: subject minus comp for sqft, bedrooms, bathrooms and floors;
    comp minus subject for $ of monthly carry; for recency, the comp's age in months from its market date), `unit_label`,
    `source` (`engine`, `jev`, `fallback`, `agent`), `confidence`, `basis` (in words), `missing`
    (each `{ side, field, label }` — exactly what to ask for). Tags compare without regard to case or
    spacing. A judgment's direction wins over the arithmetic's sign for every shape.
  - `adjustments` (sold comps) — each line: `status` (`calculated`, `agent_estimate`,
    `considered_not_calculated`), `dollars` (signed: + moves the comp up toward the subject),
    `percent_of_price`, `applied` (false when a substitute took the larger), `superseded_by`,
    `applies_to_unit_rate`, `source` (`house_method` / `agent`), `agent_adjustment_id`,
    `why_not_calculated`, `basis`, plus `direction`, `degree`.
  - `adjusted_price` — sale price plus applied adjustments. `adjusted_price_per_sqft` — the same,
    interior size aside, over the comp's area. `implied_value` — that $/sqft × the subject's area.
    Each is as sure as what its applied adjustments rest on — the comparison's inputs, and a
    guesstimate for an agent's value. A comp adjusted to zero or below is left out of the indicators
    (`adjusted_value_not_positive`).
  - `monthly_carry`, `carry_per_sqft` (condos only).
  - `ask_vs_sold` (in contract, active and didn't sell) — `position` against the sold band (`below`,
    `within`, `above`) and `versus_sold_median_percent`. For didn't sell, it's a ceiling signal: an
    ask the market didn't meet.

#### `checks[]` — Kara's rules, as flags (§6.10)

Each check is `code`, `status` (`flagged`, or `unknown` when it can't be told yet), `label` (a few
words for the row, and a seed for the notes' quick-pick chips), `message`, `suggested_tier`
(`primary`, `secondary`, `excluded` — the words on the screen are Primary, Secondary, Excluded, D-20
— or null when the rule only notes something), `suggestion` (in words), `evidence` (each fact it read:
`side`, `field`, `value`, `source`, `confidence`, `note`), `confidence`, `threshold` (`name`, `value`,
`unit`, and whose rule it is) and `measured`.

| `code` | Flags a comp when | Suggests |
|---|---|---|
| `same_building` | it's in the home's building ("the home itself" for an earlier sale of it) | Primary, and a candidate for the closest comp |
| `first_floor` | it's on floor 1 or below and the home isn't | Excluded, unless nothing else |
| `private_outdoor_one_side` | one side has private outdoor space and the other doesn't | Excluded: never compare |
| `new_development_vs_resale` | one side is marked new development and the other isn't | Excluded |
| `property_type_differs` | it's a co-op in a condo report, or the reverse | Excluded (it's out of every statistic anyway) |
| `income_restricted` | one side is marked HDFC or income-restricted and the other isn't | Excluded |
| `sponsor_unit` | it's a sponsor sale and the home isn't | Secondary, with the note |
| `sale_age` | its market date is over 3 months old (noted), 6 (old for a comp) or 12 (the market has moved); not active listings | Secondary past 6 months |
| `size_far_off` | it's more than 25% bigger or smaller than the home | Secondary |
| `floor_far_off` | it's more than 3 floors from the home's (not a first floor, which has its own flag) | Secondary, with the note |
| `distance` | it's over ¼ mile away (noted) or over ½ mile (far for Manhattan), from coordinates on both sides | Secondary past ½ mile |

- **Checks read the best value there is,** confirmed or not, so a row is flagged as it lands. A flag
  resting on a value that waits for the agent's confirm is `inferred`, and its message carries that
  value's note: *"First floor: a different product — the home is on floor 17 (its floor is inferred:
  from the unit label 1A — confirm the floor)"*.
- **A side that doesn't say reads as "not marked".** A resale page never says "resale", so a
  new-development comp against a home with no mark is flagged "the home isn't marked as one", and
  `approx`. A lack of outdoor space that rests on a listing naming none is `approx` too.
- **Distance says so without coordinates.** Neither the export nor a page gives them; the workspace
  adds each building's mapped location (Dispatch 11). A comp without coordinates on both sides
  carries a `distance` check with status `unknown`, saying which side lacks them, and a null
  `distance_miles`.
- **A check never changes a tier or moves a number.** The thresholds come from the house method
  (below); other thresholds change the flags and nothing else.

### `results.on_facts` and `results.with_estimates`

- `kind`, `label` ("On the facts", "With estimates").
- `evidence.sold`, `.in_contract`, `.active`, `.off_market` — each: `basis`, `counts` (`total`,
  `primary`, `secondary`, `excluded`, `included`, `with_unit_rate`), `price_per_sqft` (null for
  co-ops) and `price` statistics over its included comps. **One class per statistic, always.** Didn't
  sell is on ask basis: its last ask. In "with estimates", a class whose membership an estimate
  changed (an estimated sale date moving a comp out of the recency window, say) has its figures
  marked `guesstimate`.
- `indicators.unit_rate` and `indicators.adjusted_price` (§6.3) — each family has `status` (`off` for
  co-ops), `reason`, and three indicators — `median`, `mean`, `anchor` — each with `id`, `label`,
  `status`, `reason`, `per_sqft` (unit-rate family), `implied_value`, `n`, `comp_ids`. Unit-rate
  indicators are $/sqft over primary sold comps (adjusted by any applied adjustments, interior size
  aside) times the subject's area. Adjusted-price indicators are the comps' adjusted prices.
- `lead` — `indicator`, `chosen_by` (`default` / `agent`), `label`, `reason`.
- `base` — the lead indicator's implied value, or null (see `gaps`). **No silent fallback** to
  another indicator.
- `bracket` — `low`, `high`, `comp_ids`: the lowest and highest implied values among primary sold
  comps, in the lead's family (§6.5).
- `range` — the bracket, or the agent's narrowing of it ("with estimates" only): adds `narrowed`,
  `narrowing_reason`. `range_unavailable_because` when there isn't one — fewer than two primary sold
  comps give the lead indicator, or they all imply the same value (a range is never a point).
- `bridge` — from the unadjusted lead value to the base: `family`, `start`, `end`, `note`, and
  `lines`, one per factor that differs for any primary sold comp, in catalog order, plus interaction
  lines. Each line: `kind` (`factor` / `interaction`), `id`, `name`, `factor`, `facet`, `status`,
  `label` ("value not yet determined", "agent's estimate", "house method"), `client_visible` (false
  for school zone — analyst view only, §14), `comps` (direction, degree, units, dollars, applied,
  status, reason per comp), `effect_on_base` (the base with the line less the base without it, as
  sure as the lines it rests on) and, for interactions, `interaction` (relationship, why, members).
  With a median, effects needn't add up to the total.
- `sale_to_ask` — sale-to-last-ask, a statistic over included sold comps. `days_on_market` — per
  class; closings excluded. `asks_vs_sold` — `sold_band` (low, median, high sold $/sqft); for in
  contract, active and didn't sell, the class median ask $/sqft and how far it sits from the sold
  median; and `ceiling` — the lowest ask that didn't sell (`lowest`, `comp_id`, its `position`
  against the sold band, `versus_sold_median_percent`), the tightest ceiling signal. All null for
  co-ops.
- `carry` — `subject`, `subject_per_sqft`, `comp_median`, `comp_median_per_sqft`, `comp_ids`,
  `subject_vs_median_percent`. Carry isn't price evidence, so the median runs across all statuses.
  The per-sqft figures are null for co-ops.
- `price_table` (§6.5) — the home's price at $/sqft steps across the range, as in Frankie's email:
  `rows` (each `per_sqft` and `price` as Figures, `kind` — `comp`, `step` or `range_end` — and
  `comp_ids`), `increment`, `low`, `high`, `subject_area`, `basis`. The steps are the primary sold
  comps' own $/sqft, which include both ends of the range, and round steps between them. The round
  step is the largest of $5, $10, $20, $25, $50, $100, $200, $250, $500 … that's no more than 2.5% of
  the low end ($20 at $880, as Frankie steps). It widens until at most ten steps fall inside, and
  narrows until at least two do. Each row's price is the home's size × the step, so a comp's row is
  its implied value, and the first and last rows are the range. With the agent's narrowing ("with
  estimates"), the table spans the narrowed range and its ends are `range_end` rows. When the lead is
  an adjusted price, it spans the same comps' $/sqft and says so. `price_table_unavailable_because`
  when there's none: a co-op, no interior size for the home, fewer than two primary sold comps with a
  $/sqft, or all at one rate.
  - `five_rows` (0.5.0, NW-065 a) — the same span in five evenly spaced rows, for Findings: `step`
    (`low`, `quarter`, `middle`, `three_quarter`, `high`), `per_sqft`, `price`, `comp_ids`. Low and
    high are the span's ends, named by their comp (no comp for a narrowed end), and their prices are
    the range's ends exactly. The three between are low + ¼, ½ and ¾ of (high − low), each rounded to
    the whole dollar, times the home's size. The middle is the midpoint, not the median comp: the base
    stays the median. The email, the writer and QA still read `rows` until NW-065 b is decided.
- `pairs` (§6.6) — the differences between comps. Evidence only: nothing here moves a number.
  - `pairs[]` — every included comp against every other of its status, sold first, then in contract,
    active and didn't sell. Each: `evidence_class`, `basis`, `higher` and `lower` (by $/sqft where
    both have one, else by price: `ordered_by`), `price_gap` and `price_per_sqft_gap` (the higher
    less the lower, as Figures), `same_building`, `months_apart` (between their market dates),
    `differences` (each `line`, `factor`, `facet`, `name`, `direction` — `higher_better`,
    `lower_better`, `differs` — `difference` for numeric lines as the higher's value less the
    lower's, `unit_label`, `confidence`, `basis` naming both comps), `alike`, `unknown` (lines one
    side lacks the data for, with what's missing), `clean`, `isolates` and `not_clean_because`.
  - **Clean** means one factor differs, or only the members of one A.5 overlap group — floor and
    views, say, or a penthouse with its floor, outdoor space and views. Two comps in one building
    share its building and location factors, so those lines are alike for them however the listings'
    tags were typed. Sales within the house method's "old for a comp" months (6) of each other aren't
    counted apart in time; past that, time is a difference. Active asks are never apart in time. A
    pair where nothing the engine compares differs isn't clean: its gap lies in what it can't
    compare.
  - `clean_pair_evidence[]` — per status and per factor or group: `n`, `pairs`, `per_sqft_gap` and
    `price_gap` (`n`, `median`, `min`, `max`) from the side with more or better of it, `undirected`
    (pairs where which side is better takes a judgment), and `summary` — *"Outdoor space: about
    $150/sq ft, from 1 clean pair"*. For time, the gap is the later sale less the earlier: the
    market's movement.
  - `not_compared` — the factor lines only a judgment compares (condition, layout, light …): every
    judgment is of a comp against the home, so pairs can't compare them, and a clean pair is clean
    on the facts. `note` says all this in a sentence.
- `estimates_used` — ("with estimates") every agent estimate this result used — stated
  guesstimates, agent adjustment values, rough judgments, the narrowing — each `{ kind, id, target,
  what, note }`. This is what client copy must disclose when it uses this result (§9.5). It lists an
  estimate that took a comp out of this result (its type, its sale date) as well as one that moved a
  figure, and an agent's adjustment value only where it's applied (not superseded by a substitute)
  and counts toward the lead's family — an interior-size value, which a unit-rate lead sets aside,
  isn't listed.

### `headline_facts.on_facts` and `headline_facts.with_estimates` (§10.2)

The only figures a headline may cite, per result. The report builds to one sentence — *"The three
closest sales put #517 at $880–$925 a square foot — about $640K–$670K"* — and QA's numeric grounding
(CR-5) matches every number in it against this set.
- `facts[]` — each one number: `id` (stable, for QA to cite), `label`, `value`, `unit` (a Figure's
  units, and `count`), `source` (`engine`, or the input's own — the home's size is `agent` or
  `listing`), `as_of`, `confidence`, `derivation`, `comp_ids`. The ids:
  - `range.low`, `range.high` (prices) and `range.low_per_sqft`, `range.high_per_sqft` (the end
    comps' $/sqft, or a narrowed end ÷ the home's size); `range.comps` — the sales the range spans
  - `base`, `base.per_sqft`
  - `sold.count` — the primary sales in the numbers
  - `anchor.price`, `anchor.per_sqft`, `anchor.implied` — the closest comp, when the agent has
    marked it
  - by status, for each with comps in the numbers: `<status>.count` (in contract, active, didn't
    sell), `.median_per_sqft`, `.median_price`, `.median_days_on_market`; `sold.median_sale_to_ask`;
    `<status>.vs_sold_median` for the asks; and `off_market.lowest_per_sqft`,
    `off_market.lowest_price` — the lowest ask that didn't sell
  - `home.area_sqft`, `home.ask` — the home itself, when known
- `agent_number` — where the agent's number sits, kept apart because the assistant never sees it
  while it helps with the neutral valuation (§8.4): `position` against the range (`below`,
  `overlaps_low`, `within`, `overlaps_high`, `above`, `spans`) and `facts` — `agent.low`,
  `agent.high` (source `agent`, from the named prices of kind `call`) and, outside the range,
  `agent.below_range_by` or `agent.above_range_by`. Null without a call.
- `names` — the home and every comp a fact rests on, by `address` and `unit`, so "#517" or "200
  Chambers" in a headline isn't taken for a figure.
- `missing` — what a headline can't say yet, and why: no range, no base, no closest comp.

Every engine figure among them (all but the counts) is one the output already carries, so it traces
to its derivation. Facts hold exact values; a headline shows $/sqft truncated and prices rounded
("about $640K"), which is presentation (§6.1) and for QA's matching to allow.

### `divergence`

`same` (true when the agent's estimates move neither the base nor the range) and the difference
between the two results' `base`, `range_low` and `range_high`. An estimate that's disclosed but moves
nothing leaves `same` true.

### `prices[]`

Each named price with, per result: `per_sqft`; `vs_range` (`position`, `through_percent`, `to_low`,
`to_high`); `vs_base` (`difference`, `percent`); `vs_indicators` (every available indicator);
`negotiating_room` — the comps' median, lowest and highest sale-to-last-ask and the sale that the median
implies if this were the asking price.

### `monthly_cost` — an estimate, per result

`price`, `down_payment`, `loan`, `annual_rate_percent`, `term_years`, `interest_only`,
`mortgage_payment` (principal and interest, or interest only), `interest_first_month`,
`principal_first_month`, `monthly_carry`, `insurance`, `other_ownership_costs`,
`housing_cash_outflow`, `ownership_carrying_cost`, `economic_burn`, `gaps`. Definitions below.

### `deal_terms`

`template`, `captured` (the terms as given), `deposit`, `price_evaluations` (the deal price and the
seller's target, evaluated like `prices`), `monthly_cost`, and `not_computed_in_v1` — rent credits,
the closing timeline and the seller's timing are captured and shown, not calculated, until full offer
modelling.

### `gaps`, `warnings`, `pending_confirmation`

- **`gaps`** — inputs the calculation needs and doesn't have: `{ code, message, target, field,
  results, fillable }`. The messages are shown to the agent, so they say "the home", not "the
  subject". `fillable` (0.5.0, NW-077 b) is true when the agent can close the gap on a screen that
  exists: a fact about the home that Details or its Building and Policies pickers ask for, a comp's
  price, size or floor (Sort's edit), a link comp's confirm. It's false for what follows from another
  gap (no base, no range, no primary sold comp) and for facts no form asks (unit type, the building's
  size). A comp raises gaps only where it counts in a result (a 2nd-tier or ✕ comp raises none; an
  unconfirmed link comp asks for its confirm when it's 1st tier). A co-op report raises no gap about
  interior size (NW-066 a). The home's size is asked once, not again as a missing fact. Codes: `subject_area_missing`, `subject_area_estimate_only`, `no_primary_sold_comps`,
  `base_unavailable`, `range_unavailable`, `comp_area_missing`, `comp_price_missing`,
  `comp_floor_missing`, `subject_fact_missing` (with the field to ask for), `subject_carry_missing`
  (per result: an estimated carry fills "with estimates" and leaves the gap "on the facts"),
  `comp_unconfirmed` (one per unconfirmed link row, in place of its "missing" gaps).
- **`warnings`** — `{ code, message, comp_ids, results }`: `closing_record`, `approx_area`,
  `same_building_as_subject`, `same_unit_as_subject`, `property_type_mismatch`,
  `unrecognised_status`, `anchor_not_sold`, `anchor_not_primary`, `contradiction`,
  `hypothetical_ignored`, `double_counting_risk` (naming the factors that carry values),
  `outside_house_bounds`, `narrowing_not_applied`, `narrowing_outside_bracket`, `base_outside_range`,
  `adjusted_value_not_positive`, `analyst_only_factor`.
- **`pending_confirmation`** — inferred facts and unconfirmed judgments waiting for the agent:
  `{ kind, id, target, what, value, source, note }`. An unconfirmed link row is one item of kind
  `listing`, not one per value, because the agent confirms it in one tap.

---

## Adjustments and the house method

### The catalog — Appendix A (v0.4), all 39 factors

`FACTORS` holds each as a definition: number, name, what it captures, where its data comes from,
what it applies to, who compares it, and the shape of its magnitude. None has a number. Numbers and
ids are identifiers: 37–39 were appended (they sit after 32, with their group, as in Appendix A),
and a renamed factor keeps its id (20 is still `tax_abatements`).

| # | Factor | Compared by | Magnitude shape |
|---|---|---|---|
| 1 | Interior size | engine (areas) | share of the comp's $/sqft — adjusted prices only |
| 2 | Bedrooms, bathrooms | engine (counts) | dollars per bedroom; per bathroom |
| 3 | Layout and efficiency | judgment | % per degree |
| 4 | Floor: in the building (`floor`); against neighbouring buildings (`floor.neighbours`) | engine (floors); judgment (neighbouring heights aren't in the export) | % per floor; % per degree |
| 5 | Exposure and light | judgment | % per degree |
| 6 | Views | engine (tags) + judgment | % per degree |
| 7 | Outdoor space | engine (presence; size when stated) + judgment | outdoor area × weight per kind at the comp's $/sqft; % per degree without sizes |
| 8 | Condition | judgment | % per degree |
| 9 | Finishes and systems: kitchen and bath quality; central air; dishwasher; en-suite bathrooms; fireplace; in-unit laundry (installed, permitted, prohibited) | judgment for quality and en-suite; engine (tags) + judgment for the rest | % per degree, six lines |
| 10 | Ceiling height and volume | judgment | % per degree |
| 11 | Unit type | engine (tags, unit label) + judgment | % per degree |
| 12 | Noise and street position | judgment | % per degree |
| 13 | Private storage and extras | judgment | dollars per degree |
| 14 | Service level | engine (tags) + judgment | % per degree |
| 15 | Amenities; shared outdoor space | engine (tags) + judgment | % per degree, two lines |
| 16 | Building era and type | engine (year built) + judgment | % per degree |
| 17 | Building size | engine (units, stories) + judgment | % per degree |
| 18 | Sponsor and new-development sales | judgment | % per degree |
| 19 | Carrying costs | engine (monthly carry) | monthly difference × a multiplier |
| 20 | Tax exemptions and abatements — 421-a, 421-a(16), 485-x, J-51, Battery Park City's payments in lieu of taxes | judgment | % per degree |
| 21 | Building financials | judgment | % per degree |
| 22 | Policies | engine (tags) + judgment | % per degree |
| 23 | Parking | engine (tags) + judgment | dollars per degree |
| 24 | Ground lease | judgment | % per degree |
| 25 | Micro-location | judgment | % per degree |
| 26 | Distance from subject | — **a selection rule**: it decides which comps to use, never moves a price | — |
| 27 | School zone | judgment — analyst view only | % per degree |
| 28 | Recency and market movement | engine (sale date — the closing date in v1) | % per month — the market's movement, signed |
| 29 | Sale conditions | judgment | % per degree |
| 30 | Concessions and credits | judgment | % per degree |
| 31 | Combination units | judgment | % per degree |
| 32 | Evidence status | — not an adjustment: kept apart in every statistic | — |
| 37 | Financing terms — cash against mortgaged; seller or sponsor financing | judgment | % per degree |
| 38 | Tenant in place | judgment | % per degree |
| 39 | Non-realty items — furniture and the like in the price | judgment | dollars per degree |
| 33–36 | Air rights, lot, legal use, rental income | — later property types and modules | — |

The shapes are a starting structure for CR-R's findings and Noble's calibration, not a method
decision; changing one is a small code change and a new house-method version.

### How a difference becomes a number — or doesn't

1. **Compare.** Where the facts allow, the engine compares the comp with the subject itself: more
   area, bedrooms or floors, or a feature the other lacks, reads as better. Where the facts don't
   settle it — two different sets of views, a loft against a duplex — the comparison is "differs"
   and needs a judgment. A judgment (assessment) overrides the engine's direction and adds a degree;
   where a line's arithmetic has its own sign (interior size, outdoor area, carry), the judgment's
   direction still decides which way the comp moves. Missing data on either side makes the
   comparison unknown, and says what's missing.
2. **Find a magnitude.** "On the facts": the house method's value, if determined. "With
   estimates": the agent's value for that factor if they gave one and it can apply to this comp,
   else the house method's. School zone takes neither — analyst view only.
3. **Apply it**, or don't: a line with no value, no direction, or no degree where it needs one is
   **considered, not calculated** — it appears in the bridge, the assistant can discuss it, and it
   moves nothing. Adjustments move a comp toward the subject; percentages are of the comp's own price
   and don't compound; each line is whole dollars, and as sure as what it rests on — the comparison's
   inputs, and a guesstimate when the value is the agent's.
4. **Resolve interactions** (below), then sum what's applied. A comp adjusted to zero or below can't
   indicate a price: it's left out of the indicators, with a warning to check the values.

An agent value outside the house limits (`min_percent`/`max_percent` of the comp's price, once Noble
sets them) raises `outside_house_bounds`, quoting the agent's reason or asking for one.

### Interactions — Appendix A.5, structure only

| Factors | Relationship | v1 behaviour |
|---|---|---|
| Outdoor space ↔ shared outdoor space (15) | substitutes | the larger adjustment, never the sum |
| Parking ↔ micro-location | conditional substitutes | double-counting warning (the condition — easy street parking — isn't knowable) |
| Outdoor space × views | complements | an interaction line, value not yet determined |
| Floor × views | overlap | double-counting warning |
| Interior size ↔ bedrooms and bathrooms | overlap | double-counting warning |
| Unit type ↔ floor, outdoor, views | overlap | double-counting warning |
| Amenities ↔ carrying costs | offsetting | double-counting warning |
| Service level ↔ building size | correlated | double-counting warning |
| Condition ↔ building era | correlated | double-counting warning |
| Sponsor sales ↔ concessions | overlap | double-counting warning |
| Tax exemptions ↔ carrying costs | overlap | double-counting warning |
| Carrying costs ↔ building financials, ground lease | overlap | double-counting warning |
| Outdoor space ↔ interior size | overlap | double-counting warning |
| Amenities ↔ parking, private storage | overlap | double-counting warning |
| Finishes and systems ↔ condition | overlap | double-counting warning |

The last five came with design v0.4, from CR-R's evidence. A factor on either side covers all its
lines ("floor" covers `floor.neighbours`; finishes covers all six), except where the table names
one: the amenities row is the general amenities line, not shared outdoor space. Warnings fire when
both sides carry values for the same comp, whoever supplied them. Substitutes
pulling the same way take the larger; pulling opposite ways (a terrace the comp lacks, a roof deck
it has) they net, which is no double count. Interaction magnitudes are CR-R2: the house method holds
a null slot for each, and the loader refuses a non-null one rather than ignore it.

### The house method file

`house-method/production.json` — one versioned file for every magnitude, weight, bound and
threshold: a `lines` entry per factor line (`"floor"`, `"floor.neighbours"`, `"beds_baths.bedrooms"`,
`"finishes_systems.laundry"` …) with its shape's slots plus `min_percent` / `max_percent`;
`interactions`; `decision_thresholds` for Jev (§7.1 — the app's, not the engine's); and
`check_thresholds` for the comparability checks. **In production every valuation value is null.**

**The check thresholds are configuration, not valuation magnitudes,** so the no-invented-numbers rule
doesn't cover them (Dispatch 08). A check decides when a flag shows; it suggests a tier and never
moves a number or a tier. So they carry defaults, load without Noble's sign-off, and don't count
against `all_null`. Each says whose rule it is:

| Setting | Default | Basis |
|---|---|---|
| `sale_age_months` | noted past 3, old past 6, the market has moved past 12 | Kara's rule, pending Noble |
| `size_percent` | 25 | Kara's rule, pending Noble |
| `size_tag_percent` | 10 | The size scale's inner edge for the tags (NW-045, NB-10): recommended default, pending Noble. No check reads it; `workspace/derived-tags.ts` does (Similar size within it, Smaller or Bigger out to `size_percent`, Much past it). Must be below `size_percent` |
| `floor_band_floors` | 3 | Frankie's band (floors 2–8 around a 5th-floor home), pending Noble |
| `distance_miles` | noted past 0.25, far past 0.5 | Kara's rule, pending Noble |

Kara gave no floor band, so the default is the one Frankie's email uses. The loader refuses a
threshold that's missing, isn't a positive number (whole for months and floors), is out of order
(noted < old < market moved; noted < far), or has no basis.

- `loadHouseMethod(json)` validates it against the catalog — every line present, only its shape's
  slots, magnitudes non-negative (the direction of a difference supplies the sign; only the market's
  monthly movement may be negative), `small ≤ moderate ≤ large`, outdoor weights between 0 and 1. A
  file written for an older catalog is refused line by line, saying what moved: `distance` is a
  selection rule now, and `finishes_systems` has six lines.
- **A production file with any value needs Noble's sign-off** — `approval: { by, at, note? }` — or
  it won't load. Nothing enters the product without it.
- Its `hash` is recorded in every output, so two files that share a version number can't pass as one.
- **A loaded house method is frozen, and `compute` takes no other.** It accepts only what
  `loadHouseMethod` or `productionHouseMethod` returned, so its values, `hash` and `all_null` can't
  drift apart; one built or edited by hand is refused with a `HouseMethodError`.
- **`test/fixtures/house-method.test-only.json`** holds made-up round numbers to exercise the
  arithmetic. It's marked `kind: "test"`, and **the engine refuses to load it outside a test runner**:
  `loadHouseMethod` throws `TestConfigRefusedError`, and so does `compute` if a test house method
  reaches it any other way. "A test runner" means Node's (`node --test` sets `NODE_TEST_CONTEXT` in
  every test process) or Vitest (`VITEST`). A browser has no `process` at all and a Netlify function
  sets neither, so both refuse — proved by a test that runs a separate Node process outside the test
  runner, and checked in headless Chromium. This is the engine's only read of its environment
  (`house-method/runtime.ts`).

---

## Carry, price evaluation, monthly cost

Terms follow the ChatGPT audit's §9 until the house glossary (§6.9, drafted by CR-R) is official:

- **Monthly carry** — common charges plus real estate taxes (condo); maintenance (co-op).
- **Mortgage payment** — principal and interest; interest only if so set.
- **Housing cash outflow** — everything actually paid in a month: mortgage payment + carry +
  insurance + other ownership costs.
- **Ownership carrying cost** — interest + carry + insurance + other ownership costs. **Principal is
  not an expense.**
- **Economic burn** — cash outflow less principal; for a purchase with no rent, equal to ownership
  carrying cost.

The monthly figures are the first month of the loan, labelled an estimate. Insurance not given is
left out and said so. Amortisation uses exact integer powers, so every runtime agrees to the dollar.

---

## Versioning and determinism

- `ENGINE_VERSION` (0.4.1) — bump when any output could change for the same input.
  `PARSER_VERSION` (0.5.0) — bump when any parsed record could change; every import records it.
  `PROPERTY_KEY_VERSION` (`pk1`) — bump when key rules change. The house method has its own
  `version`, and its `hash`.
- **Deterministic**: comps are processed in id order; statistics sum in that order; object keys
  serialise in code-unit order; strings never compare by locale. The engine uses only +, −, ×, ÷,
  comparisons, rounding and square roots — operations IEEE 754 pins exactly. `Math.pow`, `**`,
  `exp`, `log` and the trigonometric functions are left to each JavaScript engine to approximate, so
  they're not used: integer powers are by repeated squaring, and the distance check's cosine is its
  Taylor series. A purity test reads the engine's source — Node strips the types, a small
  lexer sets comments, strings and regular expressions aside — and fails on any clock, network, DOM,
  randomness, locale or engine-dependent maths, or any import from outside this folder.
- Money rounds half away from zero, once per line or figure.

---

## Decisions

### Settled in design v0.4

Casanova's review of CR-2 settled these; the design now says each (§6.2–§6.6, §7.1):

1. **A setting that carries a *value* is the agent's estimate.** Adjustment values and the range
   narrowing go to "with estimates" only; tiers, the lead indicator, the anchor and a recency window
   change both results.
2. **Substitutes pulling opposite ways net out**; pulling the same way, the larger applies.
3. **Double-counting warnings fire whenever both sides carry values**, house method or agent.
4. **Jev judgments are `inferred` until confirmed**, so they move no number before the agent
   confirms; §7.1's "applied immediately" is the app recording the confirmation, visibly and undoably.
5. **"None listed" is approximate**, not exact (changed in v0.4). A missing tag still lets a value
   apply; what it feeds carries `approx`. A blank column is unknown.
6. **Recency windows cover sold and in-contract comps**, by closing and contract date; active
   listings are exempt (changed in v0.4).
7. **Carry's comp median runs across all statuses** — it isn't price evidence.
8. **The magnitude shapes** are a first structure, to be revisited with Noble.
9. **$/sqft displays truncated**, as StreetEasy shows it.
10. **School zone never moves a number**, from the house method or the agent.
11. **The agent's adjustment values are magnitudes**; the market's monthly movement is the one
    signed value.
12. **When the agent's value can't apply to a comp and the house method's can, the house method's
    is used**, noted on the line.

Still open: the order adjustments apply in, and whether they compound (D-18, Noble's). Until he
answers, every percentage is of the comp's own sale price and the lines add.

### New in CR-2.1 — for Casanova to confirm or change

1. **"None listed" covers every conclusion that rests on a missing tag.** v0.4 makes a fact that
   names no tag of a kind `approx`. The same holds when two tag lists are compared and the
   difference rests on one side not listing something: a building whose tags list a gym but no
   pool, against a subject with both, is `approx` too.
   - A judgment that agrees with the engine's comparison, or settles a "differs" it left open, is
     only as sure as the facts under it. Without that, confirming a judgment would turn a "none
     listed" back into `exact`.
   - A judgment that overrides the facts stands alone.
2. **Service is `exact` only when both a doorman and a concierge are listed.** Otherwise part of it
   rests on a missing tag.
3. **The finishes split is six lines.**
   - Quality and en-suite bathrooms are judged: the export tags neither.
   - Central air, dishwasher, fireplace and laundry are compared by the engine from the tags.
   - The other Home Features (hardwood floors …) stay on the record as context for the quality
     judgment. They're no longer compared as a set.
4. **Laundry "none listed" means not installed, permitted or not unknown.**
   - It loses to installed.
   - Against permitted or prohibited it's unknown, asking whether the building permits one.
   - Two "none listed" read as similar (`approx`).
5. **Ids don't change.** The per-floor line is still `floor`, so existing inputs are unchanged. The
   new line is `floor.neighbours`, by judgment, because the export has no neighbouring heights.
   Factor 20 keeps the id `tax_abatements` under its new name.
6. **Factors 37–39 are judgments.**
   - Financing terms and tenant in place are a % per degree.
   - Non-realty items are dollars per degree, because the furniture's value is a sum, like private
     storage.
   - They sit after 32 in catalog order, so the bridge lists them with the other transaction factors.
7. **Two of the new pairs are hubs.** Each one-to-many row pairs the shared factor with each of the
   others: carrying costs with building financials and with ground lease; amenities with parking and
   with private storage. The amenities side is its general line, because shared outdoor space has its
   own row.

### New in CR-2.2 (phase 1) — confirmed on #55

Casanova confirmed all five as built. His answers to the two questions are built in phase 2: a floor
from a unit label (6, below), and recency from the contract date. Item 1 is superseded by D-23 (A):
didn't sell is now the fourth evidence status.

1. **"Didn't sell" waited for phase 2 to become an evidence status.** An evidence status comes with
   its own statistics and its place against the sold band. Until then a link's or a typed-in
   `off_market` comp keeps `evidence_class` null, carries `status.listing_status: 'off_market'`, and
   the output says "didn't sell". This keeps phase 1 additive for Mason: no new key in any
   `Record<EvidenceClass, …>`.
2. **An unconfirmed link row counts in neither result, as a whole.** Its status is read from the
   page too. It gets one gap (`comp_unconfirmed`) and one pending item, not one per value.
3. **The key's city and state may come from the link.** When the page gives none, StreetEasy's
   building slug supplies them for the four boroughs it names that way (New York, Brooklyn, Bronx,
   Staten Island). That's identity, not a valuation fact. Otherwise `partial_address` warns.
4. **The page's own history fills its blanks,** each noted "from the listing's history":
   - A recorded sale beats an off-market label.
   - A relisting starts a new period.
   - An off-market comp's status date is the day it came off.
5. **The schema has more than the dispatch lists:**
   - city, state, ZIP and neighborhood, which the key needs
   - sponsor-unit and income-restricted flags, which phase 2's checks need
   - a separate "size approximate" flag, since a page's "~" can be an icon
6. **A floor from a unit label: yes, as a suggestion** (answered on #55, built in phase 2).

### New in CR-2.2 (phase 2) — confirmed on #58

**Didn't sell**
1. **It's `evidence_class: 'off_market'`,** the design's field for the evidence status, on ask basis
   (its last ask). It has its own statistics, days on market and class median against the sold
   median, and never enters the base or the range.
2. **The ceiling signal is the lowest ask that didn't sell,** set against the sold band
   (`asks_vs_sold.ceiling`). Each didn't-sell comp's `ask_vs_sold` places it too. The lowest is the
   tightest ceiling: even at that ask, the market didn't pay.
3. **A recency window covers didn't sell, by the day it came off the market.** An active ask is
   current evidence; one that came off a year ago isn't. The sale-age check reads the same date.
4. **The export still has three statuses.** "Temporarily Off Market" stays unrecognised: a
   listing paused isn't one that didn't sell. A record from parser 0.3.0 that kept didn't sell as its
   listing status only reads as didn't sell.

**The checks**
5. **Checks read the best value of each fact, whatever its confidence,** and aren't per result. A
   flag should show as a row lands, before the agent confirms anything, so a flag resting on an
   inferred value (a floor from "1A", a link's unconfirmed row) is `inferred` and carries its note,
   as you asked for "1A".
6. **"Not marked" counts as not.** New development and HDFC are flagged when one side is marked and
   the other isn't, since a resale page never says "resale". Resting on an unmarked side, the flag is
   `approx` and says "isn't marked as one". A new-development home flags every unmarked comp for the
   agent to check.
7. **Co-op against condo reads the report's type,** the same like-for-like rule that keeps such a comp
   out of every statistic.
8. **The floor band's default is Frankie's ±3 floors** (his 2–8 around #517's fifth). Kara gave no
   number; the dispatch gave none either. It's labelled as his.
9. **A first floor is the floor at 1 or below,** and it isn't also flagged "floor far off".
10. **A sale's age is in calendar months from its market date**: sold, in contract and didn't sell,
    never active. "Noted" (past 3 months) suggests no tier; past 6 and 12, Secondary.
11. **Distance needs a `coordinates` fact on both sides,** new in this phase and supplied by neither
    source today, so every comp carries a `distance` check with status `unknown` that says so. With
    coordinates, it's a flat-earth distance whose cosine is a Taylor series, so every runtime agrees.
12. **The suggested tiers are the table's, in D-20's words:** Counts → Primary, Context → Secondary,
    Leave out → Excluded.

**Pairs**
13. **Pairs are per result,** since which comps are included, and their facts, can differ.
14. **Only facts are compared.** Every judgment is of a comp against the home, so condition, layout,
    light and the other judgment factors aren't compared between comps; `not_compared` lists them.
    Deriving comp-against-comp from two judgments against the home is possible later.
15. **Two comps in one building share its building and location factors.** Without this, a pair
    of units in one building would never be clean, because listing agents type the building's tags
    differently and charges differ from floor to floor.
16. **Time counts past "old for a comp."** Two sales more than 6 months apart (Kara's threshold,
    reused) differ in time; within it, `months_apart` is shown and not counted. Otherwise every pair
    would differ in time. Active asks are never apart in time.
17. **What a clean pair isolates:** one catalog factor (its lines together: bedrooms and bathrooms
    are one factor), or a subset of one overlap row. A hub's subset must include the hub factor:
    floor with outdoor space isn't the penthouse bundle unless unit type differs too.
18. **Unknown lines don't break a clean pair;** each pair lists them. A pair where nothing compared
    differs isn't clean: its gap lies in what the engine can't compare.
19. **A pair is ordered by $/sqft where both comps have one,** else by price. The clean-pair
    evidence is signed from the side with more or better of the factor, or, for time, later less
    earlier. A difference without a direction ("differs") counts as undirected.

**The price table and the headline**
20. **The price table's round step is presentation, not a house-method setting.** It's the largest
    of $5, $10, $20, $25, $50, $100 … up to 2.5% of the low end, with between two and ten steps.
    That reproduces Frankie's $20 steps at $880, and a test rebuilds his five rows for #517 exactly.
21. **The table spans the range in $/sqft.** A comp's row is its implied value, so the first and last
    rows are the range. It follows the agent's narrowing in "with estimates".
22. **Headline facts are a flat list of numbers with stable ids,** per result, plus the names a
    headline may use. Counts have the unit `count`, and a fact taken from an input (the home's size
    or ask, the anchor's sale price) keeps that input's source.
23. **The agent's number sits apart from the facts** (`agent_number`), because §8.4 keeps it from the
    assistant while it drafts. QA can still match it, since it's agent-stated.
24. **The closest comp is the one the agent marks.** The engine never picks an anchor; without one,
    `missing` says so.

**Recency from the contract date** (your answer on #55)
25. **A sale is dated from its contract where a listing's history gives one,** else from closing.
    That covers the recency window, the market-movement comparison, the sale-age check and pairs.
    `market_date` says which date each comp used. Hannah's export has no contract dates for sales, so
    her figures don't move.

**Mason's side**
26. **Two one-line type fixes in Mason's code:** `EVIDENCE_LABEL` gains `off_market: "Didn't sell"`,
    and Sort's order puts didn't sell fourth. Without them his type check fails once `EvidenceClass`
    has four members. His Reveal screen still shows three statuses until his Dispatch 09 phase 2.
27. **His database needs a migration** before his link import stores a didn't-sell comp:
    `report_comps.evidence_class` is checked against `sold`, `in_contract` and `active`. The export
    never yields `off_market`, so nothing breaks today.

### New in 0.5.0 — the engine for Findings (CR-2.4), for Casanova to confirm or change

33. **The five rows sit inside `price_table`** (`five_rows`), so they exist exactly when the table does.
    The low and high rates aren't rounded (they're the comps' own); the three between are.
34. **`fillable` is the engine's list of the home's fields a screen asks** (`FILLABLE_SUBJECT_FIELDS`
    in `compute/index.ts`). A new field on Details goes on it too.
35. **The home's pickers reach the engine** (`workspace/engine-input.ts`, `buildingFacts`): Doorman →
    door service of unstated hours, Concierge → concierge, Parking → parking, any shared outdoor option
    → shared outdoor space, the other building and wellness options → amenities in StreetEasy's words
    (Storage → "storage space", Pool → "swimming pool"), and Policies → policies, pets and smoke-free.
    An option not picked isn't there; a group never opened stays unknown. `intake.rooms` → `rooms`
    (no factor compares rooms yet).
36. **An amenity StreetEasy tags that the picker doesn't offer** (Verizon Fios, say) makes a comp's
    amenities read as more than the home's. No house-method value applies to amenities today, so it
    moves no number; it shows in the comparison.

### New in 0.4.1 — `distance_miles`, for Casanova to confirm or change

From Mason's note on #62: the screens worked out a row's miles by importing `distanceMiles` from
`compute/checks.ts`, because the engine adds no check under ¼ mile.

28. **`distance_miles` is a plain number, not a `Figure`.** It sits with `age_days` and
    `days_on_market`, and the `distance` check's `measured`. A `Figure` would need a `miles` unit,
    and Findings' `fig()` switch covers every unit, so it would break the screens' type check for a
    number they don't show there. The flag's `confidence` still says how sure it is (`approx`: a
    building's point, not the unit's).
29. **Unrounded,** because the flag compares the unrounded miles with its thresholds. Rounding is the
    screen's: "0.3 mi" on the row, "0.31 miles away" on the flag.
30. **A comp in the home's building gets its miles (0), not null.** Null means "not known". The
    screens show "Same building" there.
31. **It reads the best value of each side's coordinates, whatever its confidence,** as the checks
    do, and isn't per result.
32. **One line in Mason's code, and his helper's signature.** `compDistance` in
    `workspace/distance.ts` now takes the comp's `distance_miles`, and Sort passes it. It no longer
    imports from `compute/`. With both buildings mapped and no engine output for the comp, the row
    waits ("The distance isn't worked out yet") rather than guess.

---

## Files

```
engine/
  index.ts              the public API
  types.ts              inputs and the shared vocabulary (§6.1)
  version.ts            engine and parser versions
  facts-schema.ts       what each fact field must hold — shared by the parser and compute()
  parser/               the StreetEasy export parser (§6.2), links and typed-in comps
    index.ts, columns.ts, values.ts, derive.ts, property-key.ts, csv.ts
    tag-facts.ts        tags into facts, the same for exports and links
    listing.ts          LISTING_EXTRACT_SCHEMA, compRecordFromListing, confirmListingRecord
    manual.ts           compRecordFromManual
    errors.ts           ParseError and the warning codes every reader shares
    xlsx/               zip.ts, inflate.ts, xml.ts, workbook.ts — XLSX with no dependencies
  catalog/
    factors.ts          Appendix A — the 39 factors
    interactions.ts     Appendix A.5 — the interaction map
  house-method/
    production.json     every value null
    load.ts             validation, sign-off, freezing, the test-config refusal
    runtime.ts          test-runner detection — the engine's one environment read
  compute/
    index.ts            compute(): both results, assembled
    validate.ts         input validation
    facts.ts            which value each result uses
    compare.ts          comp against subject (or comp against comp), factor by factor
    adjust.ts           comparisons into dollars; interactions
    results.ts          indicators, base, range, bridge, market signals
    checks.ts           the mentors' comparability checks (§6.10)
    pairs.ts            the differences between comps, and clean pairs (§6.6)
    price-table.ts      the home's price at $/sqft steps (§6.5)
    headline.ts         the headline's facts (§10.2)
    market-date.ts      the date a comp's price speaks for — contract, else closing
    money.ts            carry, price evaluation, monthly cost, deal terms
    figure.ts, labels.ts  figures with provenance; how a property is named
    output.ts           the output's types
  util/                 dates without Date, canonical JSON, SHA-256, UTF-8, arithmetic
  test/                 183 tests; fixtures: Hannah's export as CSV and three XLSX workbooks,
                        six listing extracts (listings/), and the test-only house method
```
