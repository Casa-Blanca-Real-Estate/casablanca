# Pending decisions

Everything waiting on Kimani, across every track. **Answer inline:** open this file on GitHub, click
the pencil, replace a *type here* placeholder with your answer (a letter is enough where there are
options), and commit. Casanova folds each answer into the right design doc, logs it there, and moves
it to **Resolved** at the bottom.

**Urgency:** `Now` · `Soon` (before the named dispatch reaches it) · `Later` · `Parked` (a paused
track). **Size:** `Quick` — pick one · `Think` — needs a real look.

Last updated 2026-09-29 by Casanova.

**What blocks the next builds:** nothing. Dispatches 08 (Abacus) and 09 (Mason) can start now. D-20
to D-23 are quick screen questions for Mason's second phase; D-12 is needed before Jev goes in.

## Index — open

| ID | Decision | Urgency | Size | Blocks |
|---|---|---|---|---|
| D-12 | The MindBinder Jev handoff | Soon | Quick | Jev in the tool |
| D-16 | Branches: delete, merge or park | Soon | Quick | — |
| D-17 | Two questions for counsel | Later | Quick (counsel) | the pilot; factor 18 |
| D-20 | Tier labels agents see | Soon | Quick | Dispatch 09, phase 2 |
| D-21 | A headline before the email can be copied | Soon | Quick | Dispatch 09, phase 2 |
| D-22 | Where the client's name is asked | Soon | Quick | Dispatch 09, phase 1 |
| D-23 | "Didn't sell" as a fourth group in v1 | Soon | Quick | Dispatches 08 and 09 |

Answered on 2026-09-29: D-1 to D-11, D-13, D-14, D-18 and D-19. They're in **Resolved**, with where
each was applied.

## Your actions

- [x] ~~Protect Netlify's non-production deploys.~~ Done: deploy previews answer 401 (Mason, #53).
- [x] ~~Name and start the three new sessions.~~ Surveyor, Mason and Abacus, all merged.
- [x] ~~Tell Casanova which Netlify plan the site is on.~~ Credit-based.
- [x] ~~Enable Netlify Identity.~~ On, with email confirmation and Google.
- [x] ~~Set `CR_ADMIN_EMAILS`.~~ Done, and you're signed in as an admin.
- [ ] **Soon — finish CR-1's step 6.** Sign in with a Gmail that's on no list, and check that it's
  refused. It can't be the Gmail you use now, since that one is an admin.
- [ ] **Optional — brand the Google sign-in.** Google's screen says "Netlify Identity" because sign-in
  uses Netlify's default Google client. To make it say Casa Blanca, paste your Google Cloud client's
  ID and secret into Netlify → **Identity → Registration → External providers → Google**, not into
  environment variables.
- [ ] **Soon — delete the 11 merged branches** (D-16). This session can't delete branches.
- [ ] **Soon — give Casa sessions their own cloud environment**, or take `DATABASE_URL` out of this
  one. It holds MindBinder's database address, and every Casa session carries it.
- [ ] **Soon — get Casa its own Jev account**, and send the handoff request to a MindBinder session
  (D-12).
- [ ] **Later — build the house glossary with Noble and the mentors.** The draft is ready:
  `docs/comp-report/research/glossary-draft.md`, with 152 entries and 12 questions for Noble at the top.
- [ ] **Later — show Noble the "differences between comps" approach** (design §6.6). It replaces
  house adjustment values with what the comps themselves show, and it builds on his point that prices
  already carry their features.
- [ ] **Parked — agent sites:** Sam Valk's bio and neighborhoods; confirm the production origin.
- [ ] **Parked — profile pic:** 3–5 hard portraits for the Phase 1 re-cut, then the outpaint key.

---

## Open

### D-12 · The MindBinder Jev handoff
`Soon — before Jev goes in` · `Quick`

You'd rather have a MindBinder session package what we need than add the repo here. **What to ask
it for is in `docs/comp-report/jev-handoff-request.md`**: paste that file into a Claude Code
session in the MindBinder repo, and commit what it produces to `docs/comp-report/sources/` here.
Until then the tool uses its fallback (Claude Haiku) for judgments.

**Answer →** _type here — when the package is in_

### D-16 · Branches: delete, merge or park
`Soon` · `Quick`

**The 11 merged branches** are finished and safe to delete, but this session's git access can't
delete branches (the push is refused). Delete them on GitHub → Branches:
- `claude/agent-multi-property-mode-bxngmf`
- `claude/charming-brown-4crlrj`
- `claude/claw-design-pass-port-qgpebf`
- `claude/claw-review-fixes-qgpebf`
- `claude/creative-studio-redesign-prep-9kqfjq`
- `claude/jolly-shannon-b6j14l`
- `claude/keen-fermi-ir6w9h`
- `claude/laughing-newton-f96x9t`
- `claude/nice-bohr-nj42vw`
- `claude/serene-wescoff-b187c3`
- `claude/stoic-goldberg-5foen5`

To stop this piling up, turn on GitHub → Settings → General → **Automatically delete head branches**.

**What isn't merged, and what it needs:**

| Branch | What it is | What's left | Recommendation |
|---|---|---|---|
| `claude/qr-code-generator-nva8xf` | A finished QR code generator (July): links, vCards, email, phone, text; on-brand styling; PNG to 4096 px and SVG; its own encoder, no dependencies | Its dashboard entry was written for the dashboard before the August redesign, so it needs porting to the new tool list and a test pass. Its encoder is a separate `qr-core.js`, which the single-file rule would inline. About one short session | **Finish and merge**, as a small dispatch once the comp report's next builds are moving |
| `claude/motion-graphic-stories-hlpirk` | A Story motion builder prototype (August), plus the React spike CR-1 has since absorbed | It's a prototype, so it needs a review to say how far it is | **Park** |
| `samplepics` | Four StreetEasy listing photos uploaded in August | Nothing; they're test images and StreetEasy's photos | **Delete** |
| `claude/kind-heisenberg-ujrdup` (+ `-p2` to `-p5`) | The profile pic stack, #41–#45 | Parked (Dispatch 01): #41 has changes requested, then the rest need review | **Stay parked** |

**Answer →** _type here — e.g. "QR: merge later, stories: park, samplepics: delete"_

### D-17 · Two questions for counsel
`Later — (1) before the pilot, (2) before factor 18 gets a value` · `Quick — forward to counsel or a closing attorney`

CR-R (Surveyor) found two legal questions research can't settle. Both are in
`docs/comp-report/research/adjustments.md`, with sources.

1. **Is a CMA an "appraisal" under New York law?** Executive Law §160-a defines appraisal broadly. The
   Department of State's appraiser FAQ and the §160-jjjj(3) carve-out come close to excluding a
   comparative market analysis by a licensed agent, but no DOS page says so outright. The disclaimer
   (D-13, approved) says it isn't one.
2. **Sponsor sales: does transfer tax the buyer pays count toward the taxable consideration?** A NYC law
   firm says it raises it; the TP-584 instructions say it's excluded. This only matters if the tool
   ever computes the sponsor arithmetic (factor 18).

**Answer →** _type here — who it went to, or their answer_

### D-20 · Tier labels agents see
`Soon — Dispatch 09, phase 2` · `Quick`

The engine sorts comps into primary, secondary and excluded. Agents could see those words, or plainer
ones.

- **A — Primary / Secondary / Excluded.** The engine's words, and the glossary's.
- **B — Counts / Context / Leave out.** Says what each does.

**Recommendation: B**, with the engine's words in the glossary and the analyst view.

**Answer →** _type here_

### D-21 · A headline before the email can be copied
`Soon — Dispatch 09, phase 2` · `Quick`

Noble's goal is a one-sentence headline. Should the Send screen require one before the email can be
copied?

- **A — Required.** The drafts make it one click for anyone in a hurry.
- **B — Optional.** Encouraged, not required.

**Recommendation: A.** It's the point of the report, and the drafts keep it cheap.

**Answer →** _type here_

### D-22 · Where the client's name is asked
`Soon — Dispatch 09, phase 1` · `Quick`

- **A — In the new-comp modal**, beside buyer or seller. It's used in the email greeting.
- **B — Only on Send.**

**Recommendation: A**, optional.

**Answer →** _type here_

### D-23 · "Didn't sell" as a fourth group in v1
`Soon — Dispatches 08 and 09` · `Quick`

Frankie lists the building's listings that came off the market unsold ("on the market for $635K and
never sold") as evidence of a ceiling. The tool can show them as their own group, never mixed with
sales or live asks. They come from a StreetEasy link's listing history; the export doesn't carry
them.

- **A — Yes, in v1.**
- **B — Later.**

**Recommendation: A.**

**Answer →** _type here_

---

## Resolved

### Answered by Kimani, 2026-09-29 — applied in design v0.5 (`01-design.md`)

| ID | Decision | Answer | Applied |
|---|---|---|---|
| D-1 | When the agent gives their call | "Agreed, C." Before the reveal, skippable | §3, §3.1; `02-screens.md` Findings |
| D-2 | Compliance as the only hard block in QA | "Sure A, for now." | §9 |
| D-3 | How agent estimates are worded for clients | "Agreed, A." "agent's estimate" | §9.5 |
| D-4 | When the assistant first sees a target price | "Yes A." Hidden until the neutral result exists | §8.5; Findings |
| D-5 | How much the tool coaches versus drafts | "A. We'll loosen it over time by the count of the user's comps in the tool." | §8.3 rule 9 |
| D-6 | When to ask what kind of argument they want | "Yep, A." Only when ambiguous | §8.3 rule 10 |
| D-7 | The client profile's dimensions | "Agreed, B now, A later." | §8.6 |
| D-8 | Voice samples: attestation and visibility | "Attestation is good, and mentors/admins should be able to see an agent's samples and style profile." | §8.7 |
| D-9 | Keeping property records across agents | "A." Kept and suggested across agents | §12, §14 |
| D-10 | Deal-terms modules in v1 | "B." Buyer traditional purchase and seller pricing | §6.7 |
| D-11 | The training gate's rules | "1. We'll gate it to their first 5 actual deals. Once they close their 5th and graduate out of mentorship, they'll unlock the tool in full. 2. Either. 3. Both. 4. Yes." | §11 |
| D-13 | Disclaimer wording | "Approved." | §14 |
| D-14 | When to research interaction magnitudes | "Might not be necessary anymore" (Noble: prices already carry features). Closed: no magnitude research; the interaction map stays as structure | §6.6 |
| D-18 | Order and compounding of adjustments | Kimani asked how adjustments come from comps, and for a way to see how much two similar listings differ in price and why, for buyers above all. Replaced by "the differences between comps" | §6.6 |
| D-19 | Recording each report's outcome | "Yes B." Automatic first, a one-tap ask second, never a block | §12 |

### D-15 · The esbuild / `@netlify/blobs` rule — resolved 2026-09-28
The rule was wrong. Netlify bundles every v2 function with `nft` whatever `node_bundler` says, and that
ships `@netlify/blobs` fine. The one setting that did take effect, `node_bundler = "none"` on
`agent-store`, was written to obey the rule and shipped no `node_modules` at all, so the agent CMS
backend returned 502 in production. Evidence: `docs/comp-report/cr1-esbuild-blobs.md` (Mason, CR-1).
**Applied** in `bd30b53`: the override is gone, and `CLAUDE.md` and `casa-blanca.md` carry the corrected
rule. A repo rule, so Casanova's call; nothing needed from Kimani.
