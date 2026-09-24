# The comp report engine

Every number in every comp report comes from here. The assistant argues and writes; it never produces
a figure (design §4.1). This folder is the calculation engine and the StreetEasy export parser —
design §6, built under Dispatch 06 (CR-2).

It is plain TypeScript with **no DOM, no network and no clock**: dates come in as inputs, and the same
inputs always give the same output, byte for byte. The same module runs in the browser (so the range
moves the instant a comp is toggled) and in Netlify functions (so every stored version is computed
authoritatively), and both get the same answer — checked: an esbuild bundle in headless Chromium and
one in Node produce the same output hash.

**Version 0.1.0.** Nothing here has been piloted yet.

---

## For Kimani and Noble — what it guarantees

- **Sold, in contract and active never share a statistic.** Each has its own $/sqft figures. Only
  sold comps make the base and the range; asks are shown against them, never averaged in.
- **It never returns StreetEasy's blended figures.** StreetEasy's report for 100 Barclay #17L
  headlines "Average sale price $4,535,000" (closed sales and asking prices averaged together) and a
  "$2.2M–$6.0M range" (the cheapest home to the dearest, every status). A test rebuilds both from
  the raw export and proves the engine never outputs either, in any configuration.
- **A range, never a point.** The range runs from the lowest to the highest value implied by the
  agent's *primary sold* comps. One comp can't make a range; the engine says so instead.
- **No invented numbers.** The adjustment catalog has all 36 factors, and **every magnitude is null**
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

What it does not do: judge comparability, suggest tiers, read listing text (that's Jev and the
assistant); co-ops beyond switching $/sqft off; rent credits, deposits over time, closing timelines
(full offer modelling comes later); any rent or yield figure — the export carries no rent data, so
the engine cannot produce one.

### What Hannah's export gives, through the engine

| Figure | Engine | StreetEasy |
|---|---|---|
| Sold $/sqft, all five: mean / median | $1,906.12 / $2,112.68 | $1,906 (mean only) |
| Sold $/sqft, floor 10 and up: mean | $2,279.88 | — |
| In contract $/sqft (ask basis): 101 Leonard · 25 N Moore · 108 Leonard | $1,625.34 · $2,387.15 · $2,400.70 | 1,625 · 2,387 · 2,400 |
| Active $/sqft (ask basis): 77 Reade · 111 Murray | $2,763.95 · $3,091.80 | 2,763 · 3,091 |
| Sale-to-last-ask: 200 Chambers · 181 Hudson · 5 Franklin · 66 Leonard | −3.0% · +12.3% · −4.0% · −4.2% | "100% — selling at asking" |
| Sale-to-ask, median / mean | −3.5% / +0.3% | — |
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
- **The export's `$/Sqft` column is never used.** StreetEasy switches it from sale price to asking
  price by status and truncates it. It's kept on each comp (`ignored_export_price_per_sqft`) for
  audit; the engine recomputes $/sqft itself, with its basis.
- **Public-record closings** (`/closing/` links, like 79 Laight #1A) are flagged. They have no ask,
  no days on market, no engagement, no features — their zeros are read as "no data", not zero.
- **Tags:** Home Features, Building Amenities and Building Policies are split on `;`. From them:
  views; private outdoor space (**presence and kind only — the export has no size**); shared outdoor
  space; service level (doorman full-time, part-time, virtual, hours not stated, none listed; and
  concierge); parking (garage, valet — deeded or not can't be told); unit type (loft, duplex,
  triplex, penthouse); and the remaining finishes and amenities. A blank tag column tells nothing, so
  nothing is derived (unknown). A column with tags but none of a kind reads as "none listed", with a
  note, and the agent can correct it. A penthouse suggested only by a unit label ("#PHA") is
  *inferred* and waits for the agent to confirm.
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
ids) · `status` (`raw`, `evidence_class`) · `facts` (every value sourced — below) · `engagement`
(page views, saves, shares — context only, never a valuation input; null for closings) ·
`building_name` · `neighborhood` · `agent_commentary` · `tags` · `ignored_export_price_per_sqft` ·
`flags` (`closing_record`, `approx_area`) · `origin` (parser version, row, as-of date) ·
`extra_columns`.

**Parse warnings** (`code`, `message`, `row?`, `column?`): `missing_column`, `unknown_column`,
`duplicate_column`, `renamed_column`, `unreadable_value`, `value_adjusted`, `closing_record`,
`approx_area`, `unrecognised_status`, `missing_address`, `duplicate_property`, `ragged_row`,
`encoding`, `file_note`, `no_rows`.

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
  - `recency: { months } | { since }` — only sold comps whose sale date falls in the window count.
    Applies to both results; in-contract and active asks are current evidence and stay in.
  - `narrowing: { low?, high?, reason, as_of }` — the agent narrowing the range. It carries a number,
    so it's the agent's estimate: "with estimates" only, and it must sit inside the comps' bracket.
- **`stated_facts`** — `{ id, target: 'subject' | { comp_id }, field, value }`: a fact the agent
  gives ("the terrace is 400 sq ft"). It beats the export. The latest statement wins (by `as_of`;
  on the same date, the later one in the list). If it contradicts the export, the agent's value is
  used and a `contradiction` warning is raised — trust but verify (§2).
- **`assessments`** — a judgment that a comp differs from the subject on a factor:
  `{ id, comp_id, factor, facet?, direction, degree?, source, confidence, probability?, as_of, note? }`.
  `direction` is `comp_superior`, `comp_inferior`, `similar` or `differs`; `degree` is `small`,
  `moderate` or `large`. From Jev, its fallback or the agent. It carries no number. Jev's are
  `inferred` until the agent confirms.
- **`agent_adjustments`** — the agent's value for a factor ("add 5% for the terrace"):
  `{ id, factor, facet?, value, comp_ids?, reason?, as_of }`. Lands in "with estimates" only. `value`
  is one of:
  - `{ percent }` or `{ dollars }` — per comp that differs, signed by the comparison: a comp without
    the terrace moves up, one with a better terrace moves down, one where it can't be told which is
    better doesn't move (and says why). Percent is written as percent: `5` means 5%.
  - `{ percent_per_unit }`, `{ dollars_per_unit }` — for per-unit factors: floor, bedrooms,
    bathrooms, months of market movement.
  - `{ elasticity }` (interior size), `{ multiplier }` (carrying costs), `{ weights }` (outdoor space
    by kind) — the factor's own shape.
  - `comp_ids` limits it to named comps.
- **`prices`** — prices the agent names: `{ id, label, kind, price }`, `kind` one of `list`,
  `offer`, `target`, `call`, `what_if`, `other`. **Evaluated against the results; never an input
  to them** — a test proves adding a target or the agent's call changes no result.
- **`financing`** — the optional monthly cost estimate: `price` (`'base'` or `{ named_price_id }`),
  `down_payment` (`{ percent }` or `{ dollars }`), `annual_rate_percent` (6.25 means 6.25%),
  `term_years`, `interest_only?`, `insurance_monthly?`, `other_ownership_costs_monthly?`.
- **`deal_terms`** — the intake module (§6.7): `template` (`buyer_traditional`,
  `buyer_rent_to_own`, `seller_pricing`), `price?`, `deposit?`, `financing?`, `target_closing?`,
  `interim_rent?`, `seller_target?`, `timing?`, `flexibility?`.

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

- `id`, `identity`, `building_name`, `evidence_class`, `status_raw`, `basis` (`sale` for sold, `ask`
  otherwise), `tier`, `tier_reason`, `anchor`.
- `flags`: `closing_record`, `approx_area`, `area_missing`, `price_missing`, `floor_missing`,
  `same_building_as_subject`, `same_unit_as_subject`, `property_type_mismatch`,
  `unrecognised_status`, `outside_recency_window`.
- `status_date`, `age_days` (to the analysis date), `days_on_market`, `sale_to_ask_percent` (sold
  comps with a last ask: sale ÷ last ask − 1), `engagement`.
- `per_result.on_facts` and `per_result.with_estimates`, each:
  - `included`, `not_included_because` — whether it counts toward this result's statistics, and if
    not, why (tier, status, like for like, recency window).
  - `price` (sale price for sold, ask otherwise), `area_sqft`, `price_per_sqft`,
    `no_unit_rate_because` ("no interior area — it can't give a $/sqft" for 100 Barclay #11F).
  - `comparisons` — factor by factor: `line`, `factor`, `facet`, `name`, `status` (`compared`,
    `unknown`, `pending_confirmation`), `direction`, `degree`, `units` (the signed difference: floors,
    bedrooms, sqft, months, $ of monthly carry), `unit_label`, `source` (`engine`, `jev`, `fallback`,
    `agent`), `confidence`, `basis` (in words), `missing` (each `{ side, field, label }` — exactly
    what to ask for).
  - `adjustments` (sold comps) — each line: `status` (`calculated`, `agent_estimate`,
    `considered_not_calculated`), `dollars` (signed: + moves the comp up toward the subject),
    `percent_of_price`, `applied` (false when a substitute took the larger), `superseded_by`,
    `applies_to_unit_rate`, `source` (`house_method` / `agent`), `agent_adjustment_id`,
    `why_not_calculated`, `basis`, plus `direction`, `degree`.
  - `adjusted_price` — sale price plus applied adjustments. `adjusted_price_per_sqft` — the same,
    interior size aside, over the comp's area. `implied_value` — that $/sqft × the subject's area.
  - `monthly_carry`, `carry_per_sqft`.
  - `ask_vs_sold` (in contract and active) — `position` against the sold band (`below`, `within`,
    `above`) and `versus_sold_median_percent`.

### `results.on_facts` and `results.with_estimates`

- `kind`, `label` ("On the facts", "With estimates").
- `evidence.sold`, `.in_contract`, `.active` — each: `basis`, `counts` (`total`, `primary`,
  `secondary`, `excluded`, `included`, `with_unit_rate`), `price_per_sqft` and `price` statistics over
  its included comps. **One class per statistic, always.**
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
  `narrowing_reason`. `range_unavailable_because` when there isn't one.
- `bridge` — from the unadjusted lead value to the base: `family`, `start`, `end`, `note`, and
  `lines`, one per factor that differs for any primary sold comp, in catalog order, plus interaction
  lines. Each line: `kind` (`factor` / `interaction`), `id`, `name`, `factor`, `facet`, `status`,
  `label` ("value not yet determined", "agent's estimate", "house method"), `client_visible` (false
  for school zone — analyst view only, §14), `comps` (direction, degree, units, dollars, applied,
  status, reason per comp), `effect_on_base` (the base with the line less the base without it) and,
  for interactions, `interaction` (relationship, why, members). With a median, effects needn't add
  up to the total.
- `sale_to_ask` — statistic over included sold comps. `days_on_market` — per class; closings
  excluded. `asks_vs_sold` — `sold_band` (low, median, high sold $/sqft) and, for in contract and
  active, the class median ask $/sqft and how far it sits from the sold median.
- `carry` — `subject`, `subject_per_sqft`, `comp_median`, `comp_median_per_sqft`, `comp_ids`,
  `subject_vs_median_percent`. Carry isn't price evidence, so the median runs across all statuses.
- `estimates_used` — ("with estimates") every agent estimate this result used — stated
  guesstimates, agent adjustment values, rough judgments, the narrowing — each `{ kind, id, target,
  what, note }`. This is what client copy must disclose when it uses this result (§9.5).

### `divergence`

`same` (true when "with estimates" rests on no estimate) and the difference between the two results'
`base`, `range_low` and `range_high`.

### `prices[]`

Each named price with, per result: `per_sqft`; `vs_range` (`position`, `through_percent`, `to_low`,
`to_high`); `vs_base` (`difference`, `percent`); `vs_indicators` (every available indicator);
`negotiating_room` — the comps' median, lowest and highest sale-to-ask and the sale that the median
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
  results }`. Codes: `subject_area_missing`, `subject_area_estimate_only`, `no_primary_sold_comps`,
  `base_unavailable`, `range_unavailable`, `comp_area_missing`, `comp_price_missing`,
  `comp_floor_missing`, `subject_fact_missing` (with the field to ask for), `subject_carry_missing`.
- **`warnings`** — `{ code, message, comp_ids, results }`: `closing_record`, `approx_area`,
  `same_building_as_subject`, `same_unit_as_subject`, `property_type_mismatch`,
  `unrecognised_status`, `anchor_not_sold`, `anchor_not_primary`, `contradiction`,
  `hypothetical_ignored`, `double_counting_risk`, `outside_house_bounds`, `narrowing_not_applied`,
  `narrowing_outside_bracket`, `base_outside_range`.
- **`pending_confirmation`** — inferred facts and unconfirmed judgments waiting for the agent:
  `{ kind, id, target, what, value, source, note }`.

---

## Adjustments and the house method

### The catalog — Appendix A, all 36 factors

`FACTORS` holds each as a definition: number, name, what it captures, where its data comes from,
what it applies to, who compares it, and the shape of its magnitude. None has a number.

| # | Factor | Compared by | Magnitude shape |
|---|---|---|---|
| 1 | Interior size | engine (areas) | share of the comp's $/sqft — adjusted prices only |
| 2 | Bedrooms, bathrooms | engine (counts) | dollars per bedroom; per bathroom |
| 3 | Layout and efficiency | judgment | % per degree |
| 4 | Floor | engine (floors) | % per floor |
| 5 | Exposure and light | judgment | % per degree |
| 6 | Views | engine (tags) + judgment | % per degree |
| 7 | Outdoor space | engine (presence; size when stated) + judgment | outdoor area × weight per kind at the comp's $/sqft; % per degree without sizes |
| 8 | Condition | judgment | % per degree |
| 9 | Finishes and systems | engine (tags) + judgment | % per degree |
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
| 20 | Tax abatements | judgment | % per degree |
| 21 | Building financials | judgment | % per degree |
| 22 | Policies | engine (tags) + judgment | % per degree |
| 23 | Parking | engine (tags) + judgment | dollars per degree |
| 24 | Ground lease | judgment | % per degree |
| 25 | Micro-location | judgment | % per degree |
| 26 | Distance from subject | judgment | % per degree |
| 27 | School zone | judgment — analyst view only | % per degree |
| 28 | Recency and market movement | engine (sale date) | % per month — the market's movement, signed |
| 29 | Sale conditions | judgment | % per degree |
| 30 | Concessions and credits | judgment | % per degree |
| 31 | Combination units | judgment | % per degree |
| 32 | Evidence status | — not an adjustment: separate evidence classes | — |
| 33–36 | Air rights, lot, legal use, rental income | — later property types and modules | — |

The shapes are a starting structure for CR-R's findings and Noble's calibration, not a method
decision; changing one is a small code change and a new house-method version.

### How a difference becomes a number — or doesn't

1. **Compare.** Where the facts allow, the engine compares the comp with the subject itself: more
   area, bedrooms or floors, or a feature the other lacks, reads as better. Where the facts don't
   settle it — two different sets of views, a loft against a duplex — the comparison is "differs"
   and needs a judgment. A judgment (assessment) overrides the engine's direction and adds a degree.
   Missing data on either side makes the comparison unknown, and says what's missing.
2. **Find a magnitude.** "On the facts": the house method's value, if determined. "With
   estimates": the agent's value for that factor if they gave one, else the house method's.
3. **Apply it**, or don't: a line with no value, no direction, or no degree where it needs one is
   **considered, not calculated** — it appears in the bridge, the assistant can discuss it, and it
   moves nothing. Adjustments move a comp toward the subject; percentages are of the comp's own price
   and don't compound; each line is whole dollars.
4. **Resolve interactions** (below), then sum what's applied.

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

Warnings fire when both sides carry values for the same comp, whoever supplied them. Substitutes
pulling the same way take the larger; pulling opposite ways (a terrace the comp lacks, a roof deck
it has) they net, which is no double count. Interaction magnitudes are CR-R2: the house method holds
a null slot for each, and the loader refuses a non-null one rather than ignore it.

### The house method file

`house-method/production.json` — one versioned file for every magnitude, weight, bound and
threshold: a `lines` entry per factor line (`"floor"`, `"beds_baths.bedrooms"`,
`"amenities.shared_outdoor"` …) with its shape's slots plus `min_percent` / `max_percent`;
`interactions`; and `decision_thresholds` for Jev (§7.1 — the app's, not the engine's). **In
production every value is null.**

- `loadHouseMethod(json)` validates it against the catalog — every line present, only its shape's
  slots, magnitudes non-negative (the direction of a difference supplies the sign; only the market's
  monthly movement may be negative), `small ≤ moderate ≤ large`, outdoor weights between 0 and 1.
- **A production file with any value needs Noble's sign-off** — `approval: { by, at, note? }` — or
  it won't load. Nothing enters the product without it.
- Its `hash` is recorded in every output, so two files that share a version number can't pass as one.
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

- `ENGINE_VERSION` (0.1.0) — bump when any output could change for the same input.
  `PARSER_VERSION` (0.1.0) — bump when any parsed record could change; every import records it.
  `PROPERTY_KEY_VERSION` (`pk1`) — bump when key rules change. The house method has its own
  `version`, and its `hash`.
- **Deterministic**: comps are processed in id order; statistics sum in that order; object keys
  serialise in code-unit order; strings never compare by locale. The engine uses only +, −, ×, ÷,
  comparisons and rounding — operations IEEE 754 pins exactly. `Math.pow`, `**`, `exp` and `log` are
  left to each JavaScript engine to approximate, so they're not used (integer powers are by
  repeated squaring). A purity test reads the engine's source — Node strips the types, a small
  lexer sets comments, strings and regular expressions aside — and fails on any clock, network, DOM,
  randomness, locale or engine-dependent maths, or any import from outside this folder.
- Money rounds half away from zero, once per line or figure.

---

## Decisions made in this build — for Casanova to confirm or change

1. **"A setting that carries a number is the agent's estimate" (§2)** is read as a setting that
   carries a *value*: adjustment values and the range narrowing go to "with estimates" only; tiers,
   the lead indicator, the anchor and a recency window change both results. A recency window's
   "six months" is a comp filter, not an estimate of value.
2. **Substitutes pulling opposite ways net** rather than take the larger (A.5's rule covers the
   same-direction case; applying it to opposite pulls would overstate the difference).
3. **Double-counting warnings fire whenever both sides carry values**, house method or agent — a
   superset of "both agent-stated".
4. **Jev judgments are `inferred` until confirmed**, so they move no number before the agent
   confirms (§6.1, §6.4). §7.1's "high confidence → applied immediately" is then the app marking the
   judgment confirmed, visibly and undoably.
5. **"None listed" is exact, with a note.** A listing whose Home Features name no terrace reads as no
   terrace (exact, per StreetEasy's own data), so the agent's "+5% for the terrace" can apply to it.
   A blank tag column is unknown instead.
6. **Recency windows apply to sold comps only**; asks are current evidence.
7. **Carry's comp median runs across all statuses** — it isn't price evidence.
8. **The magnitude shapes** (percent per degree, per floor, dollars per bedroom, size elasticity,
   outdoor weighting, capitalised carry) are a first structure, to be revisited with CR-R's findings.

---

## Files

```
engine/
  index.ts              the public API
  types.ts              inputs and the shared vocabulary (§6.1)
  version.ts            engine and parser versions
  parser/               the StreetEasy export parser (§6.2)
    index.ts, columns.ts, values.ts, derive.ts, property-key.ts, csv.ts
    xlsx/               zip.ts, inflate.ts, xml.ts, workbook.ts — XLSX with no dependencies
  catalog/
    factors.ts          Appendix A — the 36 factors
    interactions.ts     Appendix A.5 — the interaction map
  house-method/
    production.json     every value null
    load.ts             validation, sign-off, the test-config refusal
    runtime.ts          test-runner detection — the engine's one environment read
  compute/
    index.ts            compute(): both results, assembled
    validate.ts         input validation
    facts.ts            which value each result uses
    compare.ts          comp against subject, factor by factor
    adjust.ts           comparisons into dollars; interactions
    results.ts          indicators, base, range, bridge, market signals
    money.ts            carry, price evaluation, monthly cost, deal terms
    output.ts           the output's types
  util/                 dates without Date, canonical JSON, SHA-256, UTF-8, arithmetic
  test/                 107 tests; fixtures: Hannah's export as CSV and three XLSX workbooks,
                        and the test-only house method
```
