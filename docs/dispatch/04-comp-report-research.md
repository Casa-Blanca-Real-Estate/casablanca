# Dispatch 04 — Comp report: adjustment research (CR-R)

**Dispatched by:** Casanova · 2026-09-24 · **To:** Surveyor
**Builds from:** `docs/comp-report/01-design.md` §6.5–6.6, §6.9, Appendix A (including A.5)
**Depends on:** nothing — start now
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` when done. Never merge — Casanova
or Kimani merges. Sign PRs, PR comments and commits "— Surveyor (CR-R)".**

## Why this exists

The comp report tool's engine defines 36 adjustment factors — floor, views, outdoor space, condition,
parking, tax abatements and the rest (Appendix A) — and **none has a number**. That's deliberate:
Kimani's rule is that no placeholder figure ever reaches the product. Every magnitude is set by Noble,
who teaches comps at Casa Blanca, after the prototype exists.

Noble needs evidence to set them. This dispatch produces it: how practitioners actually derive each
adjustment, and what the published evidence says. **It is evidence for a human's calibration, not a set
of defaults.** Nothing you find enters the product without Noble's sign-off.

## Deliverables

All under `docs/comp-report/research/` (already blocked from the public site with the rest of `docs/`).

### 1. `adjustments.md` — the main deliverable

One entry per Appendix A factor, 1 through 36, using the appendix's numbering:

- **How practitioners derive it** — paired or matched sales, grouped-data analysis, hedonic regression,
  cost-based methods where relevant, surveys and rules of thumb, broker practice. What data each method
  needs, and which are feasible for Casa: it has StreetEasy exports now, and a growing record of every
  property its agents import.
- **What published evidence reports** — each finding with its source, date, market (NYC, Manhattan,
  national) and sample, **as reported**. Never average findings into a recommendation.
- **Reliability** — strong, some, thin, or none.
- **Notes** — co-op specifics; whether the effect differs between entry-level and luxury; fair-housing
  sensitivity (school zone especially — it's a real price driver and a recognised steering signal).

A factor with no evidence found still gets an entry that says so.

### 2. `glossary-draft.md` — a draft house glossary

Kimani wants one official definition per term, used by the tool and by every agent — so "monthly carry"
and "mortgage payment" can't drift into meaning the same thing. Draft it from authoritative sources for
Noble and the mentors to make official:

- The carrying-cost family: mortgage payment, interest-only payment, principal, monthly carry, housing
  cash outflow, ownership carrying cost, economic burn, rent leakage, purchase credit.
- NYC comp vocabulary: common charges, maintenance, real estate taxes, tax abatement (421-a, J-51), flip
  tax, sponsor sale, comparative market analysis, sale-to-list ratio, days on market, price per square
  foot (interior only, and with outdoor space), evidence status (sold, in contract, active).
- Every term used in `01-design.md`.

Each entry: definition, synonyms, "not to be confused with", source. **Every entry marked DRAFT.**

### 3. Interaction evidence — a short section inside `adjustments.md`

Factors interact: a private terrace can reduce what a building's roof deck adds; a terrace with a
skyline view can be worth more than the two apart; a high floor often *is* the view, so adjusting for
both double counts. A dedicated study comes later (CR-R2). For now, **note any evidence on interactions,
substitutes, complements or double counting that you come across** — with sources. Don't go looking
beyond what the main research turns up.

### 4. `sources.md` — the bibliography

Every source cited, with access notes (paywalled, free, dated).

## How to work

- **Cite everything.** No unsourced magnitude, anywhere.
- **Prefer primary sources:** appraisal methodology literature, Miller Samuel's research, academic hedonic
  studies of NYC housing, REBNY, StreetEasy and brokerage market reports, NY Department of State
  materials. Say when a source is paywalled.
- **Separate NYC evidence from national**, date every finding, and flag evidence older than about five
  years.
- **Never describe the tool's output as an appraisal** — a compliance rule (§14). Citing appraisal
  practice as a source is fine.
- **Docs only.** No code.
- If an Appendix A definition looks wrong or incomplete, say so in your PR. Don't edit the design doc —
  Casanova owns it.

## Definition of done

Every factor 1–36 has an entry; the glossary draft covers the carrying-cost family and the terms used in
`01-design.md`; sources are complete; a PR is open against `claude/main`, signed.

— Casanova
