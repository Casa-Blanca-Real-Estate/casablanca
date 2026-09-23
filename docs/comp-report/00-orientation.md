# Comp report tool — orientation

**Status:** pre-design. This is the record of what we know as of 2026-09-23 — requirements from the
kickoff, what the input data actually looks like, NYC practice, and the questions still open.
The master design doc gets written from this once the questions are settled. Nothing here is a
decision yet unless it says so.

Sources: `sources/` (both transcripts, Hannah's StreetEasy export). Read `sources/README.md`
for the transcription glossary — the raw transcripts mangle "co-op", "doorman" and "StreetEasy"
consistently.

---

## 1. What we're building

A Creative Studio tool where an agent brings the comps they found on StreetEasy, works through
them with an AI, settles on a defensible price range, and walks away with a client-ready email
and a Casa Blanca–branded report — in minutes rather than hours.

Kimani's framing of the shape: submit the StreetEasy export → discuss the results with a chat
assistant → refine and edit → populate a comp report template (designed by Kimani) → export,
most likely as PDF. Chat sessions and prior reports must be recoverable, which means accounts
and data retention — a first for the studio.

## 2. What Hannah and Noble said

### Hannah (CEO) — the why, and the quality bar

- **Comps are how an agent establishes value** for any offer, buy side or sell side. "It's the
  most important thing an agent does" — and when she was a new agent, the most time-consuming.
  The goal: **six hours down to twenty minutes**, with the agent doing ~15% of the work.
- **Like for like, always.** A condo is only compared to condos; a co-op only to co-ops.
- **The human still does the search and the selection.** StreetEasy's comps tool does the
  basics; she still wants agents to actually go through the properties and look at the photos,
  because the data lies about sameness: *"Something on Canal Street could be called Tribeca, but
  it's not really Tribeca. That's the part a human has to do."*
- **The agent states their own view first.** At the start the agent says what they think it
  should trade for; the AI helps explain and support that range. She doesn't want agents to
  just take the first output — *"I want them to think about it."*
- **Never an exact price. Always a range.** Stated as a rule.
- **For condos, price per square foot is the number one driver.** Her ChatGPT session framed the
  argument as $/sqft bands: the comp set, what's closing, what luxury product is going into
  contract at.
- **Co-ops are different — no square footage.** Instead: bedroom and bathroom count, the
  building, floor (higher trades for more), renovation, doorman, and high monthly charges.
- **Branded Casa Blanca, not StreetEasy.** Her StreetEasy-generated PDF is StreetEasy-branded
  with her name and logo on top; hers is fancier than most agents' because of her account tier.
  StreetEasy's report shows sold / in contract / active, $/sqft, an estimated range, average
  price, days on market, and engagement (views, saves) that only StreetEasy has.
- **Clients don't want the spreadsheet.** *"Most people really just want an email breaking it
  down with some data, maybe a nice PDF attached — people want to actually understand the
  info."* **The email is the primary deliverable; the PDF is the attachment.**
- Prior art inside Casa: Josie screenshotted StreetEasy listings into her own AI, which drafted
  the email and a small $/sqft spreadsheet.

### Noble (teaches comps) — how agents really work, and where StreetEasy breaks

- StreetEasy's comps tool is **inconsistent**: sometimes zero results even going back 180 days;
  sometimes it stretches to units that aren't true comparables — different condition, or a
  location that looks subtle on the map and is major in real life. *"It's not a problem of just
  filtering."*
- It runs three ways — exact unit, building, neighborhood — and widening the scope gets more
  results that need more care.
- **Noble prefers the plain search:** More → Sold → sort by Newest, which bypasses StreetEasy's
  own matching and goes "straight to the source."
- **Recency matters more than usual right now** because of rates: three-, six-, twelve-month-old
  sales are increasingly less relevant.
- Agents are also taught Perchwell; advanced agents pull from Zillow and Redfin for houses, and
  from other brokerages' listing pages (Compass shows recent solds at the bottom).
- **v1 scope, as agreed on that call: StreetEasy only, the export, keep it simple.** The AI
  refines and explains; it doesn't replace the agent's judgment about what makes a good comp.
- **Preemptive comps as business development.** Sending comps before being asked — as
  information sharing — should win agents more offers and make them look more prepared.

## 3. The input, dissected

Hannah's export for 100 Barclay St #17L is the reference fixture. 11 comps, 31 columns:
`Address, Unit, Listing URL, Listing Status, Status Date, Property Type, Neighborhood, Beds,
Baths, Sqft, Floor, Sale Price, $/Sqft, Listing Price, Agent Commentary, Common Charges, Monthly
Taxes, Maintenance Fees, Days on Market, Views, Saves, Shares, Building Name, Building Address,
Building Type, Building Neighborhood, Units in Building, Stories in Building, Building Policies,
Home Features, Building Amenities`.

| Comp | Status | Floor | Sqft | Sold | Last ask | $/sqft (CSV) | Basis | vs ask | DOM |
|---|---|---|---|---|---|---|---|---|---|
| 200 Chambers #10A | Sold | 10 | 2,201 | $4.65M | $4.795M | 2,112 | sale | −3.0% | 24 |
| 79 Laight #1A | Sold | 1 | 3,000 | $4.60M | — | 1,533 | sale | — | 0 |
| 181 Hudson #1A | Sold | 1 | 1,935 | $2.24M | $1.995M | 1,157 | sale | **+12.3%** | 25 |
| 5 Franklin Pl #14A | Sold | 14 | **~1,840** | $4.175M | $4.35M | 2,269 | sale | −4.0% | 148 |
| 66 Leonard #12A | Sold | 12 | 2,319 | $5.70M | $5.95M | 2,457 | sale | −4.2% | 259 |
| 108 Leonard #7G | In contract | 7 | 2,014 | — | $4.835M | 2,400 | **ask** | — | 300 |
| 101 Leonard #5B | In contract | **—** | 1,815 | — | $2.95M | 1,625 | **ask** | — | 83 |
| 25 N Moore #9C | In contract | 9 | 1,883 | — | $4.495M | 2,387 | **ask** | — | 18 |
| 111 Murray #35A | Active | 35 | 1,939 | — | $5.995M | 3,091 | **ask** | — | 0 |
| **100 Barclay #11F** | Active | 11 | **—** | — | $4.25M | — | — | — | 2 |
| 77 Reade #PHA | Active | 8 | 2,169 | — | $5.995M | 2,763 | **ask** | — | 6 |

**The traps, every one of them in a single real export:**

1. **The `$/Sqft` column silently changes meaning by status.** Sold rows divide the sale price;
   in-contract and active rows divide the *asking* price (verified by recomputing every row —
   values are truncated, not rounded). Averaging the column mixes what buyers paid with what
   sellers hope for. **Sold and ask $/sqft must never share a statistic.**
2. **One judgment call swings the answer ~20%.** Sold mean $/sqft across all five is **$1,906**.
   Drop the two ground-floor units and it's **$2,279**. Those two are a different product for a
   17th-floor unit: 181 Hudson #1A is a loft in an 8-story, 33-unit building with no doorman, and
   it sold 12.3% *over* ask. This is exactly the call Hannah says a human must make — and a naive
   average hides it.
3. **79 Laight #1A is a public-record closing, not a listing** (`/closing/` URL): no ask, no
   days on market, no engagement, no features, no amenities. Its condition can't be checked.
4. **Square footage can be approximate.** 5 Franklin's is `~1,840 ft²`. StreetEasy's comps tool
   uses **AI-inferred square footage**, which is the likely meaning of the tilde. Its $/sqft
   inherits that uncertainty.
5. **The only same-building comp has no square footage.** 100 Barclay #11F — in NYC practice the
   single most valuable comparable — can't contribute to a $/sqft argument at all.
6. **The subject isn't in the export.** 17L's size, floor, condition and charges have to come
   from the agent (or a listing lookup).
7. Missing floor on 101 Leonard #5B; `Agent Commentary` and `Maintenance Fees` empty in every row
   (maintenance is the co-op carry, so a condo set leaves it blank by design).
8. Useful signal the CSV does carry: **sold units closed 3–4% under last ask** in this set, and
   days on market runs 24 to 259 — negotiation margin and demand, both worth putting in front of
   a client.

**One more, from the transcript:** Hannah's ChatGPT output apparently included an investment
angle — rent achievable, *"gross yield is eight and a half percent."* **The export contains no
rent data at all.** Whatever produced that number, it wasn't the data, and 8.5% gross would be
far outside what Manhattan luxury condos yield. This is the failure mode the design has to make
impossible, not merely unlikely.

## 4. NYC practice — what the research adds

- **Same building first, then same line, then the neighborhood.** Large buildings are their own
  micro-market; adjust for floor, views, exposure, layout and condition before reaching further.
  ([Milton Coste](https://miltoncoste.com/blog/strategic-pricing-cma-nyc-sellers),
  [W Team](https://thewteam.com/blog/pricing-your-upper-east-side-co-op-for-todays-market))
- **Service level is a separate value scale.** Walk-up, part-time doorman and full-service
  buildings price differently even on the same block. ([W Team](https://thewteam.com/blog/pricing-your-upper-east-side-co-op-for-todays-market))
- **Price against current closed sales**, not old peaks. ([DeFalco](https://www.defalcorealty.com/blog/manhattan-real-estate-market/))
- **Co-ops: square footage is unreliable** — often computed by the listing agent or seller —
  and **the building's financials can matter more than the unit**: reserves, maintenance
  trajectory, assessments. Financing limits (commonly 75–80% LTV plus post-closing liquidity)
  narrow the buyer pool and move value. Same-building comps are the strongest because they hold
  financials, policies and services constant. ([Miller Samuel](https://millersamuel.com/papers/appraising-co-ops-taking-stock-of-their-value/),
  [Madison & Park](https://www.madisonparkappraisal.com/blog/manhattan-coop-appraisal-process),
  [Elika](https://www.elikarealestate.com/blog/co-ops-appraised/))
- **Condos typically carry a meaningful $/sqft premium over comparable co-ops** — sources
  range from 10–20% to much more — which is why mixing them corrupts a comp set.
  ([YRE](https://blog.yeonyc.com/72754), [DeFalco](https://www.defalcorealty.com/blog/nyc-co-op-vs-condo-vs-house/))
- **A CMA is not an appraisal.** NY's Department of State treats a licensee's "comparative
  market analysis" as a market-value estimate that explicitly doesn't count as appraisal
  experience. The output must never be called an appraisal or valuation, and should carry a
  not-an-appraisal disclaimer. ([NY DOS](https://dos.ny.gov/frequently-asked-questions-real-estate-appraiser))
- **Fair housing applies to AI-written copy.** HUD's 2024 guidance applies the Fair Housing Act
  to AI-generated advertising and content. The risk is less the obvious banned word than
  *stacked* signals — school ratings, "who's moving in", neighborhood "feel" — that together read
  as a demographic preference. ([HousingWire](https://www.housingwire.com/articles/ai-fair-housing-remarks-checklist/),
  [CohnReznick](https://www.cohnreznick.com/insights/hud-offers-fair-housing-act-guidance-on-ai-applications))
  **NYC's Human Rights Law is broader than federal law** — it adds lawful source of income,
  alienage and immigration status, and more — and binds brokers and agents directly.
  ([NYC Fair Housing](https://www.nyc.gov/site/fairhousing/rights-responsibilities/what-are-the-protected-classes.page))
- **StreetEasy's comps tool is agent-only and tiered.** It runs on StreetEasy's own data —
  including AI-inferred square footage and renovation status, ~20 years of history, engagement
  and price-change history — and exports branded reports and CSV. StreetEasy's support docs split
  instructions between Agent Advantage and non–Agent Advantage accounts, so **the export may
  differ by tier**. ([StreetEasy](https://streeteasy.com/blog/streeteasy-comps-tool/),
  [StreetEasy support](https://support.streeteasy.com/hc/en-us/articles/203856839-How-do-I-create-a-Comparables-Report))
  StreetEasy's terms on re-presenting that data under another brand weren't found — open
  question for Hannah.

## 5. Principles this points to — draft, for discussion

1. **Code computes, the model explains.** Every figure in a report is calculated
   deterministically from the data and traceable to the rows it came from. The model argues,
   organises and writes; it never produces a number. This is the 8.5%-yield problem solved by
   construction rather than by prompting.
2. **Sold and ask are different evidence.** Separate bands, labelled as such, never averaged
   together.
3. **A range, never a point** — enforced in the output, not just requested.
4. **Agent judgment is structural, not optional.** The agent states their own range first;
   includes or excludes each comp with a reason; marks each listing as reviewed. The tool shows
   the range move as comps go in and out — which makes the judgment visible, and turns every
   report into the training exercise Noble runs.
5. **Condos and co-ops are two analyses**, not one analysis with a missing column.
6. **The email is the deliverable. The PDF is the attachment.**
7. **Compliance is built in:** never "appraisal"; a disclaimer on every export; generated copy
   constrained to property and market facts, checked against federal and NYC protected classes.

## 6. Architecture positions — draft

- **Integrated AI, not bring-your-own-key.** Agents are the hardest users in the company to get
  to do setup (context §6), BYO keys would make quality vary by provider, and principle 1 and the
  compliance rules only hold if Casa controls the model and the prompt. Measured cost makes it
  cheap anyway — see below.
- **The chat edits the report; it doesn't just talk about it.** The assistant acts through tools
  on a structured report object — include this comp, exclude that one with a reason, set the
  range, redraft a section — so "populate the template" is the report's own state, not prose to
  copy out of a chat window.
- **Accounts and retention are required**, which departs from the studio's no-accounts rule.
  That departure should be scoped to this tool.
- **Stack is an open decision.** This is the most stateful thing the studio has built — live
  chat, a recomputing comp table, an editable report, auth, history. The React spike on
  `claude/motion-graphic-stories-hlpirk` (and its `docs/react-in-the-studio.md`) argued exactly
  this case: a Vite-built tool compiles to static files alongside the hand-written ones, and its
  cost is deploy fragility. The agents build already introduced a build step in September.
- **Auth candidates:** Google sign-in restricted to the Casa domain (if Casa is on Google
  Workspace — offboarding then happens for free when an agent's account is closed), Netlify
  Identity (deprecation was announced and **reversed in February 2026**, so it's supported but
  has shown platform risk), or Auth0 via Netlify's extension. ([Netlify forums](https://answers.netlify.com/t/netlify-identity-is-staying-feb-2026-reversal-what-changed-whos-affected-and-how-to-proceed/162733))
- **Data:** Netlify Blobs is key-value — fine for a report blob, weak for "find my past reports,"
  history and admin views. A real database is probably warranted here.

### Cost of integrated AI

Current Anthropic list pricing per million tokens (input / output): **Claude Opus 5 $5 / $25,
Claude Sonnet 5 $2 / $10, Claude Haiku 4.5 $1 / $5**; cached input reads bill at about a tenth
of the input rate.

Rough session model: a ~6K-token system prompt plus ~3–4K of normalised comp data, both cached;
one analysis pass, about eight chat turns, the email and the report narrative. Call it ~150K
input tokens (mostly cache reads) and ~20K output tokens including reasoning.

| Model | ≈ per report session | 100 reports/mo | 800 reports/mo |
|---|---|---|---|
| Claude Opus 5 | $0.50–1.50 | $50–150 | $400–1,200 |
| Claude Sonnet 5 | $0.20–0.60 | $20–60 | $160–480 |
| Claude Haiku 4.5 | $0.10–0.30 | $10–30 | $80–240 |

An estimate from assumed token counts, not a measurement — the build should log real usage
from day one. For scale: a ChatGPT Plus seat is $20 per agent per month, so integrated wins
unless an agent runs dozens of reports a month. Model tier is Kimani's call; the case for the
top tier is that Hannah is judging this against ChatGPT's output, and principle 1 takes the
arithmetic off the model regardless.

## 7. Decisions — Kimani, 2026-09-23

1. **Audience: all agents**, with a smaller test group of agents throughout the build before the
   proper release.
2. **Auth: Google sign-in restricted to Casa's Workspace domain, plus a regular sign-in** for an
   authorised allowlist of non-Casa emails.
3. **Condos first, co-ops after** the full shape is proven. Kimani's point, which stands: the
   condo analysis already has to account for every factor a co-op analysis runs on — floor,
   building, condition, charges — so co-ops are the same scaffolding with square footage removed,
   not a second engine. **Design consequence:** $/sqft must be one benchmark among the factors,
   never the thing the rest of the model hangs off.
4. **Departing agents' reports are kept** for now; exporting them to the agent is a later call.
5. **More inputs requested** from Noble and a regular-account agent: standard-tier exports, a
   co-op export, reports made without AI, and Noble's examples of a perfect and a bad report,
   with his reasoning for each.
6. **Hannah's StreetEasy PDF** failed to upload twice; it goes into `sources/` directly. Her
   ChatGPT account's audit of her own comp workflow arrived instead — see §8.
7. **Buyer vs. seller:** Hannah says there's no meaningful difference in the comp itself.
   Revisit if a reason appears. (The *communication* still varies by audience — see §8.)
8. **StreetEasy data in Casa-branded reports: cleared.**
9. **Subject property capture: both** — prefill from a StreetEasy URL, and manual entry.
10. **Noble owns the house method — after a working prototype exists**, so he's reacting to
    something real. He'll also shape onboarding, help, hints and tips.

**Raised by Kimani, under discussion:** a client-viewable web page per report as a premium
deliverable alongside the PDF; and an agentic assistant whose tools let it change analysis
parameters case by case, wrapped around the deterministic engine.

## 8. The ChatGPT workflow audit — what we take, what we don't

`sources/2026-09-23-chatgpt-workflow-audit.md`, generated from Hannah's own ChatGPT history.

**Take — these are right, and several sharpen the draft principles in §5:**

- **The job is answering a transaction question, not "analyse the comps."** Is $X supported?
  What's it worth against the closest five? The report opens with a brief: property, question,
  audience, method, goal, output. The audit's six-field prompt structure becomes UI.
- **Neutral valuation first, then the argument.** "Help me show $11.5M is a good price" invites
  reverse-engineering every assumption. The target price is compared *against* an independently
  computed value, never fed into it. Reconciles with Hannah's "agent states their range first":
  the agent commits a hypothesis, the valuation is computed without it, then the gap is shown.
- **Assumption errors outnumber arithmetic errors.** Assumptions are a structured, locked,
  versioned layer — never conversational context. A revision makes v2; it never overwrites.
- **Several benchmarks, one explicit rule:** median, mean, weighted mean, and the single most
  comparable sale, each with its implied subject value, and a stated rule for which one leads.
- **Inclusion tiers with reasons:** primary / secondary / excluded, each with a reason — the
  comp universe shouldn't be rediscovered every session.
- **Provenance and freshness on every figure:** source and as-of date, stale values flagged.
- **Two output layers:** an analyst view and a send-to-client view, from the same numbers.
- **Facts → locked assumptions → calculations → QA → narrative.** Narrative last.

**Don't take as-is:**

- **The scope.** It describes Hannah's workload — "comp analyst + valuation modeler +
  transaction strategist + financial modeler + copywriter," rent-to-own structures with rent
  credits and 14-month closings. That's the ceiling of what the most sophisticated user in the
  company does, not the floor for ~200 agents whose need is the six-hours-to-twenty-minutes comp.
  **Offer-scenario and carry modelling is a later module.** The data model should admit it
  (immutable versioned scenarios are the right pattern regardless), but v1 doesn't build it.
- **Its luxury skew.** Scarcity premiums, parking contributions and $2–3M terrace adjustments
  dominate its examples. The model has to work for a Brooklyn one-bedroom first; luxury
  adjustments are optional layers.
- **Its adjustment numbers.** The outdoor weighting bands (balcony 15–25%, terrace 25–35%,
  exceptional 35–50%) are plausible but unsourced — ChatGPT's defaults, and the audit's own
  complaint is that ChatGPT picks these inconsistently. They're placeholder house defaults until
  Noble sets them.
- **A similarity score as the selector.** Scoring is useful for ranking and flagging, but Noble's
  point is that bad comps aren't a filtering problem and Hannah's is that a human has to look.
  The score sorts and warns; the agent decides.
- **Inputs the export doesn't carry.** Its scoring formula assumes outdoor square footage,
  condition, distance and parking type. The StreetEasy CSV has none of them as fields — outdoor
  space appears only as a "Terrace" or "Balcony" feature with no size, parking only as an
  amenity, and there are no coordinates. These must be agent-entered, looked up from the listing,
  or marked as estimated.
- **Excel as a client deliverable.** Hannah was explicit that clients don't want the
  spreadsheet. An analyst-view export at most.
