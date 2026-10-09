# Pending decisions

Everything waiting on Kimani, across every track. **Answer inline:** open this file on GitHub, click
the pencil, replace a *type here* placeholder with your answer (a letter is enough where there are
options), and commit. Casanova folds each answer into the right design doc, logs it there, and moves
it to **Resolved** at the bottom.

**Urgency:** `Now` · `Soon` (before the named dispatch reaches it) · `Later` · `Parked` (a paused
track). **Size:** `Quick` — pick one · `Think` — needs a real look.

Last updated 2026-09-29 by Casanova.

**What blocks the next builds:** nothing. Dispatch 13 (the writer, CR-5) and Dispatch 12 (the profile
pic roster) can run now. Two settings of yours unlock more:
- `DEV_NOTEBOOK_KEY` in the Casa cloud environment, so sessions can read your notes and the Feedback list;
- the Jev key, which unlocks Dispatch 10's phase 2.

## Index — open

| ID | Decision | Urgency | Size | Blocks |
|---|---|---|---|---|
| D-17 | Two questions for counsel | Later | Quick (counsel) | the pilot; factor 18 |
| D-24 | Where agents' contact details come from | Soon — Dispatch 12, phase 1 | Quick | the roster's one-time import |

Answered on 2026-09-29: D-1 to D-11, D-13, D-14, D-16, D-18 to D-23. They're in **Resolved**, with where
each was applied.

## Your actions

- [x] ~~Protect Netlify's non-production deploys.~~ Done: deploy previews answer 401 (Mason, #53).
- [x] ~~Name and start the three new sessions.~~ Surveyor, Mason and Abacus, all merged.
- [x] ~~Tell Casanova which Netlify plan the site is on.~~ Credit-based.
- [x] ~~Enable Netlify Identity.~~ On, with email confirmation and Google.
- [x] ~~Set `CR_ADMIN_EMAILS`.~~ Done, and you're signed in as an admin.
- [x] ~~Finish CR-1's step 6.~~ You've tried a Gmail that's on no list. Mason confirms the refusal from
  the sign-up log and closes CR-1.
- [ ] **Now — walk the new comp report on production** (#57). Make a new comp from 100 Barclay
  #17L's link, add five comps by link and confirm them, then tier and note them on Sort. Give your
  number on Findings, then pick a headline and copy the email on Send. Leave notes with Ctrl+. as you go.
- [ ] **Soon — confirm CR-1's step 6 in Netlify's log.** Go to **Logs → Functions → identity-signup** (or
  `identity-validate`) and find one line with `"allowed":false` from your Gmail test. No session can
  read those logs.
- [ ] **Soon — skim Jev's seven questions** (wording at the end of #56's description). Phase 2 goes live
  on the reviewed text. Casanova has read them and found nothing to change.
- [ ] **Optional — brand the Google sign-in.** Google's screen says "Netlify Identity" because sign-in
  uses Netlify's default Google client. To make it say Casa Blanca, paste your Google Cloud client's
  ID and secret into Netlify → **Identity → Registration → External providers → Google**, not into
  environment variables.
- [x] ~~Delete the 11 merged branches.~~ Done. **Still to delete: `samplepics`** (D-16).
- [ ] **Soon — give Casa sessions their own cloud environment**, or take `DATABASE_URL` out of this
  one. It holds MindBinder's database address, and every Casa session carries it.
- [ ] **Soon — a Jev key for Casa, from your existing Vercel account.** Dispatch 10's phase 2 waits on it.
  1. **After Arbiter's zero-retention switch merges,** create a new AI Gateway API key on the account
     MindBinder uses. It draws on the same $25 of credits, which at Jev's price is effectively forever.
  2. **In Netlify, add `AI_GATEWAY_API_KEY`** (Functions scope) **and `CR_JEV_ZDR=off`**, then redeploy.
     Leave `CR_JEV_MODE` alone: Arbiter turns it on after the go/no-go call.
  3. **Tell Arbiter it's in.** Don't paste the key into a chat.
  - **Pro later, for two reasons.** Vercel's free plan is for non-commercial use, which is your call
    for now. And zero retention needs Pro, before Jev reads anything an agent or client wrote.
- [ ] **Later — label about 30 listings for Jev's calibration** (Dispatch 10 phase 2). Arbiter commits
  the sheet; filling it in takes about 20 minutes. Hannah could do it instead.
- [ ] **Now — set up the dev notebook** (#54): add `creative@email.casa-blanca.com` to
  `CR_ADMIN_EMAILS` (keep `casacalliste@gmail.com`), redeploy, sign in at `/tools/dev-notebook/`, make a
  key, and add it as `DEV_NOTEBOOK_KEY` in the Claude Code cloud environment.
- [ ] **Later — build the house glossary with Noble and the mentors.** The draft is ready:
  `docs/comp-report/research/glossary-draft.md`, with 152 entries and 12 questions for Noble at the top.
- [ ] **Now — two settings, both quick:**
  1. **`DEV_NOTEBOOK_KEY` in the Casa Claude Code cloud environment.** It's still missing, so no
     session can read your notes or the Feedback list. That includes the Cowork session's feedback,
     which is unread until this is in.
  2. **Jev:** the zero-retention switch is merged (#61). Make a new AI Gateway key on your existing
     Vercel account. In Netlify (Functions scope), set `AI_GATEWAY_API_KEY` to it and `CR_JEV_ZDR=off`,
     then redeploy. Leave `CR_JEV_MODE` alone.
- [ ] **Soon — change the credential in the email-signatures doc.** The profile-pic session flagged it
  to you directly.
- [ ] **Later — for Noble, the thresholds that flag most comps:**
  - the floor band (±3, from Frankie's email) flags 8 of Hannah's 11 comps;
  - Kara's ½ mile flags 6 of the sample's 11, five of them Primary.

  Noble sets them, or confirms them.
- [ ] **Later — show Noble the "differences between comps" approach** (design §6.6). It replaces
  house adjustment values with what the comps themselves show, and it builds on his point that prices
  already carry their features.
- [ ] **Queued behind the comp report — when you want them back:**
  - **The Stories motion-graphic generator,** for Instagram Stories: parked on
    `claude/motion-graphic-stories-hlpirk` (`docs/parked/`). It's a Vite-built React prototype to port
    into the studio.
  - **The agent CMS and agent sites:**
    - Slice 5 (SEO and Google reviews) is ready to dispatch.
    - Slices 2–3 (the visual port) wait on your Wix capture.
    - The CMS holds 1 agent of about 110; Dispatch 12 seeds the roster.
    - Yours: Sam Valk's bio and neighborhoods, and confirming the production origin.
  - **The QR generator:** merge it when there's a gap (D-16).
  - **Your caption tracker** (a Claude artifact, linked from the carousel builders): it may become part
    of the studio later.
- [ ] **Parked — profile pic:** 3–5 hard portraits for the Phase 1 re-cut, then the outpaint key.

---

## Open

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

---

### D-24 · Where agents' contact details come from
`Soon — before Dispatch 12 seeds the roster` · `Quick`

Dispatch 12 imports the roster once: about 110 agents, with names, titles, emails and phones. Is the
email-signatures Google Doc the authority for those, or is there a system of record behind it, such
as FileMaker, that the import should read instead? The session found duplicates, likely typos and
gaps in the doc, so the answer decides between parsing a doc and doing a proper export.

**Answer →** _type here — the doc, FileMaker, or something else_

---

## Resolved

### Answered by Kimani, 2026-09-29 — applied in design v0.5 (`01-design.md`) and `02-screens.md`

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
| D-12 | The MindBinder Jev handoff | Kimani had a MindBinder session package it instead of adding the repo. In: `docs/comp-report/sources/jev/` | Dispatch 10 |
| D-16 | Branches | "QR: merge later, stories: park, samplepics: delete. Otherwise done i think." The 11 merged ones are deleted; `samplepics` is Kimani's to delete; the QR generator waits for a small dispatch | `docs/parked/` |
| D-20 | Tier labels agents see | "Hold on A for now, we'll revisit later." Primary / Secondary / Excluded | `02-screens.md` |
| D-21 | A headline before the email can be copied | "Sure, A. We'll revisit once we start testing with Noble properly and other agents after that." | `02-screens.md` Send; §10.2 |
| D-22 | Where the client's name is asked | "A, the new comp modal. Should be asked at the earliest point we can make sense of, alongside buyer or seller." | `02-screens.md` The home |
| D-23 | "Didn't sell" as a fourth group | "Sure, yeah A." | §6.3; Dispatch 08 phase 2 |

### D-15 · The esbuild / `@netlify/blobs` rule — resolved 2026-09-28
The rule was wrong. Netlify bundles every v2 function with `nft` whatever `node_bundler` says, and that
ships `@netlify/blobs` fine. The one setting that did take effect, `node_bundler = "none"` on
`agent-store`, was written to obey the rule and shipped no `node_modules` at all, so the agent CMS
backend returned 502 in production. Evidence: `docs/comp-report/cr1-esbuild-blobs.md` (Mason, CR-1).
**Applied** in `bd30b53`: the override is gone, and `CLAUDE.md` and `casa-blanca.md` carry the corrected
rule. A repo rule, so Casanova's call; nothing needed from Kimani.
