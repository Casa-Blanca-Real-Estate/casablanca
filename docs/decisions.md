# Pending decisions

Everything waiting on Kimani, across every track. **Answer inline:** open this file on GitHub, click
the pencil, replace a *type here* placeholder with your answer (a letter is enough where there are
options), and commit. Casanova folds each answer into the right design doc, logs it there, and moves
it to **Resolved** at the bottom.

**Urgency:** `Now` · `Soon` (before the named dispatch reaches it) · `Later` · `Parked` (a paused
track). **Size:** `Quick` — pick one · `Think` — needs a real look.

Last updated 2026-09-24 by Casanova.

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
| D-15 | The esbuild / `@netlify/blobs` rule | Later | Quick | after CR-1's findings |
| D-16 | Unmerged branches | Later | Quick | — |

## Your actions

- [ ] **Now — protect Netlify's non-production deploys.** Old deploy previews
  (`deploy-preview-N--casa-blanca-creative-studio.netlify.app`, numbered by PR, so guessable) still
  serve the internal docs from before the 404 fix. Site configuration → access and security →
  password-protect or restrict non-production deploys.
- [ ] **Now — name and start the three new sessions**, pasting in Dispatches 04, 05 and 06. Proposed
  names are in `docs/dispatch/README.md`; rename freely.
- [ ] **Soon, blocks CR-1 — tell Casanova which Netlify plan the site is on.** Netlify Database needs a
  credit-based plan.
- [ ] **Soon, blocks CR-1 — enable Netlify Identity** on the site.
- [ ] **Soon, blocks CR-1 — create a Google OAuth client** for Identity's Google provider, so the
  sign-in screen says Casa Blanca. Its client ID and secret go into Identity's settings.
- [ ] **Soon — get Casa its own Jev account.** Early access is invite-only; your access is through
  MindBinder. The tool falls back to Claude Haiku until then.
- [ ] **Later — build the house glossary with Noble and the mentors.** Official definitions for
  mortgage payment, interest-only payment, monthly carry, ownership carrying cost and the rest, so the
  tool and every agent use each term one way. CR-R will produce a draft to start from.
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
three.

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

### D-15 · The esbuild / `@netlify/blobs` rule
`Later — after CR-1's findings` · `Quick`

`CLAUDE.md` says functions using `@netlify/blobs` must not be bundled with esbuild, but `netlify.toml`
bundles everything with esbuild, and three daily-use functions import blobs and apparently work. CR-1 is
investigating. When its findings land, this becomes: correct the rule, or fix the three functions.

**Answer →** _wait for CR-1's findings_

### D-16 · Unmerged branches
`Later` · `Quick`

Ten remote branches are already merged into `claude/main` and can be deleted. Three aren't merged and have
no PR: `claude/qr-code-generator-nva8xf` (a QR code generator, July), `claude/motion-graphic-stories-hlpirk`
(the React spike CR-1 builds on — keep it), and `samplepics` (an upload branch, August).

- **A — Delete the ten merged; keep the React spike; you decide on the QR generator and `samplepics`.**
- **B — Leave everything.**

**Answer →** _type here_

---

## Resolved

_Nothing yet — answered decisions move here with the date and where they were applied._
