# Comp report tool — master design

**v0.1 · 2026-09-24 · owner: Casanova.** The guiding document for every comp report dispatch.
Dispatches cite sections of this file; when a build finding contradicts it, the dispatch says so
in its PR and Casanova updates this file — the doc follows reality, not the other way round.

Background and sources: `00-orientation.md` (what Hannah and Noble asked for, the reference export
taken apart, NYC practice, the ChatGPT workflow audit). Decisions are dated in §14.

---

## 1. What it is

A Creative Studio tool where an agent brings the comps they found on StreetEasy, works through
them with an AI assistant, locks a defensible price range, and leaves with a client-ready email
and a Casa Blanca–branded report. Target: **six hours down to twenty minutes**, with the agent
doing the ~15% that needs a human — choosing what's truly comparable, and judging condition.

**Users:** every Casa agent (piloted with a small group first), admins (Kimani, Hannah), and an
allowlist of authorised non-Casa people. Noble becomes the owner of the house comp method once a
working prototype exists (§5.6).

**v1 does:** condo reports from a StreetEasy comp export; subject capture by StreetEasy URL or by
hand; an assistant that operates the analysis; a locked, versioned valuation; client email in
three lengths; a PDF of the client report; saved, recoverable reports and chats.

**v1 does not:** co-ops (designed for — §5.4 — built next), offer-scenario and carrying-cost
modelling, data sources beyond StreetEasy, sending email from the tool, the client web page
(designed for — §8.4), Excel for clients.

## 2. The workflow

Seven stages. The assistant is available from stage 3 onward; everything it does is also doable by
hand.

1. **Brief.** Subject property — prefilled from its StreetEasy URL via the existing Firecrawl
   import, or entered — and property type. Then the audit's six fields as a form: the question
   ("Is $3.5M supported?"), audience, method, goal, output. **The agent enters their own range
   here** — a committed hypothesis, kept out of the valuation (§6.4).
2. **Import.** Upload the StreetEasy comp export (CSV or XLSX). The parser normalises it and
   reports what it couldn't read.
3. **Review.** One row per comp: tier (primary / secondary / excluded / unreviewed) with a reason,
   a link to the listing, and a "reviewed" mark once the agent has looked at it. Gaps are flagged
   (a same-building comp with no square footage; the subject's floor). The assistant proposes
   tiers from the data; the agent decides.
4. **Value.** The engine computes every indicator, the adjustment bridge and the range, live. The
   agent and the assistant adjust parameters within house limits; the range moves as they do.
5. **Lock.** The agent locks the valuation: an immutable, versioned snapshot. Only now is the
   agent's own range shown against the data.
6. **Communicate.** The writer drafts from the locked snapshot for the chosen audience — full
   email, short email, text — and the report narrative. QA gates run (§7). The agent edits.
7. **Export.** Copy the email; print the client report to PDF. The report is saved with its
   versions, its chat and its exports.

Any change after a lock unlocks into a new working version and a new lock is v2. Nothing
overwrites.

## 3. Non-negotiables

1. **Code computes, the model explains.** Every figure is computed by the engine and traceable to
   the rows and parameters it came from. The model argues, organises and writes; it never
   produces a number. Enforced, not requested: see the numeric grounding gate, §7.1.
2. **Sold and ask are different evidence** — separate statistics, labelled, never averaged
   together.
3. **A range, never a point.** Client outputs state the range. The engine's base value exists for
   the analyst view only.
4. **Neutral valuation before the argument.** The target price is compared against the valuation,
   never fed into it. The narrative argues from locked numbers and cannot move them.
5. **Judgment is structural.** Tier with a reason; mark reviewed; hypothesis first.
6. **Provenance on every figure** — source, as-of date, confidence.
7. **Compliance built in** — never "appraisal"; disclaimer on every export; generated copy
   checked against federal and NYC fair housing rules (§11).

## 4. Architecture

```
Browser — React + Vite SPA at /tools/comp-report/
   │   renders state; runs the engine locally for instant recompute
   ▼
Netlify Functions — the authenticated API          ◄── Netlify Identity (Google + invites)
   │   reports, imports, engine snapshots, assistant turns, writer, QA
   ├──► Netlify Database (Postgres) ── reports, comps, events, valuations, transcripts
   ├──► Netlify Blobs ─────────────── uploaded exports, generated files
   ├──► Anthropic API ─────────────── assistant, writer, lint (§6.6)
   └──► Firecrawl ─────────────────── StreetEasy listing lookup (existing integration)
```

**The engine is one TypeScript module run in two places:** in the browser so the range moves the
instant a comp is toggled, and in the functions so every stored snapshot is computed
authoritatively. Same code, same version string — the stored result is what the browser showed.

**The server owns the transcript and the report state** (§6.3).

## 5. The calculation engine

Pure TypeScript. No DOM, no network, no clock — inputs in, results out. This is the heart of the
tool and the part that must be most trustworthy, so it is built and tested first and alone (§13,
CR-2).

### 5.1 Types

- **Money** in integer dollars. **Area** in integer square feet. Floats only for ratios and
  percentages. Display rounding is a presentation concern, never applied inside the engine.
- **Every input field is sourced:**
  `{ value, source: 'se_export' | 'listing' | 'agent' | 'ai_proposed' | 'engine', as_of, confidence: 'exact' | 'approx' | 'inferred' | 'estimated', note? }`.
  A stale or low-confidence input is visible wherever it's used.

### 5.2 The StreetEasy parser

Reference fixture: `sources/streeteasy-comp-export-100-barclay-17l-2026-09-23.csv`.

- **Map columns by header name, never position.** Unknown columns are kept and reported; missing
  expected columns are warnings, not crashes. The parser is versioned and every import records the
  version.
- Parse `"2,201 ft²"`, `"$4,650,000"`, `"$2,112 ft²"`. A leading `~` means approximate — likely
  StreetEasy's AI-inferred square footage — and sets `confidence: 'approx'`.
- **Never trust the export's `$/Sqft` column.** Recompute from sale price (sold) or asking price
  (in contract, active), with the basis recorded. The export silently switches basis by status
  and truncates rather than rounds.
- A `/closing/` URL is a **public-record closing** without listing data: no ask, no days on
  market, no engagement, no features. Flag it.
- Split `Home Features`, `Building Amenities` and `Building Policies` on `;` into tags. Derive
  service level (full-time doorman / doorman / elevator only / walk-up), outdoor presence
  (terrace, balcony, roof deck — **presence only; the export carries no outdoor size**), parking,
  and views.
- **The subject is never in the export.** It comes from the brief.
- XLSX is the same schema in a different container.
- **Expected second variant:** exports from standard-tier StreetEasy accounts (requested
  2026-09-23). Parser version 2 is expected once one arrives.

### 5.3 Indicators

Evidence classes — **sold** (sale basis), **in contract** (ask basis, pending), **active** (ask
basis, competition) — never mix inside one statistic.

Two indicator families, which is what makes co-ops a subtraction rather than a rewrite:

- **Unit-rate indicators** ($/sqft) — need square footage on both subject and comp. Median,
  mean, weighted mean (weights from tier and recency), and the single most comparable sold comp as
  an anchor. Each yields an implied subject value.
- **Adjusted-price indicators** — each sold comp's price, adjusted for its differences from the
  subject (§5.5), is an indication of the subject's price. Reconciled by the same four statistics.

Condos compute both; unit-rate usually leads. Co-ops switch unit-rate off.

**Also computed:** sale-to-last-ask ratio per sold comp and summarised (negotiation margin),
days on market, and where active and in-contract asks sit against the sold band.

### 5.4 Reconciliation and range

- A **benchmark rule** picks the leading indicator — e.g. median when the primaries contain an
  outlier; the anchor comp when primaries are fewer than four. The rule is a parameter, stated in
  the analyst view, and the assistant may propose a change with a reason.
- **Base** = the leading indicator's implied value. **Low–high** from the spread of primary
  indications, rounded to increments by price band.
- **Target comparison:** target vs. base as a percentage, target $/sqft vs. the benchmark, where
  the target falls in the range.

### 5.5 Adjustments

Each adjustment is a line: `{ comp | all, type, amount or %, direction, reason, set_by }`. The
bridge — base, each line, result — is the audit trail and the "complete mathematical bridge"
Hannah keeps asking ChatGPT for.

v1 types: **floor**, **outdoor space** (by class when size is unknown; effective square footage
by weighting when it's known), **view**, **condition** (agent-set), **service level**, **size**
(large-unit non-linearity, optional). Recency is a *weight* in v1, not an adjustment.

### 5.6 The house method

Every default and limit lives in one versioned config file, `house-method.v0.json`, not in code:
the benchmark rules, adjustment defaults and bounds, weights, rounding increments. **Every value
in v0 is a placeholder** — the outdoor bands come from the ChatGPT audit, the rest from general
practice — and says so. Noble signs off v1 after the prototype. Every valuation records which
house-method version produced it, so old reports reproduce exactly.

### 5.7 Tests

Hand-verified fixtures. The first comes from Hannah's export and must reproduce:

- all five sold comps: mean **$1,906/sqft**, median **$2,112**; sold comps on floor 10+: mean
  **$2,279**
- in-contract and active $/sqft on **ask** basis (1,625 · 2,387 · 2,400; 2,763 · 3,091)
- `~1,840` flagged approximate; 79 Laight #1A flagged as a closing; 100 Barclay #11F with no area
  contributing no unit-rate indication; 101 Leonard #5B with no floor
- sale-to-ask: −3.0%, +12.3%, −4.0%, −4.2%

## 6. The AI layer

### 6.1 Three roles

| Role | What | Shape | Model |
|---|---|---|---|
| **Assistant** | Operates the engine through tools, one conversation per report | stateful, streamed | Claude Opus 5.5 |
| **Writer** | Drafts client copy from a locked snapshot | stateless, one call per draft | Claude Opus 5.5 |
| **Linters** | Compliance classification; feature tagging from listing text; header mapping when an export changes | stateless, small | Claude Haiku 4.5 |

**Model is a per-role config value, never hard-coded.** Claude Sonnet 5 is the measured
challenger for the assistant: during the pilot, run Noble's good and bad examples through both and
keep Sonnet if it holds (§13, CR-7).

**Why one model per conversation:** Opus 5.5's reasoning blocks are readable only by the model
that produced them (and Fable 5.1), and prompt caches are per model. Switching models inside one
conversation silently drops the prior reasoning and forfeits the cache. Splitting work across
models is fine *between* calls — which is why the writer and linters are separate calls.

### 6.2 Assistant tools

The assistant changes **parameters**; the engine recomputes.

| Tool | Does |
|---|---|
| `get_report` | Current state: subject, comps, parameters, indicators, gaps |
| `set_comp_tier` | Tier a comp, with a reason |
| `set_adjustment` / `clear_adjustment` | Within house-method bounds, with a reason |
| `set_benchmark_rule` | With a reason |
| `set_recency_window` | With a reason |
| `flag_gap` | Ask the agent for a missing input, or offer a lookup |
| `lookup_listing` | Firecrawl a comp's or the subject's listing for features, area, description; results arrive as `listing`-sourced, `inferred` fields for the agent to confirm |
| `set_brief` | Audience, method, goal — from how the agent talks |

**It can never:** write a price, an area, a rent or any other figure; lock a valuation; see the
agent's hypothesis before the lock (§6.4); edit anything after the lock except by drafting through
the writer.

### 6.3 Rules and mechanics

1. **Bounded.** Parameters outside house-method bounds need the agent's explicit confirmation.
2. **Visible and reversible.** Every change is an event — actor (agent or AI), what, why, and the
   range before and after. Changes apply immediately (speed matters) and undo is one click.
3. **Undo is a new event, never a rewrite.** Opus 5.5 rejects edited conversation history, so the
   transcript and the event log are append-only by construction.
4. **The server owns the transcript and the state.** The browser sends only the agent's new
   message. Each request runs any pending tool calls through the engine server-side, then makes
   **one** model call and streams it; the browser re-requests to continue the loop. That keeps
   every request to a single model call (time limits, §12) and keeps state authoritative.
5. **Stay portable across Opus 5.5 and Sonnet 5 until the eval decides.** Engine-state updates
   reach the model as user-turn content, not mid-conversation system messages (Sonnet 5 lacks
   them).

### 6.4 Keeping the valuation neutral

The hypothesis field never enters the assistant's context during stages 3–4. It can't stop an
agent typing "I think it's $3.5M" into the chat, so there's a backstop: after a hypothesis exists,
every parameter change shows how much it moved the base *toward or away from* the hypothesis, and
the analyst view totals it. Target-seeking becomes visible rather than silent.

### 6.5 Calling Claude — implementation notes

For Opus 5.5 (`claude-opus-5-5`), current as of 2026-09-24 — verify against the `claude-api`
skill when building:

- **Thinking is always on.** Don't send `thinking: {type: "disabled"}` or `budget_tokens` —
  both 400. **Effort is the control:** its default is `medium`; set it explicitly. Conversational
  turns at `low`, the valuation-proposal pass at `medium` or `high`, measured.
  Per-message effort changes effort without resetting the cache (beta).
- **No forced tool use** — `tool_choice` `any` / `tool` returns 400. Use `auto`, `strict: true`
  tool schemas, steering in the prompt, and check a call was made.
- **Append-only history** (§6.3.3) — pass thinking blocks back unchanged.
- **Progress notes arrive as thinking blocks.** Set `display: "updates"` (beta) and render them, or
  the chat goes silent through long turns.
- **Handle `stop_reason: "refusal"`** before reading content, and opt into server-side fallbacks
  from day one.
- **Stream** every assistant and writer call. Size `max_tokens` for thinking plus the reply.
- **Cache** a stable system prompt and tool list first. Opus 5.5 cache reads are $0.20 per
  million tokens, so a warm cache makes long report chats cheap.

### 6.6 Cost

List pricing per million tokens, input / output: **Opus 5.5 $4 / $20** (cache reads $0.20),
**Sonnet 5 $2 / $10**, **Haiku 4.5 $1 / $5**.

Estimated per report — ~150K input tokens, mostly cache reads, and ~20K output:
**Opus 5.5 ≈ $0.35–1.00**, Sonnet 5 ≈ $0.20–0.60. At 800 reports a month — every agent, about
four each — Opus runs roughly $300–800. **Log real usage per call from day one** and replace these
estimates with measurements in the pilot.

## 7. QA gates

Run on every writer output before it can be exported or copied. A failure blocks and highlights.

1. **Numeric grounding.** Extract every number from the text — currency, percentages, areas,
   counts, dates — normalise ("$3.4M" = "3.4 million" = "$3,400,000"), and match each to a value in
   the locked snapshot or the brief, within the stated precision. **An unmatched number blocks.**
   This is what makes non-negotiable 1 real.
2. **Range, not point.** The stated range equals the locked range; no single-price value claims
   in client copy.
3. **Compliance.** Banned terms (appraisal, appraised value), a fair housing term list covering
   federal and NYC Human Rights Law classes, then a Haiku pass for subtler stacked signals. The
   disclaimer and brokerage identity are present.
4. **Freshness.** Inputs older than a threshold are either disclosed in the copy or confirmed by
   the agent.

## 8. Outputs

### 8.1 Two layers

- **Analyst view** — every comp including exclusions and their reasons, all indicators, the full
  bridge, provenance, the event log, target-seeking totals. For the agent.
- **Client view** — the range, the primary evidence, the bridge in plain language, market signals,
  assumptions and their dates, disclaimer, agent contact. For the client.

### 8.2 Email — the primary deliverable

Full email, short email, and text, per audience. Copy to clipboard as rich HTML that pastes cleanly
into Gmail, with plain text alongside. The tool doesn't send.

### 8.3 The client report and PDF

**One template renders the client view.** Kimani designs it (Claude Design), then it's ported to
HTML and CSS as a self-contained component whose only input is the locked snapshot. PDF v1 is a
browser print of that template with `@page` CSS; server-side rendering comes only if agents
struggle with the print dialog.

**What the template has to hold** — design against real content, not lorem ipsum. From Hannah's
export: addresses like *"25 North Moore Street, #9C"*; five to eight primary comps plus a mention
of secondaries; prices to $5,995,000; $/sqft to four digits; statuses sold / in contract / active;
dates; days on market to 300; the range as two prices; the thesis in one or two sentences; a
bridge of three to six lines; agent name, licence number, photo and contact; the disclaimer.

### 8.4 The client web page — phase 2, designed for now

A hosted, frozen copy of the same client view: unguessable URL, excluded from search engines,
expiring, versioned. Client view only — never the analyst view, target or strategy. Listing photos
linked, not hosted. Open tracking disclosed. Brokerage disclosures to be confirmed before it ships.
Because it renders the same template, it's nearly free once §8.3 exists.

## 9. Data model

Netlify Database (Postgres). Every table is scoped by report owner through Postgres row-level
security — each request sets the user and role on the connection, and policies enforce them — as
well as by scoping in every query. Belt and braces: a missed `WHERE` clause must not expose one
agent's report to another.

| Table | Holds |
|---|---|
| `users` | **email (the key)**, name, identity provider and its user id, role (`agent` / `admin` / `external`), status, last login |
| `allowlist` | authorised non-Casa emails and admin grants — who added them, when, why |
| `reports` | owner, title, property type, brief, **hypothesis** (withheld from the assistant), status (`draft` / `locked` / `archived`), current working state |
| `subjects` | the subject's sourced fields, one per report |
| `imports` | uploaded file (Blobs key), format, parser version, warnings |
| `comps` | the verbatim source row, normalised sourced fields, evidence class, tier, reason, who set it, reviewed-at |
| `events` | append-only: every change, actor, reason, range before and after |
| `valuations` | immutable locked snapshots: version, engine and house-method versions, inputs hash, full inputs and outputs |
| `narratives` | writer drafts per valuation: audience, kind, content, model, prompt version, QA results, whether the agent edited it |
| `exports` | PDFs and later web pages: which valuation and narratives, file key or public slug, expiry |
| `messages` | the transcript — full content blocks stored verbatim for replay, model, token usage |
| `usage` | per model call: user, report, model, tokens, estimated cost |

**Retention:** when an agent leaves, their account is disabled and their reports are kept.
Admins can reassign them. Export to the departing agent is a later decision.

## 10. Auth

**Netlify Identity**, so auth, data, files and functions all live inside Netlify — no extra vendor.

- **Casa agents sign in with Google** — Identity's Google provider, configured with Casa's own
  OAuth client so the consent screen says Casa Blanca rather than Netlify.
- **Authorised non-Casa people are invited** by an admin and sign in with email and password.
  Netlify sends the invitation and recovery emails itself, so this covers people with no Google
  account at all.
- **The domain rule is enforced twice.** At signup, by Identity's event function — refuse any email
  that is neither on Casa's domain nor on the allowlist. Netlify's current docs say the signup event
  fires for external providers as well as email signups, and show domain blocking as a supported
  use. **CR-1 must prove it** by signing up with a non-Casa Google account and seeing it refused.
  And on every request, by our functions, whatever Identity decided — defence in depth, and the
  guarantee that holds even if the signup hook doesn't behave as documented.
- **Our `users` table is keyed by email, not Identity's user id.** If Netlify ever withdraws
  Identity — it announced a deprecation and reversed it in February 2026 — moving to another
  provider is a re-login, not a data migration.

**Fallback if CR-1 finds Identity unworkable:** Google sign-in handled directly — the approach
Kimani used for MindBinder — with our own session cookie. Invited non-Google users would then
need an emailed-link sign-in and an email service.

**Not Supabase:** its main draw here was the database, and Netlify Database reached general
availability on 2026-04-28.

**Deploy previews:** Google won't accept wildcard origins, so Google sign-in works only on origins
registered in the OAuth client. Use production plus one fixed staging branch deploy.

## 11. Compliance

- **Not an appraisal.** New York treats a licensee's CMA as a market-value estimate distinct from
  an appraisal. The words appraisal and appraised value never appear in client copy; every export
  carries the disclaimer. **Disclaimer text to be approved by Hannah before the pilot.**
- **Fair housing.** Federal Fair Housing Act — HUD's 2024 guidance applies it to AI-generated
  content — plus NYC Human Rights Law, which adds lawful source of income, immigration status and
  more. The writer is constrained to property and market facts; the lint (§7.3) checks; the agent
  reviews before sending.
- **StreetEasy data** in Casa-branded reports: cleared by Hannah (§14).
- **Listing photos:** link to them; don't host them.
- **Client data:** reports may name clients. Private by default, per-owner isolation, kept on
  departure.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Netlify function time limits cut off a long model turn | One model call per request (§6.3.4) and streaming; **measured in CR-1** before anything depends on it |
| StreetEasy changes its export, or standard-tier exports differ | Header-mapped, versioned parser; fixtures per variant; Haiku header mapping as the fallback |
| The model invents a figure | Engine-only numbers; numeric grounding gate; Opus 5.5's measured reduction in unsupported figures |
| The assistant tunes parameters toward the target | Hypothesis withheld; bounds; target-seeking shown (§6.4) |
| Fair housing language in generated copy | Constrained writer, lint, human review |
| Placeholder house method treated as authoritative | Labelled v0 everywhere it appears; Noble signs off v1 |
| The build step breaks the deploy for every tool | CI on every PR; deploy previews; the build fails before publish rather than shipping a half-built site |
| New source folders published by `publish = "."` | CR-1 adds them to the forced-404 list and verifies live |
| Identity's signup hook doesn't fire for Google as documented | Function-level check on every request refuses non-Casa, non-allowlisted users regardless; CR-1 tests the hook |
| Netlify withdraws Identity again | Users keyed by email; fallback is direct Google sign-in (§10) |
| Netlify Database needs a credit-based Netlify plan | Check the plan in CR-1. If the site is on a legacy plan: change plans, or Neon directly (an extra account) |
| Cost grows with adoption | Per-call usage logging, per-user caps, admin view of spend |
| Agents don't adopt it | Pilot group first; Noble shapes onboarding and hints after the prototype |

## 13. Build plan

Dispatches in dependency order. CR-1 and CR-2 run in parallel.

- **CR-1 — Foundations.** React + Vite + TypeScript at `tools-src/comp-report/`, built to
  `tools/comp-report/`, following the wiring proven on `claude/motion-graphic-stories-hlpirk`.
  Build command composition, CI, the forced-404 additions for every new source folder. Netlify
  Identity with Google and invites, the signup domain rule (proved with a non-Casa Google account),
  the per-request check, the allowlist. Netlify Database with migrations and row-level security. A
  streaming Claude proxy with a deliberately long tool turn, to **measure the time limits**.
  Settle the esbuild/`@netlify/blobs` rule (parked decision 1), since this tool needs both.
  **Done when:** a signed-in agent can create a report that persists, and one streamed model turn
  completes; limits measured and written up.
- **CR-2 — Engine and parser.** §5 entire, with fixtures. No UI, no infrastructure — can start now.
  **Done when:** Hannah's export reproduces every figure in §5.7 and the parser survives shuffled,
  missing and extra columns.
- **CR-3 — Workspace.** Stages 1–5: brief, import, comp table, tiers, reasons, reviewed marks,
  gaps, bridge, the live range, lock. Depends on CR-1 and CR-2.
- **CR-4 — Assistant.** §6.2–6.5: server-owned transcript, tools, bounds, events, undo, progress
  display, fallbacks, effort policy. Depends on CR-3.
- **CR-5 — Writer and QA.** §7 and §8.2: the writer, the four gates, the email variants and copy.
  Can run alongside CR-4.
- **CR-6 — Client report and PDF.** §8.1 and §8.3. **Waits on Kimani's template design.**
- **CR-7 — Pilot readiness.** Usage logging, per-user caps, admin (users, allowlist, reports,
  spend), feedback capture, hooks for Noble's onboarding. The Opus 5.5 vs. Sonnet 5 eval on
  Noble's examples. Then the pilot.

**After v1:** co-ops (§5.3 switches unit-rate off), the client web page (§8.4), offer scenarios,
additional sources, house method v1 with Noble.

## 14. Decision log

| Date | Decision |
|---|---|
| 2026-09-23 | For all agents; piloted with a small group first |
| 2026-09-23 | Condos first; co-ops as the same scaffolding without square footage |
| 2026-09-23 | Departing agents' reports kept |
| 2026-09-23 | Buyer and seller comps treated the same in analysis; the communication varies by audience |
| 2026-09-23 | StreetEasy data may be re-presented in Casa-branded reports (Hannah) |
| 2026-09-23 | Subject captured by StreetEasy URL or by hand |
| 2026-09-23 | Noble owns the house method after a working prototype, and shapes onboarding |
| 2026-09-23 | Integrated AI, not bring-your-own-key |
| 2026-09-24 | React + Vite for this tool, as a scoped exception — other tools may follow later |
| 2026-09-24 | Auth: Netlify Identity — Google for Casa agents, invites for authorised others; domain rule enforced at signup and on every request (§10) |
| 2026-09-24 | Data: Netlify Database and Netlify Blobs |
| 2026-09-24 | Models: Opus 5.5 for assistant and writer, Haiku 4.5 for linters, Sonnet 5 evaluated in the pilot |
| 2026-09-24 | PDF: browser print of the HTML client template first |
| 2026-09-24 | Client web page: phase 2, designed for from the start |

## 15. Open items

| Item | From | Blocks |
|---|---|---|
| Hannah's StreetEasy PDF, committed to `sources/` | Kimani | CR-6 reference |
| Standard-tier exports, a co-op export, reports made without AI, Noble's good and bad examples | Noble, an agent — emails drafted, Kimani sending 2026-09-24 | parser v2; house method; the eval |
| The client report design | Kimani | CR-6 |
| Which Netlify plan the site is on (Netlify Database needs a credit-based plan) | Kimani | CR-1 |
| Enable Netlify Identity on the site; a Google OAuth client for its Google provider | Kimani | CR-1 |
| Disclaimer wording | Hannah | pilot |
