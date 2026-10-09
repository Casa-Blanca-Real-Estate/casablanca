# Comp report tool — master design

**v0.5.1 · 2026-09-29 · owner: Casanova.** The guiding document for every comp report dispatch.
Dispatches cite sections of this file; when a build finding contradicts it, the dispatch says so
in its PR and Casanova updates this file — the doc follows reality, not the other way round.

Background and sources: `00-orientation.md`. **Pending decisions live in `docs/decisions.md`**,
with room to answer inline; each section here ends with the decision IDs that bear on it. Decided
items are dated in §17.

### Version history

- **v0.5.1** — §7.1 after MindBinder's Jev handoff (D-12):
  - judgments land as "watch" until their question has a measured bar;
  - Jev goes through a paced queue, on a Vercel Pro team, with no training and zero retention;
  - CR-D (Dispatch 10) is in §16.
- **v0.5** — the reorientation after Kimani walked the CR-3a scaffold, Frankie's email, Kara's
  workshop, Noble's goals and 17 answered decisions:
  - **The report builds to a one-sentence headline** (§1, §10.2).
  - **Buyers first** (§1).
  - **A guided start:** the home, its details, then add comps, by StreetEasy link, export or hand
    (§3, §6.2).
  - **Mentors' comp rules become checks** (§6.10).
  - **Adjustments become the differences between comps**, not house values (§6.6).
  - **"Didn't sell" is a fourth evidence status** (§6.3), and there's a **price table** (§6.5).
  - **The training gate unlocks at five closed deals** (§11).
  - **The screens are specified in `02-screens.md`.**
- **v0.4** — after CR-R, CR-1 and CR-2 merged. A turn runs in a background function, because CR-1
  measured a 60 s cap on every response (§8.3 rule 6, §15). Google sign-in is tested on production
  (§13). CR-2's interpretations are settled (§6.2–§6.6, §7.1): "none listed" is approximate; recency
  windows cover in-contract comps too; opposite-pulling substitutes net out; agent values are
  magnitudes. Terms are fixed: input confidence vs judgment confidence, evidence status,
  sale-to-last-ask. CR-R's corrections are in Appendix A: tax exemptions, floor against neighbouring
  buildings, finishes, distance as a selection rule, new factors 37–39 and five new A.5 pairs.
- **v0.3** — five kinds of agent input, an assumptions panel and two-keyed capture (§2);
  progressive, skippable intake and the call-before-reveal order (§3); interactions between
  factors (§6.6, Appendix A.5); deal terms at intake (§6.7); the house glossary (§6.9); coaching
  level and intent disambiguation (§8.3); Path to target (§8.5); client profile and psychology
  (§8.6); agent voice (§8.7); a shared property record with reason history (§12).
- **v0.2** — separate kinds of input; no lock ceremony; no placeholder numbers; two results;
  rudimentary carry; code → Jev → LLM; QA warns rather than blocks; the training gate; the
  adjustment catalog; the research dispatch.
- **v0.1** — first draft.

---

## 1. What it is

A Creative Studio tool where an agent brings the comps they found on StreetEasy, works through
them with an AI assistant, settles a defensible price range, and leaves with a client-ready email
and a Casa Blanca–branded report.

**North star: six hours down to twenty minutes** — a direction to design toward, not a limit. A
diligent agent going back and forth to understand a comp in depth is the tool working, not
failing.

**The point of a report is one sentence.** Noble: the goal of a comp report is a one-sentence
headline of what the comps show, told to the client. The rest matters, and it's there to back the
headline up. Every screen feeds the headline or supports it (§10.2).

**Buyers first.** About 95% of Casa's comps are for buyers deciding what to offer. Kara: a comp
report is pulled when a buyer wants to make an offer, because "there needs to be some sort of logic
behind what they're offering — the comparative market report is the logic." Seller pricing uses the
same engine and screens with seller wording.

**Users:** Casa agents, piloted with a small group first, then released behind the training gate
(§11); admins (Kimani, Hannah); an allowlist of authorised non-Casa people. The heaviest users
will be the most active, highest-ticket agents — so luxury factors matter from the start, and
the architecture handles them the same way it handles everything else (§6.5).

**v1 does:** condo reports from comps added by StreetEasy link, by the StreetEasy comp export, or
by hand; subject capture by StreetEasy URL or by hand; an assistant that operates the analysis; two results (§6.4); rudimentary carrying cost and
price evaluation (§6.7); versioned numbers; client email in three lengths; a PDF of the client
report; saved, recoverable reports and chats.

**v1 does not:** co-ops (designed for — §6.3 — built next), full offer-scenario modelling (rent
credits, deposits, closing timelines), sources beyond StreetEasy, sending email, the client web
page (designed for — §10.4), Excel for clients, the training gate (post-launch — §11).

## 2. What the agent brings — five kinds of input

"Assumptions" covers several different things that need opposite treatment. The tool keeps them
apart.

| Kind | Example | How it's used |
|---|---|---|
| **Your call** — the agent's opinion of value | "I think it trades at $3.4–3.6M." | **Never enters the calculation.** Asked for before the computed range is revealed (§3.1). Can seed a what-if — *what would have to be true?* |
| **Target** — a price goal | "The seller wants $11.5M." "My buyer's ceiling is $3.2M." | **Never enters the calculation.** Once the neutral result exists, it drives *Path to target* (§8.5). |
| **Stated facts** | "The terrace is 400 sq ft — it's on the floor plan." "Probably about 400." | **Feed the calculation**, attributed to the agent. Sourced → used as `exact` and checked where possible. A guesstimate → *with estimates* only (§6.4). |
| **Method settings** | "Last six months only." "181 Hudson is secondary." "Add 5% for the terrace." | **Change the analysis**, with the agent's reason. A setting that carries a number is the agent's estimate — *with estimates* only. |
| **Notes** — context and opinion, not figures | "The seller is motivated." "The building's management has a great reputation." | **Never enter the numbers.** They inform strategy and the writer, labelled as the agent's view. |

**The assumptions panel.** One place, always reachable, holding every captured input. The agent
can edit it directly, without telling the chat; the assistant writes to it as the agent talks;
both see the same thing. Nothing lives only in chat history. Its exact shape is a prototyping
question.

**Capture is two-keyed.** The assistant files each statement — kind, field, value, basis. Jev
classifies the same statement independently (§7). Where they agree, the statement appears as a
chip the agent can confirm or edit. Where they disagree, or either is unsure, the agent gets a
one-tap question: *"Is 400 sq ft from the listing or floor plan, or your estimate?"*
Disagreements are logged, so testing shows exactly where the two readers diverge.

**Trust but verify.** A stated fact is used immediately and attributed to the agent. The tool then
checks it where it can — against the listing, the export, and earlier imports of the same property
(§12) — and flags a contradiction rather than silently overriding either side.

**Intake asks once; the panel stays open.** The opening form asks for what it needs a single time.
After that, inputs arrive whenever the agent offers them, in chat or in the panel, and every one
of them re-runs the analysis.

## 3. The workflow

**What each screen shows, and what folds away, is in `02-screens.md`.** The flow:

1. **New comp: a guided start, in a modal.** It has three screens.
   - **The home:** a StreetEasy link or an address; buyer or seller; the client's name.
   - **Its details:** the size is the one must; notes on what stands out; the rest folds away.
   - **Add comps:** paste StreetEasy links, drop the export, or type one in (§6.2). Each comp is
     checked against the mentors' rules as it lands (§6.10), and each property is recorded (§12).

   Everything past the home can be skipped. The target, deal terms and the client note come later,
   when they matter.
2. **Sort — range hidden.** The agent tiers each comp and notes, in a line or three, how it differs
   from the home. Kara calls the notes column "unbelievably important"; the note is the reason.
   **The range stays hidden until the agent gives their number, or skips it** (§3.1), which also stops
   tiering done to move the number.
3. **Findings.** First the agent's own number, then the reveal: what the comps say in one sentence,
   the range, the number against it (the teaching moment, §8.4), the evidence by status, and the price
   table. From here the range moves live as tiers, facts and settings change, and the agent can add
   comps or correct a fact at any time. The target price and deal terms appear here (D-4).
4. **Send.** First the headline: one sentence, the agent's, with drafts on offer (§10.2). Then the
   email built around it, in three lengths, and QA (§9). **Drafting pins the numbers as a version**
   (v1, v2 …). Copy the email; print the client report to PDF. Saved with its versions, chat and
   exports.

The assistant is a drawer, open from Sort, Findings and Send.

**No lock button.** Every draft is bound to the version it was written from. Change anything
afterwards — including by pushing back on the AI while drafting ("actually, drop 79 Laight") — and
the tool silently starts the next version; drafts from the earlier one show "numbers changed since
this draft — regenerate?"

### 3.1 Why the call comes before the reveal

| Order | For | Against |
|---|---|---|
| **Call first** — before any data | The purest read of the agent's intuition; no anchoring at all | Friction at the start; agents new to an area have no basis for a view, so the call is noise |
| **Data first** — call after seeing the range | Fastest start; the call is informed | The agent anchors on the computed number, the gap collapses, and the tool has done the thinking — the outcome to avoid |
| **Call before the reveal** — recommended | The agent forms a view the way real agents do, by looking at the comps, without being handed the answer; the gap stays honest; first-pass tiering can't chase the range | The range isn't live during the first pass — a small cost, and arguably a benefit |

**Skipping is allowed.** If the agent skips the call, the range is revealed and the teaching
comparison simply doesn't happen for that report. In practice mode (§11) the call is required.

*Decided 2026-09-29: D-1 (C, the call before the reveal), D-10 (B: buyer traditional purchase and seller pricing).*

## 4. Non-negotiables

1. **Code computes, the model explains.** Every figure comes from the engine or from something the
   agent stated, and is traceable to its source. The model argues, organises and writes.
2. **Nothing invents a number** — not the model, not Jev, and not the house method: a magnitude
   nobody has determined is shown as undetermined, never guessed (§6.6).
3. **Sold and ask are different evidence** — separate statistics, never averaged together.
4. **A range, never a point**, for value. A list-price recommendation is a strategy, not a value
   claim, and may be a single number.
5. **Neutral valuation before the argument.** The agent's call never feeds the numbers.
6. **Judgment is structural** — tier with a reason, mark reviewed, the call committed up front.
7. **Provenance on every figure** — source, as-of date, confidence.
8. **Compliance built in** — never "appraisal"; disclaimer and StreetEasy attribution on every
   export; generated copy screened against federal and NYC fair housing rules (§14).
9. **Everything is timestamped and attributed** — every input, judgment, change, reason and
   output records when it happened and who or what made it.

## 5. Architecture

```
Browser — React + Vite SPA at /tools/comp-report/
   │   renders state; runs the engine locally for instant recompute
   ▼
Netlify Functions — the authenticated API          ◄── Netlify Identity (Google + invites)
   │   reports, imports, engine snapshots, assistant turns, writer, QA
   ├──► Netlify Database (Postgres) ── reports, comps, statements, events, versions, transcripts
   ├──► Netlify Blobs ─────────────── uploaded exports, generated files
   ├──► Jev (TypeSafe AI) ─────────── typed judgments with confidence (§7)
   ├──► Anthropic API ─────────────── assistant and writer (§8)
   └──► Firecrawl ─────────────────── StreetEasy listing lookup (existing integration)
```

**The engine is one TypeScript module run in two places** — in the browser so the range moves the
instant a comp is toggled, and in the functions so every stored version is computed
authoritatively. Same code, same version string.

**The server owns the transcript and the report state** (§8.3).

## 6. The calculation engine

Pure TypeScript. No DOM, no network, no clock — inputs in, results out. Built and tested first and
alone (§16, CR-2).

### 6.1 Types

- **Money** in integer dollars; **area** in integer square feet; floats only for ratios. Display
  rounding (three significant figures for prices) is presentation, never applied inside the
  engine. **$/sqft displays truncated to whole dollars**, as StreetEasy shows it; rounding would put
  the figures $1 off what agents see there (CR-2).
- **Every input is sourced:**
  `{ value, source, as_of, confidence, note? }` where
  `source` is `se_export` · `se_pdf` · `listing` · `agent` · `hypothetical` · `engine`, and
  `confidence` — the **input confidence** — is `exact` · `approx` (marked approximate at its
  source, e.g. `~1,840 ft²`) · `inferred` (derived from listing text or a Jev judgment — needs the
  agent's confirmation) · `guesstimate` (the agent's estimate). Not to be confused with a Jev
  judgment's **judgment confidence** (§7.1), a calibrated probability.

### 6.2 Inputs — what StreetEasy gives us

**The CSV export is the primary input.** Reference fixture:
`sources/streeteasy-comp-export-100-barclay-17l-2026-09-23.csv`.

- **Map columns by header name, never position.** Unknown columns are kept and reported; missing
  ones are warnings. The parser is versioned; every import records its version.
- Parse `"2,201 ft²"`, `"$4,650,000"`, `"$2,112 ft²"`; a leading `~` sets `approx`.
- **Never trust the `$/Sqft` column.** Recompute from sale price (sold) or asking price (in
  contract, active), recording the basis. StreetEasy switches basis by status and truncates.
- A `/closing/` URL is a public-record closing without listing data. Flag it.
- Split features, amenities and policies on `;` into tags; derive service level, outdoor presence
  (**presence only — no size in the export**), parking and views from them. A tag column that has
  tags but none of a kind reads as **none listed**, with input confidence `approx`: the listing
  agent types these tags, so a missing terrace tag is weak evidence. A blank column is unknown.
- **`Status Date`** is the closing date for sold records, the contract date for in-contract ones and
  the listing date for active ones.
- The subject is never in the export. XLSX is the same schema.
- **Expected second variant:** standard-tier StreetEasy exports (requested 2026-09-24).

**StreetEasy links are the second input, and for many agents the first.** Kara never uses
StreetEasy's comps generator ("it misses obvious comps and brings in things that I don't really think
are comps"), and newer agents research comps one listing at a time.
- **How a link comes in:** the agent pastes a listing link, or several. The server reads the page with
  the Firecrawl import the carousel tools already use, with a schema for comps: status, sale price and
  date, last and original ask, list date, days on market, floor, size, beds, baths, charges and taxes,
  the building, its features and its listing history.
- **The engine maps the result into the same comp record the export makes** (source `listing`).
- **Reading a page can misread it,** so every value read from the page is `inferred` until the agent
  confirms the row in one tap. Then it's `exact`, or `approx` where the page says so.
- **Anything the page didn't give is missing,** never guessed.
- **By hand:** a comp typed in (address, status, price, size, floor, date) comes in as the agent's
  record, `exact` unless marked an estimate.

**StreetEasy's own PDF report** (`sources/streeteasy-comp-report-…pdf`) carries **year built**,
photos and floor plans, none of which are in the CSV. Year built comes from the listing lookup in
v1; parsing the PDF is a later enrichment.

**The PDF is also the clearest statement of why this tool exists.** Its headline — "Average sale
price $4,535,000, $2,179/ft²" — is the average of all eleven homes, **mixing closed sales with
asking prices** and labelling the result a sale price. Its "$2.2M–$6.0M estimated sale price
range" is simply the lowest price to the highest across every status. Its sold-only figure,
$1,906/ft², matches this engine's exactly. This is what agents send clients today.

### 6.3 Indicators

Evidence statuses — **sold**, **in contract** (ask basis), **active** (ask basis), and **didn't
sell** (ask basis: a listing that came off the market unsold) — never mix inside one statistic. (One
term: **evidence status**. The engine's field is `evidence_class`.) *Didn't sell* is a ceiling
signal: Frankie lists a building's unsold listings ("on the market in 12/25 for $625K and never
sold") beside its sales. It comes from a link's listing history; the export doesn't carry it.

- **Unit-rate indicators** ($/sqft) — need area on both subject and comp: median, mean, and the
  **anchor** (the single most comparable sold comp — the agent marks it; Jev suggests one).
  Each yields an implied subject value.
- **Adjusted-price indicators** — each sold comp's price, with any *determined* adjustments
  applied, as an indication of the subject's price. Same statistics.

Condos compute both. Co-ops switch unit-rate off — which is why co-ops are the same scaffolding
without square footage, not a second engine.

**Also computed:** **sale-to-last-ask** per sold comp and summarised (sale price ÷ last asking price
− 1 — the last ask, pending Noble's glossary answer); days on market, leaving out public-record
closings, whose 0 isn't a real zero; where active and in-contract asks sit against the sold band.

### 6.4 Two results

- **On the facts** — inputs whose confidence is `exact` or `approx`, and adjustments with
  determined values only.
- **With estimates** — the same, plus the agent's `guesstimate` inputs and any adjustments the
  agent has stated a value for.

**What counts as an estimate:** a setting that carries a *value* — an adjustment value, the agent
narrowing the range — lands in *with estimates* only. Method settings — tiers, the lead indicator,
the anchor, a recency window — change both results. Where the agent's value can't apply to a comp
and the house method's can, the house method's is used and the line says so: *with estimates* is the
facts plus the estimates, never less.

Both are always shown, side by side. **Where they diverge is itself information:** a wide gap
means the range rests on guesses. The agent chooses which result the client copy uses; if it's
the second, the estimates are disclosed automatically.

A missing input the calculation needs is called out, not assumed. If it can't be pulled from the
listing and the agent doesn't know it, it's left out of both results and the output says so.

### 6.5 The range, and why the model is additive

- **Base** = the leading indicator's implied value; the agent picks the lead from the indicators
  shown side by side. The default shown is the median, labelled as the default method pending
  Noble.
- **Range** = lowest to highest implied value among the agent's **primary sold** comps. This is
  bracketing on a curated like-for-like set — not StreetEasy's lowest-to-highest of everything.
  The agent can narrow it, with a reason.
- **The price table.** The subject's implied price at $/sq ft steps across the range, as in Frankie's
  email: "$880 – $638K · $900 – $652,500 …". It's the subject's size times each step, computed and
  labelled by the engine. Clients read a price more easily than a rate.
- **Recency window** (optional, a method setting): sold comps count only if they closed inside it,
  in-contract comps only if they went into contract inside it. Active listings are exempt: an ask
  is current evidence. **v1 limitation:** practice measures a sale's recency from its contract date,
  but the export gives sold records only their closing date, so v1 overstates how fresh a sale is
  by the contract-to-close lag. Listing history could supply contract dates later.
- **The model is additive.** The base case is a featureless unit; each factor in Appendix A
  switches on when a property has it and the data exists. A Brooklyn one-bedroom and a Tribeca
  penthouse run the same engine — the penthouse just has more factors active.

### 6.6 Adjustments and the house method — no invented numbers

Every factor in the **adjustment catalog (Appendix A)** exists in the engine as a definition: what
it captures, what data it needs, where the data can come from. **None has a number yet.**

- A factor that applies but has no determined value is **"considered, not calculated"**: it
  appears in the bridge as a line marked *value not yet determined*, the assistant can discuss it,
  and it moves no number.
- **The agent may state a value** for any factor ("I'd add 5% for the terrace"). It's recorded as
  theirs, labelled the agent's estimate, and lands only in *with estimates*. **A value is a
  magnitude; the comparison supplies the direction** — a comp without the terrace moves up, one with
  a better terrace moves down. The one signed value is the market's monthly movement.
- **Order and compounding** (D-18) no longer come up: see "The differences between comps" below.
  If values are ever added, an adjustment comes off the comp's own sale price and the adjustments add.
- **Noble's view (2026-09-29): the adjustments may never need values.** A comp's price already
  carries what its features are worth, so well-chosen comps may be enough. The engine already works
  that way: with every value null, the results are the comps' own $/sqft and prices, and each
  applicable factor is shown as a comparison (comp better, worse or similar) that moves no number.
  So the catalog works as a checklist for choosing and tiering comps, and for arguing where the
  subject sits in the range. **Values stay null until a gap shows up in use**; D-18 matters only if
  they don't.
- **Magnitudes, weights and bounds all live in one versioned house-method file.** In production
  every value in it is `null` — to be determined — until Noble sets it, informed by the research in
  CR-R (§16). Every version records which house method produced it.
- **Test values live in a separate test-only config** so the arithmetic can be exercised. The
  engine refuses to load it outside tests.

**Factors interact — they don't simply stack.** A private terrace makes a building's shared roof
deck worth less to that unit (substitutes); a terrace with a skyline view is worth more than the
two apart (complements); a high floor often *is* the view (overlap). Adding both sides of a
substitute or overlapping pair is the classic comp error — double counting. So the catalog carries
an **interaction map** (Appendix A.5): which factors interact and how — substitute, complement,
overlap, conditional. **The structure can be defined before any magnitude is**, which is what makes
it useful now: the engine applies a substitute group as the larger of its adjustments rather than
the sum when they pull the same way, and nets them when they pull opposite ways; and it **warns
about double counting** whenever both sides of an overlapping pair carry a value, from the house
method or the agent. Interaction magnitudes are determined later, with the rest (CR-R2, §16).

**The differences between comps — what replaces adjustment values (2026-09-29).** Kimani, on D-18:
"we need to be able to see … how much two similar listings differ in price and what features of them
might have caused that difference", for buyers above all. Appraisal adjustments answer a
different question. They give each feature a set value so every sale can be moved onto the subject,
and they're built for valuing a sale. In practice they're usually *derived* from comps, by paired
sales:
- Two sales alike in everything but one feature: the gap between their prices is evidence of what
  that feature is worth.
- Several such pairs give a range.
- Hundreds of sales allow a regression.

**What the engine does instead, with no house values at all:**
- **Every comp against the home.** The factor-by-factor comparison it already makes: comp better,
  worse or similar on floor, size, outdoor space, views, condition and the rest.
- **Every comp against every other comp,** within a status. The gap in price and $/sq ft, and the
  factors that differ. For example: *"5 Franklin #14A sold for $156 a sq ft more than 200 Chambers
  #10A. It has a terrace and a skyline view, and it's 4 floors higher."*
- **Clean pairs, flagged:** two comps that differ in one factor, or one close group of factors. Their
  gap is evidence of what that factor adds *here*: *"the only difference is the terrace: about
  $150/sq ft."* It's shown as evidence, never applied as a value.
- **For a buyer, this is the argument.** *"The ask is $X. The similar unit without the terrace sold for
  $Y. The seller is asking about $Z for the terrace — is it worth it?"* It serves a buyer better than
  appraisal-style adjustments.
- **Values stay optional.** An agent can still state one ("I'd add 5% for the terrace"), and it lands in
  *with estimates* (§6.4). House values come only if Noble later wants them.

*Closed 2026-09-29: D-14 (interaction magnitudes: not needed; the interaction map stays as structure,
because it keeps pairs honest, e.g. floor and view overlapping). D-18 is replaced by this section.*

### 6.7 Carrying cost and price evaluation — rudimentary, in v1

- **Carry** for the subject and every comp: common charges plus taxes for condos, maintenance for
  co-ops; carry per square foot where area is known; the subject against the comp median.
- **Price evaluation** for any price the agent names — a list price, an offer, the client's
  target, a what-if: its $/sqft, where it falls in each result's range, its distance from each
  indicator, and what the comps' typical sale-to-last-ask implies about negotiating room.
- **Monthly cost estimate**, optional: the agent enters rate, down payment and term; the engine
  returns principal and interest plus carry. Labelled an estimate. Definitions follow the audit's
  §9 — housing cash outflow, ownership carrying cost, principal (not an expense) — so the terms
  mean one thing everywhere.
- Every evaluation can be saved as a named, immutable **scenario**. Full offer modelling — rent
  credits, deposits, closing timelines — comes later on the same scenario structure.
- **Deal terms are an intake module** (§3), skippable, built from scenario templates — for a buyer:
  price point, deposit, financing, target closing, any interim rent; for a seller: target, timing,
  flexibility. v1 captures and displays them and runs what §6.7 can compute on them (carry, monthly
  cost, price evaluation); the rent-credit and closing-timeline arithmetic comes with full offer
  modelling. Revising terms makes a new scenario version; it never overwrites.

### 6.8 Tests

Hand-verified fixtures. Hannah's export must reproduce: all five sold comps — mean **$1,906/sqft**
(StreetEasy's PDF agrees), median **$2,112**; sold comps on floor 10+ — mean **$2,279**;
in-contract and active $/sqft on **ask** basis (1,625 · 2,387 · 2,400; 2,763 · 3,091); `~1,840`
flagged approximate; 79 Laight #1A flagged as a closing; 100 Barclay #11F contributing no
unit-rate indication; 101 Leonard #5B with no floor; sale-to-last-ask −3.0%, +12.3%, −4.0%, −4.2%.
The $/sqft figures are truncations, as StreetEasy displays them.
**Also:** a test that rebuilds StreetEasy's blended $4,535,000 and $2.2M–$6.0M from the raw rows,
and asserts the engine never returns either as a result.

### 6.9 The house glossary

One versioned glossary — terms, definitions, synonyms, and "not to be confused with" — that the
engine's field names, the assistant and the writer all use. Mortgage payment, interest-only
payment, monthly carry, ownership carrying cost, housing cash outflow, economic burn and their
neighbours each mean one thing.

- **When an agent uses a term in a way the definition doesn't support** — "carry" meaning the
  mortgage payment, say — that's a signal: the assistant asks which they mean and cites the
  glossary. Jev checks usage against the definition as a yes/no with confidence; the assistant only
  interrupts when it's confident there's a mismatch.
- Agents can open the glossary from anywhere in the tool.
- **CR-R seeds a draft from authoritative sources; Noble and the mentors make it official.** Until
  then every entry is marked draft.

### 6.10 Comparability checks — the mentors' rules

Kara's rules for what makes a comp, run by the engine as **flags on a comp**, each with a
suggested tier and a reason the agent can accept or overrule. They're never a block, and the tool
never tiers a comp for the agent (§4).

| Check | Flag | Suggests |
|---|---|---|
| Same building | "In the home's building": the best comps are here | Counts; the closest comp |
| First floor, when the home isn't | "First floor: a different product" | Leave out, unless nothing else |
| Private outdoor space on one side only | "Has private outdoor space; the home doesn't" (or the reverse) | Leave out: "never compare" |
| New development against resale | "New development; the home is a resale" | Leave out |
| Co-op against condo; HDFC against not | "A co-op; the home is a condo" | Leave out |
| Sponsor unit | "Sponsor sale: often sells higher (no board package)" | Context, with the note |
| Sold long ago | Over 3 months: noted. Over 6: "old for a comp". Over 12: "market has moved" | Context past 6 months |
| Size far off | More than about 25% bigger or smaller | Context |
| Floor far off | Beyond the home's floor band | Context, with the note |
| Distance | Beyond ¼ mile: noted. Beyond ½ mile: "far for Manhattan" (needs coordinates, later) | Context |

The thresholds are house-method settings. They're Kara's today and Noble's to set. The flags also
seed the notes' quick-pick chips (`02-screens.md`, Sort).

## 7. Who decides what: code, then Jev, then the LLM

**Use the cheapest thing that can make the decision correctly.**

| Tier | Decides | Examples |
|---|---|---|
| **Code** | Anything a rule can decide — free, exact, auditable | evidence statuses, statistics, the range, recency filtering, the parser, numeric grounding, carry and price evaluation |
| **Jev** | Typed judgments over text and data, with calibrated confidence | comparability score (for sorting), tier suggestion, view / outdoor / condition / service class from listing text, sale-condition flags, whether a comp differs from the subject on a factor and in which direction, the kind and basis of each agent statement (§2), request intent (§8.3), client decision style (§8.6), glossary usage (§6.9), fair-housing screening, practice-report rubric scoring (§11) |
| **LLM** | Conversation and writing | the assistant, capturing the agent's statements with their values, gap questions, audience and method, the writer, feedback prose |

### 7.1 Jev

TypeSafe AI's "System One" model, released in early access on 2026-09-15. It returns **typed
values only** — pick one of up to 255 options, score on ordered levels, or yes/no — each with
calibrated probabilities and a confidence score. **It generates no text and does no regression.**
Around 70–500 ms per call; $0.042 per million input tokens, output free. Input is text plus
structured state; no images yet.

**It cannot output a dollar figure — which enforces §4.2 by construction.** For an adjustment, Jev
decides *whether* the comp differs from the subject and *which kind and degree* ("view: comp
better, large difference, judgment confidence 0.91"); the house method turns that class into a number once
one is determined. Until then the bridge shows the judgment with *value not yet determined*.

**Judgment confidence drives how a judgment lands.** Until the agent confirms it, a judgment is
`inferred` and moves no number (§6.1):

- **High** → applied immediately: the app records it as confirmed, visibly and undoably
- **Middling** → shown as a suggestion with its reason
- **Low** → asked of the agent

Thresholds are house-method values, calibrated on Noble's examples.

**Until a question's bar is measured, its answers land as "watch": recorded, never shown.**
- The bars are per question, per provider and per model, never one global number. MindBinder found
  Jev's yes/no answers well calibrated, and its many-way choices over overlapping classes not.
- An answer between 0.4 and 0.6 is always asked.
- The one bar with evidence behind it is MindBinder's. An answer counts when both option orders give
  the same answer and their mean probability is at least 0.8.

**Where it runs:** on import, with no LLM involved (every comp classified on arrival, for
fractions of a cent), and as tools the assistant calls when the conversation needs a
re-assessment. **Casa reaches it through Vercel's AI Gateway,** which allows about five requests a
minute. So judgments on import arrive over minutes, from a paced queue, and nothing waits on them.

**It sits behind a "decision provider" interface** with Claude Haiku 4.5 (structured outputs) as
the fallback. A judgment that neither answers goes to the agent, never guessed.
- **Jev is new.** It's two weeks old, and its data handling is only partly documented (handoff §1.4).
- **Casa's key comes from Kimani's existing Vercel account for now** (2026-10-06). A Pro team comes
  later: Vercel's free plan is for non-commercial use, and zero retention needs Pro.
- **Every request is sent with no training.** Zero retention is on unless switched off, and is never
  off for anything an agent or client wrote.
- **Client names never go to it.** Until Jev earns trust on public listing text, nothing an agent or
  client wrote goes either.
- **The tool keeps working if Jev is unavailable.**

*Decided 2026-09-29: D-12. MindBinder's handoff is in `sources/jev/`. Dispatch 10 (CR-D) builds the
decision provider from it: a question registry, a durable paced queue with a drop ledger, Jev with a
Haiku 4.5 fallback, and watch mode first, calibrated on labelled listings.*

## 8. The assistant

### 8.1 Models

| Role | Shape | Model |
|---|---|---|
| **Assistant** | stateful, streamed, one conversation per report | Claude Opus 5.5 |
| **Writer** | stateless, one call per draft, from pinned numbers | Claude Opus 5.5 |
| **Fallback decision provider** | stateless | Claude Haiku 4.5 |

Model is a per-role config value. **Claude Sonnet 5 is the measured challenger** for the assistant,
evaluated on Noble's examples in the pilot. One model per conversation: Opus 5.5's reasoning blocks
are readable only by the model that produced them, and caches are per model, so switching mid-chat
silently drops both. Work splits across models *between* calls.

### 8.2 Tools

The assistant changes parameters and captures inputs; the engine recomputes.

| Tool | Does |
|---|---|
| `get_report` | Current state: subject, comps, statements, parameters, both results, gaps |
| `record_statement` | Capture something the agent said — kind (call / fact / setting), field, value, `exact` or `guesstimate` — as a chip the agent confirms |
| `set_comp_tier` | Tier a comp, with a reason |
| `set_method` | Lead indicator, recency window, anchor — with a reason |
| `assess` | Jev-backed: comparability, tier suggestion, feature classes, factor differences |
| `lookup_listing` | Firecrawl a listing; results arrive as `listing`-sourced, `inferred` fields for confirmation |
| `flag_gap` | Ask for a missing input, or offer a lookup |
| `what_if` | Set up a hypothetical **using values the agent gave** — a terrace, a different size, an offer price |
| `evaluate_price` | Run §6.7 on a price the agent names |
| `path_to_target` | Enter Path to target (§8.5): pin the neutral version, lay out what would have to be true, and the levers that could close the gap |
| `check_term` | Look up a glossary term, or check the agent's usage against it (§6.9) |
| `add_context` | A note of context or speculation, rendered as *context, not calculated* — it never enters a number |
| `set_brief` | Audience, method, goal |

**It can never:** originate a price, area, rent or any figure; set an adjustment's magnitude; see
the agent's call or target while helping with the neutral valuation (§8.4); write the broker
recommendation for the agent (§8.3).

### 8.3 Rules

1. **Bounded — once there are bounds.** House limits exist only when the house method has numbers.
   When they do, each control shows its limits inline; going outside needs the agent's reason.
   Until then, agent-stated values are labelled and confined to *with estimates*.
2. **Speculation is allowed if it's labelled.** The assistant may reason beyond what the parameters
   capture — "a corner unit on this block usually commands more" — but only as *context, not
   calculated*, visually distinct and never folded into the numbers.
3. **Visible and reversible without clutter.** Changes apply immediately. Undo and redo buttons;
   each click raises a small card saying exactly what changed — *"Undid: 181 Hudson #1A excluded →
   primary. Range $3.95–4.40M → $3.60–4.40M."* The full history sits in a collapsible panel,
   closed by default.
4. **What-ifs are the agent's.** Hypotheticals are welcome — labelled `hypothetical`, built from
   the agent's values, never mixed into either result, and in client copy only if the agent
   includes them.
5. **Append-only.** Undo is a new event, never a rewrite. Opus 5.5 rejects edited conversation
   history, so the transcript and event log are append-only by construction.
6. **The server owns the transcript and state.** The browser sends only the agent's new message.
   The turn runs in a **background function**: it runs any pending tool calls through the engine,
   makes the model calls, streaming each, and appends every event to the transcript as it goes. The
   browser reads progress over short, reconnecting requests and renders it as it arrives. **Why:**
   CR-1 measured Netlify's limits — 30 s without a byte gets a 504, and every response, streaming
   and edge functions included, is cut at 60 s (`cr1-function-limits.md`). A long Opus turn can
   exceed that. **One turn at a time per report** — a second gets a 409. CR-1's single-request
   proxy (one model call, stopped at 50 s, partial reply kept out of context) is the interim; CR-4
   builds this.
7. **Stay portable across Opus 5.5 and Sonnet 5** until the eval decides: engine-state updates go
   in as user-turn content, not mid-conversation system messages (Sonnet 5 lacks them).
8. **The broker recommendation is the agent's.** The tool asks for it — *what would you recommend,
   and why?* — then checks it against the data and sharpens it. It never writes one cold. The agent
   knows things about the client and the deal that the data doesn't, and none of it reaches the
   case unless they say it.
9. **Coaching level scales with the agent.** In practice mode and for newer agents, the tool asks
   before it drafts. For unlocked, experienced agents it drafts directly — always with the neutral
   numbers beside the draft and every departure from the data marked. Heavy Socratic questioning of
   an experienced agent who knows what they want is friction, not teaching. **It loosens with the
   number of comps the agent has done in the tool** (D-5).
10. **Disambiguate intent only when it's actually ambiguous.** "Help me explain why $11.5M is right"
    can mean the analysis, the negotiation case, or the emotional argument. Jev classifies the
    request; when confident, the assistant proceeds; when not, it offers the three as a one-tap
    choice. Never a quiz on every request.

*Decided 2026-09-29: D-5 (A, loosening with the agent's comp count), D-6 (A, only when ambiguous).*

### 8.4 Keeping the valuation neutral — and the teaching moment

The agent's call and any target never enter the assistant's context while it's helping with the
neutral valuation. **The call is shown against the data at the reveal** (§3.1) — the first comparison
the agent sees is between their own view and a considered comp set. That's the teaching moment, and in
practice mode (§11) it's the lesson.

The call can't be kept out of the chat if the agent types it, so there's a backstop: once a call or
target exists, every change shows how far it moved the base *toward or away from* it, and the analyst
view totals it — including the agent's own estimates. Target-seeking becomes visible, never silent.

### 8.5 Path to target

A target that the neutral result doesn't support shouldn't be a dead end. When a target exists and
the neutral result is in, closing the gap is something the assistant works on *with* the agent — a
first-class mode, not an afterthought.

- **Entering the mode pins the neutral numbers as a version**, so the before and after are always
  side by side.
- **It sets out what would have to be true.** "$11.5M is $3,012/sqft — above every primary sold comp.
  For it to hold, the subject would need …"
- **Then the legitimate levers, and how much of the gap each could close:**
  - *Evidence the comp set is missing* — same-building sales, better-matched comps, a different window
    if the market has been flat. The assistant offers to look: a StreetEasy lookup, or earlier imports
    of nearby properties (§12).
  - *Subject facts not yet captured* that would justify a premium — outdoor size, renovation, view,
    parking.
  - *Method settings that are defensibly wrong* for this property.
- **And the illegitimate ones, named as such:** dropping comps only because they're low, adding
  comps only because they're high. Every change made in this mode is tagged *toward target* and needs
  a reason grounded in the property or the client; the target-seeking total (§8.4) shows the
  cumulative movement.
- **The honest outcome is one of two**, and when both are true the assistant presents both: a
  supported path to the target, or a recommendation to re-anchor the target to what the data
  supports.

*Decided 2026-09-29: D-4 (A, hidden until the neutral result exists).*

### 8.6 Audience, client profile and psychology

- **Audience role:** seller, buyer, investor, or broker-internal.
- **Client profile — how the client decides, not who they are:** decision style (numbers-driven,
  narrative, sentimental, time-pressured), priorities (price, speed, certainty), sophistication, and
  whatever the agent notes. Each dimension is defined and measured on a stated scale — the structure to
  borrow from Kimani's MindBinder trait framework once it settles. Jev can read "he's a numbers guy"
  into the profile with a confidence.
- **What it can touch:** the writer — tone, emphasis, how much of the math, length — and strategy
  *within* the range, such as where to list for a time-pressured seller, labelled as strategy. **What
  it can never touch: the range.**
- **Protected characteristics are excluded.** Familial status, age, religion, national origin,
  disability, lawful source of income and every other federal and NYC protected class: the profile has
  no fields for them, capture refuses them, and the writer never tailors on them (§14).

*Decided 2026-09-29: D-7 (B now, MindBinder's framework when it's stable).*

### 8.7 Agent voice

- **Each agent can upload their own writing** — emails, past comp write-ups. Practice submissions
  (§11) count too, and are an easy source because the agent wrote them in the tool. The tool derives a
  style profile — tone, length, formality, how they present numbers — that the agent can read and edit.
  The writer uses the profile, plus one or two samples, as reference.
- **Samples must be the agent's own writing**, attested on upload. AI-written samples teach the writer
  to sound like AI.
- **Client names and contact details are stripped** before storage. Samples never go to Jev.
- **Mentors and admins can see an agent's samples and style profile** (D-8), to coach the writing.
- **House rules outrank voice.** Range language, compliance and the glossary apply whatever the
  agent's habits are.

*Decided 2026-09-29: D-8 (attestation is enough; mentors and admins can see samples and the profile).*

### 8.8 Calling Claude

For Opus 5.5 (`claude-opus-5-5`), as of 2026-09-24 — verify against the `claude-api` skill when
building:

- **Thinking is always on**; `thinking: {type: "disabled"}` and `budget_tokens` both 400. **Effort
  is the control** — default `medium`; set it explicitly. Conversational turns at `low`, heavier
  analysis turns higher, measured. Per-message effort (beta) changes it without resetting the cache.
- **No forced tool use** — `tool_choice` `any` / `tool` 400s. Use `auto`, `strict: true` schemas,
  steering in the prompt, and check a call was made.
- **Pass thinking blocks back unchanged**; history is append-only (§8.3, rule 5).
- **Progress notes arrive as thinking blocks** — set `display: "updates"` (beta) and render them.
- **Handle `stop_reason: "refusal"`** before reading content; opt into server-side fallbacks.
- **Stream** everything; size `max_tokens` for thinking plus the reply; cache a stable system
  prompt and tool list first.

### 8.9 Cost

Per million tokens, input / output: **Opus 5.5 $4 / $20** (cache reads $0.20), Sonnet 5 $2 / $10,
Haiku 4.5 $1 / $5; Jev $0.042 input, output free. Estimated **Opus 5.5 ≈ $0.35–1.00 per report**.
Jev's share rounds to zero. The training gate lowers volume. **Log real usage per call from day
one**; the pilot replaces these estimates with measurements.

## 9. QA

Run on every draft before it can be copied or exported.

1. **Numeric grounding — warn and acknowledge.** Every number in the text is extracted,
   normalised, and matched against the pinned version and the agent's statements. Numbers the agent
   stated — a client's target, a stated fact — resolve automatically as *agent-stated*. Anything
   else is highlighted and resolved one of two ways: the text attributes it ("your client's goal of
   $3.6M"), or the agent acknowledges it and keeps it. Acknowledgments are logged. **Export
   proceeds.**
2. **Range language — warn.** Point-value claims ("worth $3.5M") are flagged. List-price
   recommendations are not.
3. **Compliance — the only hard block.** "Appraisal" and "appraised value" in client copy, and
   high-confidence fair-housing hits, must be fixed. Lower-confidence fair-housing flags warn and
   need acknowledgment. The disclaimer and StreetEasy attribution are inserted automatically.
4. **Freshness — warn.** Old inputs are disclosed or confirmed.
5. **Estimates — automatic.** If the copy uses *with estimates*, the estimates are disclosed.

*Decided 2026-09-29: D-2 (A, compliance the only hard block, for now), D-3 (A, "agent's estimate").*

## 10. Outputs

### 10.1 Two layers

- **Analyst view** — every comp including exclusions and reasons, both results, all indicators,
  the bridge with its undetermined lines, provenance, statements, the event history,
  target-seeking totals.
- **Client view** — the range, the primary evidence, the bridge in plain language, market signals,
  assumptions and their dates, disclosures, agent contact.

### 10.2 Email — the primary deliverable

**The headline comes first.** It's one sentence, the agent's, on what the comps show, for example
*"The three closest sales put #517 at $880–$925 a square foot — about $640K–$670K."* The assistant
offers drafts grounded in the numbers, the agent picks or rewrites, and QA checks that every number
in it traces to the engine (§9). No email is copied without one (`02-screens.md`, Send).

**Then the email backs it up, in the order Frankie's does** (`sources/2026-07-29-frankie-…`):
- the headline
- one line on how the comps were chosen, from the agent's sorting
- sold, in contract, active and didn't sell, each comp as a link with its price and the agent's notes
- things to consider: buildings that trade higher or lower, carrying costs, recent activity in the
  building
- the price table
- the next step (the offer advice)
- sign-off and the disclaimer

Empty sections are left out (Kara).

Full email, short email, text; per audience. Copied as rich HTML that pastes cleanly into Gmail,
with plain text alongside. The tool doesn't send.

### 10.3 The client report and PDF

**One HTML template renders the client view** from day one. Kimani designs it (Claude Design); it's
ported to HTML and CSS as a self-contained component whose only input is a pinned version. PDF v1 is
a browser print of it; server-side rendering only if agents struggle with the print dialog.

**Design against real content.** From Hannah's comps: addresses like *"25 North Moore Street,
#9C"*; five to eight primary comps plus a note of secondaries; prices to $5,995,000; four-digit
$/sqft; three statuses; dates; days on market to 300; two results, each a two-price range; a
one- or two-sentence thesis; a bridge of three to six lines, some reading *value not yet
determined*; carry per comp; agent name, licence number, photo, contact; the disclaimer; "Data
provided by StreetEasy." StreetEasy's own report places the Casa Blanca wordmark top right beside
the agent card — a useful starting point for what agents expect.

### 10.4 The client web page — phase 2, designed for now

A hosted, frozen copy of the same template: unguessable URL, excluded from search, expiring,
versioned; client view only; listing photos linked, not hosted; open tracking disclosed; brokerage
disclosures confirmed before it ships.

## 11. The training gate — post-launch, scaffolded now

**Proposal for Hannah.** Agents unlock the full tool by showing they can build a comp themselves, so
the tool amplifies judgment instead of replacing the learning of it. Agents who never learn to do it
can't tell a good comp from a bad one. It also shows Casa, for the first time, where agents struggle.

- **Practice mode is the same tool with the help switched off.** The agent fills the tool's own
  fields — intake, comps, tiers with reasons, their call, the client email — with no assistant and the
  engine's results hidden. Because the agent's inputs are already structured, the tool computes its own
  version from the same numbers with nothing to re-enter or extract. Every practice report is a real
  comp the agent needed anyway. Uploading a comp written elsewhere is a later, secondary path.
- **Submit → graded → the reveal.** Code checks what code can check (property type, recency, a range
  rather than a point, correct arithmetic). Jev scores the judgment criteria on the rubric ("is each
  exclusion reason substantive?"). The LLM writes feedback. **Noble makes the pass/fail call** until the
  rubric is trusted. Then the reveal: their range against the computed one, their tiers against the
  tool's suggestions, with reasons.
- **Unlock (D-11, 2026-09-29): new agents unlock the full tool when they close their fifth deal and
  graduate from mentorship.** Until then they use practice mode for their real deals. Experienced
  agents unlock by one passed submission or a direct grant. **Admins and mentors grant or deny access
  with one click** on the admin side, and a mentor's sign-off counts.
- **The deal count is set on the admin side** (a mentor or admin records the fifth closing) until
  outcomes (§12, D-19) can count them.
- **Aggregate results by rubric criterion** feed Noble's teaching.
- **Scaffolded in v1, built after launch.** v1 ships the pieces that are expensive to retrofit: a
  report mode, a user capability, results that can be withheld from view, a submissions table, and the
  mentor role. Building practice mode later then adds screens, not a rebuild.

*Decided 2026-09-29: D-11 (the fifth closed deal and graduation; either path; admins and mentors grant; mentor sign-off counts).*

## 12. Data model

Netlify Database (Postgres). Every table is scoped by owner through row-level security — each request
sets the user and role on the connection — as well as by scoping in every query. **Every row records
when it was created and by whom or what** (§4.9).

**Outcomes close the loop** (Noble, 2026-09-29; D-19). When the subject goes into contract or
sells, whether through Casa or not, the final accepted offer and the sale price are attached to the
report that priced it. That record is how Casa learns whether its ranges hold, and it's what Noble
calibrates the method and grades practice reports against (§11). Where a public record or a later
export carries the sale, it's matched automatically through the property key, so it doesn't depend
on the agent coming back.

**Property records are separate from report judgments.** A property's facts — address, unit, size,
prices, dates, features — are the same whichever report brings it in, so they're recorded once and
accumulate across every import, with provenance and as-of dates. How relevant a property is, and why,
depends on the subject and the client, so tiers and reasons belong to the report.

| Table | Holds |
|---|---|
| `users` | **email (the key)**, name, identity provider and id, role (`agent` / `mentor` / `admin` / `external`), status, capability (`practice` / `full`), who unlocked them and why |
| `allowlist` | authorised non-Casa emails and admin grants |
| `properties` | one record per property (normalised address and unit, StreetEasy listing id), sourced facts with as-of dates, every StreetEasy link seen |
| `property_observations` | each time a property's facts were seen — which import, what the facts were then — so status and price history accumulate instead of being overwritten |
| `reports` | owner, title, property type, mode (`practice` / `full`), brief, the call and target (withheld from the assistant), status, working state |
| `subjects` | the subject's sourced fields, linked to its property record |
| `imports` | uploaded file (Blobs key), format, parser version, warnings |
| `report_comps` | a property in a report: its evidence status at import, current tier, anchor flag, reviewed-at |
| `reasons` | **append-only reason history** per report comp — tier, reason, reason type (`property` / `client` / `method`), actor, time. The latest is the current reason and first-class in the UI; earlier ones are kept and viewable |
| `statements` | every agent input from §2 — kind, field, value, basis, source message, both readers' classifications, confirmed-at |
| `judgments` | every Jev or fallback decision — target, question, answer, probabilities, confidence, how it landed |
| `events` | append-only: every change, actor, reason, results before and after |
| `versions` | immutable pinned numbers: engine and house-method versions, inputs hash, both results |
| `scenarios` | what-ifs, price evaluations and deal terms — named, immutable, versioned |
| `client_profiles` | the §8.6 profile per report; never protected characteristics |
| `narratives` | drafts per version: audience, kind, content, model, prompt version, QA results and acknowledgments |
| `exports` | PDFs and later web pages |
| `messages` | the transcript, stored verbatim for replay |
| `voice_samples`, `voice_profiles` | per agent: attested samples with client details stripped, and the derived style profile |
| `submissions` | practice submissions: rubric results per criterion and grader, feedback, pass/fail, reviewer |
| `usage` | per model or Jev call: user, report, provider, tokens, estimated cost |

**Retention:** a departing agent's account is disabled and their reports kept; admins can reassign
them. Property records outlive the reports that created them.

**Casa's property pool.** Because property records accumulate across every agent's imports, the tool
can eventually look for recent sales in the area that a given export missed — "two more sales in this
building in the last six months came in on other agents' reports" — and offer them for review. **Using
records across agents waits on D-9**; the schema supports it from day one either way.

*Decided 2026-09-29: D-9 (A: records are kept and suggested across agents).*

## 13. Auth

**Netlify Identity**, so auth, data, files and functions all live inside Netlify.

- **Casa agents sign in with Google** — Identity's Google provider, configured with Casa's own OAuth
  client so the consent screen says Casa Blanca.
- **Authorised non-Casa people are invited** and sign in with email and password; Netlify sends the
  invitation and recovery emails.
- **The domain rule is enforced twice** — at signup by Identity's event function (Netlify's current
  docs say the signup event fires for external providers too; **CR-1 must prove it** with a non-Casa
  Google account), and on every request by our functions, whatever Identity decided.
- **Users are keyed by email**, so moving off Identity later is a re-login, not a data migration.
- **Fallback if CR-1 finds Identity unworkable:** Google sign-in handled directly (the MindBinder
  approach) with our own session cookie.
- **Testing sign-in:** Google sign-in is tested **on production**. Google redirects to Netlify's
  callback, and after Google, Identity returns only to the production hostname, so a staging branch
  deploy can't test it (CR-1). That's safe because the per-request check stands behind it.
  Everything else is tested on deploy previews with invited email-and-password accounts, and
  previews are password-protected.
- **Email confirmation is required.** With Identity's autoconfirm on, a password sign-up under a
  Casa address the person doesn't own would pass both checks, so the server refuses password
  sessions while autoconfirm is on (CR-1.1). Google verifies its own addresses.
- **Admin comes from `CR_ADMIN_EMAILS` only.** Allowlist grants give agent or mentor access, never
  admin (CR-1.1).

## 14. Compliance

- **Not an appraisal.** New York's appraiser law comes close to excluding a licensee's CMA —
  Executive Law §160-a defines appraisal broadly, the §160-jjjj(3) carve-out and the Department of
  State's FAQ come close — but no DOS page says so outright; counsel to confirm (D-17, from CR-R).
  StreetEasy's own report says it "is not an appraisal, valuation, broker price opinion,
  and is meant to be a starting point." Ours, **approved 2026-09-29 (D-13):** *"This comparative
  market analysis is an estimate of market value prepared by a licensed real estate agent for
  informational purposes. It is not an appraisal. Data provided by StreetEasy and other sources, which
  may be incomplete or subject to change."*
- **StreetEasy attribution** — "Data provided by StreetEasy" — on every export, as their report does.
  Re-presenting the data in Casa-branded reports is cleared by Hannah (§17).
- **Fair housing** — the Fair Housing Act (HUD's 2024 guidance applies it to AI-generated content)
  plus NYC Human Rights Law, which adds lawful source of income, immigration status and more. The
  writer is constrained to property and market facts; §9.3 screens; the agent reviews before sending.
  **School zone** is a real price factor but a recognised steering signal: analyst view only, never
  in client copy unless Hannah approves wording.
- **Listing photos** linked, not hosted. **Client data** private by default, isolated per owner,
  never sent to Jev.
- **The property pool.** Re-presenting StreetEasy data in Casa-branded reports is cleared. Records
  are kept and suggested across agents (D-9, A). Public-record closings are public. Listing
  descriptions, photos and engagement figures are StreetEasy's, so they're shown with attribution and
  not republished outside reports.
- **Client profiles** hold no protected characteristics (§8.6). **Voice samples** are stored with
  client details stripped (§8.7).

*Decided 2026-09-29: D-9 (A), D-13 (approved). Pending: D-17 (counsel: CMA vs appraisal).*

## 15. Risks

| Risk | Mitigation |
|---|---|
| Function time limits cut off a long model turn | **Measured in CR-1:** 30 s of silence → 504; every response cut at 60 s. Turns run in a background function; the browser reads progress (§8.3, rule 6) |
| StreetEasy changes its export, or standard-tier exports differ | Header-mapped, versioned parser; fixtures per variant; header-mapping fallback |
| A figure nobody determined gets used | Engine-only numbers, `null` house method in production, test config refused in production, numeric grounding |
| Target-seeking through settings or the agent's own estimates | The call withheld from the assistant; movement toward the call shown and totalled |
| "With estimates" used to launder guesses into a client range | Estimates disclosed automatically; the gap between the two results always visible |
| Jev: new, invite-only, undocumented data handling | Decision-provider interface with Haiku fallback; Casa's own account; no client names sent; calibration checked on Noble's examples |
| Fair-housing screen false positives annoy agents | Only high-confidence hits block; the rest warn |
| Training gate adds friction | Practice mode produces a real, sendable comp; grants for experienced agents |
| The build step breaks every tool's deploy | CI on every PR; deploy previews; builds fail before publishing |
| New source folders published by `publish = "."` | CR-1 adds them to the forced-404 list and verifies live |
| Netlify Database needs a credit-based plan | Check in CR-1; otherwise change plans or use Neon directly |
| Identity's signup hook doesn't fire for Google as documented | The per-request check refuses non-Casa, non-allowlisted users regardless |
| Path to target turns into cherry-picking | Neutral version pinned on entry; every toward-target change tagged and reasoned; illegitimate levers named |
| Pooled property records go stale | Every observation dated; active and in-contract status re-verified before use |
| AI-written voice samples | Attestation on upload; the style profile is visible and editable |
| Double counting across interacting factors | The interaction map; warnings in v1; substitute groups take the larger adjustment, not the sum |
| Coaching friction for experienced agents | Coaching level tied to training status; intent questions only when ambiguous |

## 16. Build plan

Dispatches in dependency order; `docs/dispatch/README.md` has the protocol and the roster. **CR-R,
CR-1 and CR-2 are merged** (#49, #48, #50 — 2026-09-28). CR-1's sign-in proof waits on Identity
being switched on. Follow-ups: **CR-1.1** (autoconfirm refused, admin only from the environment,
refused-sign-up log cut to the domain, then the proof) and **CR-2.1** (v0.4's engine changes and
Appendix A's new definitions). **CR-3a** (Dispatch 07, #53), the annotated scaffold of the whole
flow, is merged, and Kimani has walked it.

**Next, in parallel:**
- **CR-2.2, the engine for a buyer's argument** (Dispatch 08, Abacus):
  - the comparability checks (§6.10)
  - the differences between comps and clean pairs (§6.6)
  - comp records from a StreetEasy listing page (§6.2)
  - *didn't sell* (§6.3)
  - the price table (§6.5)
  - the inputs the headline draws on
- **CR-3b, the first-class start** (Dispatch 09, Mason):
  - the guided new-comp modal
  - adding comps by StreetEasy link, export or by hand
  - the screens restructured to `02-screens.md` (Sort, Findings, Send; the assistant as a drawer)
  - the headline slot on Send
- **CR-D, the decision provider** (Dispatch 10, Arbiter), from MindBinder's handoff (§7.1):
  - the question registry
  - Jev through a durable, paced queue with a drop ledger
  - the Haiku 4.5 fallback
  - watch mode on listing text, then calibration on labelled listings

**CR-3 proper** then builds Kimani's visual design on that structure.

- **CR-R — Adjustment research** (Dispatch 04). For every factor in Appendix A: how practitioners
  derive its value, what data each method needs, what published evidence reports — sourced. Plus a
  **draft house glossary** (§6.9), and a short note of any evidence on interaction effects found along
  the way. Evidence for Noble's calibration, not defaults.
- **CR-1 — Foundations** (Dispatch 05). The React + Vite + TypeScript scaffold; build, CI and the
  forced-404 additions; Netlify Identity with the domain rule proved; Netlify Database with migrations,
  row-level security and the §12 schema's first slice (users, allowlist, properties and observations,
  reports, report comps, reasons, messages, usage); the streaming Claude proxy with time limits
  measured; the esbuild/`@netlify/blobs` question settled.
- **CR-2 — Engine and parser** (Dispatch 06). §6 entire: both results, carry and price evaluation, the
  catalog as definitions, the interaction map as structure with double-count warnings, the `null` house
  method and the refused test config, a stable property key from the parser, fixtures.
- **CR-3 — Workspace.** Progressive intake with deal-terms modules; import with on-arrival tagging
  through the decision provider; first-pass review with the range hidden; the reveal; the loop; the
  assumptions panel; both results; what-ifs; price evaluation; undo and redo; versions.
- **CR-4 — Assistant.** §8: turns in a background function (§8.3 rule 6), the tools, two-keyed capture, trust-but-verify, Path to target, coaching
  level, intent disambiguation, the glossary check, context notes, events, progress display, fallbacks,
  effort policy.
- **CR-5 — Writer and QA** (Dispatch 13). §9, §10.2, client profile (§8.6) and agent voice (§8.7).
- **CR-6 — Client report and PDF.** §10.1 and §10.3. **Waits on Kimani's design.**
- **CR-7 — Pilot readiness.** Usage logging, per-user caps, admin (users, allowlist, grants, reports,
  spend), feedback capture, the Opus 5.5 vs. Sonnet 5 eval. Then the pilot.
- **CR-R2 — Interaction research** (later). Magnitudes for Appendix A.5, once the catalog's definitions
  and first values have settled.

**After v1:** the training gate's practice mode (§11); co-ops; house method v1 with Noble; the property
pool's cross-agent suggestions (D-9); outcome capture (§12, D-19); the client web page; full offer
modelling; more sources.

## 17. Decision log

| Date | Decision |
|---|---|
| 2026-09-23 | For all agents; piloted with a small group first |
| 2026-09-23 | Condos first; co-ops as the same scaffolding without square footage |
| 2026-09-23 | Departing agents' reports kept |
| 2026-09-23 | Buyer and seller comps treated the same in analysis; communication varies by audience |
| 2026-09-23 | StreetEasy data may be re-presented in Casa-branded reports (Hannah) |
| 2026-09-23 | Subject captured by StreetEasy URL or by hand |
| 2026-09-23 | Noble owns the house method after a working prototype, and shapes onboarding |
| 2026-09-23 | Integrated AI, not bring-your-own-key |
| 2026-09-24 | React + Vite for this tool, as a scoped exception |
| 2026-09-24 | Auth: Netlify Identity — Google for Casa agents, invites for others; domain rule at signup and on every request |
| 2026-09-24 | Data: Netlify Database and Netlify Blobs |
| 2026-09-24 | Models: Opus 5.5 for assistant and writer; Sonnet 5 evaluated in the pilot |
| 2026-09-24 | PDF: browser print of the HTML client template first; client view is an HTML template from day one |
| 2026-09-24 | Client web page: phase 2 |
| 2026-09-24 | Your call, stated facts and method settings are captured in form or chat and routed separately |
| 2026-09-24 | No lock ceremony: drafts pin versions; later edits fork silently |
| 2026-09-24 | No placeholder numbers in production; undetermined factors are considered, not calculated |
| 2026-09-24 | Two results: on the facts, and with the agent's estimates |
| 2026-09-24 | Rudimentary carry and price evaluation in v1 |
| 2026-09-24 | Decisions go to code, then Jev, then the LLM; Jev behind an interface with a Haiku fallback |
| 2026-09-24 | Numeric grounding warns and needs acknowledgment; only compliance blocks |
| 2026-09-24 | Twenty minutes is a north star, not a limit |
| 2026-09-24 | A target price is its own input; Path to target is a first-class mode |
| 2026-09-24 | Client psychology shapes communication and strategy, never the range, and is labelled |
| 2026-09-24 | Each agent's writing samples give the writer their voice |
| 2026-09-24 | Intake is progressive and skippable; deal terms are an intake module built from scenario templates |
| 2026-09-24 | A house glossary; mismatched usage prompts a clarification that cites it |
| 2026-09-24 | Property records are captured from every import; reason history is kept, the latest first-class; reasons may be client-specific |
| 2026-09-24 | Factor interactions are modelled — structure first, magnitudes later |
| 2026-09-24 | Agent statements are captured two-keyed (LLM and Jev); disagreements become a one-tap question and are logged |
| 2026-09-24 | Stated facts: trust but verify |
| 2026-09-24 | Practice mode uses the tool's own fields; scaffolded in v1 |
| 2026-09-24 | Admins and mentors grant or deny access from the admin side |
| 2026-09-24 | Dispatched sessions open PRs and never merge; Casanova or Kimani merges |
| 2026-09-28 | Turns run in a background function; the browser reads progress (CR-1's measured limits) |
| 2026-09-28 | Google sign-in tested on production; everything else on password-protected previews |
| 2026-09-28 | Functions are v2, bundled by Netlify with `nft`; never `node_bundler = "none"` (D-15) |
| 2026-09-28 | Terms: input confidence and judgment confidence; evidence status; sale-to-last-ask |
| 2026-09-28 | "None listed" tags are approximate; recency windows cover sold and in-contract comps, never active |
| 2026-09-28 | Agent adjustment values are magnitudes; opposite-pulling substitutes net out |
| 2026-09-28 | $/sqft displays truncated, as StreetEasy shows it |
| 2026-09-28 | School zone never moves a number, from the house method or the agent |
| 2026-09-28 | Distance (26) selects and weights comps; it is not an adjustment |
| 2026-09-29 | The report builds to a one-sentence headline, the agent's; no email without one (Noble) |
| 2026-09-29 | Buyers first: the default question is what to offer |
| 2026-09-29 | A guided start in a modal; comps by StreetEasy link, export or by hand |
| 2026-09-29 | Kara's comp rules run as flags with suggested tiers, never blocks |
| 2026-09-29 | Adjustments become the differences between comps, with clean pairs as evidence; no house values (D-14 closed, D-18 replaced) |
| 2026-09-29 | "Didn't sell" is a fourth evidence status; a price table for the subject |
| 2026-09-29 | D-1 C · D-2 A · D-3 A · D-4 A · D-5 A · D-6 A · D-7 B · D-8 visible to mentors and admins · D-9 A · D-10 B · D-11 fifth closed deal · D-13 approved · D-19 B |
| 2026-09-29 | Jev through Vercel's AI Gateway on a Pro team: no training and zero retention on every request; a durable paced queue; every choice asked in both orders (D-12) |
| 2026-09-29 | Judgments land as "watch" until their question has a measured bar, per question, provider and model; 0.4–0.6 is always asked |
| 2026-10-06 | Jev starts on Kimani's existing Vercel account: no training always; zero retention a switch, never off for text an agent or client wrote; Pro later |

## 18. Open items

**All pending decisions and the actions waiting on Kimani are in `docs/decisions.md`**, each with its
context, urgency, size, and a field to answer in.

## Appendix A — The adjustment catalog

Every factor that can bear on an NYC residential comp. **None has a number.** Each is a definition
the engine and the assistant can reason with, marked *value not yet determined* until Noble sets it,
informed by CR-R (`research/adjustments.md` has the evidence for each). "Where the data comes from"
is what exists today; an agent can always state it. Factors also affect one another — A.5 maps how.
**Numbers are identifiers:** new factors are appended (37–39), never renumbered.

### Unit

| # | Factor | What it captures | Where the data comes from | Applies to |
|---|---|---|---|---|
| 1 | Interior size | Area differences, including large units that don't trade linearly with smaller-unit $/sqft | Export (may be approximate) | Condo; co-op by rooms |
| 2 | Bedrooms and bathrooms | Count differences — the primary driver for co-ops | Export | Both |
| 3 | Layout and efficiency | Split bedrooms, wasted space, room proportions, flex room | Floor plan (listing), agent | Both |
| 4 | Floor | Height in the building and against neighbouring buildings. The effect isn't steady with height, and height relative to the surroundings matters more than height within the building | Export; neighbouring heights from the agent | Both |
| 5 | Exposure and light | Orientation, corner units, open or blocked light | Listing text, agent | Both |
| 6 | Views | City, skyline, park, water, landmark; open or obstructed; protected | Export tags, listing, agent | Both |
| 7 | Outdoor space | Balcony, terrace, private roof, garden; size; private or shared access | Export (presence only), listing, agent | Both |
| 8 | Condition | Mint, renovated, good, original, needs work | Listing text and photos; the agent judges | Both |
| 9 | Finishes and systems | Kitchen and bath quality, central air, dishwasher, en-suite bathrooms, fireplace; laundry as installed, permitted or prohibited (co-ops need all three) | Export tags, listing | Both |
| 10 | Ceiling height and volume | Loft volume, double height | Listing, agent | Both |
| 11 | Unit type | Penthouse, duplex, garden unit, loft conversion | Unit label, export tags, listing | Both |
| 12 | Noise and street position | Avenue or side street, elevated train, front or rear | Agent, listing | Both |
| 13 | Private storage and extras | Deeded storage, private elevator landing | Listing, agent | Both |

### Building

| # | Factor | What it captures | Where the data comes from | Applies to |
|---|---|---|---|---|
| 14 | Service level | Full-time doorman, concierge, part-time, virtual, none | Export amenities | Both |
| 15 | Amenities | Gym, pool, roof deck, playroom and the rest | Export amenities | Both |
| 16 | Building era and type | Prewar, postwar, new development, conversion, landmark | Year built: StreetEasy PDF or listing (not in the CSV) | Both |
| 17 | Building size | Boutique against large, by units and stories | Export | Both |
| 18 | Sponsor and new-development sales | Sponsor pricing, concessions, sponsor-paid transfer taxes (whether a buyer-paid tax counts toward the taxable price: D-17) | Listing, agent | Both |
| 19 | Carrying costs | Common charges and taxes, or maintenance, as capitalised into price | Export | Both |
| 20 | Tax exemptions and abatements | 421-a and its successors 421-a(16) and 485-x (exemptions); J-51 (condos and co-ops); Battery Park City's payments in lieu of taxes; when each steps up or expires | Listing, agent, city records | Both |
| 21 | Building financials | Reserves, assessments, underlying mortgage, litigation | Agent, offering documents | Both; critical for co-ops |
| 22 | Policies | Pets, sublets, pied-à-terre, guarantors, financing limits, flip tax | Export (partial), listing, agent | Both; financing limits critical for co-ops |
| 23 | Parking | Deeded space, garage in building, valet, none | Export amenities (can't tell deeded from not) | Both |
| 24 | Ground lease | Leasehold against fee ownership | Listing, agent | Both; large where present |

### Location

| # | Factor | What it captures | Where the data comes from | Applies to |
|---|---|---|---|---|
| 25 | Micro-location | Block, side of the avenue, transit, parks, waterfront — "Canal Street isn't really Tribeca" | Address, agent; geocoding later | Both |
| 26 | Distance from subject | **A selection rule, not an adjustment:** nearer comps are preferred and weighted, not adjusted (CR-R found no evidence for it as an adjustment) | Needs coordinates (not in the export) | Both |
| 27 | School zone | A real price driver — **analyst view only** (§14) | Agent, public data | Both |

### Transaction and market

| # | Factor | What it captures | Where the data comes from | Applies to |
|---|---|---|---|---|
| 28 | Recency and market movement | Time since the sale, and how the market moved since. Practice measures from the contract date; v1 has only closing dates for sold comps (§6.5) | Export dates | Both |
| 29 | Sale conditions | Estate, distressed, related-party, off-market, bulk, non-arm's-length | Agent, listing; closing-only records flagged | Both |
| 30 | Concessions and credits | Seller credits, closing-cost credits | Listing, agent | Both |
| 31 | Combination units | Combined apartments, against the sum of their parts | Agent | Both |
| 32 | Evidence status | Sold, in contract, active — not an adjustment; kept apart in every statistic (§6.3) | Export | Both |
| 37 | Financing terms | Cash against mortgaged purchases; seller or sponsor financing. Mortgaged buyers pay about 11% more than cash buyers nationally, and Manhattan was 64.7% cash in Q4 2025 (CR-R) | Agent, listing | Both |
| 38 | Tenant in place | A sale subject to an existing lease | Listing, agent | Both |
| 39 | Non-realty items | Furniture and other personal property included in the price | Listing, agent | Both |

### Later property types and modules

| # | Factor | What it captures | Applies to |
|---|---|---|---|
| 33 | Air and development rights | Unused buildable area | Townhouses, whole buildings |
| 34 | Lot size, width and frontage | Land characteristics | Townhouses |
| 35 | Legal use and certificate of occupancy | Legal unit count and use | Townhouses, multi-family |
| 36 | Rental income and yield | Achievable rent and gross yield — needs rent comps the export doesn't carry | Investor audience; the offer module |

### A.5 Interactions

Which factors change one another's value. **Structure only — no magnitudes.** A starting map, to be
extended by CR-R's findings and quantified in CR-R2.

| Factors | Relationship | Why |
|---|---|---|
| Outdoor space (7) ↔ shared outdoor amenities (15) | Substitutes | A private terrace reduces what a building roof deck adds for that unit |
| Parking (23) ↔ micro-location (25) | Conditional substitutes | Where street parking is easy, a garage space adds less |
| Outdoor space (7) × views (6) | Complements | A terrace with a skyline view is worth more than the two apart |
| Floor (4) × views (6) | Overlap | A high floor often *is* the view; adjusting for both double counts |
| Interior size (1) ↔ bedrooms and bathrooms (2) | Overlap | Extra rooms usually arrive with extra area |
| Unit type (11) ↔ floor (4), outdoor (7), views (6) | Overlap | A penthouse premium bundles all three |
| Amenities (15) ↔ carrying costs (19) | Offsetting | Amenities raise common charges; buyers price the charges too |
| Service level (14) ↔ building size (17) | Correlated | Large buildings more often carry full service |
| Condition (8) ↔ building era (16) | Correlated | Prewar units vary more in condition |
| Sponsor sales (18) ↔ concessions (30) | Overlap | Sponsor pricing and credits are often the same discount |
| Tax exemptions (20) ↔ carrying costs (19) | Overlap | An exemption is lower taxes, already in the carry |
| Building financials (21), ground lease (24) ↔ carrying costs (19) | Overlap | Both already sit inside maintenance or common charges |
| Outdoor space (7) ↔ interior size (1) | Overlap | When outdoor area is converted into square footage, adjusting size as well counts it twice |
| Parking (23), private storage (13) ↔ amenities (15) | Overlap | The export lists garage and storage as building amenities |
| Finishes (9) ↔ condition (8) | Overlap | A renovation shows up in both |

**v1 behaviour:** substitutes pulling the same way are applied as the larger adjustment, never the
sum; pulling opposite ways, they net out. Overlapping pairs trigger a double-counting warning whenever
both sides carry a value, from the house method or the agent. Complements are shown as an interaction
line whose value is not yet determined.
