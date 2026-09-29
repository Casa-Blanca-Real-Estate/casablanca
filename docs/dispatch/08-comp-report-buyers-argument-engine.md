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

1. **"Didn't sell"** (§6.3, D-23 recommendation A) is a fourth evidence status, `off_market`.
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
