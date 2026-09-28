# Adjustment research — the evidence behind Appendix A

**CR-R · Dispatch 04 · Surveyor · 2026-09-24.** Evidence for Noble's calibration of the adjustment
catalog in `../01-design.md` Appendix A. **These are not defaults.** Nothing here enters the product
without Noble's sign-off, and no finding is averaged into a recommended number: each is reported as its
source reported it. Companion files: [`sources.md`](sources.md) (every `[key]` used here) and
[`glossary-draft.md`](glossary-draft.md).

## How to read an entry

Every factor 1–36 has an entry, numbered as in Appendix A, in four parts:

- **How practitioners derive it** — the methods used to put a number on the factor, what data each
  needs, and whether Casa can run it. "Casa's data" means the StreetEasy comp export (31 columns; no
  coordinates, no outdoor size, no year built, no condition), the record of every property its agents
  import (§12), and public NYC records (ACRIS deeds, Department of Finance rolling sales).
- **What published evidence reports** — one bullet per finding, split into **NYC**, **other US** and
  **international**. Each gives the figure as reported, the market, the data period, the sample, the
  method, and what was actually read: the full text, the abstract only, or a secondary report (a news
  article about a study). `[>5y]` marks evidence whose data ends, or whose publication falls, before
  about September 2021.
- **Reliability** — how much the evidence can bear, not how much the factor matters:
  - **Strong** — several independent sources with transparent methods, applicable to NYC, recent or
    repeatedly confirmed.
  - **Some** — at least one credible, method-transparent estimate applicable to NYC, or consistent
    evidence from comparable markets, but thin on NYC, dated, or methodologically limited.
  - **Thin** — practitioner rules of thumb, anecdotes, figures published without method, or evidence
    from markets unlike NYC.
  - **None** — nothing found; what was searched is said.
- **Notes** — co-op specifics, whether the effect differs between entry-level and luxury, and
  fair-housing sensitivity where it applies.

**Figures from different studies are not comparable with one another** — different markets, periods,
specifications and definitions. They sit side by side so Noble can weigh them, never so they can be
combined. A percentage from a regression is the effect *with the study's other variables held
constant*; a percentage from a with-and-without comparison is not, and usually bundles other
differences. Each entry says which kind it is.

**Compliance.** Appraisal practice is cited throughout as a source of method. The tool's output is a
comparative market analysis, never an appraisal (§14).

## At a glance

| # | Factor | Reliability | Strongest NYC evidence | What Casa can run now |
|---|---|---|---|---|
| 1 | Interior size | Some | Hedonic elasticities, Manhattan 1984–2002 | Same-building pairs; grouped $/sf |
| 2 | Bedrooms and bathrooms | Some | Hedonic, size held constant, 1984–2002 | Grouped medians; pairs |
| 3 | Layout and efficiency | Thin | StreetEasy "flex space" coefficient, 2020–22 | Market-resistance rule only |
| 4 | Floor | Some | Hedonic per-floor coefficients, 1984–2002 | Same-building pairs by floor |
| 5 | Exposure and light | Thin | Manhattan office daylight rents only | None without an exposure field |
| 6 | Views | Some | Hedonic view ratings, 1984–2002 | Tags as flags; pairs by line |
| 7 | Outdoor space | Some | StreetEasy 2020–22; hedonic 1984–2002; Miller's ratio | Presence only — size needed |
| 8 | Condition | Some | Hedonic condition ratings, 1984–2002 | Agent rating (UAD scale) + pairs |
| 9 | Finishes and systems | Some | StreetEasy 2020–22 (laundry, dishwasher, AC) | Tags as flags |
| 10 | Ceiling height and volume | None | — | — |
| 11 | Unit type | Thin | Broker and appraiser statements | Parse "PH" labels |
| 12 | Noise and street position | Thin | Floor-curve commentary only | Agent input |
| 13 | Private storage and extras | Thin | Trade-press sale prices | Agent input |
| 14 | Service level | Some | Hedonic "attended lobby"; StreetEasy doorman | Tags as flags |
| 15 | Amenities | Some | StreetEasy 2020–22 amenity premiums | Tags as flags (non-additive) |
| 16 | Building era and type | Some | Historic-district study; hedonic prewar | Needs year built |
| 17 | Building size | Thin | Tiny per-unit hedonic effect, 1984–2002 | Units and stories in export |
| 18 | Sponsor and new development | Strong / some / none | Statutory transfer taxes; no concession data | Transfer-tax arithmetic |
| 19 | Carrying costs | Some | Named broker capitalisation rules; DOF rules | Capitalise the difference |
| 20 | Tax abatements | Some | IBO 2017 (secondary); program rules | Present value of remaining benefit |
| 21 | Building financials | Thin | 2002 appraiser rules of thumb | Agent input |
| 22 | Policies | Some / thin / none | Hedonic financing limits and flip tax | Agent input |
| 23 | Parking | Thin | Trade-press space prices; StreetEasy valet | Presence tags only |
| 24 | Ground lease | Some | Broker ranges; hedonic condo effect | Agent input + lease term |
| 25 | Micro-location | Some | Second Avenue Subway; High Line | Same-building/neighbourhood filters |
| 26 | Distance from subject | None (as adjustment) | Not adjusted in practice | Selection only |
| 27 | School zone | Some | NYC abstract-only study; 2010 raw comparison | Analyst view only |
| 28 | Recency and market movement | Strong (method) | Elliman, StreetEasy index, Case-Shiller condo | Index time-adjustment |
| 29 | Sale conditions | Some | None for NYC; Massachusetts forced sales | Flag $0 and closing-only records |
| 30 | Concessions and credits | Thin | Rules only | Agent input |
| 31 | Combination units | Thin | Miller Samuel commentary, 2014 | Agent input |
| 32 | Evidence status | Strong (classes) | Elliman listing discount and DOM | Casa's own sale-to-ask |
| 33 | Air and development rights | Thin | Furman Center TDR prices, 2003–11 | — |
| 34 | Lot size, width and frontage | Thin | Townhouse broker averages by width | — |
| 35 | Legal use and C of O | None | Definitions only | — |
| 36 | Rental income and yield | Thin | Asking-based gross yields by size | — (no rents in export) |

## Key sources used across many entries

Four sources recur. Their limits are stated once here and apply wherever they're cited.

- **Schill, Voicu & Miller [SVM-2006]** — a hedonic study of Manhattan co-op and condo sales, 1984–2002
  (99,490 sales from Miller Samuel's database: 30,583 condo, 68,907 co-op), with census-tract fixed
  effects and year dummies; working paper July 2006, published in the *Journal of Legal Studies*, June
  2007. Read in full (working-paper version; the journal version may differ). Its Table 5 gives the
  only controlled NYC estimates found for many factors — floor, view, condition, outdoor space,
  fireplace, central air, attended lobby, prewar, parking, ground lease, financing rules, flip tax.
  **Three cautions.** The data are 24–42 years old `[>5y]`. The dependent variable is not sale price
  but "total value": price plus the present value of maintenance or common charges, plus a co-op's
  share of the building mortgage — so a percentage effect on total value is not the same percentage of
  price. And each coefficient holds the study's other variables constant; the "percentage effect" is
  the paper's own conversion.
- **StreetEasy's amenity study [SE-2022-features]** — "These NYC Home Features Command the Highest Price
  Premium for Sellers", 9 September 2022: OLS regressions on 55,000+ NYC condo and co-op sales that
  closed June 2020 – early August 2022, confirmed against ACRIS, split at $2.5M (the 90th percentile).
  The premium is the closing price above the neighbourhood median. Controls: bedrooms, bathrooms, when
  the building was completed, condo or co-op, neighbourhood — **not square footage.** StreetEasy's
  caveats: the premiums "cannot be added together to determine a cumulative impact", and listing an
  amenity "does not guarantee or cause" a higher price. Only amenities significant and present in at
  least 2% of listings are reported. Read in full through a reader service (direct fetch is blocked),
  with the published table:

  | Rank | Below $2.5M | Premium | Above $2.5M | Premium |
  |---|---|---|---|---|
  | 1 | In-unit washer/dryer | 14.1% | Private patio/terrace | 10.7% |
  | 2 | Gym | 12.3% | Hot tub | 10.2% |
  | 3 | Pool | 11.8% | Basketball court | 10.1% |
  | 4 | Children's playroom | 11.0% | Valet parking | 8.9% |
  | 5 | Doorman | 10.9% | Golf simulator | 8.8% |
  | 6 | En-suite bathroom | 9.4% | Pool | 7.1% |
  | 7 | Refrigerated storage | 9.4% | Shared meeting room | 7.0% |
  | 8 | Dishwasher | 9.0% | Refrigerated storage | 6.9% |
  | 9 | "Flex" space | 8.9% | Concierge service | 6.8% |
  | 10 | Shared patio/terrace | 7.5% | Central AC | 5.9% |

  The text adds a shared roof deck at 6.2% (not in the table) and gives the playroom as 11.1%.
- **The Elliman Report and other Miller Samuel data** [Elliman-Q4-2025; Elliman-Q3-2025;
  Elliman-Decade-2025] — quarterly and ten-year Manhattan statistics (medians, average $/sf, listing
  discount, days on market) by segment. These are grouped figures: they move with the mix of what sold,
  and Miller Samuel's own methodology says "It is improper to apply these statistics to the square
  footage, room count or other attributes of a specific property" [MS-Methodology].
- **Fannie Mae, Freddie Mac and the redesigned appraisal form** [FNMA-B4-1.3-09; FRE-Guide-2022;
  URAR-2026] — practice rules, not market evidence: adjustments must reflect the market's reaction; no
  percentage limits; time adjustments from the contract date; a sales grid that separates proximity
  (not adjustable) from location (adjustable). The redesigned form (UAD 3.6) is mandatory from 2
  November 2026 [FRE-UAD].

## How practitioners derive adjustments — the methods

The appraisal literature's standard list of techniques, as described in public sources — the Appraisal
Institute's *The Appraisal of Real Estate* (15th ed., 2020) itself is paywalled and was not read; the
descriptions come from UBC's review notes on the 3rd Canadian edition [UBC-ARE-2010], an appraiser's
summary of the 14th edition [Dell], and the Texas appraiser board [TALCB-2019], all `[>5y]`.

| Technique | What it is | Data it needs | Casa |
|---|---|---|---|
| **Paired data** | "two similar sales that exhibit a difference in only one attribute with the price difference reflecting the value of the attribute" [UBC-ARE-2010] | Many near-identical sales; "The key element in the reliable use of the method is the availability of data" | Partly — same-building pairs, which the property record accumulates |
| **Grouped data** | Sales grouped by one variable, compared across groups | "many sales available all with similar characteristics" | Partly — common attributes only; groups confound other differences |
| **Secondary data** | Published studies, indices, agency data "used to support analysis derived from other methods" | Published research | Yes — this document |
| **Statistical (regression)** | A hedonic model holding other attributes constant | Large samples; one practitioner reports a rule of thumb of 66 sales for two variables [Cullen-2017] | Later, once the property record is large |
| **Graphic** | "the visual display of data and the application of statistical curve fit analysis" | As grouped data | Yes — e.g. $/sf against floor within a building |
| **Trend** | A time series, mainly for market-conditions adjustments — "Usually adjustment is a monthly percentage figure based on actual sales" | Many dated sales, or an index | Yes (factor 28) |
| **Cost** | Depreciated cost or cost to cure — "Support adjustments as cost does not equal value" | Cost data | Partly — as a cap or cross-check |
| **Capitalisation of income differences** | "the loss of income due to some deficiency is capitalized into a capital value" | Rents and a capitalisation rate | Partly — carry differences (factor 19); no rents |
| **Relative comparison** (qualitative) | Comps rated inferior, similar or superior; "Reliable results may be obtained by bracketing the subject" | Judgment | Yes — needs no magnitudes |
| **Ranking** (qualitative) | Comps sorted on an element of comparison relative to the subject | Judgment | Yes |

**The sequence of adjustments.** Transactional adjustments come first — real property rights conveyed,
financing terms, conditions of sale, expenditures immediately after purchase, market conditions — then
property adjustments: location, physical, economic characteristics, use, non-realty components
[UBC-ARE-2010] `[>5y]`. Freddie Mac: "Comparable sales must be adjusted to the subject property, except
for sales and financing concessions that must be adjusted to the market at the time of the sale"
[FRE-Guide-2022]. Whether the 15th edition says transactional adjustments compound while property
adjustments add was **not verified** — it matters for the engine's additive model (§6.5) if any
magnitude is a percentage.

**What lender guidance requires** (practice rules, not market evidence):
- Adjustments "must reflect the market's reaction (that is, market based adjustments)"; Fannie Mae has
  "no specific limitations or guidelines associated with net or gross adjustments" [FNMA-B4-1.3-09].
  The old 15% net / 25% gross guidelines were removed by announcement SEL-2014-16, 16 December 2014
  [FNMA-SEL-2014-16, secondary]. Freddie Mac likewise "does not have limitations on gross or net
  adjustment percentages" [FRE-Guide-2022].
- Time adjustments run from each comp's **contract date** to the effective date, "supported by
  evidence"; "Use of home price indices (HPIs) to support time adjustments is consistent with our
  policy" [FNMA-B4-1.3-09; FRE-Bulletin-2025-7].
- The redesigned form's sales grid: "$0" means the appraiser "has considered the difference and
  determined that there is no measurable impact", while a blank means no difference; "Do not duplicate
  line items and/or their adjustments"; each comp gets a weight — "Most", "Less" or "No Weight"
  [URAR-2026]. The first rule is close to the design's *considered, not calculated*; the second is the
  double-counting rule.

**How appraisers actually derive them** — the practice evidence:
- "appraisers sometimes rely on the subjective application of adjustments based on experience and
  intuition, rather than the application of a recognized method" [TALCB-2019] `[>5y]`.
- **Knowing the target moves the result.** Of 8,533 Fannie Mae properties appraised twice within six
  months (2012–15), "the post-contract appraisal was on average 4.2% higher than the pre-contract
  appraisal for the identical property"; the appraiser who knew the contract price "used a different set
  of comparable transactions, price adjustments, and weights" [Eriksen-2020] `[>5y]`. The same study:
  two appraisals of one property "agreed on quality for only 60.1% and agreed on condition even less -
  55.9% of the time". This is the evidence behind keeping the agent's call and target out of the
  neutral valuation (§8.4), and it bears on how consistent condition inputs can be (factor 8).
- **Adjustments are asymmetric.** Across ~730,000 purchase appraisals and 2.1M subject–comp pairs
  (2015–16), "higher priced comps receive 0.36% downward adjustment for every 1% of price differential
  with the subject on average, whereas lower priced comps receive a 0.77% upward adjustment"
  [Mayer-Nothaft-2022] `[>5y data]`.
- **Time adjustments are rare and too small.** Over 45M appraisals (2015–23), time adjustments were made
  for "around 10% of properties"; they are "underutilized, too small, applied less frequently in minority
  areas", and their limited use "accounts for as much as 67% of the underappraisal bias in Black
  neighborhoods" [Doerner-Susin-2024, abstract]. A fair-housing reason, as well as an accuracy one, to
  time-adjust every comp consistently (factor 28).

**A CMA is not an appraisal.** The NY Department of State lists "Market value estimates as a real estate
licensee in connection with the listing and/or sale of real estate (i.e., 'comparative market
analysis')" as unacceptable appraisal experience [NYDOS-Appraiser-FAQ], and Executive Law §160-jjjj(3)
carves out "a comparative market analysis for the purpose of or intention to list or sell real estate"
[NYDOS-AMC-FAQ]. No DOS page found says in so many words that a CMA "is not an appraisal", and Executive
Law §160-a defines appraisal broadly [NY-Exec-160-a] — so the tool's labelling rule (§14) is the safe
convention, and the disclaimer wording (D-13) is worth a counsel check.

## Unit

### 1. Interior size

*Appendix A: area differences, including large units that don't trade linearly with smaller-unit
$/sqft. Export (may be approximate). Condo; co-op by rooms.*

**How practitioners derive it**

- **From the market, not a rule of thumb.** Fannie Mae requires adjustments to reflect the market's
  reaction, and uses size as its example: a $20/sf rule-of-thumb adjustment is inappropriate "when
  market analysis indicates the adjustment should be $100 per square foot" [FNMA-B4-1.3-09].
- **Not the comps' average $/sf.** Average $/sf bundles every other attribute of the sale; using it as
  the size rate counts floor, view, outdoor space and building again [JVM-2022; ABuzz-2019 —
  practitioner illustrations]. The marginal value of a square foot is what's wanted.
- **Paired sales** — two sales in the same building or line that differ mainly in size. Data: same
  building, close dates, reliable square footage. *Casa: partly* — exports carry building, unit, floor,
  sqft, price and date, and the property record will accumulate pairs, but pairs per building are
  few and the square footage may be approximate.
- **A slope within a homogeneous segment** — regress price on area within one building or one
  neighbourhood-and-bedroom group and read the slope as $/sf [BHAM-2023, an Alabama single-family
  illustration]. *Casa: technically yes*; segments will be small and approximate square footage adds
  noise.
- **Size-adjustment curve** — a fixed percentage change in unit price per doubling of size, choosing the
  curve that minimises dispersion of the adjusted comps [Dilmore-1994 `[>5y]`]. Designed for land; on
  five to ten comps it can fit noise.
- **Hedonic regression** — log value on log area plus the unit's other features, giving a size
  elasticity *conditional on* bedrooms, baths and the rest [SVM-2006]. Needs tens of thousands of sales.
  *Casa: later*, once the property record is large.
- **Measurement basis comes first.** Fannie Mae requires interior-perimeter measurement for condo and
  co-op units and says ANSI Z765 "cannot be used" for apartment buildings [FNMA-B4-1.3-05]. New York
  condo offering plans must state each unit's "approximate total area" and disclose the method used —
  the rule requires disclosure, not a method [NYAG-13NYCRR-20.3]. Brokers say offering-plan figures
  count exterior walls at 100% and shared walls at 50% [NYCBroker-2023; ELIKA-2024-sqft], and that co-op
  listing figures "can be overstated by a significant margin, like 15% to 20%, or even higher"
  [NYCBroker-2023, broker blog, no data]. StreetEasy's comps tool includes *estimated* square footage
  [OM-2026, secondary]. *Casa can flag the `~` figures but cannot convert between bases without floor
  plans.*

**What published evidence reports**

*NYC*
- **Size elasticity, conditional on bedrooms, baths and other features: 0.78 (condo), 0.61 (co-op)** —
  "A 10 percent increase in square footage is associated with a 6.1 percent increase in the value of a
  cooperative apartment and a 7.8 percent increase for condominiums." Manhattan · 1984–2002 · 99,490
  sales · hedonic with census-tract fixed effects · full text (working paper) · `[>5y]` [SVM-2006]. The
  dependent variable is "total value", not price — see *Key sources*.
- **Average $/sf rises with bedroom count, Manhattan 2025:** studio $1,073 · 1BR $1,202 · 2BR $1,473 ·
  3BR $1,892 · 4+BR $2,480 · all $1,659 (11,393 sales). Co-ops $904 · $933 · $1,147 · $1,349 · $1,790;
  condos $1,326 · $1,535 · $1,778 · $2,265 · $2,952. Manhattan-wide, the same ordering holds in every
  year 2015–2024, for co-ops and condos alike. Inside the reports' neighbourhood tables it often breaks
  (Downtown co-ops 2024: 3BR $1,499, 4+BR $1,370). Grouped averages across buildings and neighbourhoods
  · full text [Elliman-Decade-2025; Elliman-Decade-2024]. Miller Samuel's own caution: "It is improper to apply these statistics to the
  square footage, room count or other attributes of a specific property" [MS-Methodology].
- **Tier context, Q4 2025:** Manhattan average $2,950/sf for the top 10% of sales (entry threshold
  $4.2M) against $1,629/sf overall; new development $2,597; co-op $1,154; condo $2,099 · 2,631 closed
  sales · full text [Elliman-Q4-2025].
- **How often square footage is missing:** 4.9% of condo and 9.3% of co-op sales in Miller Samuel's
  1984–2002 database [SVM-2006] `[>5y]`.

*Other US*
- Fannie Mae's $20-versus-$100 example is policy illustration, not market evidence [FNMA-B4-1.3-09].
- **The implicit price of a square foot varies within a city** — Milwaukee single-family, from $18 to
  $120/sf in different parts of the city (Yu 2007, geographically weighted regression) · secondary,
  via an annotated bibliography · `[>5y]` [NIST-TN1811].
- **Square-footage coefficients vary by location and by model specification** — meta-analysis of US
  hedonic studies · abstract only, no magnitudes · `[>5y]` [Sirmans-2006]. Buyers of higher-priced
  homes value square footage differently (quantile regression, Utah) · abstract only · `[>5y]`
  [Zietz-2008].

*International* — nothing specific to sale-price size effects was read.

**Reliability: some.** The method is clear (market-derived, not average $/sf, on a consistent
measurement basis). NYC has one large controlled estimate, but its data are 1984–2002 and it models
total value, not price. Current NYC figures are grouped averages confounded by building and
neighbourhood mix. The export's square footage is itself uncertain.

**Notes**
- *Co-op:* the co-op elasticity (0.61) is lower than the condo one (0.78) [SVM-2006]. "Co-op by rooms"
  describes missing listing data, not a pricing law — square footage was missing for only 9.3% of co-op
  sales in the 1984–2002 data, and Elliman publishes co-op $/sf.
- *Entry-level vs luxury:* market-wide $/sf rises with size and tier [Elliman-Decade-2025;
  Elliman-Q4-2025], while within a model value rises less than proportionally with area [SVM-2006].
  These describe different things — a cross-market mix effect and a within-market marginal effect — and
  Appendix A's "don't trade linearly" doesn't say which it means.
- *Fair housing:* nothing specific. General caution when borrowing hedonic specifications: published
  models have included neighbourhood racial composition as a variable [Sirmans-2005, abstract].

**Interactions** — see *Interaction evidence*: size ↔ bedrooms and baths; size ↔ measurement basis.

### 2. Bedrooms and bathrooms

*Appendix A: count differences — the primary driver for co-ops. Export. Both.*

**How practitioners derive it**
- **Hedonic regression with size held constant** — bedroom and bath effects measured on top of square
  footage [SVM-2006]. Without square footage (common for co-ops), bedroom counts absorb size.
- **Grouped medians by bedroom count** — unconditional differences that include size and building mix
  [Elliman-Decade-2025]. Casa can compute these from exports now, subject to Miller Samuel's caution
  above.
- **Paired sales** — similar size, same building, different count (a 2BR against a 1BR-plus-den).
  *Casa: rarely*; needs floor plans to confirm the size is really similar.
- **Room-counting rules.** Condo offering plans list bedrooms and bathrooms and disclose how rooms are
  counted [NYAG-13NYCRR-20.3]; Fannie Mae requires that room counts for the same comparable not change
  between reports [FNMA-B4-1.3-05]; co-op unit types are named by room count — a classic six "include[s]
  a living room, dining room, kitchen, two full bedrooms, and a former live-in staff room"
  [BU-2025-classic6; ELIKA-2021-classic6]. *Casa: yes, as data-cleaning rules.*

**What published evidence reports**

*NYC*
- **Per bedroom, size held constant: +7.09% (condo), +15.27% (co-op). Per bath: +10.52% (condo),
  +13.28% (co-op).** "For cooperative apartments, each bedroom adds 15.3 percent to the value of an
  apartment. For condominiums, the value of a bedroom is much lower—7.1 percent." Manhattan ·
  1984–2002 · 99,490 sales · hedonic · full text · `[>5y]` [SVM-2006]. How half baths were counted isn't
  stated.
- **Median price by bedroom count, Manhattan 2025** (unconditional): all sales studio $516,600 · 1BR
  $840,000 · 2BR $1,620,000 · 3BR $2,950,000 · 4+BR $5,900,000; co-ops $449,000 · $700,000 · $1,256,250 ·
  $2,225,000 · $4,075,000; condos $690,000 · $1,100,000 · $2,082,000 · $3,940,000 · $7,500,000 · full text
  [Elliman-Decade-2025]. Q4 2025 medians and market shares by bedroom count are in [Elliman-Q4-2025].
- Classic-six premium: described as "prized", no figure [BU-2025-classic6].
- StreetEasy's analyses of bathroom value could not be read (see *What this research could not reach*).

*Other US* — bathroom coefficients "vary significantly by geographical location" and by type of data
(meta-analysis, abstract only, `[>5y]`) [Sirmans-2006]; higher-priced buyers value bathrooms
differently (abstract only, `[>5y]`) [Zietz-2008].

*International* — Vienna asking rents: "the estimated rent effect of additional rooms has almost
doubled" between 2018 and 2021/22 · ~121,700 listings · full text; coefficients only in figures
[Vienna-2025].

**Reliability: some.** The only NYC estimates that hold size constant are large and split by condo and
co-op, but they are over twenty years old and model total value. Current NYC figures are unconditional
medians.

**Notes**
- *Co-op:* both the bedroom and bath effects are larger for co-ops [SVM-2006], consistent with Appendix
  A's "primary driver for co-ops". Staff rooms count as rooms in co-op naming, and are "used as a home
  office" in current listings [BU-2025-classic6].
- *Entry-level vs luxury:* medians widen sharply at 3BR and 4+BR, especially for condos
  [Elliman-Decade-2025]. No NYC tier-specific bedroom or bath estimate found.
- *Fair housing:* nothing specific. Vocabulary is shifting — "maid's room" (2021) to "former live-in
  staff room" (2025) [ELIKA-2021-classic6; BU-2025-classic6]; the house glossary should pick the neutral
  term.

**Interactions** — overlaps interior size (already in A.5); flex and staff rooms blur the bedroom count
(see *Interaction evidence*).

### 3. Layout and efficiency

*Appendix A: split bedrooms, wasted space, room proportions, flex room. Floor plan, agent. Both.*

**How practitioners derive it**
- **Market-resistance test.** Fannie Mae: "Dwellings with unusual layouts and floor plans generally
  have limited market appeal", but "if market acceptance can be demonstrated through the use of
  comparable sales with the same inadequacies, no adjustments are required" [FNMA-B4-1.3-05]. *Casa:
  yes, as a rule* — it says when to adjust, not by how much.
- **Hedonic dummies for layout traits** — multi-level units, loft areas [SVM-2006]. *Casa: partly*; the
  export has a `Loft` tag, but split bedrooms and open plans would have to be coded from floor plans.
- **Listing-keyword premiums** — a home's expected price from location, size, type, beds and baths,
  against what sales with a given phrase achieved [Zillow-2026-features]. Needs very large samples.
- **Buyer-preference surveys** report preferences, not prices.
- **Efficiency (loss factor):** the only NYC figure found is for commercial office space, not homes.

**What published evidence reports**

*NYC*
- **"Flex" space: +8.9%, below $2.5M** — space "that can be converted to a home office, exercise room,
  or baby's room"; flagged in 18% of sub-$2.5M listings sold since 2021, against 11% in 2018–19 · NYC ·
  June 2020 – Aug 2022 · 55,000+ sales · regression without a size control · full text
  [SE-2022-features]. A flex room adds area as well as flexibility, and size isn't controlled.
- **Units on two or more levels: −1.28% (condo), −1.55% (co-op). A loft area within the unit: +8.30%
  (condo), +12.54% (co-op).** Manhattan · 1984–2002 · hedonic · full text · `[>5y]` [SVM-2006]. Loft areas
  appear in 0.1–0.2% of sales; the levels variable is missing for 20–30%.
- Layout is named by Miller Samuel among attributes that vary "within the same … building" and
  influence value, with no figure [MS-Methodology].
- Office context only: Manhattan's loss factor for a single-tenant full floor is "about 27 percent", and
  REBNY guidelines measure "all the way out to the exterior façade" · The Real Deal, 2014 · `[>5y]`
  [TRD-2014-loss]. Not residential evidence; it documents NYC's generous measurement convention.

*Other US* — Zillow's 2026 listing-phrase study (2M+ 2025 listings) reports premiums for outdoor,
kitchen and turnkey phrases but **none for open plan, split bedrooms, home office or flex room** · press
release [Zillow-2026-features].

*International* — Vienna asking rents: "multiple rooms to establish a dedicated home office, an outdoor
area … as well as multiple toilets … all saw their rent premiums increase" (2018 vs 2021/22) · full text
[Vienna-2025].

**Reliability: thin** — some for flex space alone. No sale-price evidence for split bedrooms, open
plans or efficiency, in NYC or elsewhere.

**Notes**
- *Co-op:* prewar classic layouts are defined by separate rooms [BU-2025-classic6]; the co-op
  coefficients for multi-level (−1.55%) and loft area (+12.54%) differ from the condo ones [SVM-2006].
- *Entry-level vs luxury:* no evidence found. *Fair housing:* nothing specific.

**Interactions** — layout ↔ bedroom count (flex rooms); layout ↔ the `Loft` tag and factor 11 (see
*Interaction evidence*).

### 4. Floor

*Appendix A: higher floors trading higher, relative to the building's height. Export. Both.*

**How practitioners derive it**
- **Same-building paired sales**, ideally the same line on different floors — isolates floor from
  building and location. Miller Samuel adjusts "for floor level and view separately" [MS-2010-floor].
  The regression version uses building fixed effects [GGS-2003]. *Casa: yes, partly* — the export has
  `Floor`, `Stories in Building`, building and unit (the unit letter usually identifies the line), so
  relative floor can be computed and same-line pairs will accumulate in the property record.
- **Grouped $/sf by floor** across a market [MS-2010-floor]. *Casa: partly* — needs a large record, and
  mixes buildings; Miller notes the data thin out above the 25th floor.
- **Hedonic regression** with floor, floor², floor bands or a penthouse dummy [SVM-2006; CNS-2013;
  Yu-2007; CPY-2022]. *Casa: later.*
- **Developer floor-premium schedules** in new development — a base increment per floor plus larger
  steps "where the views clear a neighboring building" [Boland, broker blog, illustrative]. A structure,
  not data.
- Broker rules of thumb ("about 1% more per floor, all else equal") [Roebling-2025] — no data given.

**What published evidence reports**

*NYC*
- **Per floor, other features held constant: +0.58% (condo), +0.96% (co-op).** "For cooperatives, each
  additional floor adds 1 percent to the value of an apartment; for condominiums each floor increases
  value by 0.6 percent." Manhattan · 1984–2002 · 99,490 sales · hedonic, with separate view and condition
  ratings in the model · full text · `[>5y]` [SVM-2006]. Mean floor of the sample: 14.9 (condo), 9.2
  (co-op).
- **Floors 31+ about 25% above floors 1–10 in the same building.** Coefficient 0.23 (log price) for
  floors 31+ against 1–10, with building and year fixed effects, which the authors call "about 25
  percent of unit price" and use as "our estimate of the value of a view"; they add that 0.23 "is likely
  to overstate the value of a view". Floors 11–20 and 21–30 read 0.08 and 0.16 in an equation that
  extracts garbled from the PDF — confirm before use. Manhattan condos · deed records 1984–2002 · 20,426
  units in 518 buildings · full text (NBER working paper, Nov 2003) · `[>5y]` [GGS-2003].
- **Grouped $/sf by floor, all 2009 Manhattan closings:** "1st floor – 19.3% jump to the second floor
  reflecting concerns about security, privacy, and noise levels"; "2nd floor – 11.4% jump to the third
  floor"; a jump at the 7th floor reflecting "penthouse and roofline breaks from adjacent 6 story
  buildings"; above the 13th, $/sf "continues to rise" · count not given · full text (chart not readable)
  · `[>5y]` [MS-2010-floor].
- Broker statements without data: "about 1% more per floor, all else equal"; 1st→2nd "nearly a 20%
  jump" [Roebling-2025]; new-development "hurdle" of $10,000 per floor, with $50,000–$100,000 jumps where
  views clear a neighbour [Boland].
- No NYC controlled estimate with data after 2009 was found; StreetEasy has none that could be located.

*Other US*
- **San Diego high-rise condos: +2.2% per floor at the mean, concave;** the penthouse premium
  disappears once floor is controlled; views not controlled · July 2006 – June 2011 · 2,395 sales ·
  hedonic · full text · `[>5y]` [CNS-2013].
- Office rents (commercial, adjacent): "Vertical rent gradients are non-monotonic, independent of
  nearby employment, and large" · abstract only · `[>5y]` [LRS-2018].

*International*
- **Residential rents: a ground-floor premium of "1.5 to 3.5%"**, with the slope above "predominately
  explained by amenities (e.g. views)" · abstract only · `[>5y]` [DH-2018].
- **Singapore: S$9,471.54 per floor (0.63% of the average price), with a sea-view measure in the same
  model** · 1995–2003 · 841 sales · full text (conference version) · `[>5y]` [Yu-2007].
- **Taipei: +0.55% per floor in elevator buildings, −4.21% per floor in walk-ups; ground-floor
  premium 9.61% (elevator) and 8.54% (walk-up)** · 2012–2020 · 76,098 sales · full text · `[>5y data]`
  [CPY-2022].
- **South Korea: top-floor discounts of 1.3% to 8.3%** of resale prices, attributed to heating and
  cooling · 1.9M sales · abstract only [HM-2023].
- The floor premium "diminished as floor level increases", with the same pattern in high- and low-rise
  buildings · abstract only · `[>5y]` [Wong-2011].

**Reliability: some.** Two controlled NYC estimates, both from 1984–2002, plus a 2009 grouped
analysis. Studies elsewhere agree on direction above the ground floor but differ widely in size, and
several find exceptions: ground-floor premiums, walk-up discounts, top-floor discounts.

**Notes**
- *Co-op:* the co-op per-floor coefficient (0.96%) is larger than the condo one (0.58%) [SVM-2006]. The
  Taipei walk-up *discount* is the closest evidence for walk-up stock, much of which is co-op in NYC —
  an observation, not a NYC finding.
- *Entry-level vs luxury:* in Taipei the per-floor premium rises with the price quantile [CPY-2022]. No
  NYC split found.
- *Fair housing:* low. The ground-floor premium is read as the value of access [DH-2018]; describe
  accessibility features, never who a unit suits.
- *Appendix A:* the evidence doesn't support "relative to the building's height" alone. The effect is
  not monotonic; height relative to *neighbouring* buildings matters (Miller's 7th-floor "roofline
  breaks"; brokers' view-clearing steps); and one study finds the same floor pattern in high- and
  low-rise buildings [Wong-2011].

### 5. Exposure and light

*Appendix A: orientation, corner units, open or blocked light. Listing text, agent. Both.*

**How practitioners derive it**
- **Hedonic regression on simulated sunlight or daylight** — GIS sun-hours per dwelling [Fleming-2018];
  daylight simulation of floor plates [Turan-2019]. *Casa: no* — no coordinates, no exposure field.
- **Hedonic orientation dummies** (south-facing and so on) [Lu-2018; Zhong-2022]. *Casa: partly*, once
  exposure is captured from listing text or the agent as a structured field.
- **Same-building pairs across lines with different exposures.** *Casa: partly*, same constraint.
- The condo appraisal form's grid has "Floor Location" and "View" rows but **no exposure or light row**
  [F1073-2005]. Corner units: no method or evidence found.

**What published evidence reports**

*NYC* — no residential evidence found. Adjacent (commercial): "There is a 5 to 6% financial premium for
daylight in office rent prices"; "74% of the floors throughout this Manhattan sample have daylight
autonomy levels below the LEED threshold" · Manhattan offices · 5,145 spaces · daylight simulation plus
hedonic · authors' summary page · `[>5y]` [Turan-2019].

*Other US* — none found.

*International*
- **Wellington, NZ (houses): "each extra daily hour of sunlight exposure is associated with a 2.4%
  increase in house sale price"** · 2008–2014 · 5,584 sales · GIS sun hours with small-area fixed
  effects · full text · `[>5y]` [Fleming-2018]. The same paper cites an unpublished Auckland study
  finding "a 17% price premium for north-facing apartments" (southern hemisphere) · secondary · `[>5y]`.
- **Shanghai: "a south-facing orientation is associated on average with a 14% premium"** · abstract only
  · `[>5y]` [Lu-2018]; **"an extra 7.2%" for south-facing (sunny) against north-facing** · 2019–2021 ·
  40,000+ units · abstract only [Zhong-2022]. Shanghai has strong cultural orientation preferences.

**Reliability: thin.** No NYC residential evidence; the international studies agree on direction but
come from markets unlike Manhattan, or from houses.

**Notes**
- *Co-op / tiers / fair housing:* nothing found.
- *Appendix A:* the factor bundles three measured things — sunlight hours, orientation, daylight — and
  "open or blocked light" overlaps obstructed views (6) and floor (4). A corner unit is also a layout,
  window and often size difference, so a corner adjustment risks counting factors 1 and 3 again.

### 6. Views

*Appendix A: city, skyline, park, water, landmark; open or obstructed; protected. Export tags, listing,
agent. Both.*

**How practitioners derive it**
- **Same-building pairs by line** — a view line against a non-view line. One broker claims "1,000+
  paired comparisons" of park-facing and rear units, without data [Roebling-2026]. *Casa: partly* — the
  export tags "City view", "Skyline view", "Water view", and the unit letter gives the line; there is no
  park or landmark tag and no obstructed/open or protected flag.
- **Grouped $/sf by view type** [MS-2014-centralpark] — confounded by size, floor and line (below).
- **Hedonic view dummies or GIS viewsheds** [SVM-2006; Yu-2007; Turan-2021]. *Casa: tags as dummies,
  later*; viewsheds need a 3-D model.
- **Floor as a proxy for view** [GGS-2003] — a method, but it double counts if floor is also adjusted.
- Appraisal practice keeps view as its own row, separate from floor [F1073-2005; MS-2010-floor].
- **Protection** is checked by confirming zoning, landmark status or air-rights restrictions on the lots
  between the building and the view [Roebling-2026, broker guide].

**What published evidence reports**

*NYC*
- **View rating against "average", other features held constant: "good" +3.47% (condo), +3.07%
  (co-op); "excellent" +8.41% (condo), +11.26% (co-op); "fair" −1.14% (condo, not significant), −8.42%
  (co-op).** "an excellent (versus an average) view is worth 11.3 percentage points for cooperatives and
  8.4 percentage points for" condominiums · Manhattan · 1984–2002 · hedonic, floor in the same model ·
  full text · `[>5y]` [SVM-2006]. The ratings come from Miller Samuel's database, recorded at each sale;
  view is missing for about half the sales.
- **High floor as the value of a view: about 25%** (floors 31+ against 1–10) — see factor 4 [GGS-2003]
  `[>5y]`.
- **Central Park, grouped:** a 75.6% gap between park-view and city-view $/sf on Fifth Avenue — which
  Miller says is not all view: "The average size of a Fifth Avenue sale with a direct park view was 83.2
  percent bigger than an apartment without a park view" · two years of closed sales to Oct 2014 · full
  text · `[>5y]` [MS-2014-centralpark].
- Broker statements without data: Central Park views "often 40–50% higher than comparable non-Park
  units"; river views "often adding 10–20% over interior lines in the same building" [Roebling-2025];
  "35–55% for residential and 50–80% for the most prestigious individual apartments" [Roebling-2026]; a
  protected view "can add anywhere from 10% to 30%" [YRE-2026].
- Adjacent (commercial): "spaces with high access to views have a 6% net effective rent premium" ·
  Manhattan offices · 5,154 spaces · abstract · `[>5y]` [Turan-2021].
- Caution on raw medians: near Central Park South "the two blocks in front of the park have a median
  sale price of $1,225,000, a $515,000 difference" *below* the neighbourhood median — proximity figures
  that don't separate view from mix [PS-2018] `[>5y]`.

*Other US* (single-family waterfront — context only) — Lake Erie: lake view "adds an 89.9% premium to a
house" (Bond, Seiler & Seiler 2002) and "56%" (Seiler, Bond & Seiler 2001), both secondary via [Yu-2007]
`[>5y]`. Benson et al. (1998, Bellingham) could not be opened.

*International*
- **Singapore: "an unobstructed sea view will add an average premium of 15% to the house price"**, with
  floor in the model · 1995–2003 · 841 sales · 3-D GIS viewshed · full text · `[>5y]` [Yu-2007].
- **Shanghai: a landmark view "increases property values by 6%"**, boosted "a further 4%" by south-facing
  · abstract only · `[>5y]` [Lu-2018].
- European rents, water views "as high as 57 percent" · secondary via [CNS-2013] · `[>5y]`.

**Reliability: some.** One controlled NYC estimate by view grade (1984–2002) and one same-building
floor-band estimate its authors read as view. Current NYC figures are broker assertions or grouped
comparisons their own author says are confounded by size.

**Notes**
- *Co-op:* Park-facing stock is largely co-op — Fifth Avenue "Almost entirely co-op" [Roebling-2026] —
  so NYC park-view evidence is co-op-dominated. The co-op "excellent view" effect (+11.26%) exceeds the
  condo one (+8.41%) [SVM-2006].
- *Entry-level vs luxury:* only broker assertions ("50–80% for the most prestigious") [Roebling-2026].
- *Fair housing:* none, provided views are described as outlook, never as who lives in the view.
- *Appendix A:* the export tags (City / Skyline / Water) don't cover the park and landmark views the
  definition lists; obstructed/open and protected aren't in the export; and the literature grades view
  quality (full, partial, share obstructed) rather than a yes/no [Yu-2007].

### 7. Outdoor space

*Appendix A: balcony, terrace, private roof, garden; size; private or shared access. Export (presence
only), listing, agent. Both.*

**How practitioners derive it**
- **A ratio of the interior $/sf (Miller Samuel, NYC):** "terraces are typically valued at 25-50% of the
  ppsf of the interior space", falling off for oversized spaces — "if the terrace is greater than 50% of
  the interior space, the ppsf contribution falls considerably for the additional space" — and adjusted
  for depth and shape, noise and soot on low floors, privacy, parapets and obstructions. Implemented by
  converting outdoor area to interior-equivalent area and adding it to the interior square footage
  [MS-2010-terrace]. *Casa: partly* — the export gives presence only (Balcony, Terrace, Roof deck tags;
  "Shared outdoor space" in amenities), so size must come from the listing, a floor plan or the agent.
- **A lump sum or per-sf schedule by type (UrbanDigs):** "$50,000 to $75,000 … with a balcony under 100
  square feet"; for terraces and gardens "between $200 and $600 per square foot for spaces that range
  from 100 square feet to over 500 square feet" [BU-2024-outdoor, secondary].
- **Grouped with/without comparisons** [BU-2021-outdoor; MKP-2021] — confounded by size, floor, building
  and product type.
- **Hedonic presence dummies** [SVM-2006; SE-2022-features; Chau-2004]. *Casa: tags as dummies, later.*
- **Appraisal treatment:** outdoor space is not living area; the condo form carries it on its own
  "Porch/Patio/Deck" row [F1073-2005]; apartments are measured to the interior walls [MPA-2026].

**What published evidence reports**

*NYC*
- **Presence, other features held constant: terrace +10.69% (condo), +17.47% (co-op); balcony +0.91%,
  +5.17%; garden +4.37%, +12.34%; patio −1.84% (condo, not significant), +7.54% (co-op); roof rights
  +5.51%, +2.61% (neither significant).** "Terraces add between 10.7 and 17.5 percent to value, gardens
  4.4 to 12.3 percent, balconies 0.9 to 5.2 percent" · Manhattan · 1984–2002 · hedonic · full text ·
  `[>5y]` [SVM-2006]. Size of the space isn't in the model.
- **StreetEasy, 2020–22: private patio/terrace +10.7% (above $2.5M, the top premium in that segment);
  shared patio/terrace +7.5% (below $2.5M); shared roof deck +6.2%** · regression without a size
  control; non-additive · full text [SE-2022-features].
- **Miller's 25–50% ratio** — stated on his firm's blog on 5 May 2010 [MS-2010-terrace] `[>5y]`,
  restated as "50 percent of the price per square foot" in Dec 2021 [BU-2021-outdoor] and as "roughly
  equal to 25 to 50 percent" in May 2024 — "That rule of thumb still applies, even after the pandemic"
  [BU-2024-outdoor]. Shape matters: a skinny wraparound "could add 25 cents for each dollar", a
  rectangular terrace "50 cents on the dollar" (paraphrase in [BU-2021-outdoor]).
- **Another broker's ratio (2020):** "historically priced at about 25-30 percent of the interior square
  footage, but we are now seeing valuations of approximately 40-50 percent" [OTM-2020] `[>5y]`.
- **SERHANT, with vs without private outdoor space (raw):** Manhattan median $1,440,000 against
  $1,100,000, "31 percent higher", rising to 39% after lockdown; $/sf $1,625 against $1,345, "a premium of
  21 percent"; Brooklyn 14% rising to 18% (median), 4% ($/sf) · July 2018 – Nov 2021 · townhouses excluded
  · no controls · secondary [BU-2021-outdoor; Habitat-2021-outdoor].
- **Marketproof, new Manhattan condos (raw):** $2,665/sf with outdoor space against $2,115 without,
  sales since March 2020; $2,433 against $2,310 in March 2018 – March 2020 · data-vendor blog · `[>5y]`
  [MKP-2021].
- **Incidence:** "Roughly 22 percent of apartments that sold in Manhattan in the last 12 months had
  outdoor space, more than the 14 percent … in 2017" (Miller, 2024) [BU-2024-outdoor].

*Other US* — no hedonic study of condo balconies or terraces was opened.

*International* — Hong Kong: "A balcony is found to have a positive effect on the value of a property
irrespective of the quality of the view" · one private estate · abstract only · `[>5y]` [Chau-2004].

**Reliability: some.** A long-standing, named NYC practitioner ratio; controlled NYC presence estimates
(1984–2002 and 2020–22); several raw with/without datasets. No controlled NYC estimate uses the *size*
of the space — the input every method needs and the export lacks.

**Notes**
- *Co-op:* the co-op coefficients are larger for every type [SVM-2006]. "Outdoor space can be factored
  into the number of shares you have in a co-op, increasing your monthly maintenance costs"
  [BU-2024-outdoor] — so co-op carry (19) may already reflect it.
- *Entry-level vs luxury:* private outdoor space is the top StreetEasy premium above $2.5M; below
  $2.5M it's shared space that appears [SE-2022-features]. SERHANT's premium differs by borough
  [BU-2021-outdoor]. "A large terrace on a relatively small apartment can hike monthly fees for buyers
  that have limited budgets" [BU-2024-outdoor].
- *Timing:* the evidence shows the premium moving around 2020–21 [BU-2021-outdoor; MKP-2021; OTM-2020],
  so the estimation period matters.
- *Fair housing:* none.
- *Appendix A:* value depends on size relative to the interior (the fall-off above 50%), shape and depth,
  floor, privacy and view [MS-2010-terrace; BU-2024-outdoor] — the definition names only size and
  access. "Shared access" overlaps building amenities (15): StreetEasy measures shared terraces and roof
  decks as building amenities.

### 8. Condition

*Appendix A: mint, renovated, good, original, needs work. Listing text and photos; the agent judges.
Both.*

**How practitioners derive it**
- **Rate first, on a written scale.** Appraisal practice assigns a standard condition rating, then asks
  whether a difference needs an adjustment. Under the redesigned form (UAD 3.6) condition is rated C1–C6
  "on an absolute basis, not on a relative basis", overall, interior and exterior [UAD-Ratings-2025]:
  C1 new and unoccupied, "completed within the past 12 months"; C2 "entirely remodeled within 36 months";
  C3 "Major components or rooms that have been recently updated" (e.g. "Remodeled kitchen or
  bathroom(s)"); C4 "Kitchen or bathrooms that are dated but fully functional"; C5 kitchen or bath "in
  disrepair"; C6 "not useable or functional". Fannie Mae: "Properties can have the same rating or
  description and still require an adjustment" [FNMA-B4-1.3-06]. *Casa: yes, as the agent's input* — a
  written scale makes agents' judgments consistent; it doesn't give amounts.
- **Paired sales in the same building or line**, after taking out floor and size. A design-build firm's
  worked example uses two listings in one Upper West Side co-op [GKBNY, a renovation seller]: "Ideally
  if you can find a renovated unit in the same line that was recently sold". *Casa: partly* — same
  building pairs exist; condition must come from the agent or listing text.
- **Grouped data by condition class**, classifying listings by keywords (UrbanDigs) [BU-2021-renovated;
  TRD-2021-fixer] — unbalanced samples and no size or location controls.
- **Keyword or text hedonics** — listing-text phrases priced against an expected price
  [Zillow-2025-remodeled; NS-2017]. Needs thousands of sales with text.
- **Cost to cure, capped by contribution** — the market doesn't repay cost one-for-one (see factor 9 for
  cost-recovery surveys). The worked example prices a luxury Manhattan renovation at "$700–$1,000 per
  square foot" [GKBNY].
- **Photo-based scoring** by vendors, and StreetEasy's AI-inferred renovation status — condition inputs,
  not amounts [Swish-2025, vendor blog; OM-2026].

**What published evidence reports**

*NYC*
- **Condition rating against "average", other features held constant: "good" +3.93% (condo), +9.09%
  (co-op); "fair" −5.47% (condo), −1.96% (co-op).** Manhattan · 1984–2002 · hedonic · full text · `[>5y]`
  [SVM-2006]. Condition is missing for about 40% of sales.
- **UrbanDigs, renovated vs unrenovated, Manhattan (raw):** median asking price for unrenovated
  property fell "from about $925,000 to just over $750,000" while renovated rose "from about $1,225,000
  to near $1,375,000" (asking prices; article of 10 Mar 2021) [BU-2021-renovated] `[>5y]`; the gap in
  sale prices "has widened by nearly 30 percent in the last year" — "the average sale price of 3,800
  renovated apartments" against "only 437 unrenovated" (Oct 2021) [TRD-2021-fixer]. Both secondary;
  "widened by nearly 30 percent" is ambiguous as reported.
- Opinions in the same articles: "the premium for a finished apartment (15 to 25 percent) remains the
  same" (a renovation consultant); "an additional $100,000 to 200,000" for a fully renovated home (a
  broker).
- **Paired listings, one UWS pre-war co-op:** turnkey 10B at "$6.5M ($2,500/sq ft)", fixer 7B at "$2.8M |
  ($1217/sq ft)"; the comp adjusted by "3% increase in cost for being 3 floors higher plus $750,000 …
  for being 300 sq ft larger"; cure estimated at "$1.61M–$2.30M" · two asking prices · undated · the
  author sells renovations [GKBNY].
- A newer UrbanDigs analysis (Forbes, May 2024) could not be opened.

*Other US*
- **Zillow listing keywords, 2M+ homes listed in 2024:** "Buyers pay 3.7% more than expected for
  remodeled homes"; "a 'fixer-upper' sells for 7.3% less than a similar home"; "needs work" or "TLC"
  "around 8% less than expected" · method not disclosed · press release [Zillow-2025-remodeled].
- Condition price spreads "tend to be lower when market conditions are strong" · 322,433 sales,
  2012–15 · abstract only · `[>5y]` [MSK-2018].

*International* — not searched.

**Reliability: some.** A controlled NYC estimate by condition grade (1984–2002); consistent direction
in current NYC grouped data and national keyword data, but no current controlled NYC magnitude.

**Notes**
- *Co-op:* the co-op "good" effect (+9.09%) is more than twice the condo one (+3.93%) [SVM-2006].
  Co-op renovations need board approval under an alteration agreement — "the formalities themselves can
  take 3-5 months" [GKBNY] — which may enlarge the discount for work needed; no magnitude found.
- *Entry-level vs luxury:* condition spreads are larger at the top quality segment when markets weaken
  [MSK-2018]; the $700–$1,000/sf cure cost is luxury-only.
- *Fair housing:* condition must come from the unit — photos, text, inspection — never from neighbourhood
  or occupant characteristics.
- *Consistency:* two appraisers rating the same property agreed on condition only 55.9% of the time
  [Eriksen-2020]. Agent condition inputs will vary as much or more; a written scale helps.
- *Appendix A:* the scale mixes condition with how recent a renovation is and with originality. UAD
  separates them, with explicit 12- and 36-month windows. Recording the renovation year as its own field
  would keep them apart.

### 9. Finishes and systems

*Appendix A: kitchen and bath quality, central air, in-unit laundry, fireplace. Export tags, listing.
Both.*

**How practitioners derive it**
- **Hedonic regression on amenity flags** — the closest analogue to Casa's data, since the export's Home
  Features tags (Central air, Dishwasher, Washer/dryer, Fireplace …) are the same kind of flags
  [SE-2022-features]. *Casa: later*, once the property record is large; Casa's own data would allow the
  size control StreetEasy lacked.
- **Paired sales with and without an item** in the same building. *Casa: partly.*
- **Cost-recovery surveys** for kitchen and bath quality [CVV-2025; NAR-2025-remodeling] — opinion
  surveys about single-family houses, useful as a cap. **The Cost vs. Value report's licence forbids
  building its data into software** "except as licensed by Zonda Media".
- Broker rules of thumb — opinions.

**What published evidence reports**

*NYC*
- **StreetEasy, 2020–22 (below $2.5M): in-unit washer/dryer +14.1%, en-suite bathroom +9.4%,
  dishwasher +9.0%; (above $2.5M): central AC +5.9%.** Laundry and dishwashers "are common features in
  these higher priced listings and did not have a meaningful impact on premiums" above $2.5M; 34% of
  sub-$2.5M units sold had in-unit laundry · no size control; non-additive · full text [SE-2022-features].
  No fireplace figure appears in either top ten.
- **Other features held constant: fireplace +9.66% (condo), +9.74% (co-op); central air +1.97%, +2.08%
  against window units; no air conditioning +0.03% (condo, not significant), −3.28% (co-op).**
  "a fireplace is associated with 9.7 percent increase in value for both cooperatives and condominiums"
  · Manhattan · 1984–2002 · full text · `[>5y]` [SVM-2006].
- Broker statements: "equivalent units trade at a difference of a half a million dollars when one had a
  washer and dryer" [BU-2025-mustHaves, quoting a LinkedIn post]; adding a washer/dryer "a seven to ten
  percent increase in rent or sale is not out of the question" [SE-2021-washer].

*Other US* — **Cost vs. Value 2025, share of cost recouped at resale (national; Middle Atlantic):**
minor midrange kitchen 112.9%; 107.2% · major midrange kitchen 50.9%; 49.0% · major upscale kitchen
35.7%; 34.9% · midrange bath 80.0%; 79.9% · upscale bath 41.7%; 42.2% — surveys of real-estate
professionals, 115 markets, full regional PDF [CVV-2025]. **NAR 2025:** recovered cost of a bathroom
renovation 50%, a complete kitchen renovation 60% (chart values paired by order; 4,005 Realtor
responses) [NAR-2025-remodeling]. Sirmans et al.'s review tallies of fireplace and air-conditioning
coefficients could not be opened [Sirmans-2005].

*International* — not searched.

**Reliability: some.** A recent NYC regression for laundry, dishwasher, en-suite bath and central air
(no size control, non-additive); an older controlled NYC estimate for fireplace and central air.
Kitchen and bath *quality* rests only on single-family cost surveys.

**Notes**
- *Co-op:* in-unit laundry depends on building policy — "Approval by the board or managing agent is
  always required" [SE-2021-washer] — so the factor needs *installed*, *permitted* and *prohibited*.
- *Entry-level vs luxury:* the clearest split in this research — laundry and dishwasher premiums below
  $2.5M, none above; central AC appears only above [SE-2022-features]. Upscale kitchens and baths recover
  a smaller share of cost than midrange ones [CVV-2025].
- *Fair housing:* none.
- *Appendix A:* the factor combines a quality grade (kitchen and bath) with yes/no systems, which the
  evidence treats differently; dishwasher and en-suite bathroom are significant NYC premiums not named.

### 10. Ceiling height and volume

*Appendix A: loft volume, double height. Listing, agent. Both.*

**How practitioners derive it**
- **As part of a quality rating.** UAD 3.6 puts ceilings inside interior *quality* — Q1 "Spacious rooms
  with high ceilings featuring extensive use of treatments", Q2 "higher ceilings that may have custom
  design elements", Q3 "Some rooms may have vaulted ceilings" [UAD-Ratings-2025]. A qualitative input,
  no amount.
- No hedonic or paired-sales method specific to ceiling height was found. *Casa: barely* — only the
  `Loft` tag and listing text ("double-height", "11-foot ceilings").

**What published evidence reports** — **none found**, NYC, other US or international. The closest NYC
proxy is the "loft building" coefficient — −8.51% (condo), +9.96% (co-op) [SVM-2006] `[>5y]` — which
bundles far more than volume. Searches were cut short by the session's search limit.

**Reliability: none.**

**Notes** — overlaps finishes and quality (9), unit type (11, loft conversion) and the `Loft` tag.

### 11. Unit type

*Appendix A: penthouse, duplex, garden unit, loft conversion. Unit label, export tags, listing. Both.*

**How practitioners derive it**
- **Build it up from components** — floor, outdoor space, view — rather than as one premium. Miller:
  "the majority of penthouses have nothing to do with other apartments in the same building" because
  "they often have amenities that the other apartments simply don't have, like outdoor space,
  fireplaces, and high ceilings" [BU-2023-penthouse].
- **Same-building pairs** — a penthouse against the unit below [SixSqft-2015-penthouse]. *Casa: partly* —
  "#PH" labels can be parsed; "garden" and "duplex" need listing text.

**What published evidence reports**

*NYC*
- **Penthouses "usually cost an average of 10 to 20 percent more than other units in the same
  building"** — Jonathan Miller, quoted by Brick Underground, 16 Nov 2023 · expert statement, no data
  [BU-2023-penthouse].
- **CityRealty, top penthouse sales of 2014: "11 percent more per square foot" than the unit just below;
  "75 percent more" in total price** · secondary (6sqft, 13 Apr 2015) · no controls · `[>5y]`
  [SixSqft-2015-penthouse].
- **Duplex / multi-level:** −1.28% (condo), −1.55% (co-op) for units on two or more levels [SVM-2006]
  `[>5y]`.
- **Garden units** sit at the bottom of the floor curve — the 19.3% jump from first to second floor
  [MS-2010-floor] — while a garden itself carries +4.37% (condo) and +12.34% (co-op) [SVM-2006]; both
  `[>5y]`.
- **Loft conversion:** the "loft building" coefficient above; no conversion-specific figure.

*Other US* — San Diego: the top floor confers no value "over and above its advantage of being on a
higher floor" [CNS-2013] `[>5y]`. *International* — South Korea top-floor discounts (factor 4).

**Reliability: thin.** One appraiser's range, one old grouped comparison, and component coefficients.

**Notes**
- *Co-op:* nothing co-op-specific.
- *Entry-level vs luxury:* penthouses cluster at the top, where the StreetEasy premium is for private
  outdoor space [SE-2022-features].
- *Fair housing:* garden and ground-floor units can be step-free; adjusting for accessibility is a
  disability-sensitive area — describe features, never who a unit suits.
- *Appendix A:* the factor bundles floor, outdoor space, view and volume. A penthouse premium on top of
  factors 4, 6 and 7 double counts; a garden unit combines a ground-floor discount with an outdoor
  premium. The definition should say which components it covers *net of* the others.

### 12. Noise and street position

*Appendix A: avenue or side street, elevated train, front or rear. Agent, listing. Both.*

**How practitioners derive it**
- **Hedonic regression on measured noise** — a percentage per decibel, the "noise depreciation index"
  [NAP-2010-noise; Nelson-2004]. *Casa: partly* — addresses could be geocoded against noise and transit
  data; unit-level exposure (front or rear, floor) can't come from an address.
- **The ground-floor discount**, which Miller attributes partly to noise [MS-2010-floor].
- **Same-building pairs, front against rear** — none found. "2 units of exact square footage in the same
  building on Central Park West may have very different values just based where the windows … face"
  [GKBNY].

**What published evidence reports**

*NYC* — none on avenue against side street, elevated trains or front against rear. The 2009 floor
analysis names noise as one of three reasons for the first-to-second-floor jump [MS-2010-floor] `[>5y]`.

*Other US*
- **Road traffic: "A meta-analysis in 1982 of 17 hedonic pricing estimates for the United States and
  Canada showed a range of NDIs of 0.16 to 0.63 percent, with a mean value of 0.40 percent per
  decibel"** — Nelson (1982), as reported by the National Academies · secondary · `[>5y]`
  [NAP-2010-noise].
- Airport noise: a 2004 meta-analysis of 20 studies (33 estimates, 23 airports) · abstract only, no
  per-decibel figure read · `[>5y]` [Nelson-2004]. Reference levels: "busy city cross-streets (80
  dBA)" [Nelson-2008].

*International* — Thessaloniki: "the influence of noise on prices significantly varies among different
areas of the same city", with no effect below a threshold near the centre · machine learning, no
per-decibel figure · `[>5y]` noise data [Kamtziridis-2023].

**Reliability: thin.** A decades-old per-decibel range from other markets; nothing on NYC street
position.

**Notes**
- *Fair housing:* building a street "quality" or noise score from area-level social data (such as
  complaint counts) can proxy for protected characteristics. Use the unit's own measured exposure or
  position.
- *Appendix A:* front against rear also carries light and view (5, 6); ground-floor noise overlaps
  floor (4).

### 13. Private storage and extras

*Appendix A: deeded storage, private elevator landing. Listing, agent. Both.*

**How practitioners derive it**
- **The market price of a separately sold storage unit** — where buildings sell storage as its own lot.
  *Casa: partly* — ACRIS records separately conveyed units; not researched further.
- **Hedonic flags on building storage amenities** [SE-2022-features] — a building amenity, not private
  storage.

**What published evidence reports**

*NYC*
- **Sale prices of storage units in condos (trade press):** 18 Gramercy Park, a 35 sf unit for "$75,000
  (or $2,143 per square foot)"; 56 Leonard, "$72,000 for a 36-square-foot space" to "$300,000 for a
  combination storage unit measuring 211-square-feet"; One57 from "$101,000"; converted maids' rooms in
  an East 77th Street building "$100,000 to $195,000"; rental storage "typically … under $100 a month"
  · CooperatorNews, Feb 2015 · `[>5y]` [Cooperator-2015-storage]. "Prices range from $4,000 to as much as
  $160,000. In luxury condos, the typical storage price varies from $15,000 to $50,000" · Marketproof,
  Dec 2020, no data source given · `[>5y]` [Marketproof-2020-amenities].
- **Refrigerated (cold) storage in common areas, a building amenity: +9.4% below $2.5M, +6.9% above**
  [SE-2022-features].
- Private elevator landings: none found.

*Other US* — closet renovation "83%" cost recovery [NAR-2025-remodeling]; lacking attic space is a
negative in the hedonic literature (abstract) [Sirmans-2005]. Indirect.

**Reliability: thin** — none for private elevator landings.

**Notes**
- *Co-op:* "deeded" storage is a condominium concept; co-op storage is typically assigned or leased by
  the building (a definitional point — no source was read on it).
- *Appendix A:* the export lists storage under Building Amenities ("Locker/cage; Storage space; Cold
  storage"). The definition should say whether those count here or under amenities (15); counting them
  in both double counts.

## Building

### 14. Service level

*Appendix A: full-time doorman, concierge, part-time, virtual, none. Export amenities. Both.*

**How practitioners derive it**
- **Matched buildings** — attended against unattended lobbies in comparable buildings. Jonathan Miller
  gives a range and says it holds only between comparable buildings [BU-2020-doorman]. *Casa: partly* —
  the tags ("Full-time doorman; Doorman; Concierge; Live-in super") give doorman or none; they can't tell
  part-time from virtual.
- **Hedonic dummies** [SVM-2006; SE-2022-features]. *Casa: later.*
- **Grouped comparisons** [HuffPost-2014-doorman; MNS-2026-08] — confounded by location, size, era and
  new development.
- **Cost side:** staffing flows into monthly charges; non-doorman buildings save "about 20 percent" on
  monthly fees (a broker) [BU-2020-doorman]. That is the *cost* of service, not its value.

**What published evidence reports**

*NYC*
- **Attended lobby, other features held constant: +11.58% (condo), +13.26% (co-op)** · Manhattan ·
  1984–2002 · hedonic · full text · `[>5y]` [SVM-2006].
- **StreetEasy 2020–22: doorman +10.9% (below $2.5M); concierge service +6.8% (above $2.5M)** · no size
  control; non-additive · full text [SE-2022-features].
- **Miller: "10 to 15 percent difference between a building with a non-attended lobby and an attended
  lobby"** · Brick Underground, 12 Mar 2020 · expert estimate · `[>5y]` [BU-2020-doorman].
- **CityRealty (raw), luxury condos Q3 2014: $2,958/sf with a doorman against $1,797 without** —
  "65 percent more"; 100 against 100 buildings · secondary · `[>5y]` [HuffPost-2014-doorman].
- Rentals, as context: MNS asking rents, Aug 2026 — studio $4,531 against $3,378, one-bedroom $6,005
  against $4,442, two-bedroom $7,637 against $5,789, doorman against non-doorman · raw means, 10,000+
  listings [MNS-2026-08].

*Other US / international* — none found.

**Reliability: some** for doorman against none; **none** for part-time, virtual and concierge
distinctions below the luxury tier.

**Notes**
- *Co-op:* the co-op coefficient is the larger one [SVM-2006]; co-op maintenance carries the staff cost.
- *Entry-level vs luxury:* doorman appears in StreetEasy's sub-$2.5M list, concierge in the top tier
  [SE-2022-features].
- *Fair housing:* low as a service attribute. Copy framing a doorman as neighbourhood "safety" deserves
  care.

### 15. Amenities

*Appendix A: gym, pool, roof deck, playroom and the rest. Export amenities. Both.*

**How practitioners derive it**
- **Hedonic regression on amenity flags** [SE-2022-features]. *Casa: later* — the export carries the
  same kind of tags.
- **Paired buildings with and without an amenity** — weak, because amenities cluster in newer, larger
  buildings.
- **Cost side:** amenity operating costs flow into common charges (factor 19).

**What published evidence reports**

*NYC* — **StreetEasy 2020–22, below $2.5M: gym +12.3%, pool +11.8%, children's playroom +11.0% (11.1%
in the text), refrigerated storage +9.4%, shared patio/terrace +7.5%, shared roof deck +6.2%; above
$2.5M: hot tub +10.2%, basketball court +10.1%, golf simulator +8.8%, pool +7.1%, shared meeting room
+7.0%, refrigerated storage +6.9%** · 55,000+ sales · no size control · "cannot be added together to
determine a cumulative impact" · full text [SE-2022-features]. "An amenity can give a for-sale unit a
boost if that amenity is rarer relative to the comparables in the area." No older controlled NYC
estimate found; Schill, Voicu & Miller had no gym or pool variables.

*Other US* — none with magnitudes. *International* — Costa Rica condominiums: "access to a pool and gym"
among the most significant price variables · abstract only, no magnitudes [CostaRica-2021].

**Reliability: some.** One recent, large NYC regression — but without a size control and, by its
authors' own warning, not additive.

**Notes**
- *Co-op:* no co-op-specific figure published.
- *Entry-level vs luxury:* the lists differ completely by tier [SE-2022-features].
- *Fair housing:* a playroom is a physical feature; copy about which households a building "suits"
  touches familial status.
- *Appendix A:* "roof deck" is listed, but the export's tags read "Shared outdoor space"; confirm the tag
  vocabulary. Non-additivity is itself interaction evidence (see *Interaction evidence*).

### 16. Building era and type

*Appendix A: prewar, postwar, new development, conversion, landmark. Year built from the StreetEasy PDF
or listing. Both.*

**How practitioners derive it**
- **Hedonic regression with era dummies**, and difference-in-differences for landmark designation
  [SVM-2006; Been-2014]. *Casa: partly* — landmark district boundaries are public; year built isn't in
  the CSV.
- **Grouped data** — new development against resale, prewar against postwar price per room
  [Elliman-Q3-2025; BHS-1Q25]. Raw and mix-driven: "the mix of apartments selling can have a great impact on the data"
  [BHS-1Q25].
- **Paired sales** within a neighbourhood once year built is attached.

**What published evidence reports**

*NYC*
- **Prewar against postwar, other features held constant: +30.68% (condo), +12.44% (co-op)**; age
  −0.99% a year (condo), −0.19% (co-op); converted-from-rental buildings +6.07% (condo), −2.60% (co-op)
  against buildings built as condo or co-op, with value rising "as time from the date of conversion
  elapsed"; loft buildings −8.51% (condo), +9.96% (co-op) · Manhattan · 1984–2002 · full text · `[>5y]`
  [SVM-2006].
- **Historic districts, citywide:** properties in areas "that are or will become historic districts sell
  for approximately 20 percent more"; designation itself "generates a 9.5 percent boost" (14.8% over the
  whole post-designation period); in Manhattan, district areas sell for "33 percent more" but
  designation "appears, if anything, to have a negative effect" (not significant); bordering properties
  gain 11.9% after designation · 1974–2009 · 1M+ sales (448,554 in the main citywide models) · full text
  (NBER WP; JUE 2016 abstract) · `[>5y]` [Been-2014; Been-2016]. The same study's prewar coefficient is
  **negative** once district variables are included — "the historic district variables may be capturing
  the premium usually associated with pre-war buildings". Co-op unit sales appear not to be covered.
- **New development against resale, Manhattan Q3 2025 (raw):** average $2,206/sf against $1,397;
  medians $1,750,000 against $1,026,500 · 578 and 2,580 sales [Elliman-Q3-2025].

*International* — Tokyo condos: "an estimated annual net depreciation rate … of 1.68% per year" ·
2000–2015 · 3,232 sales · full text · `[>5y]` [DS-2016].

**Reliability: some** for landmark and prewar (with conflicting signs across studies); **thin** for new
development and conversion.

**Notes**
- *Co-op:* the prewar premium is much smaller for co-ops than condos [SVM-2006]; BHS reports prewar and
  postwar price per room for co-ops only [BHS-1Q25].
- *Entry-level vs luxury:* none. Designation effects depend on "the value of the option to build
  unrestricted" [Been-2016].
- *Appendix A:* "new development" is also factor 18; "landmark" is a regulatory status, not an era, and
  overlaps prewar; "conversion" is undefined (rental to condo, loft or office to residential, co-op to
  condo). New-development closings reflect contracts signed "months, and even years before they close"
  [BHS-1Q25] — a recency issue (28).

### 17. Building size

*Appendix A: boutique against large, by units and stories. Export. Both.*

**How practitioners derive it**
- **Hedonic regression with units and stories** — both are export fields. *Casa: the data yes, the
  sample later.*
- **Qualitative broker screens** — liquidity, financing approval, concentration of arrears risk in small
  buildings; no numbers [BU-bigsmall].
- **Cost side** — per-unit staff and amenity costs fall with scale; NYC property-tax rules change at 10
  units (factor 19).

**What published evidence reports**

*NYC*
- **Other features held constant, each additional unit in the building: −0.04% (condo), −0.02%
  (co-op)** — "the greater the number of units in a building, the less an apartment's value although
  the magnitude of the impact is very small"; each elevator +2.07% (condo), +2.04% (co-op); high-rise
  against walk-up +2.45% (condo, not significant), +8.41% (co-op) · Manhattan · 1984–2002 · full text ·
  `[>5y]` [SVM-2006]. Size is estimated alongside elevator count and building design, so it is a
  conditional effect.
- Qualitative: "If one out of 10 residents isn't paying the common charges, the building has lost 10
  percent of its revenue"; "a building of about 10 to 30 units" is "the sweet spot" (brokers)
  [BU-bigsmall].

*Other US* — Florida single-family associations: "Larger HOAs correlate with lower property values" ·
abstract · `[>5y]` [Meltzer-Cheung-2012]. *International* — Tokyo: the number-of-units coefficient
changes sign between specifications and applies to land value only · `[>5y]` [DS-2016].

**Reliability: thin.** One old NYC coefficient, tiny per unit and conditional on correlated building
variables.

**Notes**
- *Co-op:* small co-ops concentrate financial risk [BU-bigsmall]; buildings of 10 or fewer units have
  capped assessment growth [NYCDOF-Class2-2026].
- *Entry-level vs luxury:* "boutique" means a small walk-up at entry level and a low-count luxury new
  development at the top; one factor covers both.

### 18. Sponsor and new-development sales

*Appendix A: sponsor pricing, concessions, sponsor-paid transfer taxes. Listing, agent. Both.*

**How practitioners derive it**
- **Adjust concessions to the price without them, at the market's reaction.** "Adjustments must reflect
  the difference between what the comparables actually sold for with the sales or financing concessions
  and what they would have sold for without the concessions"; "Positive adjustments for sales or
  financing concessions are not acceptable"; dollar-for-dollar is acceptable only if the market's
  reaction is the full amount [FNMA-B4-1.3-09]. *Casa: partly* — concessions aren't in the export or the
  recorded price; they'd come from the listing or the agent.
- **Normalise who paid the transfer taxes.** The rates are statutory, so the size of a shift is
  arithmetic on the price. *Casa: yes for the arithmetic*; whether a comp was a sponsor sale needs the
  listing or the agent (the export has no sponsor flag).
- **Use the contract date for time adjustment** — new-development closings reflect contracts signed
  "months, and even years before they close" [BHS-1Q25].

**What published evidence reports**

*NYC — rules (authoritative)*
- **NYC Real Property Transfer Tax:** "If the value is $500,000 or less, the rate is 1% of the price. If
  the value is more than $500,000 the rate is 1.425%" — for houses and individual condo and co-op units
  [NYCDOF-RPTT].
- **NYS transfer tax:** "two dollars for each $500" of consideration [NYSDTF-RETT]; plus an "additional
  base tax of one dollar and twenty-five cents ($1.25) for each $500 of consideration" on NYC
  residential conveyances of "$3 million or more" [NYSDTF-TP584].
- **Buyer-side taxes:** the "mansion tax" of "1% of the sale price" at $1 million or more
  [NYSDTF-RETT]; and a supplemental NYC residential tax rising from 0.25% ($2M–$3M) through 0.5%, 1.25%,
  2.25%, 2.5% and 2.75% to 2.9% ($25M and over) [NYSDTF-TP584, form rev. 8/25].
- **Who pays:** "The base tax and additional base tax are paid by the grantor (seller) and such tax
  shall not be payable, directly or indirectly, by the grantee except as provided in a contract"; "The
  additional tax and supplemental tax are paid by the grantee" [NYSDTF-TP584].
- **The sponsor convention:** "On most sponsor sales the purchaser pays, because the offering plan
  shifts the New York State transfer tax and the New York City real property transfer tax to the buyer"
  [Nacmias, law firm, undated]. **An unresolved tension:** the law firm says a buyer-paid tax raises
  the taxable consideration; the state instructions say that on residential conveyances "if the
  transfer tax is paid by the buyer pursuant to a contract … the amount of tax shall be excluded from the
  calculation subject to tax" [NYSDTF-TP584]. A closing attorney should settle which applies to which
  tax before the tool does this arithmetic.

*NYC — market data*
- **Listing discount, Manhattan Q3 2025:** new development 4.9%, resale 6.4% [Elliman-Q3-2025].
  Concessions are invisible in a price-only discount.
- **Sponsor concentration in a building:** 20%+ investor or sponsor units: −1.61% (condo), no
  significant effect (co-op) [SVM-2006] `[>5y]`; "more than 50% of the total, places greater risk" on a
  co-op's revenue [MS-2002-coops] `[>5y]`.
- **No primary source was found on the size or prevalence of NYC sponsor concessions**; Marketproof's
  and StreetEasy's analyses could not be opened.

*Other US* — new-construction prices capitalise property-tax abatements fully at first (factor 20)
[Coste-2024].

**Reliability: strong** for tax rates and who pays by law; **some** for the sponsor convention; **none**
for NYC sponsor premiums and concession sizes.

**Notes**
- *Co-op:* the transfer tax covers "individual cooperative apartments" [NYCDOF-RPTT]. "Sponsor units" in
  older co-ops — unsold, often occupied shares — are a different thing (see *Possibly missing from
  Appendix A*).
- *Entry-level vs luxury:* every buyer-side tax and the seller's additional base tax step up with price,
  so a shifted tax weighs more at the top.
- *Appendix A:* the factor mixes *conditions of sale* (who pays taxes, concessions) with *property
  characteristics* (newness, amenities, abatements) that already sit in 15, 16 and 20.

### 19. Carrying costs

*Appendix A: common charges and taxes, or maintenance, as capitalised into price. Export. Both.*

**How practitioners derive it**
- **Mortgage equivalence** — convert the monthly difference into the loan it would service. Miller: "a
  $500 monthly payment would enable you to borrow around $100,000", so the apartment should sell for
  about that much less [MS-2013-maint] `[>5y]`. *Casa: yes* — `Common Charges`, `Monthly Taxes` and
  `Maintenance Fees` are in the export. The published rules are pegged to 4–4.5% rates, and the multiple
  moves with the rate.
- **Holding-period accumulation** — the monthly difference over a 7–10 year hold [BU-2023-carryprice].
- **Deviation from a norm** — adjust only the gap from the building or segment norm per sf; "Small
  deviations … are tolerated by purchasers without adjustment but large deviations may require an even
  larger adjustment than a dollar for dollar figure, as the market punishes high maintenance and common
  charges" [MS-2013-maint].
- **Hedonic capitalisation rate** — price on the fee level relative to the building average
  [Narwold-2018]. *Casa: later.*
- **Making condos and co-ops comparable** — condo carry is common charges plus taxes; co-op maintenance
  bundles the building's taxes, operations and any underlying-mortgage debt service.

**What published evidence reports**

*NYC*
- **Named broker rules (Brick Underground, 13 Mar 2023):** "Every $100 increase in monthly payments could
  be equivalent to around $15,000 to $20,000 in loans" (Vickey Barron, Compass); "That extra $1,000 in
  monthly maintenance would support a $200,000 mortgage" (Deanna Kory, Corcoran; the article assumes 30
  years at 4.5%); "An additional $700 over 120 months equals $84,000" (Kobi Lahav); luxury condos "where a
  monthly cost of $5 per square foot is the norm" (Seth Levin) · expert rules, not data
  [BU-2023-carryprice].
- **Manhattan averages, 1Q 2026:** "Co-op monthly maintenance averaged $3,007 … or $2.76 per square foot";
  condo "common charges plus real estate taxes averaged $4,559", $3.44 per sf [MS-1Q26].
- **Why NYC taxes don't track sale prices:** RPTL §581 "requires the Department to value class 2 co-ops
  and condominiums as though they were rental properties"; "DOF is prohibited from valuing co-ops and
  condominiums using sales data"; "co-ops and condos tend to be undervalued more than rental properties"
  [NYCDOF-Hyman-2016] `[>5y]`, still in force: "We generally value your class 2 property based on its
  income producing potential"; assessed value is 45% of market value; for buildings of 10 or fewer units
  it "cannot increase more than 8% from the prior year or 30% over five years" [NYCDOF-Class2-2026].
- Schill, Voicu & Miller *assume* capitalisation rather than estimate it: they add the present value of
  maintenance to price, discounting at 7.6% with 3.2% growth [SVM-2006] `[>5y]`.

*Other US*
- **San Diego condos:** fees "capitalized into sales prices using a capitalization rate of approximately
  3.5%"; below-average fees sell at a premium because "buyers dislike the possibility of cross-subsidizing
  other condominium owners" · 1,087 sales · abstract · `[>5y]` [Narwold-2018].
- **Property-tax capitalisation:** the literature's "most common finding is partial capitalization",
  with some studies finding full (Palmon & Smith 1998), as summarised in [Coste-2024].
- **Florida associations:** a premium "that hovers around seven percent" for HOA membership — not fee
  level · abstract · `[>5y]` [Meltzer-Cheung-2012].

*International* — Shanghai: "at least 71% of expected property tax liabilities are capitalized into
housing prices in a year" · abstract [Lyu-2024].

**Reliability: some.** Established methods and named NYC practitioner rules, but the rules are
rate-dependent and unsystematic; the academic capitalisation evidence doesn't cover NYC condos or co-ops.

**Notes**
- *Co-op:* maintenance includes the building's taxes and can include underlying-mortgage costs; owners'
  personal exemptions are allocated inside maintenance [NYCDOF-Class2-2026].
- *Entry-level vs luxury:* Levin's norm is higher for amenity-heavy luxury; DOF: "RPTL 581 creates special
  issues in valuing high-end co-op and condo apartment buildings" [NYCDOF-Hyman-2016].
- *Fair housing — a real flag:* a comp's taxes or maintenance can reflect the *owner's* exemptions —
  Basic and Enhanced STAR, the Senior Citizen Homeowners' Exemption, the Disabled Homeowners' Exemption
  [NYCDOF-Class2-2026]. Capitalising those differences would price in a seller's age or disability.
  Building-level carry before owner exemptions avoids it.
- *Appendix A:* "as capitalised into price" should say how condo and co-op carry are made comparable,
  whether figures are before or after owner exemptions, how a time-limited abatement is treated (20),
  and what the export's `Monthly Taxes` actually represents.

### 20. Tax abatements

*Appendix A: 421-a, J-51, and when they expire and taxes step up. Listing, agent, city records. Mainly
condos.*

**How practitioners derive it**
- **Present value of the remaining tax savings.** The annual saving is the benefit's reduction in
  assessed value times the tax rate ("multiply the reduction in assessed value associated with the
  abatement by the tax rate" [Hauseit-2021-421a] `[>5y]`), projected over the years left on the
  program's schedule and discounted. FHFA's version finds the result not very sensitive to the discount
  rate for a 10-year benefit: "The r-g values 1%, 3%, and 5% correspond to initial premiums of 11.3%,
  10.3%, and 9.4% respectively" [Coste-2024]. *Casa: partly* — `Monthly Taxes` shows the current,
  possibly abated, tax, but there's no abatement field or expiry date; each property needs a Department
  of Finance tax-bill lookup.
- **Repeat sales** of condos with and without the benefit [IBO-2017]; property fixed effects with an
  abatement age profile [Coste-2024]. *Casa: evidence only.*
- **Paired sales** before and after expiry. *Casa: partly*, small samples.

**The program rules a present value depends on** (NYC HPD):
- **421-a (older program):** construction-period exemption plus "10-year (2 years full + 8 years phase
  out), 15-year (11 years full + 4 years phase out), 20-year (12 years full + 8 years phase out), or
  25-year (21 years full + 4 years phase out)" [HPD-421a].
- **421-a(16) homeownership:** "A 20-year post-construction tax exemption (a 100% exemption during the
  first 14 years and a 25% exemption during the next six years), subject to an assessed valuation cap of
  $65,000 per dwelling unit" [HPD-421a]; not in Manhattan (per the page, paraphrased).
- **485-x homeownership:** "a 20-year benefit and a Construction Period benefit for up to three years";
  "A Homeownership Project cannot be located in Manhattan" [HPD-485x].
- **J-51 Reform (co-ops and condos):** eligible where "average assessed valuation no greater than
  forty-five thousand dollars per dwelling unit"; "Abatement of existing real property taxes by up to 8
  1/3 percent of the total certified reasonable cost of the work each year for up to 20 years", capped
  at "70 percent" of certified costs [HPD-J51].

**What published evidence reports**

*NYC*
- **The city's Independent Budget Office, 2017: "Condo buyers in Manhattan pay on average $35,500 more
  for an apartment with a 421-a benefit" and "spend on average 53 cents to 61 cents for each $1 of tax
  savings"; in the other boroughs "$31,200 more" and "42 cents to 50 cents"** · "more than 17,000 repeat
  condo sales from 2005 through 2015" · repeat sales · **secondary** (a blog quoting the report; the
  IBO's site has moved and the report couldn't be retrieved) · `[>5y]` [IBO-2017 via AYR-2017].
- Broker anecdote: a 25-year abatement at a Williamsburg building — "My taxes there are $40/month, and if
  there weren't an abatement, they would be $500/month" [BU-2016-abatement] `[>5y]`.

*Other US*
- **Philadelphia's 10-year abatement (FHFA, Jan 2024):** "The point estimate for abatement tax benefit
  capitalization into new construction price is 100.6%" (95% interval 86.0%–115.2%); near expiry the
  benefit is over-paid — "in year 9, buyers still pay a 6.7% premium despite the theoretical premium
  being only 1.8%" — and "a ≈4–5% abatement premium … remains even at age 10"; expiry "increased 30+ day
  delinquency by 71 basis points" · CoreLogic deeds 1980 – Sept 2023 · 9,272 abated transactions against
  354,849 older Philadelphia and 1.29M neighbouring-county transactions · repeat sales and fixed effects ·
  full text [Coste-2024]. The author attributes the over-payment partly to "the high salience of current
  taxes relative to future taxes".

**Reliability: some.** One NYC study, read only second-hand and dated, consistent with one strong recent
study elsewhere that also shows over-capitalisation near expiry.

**Notes**
- *Co-op:* J-51 explicitly covers co-ops; a co-op's benefit reaches owners through maintenance, not a
  unit tax bill — so "mainly condos" understates co-ops [HPD-J51].
- *Entry-level vs luxury:* IBO's cents-per-dollar is higher in Manhattan; the newer homeownership
  programs exclude Manhattan and cap assessed value, so new abatements are outer-borough and
  entry-to-mid.
- *Behaviour:* the over-payment near expiry argues for showing years remaining and the post-expiry tax
  explicitly.
- *Appendix A:* HPD calls 421-a an *exemption*, J-51 an *abatement*; the definition should also name
  485-x and 421-a(16), and treat Battery Park City's payments in lieu of taxes as the tax equivalent.

### 21. Building financials

*Appendix A: reserves, assessments, underlying mortgage, litigation. Agent, offering documents. Both;
critical for co-ops.*

**How practitioners derive it**
- **Appraiser judgment of the financial condition, read against the market.** Miller Samuel (2002):
  "Buyers in a rising market have fewer choices and tend to overlook deficiencies in the financial
  condition of a coop" [MS-2002-coops] `[>5y]`. *Casa: partly* — none of it is in the export, and it
  depends on documents from the agent.
- **Put co-ops on a debt-inclusive basis** — add the unit's share of the underlying mortgage (balance ×
  the unit's shares ÷ total shares) to the share price [SVM-2006]. *Casa: partly*, with the financial
  statement and share count.
- **Lender eligibility screens** — Fannie Mae makes ineligible projects with "any unfunded repairs costing
  more than $10,000 per unit that should be undertaken within the next 12 months", with litigation "that
  relates to the safety, structural soundness, habitability, or functional use of the project", or with a
  status of "Unavailable"; reserves must be "at least 10% of the budget" or supported by a reserve study
  [FNMA-B4-2.1-03; FNMA-B4-2.2-02]. These gate financing — and so the buyer pool — rather than set a
  price.
- No NYC method specific to special assessments was found; the present value of the remaining
  assessment is the obvious analogue.

**What published evidence reports**

*NYC*
- **Rules of thumb (Miller Samuel, 2002):** lenders hesitate where "the apartment's share of the coop's
  underlying mortgage is more than one third of the value"; "A high concentration of sponsor apartments,
  usually more than 50% of the total, places greater risk"; "A typical coop has monthly maintenance
  charges of about $1.00 to $1.25 per square foot per month" (2002 levels) · `[>5y]` [MS-2002-coops].
- Schill, Voicu & Miller model the underlying mortgage as capitalised into price by construction and give
  no separate estimate; "Approximately 98 percent of the cooperative buildings with blanket mortgages in
  our sample have balloon payments" · `[>5y]` [SVM-2006].
- No NYC study estimating the price effect of reserves, assessments, litigation or underlying-mortgage
  share was found.

*Other US*
- **Florida after the Surfside collapse and the SB 4-D reserve law (preprint, July 2026, not peer
  reviewed):** "sales prices declined 5.7 percent following Surfside and 9.5 percent following SB4D"; the
  largest effects in buildings under ten years old (14.7% and a cumulative 22.5%) and in the top value
  decile (about 10.1% and nearly 20.0%); buildings 30+ years old "a small and statistically insignificant
  decline following Surfside (3.0%) but a cumulative decline of 7.4% following SB4D" · all 67 Florida
  counties · 2020–2024 · 1,214,026 transactions · difference-in-differences · full text [Cheng-2026].
  A statewide regime shift, not a building-by-building reserve effect.

**Reliability: thin** for NYC; **some** for other US.

**Notes**
- *Co-op:* the underlying mortgage is co-op-specific, and maintenance carries its debt service — so
  adjusting both maintenance (19) and the mortgage share risks double counting.
- *Entry-level vs luxury:* in Florida the top value decile fell most [Cheng-2026].
- *Appendix A:* could add sponsor or investor concentration and lender project-eligibility status.

### 22. Policies

*Appendix A: pets, sublets, pied-à-terre, guarantors, financing limits, flip tax. Export (partial),
listing, agent. Both; financing limits critical for co-ops.*

**How practitioners derive it**
- **Hedonic dummies for building rules** [SVM-2006]. *Casa: partly* — `Building Policies` carries pets
  and smoke-free; financing limits, flip tax, sublet, pied-à-terre and guarantor rules come from the
  listing or the agent.
- **Flip tax as a transaction cost** — a fixed amount per share, a percentage of price, or a percentage of
  profit; "The flip tax is typically paid by the selling shareholder or unit owner" [Cooperator-2015-flip]
  `[>5y]`. Its effect on price is a separate question (below).
- **Board screens** (debt-to-income, post-closing liquidity) restrict who can buy; qualitative for
  pricing [BU-2023-DTI].

**What published evidence reports**

*NYC*
- **Co-op financing limits, against buildings allowing 60–79% financing, other features held constant:
  100% allowed −2.48%; 80–99% −2.16%; 40–59% +14.14%; 10–39% +26.33%; no financing at all +48.32%.**
  "apartments in buildings that allow no debt at all to be secured by the shares of the corporation are
  worth an astounding 48.3 percent more"; "A large proportion (77.3 percent) of the apartment sales in
  buildings with rules prohibiting financing were also in the top quantile of cooperative apartment
  values" · Manhattan · 1984–2002 · full text · `[>5y]` [SVM-2006].
- **Flip tax: +1.94%** (co-ops) — "Flip taxes also appear to be value-maximizing"; almost half of co-op
  sales were in buildings with one [SVM-2006] `[>5y]`.
- **Condo against co-op, same study:** "the typical condominium apartment is 8.8 percent more valuable";
  13.4% against a co-op with no financing restriction and no flip tax; 10.6% against the usual 60–79%
  rule; and a 25.4% *discount* against co-ops that allow no financing [SVM-2006] `[>5y]`. Sublet rules
  were not in the data.
- **Pets (raw, uncontrolled — not a pet premium):** "93.8 percent of Manhattan transactions in the first
  quarter of 2021 were in pet-friendly co-op and condo buildings, and the average sales price was $2.2
  million, compared to $911,304 in Manhattan buildings that don't allow pets" · Miller Samuel data via
  Brick Underground, Jan 2022 · `[>5y]` data [BU-2022-coopprices].
- **Board norms (broker practice):** debt-to-income "up to 33 percent" in an easy building, "below 25
  percent and in some cases below 20 percent" for very tough boards [BU-2023-DTI].
- **Flip tax prevalence:** "nearly 60 percent of co-ops in New York have a flip tax" (a law-firm study
  cited in trade press) [Cooperator-2015-flip] `[>5y]`. Its legal basis is Business Corporation Law
  §501(c), which lets co-ops set transfer fees in proprietary leases or offering plans [NY-BCL-501].
- **Pied-à-terre tax (secondary, verify with DOF):** from July 1, 2026, on non-primary residences above
  about $1M for condos and co-ops [NestApple-2026].

*Other US* — **pets:** "an unrestricted pet policy creates a significant premium in condominium price,
along with discounts for condominiums that do not allow pets or have pet restrictions" · abstract only,
no magnitude or market stated · `[>5y]` [Lin-2013]. Earlier condo-over-co-op premiums of 11.6%
(national, 1987) and 9% (Washington, two buildings), as reported by [SVM-2006] `[>5y]`.

**Reliability: some** for co-op financing limits and flip tax; **thin** for pets; **none** for sublet,
pied-à-terre and guarantor rules.

**Notes**
- *Co-op:* financing limits are central — 45% of co-op sales allowed 60–79% financing, and 2.1% allowed
  none [SVM-2006].
- *Entry-level vs luxury:* no-financing rules concentrate at the top and carry the largest coefficient
  there — "largest for the highest value apartments in the top quintile (0.25)" [SVM-2006].
- *Fair housing — sensitive:* board screens apply to *people*; record them as building rules, never as
  buyer characteristics. Schill, Voicu & Miller link the no-financing premium to buyers seeking "a
  socially exclusive residential environment" — "exclusivity" as a value driver could proxy for
  protected characteristics. Whether particular screens (for example guarantor bans) engage NYC's
  lawful-source-of-income protection, and how assistance animals interact with "no pets" rules, needs
  counsel.
- *Appendix A:* the financing percentage should be graded, not yes/no, and it interacts with the
  condo/co-op distinction — applied separately, the two double count.

### 23. Parking

*Appendix A: deeded space, garage in building, valet, none. Export amenities (can't tell deeded from
not). Both.*

**How practitioners derive it**
- **The market value of a separately sold space** — sales and asks for parking units. *Casa: partly* —
  ACRIS is public; the export's tags ("Garage parking; Valet parking; Parking") describe the building,
  and whether a comp's recorded price includes a space wasn't researched.
- **Hedonic parking variables** [SVM-2006; SE-2022-features; GP-2017]. *Casa: evidence only.*
- **Cost-based:** "the average cost to build one underground parking space was $34,000" (national, 2012)
  [GP-2017] `[>5y]` — a cost, not a value.

**What published evidence reports**

*NYC*
- **Building parking type against none, other features held constant: garage −1.10% (condo), +1.15%
  (co-op); lot +10.78% (condo), +8.44% (co-op)** · Manhattan · 1984–2002 · full text · `[>5y]` [SVM-2006].
  A building-level variable, not a deeded space.
- **StreetEasy 2020–22: valet parking +8.9% (above $2.5M)**; "only 4.7% of the closed sales above $2.5M
  offered valet parking" in the first half of 2022 [SE-2022-features].
- **Separately sold spaces (trade press):** a SoHo condo space that "cracked the mythical $1 million
  barrier" (2014); 301 E. 69th St. asks "starting at $199,000 and possibly going as high as $350,000",
  with taxes "projected at $3,720 annually" and "common charges of $75 a month"; 378 West End Ave. asks
  "$550,000 each" [Habitat-2021-carcondo] `[>5y]`; a Park Slope space sold for $250,000 in 2025
  [Streetsblog-2025]; "$250,000 or more in Manhattan to $10,000 in less dense areas of Brooklyn and
  Queens", "$130,000 to $150,000 is standard pricing" in luxury buildings [Marketproof-2020-amenities]
  `[>5y]`.

*Other US* — bundled garage parking "increases the rent of a housing unit by around 17 percent" (rentals,
US metros, 2011 American Housing Survey) [GP-2017] `[>5y]`; San Francisco condos with off-street parking
"sold for 13 percent more" (Jia & Wachs 1999, secondary via [GP-2017]) `[>5y]`.

**Reliability: thin.** Individual NYC space prices and one old building-level coefficient; the
controlled evidence is from other cities or rentals.

**Notes**
- *Co-op:* co-op parking terms (licences, waitlists, leases) weren't researched.
- *Entry-level vs luxury:* spaces restricted to owners of the priciest units at $550,000 asking
  [Habitat-2021-carcondo]; valet is a top-tier premium [SE-2022-features].
- *Appendix A:* categories might be deeded or sold separately / included / right to lease or licence /
  valet only / none. The export's parking tags are building amenities (15) — scoring them in both
  double counts.

### 24. Ground lease

*Appendix A: leasehold against fee ownership. Listing, agent. Both; large where present.*

**How practitioners derive it**
- **Present value of the reversion** — "The difference between leasehold and freehold prices reflects
  the present value of perpetual rental income starting at leasehold expiry" [GMS-2014]. *Casa: partly*
  — needs the remaining term.
- **Ground-rent reset analysis** — "Every 30-40 years, the value of the land under a co-op building
  subject to a ground lease is reappraised (called a reset)"; the new rent is "Usually 5-7% of the value";
  "In a 99-year lease, this reset could happen 2-3 times" [Miller-2025-groundlease].
- **Financing screen** — "The lease must have an unexpired term that exceeds the maturity date of the loan
  by five (5) years or more" [FNMA-B2-3-03]. *Casa: yes, if the term is known* — a yes/no
  "conventionally financeable" flag.
- **Paired comparison** of a land-lease co-op with a comparable fee co-op [BU-2014-landlease].

**What published evidence reports**

*NYC*
- **Land-lease co-ops "tend to sell for 20% to 30% less than conventional co-ops"**; "There are some 100
  land-lease co-ops in New York City, home to about 25,000 people" · Habitat, 4 Oct 2024, on the ground
  lease renewal law (attribution of the range not captured) [Habitat-2024-landlease].
- "the savings could be as high as 30 percent compared to similar, non-landlease co-ops" · Brick
  Underground, 2014 · `[>5y]` [BU-2014-landlease].
- Miller (2025): prices "tend to be significantly lower … because the monthly maintenance (HOA) fees are
  often extremely high, and financing availability is limited"; "If the monthly maintenance payments are
  higher than what the apartment would rent for, it effectively has little to no value"
  [Miller-2025-groundlease].
- **Ground lease, other features held constant: −10.84% (condo); +0.12% (co-op, not significant)** —
  "associated with a reduction in value for condominiums … but does not affect the cooperative value" ·
  Manhattan · 1984–2002 · full text · `[>5y]` [SVM-2006]. The co-op dependent variable already includes
  maintenance, which carries the ground rent.
- **Battery Park City:** the master lease was extended "by 50 years, to June 18, 2119", out of concern
  that "it may become more difficult to obtain mortgages or other financing for BPC properties as the time
  remaining on the lease gets shorter" [NYSenate-2022-BPC]. No evidence on a BPC price discount was
  found.

*International*
- **England & Wales, Singapore:** "100-year leaseholds are valued at more than 10% less than otherwise
  identical freeholds"; UK flats with "80-99 years remaining trade at an approximately 16% discount to
  freeholds", 10% at 100–125 years, 8% at 125–150, 3% at 150–300; "The 700+ year leaseholds are valued
  at essentially a 0% discount"; Singapore leases with 96–100 years at 11.8%, 71–85 years at 24% · 8M+
  UK transactions 2004–13 (1.4M flats), ~380,000 Singapore transactions 1995–2013 · hedonic · full text
  (NBER WP; QJE 2015) · `[>5y]` [GMS-2014].
- **Prime Central London:** discount rates "around 5–6%" for very short leases and "close to 3%" near 100
  years; log-point discounts of −0.105 (80–99 years), −0.080 (100–124), −0.043 (125–149) against 700+ ·
  full text · `[>5y]` [Bracke-2018].

**Reliability: some.** Strong international evidence on remaining term, under tenure law unlike NYC's;
NYC evidence is broker and appraiser ranges plus one old condo coefficient.

**Notes**
- *Co-op:* NYC's land-lease stock is mostly co-ops; ground rent flows through maintenance — so a
  ground-lease adjustment and a carry adjustment (19) overlap, except for reset risk not yet in current
  maintenance ("A 450% Rent Hike" at one reset [Miller-2025-groundlease]).
- *Entry-level vs luxury:* land-lease co-ops trade as a price-discounted product; no split by tier found.
- *Appendix A:* should capture remaining term, the reset schedule, ground rent's share of maintenance,
  renewal rights (the 2024 law), and the lender's term rule.

## Location

### 25. Micro-location

*Appendix A: block, side of the avenue, transit, parks, waterfront — "Canal Street isn't really
Tribeca". Address, agent; geocoding later. Both.*

**How practitioners derive it**
- **Choose comps from the same micro-market, which avoids the adjustment.** Fannie Mae: "Comparable sales
  from within the same market area (including subdivision or project) as the subject property should be
  used when possible" [FNMA-B4-1.3-08]. *Casa: yes* for same building and neighbourhood
  (`Building Address`, `Neighborhood`); no for block or side of the avenue until addresses are geocoded.
- **An adjustable location line tied to named site influences.** The redesigned form's "Site Influence
  (Location)" row is adjustable, with answers such as "Busy Roadway", "Commercial Area", "Park", "Public
  Transportation Hub", "Rail Line", "Body of Water" — no magnitudes; the appraiser supports them from the
  market [URAR-2026]. *Casa: yes, as a tagging structure.*
- **Paired sales** across a boundary or avenue. *Casa: partly*, few clean pairs.
- **Difference-in-differences around an amenity change** — joining DOF deed records to StreetEasy unit
  and building data and geocoding them [GVK-2020] — shows Casa-type data can support this once addresses
  are geocoded. *Casa: later.*
- **Boundary designs** — sales just either side of a line, within 0.35 or 0.1–0.2 mile [Black-1999;
  BFM-2007] — the formal version of "Canal Street isn't really Tribeca".

**What published evidence reports**

*NYC*
- **Second Avenue Subway (opened 1 January 2017): "We find 8% price increases, creating $6 billion in new
  property value"** — Upper East Side condos and co-ops, including a treatment area "within a 0.3 mile
  walking distance from one of the three new stations" · sales Jan 2003 – Mar 2019 · 44,299 transactions
  · difference-in-differences · full text (NBER WP; published JUE 2022) · `[>5y]` data [GVK-2020].
- **High Line (opened June 2009): "Home values within one-third of a mile of the park increased 10%
  immediately following its opening"** · DOF assessed values of condo and co-op buildings 2007–2012
  (3,402 properties within 2 miles), cross-checked against rolling sales 2003–2012 · building fixed
  effects · full text (working paper) · `[>5y]` [Levere-2016]. Mainly DOF's income-based valuations, not
  sale prices.
- **Community gardens:** "a garden raises neighboring property values by as much as 9.4 percentage points
  within five years of the garden's opening", "driven by the poorest of host neighborhoods" · NYC ·
  abstract · `[>5y]` [VB-2008].
- Nothing found on generic block or side-of-avenue premiums.

*Other US / international* — see school boundaries (27).

**Reliability: some.** Well-identified NYC estimates for particular amenity changes; nothing on
everyday micro-location differences.

**Notes**
- *Co-op:* the subway study pools condos and co-ops.
- *Entry-level vs luxury:* the subway study drops sales above $10M as unlikely to be affected (the
  authors' judgment); the garden effect is concentrated in the poorest neighbourhoods [VB-2008].
- *Fair housing:* a location narrative that refers to who lives in an area can work as steering. Keeping
  micro-location to physical and amenity tags, as the appraisal form does, avoids that.

### 26. Distance from subject

*Appendix A: physical proximity. Needs coordinates. Both.*

**How practitioners treat it** — **as a selection and disclosure rule, not an adjustment.** The
redesigned form's "Proximity to Subject" row is always required and marked **not adjustable**; it "Can be
0, such as when the comparable is in the same building" [URAR-2026]. Location differences go through the
adjustable location row (25). Fannie Mae: distance "is to be measured using a straight line"
[FNMA-B4-1.3-08]. Research designs hold location constant with bands of 0.1–0.35 mile [Black-1999;
BFM-2007; GVK-2020] — a guide to a sensible search radius. *Casa: yes* for same-building (distance 0);
straight-line distance needs geocoding.

**What published evidence reports** — none for a distance adjustment, because practice doesn't make
one. A neighbouring event's spillover decays fast: "a foreclosure at a distance of 0.05 miles lowers the
price of a house by about 1%" (Massachusetts) · `[>5y]` [CGP-2009] — relevant to search radius, not a
per-mile rate.

**Reliability: none** as an adjustment; **strong** as a selection rule.

**Notes** — *Appendix A:* practice doesn't adjust for proximity; distance is a weight or a filter, and
its value belongs in micro-location (25). Adjusting for both double counts.

### 27. School zone

*Appendix A: a real price driver — analyst view only (§14). Agent, public data. Both.*

**How practitioners derive it**
- **Boundary discontinuity (the academic standard)** — similar homes either side of an attendance-zone
  line, with boundary fixed effects [Black-1999; BFM-2007; Gibbons-2013; FG-2010]. *Casa: no for now* —
  no coordinates, no zone lines.
- **Grouped comparisons (median $/sf by zone)** overstate the effect: Black's boundary estimate "is
  roughly half the estimate one obtains with more typical hedonic housing price regressions"
  [Black-1999]. *Casa: yes, but biased upward.*
- The redesigned appraisal form's "School" site influence means a nearby school building (traffic,
  noise), not the zoned school's quality [URAR-2026].

**What published evidence reports**

*NYC*
- **Choice schools weaken the link: "The opening of a choice school reduces the capitalization of test
  scores from zoned schools into housing values by approximately one third"** · 15 years from 1988 ·
  boundary discontinuity and other designs · abstract only (the baseline magnitude isn't in it) · `[>5y]`
  [SVH-2014].
- **Raw asking $/sf across zones, 2010 (StreetEasy data, 2BR+):** Tribeca PS 234 zone $1,432/sf against
  PS 397 zone $965; Upper East Side PS 6 $1,535 against PS 290 $1,266; Upper West Side PS 87 $1,888, PS
  199 "$462 less", PS 166 "$697 less". Miller's caveat in the same piece: "the premium for a school
  district location is already embedded into the existing prices" · asking prices, no controls · `[>5y]`
  [BU-2010-schoolzone].
- A broker on the 2016 UWS rezoning: the feared effect is "more in the minds of the sellers than the
  buyers" [Cooperator-2016-schools] `[>5y]`.

*Other US*
- **Massachusetts: "parents are willing to pay 2.5 percent more for a 5 percent increase in test
  scores"**; in the body, "approximately 2.1 percent … roughly half the estimate one obtains with more
  typical hedonic" regressions · 22,679 single-family sales, 1993–95 · full text · `[>5y]` [Black-1999].
- **Bay Area: "less than 1 percent more in house prices … when the average performance of the local
  school increases by 5 percent"**; adding neighbourhood sociodemographic controls "reduces this estimate
  further, by approximately 50 percent" · 1990 Census, 242,100 households · full text · `[>5y]`
  [BFM-2007].
- **Review of post-1999 studies: "below 4% for a one-standard deviation increase in student test
  scores"**, smaller with fixed effects · abstract · `[>5y]` [NHY-2011].
- **Redfin (2 Sept 2026): homes in highly rated school zones "Cost 35% More Than the Average U.S. Home"**
  — raw medians, no controls, no New York City figure [Redfin-2026].

*International* — England: "around 3%" per standard deviation of school value-added · abstract · `[>5y]`
[Gibbons-2013]. Paris: "1.4 to 2.4%" per standard deviation, shrinking "as the availability of private
schools increases" — the closest analogue to Manhattan's apartment market · abstract · `[>5y]` [FG-2010].

**Reliability: some.** The capitalisation of zoned-school quality is well established elsewhere, with
boundary methods; the NYC evidence is dated, abstract-only or raw.

**Notes**
- *Co-op:* nothing specific.
- *Entry-level vs luxury:* capitalisation shrinks where alternatives to the zoned school exist — choice
  schools in NYC, private schools in Paris [SVH-2014; FG-2010]. That this matters where buyers use private
  schools is an inference, not a finding.
- *Fair housing — high sensitivity, and the federal position has moved:*
  - 24 CFR 100.70 prohibits steering, including "Communicating to any prospective purchaser that he or
    she would not be comfortable or compatible with existing residents" because of a protected
    characteristic [CFR-100.70].
  - NAR (2014) treats school talk as a steering risk "if there is a correlation between the quality of
    the schools and neighborhood racial composition", and advises agents to "Guide them to third-party
    information" [NAR-2014-steering] `[>5y]`.
  - **HUD's Dear Colleague letter of 24 April 2026** states that agents "do not violate the Fair Housing
    Act merely by discussing with prospective homebuyers or renters the prevalence of crime or the
    quality of schools in neighborhoods", and that investigators should not find discrimination based on
    "providing school and crime data to customers in an equal and consistent manner" [HUD-DCL-2026].
  - **New York enforces separately.** The Attorney General's 2023 settlement with Coldwell Banker,
    following Newsday's "86 paired tests", was brought under the Fair Housing Act "and New York State
    Executive Law § 296(5)" [NYAG-2023-CB]; the federal letter doesn't change state or city law. HUD's
    2024 guidance on digital advertising couldn't be retrieved (the URL returned 404), and the NYC
    Commission on Human Rights and NY Department of State rules on schools weren't researched.
  - Both the 2014 NAR guidance and the 2026 HUD letter describe consistent, data-based treatment as
    outside steering — which is what Appendix A's "analyst view only" already does.

## Transaction and market

### 28. Recency and market movement

*Appendix A: time since the sale, and how the market moved since. Export dates. Both.*

**How practitioners derive it**
- **Time-adjust from each comp's contract date, with evidence.** "The appraiser must analyze comparable
  sales for any changes in market conditions from their contract dates through the effective date";
  "Use of home price indices (HPIs) to support time adjustments is consistent with our policy"; rates can
  also come from "statistical analysis, modeling, paired sales, or other commonly accepted methods"
  [FNMA-B4-1.3-09]. The redesigned form uses the contract date when known, the sale date otherwise
  [URAR-2026]; Freddie Mac's market-condition exhibit takes effect 2 Nov 2026 [FRE-Bulletin-2025-7].
- **Recency as a selection rule:** "Comparable sales that have closed within the last 12 months should be
  used … however, the best and most appropriate comparable sales may not always be the most recent"
  [FNMA-B4-1.3-08].
- **Index-based adjustment** — apply the index change between the comp's contract month and today.
  *Casa: yes*, subject to index coverage (below).
- **Repeat sales of the same unit** — DOF records co-op sales with the unit number; rolling sales cover
  the last 12 months [DOF-RollingSales]. *Casa: partly, over time.*
- **Trend within the comp set** — $/sf by month within a building or neighbourhood. *Casa: yes, but
  noisy; mix shifts mislead.*
- **The contract date problem:** the export carries only a `Status Date`. If that is the closing date for
  sold rows, the contract-to-close gap is invisible and each comp is older than it looks. No NYC
  contract-to-close lag evidence was found.

**Index sources** (coverage as verified):
- **StreetEasy Price Index** — "a repeat-sales method of comparing the sales prices of the same
  properties since January 1995 in Manhattan and January 2007 in Brooklyn and Queens", covering "condo,
  co-op, and townhouse units" from DOF data · 2018 press release · `[>5y]` [SE-PR-2018].
- **S&P Cotality Case-Shiller New York condo index** (FRED series NYXRCSA) — monthly, seasonally adjusted,
  latest June 2026; its co-op treatment couldn't be verified [FRED-CS].
- **FHFA all-transactions index**, New York–Jersey City–White Plains — quarterly, "Estimated using sales
  prices and appraisal data"; condo and co-op coverage unverified [FRED-FHFA].
- **Miller Samuel quarterly reports** — medians and average $/sf by segment; mix-sensitive, not
  constant-quality [Elliman-Q4-2025].

**What published evidence reports**

*NYC*
- **Segments moved differently in the same year** (Manhattan, Q4 2025 against Q4 2024): overall median
  +2.3% while average $/sf fell 4.0%; co-op median +3.8%; condo median −0.2%; luxury median −7.5%
  [Elliman-Q4-2025]. The measure chosen changes the time adjustment.
- **How large time adjustments can be:** the year effects in Schill, Voicu & Miller's co-op model run
  from +2.37% (1985) to −29.96% (1993) and +15.85% (2002), all against 1984 [SVM-2006] `[>5y]`.

*Other US* — forced-sale prices "are mean-reverting, while the prices of unforced sales are close to a
random walk" [CGP-2009] `[>5y]` — relevant if distressed sales feed a trend. Nationally, time adjustments
are made for "around 10% of properties" and are "too small" [Doerner-Susin-2024].

**Reliability: strong** for the method; **some** for how well the available indices fit NYC condos and
co-ops.

**Notes**
- *Co-op:* the StreetEasy index covers co-ops; the Case-Shiller series is condos by title.
- *Entry-level vs luxury:* the luxury median fell while the overall median rose in the same year —
  one index applied to every tier can mis-adjust [Elliman-Q4-2025].
- *Fair housing:* inconsistent time adjustment has a documented disparate effect — "as much as 67% of the
  underappraisal bias in Black neighborhoods" [Doerner-Susin-2024]. Adjust every comp the same way.
- *Appendix A:* practice adjusts from the **contract** date; the export's `Status Date` needs defining
  for each status.

### 29. Sale conditions

*Appendix A: estate, distressed, related-party, off-market, bulk, non-arm's-length. Agent, listing;
closing-only records flagged. Both.*

**How practitioners derive it**
- **Classify, then exclude or analyse.** The redesigned form's sale types include "Court Ordered
  Non-Foreclosure Sale", "Estate Sale", "Foreclosure Sale", "Relocation Sale", "REO Post Foreclosure
  Sale", "Short Sale", "Sale Between Related Parties" and "Typically Motivated" ("Most arm's length sales
  are typically motivated"), with "Deed Transfer Only" for non-sale transfers [URAR-2026].
- **Fannie Mae:** foreclosures and short sales may be used "if the market data indicates they are the best
  and most appropriate sales available", with their prevalence and impact addressed [FNMA-B4-1.3-08].
- **Filters used on NYC data:** DOF — a "$0 sale indicates that there was a transfer of ownership without
  a cash consideration" [DOF-RollingSales]; researchers treat UES sales below $400,000 (2017 dollars) as
  "unlikely to be arms-length" and drop StreetEasy "sales" that were "merely removed listings" [GVK-2020].
- *Casa:* $0 and nominal transfers — yes; `/closing/` records — yes to flag, but a closing without a
  StreetEasy listing isn't proof of an off-market or non-arm's-length sale; estate, related-party and
  relocation — partly, from the agent or ACRIS party names.

**What published evidence reports**

*NYC* — **no magnitude found** for estate, distressed, related-party, bulk or off-market sales. REBNY
rules: "'Off-Market' means that the property is off the market and therefore, not for sale", and an owner
opting out acknowledges "such limited exposure may affect the pricing and length of time to sell"
[REBNY-2023-offmarket]. Miller (2026): private listings leave appraisers "thinner, more biased samples"
[Miller-2026-private].

*Other US*
- **Forced sales, Massachusetts: "forced sales take place at price discounts of about 3-7%"**; by type,
  coefficients of −0.051 (death, seller under 70), −0.068 (death, 70+), −0.032 (bankruptcy), −0.323
  (foreclosure) — "a large price discount of 28%"; "death-related discounts are largest for single-family
  houses … and very small for condominiums", while "foreclosure-related discounts are larger for
  condominiums" · 1987 – Q1 2008 · hedonic with neighbourhood fixed effects · full text (NBER WP; AER
  2011) · `[>5y]` [CGP-2009; CGP-2011]. The death-related discount "may result from poor home
  maintenance by older sellers" — i.e. it overlaps condition (8).
- **Off-MLS sales (conflicting, mostly industry):** "The median sales price for homes sold on-MLS was
  16.98% higher than homes sold off-MLS" (Mid-Atlantic, 2019–20, 442,829 sales, medians within size
  quartiles; co-op listings excluded; off-MLS includes FSBO and iBuyer sales) `[>5y]` [Bright-2021];
  Zillow (2026): off-MLS homes "sold for 1.3% less" (2023–25, secondary) [HW-2026]; Compass
  (company-commissioned): "phased marketing … sold for 4.6% more" (secondary) [HW-2026]. An economist's
  caution: "I would be a little careful about extrapolating those numbers" [RIS-2026].

**Reliability: some.** Solid, dated evidence on forced sales from another market, with condo-specific
patterns; conflicting evidence on off-market sales; nothing for NYC.

**Notes**
- *Entry-level vs luxury:* foreclosure discounts relate to "the threat of vandalism in low-priced
  neighborhoods" [CGP-2009].
- *Fair housing:* Zillow reports the off-MLS gap in communities of color [RIS-2025]; the exposure rules
  (NAR Clear Cooperation, REBNY RLS) are partly framed around equal access [NAR-CCP; REBNY-2023-offmarket].
- *Appendix A:* the list could add relocation, court-ordered and short or REO sales, and $0 deed-only
  transfers, matching the appraisal form's categories.

### 30. Concessions and credits

*Appendix A: seller credits, closing-cost credits. Listing, agent. Both.*

**How practitioners derive it**
- **Adjust to the market's reaction, not dollar for dollar.** "Adjustments based on dollar-for-dollar
  deductions that are equal to the cost of the concessions to the seller, as a strict cash equivalency
  approach would dictate, are not appropriate"; the effect "can vary with the amount of the concessions
  and differences in various markets" [FNMA-B4-1.3-09]. Freddie Mac: "Adjustments may not be based solely
  on dollar-for-dollar deductions" [FRE-Guide-2022].
- **Interested-party contribution limits** (Fannie Mae): 3% above 90% LTV, 6% at 75.01–90%, 9% at 75% or
  less (principal residence and second home), 2% for investment property; "Financing concessions that
  exceed the below limits are considered sales concessions and must be deducted from the property's sales
  price" [FNMA-B3-4.1-02].
- **The redesigned form** records "Total Sales Concessions" — including "furniture, carpeting, decorator
  allowances, automobiles, vacations" — whether they are "typical in the market", and an adjustable grid
  row [URAR-2026].
- *Casa:* concessions aren't an export field; capture as agent input (yes/no, amount, typical?).
  Measuring the market's reaction isn't feasible.

**What published evidence reports** — **no magnitude found**, NYC or elsewhere (the academic search did
not run within the session's search limit). Context: in Manhattan most buyers pay cash — 64.7% of sales in
Q4 2025, 57% for lower-priced co-ops and 74.4% for condos [Elliman-Q4-2025] — and lender contribution
caps don't bind cash deals.

**Reliability: thin** — clear rules, no measured magnitudes.

**Notes** — *co-op:* not researched. *Appendix A:* concessions overlap sponsor sales (18) — a sponsor
paying transfer taxes is a concession.

### 31. Combination units

*Appendix A: combined apartments, against the sum of their parts. Agent. Both.*

**How practitioners derive it** — no systematic method found. The natural designs are paired sales of
combined against uncombined units in the same building, or a combined sale against the recent sales of
its parts. *Casa: partly* — unit labels may reveal combinations; untested.

**What published evidence reports**
- **Miller Samuel (20 April 2014): "I've dubbed the phenomenon '1 + 1 = 2.5' because there is a premium
  for larger contiguous space"**; banks that ask for separate values "incorrectly assume the collateral is
  inadequate", because "the combination is usually worth more as one apartment (even before considering
  improvements) – in other words, the sum of the parts is less than the whole"; and "Larger units sell for
  more on a ppsf basis" · appraiser commentary, no figure · full text · `[>5y]` [MS-2014-combos].
- Nothing quantified found; no study of combinations' resale.

**Reliability: thin.**

**Notes** — the premium for larger contiguous space is the same effect that makes average $/sf rise with
size across Manhattan (factor 1) — the two overlap. Board approval, second kitchens and certificate-of-
occupancy issues are raised in the same commentary [MS-2014-combos].

### 32. Evidence status

*Appendix A: sold, in contract, active — not an adjustment; separate evidence classes (§6.3). Export.
Both.*

**How practitioners treat it**
- **Separate classes.** "Contract offerings and current listings can be used as supporting data, if
  appropriate" [FNMA-B4-1.3-08].
- **The redesigned form also converts asks to expected prices:** an adjustable "Sale to List Price Ratio"
  row — "A ratio applied to a comparable listing that represents the difference between the list price
  and an anticipated sale price for the comparable" — for comps that haven't settled [URAR-2026].
- **Data hygiene:** StreetEasy "sales" that were neither sold nor a recorded closing turned out, checked
  against deeds, to be "not actual sales but merely removed listings" [GVK-2020].
- **Days on market:** REBNY's listing rules say Coming Soon listings "shall not accrue 'days on market'"
  until their status changes [REBNY-UCBA-changes-2025].
- *Casa: yes* — the export has status, status date, last ask, sale price and days on market; the property
  record can produce Casa's own sale-to-last-ask by segment and period.

**What published evidence reports**

*NYC* — **Manhattan, Q4 2025 (closed sales):** listing discount from last list price 5.1% overall (6.2%
in Q3 2025, 9.2% in Q4 2024); resale 5.2%; co-op 4.0% (11.3% a year earlier); condo 5.9%; luxury 6.4%; new
development 5.0%. Days on market from last list date 74 overall; 72 co-op; 78 condo; 105 luxury; 96 new
development. "The market share of bidding wars … was 7.5%, and the average premium paid above the last
ask was 3.5%" · 2,631 sales · full text [Elliman-Q4-2025]. Q3 2025: new development 4.9%, resale 6.4%
[Elliman-Q3-2025].

*Other US* — **contract fall-through:** "7% of contracts were terminated in the last three months";
"14% of contracts had delayed settlements" · NAR member survey, Aug 2026 [NAR-RCI-2026].

**Reliability: strong** that status defines separate evidence classes; **some** for Manhattan list-to-sale
magnitudes; **thin** for NYC contract fall-through (national survey only).

**Notes**
- *Co-op / condo:* discounts differ and moved differently over the year [Elliman-Q4-2025].
- *Entry-level vs luxury:* luxury has longer days on market and a larger discount [Elliman-Q4-2025].
- *Appendix A:* "not an adjustment" is true of mixing classes, but practice *does* adjust unsold comps with
  a market-supported sale-to-list ratio [URAR-2026] — which is what the design's price evaluation (§6.7)
  already computes from the comps' typical sale-to-ask. Miller Samuel measures from the **last** ask and
  averages; StreetEasy uses the **initial** ask and medians (see the glossary) — so the two sale-to-list
  figures are not interchangeable.

## Later property types and modules

### 33. Air and development rights

*Appendix A: unused buildable area. Townhouses, whole buildings.*

**How practitioners derive it**
- **Comparison with recorded development-rights transfers**, priced per square foot of transferred floor
  area — built from ACRIS documents [Furman-2013] `[>5y]`. *Casa: partly* — public but labour-intensive,
  few and widely dispersed transactions.
- **Appraisers' valuations for policy prices** rest on "prior TDR transactions and land sales"
  [Furman-2013].
- **A regulatory price floor**, for one district only: East Midtown's "Development Rights Valuation"
  [ZR-81].
- A "share of land value per buildable square foot" convention was named in the brief but not verified
  in any source opened.

**What published evidence reports**

*NYC*
- **Average price 2003–2011: "$181 per square foot (in 2013 dollars … prices paid in individual
  transactions varied widely, from less than $50 to more than $500 per square foot"; Manhattan $194,
  Brooklyn $80, under $40 in Queens and the Bronx**; Manhattan community districts from $51 (East Harlem)
  to $244 (Greenwich Village/SoHo); in Midtown, averaging $203, "14 percent of the transfers were priced
  at less than $100 per square foot, and seven percent were priced at more than $300" · 242 priced
  arm's-length transfers · CPI-adjusted means · full text · `[>5y]` [Furman-2013].
- **East Midtown:** "As of August 9, 2017, the Development Rights Valuation shall be set at $307.45 per
  square foot"; the contribution is the greater of "20 percent of the sales price of the transferred floor
  area" or 20% of that valuation; reviewed "not more than once every three years and not less than once
  every five years" · Zoning Resolution §81-642 · `[>5y]` figure [ZR-81]. Later changes weren't checked.

*Other US / international* — not searched.

**Reliability: thin.** Old, dispersed transfer prices; nothing on how unused air rights move a
townhouse's own sale price.

**Notes** — 84% of priced zoning-lot-merger transfers and all landmark and special-district transfers
were in Manhattan [Furman-2013]. Overlaps lot size (34), since unused floor area is lot area times
permitted floor-area ratio minus what's built.

### 34. Lot size, width and frontage

*Appendix A: land characteristics. Townhouses.*

**How practitioners derive it**
- **Ranking** comps on "size, corner lot, frontage, etc." — the textbook example [UBC-ARE-2010].
- **Grouped averages by width band** — what townhouse broker reports publish; confounded by interior size,
  condition and neighbourhood. *Casa: partly*, small volumes (116 Manhattan and 144 Brooklyn townhouse
  sales in the first half of 2026 [LJG-MN-2026; LJG-BK-2026]).
- Paired sales or regression: not feasible at townhouse volumes.

**What published evidence reports**

*NYC* — **average sale price by width band, H1 2026 (raw, extracted from chart text — check against the
PDF):** Manhattan <17 ft $5.1M · 17–19 $6.2M · 20–21 $8.5M · 22–24 $11.3M · 24+ $17.7M; Brooklyn $2.7M ·
$4.0M · $4.8M · $6.1M · $7.7M; some neighbourhood series are not monotonic (Upper West Side $5.1M ·
$6.0M · $5.6M · $5.4M · $7.9M; Park Slope's widest band $2.7M, below its middle bands) · broker reports ·
[LJG-MN-2026; LJG-BK-2026]. "increasingly scarce double-wide residences" and "ultra-prime, double-wide
'mega mansions'" drive the top.

*Other US* — the national hedonic review's lot-size findings couldn't be opened [Sirmans-2005].

**Reliability: thin.**

**Notes** — width and interior size move together; adjusting both double counts. Links to 33 (buildable
area) and 35 (multi-unit configurations).

### 35. Legal use and certificate of occupancy

*Appendix A: legal unit count and use. Townhouses, multi-family.*

**How practitioners derive it** — **as a gate, not an adjustment.** Fannie Mae classifies zoning
compliance as "a legal conforming use", "a legal non-conforming (grandfathered) use", "an illegal use under
the zoning regulations", or "no local zoning"; a legal non-conforming use is acceptable if the appraisal
"reflects any adverse effect … on the value and the marketability" [FNMA-B4-1.3-04]; a non-compliant
accessory unit needs "At least two comparable sales with the same non-compliant zoning use"
[FNMA-B4-1.3-05]. *Casa: partly* — DOB records are public; the export has no legal unit count.

**What published evidence reports** — **definitions only.** "A Certificate of Occupancy (CO) states a
legal use and/or type of permitted occupancy of a building"; "Buildings built before 1938 aren't required
to have a Certificate of Occupancy – unless later alterations changed its use, egress or occupancy"
[DOB-CO]. No evidence found on the price effect of legal against illegal units.

**Reliability: none** for a magnitude.

**Notes** — pricing income from unlawful units in client-facing copy could read as endorsing illegal
occupancy, a tenant-safety and fair-housing concern. A pre-1938 building may lawfully lack a CO, so "no CO
found" isn't evidence of illegality.

### 36. Rental income and yield

*Appendix A: achievable rent and gross yield — needs rent comps the export doesn't carry. Investor
audience; the offer module.*

**How practitioners derive it**
- **Gross rent multiplier** — "All comps used in the GRM comparison grid must be settled sales"; "If there
  is an Income Approach, there must also be a rent schedule"; the rent comps "may be different than those
  used in the Sales Comparison Approach" [URAR-2026]. Required for two- to four-unit properties
  [FNMA-B4-1.3-10].
- **Direct capitalisation** — USPAP requires analysing "comparable rental data" when an income approach
  is necessary [USPAP-2024].
- *Casa: no, today* — the export carries no rents.

**What published evidence reports**

*NYC*
- **Gross yields from median asking rents and median list prices, June 2026 (Global Property Guide):
  Manhattan studio 7.73%, one-bedroom 6.21%, two-bedroom 4.48%, three-bedroom 3.90%, four-plus-bedroom
  3.63%** — "All yields are gross - i.e., before taxes, repair costs, ground rents, estate agents' fees,
  and any other costs. Net yields (what you'll really earn) are typically around 1.5% to 2% lower";
  source data from realtor.com; asking prices and asking rents, not transactions · read via a reader
  service (direct fetch blocked) [GPG-2026].
- **A Manhattan broker (Aug 2026):** "The current rental yield or cap rate for a Manhattan condominium is
  between 2 to 3 percent", "in the low 2 percent for many years" · no data or method given
  [CastleAve-2026].
- **Crowd-sourced:** New York "Gross Rental Yield (City Centre): 5.53%" · 214 entries from 50 contributors
  [Numbeo-2026].

**Reliability: thin.** Asking-based and crowd-sourced figures only; no transaction-based NYC yield study
was found.

**Notes**
- **The ChatGPT draft's "gross yield is eight and a half percent"** for 100 Barclay #17L, a Tribeca
  condo whose export comps are all three-bedrooms (`00-orientation.md` §3), sits above every Manhattan
  figure found here — the highest being 7.73%, for studios, and 3.90% for three-bedrooms — and all of those
  are gross, before a condo's common charges and taxes. This is a comparison of reported figures, not a
  new estimate.
- *Co-op:* sublet policies limit achievable rent (22).
- *Entry-level vs luxury:* gross yield falls steadily with unit size in the Manhattan figures [GPG-2026].
- The rent comps for a yield analysis are a different set from the sales comps [URAR-2026]; if a yield
  factor is added beside sales comps that already reflect rental demand, the same effect may count twice.

## Interaction evidence

What the main research turned up on factors that change one another's value — collected, not hunted
(a dedicated study is CR-R2). Relationship names follow A.5: substitutes, complements, overlap,
conditional, offsetting, correlated.

### The ten pairs already in A.5

| Factors | A.5 says | What the evidence found |
|---|---|---|
| Outdoor space (7) ↔ shared outdoor amenities (15) | Substitutes | **Nothing on substitution.** StreetEasy prices private terraces (above $2.5M) and shared terraces and roof decks (below $2.5M) separately, in different tiers [SE-2022-features]; brokers note building amenities "come as a package deal" [BU-2024-outdoor]. |
| Parking (23) ↔ micro-location (25) | Conditional substitutes | Consistent, from rentals: bundled garage parking is worth $621 a year (13%) to carless renters against about $1,700 (17%) overall, and NYC has the highest share of units without parking (73%) [GP-2017] `[>5y]`. No NYC sale evidence. |
| Outdoor space (7) × views (6) | Complements | **Mixed.** NYC brokers: "a tiny balcony with a poor view can actually turn a buyer off"; size, usability and views set where in Miller's 25–50% range a terrace falls [BU-2024-outdoor]. Hong Kong: a balcony premium "irrespective of the quality of the view" [Chau-2004]. |
| Floor (4) × views (6) | Overlap | **Partial overlap, well supported.** One Manhattan study reads the whole high-floor premium as view [GGS-2003]; a rent study says the slope above the ground floor is "predominately explained by amenities (e.g. views)" [DH-2018]. But floor stays positive with view held constant — +0.58% (condo) and +0.96% (co-op) per floor with view grades in the model [SVM-2006]; S$9,472 per floor with a sea-view measure [Yu-2007]. Miller adjusts the two separately [MS-2010-floor]. |
| Interior size (1) ↔ bedrooms and bathrooms (2) | Overlap | **Partial.** "controlling for square feet, additional bedrooms and bathrooms add significantly to value" [SVM-2006] — so bedroom effects exist beyond size, but an unconditional $/sf rate plus a bedroom premium counts size twice. Smaller apartments with more rooms rent for more per square metre [Vienna-2025]. |
| Unit type (11) ↔ floor, outdoor, views | Overlap | **Supported.** Penthouse premiums come from "amenities that the other apartments simply don't have, like outdoor space, fireplaces, and high ceilings" [BU-2023-penthouse]; the top floor adds nothing beyond its floor in San Diego [CNS-2013]; a top-floor *discount* in Korea [HM-2023]. |
| Amenities (15) ↔ carrying costs (19) | Offsetting | **Supported.** Full-service buildings are "significantly more expensive to run" [BU-2019-maint]; Miller adjusts carrying costs "after adjusting for amenities" — a sequence that avoids double counting [BU-2023-carryprice]. |
| Service level (14) ↔ building size (17) | Correlated | **Supported, qualitatively.** Staff cost per owner falls with building size [BU-2019-maint]; "A small building may not have a live-in super"; "Bigger buildings typically have more amenities" [BU-bigsmall]. |
| Condition (8) ↔ building era (16) | Correlated | **Supported.** Age is negative within prewar and postwar, which "may reflect the greater need for rehabilitation" [SVM-2006]; condition information adds most "if the subject property is unusual for the neighborhood" [MSK-2018]. |
| Sponsor sales (18) ↔ concessions (30) | Overlap | **Supported.** A buyer paying the seller's transfer taxes is a concession-like shift [Nacmias; FNMA-B4-1.3-09]; price-only listing discounts can't see concessions [Elliman-Q3-2025]. |

### Interactions the evidence adds

| Factors | Relationship | Evidence |
|---|---|---|
| Tax abatements (20) ↔ carrying costs (19) | Overlap | The abatement *is* the lower tax until it expires; adjusting both double counts unless carry uses the post-expiry tax [Coste-2024]. |
| Ground lease (24) ↔ carrying costs (19) | Partial overlap | Ground rent flows through maintenance — the co-op ground-lease coefficient is insignificant because the dependent variable already includes maintenance [SVM-2006]; reset risk is not yet in maintenance [Miller-2025-groundlease]. |
| Building financials (21) ↔ carrying costs (19) | Overlap | Underlying-mortgage debt service sits inside maintenance [MS-2002-coops; SVM-2006]. |
| Policies — financing limits (22) ↔ condo or co-op form | Conditional | **Magnitudes:** the condo premium is 13.4% over a co-op with no restrictions, 10.6% over the usual 60–79% rule, and −25.4% against co-ops allowing no financing [SVM-2006]. |
| Policies (22) ↔ building financials (21) | Complements / substitutes | Financing and approval rules protect against maintenance shortfalls; a flip tax lets a co-op "raise funds without assessing members" [SVM-2006; Cooperator-2015-flip]. |
| School zone (27) ↔ micro-location (25) | Overlap | **Magnitude:** adding neighbourhood controls "reduces this estimate further, by approximately 50 percent" [BFM-2007]. |
| School zone (27), conditional on alternatives | Conditional | **Magnitude:** a choice school cuts zoned-school capitalisation "by approximately one third" [SVH-2014]; capitalisation "shrinks as the availability of private schools increases" [FG-2010]. |
| Distance (26) ↔ micro-location (25) | Overlap | Proximity is non-adjustable, location adjustable, on the appraisal form [URAR-2026]. |
| Sale conditions (29) ↔ condition (8) | Overlap | Death-related discounts "may result from poor home maintenance by older sellers" [CGP-2009]. |
| Recency (28) ↔ evidence status (32) and sponsor sales (18) | Conditional | Time runs from the contract date [FNMA-B4-1.3-09]; new-development closings reflect contracts signed "months, and even years" earlier [BHS-1Q25]. |
| Finishes (9) ↔ condition (8) | Overlap | Kitchen and bath state defines condition grades C3–C5 and also sits in the quality rating [UAD-Ratings-2025]. |
| Finishes and amenities (9, 14, 15) — among themselves | Non-additive | StreetEasy's premiums "cannot be added together to determine a cumulative impact", and an amenity counts for more "if that amenity is rarer relative to the comparables in the area" [SE-2022-features]. |
| Finishes and amenities (9, 15) ↔ interior size (1) | Overlap | StreetEasy's regressions don't control for square footage, so its premiums may include size [SE-2022-features]. |
| Outdoor space (7) ↔ interior size (1) | Overlap | Miller's method adds converted outdoor area to interior square footage; a separate outdoor adjustment on top would count it twice [MS-2010-terrace]. |
| Outdoor space (7) ↔ floor (4) | Conditional | Low-floor terraces suffer "noise and soot" [MS-2010-terrace]. |
| Outdoor space (7) ↔ carrying costs (19), co-ops | Overlap | Outdoor space "can be factored into the number of shares you have in a co-op" [BU-2024-outdoor]. |
| Exposure (5) × views (6) | Complements | **Magnitude:** a landmark view's 6% premium is "boosted a further 4% by south-facing orientation" (Shanghai) [Lu-2018]. |
| Exposure (5) ↔ floor (4) | Conditional | The value of sunlight is larger on higher floors (Shanghai) [Zhong-2022]. |
| Floor (4) ↔ building type (16, 17) | Conditional | **Magnitude:** +0.55% per floor with an elevator, −4.21% per floor in walk-ups (Taipei) [CPY-2022]. |
| Noise (12) ↔ floor (4) | Overlap | The ground-floor discount bundles noise with security and privacy [MS-2010-floor]. |
| Noise (12) ↔ finishes (9) | Partial substitutes | Air conditioning and insulation as defences against noise [Nelson-2008]. |
| Street position (12) ↔ exposure and views (5, 6) | Overlap | Front against rear carries light and view as well as noise [GKBNY]. |
| Ceiling height (10) ↔ finishes/quality (9) and unit type (11) | Overlap | UAD rolls ceilings into interior quality [UAD-Ratings-2025]; the `Loft` tag carries volume. |
| Parking (23) and storage (13) ↔ amenities (15) | Overlap | The export lists both as building amenities; scoring them twice double counts. |
| Combination units (31) ↔ interior size (1) | Overlap | The "premium for larger contiguous space" [MS-2014-combos] is the size effect. |
| Lot width (34) ↔ interior size (1); air rights (33) ↔ lot size (34) | Overlap | Wider houses are larger; unused floor area derives from lot area [LJG-MN-2026; Furman-2013]. |
| Legal use (35) ↔ rental income (36) | Conditional | Legal unit count bounds the lawful rent roll [FNMA-B4-1.3-05]. |
| Concessions (30) ↔ evidence status (32) | Overlap | A recorded price can include credits a sale-to-list ratio can't see [URAR-2026]. |

**For CR-R2:** the only interaction *magnitudes* found are the financing-rule-conditional condo premium,
the school-zone reductions (about 50% with neighbourhood controls; about a third with a choice school),
the Shanghai orientation boost, and the Taipei elevator/walk-up floor gradients. Everything else is
direction or structure.

## Possibly missing from Appendix A

The appraisal literature's standard *elements of comparison* — property rights conveyed, financing terms,
conditions of sale, expenditures immediately after purchase, market conditions, location, physical and
economic characteristics, use, non-realty components [UBC-ARE-2010] — map onto Appendix A well, with
three gaps:

- **Financing terms — cash against mortgage-financed purchases.** Across US home sales 1980–2017, "mortgaged
  buyers pay an 11% premium over all-cash buyers to compensate home sellers for mortgage transaction
  frictions" (11.7% in the repeat-sales and hedonic estimate) · multiple datasets · full text · `[>5y]`
  data, published 2024 [Reher-Valkanov-2024]. Manhattan is majority-cash: 64.7% of sales in Q4 2025,
  "short of the all-time high of 69.1% in the second quarter" [Elliman-Q4-2025]. No NYC estimate of a
  cash discount was found.
- **Occupancy — sold with a tenant in place.** Under a non-eviction conversion "an outside purchaser of an
  occupied apartment may not evict" a rent-stabilised tenant [RGB-FAQ]; the purchaser of an occupied
  conversion unit pays "the amount due as maintenance charges for the apartment even if the amount is more
  than the rent received" [NYAG-13NYCRR-18.3]. A Corcoran broker: "Usually, the price is low because there
  is a catch" [BU-2024-tenantinplace]. **No magnitude found.** This is the "property rights conveyed"
  element for NYC co-ops.
- **Non-realty components** — furniture or other personal property included in a price. The redesigned
  appraisal form counts "furniture, carpeting, decorator allowances" among sales concessions [URAR-2026];
  factor 30 could name it.

## What this research could not reach

Worth a person with library or browser access, or a later pass:
- **Paywalled or unread:** *The Appraisal of Real Estate*, 15th ed.; the full texts of Sirmans et al.
  (2005, 2006) and Zietz et al. (2008); Nelson's airport-noise meta-analysis (2004); Benson et al. (1998),
  Bond et al. (2002) and Jim & Chen (2009) on views; Schwartz, Voicu & Horn (2014) on NYC school zones —
  the NYC study's baseline magnitude isn't in its abstract; the published *Journal of Legal Studies*
  version of Schill, Voicu & Miller (the working paper was read).
- **Moved or blocked:** the city Independent Budget Office's 2017 421-a report (cited through a blog);
  an UrbanDigs renovation analysis in Forbes (May 2024); Marketproof's new-development reports;
  StreetEasy's own methodology pages. StreetEasy's blog blocks automated reading; its 2022 amenity study
  and its sale-to-list explainer were read through a reader service, and its help centre through its
  public API.
- **Not searched, because the session's shared search allowance ran out:** NYC evidence on avenue
  against side street, elevated trains and front against rear units; ceiling height; corner units;
  part-time and virtual doormen; condo conversions; NYC sponsor concession sizes; academic evidence on how
  concessions are capitalised; NYC contract-to-close lags; the NYC Commission on Human Rights and NY
  Department of State rules on discussing schools.

## Appendix A: definitions the evidence questions

Raised here for Casanova, who owns the design; nothing in `01-design.md` has been edited. Each is
explained in its factor's notes.

1. **Size (1):** state the measurement basis and how estimated square footage is handled; say which
   non-linearity is meant (within a building value rises less than proportionally; across the market $/sf
   rises with size).
2. **Bedrooms and bathrooms (2):** say whether the adjustment is conditional on size, and how half baths
   and staff or flex rooms count.
3. **Floor (4):** the effect isn't monotonic, and height relative to neighbouring buildings matters more
   than height within the building.
4. **Exposure and light (5)** bundles three measured things; a corner adjustment overlaps size and
   layout.
5. **Views (6):** the export tags lack park and landmark views; view quality is graded in the literature,
   not yes/no.
6. **Outdoor space (7):** value depends on size relative to the interior, shape and floor, not only size
   and access.
7. **Condition (8)** mixes condition with how recent a renovation is; UAD's written C1–C6 scale separates
   them.
8. **Finishes (9)** combines a quality grade with yes/no systems; dishwasher and en-suite bathroom are
   significant NYC premiums not named; co-op laundry needs installed / permitted / prohibited.
9. **Unit type (11)** should be defined net of floor, outdoor space and view.
10. **Carrying costs (19)** should say whether taxes are taken before or after owners' personal exemptions
    — after would price in a seller's age or disability — and how condo and co-op carry are made
    comparable.
11. **Tax abatements (20):** 421-a is an exemption; add 485-x, 421-a(16) and Battery Park City's payments
    in lieu of taxes; J-51 reaches co-ops.
12. **Policies (22):** the permitted financing percentage should be graded, and it interacts with the
    condo/co-op distinction.
13. **Distance (26)** is a selection rule and a weight in practice, not an adjustment.
14. **Recency (28):** practice adjusts from the contract date; the export's `Status Date` needs defining
    by status.
15. **Evidence status (32):** practice does convert unsold comps' asks with a market-supported
    sale-to-list ratio — which the design's price evaluation already approximates.
16. **Sequence:** appraisal practice applies transactional adjustments (rights, financing, conditions of
    sale, time) before property ones. If any magnitude ends up as a percentage, whether they compound
    matters to the additive model (§6.5); not verified here.
17. **Missing elements:** financing terms, occupancy, non-realty components (above).
