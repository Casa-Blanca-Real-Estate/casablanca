# Dispatch 06 — Comp report: the calculation engine and parser (CR-2)

**Dispatched by:** Casanova · 2026-09-24 · **To:** Abacus
**Builds from:** `docs/comp-report/01-design.md` §4, §6 (all of it), Appendix A (including A.5)
**Depends on:** nothing — pure code, start now
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` when done. Never merge — Casanova
or Kimani merges. Sign PRs, PR comments and commits "— Abacus (CR-2)".**

## Why this exists

Every number in every comp report comes from this engine. Its first non-negotiable: **code computes, the
model explains** — the AI argues and writes, and never produces a figure. So the engine has to be the most
trustworthy part of the tool, and it's built and tested alone, before anything depends on it.

## Where it lives

`tools-src/comp-report/engine/` — pure TypeScript. **No DOM, no network, no clock**: as-of dates come in
as inputs. It must be importable by the Vite app and by Netlify functions alike, because it runs in both
— the browser for instant recompute, the server for stored versions.

**Mason (Dispatch 05) is scaffolding the app around this folder in parallel** and won't touch it. Keep
root config changes (`package.json`, `tsconfig`) minimal and expect to merge with Mason's. If your PR
lands before his, add `/tools-src/*` to the forced-404 list in `netlify.toml` yourself — `publish = "."`
serves the whole repo root.

## Scope — §6 of the design, all of it

1. **Types** — money in integer dollars, area in integer square feet; every input a sourced value
   `{ value, source, as_of, confidence }` with the §6.1 sets.
2. **Parser** — the StreetEasy comp export as CSV and XLSX (same schema). Columns mapped by header name,
   never position; versioned; tolerant — unknown columns kept and reported, missing ones warned. Parse
   `"2,201 ft²"`, `"$4,650,000"`, `"~1,840 ft²"` (approximate). **Ignore the export's `$/Sqft` column** —
   recompute it with its basis. Flag `/closing/` URLs. Split features, amenities and policies into tags;
   derive service level, outdoor *presence* (the export has no outdoor size), parking and views. Emit a
   **stable property key** — normalised address and unit, plus the StreetEasy listing id where present —
   so records accumulate across imports (§12).
3. **Indicators** (§6.3) — evidence classes never mixed; unit-rate indicators (median, mean, anchor) and
   adjusted-price indicators; implied subject values; sale-to-ask; days on market; where asks sit.
4. **Two results** (§6.4) — *on the facts* and *with estimates*.
5. **The range** (§6.5) — base from the agent-chosen lead indicator (median by default, labelled as the
   default); range from lowest to highest implied value among primary sold comps.
6. **Adjustments** (§6.6) — every Appendix A factor as a definition. **The production house method has
   every value `null`.** An applicable factor without a value becomes a *considered, not calculated* line
   in the bridge and moves no number. Agent-stated values land in *with estimates* only. The A.5
   interaction map as structure: substitutes apply the larger adjustment, never the sum; overlapping pairs
   raise a double-counting warning when both carry agent-stated values; complements produce an
   interaction line whose value is undetermined.
7. **House method loading** — production loads the all-`null` file. A separate test-only config
   exercises the arithmetic, and **the engine refuses to load it outside tests.**
8. **Carry, price evaluation and monthly cost** (§6.7) — using the definitions in §6.7 (housing cash
   outflow, ownership carrying cost; principal is not an expense). Accepts deal-terms inputs.
9. **Versioning** — an engine version string, the house-method version, a hash of the inputs;
   deterministic outputs.
10. **A README in the engine folder** — the API and every result field in plain language. Kimani and Noble
    will read it.

**Out of scope:** UI, network, database, Jev, the LLM.

## Tests (§6.8)

Copy Hannah's export into the engine's own test fixtures — from
`docs/comp-report/sources/streeteasy-comp-export-100-barclay-17l-2026-09-23.csv` — so tests don't depend
on a docs path. It must reproduce:

- Sold, all five: mean **$1,906/sqft** (StreetEasy's PDF agrees), median **$2,112**; sold on floor 10+:
  mean **$2,279**
- In-contract and active $/sqft on **ask** basis: 1,625 · 2,387 · 2,400; 2,763 · 3,091
- `~1,840` flagged approximate; 79 Laight #1A flagged as a closing; 100 Barclay #11F contributing no
  unit-rate indication; 101 Leonard #5B with no floor
- Sale-to-ask −3.0%, +12.3%, −4.0%, −4.2%
- **A negative test** that rebuilds StreetEasy's blended "average sale price" of $4,535,000 and its
  $2.2M–$6.0M "range" from the raw rows, and asserts the engine never returns either
- Parser robustness: shuffled, missing and extra columns
- The test config refused outside tests

## Definition of done

Every test passes; the README is complete; a PR is open against `claude/main`, signed.

— Casanova
