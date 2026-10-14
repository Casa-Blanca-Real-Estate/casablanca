# Dispatch 08 — Comp report: the engine for a buyer's argument (CR-2.2)

**Dispatched by:** Casanova · 2026-09-29 · **To:** Abacus
**Builds from:** `docs/comp-report/01-design.md` v0.5: §6.2 (StreetEasy links), §6.3 (*didn't sell*),
§6.5 (the price table), §6.6 (the differences between comps), §6.10 (the comparability checks),
§10.2 (the headline). Also `docs/comp-report/02-screens.md`.
**Depends on:** nothing. **Mason's Dispatch 09 needs phase 1 early**, so ship it as its own PR first.
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` per phase. Never merge — Casanova
or Kimani merges. Sign PRs, PR comments and commits "— Abacus (CR-2.2)".**

## Why this exists

Kimani walked the scaffold and read the new sources:
- Kara's workshop (`sources/kara-comp-reports-workshop-transcript.txt`, read it in full)
- Frankie's email (`sources/2026-07-29-frankie-delessio-comp-email-111-fulton-517.pdf`; its text
  layer is garbled, so render the pages)
- Noble's two goals

**The design has turned towards the buyer.** About 95% of Casa's comps are for buyers deciding what
to offer:
- The report builds to one sentence.
- Mentors pick comps by rules the tool can run.
- Nobody wants house adjustment values. What's wanted is to see how two similar listings differ in
  price and what might explain the gap.
- Many agents add comps one StreetEasy link at a time, not by export.

The engine gives the numbers for all of that. It stays pure, deterministic and dependency-free, as in
CR-2.

## Phase 1 — comp records from a StreetEasy listing page (ship first)

Mason's server reads a listing page with Firecrawl and hands you the extract. You turn it into the
same `CompRecord` the export parser makes.

- **`LISTING_EXTRACT_SCHEMA`:** the JSON schema Mason passes to Firecrawl. Its fields:
  - the address, unit and URL
  - the status: sold, in contract, active, or off the market unsold
  - the sale price and date, the last and original ask, the list date, the contract date if shown,
    and days on market
  - floor, interior size (and whether the page marks it approximate), beds, baths and rooms
  - common charges, taxes and maintenance
  - property type: condo, co-op, condop or townhouse
  - the building: name, units, stories, year built, and whether it's a new development
  - amenities, features and policies, as tags
  - the listing's history (date, event, price)
  - the description

  Keep the wording tight, since the extraction is an LLM's reading of a page: ask for values exactly as
  shown and empty when absent. The existing carousel import schema in
  `netlify/functions/streeteasy-import-background.mjs` is the starting point, not the answer.
- **`compRecordFromListing(extract, { as_of, url })` → `{ record, warnings }`**, in `parser/`:
  - Every value read from the page has source `listing` and input confidence **`inferred`**.
  - A `confirmListingRecord(record)` helper (or an equivalent the app calls on the agent's one-tap
    confirm) promotes those values to `exact`, or `approx` where the page says so.
  - A missing value is missing, never guessed.
  - It uses the same stable property key as the export (`pk1|…`), so a comp added by link and by
    export dedupes.
  - Its warnings match the export parser's where they overlap.
- **A typed-in comp:** `compRecordFromManual(fields, { as_of })`. Source `agent`, `exact` unless the
  agent marks a value as an estimate.
- **Tests:** fixtures for a sold, an in-contract, an active and an off-market page. Also a unit whose
  size is approximate, junk values, and dedupe against Hannah's export.

## Phase 2 — the buyer's argument

1. **"Didn't sell"** (§6.3, D-23 decided: A) is a fourth evidence status, `off_market`.
   - It's a listing that came off the market unsold, taken from a link's status or listing history.
   - Ask basis, never mixed with another status.
   - It has its own statistics, and it's shown against the sold band as a ceiling signal.
2. **The comparability checks** (§6.10) become `checks` on each comp. Each check has a code, a
   message, a suggested tier and the evidence.
   - **The checks:** same building, first floor, private outdoor space on one side only, new
     development against resale, co-op against condo, HDFC, sponsor unit, the sale's age (past 3, 6 and
     12 months), size far off (±25%), floor far off, and distance (only when coordinates exist; say so
     when they don't).
   - **The thresholds are house-method settings.** Their defaults are Kara's, labelled "Kara's rule,
     pending Noble". They're configuration, not valuation magnitudes, so the no-invented-numbers rule
     doesn't cover them. Say so in the README.
   - **A check never changes a tier;** the agent decides.
3. **The differences between comps** (§6.6) become a `pairs` output, for included comps within each
   status (sold with sold first):
   - the gap in price and in $/sq ft
   - the factors that differ, from the comparison machinery run comp against comp (it already runs comp
     against subject)
   - a **clean pair** flag, when only one factor, or one A.5 overlap group, differs

   Also give a per-factor summary of the clean-pair evidence, for example "terrace: about $150/sq ft,
   from 1 clean pair". **Nothing here moves a number.**
4. **The price table** (§6.5): the subject's implied price at $/sq ft steps across each result's
   range. The steps are the primary sold comps' own rates plus round increments that suit the price
   level. It's deterministic, and every row is a `Figure`.
5. **The headline's inputs** (§10.2) become a `headline_facts` object, the only figures a headline may
   cite:
   - the range, as $/sq ft and as a price
   - the base
   - how many primary sales there are
   - the closest comp (the anchor)
   - a summary by status
   - where the agent's number sits

   Each is a `Figure` with provenance. QA's numeric grounding (CR-5) checks a headline against this
   set, so design it for that.
6. **Versions and the README:** bump the engine, parser and house-method versions, and add a "New in
   CR-2.2" section listing your interpretations, as before.

## Not in scope

The Firecrawl call and every screen (Mason, Dispatch 09); the writer and QA (CR-5); house adjustment
values, which stay null (§6.6).

## Definition of done

- **Phase 1:** merged-ready. `compRecordFromListing` and `compRecordFromManual` are tested against the
  fixtures, and a link-added comp dedupes with the same comp from Hannah's export.
- **Phase 2:** the checks, pairs, *didn't sell*, the price table and `headline_facts` are in the
  output, and tested.
- **Every CR-2 guarantee still holds:** the §6.8 figures, the negative test, determinism, purity, and
  the test config refused outside tests.
- PRs are open against `claude/main`, and signed.

— Casanova

## Handoff, 2026-10-13

**Where it stands.** Dispatch 08 is done: phase 1 merged as #55, phase 2 as #58 (`80ea22c`). Casanova
accepted all 27 phase-2 interpretations (the engine README, "New in CR-2.2 (phase 2)"). The floor band
stays Frankie's ±3, labelled "pending Noble", and a "noted" sale (past 3 months) suggests no tier.
Since then, three small changes reached the engine from other tracks, all fine as built:
- #59 (Arbiter): `CHECK_CODES` is exported as a value; the decision layer's registry imports it.
- Casanova, merging #59 and #60 (`8dc026b`): the sale-age label reads "Contract signed …" for a sale
  dated by its contract.
- #62 (Mason, CR-3c): `geocoder` joined `SOURCES`, for `coordinates` only (a building's mapped point,
  `approx`), so the distance check now runs. Its "unknown" message names each building's mapped location.

Engine 0.4.0, parser 0.4.0, house method 0.3.0. `npm run test:engine`: 166 pass on `claude/main` (`aee2e09`).

**Open PRs:** none but this handoff, which is docs only.

**What's next.**
1. **Casanova's engine note: `distance_miles` on `CompOut`.** Sort words every row's distance by
   importing `distanceMiles` from the engine's internals (`workspace/distance.ts` imports
   `engine/compute/checks.ts`). It has to, because the `distance` check carries `measured` only when it
   flags, past ¼ mile. Put the miles on the comp instead:
   - `distance_miles: number | null` — the miles between the home's and the comp's `coordinates`, read
     from the same best values the check reads, so the row and the flag can't disagree. Null without
     both. Compute it once and use it for the check's `measured` too.
   - Same-building comps can carry their near-zero miles; Sort already shows "Same building" first.
   - Bump `ENGINE_VERSION` (and its literal in `test/results.test.ts`), add the field to the README's
     `comps[]`, and test it:
     - it equals a flagged check's `measured`;
     - it's set within ¼ mile, where nothing flags;
     - it's null without coordinates.
   - Swapping `workspace/distance.ts` to read `comp.distance_miles` is Mason's file (rule 8): say so in
     the PR, or offer the one-line change for Casanova to take. Keep `distanceMiles` internal.
2. **Nothing else is dispatched.** Deferred from #58 and not dispatched: comparing judgment factors
   comp against comp, by way of two judgments against the home.

**Gotchas.**
- **The purity scan** (`test/purity.test.ts`) admits only `Math.abs`, `ceil`, `floor`, `max`, `min`,
  `round`, `sign`, `trunc` and `sqrt`. So no `Math.PI` (π/180 is a literal in `checks.ts`), no trig,
  `pow`, `**`, `Date` or `toLocaleString`. A local helper named `from` or `import`, called with a
  string, trips its import check: rename it.
- **The browser-against-Node hash check** lived in the old session's scratchpad. To rebuild it:
  1. Bundle `engine/index.ts` with esbuild twice, once for the browser and once for Node.
  2. Compute Hannah's export with each, the browser bundle in headless Chromium (Playwright, browsers
     in `/opt/pw-browsers`).
  3. Compare `meta.output_hash`.
- **Other code imports engine internals.** `workspace/distance.ts` imports `compute/checks.ts`, and
  `server/decide/registry.ts` imports `catalog/factors.ts`, `compute/output.ts` and `types.ts`. Moving
  any of them breaks Mason's or Arbiter's build, so run the repo-wide `npm run typecheck`,
  `npm run build` and `npm run test:comp-report`, not only the engine's suites.
- **A new member of a union Mason keys on breaks his type check** where he indexes a `Record` or
  switches exhaustively: `EvidenceClass`, `FigureUnit`, `CheckCode`. #58 needed two one-line fixes in
  his code for didn't sell.
- **The house-method files** round-trip `json.dumps(indent=2, ensure_ascii=False)`.
  `house-method.test.ts` asserts that production's valuations hold no number. Only `check_thresholds`
  do, and they're exempt from sign-off and `all_null` by design (configuration, not magnitudes).
- **From Casanova's runbook:** the proxy refuses branch deletion, so Kimani deletes branches. Never read
  `DATABASE_URL`.

**Waiting on Kimani or Casanova.**
- Nothing blocks the engine.
- **For Noble, through Kimani** (`docs/decisions.md`): the floor band (±3 flags 8 of Hannah's 11), the
  ½-mile distance (it flags 6 of the sample's 11), and the glossary's 12 questions. A changed threshold
  is a `check_thresholds` edit with a new basis, needing no sign-off.
- **Casanova:**
  - review and merge this PR, and mark `casa-r7-2` landed;
  - give the restart kickoff its ledger line.

**Restart kickoff:**

> You're **Abacus**, continuing a Casa Blanca Creative Studio track. Read `/CLAUDE.md`, then
> `docs/dispatch/README.md` (your roster row says where you are), then your dispatch file in full, then
> your latest PR and its comments. Carry on from what's next there. Sign as "— Abacus (CR-2.2)".
>
> Your dispatch file is `docs/dispatch/08-comp-report-buyers-argument-engine.md`; its "Handoff,
> 2026-10-13" says where things stand. Your next work is Casanova's engine note: `distance_miles` on
> `CompOut`, so the screens stop importing `distanceMiles`. Open a PR to `claude/main` and never merge.

— Abacus (CR-2.2)
