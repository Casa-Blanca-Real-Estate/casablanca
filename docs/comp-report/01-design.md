# Comp report tool — master design

**v0.2 · 2026-09-24 · owner: Casanova.** The guiding document for every comp report dispatch.
Dispatches cite sections of this file; when a build finding contradicts it, the dispatch says so
in its PR and Casanova updates this file — the doc follows reality, not the other way round.
Background and sources: `00-orientation.md`. Decisions are dated in §17.

### What changed in v0.2 — reread these

1. **§2 is new: three kinds of agent input.** "Your call", stated facts, and method settings are
   captured the same way (form or chat) but routed differently. The chat keeps capturing them.
2. **§3: no lock button.** Drafting pins the numbers as a version; later edits fork a new one
   silently. Pushing back on the AI while drafting can change the numbers.
3. **§6.6: no placeholder numbers in the product.** Every adjustment magnitude, weight and bound
   is *to be determined*. Unset factors are "considered, not calculated." Test values live only in
   a test config the product refuses to load.
4. **§6.4: two results — "on the facts" and "with estimates."** Agent guesstimates never enter
   the facts-only result.
5. **§6.7: rudimentary carrying cost and price evaluation in v1** — not deferred entirely.
6. **§7 is new: decisions are made by code, then Jev, then the LLM** — the cheapest thing that
   can decide correctly. Jev's confidence decides whether a change applies, is suggested, or is
   asked.
7. **§8.3: assistant rules revised** — what-ifs allowed on the agent's own values; speculation
   labelled "context, not calculated"; undo and redo show what they did.
8. **§9: numeric grounding warns instead of blocking.** Only compliance blocks.
9. **§11 is new: the training gate** — post-launch, designed now.
10. **Appendix A is new: the adjustment catalog** — 36 factors, defined, none with a number.
11. **§16: a research dispatch (CR-R)** on how adjustments are actually derived, runnable now.

---

## 1. What it is

A Creative Studio tool where an agent brings the comps they found on StreetEasy, works through
them with an AI assistant, settles a defensible price range, and leaves with a client-ready email
and a Casa Blanca–branded report.

**North star: six hours down to twenty minutes** — a direction to design toward, not a limit. A
diligent agent going back and forth to understand a comp in depth is the tool working, not
failing.

**Users:** Casa agents, piloted with a small group first, then released behind the training gate
(§11); admins (Kimani, Hannah); an allowlist of authorised non-Casa people. The heaviest users
will be the most active, highest-ticket agents — so luxury factors matter from the start, and
the architecture handles them the same way it handles everything else (§6.5).

**v1 does:** condo reports from a StreetEasy comp export; subject capture by StreetEasy URL or by
hand; an assistant that operates the analysis; two results (§6.4); rudimentary carrying cost and
price evaluation (§6.7); versioned numbers; client email in three lengths; a PDF of the client
report; saved, recoverable reports and chats.

**v1 does not:** co-ops (designed for — §6.3 — built next), full offer-scenario modelling (rent
credits, deposits, closing timelines), sources beyond StreetEasy, sending email, the client web
page (designed for — §10.4), Excel for clients, the training gate (post-launch — §11).

## 2. Three kinds of agent input

The word "assumptions" covers three different things. They need opposite treatment, so the tool
keeps them apart.

| Kind | Example | Treatment |
|---|---|---|
| **Your call** — the agent's opinion of value | "I think it trades at $3.4–3.6M" | **Never touches the calculation.** Withheld from the assistant while it helps with the valuation. Shown against the data as the teaching moment (§8.4). |
| **Stated facts** — things about a property the agent asserts | "The terrace is about 400 sq ft." "It was gut-renovated in 2022." "Charges are $3,500." | **Feed the calculation**, attributed to the agent as `exact` or `guesstimate`. A guesstimate only enters the "with estimates" result (§6.4). |
| **Method settings** — how the analysis should run | "Only look at the last six months." "Treat 181 Hudson as secondary." "Add 5% for the terrace." | **Change the analysis parameters**, with the agent's reason. A setting that carries a number is the agent's estimate and lands only in *with estimates* (§6.6). |

**All three can be given in the opening form or in chat, at any point.** The assistant captures
each statement as it happens, files it under the right kind, and shows it as a chip the agent can
confirm, edit or remove — "Noted: terrace ≈ 400 sq ft (your estimate) — used in *with estimates*."
Captured inputs live in the report's structured state, never only in chat history.

**The opening form** is the audit's six-part brief — property, question, audience, method, goal,
output — plus the agent's call. It's asked once, at intake. Later edits never re-ask it.

## 3. The workflow

1. **Intake.** Subject property (StreetEasy URL prefill via the existing Firecrawl import, or by
   hand) and property type; the brief; the agent's call; any stated facts.
2. **Import.** The StreetEasy comp export. The parser normalises it and reports what it
   couldn't read. Each comp is tagged on arrival (§7).
3. **Review ⇄ value — the loop.** One row per comp: tier (primary / secondary / excluded /
   unreviewed) with a reason, a link to the listing, a "reviewed" mark once the agent has looked
   at it. The engine recomputes live as tiers, facts and settings change. **This loop is where the
   agent lives**, and it can be re-entered at any time — new comps imported, a fact corrected, a
   setting changed. Nothing about the intake is asked again.
4. **Communicate.** The writer drafts from the current numbers for the chosen audience — full
   email, short email, text — and the report narrative. **Drafting pins those numbers as a
   version** (v1, v2 …). QA runs (§9). The agent edits.
5. **Export.** Copy the email; print the client report to PDF. The report is saved with its
   versions, its chat and its exports.

**No lock button.** Every draft is bound to the version it was written from. Change anything
afterwards — including by pushing back on the AI while drafting ("actually, drop 79 Laight") — and
the tool silently starts the next version; drafts from the earlier one show "numbers changed since
this draft — regenerate?" The integrity guarantee is that every draft's numbers are known and
fixed; the agent never has to perform a ceremony to get it.

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
  engine.
- **Every input is sourced:**
  `{ value, source, as_of, confidence, note? }` where
  `source` is `se_export` · `se_pdf` · `listing` · `agent` · `hypothetical` · `engine`, and
  `confidence` is `exact` · `approx` (marked approximate at its source, e.g. `~1,840 ft²`) ·
  `inferred` (derived from listing text or a Jev judgment — needs the agent's confirmation) ·
  `guesstimate` (the agent's estimate).

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
  (**presence only — no size in the export**), parking and views from them.
- The subject is never in the export. XLSX is the same schema.
- **Expected second variant:** standard-tier StreetEasy exports (requested 2026-09-24).

**StreetEasy's own PDF report** (`sources/streeteasy-comp-report-…pdf`) carries **year built**,
photos and floor plans, none of which are in the CSV. Year built comes from the listing lookup in
v1; parsing the PDF is a later enrichment.

**The PDF is also the clearest statement of why this tool exists.** Its headline — "Average sale
price $4,535,000, $2,179/ft²" — is the average of all eleven homes, **mixing closed sales with
asking prices** and labelling the result a sale price. Its "$2.2M–$6.0M estimated sale price
range" is simply the lowest price to the highest across every status. Its sold-only figure,
$1,906/ft², matches this engine's exactly. This is what agents send clients today.

### 6.3 Indicators

Evidence classes — **sold**, **in contract** (ask basis), **active** (ask basis) — never mix
inside one statistic.

- **Unit-rate indicators** ($/sqft) — need area on both subject and comp: median, mean, and the
  **anchor** (the single most comparable sold comp — the agent marks it; Jev suggests one).
  Each yields an implied subject value.
- **Adjusted-price indicators** — each sold comp's price, with any *determined* adjustments
  applied, as an indication of the subject's price. Same statistics.

Condos compute both. Co-ops switch unit-rate off — which is why co-ops are the same scaffolding
without square footage, not a second engine.

**Also computed:** sale-to-last-ask per sold comp and summarised; days on market; where active and
in-contract asks sit against the sold band.

### 6.4 Two results

- **On the facts** — inputs whose confidence is `exact` or `approx`, and adjustments with
  determined values only.
- **With estimates** — the same, plus the agent's `guesstimate` inputs and any adjustments the
  agent has stated a value for.

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
  theirs, labelled the agent's estimate, and lands only in *with estimates*.
- **Magnitudes, weights and bounds all live in one versioned house-method file.** In production
  every value in it is `null` — to be determined — until Noble sets it, informed by the research in
  CR-R (§16). Every version records which house method produced it.
- **Test values live in a separate test-only config** so the arithmetic can be exercised. The
  engine refuses to load it outside tests.

### 6.7 Carrying cost and price evaluation — rudimentary, in v1

- **Carry** for the subject and every comp: common charges plus taxes for condos, maintenance for
  co-ops; carry per square foot where area is known; the subject against the comp median.
- **Price evaluation** for any price the agent names — a list price, an offer, the client's
  target, a what-if: its $/sqft, where it falls in each result's range, its distance from each
  indicator, and what the comps' typical sale-to-ask implies about negotiating room.
- **Monthly cost estimate**, optional: the agent enters rate, down payment and term; the engine
  returns principal and interest plus carry. Labelled an estimate. Definitions follow the audit's
  §9 — housing cash outflow, ownership carrying cost, principal (not an expense) — so the terms
  mean one thing everywhere.
- Every evaluation can be saved as a named, immutable **scenario**. Full offer modelling — rent
  credits, deposits, closing timelines — comes later on the same scenario structure.

### 6.8 Tests

Hand-verified fixtures. Hannah's export must reproduce: all five sold comps — mean **$1,906/sqft**
(StreetEasy's PDF agrees), median **$2,112**; sold comps on floor 10+ — mean **$2,279**;
in-contract and active $/sqft on **ask** basis (1,625 · 2,387 · 2,400; 2,763 · 3,091); `~1,840`
flagged approximate; 79 Laight #1A flagged as a closing; 100 Barclay #11F contributing no
unit-rate indication; 101 Leonard #5B with no floor; sale-to-ask −3.0%, +12.3%, −4.0%, −4.2%.
**Also:** a test that rebuilds StreetEasy's blended $4,535,000 and $2.2M–$6.0M from the raw rows,
and asserts the engine never returns either as a result.

## 7. Who decides what: code, then Jev, then the LLM

**Use the cheapest thing that can make the decision correctly.**

| Tier | Decides | Examples |
|---|---|---|
| **Code** | Anything a rule can decide — free, exact, auditable | evidence classes, statistics, the range, recency filtering, the parser, numeric grounding, carry and price evaluation |
| **Jev** | Typed judgments over text and data, with calibrated confidence | comparability score (for sorting), tier suggestion, view / outdoor / condition / service class from listing text, sale-condition flags, whether a comp differs from the subject on a factor and in which direction, fair-housing screening, practice-report rubric scoring (§11) |
| **LLM** | Conversation and writing | the assistant, capturing the agent's statements with their values, gap questions, audience and method, the writer, feedback prose |

### 7.1 Jev

TypeSafe AI's "System One" model, released in early access on 2026-09-15. It returns **typed
values only** — pick one of up to 255 options, score on ordered levels, or yes/no — each with
calibrated probabilities and a confidence score. **It generates no text and does no regression.**
Around 70–500 ms per call; $0.042 per million input tokens, output free. Input is text plus
structured state; no images yet.

**It cannot output a dollar figure — which enforces §4.2 by construction.** For an adjustment, Jev
decides *whether* the comp differs from the subject and *which kind and degree* ("view: comp
better, large difference, confidence 0.91"); the house method turns that class into a number once
one is determined. Until then the bridge shows the judgment with *value not yet determined*.

**Confidence drives how a judgment lands:**

- **High** → applied immediately, visible and undoable
- **Middling** → shown as a suggestion with its reason
- **Low** → asked of the agent

Thresholds are house-method values, calibrated on Noble's examples.

**Where it runs:** on import, with no LLM involved (every comp classified on arrival, for
fractions of a cent), and as tools the assistant calls when the conversation needs a
re-assessment.

**It sits behind a "decision provider" interface** with Claude Haiku 4.5 (structured outputs) as
the fallback. Jev is nine days old at the time of writing, invite-only, and doesn't document data
handling — so Casa needs its own account and terms, client names never go to it, and the tool
must keep working if it's unavailable.

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
| `add_context` | A note of context or speculation, rendered as *context, not calculated* — it never enters a number |
| `set_brief` | Audience, method, goal |

**It can never:** originate a price, area, rent or any figure; set an adjustment's magnitude; see
the agent's call before the gap is shown (§8.4).

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
   Each request runs any pending tool calls through the engine server-side, then makes **one**
   model call and streams it; the browser re-requests to continue. One model call per request keeps
   within function time limits (§15) and keeps state authoritative.
7. **Stay portable across Opus 5.5 and Sonnet 5** until the eval decides: engine-state updates go
   in as user-turn content, not mid-conversation system messages (Sonnet 5 lacks them).

### 8.4 Keeping the valuation neutral — and the teaching moment

The agent's call never enters the assistant's context while it's helping with the valuation. **The
gap — your call against the data — appears once every comp has been reviewed**, so the first thing
the agent compares against is a considered comp set, not the raw import. That comparison is the
teaching moment, and in practice mode (§11) it's the lesson.

The call can't be kept out of the chat if the agent types it, so there's a backstop: after a call
exists, every change shows how far it moved the base *toward or away from* the call, and the
analyst view totals it — including the agent's own estimates. Target-seeking becomes visible.

### 8.5 Calling Claude

For Opus 5.5 (`claude-opus-5-5`), as of 2026-09-24 — verify against the `claude-api` skill when
building:

- **Thinking is always on**; `thinking: {type: "disabled"}` and `budget_tokens` both 400. **Effort
  is the control** — default `medium`; set it explicitly. Conversational turns at `low`, heavier
  analysis turns higher, measured. Per-message effort (beta) changes it without resetting the cache.
- **No forced tool use** — `tool_choice` `any` / `tool` 400s. Use `auto`, `strict: true` schemas,
  steering in the prompt, and check a call was made.
- **Pass thinking blocks back unchanged**; history is append-only (§8.3.5).
- **Progress notes arrive as thinking blocks** — set `display: "updates"` (beta) and render them.
- **Handle `stop_reason: "refusal"`** before reading content; opt into server-side fallbacks.
- **Stream** everything; size `max_tokens` for thinking plus the reply; cache a stable system
  prompt and tool list first.

### 8.6 Cost

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

## 10. Outputs

### 10.1 Two layers

- **Analyst view** — every comp including exclusions and reasons, both results, all indicators,
  the bridge with its undetermined lines, provenance, statements, the event history,
  target-seeking totals.
- **Client view** — the range, the primary evidence, the bridge in plain language, market signals,
  assumptions and their dates, disclosures, agent contact.

### 10.2 Email — the primary deliverable

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

## 11. The training gate — post-launch, designed now

**Proposal for Hannah.** Agents unlock the full tool by showing they can build a comp themselves,
so the tool amplifies judgment instead of replacing the learning of it. It also shows Casa, for the
first time, where agents struggle.

- **Practice mode is the same tool with the help switched off.** The agent does the intake,
  import, tiering with reasons, their call and the client email themselves — no assistant, engine
  results hidden. Every practice report is a real comp they needed anyway, so it isn't busywork.
- **Submit → graded → the reveal.** Code checks what code can check (same property type, recency,
  a range rather than a point, correct arithmetic). Jev scores the judgment criteria on the rubric
  ("is each exclusion reason substantive?"). The LLM writes feedback. **Noble makes the pass/fail
  call** until the rubric is trusted. Then the reveal: their range against the computed one, their
  tiers against the tool's suggestions, with reasons. The reveal is the lesson.
- **Unlock:** new agents — a set number of practice reports, at least one passed. Experienced
  agents — one passed submission, or a direct grant by Noble or an admin, so top agents aren't
  forced to grind. A mentor sign-off path would tie it into Casa's mentorship programme.
- **Aggregate results by rubric criterion** feed Noble's teaching.
- **Open:** Hannah approves the gate; Noble sets the rubric and the number.
- **The risk** is friction for agents who are already hard to move. The mitigation is that practice
  mode produces something they'd send anyway.

## 12. Data model

Netlify Database (Postgres). Every table is scoped by report owner through row-level security —
each request sets the user and role on the connection — as well as by scoping in every query.

| Table | Holds |
|---|---|
| `users` | **email (the key)**, name, identity provider and its id, role (`agent` / `admin` / `external`), status, **capability (`practice` / `full`), unlocked by whom and why** |
| `allowlist` | authorised non-Casa emails and admin grants — who, when, why |
| `reports` | owner, title, property type, **mode (`practice` / `full`)**, brief, **the agent's call** (withheld from the assistant), status, working state |
| `subjects` | the subject's sourced fields |
| `imports` | uploaded file (Blobs key), format, parser version, warnings |
| `comps` | verbatim source row, normalised sourced fields, evidence class, tier, reason, who set it, reviewed-at, anchor flag |
| `statements` | everything the agent stated, in form or chat — kind, field, value, confidence, the message it came from, confirmed-at |
| `judgments` | every Jev (or fallback) decision — target, question, answer, probabilities, confidence, provider and version, how it landed (applied / suggested / asked) |
| `events` | append-only: every change, actor, reason, results before and after |
| `versions` | immutable pinned numbers: engine and house-method versions, inputs hash, full inputs and outputs of both results |
| `scenarios` | what-ifs and price evaluations — named, immutable, values and their source |
| `narratives` | drafts per version: audience, kind, content, model, prompt version, QA results and acknowledgments, whether edited |
| `exports` | PDFs and later web pages: version and narratives, file key or slug, expiry |
| `messages` | the transcript, full content blocks stored verbatim for replay, model, usage |
| `submissions` | practice submissions: rubric results per criterion and grader, feedback, pass/fail, reviewer |
| `usage` | per model or Jev call: user, report, provider, tokens, estimated cost |

**Retention:** a departing agent's account is disabled and their reports kept; admins can reassign
them.

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
- **Deploy previews:** Google won't accept wildcard origins; use production plus one fixed staging
  branch deploy.

## 14. Compliance

- **Not an appraisal.** New York treats a licensee's CMA as a market-value estimate distinct from an
  appraisal. StreetEasy's own report says it "is not an appraisal, valuation, broker price opinion,
  and is meant to be a starting point." Ours says the equivalent; **wording approved by Hannah
  before the pilot.**
- **StreetEasy attribution** — "Data provided by StreetEasy" — on every export, as their report does.
  Re-presenting the data in Casa-branded reports is cleared by Hannah (§17).
- **Fair housing** — the Fair Housing Act (HUD's 2024 guidance applies it to AI-generated content)
  plus NYC Human Rights Law, which adds lawful source of income, immigration status and more. The
  writer is constrained to property and market facts; §9.3 screens; the agent reviews before sending.
  **School zone** is a real price factor but a recognised steering signal: analyst view only, never
  in client copy unless Hannah approves wording.
- **Listing photos** linked, not hosted. **Client data** private by default, isolated per owner,
  never sent to Jev.

## 15. Risks

| Risk | Mitigation |
|---|---|
| Function time limits cut off a long model turn | One model call per request (§8.3.6), streaming; **measured in CR-1** |
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

## 16. Build plan

Dispatches in dependency order. **CR-R, CR-1 and CR-2 can all start now.**

- **CR-R — Adjustment research.** For every factor in Appendix A: how practitioners actually derive
  its value (paired sales, regression and hedonic models, appraisal practice, published NYC evidence),
  what data each method needs, and what published studies report — with sources. Output:
  `docs/comp-report/research/adjustments.md`. **Evidence for Noble's calibration, not defaults** —
  nothing from it enters the product without his sign-off.
- **CR-1 — Foundations.** React + Vite + TypeScript at `tools-src/comp-report/`, built to
  `tools/comp-report/`, following the wiring on `claude/motion-graphic-stories-hlpirk`. Build
  command, CI, forced-404 additions. Netlify Identity with Google and invites; the signup domain
  rule proved; the per-request check; the allowlist. Netlify Database with migrations and row-level
  security. A streaming Claude proxy with a deliberately long tool turn, to **measure time limits**.
  Settle the esbuild/`@netlify/blobs` rule. **Done when** a signed-in agent creates a persisted
  report and one streamed model turn completes, limits measured and written up.
- **CR-2 — Engine and parser.** §6 entire: both results, carry and price evaluation, the catalog as
  definitions, the `null` house method and the refused test config, with fixtures. No UI, no
  infrastructure. **Done when** §6.8 passes and the parser survives shuffled, missing and extra
  columns.
- **CR-3 — Workspace.** Intake, import with on-arrival tagging through the decision provider, the
  review ⇄ value loop, both results, what-ifs, price evaluation, undo and redo, versions. Depends on
  CR-1 and CR-2.
- **CR-4 — Assistant.** §8: server-owned transcript, the tools, statement capture and chips,
  Jev-backed `assess`, context notes, events, progress display, fallbacks, effort policy.
- **CR-5 — Writer and QA.** §9 and §10.2. Alongside CR-4.
- **CR-6 — Client report and PDF.** §10.1 and §10.3. **Waits on Kimani's design.**
- **CR-7 — Pilot readiness.** Usage logging, per-user caps, admin (users, allowlist, reports,
  spend), feedback capture, the Opus 5.5 vs. Sonnet 5 eval. Then the pilot.

**After v1:** the training gate (§11); co-ops; house method v1 with Noble; the client web page; full
offer modelling; more sources.

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

## 18. Open items

| Item | From | Blocks |
|---|---|---|
| Standard-tier exports, a co-op export, reports made without AI, Noble's good and bad examples | Noble, an agent — emailed 2026-09-24 | parser v2; house method; the eval; the rubric |
| The client report design | Kimani | CR-6 |
| Which Netlify plan the site is on | Kimani | CR-1 |
| Enable Netlify Identity; a Google OAuth client for its Google provider | Kimani | CR-1 |
| A Jev account and data terms for Casa | Kimani | CR-3 (fallback covers it until then) |
| Approve the training gate; whether compliance is the only hard block; client wording for "estimates" | Hannah | §11; §9 |
| Disclaimer wording | Hannah | pilot |

---

## Appendix A — The adjustment catalog

Every factor that can bear on an NYC residential comp. **None has a number.** Each is a definition
the engine and the assistant can reason with, marked *value not yet determined* until Noble sets it,
informed by CR-R. "Where the data comes from" is what exists today; an agent can always state it.

### Unit

| # | Factor | What it captures | Where the data comes from | Applies to |
|---|---|---|---|---|
| 1 | Interior size | Area differences, including large units that don't trade linearly with smaller-unit $/sqft | Export (may be approximate) | Condo; co-op by rooms |
| 2 | Bedrooms and bathrooms | Count differences — the primary driver for co-ops | Export | Both |
| 3 | Layout and efficiency | Split bedrooms, wasted space, room proportions, flex room | Floor plan (listing), agent | Both |
| 4 | Floor | Higher floors trading higher, relative to the building's height | Export | Both |
| 5 | Exposure and light | Orientation, corner units, open or blocked light | Listing text, agent | Both |
| 6 | Views | City, skyline, park, water, landmark; open or obstructed; protected | Export tags, listing, agent | Both |
| 7 | Outdoor space | Balcony, terrace, private roof, garden; size; private or shared access | Export (presence only), listing, agent | Both |
| 8 | Condition | Mint, renovated, good, original, needs work | Listing text and photos; the agent judges | Both |
| 9 | Finishes and systems | Kitchen and bath quality, central air, in-unit laundry, fireplace | Export tags, listing | Both |
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
| 18 | Sponsor and new-development sales | Sponsor pricing, concessions, sponsor-paid transfer taxes | Listing, agent | Both |
| 19 | Carrying costs | Common charges and taxes, or maintenance, as capitalised into price | Export | Both |
| 20 | Tax abatements | 421-a, J-51, and when they expire and taxes step up | Listing, agent, city records | Mainly condos |
| 21 | Building financials | Reserves, assessments, underlying mortgage, litigation | Agent, offering documents | Both; critical for co-ops |
| 22 | Policies | Pets, sublets, pied-à-terre, guarantors, financing limits, flip tax | Export (partial), listing, agent | Both; financing limits critical for co-ops |
| 23 | Parking | Deeded space, garage in building, valet, none | Export amenities (can't tell deeded from not) | Both |
| 24 | Ground lease | Leasehold against fee ownership | Listing, agent | Both; large where present |

### Location

| # | Factor | What it captures | Where the data comes from | Applies to |
|---|---|---|---|---|
| 25 | Micro-location | Block, side of the avenue, transit, parks, waterfront — "Canal Street isn't really Tribeca" | Address, agent; geocoding later | Both |
| 26 | Distance from subject | Physical proximity | Needs coordinates (not in the export) | Both |
| 27 | School zone | A real price driver — **analyst view only** (§14) | Agent, public data | Both |

### Transaction and market

| # | Factor | What it captures | Where the data comes from | Applies to |
|---|---|---|---|---|
| 28 | Recency and market movement | Time since the sale, and how the market moved since | Export dates | Both |
| 29 | Sale conditions | Estate, distressed, related-party, off-market, bulk, non-arm's-length | Agent, listing; closing-only records flagged | Both |
| 30 | Concessions and credits | Seller credits, closing-cost credits | Listing, agent | Both |
| 31 | Combination units | Combined apartments, against the sum of their parts | Agent | Both |
| 32 | Evidence status | Sold, in contract, active — not an adjustment; separate evidence classes (§6.3) | Export | Both |

### Later property types and modules

| # | Factor | What it captures | Applies to |
|---|---|---|---|
| 33 | Air and development rights | Unused buildable area | Townhouses, whole buildings |
| 34 | Lot size, width and frontage | Land characteristics | Townhouses |
| 35 | Legal use and certificate of occupancy | Legal unit count and use | Townhouses, multi-family |
| 36 | Rental income and yield | Achievable rent and gross yield — needs rent comps the export doesn't carry | Investor audience; the offer module |
