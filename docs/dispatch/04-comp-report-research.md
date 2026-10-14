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

## Handoff, 2026-10-13

*Written by Surveyor for the move to the new cloud environment. Main at the time: `aee2e09`.*

**Delivered:** [#49](https://github.com/kjcamron/casablanca/pull/49), merged 2026-09-28 as `0c5ee9c`.
It added `docs/comp-report/research/adjustments.md`, with evidence for all 36 Appendix A factors, the
interaction evidence and 17 definition points, plus `glossary-draft.md` (152 entries, all DRAFT) and
`sources.md` (240 keyed sources). Casanova's merge comment on #49 records where each finding went:
- the name collisions and the 17 Appendix A points were folded into design v0.4, and CR-2.1 carries them
  into the engine;
- sequence and compounding became D-18;
- the two legal questions became D-17;
- the 12 glossary questions went to Kimani's actions.

**What changed since, and why it matters for this research.** On D-18 (2026-09-29) the design replaced
house adjustment values with *the differences between comps* (`01-design.md` §6.6). Noble's view is that
the adjustments may never need values. They stay `null` until a gap shows up in use, so the catalog now
works as a checklist for choosing and tiering comps. `adjustments.md` is now evidence held in reserve:
for explaining why two comps differ, and for the day Noble does set a value. It isn't a queue of
numbers waiting to be entered.

**Research threads still open, and where each lives**

| Thread | Where | Whose move |
|---|---|---|
| The house glossary: 152 DRAFT entries and 12 questions for Noble at the top | `docs/comp-report/research/glossary-draft.md`; Kimani's actions in `docs/decisions.md` ("build the house glossary with Noble and the mentors") | Kimani and Noble. Then a pass to fold in their answers, and v0.4's renames (one entry, *Evidence class*, now duplicates *evidence status*, and open question 12 is mostly settled) |
| D-17: (1) is a CMA an "appraisal" under Executive Law §160-a; (2) does transfer tax the buyer pays on a sponsor sale count toward the taxable consideration | `docs/decisions.md` D-17; evidence in `adjustments.md` (the methods section and factor 18) | Kimani, to route to counsel or a closing attorney. (1) before the pilot; (2) only if factor 18 ever gets arithmetic |
| The thresholds that flag most comps: the ±3 floor band flags 8 of Hannah's 11 comps; Kara's ½ mile flags 6 of 11 | `docs/decisions.md` ("for Noble, the thresholds"); `01-design.md` §6.10 | Noble sets or confirms them. Research that bears on them: factor 4 (floor isn't monotonic, and height against neighbouring buildings matters more) and factor 26 (distance is a selection rule; Fannie Mae's market-area guidance) in `adjustments.md` |
| CR-R2, interaction magnitudes for A.5 | `01-design.md` §16; the "Interaction evidence" section of `adjustments.md`, whose "For CR-R2" note lists the only magnitudes found | Not dispatched. Casanova plans to split it by factor group with a search budget up front. It matters less now that values stay null |
| Not reached in CR-R | "What this research could not reach" in `adjustments.md` | Unsearched once the search allowance ran out: avenue vs side street, elevated trains, front vs rear, ceiling height, corner units, part-time doormen, condo conversions, sponsor concession sizes, contract-to-close lags, and NYC and DOS rules on discussing schools. Paywalled: *The Appraisal of Real Estate* (15th ed.), Sirmans et al., and the full Schwartz, Voicu & Horn school-zone study |

**What I'd have done next:** fold Noble's glossary answers and v0.4's renames into the draft once he
answers. Then gather evidence for "the differences between comps": which feature differences explain
price gaps between similar Manhattan listings, by tier. That's the question Kimani asked on D-18, and
it's closer to what the tool now does than the per-factor values were.

**Gotchas about the sources**
- **StreetEasy blocks automated reading.** Its blog was read through the r.jina.ai reader service and
  its help centre through the help centre's public API. Direct fetches return 403.
- **The NYC workhorse is old, and it doesn't model price.** Schill, Voicu & Miller (`[SVM-2006]`) cover
  Manhattan sales from 1984–2002, and its dependent variable is "total value". The working paper was
  read; the *Journal of Legal Studies* version wasn't.
- **StreetEasy's 2022 amenity premiums** (`[SE-2022-features]`) have no size control and "cannot be added
  together". Don't sum them.
- **Neighbourhood tables don't behave like Manhattan-wide ones.** In the Elliman decade surveys, $/sf
  rises with bedroom count Manhattan-wide every year, but often not inside the neighbourhood tables.
- **Some figures are flagged for checking against the original:**
  - the townhouse width-band prices (`[LJG-MN-2026]`, `[LJG-BK-2026]`) were extracted from chart text;
  - two values in `[GGS-2003]` came through garbled;
  - the statute quotes were read through a web tool that returns text in fragments, so check them
    against the official text before the glossary is adopted.
- **One report was only read second-hand.** The IBO's 2017 421-a report couldn't be retrieved (its site
  moved) and is cited through a blog, `[IBO-2017 via AYR-2017]`.
- **The saved copies of the sources are gone.** They lived in the old environment's scratchpad, which
  didn't move. `sources.md` has every URL and says what was read; re-fetch before re-checking a figure.
- The shared web-search allowance ran out partway through CR-R. Budget searches up front.

**Waiting on Kimani:** D-17 (to route to counsel); Noble's 12 glossary questions and the threshold
calls (to take to Noble). **Waiting on Casanova:** nothing blocking. A CR-R2 or follow-up research
dispatch is Casanova's to write when wanted. Until then the track is *research on call for the comp
report*.

**Restart kickoff** — from "Restarting a track in a new session" in `README.md`:

> You're **Surveyor**, continuing a Casa Blanca Creative Studio track: research on call for the comp
> report (no dispatch is queued). Read `/CLAUDE.md`, then `docs/dispatch/README.md` (your roster row
> says where you are), then your dispatch file, `docs/dispatch/04-comp-report-research.md`, in full,
> including its "Handoff, 2026-10-13", then your latest PR and its comments. Carry on from what's next
> there. Sign as "— Surveyor (CR-R)".

— Surveyor (CR-R)
