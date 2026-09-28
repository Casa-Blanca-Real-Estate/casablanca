# Pending decisions

Everything waiting on Kimani, across every track. **Answer inline:** open this file on GitHub, click
the pencil, replace a *type here* placeholder with your answer (a letter is enough where there are
options), and commit. Casanova folds each answer into the right design doc, logs it there, and moves
it to **Resolved** at the bottom.

**Urgency:** `Now` · `Soon` (before the named dispatch reaches it) · `Later` · `Parked` (a paused
track). **Size:** `Quick` — pick one · `Think` — needs a real look.

Last updated 2026-09-28 by Casanova.

**What actually blocks the next build:** CR-3 (the workspace) needs **D-1, D-10 and D-12**. CR-4
needs D-4 and CR-5 needs D-2, but those start later. Everything else can wait.

## Index

| ID | Decision | Urgency | Size | Blocks |
|---|---|---|---|---|
| D-1 | When the agent gives their call | Soon | Think | CR-3 |
| D-2 | Compliance as the only hard block in QA | Soon | Quick | CR-5 |
| D-3 | How agent estimates are worded for clients | Later | Quick | CR-5, CR-6 |
| D-4 | When the assistant first sees a target price | Soon | Quick | CR-4 |
| D-5 | How much the tool coaches versus drafts | Later | Think | CR-4 |
| D-6 | When to ask the agent what kind of argument they want | Later | Quick | CR-4 |
| D-7 | The client profile's dimensions | Later | Think | CR-5 |
| D-8 | Voice samples: attestation and visibility | Later | Quick | CR-5 |
| D-9 | Keeping property records across agents | Later | Quick (Hannah) | the property pool |
| D-10 | Which deal-terms modules intake offers in v1 | Soon | Think | CR-3 |
| D-11 | The training gate's rules | Later | Think (Hannah, Noble) | practice mode |
| D-12 | Reusing the MindBinder Jev integration | Soon | Quick | CR-3 |
| D-13 | Disclaimer wording | Later | Quick (Hannah) | the pilot |
| D-14 | When to research interaction magnitudes | Later | Quick | CR-R2 |
| D-16 | Unmerged branches | Later | Quick | — |
| D-17 | Two questions for counsel | Later | Quick (counsel) | the pilot; factor 18 |
| D-18 | The order adjustments apply in, and whether they compound | Later | Quick (Noble) | the first house-method values |

## Your actions

- [ ] **Now — protect Netlify's non-production deploys.** Old deploy previews
  (`deploy-preview-N--casa-blanca-creative-studio.netlify.app`, numbered by PR, so guessable) still
  serve the internal docs from before the 404 fix, and new previews now carry sign-in and a database
  branch. Site configuration → access and security → password-protect or restrict non-production
  deploys.
- [x] ~~Name and start the three new sessions.~~ Surveyor, Mason and Abacus — all three delivered and
  merged (#49, #48, #50) on 2026-09-28.
- [x] ~~Tell Casanova which Netlify plan the site is on.~~ Credit-based: CR-1's preview was given a
  database, which Netlify only does on credit-based plans.
- [ ] **Now, blocks CR-1's last step — enable Netlify Identity**, following
  `docs/comp-report/cr1-setup.md`: open registration, **email confirmation on**, Google on. Then
  `/api/comp-report/health` should show `emailConfirmation: true`.
- [ ] **Now, blocks CR-1's last step — create a Google OAuth client** for Identity's Google provider,
  so the sign-in screen says Casa Blanca. Its client ID and secret go into Identity's settings.
- [ ] **Now — set `CR_ADMIN_EMAILS`** (your address, and anyone else who should run the allowlist) in
  Netlify's environment variables. And tell Casanova: **does anyone sign in with an
  `@email.casa-blanca.com` address?** If so, `CR_ALLOWED_DOMAINS` gets set too.
- [ ] **Then — run step 6 of `cr1-setup.md`:** the health page, a personal Gmail refused, a Casa account
  creating a report that survives a reload, then a turn that uses a tool and a second message. About
  15 minutes; Mason's session can walk you through it.
- [ ] **Soon — give Casa sessions their own cloud environment**, or take `DATABASE_URL` out of this
  one. The Claude Code environment Casa's sessions run in holds MindBinder's database address. Nothing
  in this repo reads it (CR-1 made sure), but every Casa session, including the research ones that
  read the open web, carries it.
- [ ] **Soon — get Casa its own Jev account.** Early access is invite-only; your access is through
  MindBinder. The tool falls back to Claude Haiku until then.
- [ ] **Later — build the house glossary with Noble and the mentors.** Official definitions for
  mortgage payment, interest-only payment, monthly carry, ownership carrying cost and the rest, so the
  tool and every agent use each term one way. **The draft is ready:**
  `docs/comp-report/research/glossary-draft.md` — 152 entries, every one marked DRAFT, with 12
  questions for Noble at the top. The three that matter most: "carry" is used three ways; whether
  "mortgage payment" includes escrowed taxes (if it does, the tool counts taxes twice); and whether
  sale-to-ask divides by the first or the last asking price.
- [ ] **Later — send Noble the adjustment evidence** (`docs/comp-report/research/adjustments.md`,
  all 36 factors, sourced) along with D-18. It's what he sets the house method's first values from.
- [ ] **Later — propose the training gate to Hannah** (D-11 has the detail).
- [ ] **Parked — agent sites:** Sam Valk's bio and neighborhoods (the build warns without them); confirm
  `casa-blanca-creative-studio.netlify.app` is the production origin.
- [ ] **Parked — profile pic:** 3–5 of your genuinely hard portraits for the Phase 1 re-cut; the
  outpaint provider key once Phase 1 lands (Nano Banana 2 → `GEMINI_API_KEY`).

---

## Comp report

### D-1 · When the agent gives their call
`Soon — CR-3` · `Think`

The agent's call is their own opinion of value ("I think it trades at $3.4–3.6M"). It never feeds the
calculation, but comparing it against the data is the teaching moment. The question is when to ask.

- **A — Call first**, before any data. Purest read of their intuition, no anchoring. But agents new to
  an area have no basis for a view, so the call is noise, and it adds friction up front.
- **B — Data first**, call after seeing the range. Fastest. But the agent anchors on the computed
  number, the gap collapses, and the tool has done the thinking.
- **C — Call before the reveal.** The agent imports and reviews the comps — tiers, reasons, listings —
  with the computed range hidden, then gives their call, then sees the range. A view formed the way real
  agents form one, without being handed the answer. It also stops first-pass tiering done to move the
  number. Skippable; required in practice mode.

**Recommendation: C.** Design `01-design.md` §3.1.

**Answer →** _type here_

### D-2 · Compliance as the only hard block in QA
`Soon — CR-5` · `Quick`

You asked that numbers not traceable to the calculation be flagged and acknowledged rather than block
export — agreed and designed that way. The question is whether *anything* should hard-block. The
proposal: only compliance — the words "appraisal" or "appraised value" in client copy, and
high-confidence fair-housing hits. Lower-confidence fair-housing flags only warn. Reason: those are
legal exposure for Casa, not judgment calls, and the fixes are quick rewrites.

- **A — Compliance hard-blocks, as proposed.**
- **B — Nothing hard-blocks; compliance warns like everything else.**

**Recommendation: A.**

**Answer →** _type here_

### D-3 · How agent estimates are worded for clients
`Later — CR-5, CR-6` · `Quick`

Internally, an agent's rough figure is a "guesstimate", and the tool shows a result "with estimates".
When client copy uses those numbers, it discloses them. What should the client read?

- **A — "agent's estimate"** ("outdoor space of about 400 sq ft, per the agent's estimate")
- **B — "approximate"**
- **C — something else** (write it)

**Recommendation: A** — honest and professional; "guesstimate" reads casual to a client.

**Answer →** _type here_

### D-4 · When the assistant first sees a target price
`Soon — CR-4` · `Quick`

A target ("the seller wants $11.5M") is kept out of the assistant's view while it helps with the neutral
valuation, so it can't tune the analysis toward it. You want the assistant to actively help close a gap
to the target — designed as *Path to target* (§8.5).

- **A — Hidden until the neutral result exists**, then Path to target becomes available. Entering it pins
  the neutral numbers as a version, so the before and after are always side by side.
- **B — Visible from the start.** Simpler, but the neutral valuation is no longer neutral.

**Recommendation: A.**

**Answer →** _type here_

### D-5 · How much the tool coaches versus drafts
`Later — CR-4` · `Think`

You don't want thinking offloaded to the tool; the agent should lead the recommendation. The design: the
broker recommendation is always the agent's — the tool asks for it, then checks and sharpens it. The open
part is how Socratic the rest of the experience is.

- **A — Coaching scales with the agent.** Practice mode and newer agents: the tool asks before it drafts.
  Unlocked, experienced agents: the tool drafts directly, always with the neutral numbers beside it and
  every departure from the data marked.
- **B — Ask-first for everyone.** Maximum learning; slower, and grating for experienced agents who know
  what they want.
- **C — Draft-first for everyone**, with the numbers beside it.

**Recommendation: A.** Hannah herself asks ChatGPT to "convince him $11.5M is a good price" — making her
answer a quiz first would be friction, not teaching.

**Answer →** _type here_

### D-6 · When to ask the agent what kind of argument they want
`Later — CR-4` · `Quick`

"Help me explain why $11.5M is right" can mean the analysis, the negotiation case, or the emotional
argument. Your idea: offer a choice.

- **A — Only when ambiguous.** Jev classifies the request; when confident, the assistant proceeds; when
  not, it offers the three as a one-tap choice.
- **B — Always offer the choice** for requests like this.

**Recommendation: A.**

**Answer →** _type here_

### D-7 · The client profile's dimensions
`Later — CR-5` · `Think`

The client profile describes how the client decides — never who they are — and shapes the writing and
strategy, never the range. Protected characteristics are excluded by design. Starting dimensions: decision
style (numbers-driven, narrative, sentimental, time-pressured), priorities (price, speed, certainty),
sophistication, agent notes. You mentioned MindBinder's trait framework — defined dimensions, each
measured on a stated scale.

- **A — Borrow MindBinder's framework** once it settles, adapted to client decision traits.
- **B — Start with the dimensions above** and grow them from pilot use.

**Recommendation: B now, A when MindBinder's framework is stable.**

**Answer →** _type here_

### D-8 · Voice samples: attestation and visibility
`Later — CR-5` · `Quick`

Agents upload their own writing so the writer can match their voice. Two questions:

1. **Attestation** — agents confirm "I wrote these myself" on upload. Enough? (AI-text detectors are too
   unreliable to lean on.)
2. **Visibility** — can mentors and admins see an agent's samples and style profile, or only the agent?

**Recommendation: 1 — attestation is enough. 2 — agent only**, with admins able to delete.

**Answer →** _type here_

### D-9 · Keeping property records across agents
`Later — before the property pool is built` · `Quick, for Hannah`

Every import records the properties in it, so over time Casa builds its own record of recent sales across
the city. The tool could then say "two more sales in this building in the last six months came in on other
agents' reports" and offer them. Hannah cleared re-presenting StreetEasy data in Casa-branded *reports*.
Keeping StreetEasy-derived records beyond a report and sharing them across agents is a different use —
compiling a database — and may or may not be covered by Casa's StreetEasy agreement. Public-record
closings are public either way.

- **A — Allowed:** keep records and suggest them across agents.
- **B — Keep records per agent only** — an agent's own history, not shared.
- **C — Public-record facts only across agents** (address, unit, sale price, date, size); StreetEasy
  listing content stays with the report that imported it.

**Recommendation: ask Hannah; C is the safe middle** if the agreement is unclear. The schema supports all
three: CR-1 built it so a property's identity (building, unit) is shared, so imports dedupe, while what
each import observed stays private to the agent who imported it.

**Answer →** _type here_

### D-10 · Which deal-terms modules intake offers in v1
`Soon — CR-3` · `Think`

Deal terms are an optional intake module built from scenario templates. v1 captures and displays them and
runs carry, monthly cost and price evaluation on them; rent-credit and closing-timeline arithmetic comes
later. Which templates should v1 offer?

- **Buyer — traditional purchase:** price point, deposit, financing, target closing
- **Buyer — rent-to-own:** the above plus interim rent and credit
- **Seller — pricing:** target, timing, flexibility

- **A — All three.**
- **B — Traditional purchase and seller pricing**; rent-to-own with full offer modelling.

**Recommendation: B** — v1 can't compute a rent-to-own properly yet, and a form that implies it can will
mislead.

**Answer →** _type here_

### D-11 · The training gate's rules
`Later — practice mode` · `Think — Hannah and Noble`

To propose to Hannah: agents unlock the full tool by building comps themselves in practice mode — the same
tool with the help off. Graded by code, Jev and the LLM, with Noble making the pass/fail call at first.

1. How many practice reports before unlocking, for new agents?
2. How do experienced agents unlock — one passing submission, a direct grant, or either?
3. Who can grant — admins, mentors, or both?
4. Should a mentor's sign-off count, tying the gate into the mentorship programme?

**Recommendation:** 2 — either; 3 — both; 4 — yes. 1 is Noble's call.

**Answer →** _type here_

### D-12 · Reusing the MindBinder Jev integration
`Soon — CR-3` · `Quick`

You're already using Jev in MindBinder. If Casanova can read that repo, CR-3 can reuse the integration
pattern rather than start cold. That means adding the MindBinder repo to this session.

- **A — Yes**, add it (name the repo).
- **B — No**, build fresh.

**Answer →** _type here_

### D-13 · Disclaimer wording
`Later — before the pilot` · `Quick, for Hannah`

Every export carries a not-an-appraisal disclaimer and "Data provided by StreetEasy". StreetEasy's own
report reads: *"This report is provided for informational purposes only and is based on StreetEasy's
proprietary and third-party data, which may be incomplete or subject to change. It is not an appraisal,
valuation, broker price opinion, and is meant to be a starting point."* Proposed for Casa: *"This
comparative market analysis is an estimate of market value prepared by a licensed real estate agent for
informational purposes. It is not an appraisal. Data provided by StreetEasy and other sources, which may
be incomplete or subject to change."*

**Answer →** _type here — approve, edit, or send to Hannah_

### D-14 · When to research interaction magnitudes
`Later — CR-R2` · `Quick`

Factors interact — a private terrace makes a building roof deck worth less to that unit; a terrace with a
skyline view is worth more than the two apart. The *structure* is mapped now and v1 warns about double
counting. The *magnitudes* need research (CR-R2).

- **A — After CR-R lands and Noble has set first values** for the main factors.
- **B — In parallel with CR-R**, now.

**Recommendation: A** — interaction magnitudes are adjustments to adjustments; they need the base values
first.

**Answer →** _type here_

## Repo and deploy

### D-16 · Unmerged branches
`Later` · `Quick`

Thirteen remote branches are merged into `claude/main`. Nine are finished work and can be deleted;
four belong to live sessions (Casanova, Surveyor, Mason, Abacus) and stay. Three aren't merged and have
no PR: `claude/qr-code-generator-nva8xf` (a QR code generator, July), `claude/motion-graphic-stories-hlpirk`
(the React spike — CR-1 has now absorbed it), and `samplepics` (an upload branch, August).

- **A — Delete the nine finished and the React spike; you decide on the QR generator and `samplepics`.**
- **B — Leave everything.**

**Answer →** _type here_

## Comp report — for outside sign-off

### D-17 · Two questions for counsel
`Later — (1) before the pilot, (2) before factor 18 gets a value` · `Quick — forward to counsel or a closing attorney`

CR-R (Surveyor) found two legal questions research can't settle. Both are in
`docs/comp-report/research/adjustments.md`, with sources.

1. **Is a CMA an "appraisal" under New York law?** Executive Law §160-a defines appraisal broadly. The
   Department of State's appraiser FAQ and the §160-jjjj(3) carve-out come close to excluding a
   comparative market analysis by a licensed agent, but no DOS page says so outright. D-13's disclaimer
   wording depends on the answer.
2. **Sponsor sales: does transfer tax the buyer pays count toward the taxable consideration?** A NYC law
   firm says it raises it; the TP-584 instructions say it's excluded. Factor 18 (sponsor sale) does
   this arithmetic, so the tool needs the right answer before it computes it.

**Answer →** _type here — who it went to, or their answer_

### D-18 · The order adjustments apply in, and whether they compound
`Later — before the first house-method values` · `Quick — Noble`

Today the engine takes every adjustment off the comp's own sale price and adds them up, so order never
matters. Appraisal practice works in two stages: **transaction** adjustments first (market movement since
the sale, financing, conditions of sale), each applied to the price the one before produced; then
**property** adjustments (size, floor, view, condition and the rest) added together on that result. The
difference is small per comp, but it runs through every number once values exist.

- **A — Keep it flat:** everything off the sale price, added. Simplest to explain.
- **B — Appraisal practice:** transaction adjustments first, in sequence; property adjustments added on
  the result.

**Recommendation: B, if Noble agrees.** It's what an appraiser or a reviewing broker expects, and the
property adjustments stay additive (§6.5). It's a small engine change, and nothing moves until values
exist.

**Answer →** _type here_

---

## Resolved

### D-15 · The esbuild / `@netlify/blobs` rule — resolved 2026-09-28
The rule was wrong. Netlify bundles every v2 function with `nft` whatever `node_bundler` says, and that
ships `@netlify/blobs` fine. The one setting that did take effect, `node_bundler = "none"` on
`agent-store`, was written to obey the rule and shipped no `node_modules` at all, so the agent CMS
backend returned 502 in production. Evidence: `docs/comp-report/cr1-esbuild-blobs.md` (Mason, CR-1).
**Applied** in `bd30b53`: the override is gone, and `CLAUDE.md` and `casa-blanca.md` carry the corrected
rule. A repo rule, so Casanova's call; nothing needed from Kimani.
