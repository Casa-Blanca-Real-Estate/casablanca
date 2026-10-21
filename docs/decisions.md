# Pending decisions

Everything waiting on Kimani, across every track. **The quickest way to answer is the Casa Answer Sheet**
(https://claude.ai/artifact/AMbuGGXf2FFfszUpZtARmA), which carries all of this plus PR questions and team
feedback; Casanova records what you pick here. **Or answer inline:** open this file on GitHub, click
the pencil, replace a *type here* placeholder with your answer (a letter is enough where there are
options), and commit. Casanova folds each answer into the right design doc, logs it there, and moves
it to **Resolved** at the bottom.

**Urgency:** `Now` · `Soon` (before the named dispatch reaches it) · `Later` · `Parked` (a paused
track). **Size:** `Quick` — pick one · `Think` — needs a real look.

Last updated 2026-10-21 by Casanova (answer sheet: NB-1 to NB-10, CR-3, PP-1, AC-2/3/4/7, TD-9, TD-14).

**What blocks the next builds:** nothing. Dispatch 13 (the writer, CR-5) and Dispatch 12 (the profile
pic roster) can run now. One setting of yours unlocks more: the Jev key, for Dispatch 10's phase 2.

## Index — open

| ID | Decision | Urgency | Size | Blocks |
|---|---|---|---|---|
| D-17 | Two questions for counsel | Later | Quick (counsel) | the pilot; factor 18 |
| D-25 | The fair-housing list, and "appraisal contingency" | Soon — before agents copy writer drafts | Think (Hannah) | QA's compliance list (Dispatch 13) |
| D-26 | Moving Casa's work onto Casa-owned accounts | Later — after the comp report settles; keys sooner | Think (with Erez) | `docs/casa-accounts-transfer.md` |
| D-27 | The design port: what the handoff changes | Now — Mason builds on the defaults (Dispatch 14) | Quick (object only) | Noble's walk-through |
| D-28 | Noble's walk-through: 28 calls (NB-1 to NB-10 answered 2026-10-21; NB-11 to NB-28 open) | Soon — Phase A builds on the defaults | Quick each | Dispatches 15–24 |

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
- [x] ~~Give Casa sessions their own cloud environment.~~ Done 2026-10-13: no `DATABASE_URL` in it.
  The old one still carries it, for any track still running there. It holds MindBinder's database address, and every Casa session carries it.
- [ ] **Soon — label 30 listings for Jev's calibration** (Dispatch 10 phase 2), once Arbiter's phase 2 PR
  merges. The sheet is `docs/comp-report/jev-labels.csv`, and how to fill it in is in
  `docs/comp-report/jev-calibration.md`. It takes about 20 minutes, and Hannah could do it instead. It
  doesn't need the key: do it before any Jev output exists.
- [x] ~~Set up the dev notebook (#54).~~ Done: `DEV_NOTEBOOK_KEY` is in the Casa cloud environment and
  works (2026-10-13).
- [ ] **Now — sort the team Feedback list:** route each piece on the answer sheet (FB-1 to FB-6), and
  on the notebook page (*Team feedback*) **Make a note** on
  anything worth acting on. Sessions now read the list too (`--feedback`, without emails), so Casanova
  can propose the sort; the button is yours, because notes are.
- [ ] **Later — build the house glossary with Noble and the mentors.** The draft is ready:
  `docs/comp-report/research/glossary-draft.md`, with 152 entries and 12 questions for Noble at the top.
- [x] ~~The Jev keys.~~ Done 2026-10-21: `AI_GATEWAY_API_KEY` (Casa's Vercel team) and `CR_DECIDE_KEY` in Netlify and
  the cloud environment. Production reads them: the decide readout shows `jevKey` and `sessionKey` true, and zero
  retention on. `CR_JEV_ZDR` stays unset as long as the Vercel team is on Pro. `CR_JEV_MODE` stays off until
  Arbiter's go/no-go call passes.
- [x] ~~Change the credential in the email-signatures doc.~~ Done (Kimani, 2026-10-20).
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
- [x] ~~Noble's way in.~~ Done 2026-10-15: invited by email, signed in with a password (his Google sign-in was refused; see NB-28).
- [x] ~~The Casa account move.~~ Done 2026-10-20/21: the repo is `Casa-Blanca-Real-Estate/casablanca`, sessions run in the Casa Blanca Claude account, and the keys are on Casa accounts (the Key Maker tracks them). D-26's open questions remain below.
- [x] ~~The last of TD-14.~~ Done 2026-10-21: `CR_INSPECT_KEY` and `CR_TEST_KEY` are in the cloud environment too.
  A session confirms them in the Casa environment when Dispatch 23 items 3–4 start.
- [x] ~~Sit down with Noble (TD-9).~~ Done (Kimani, 2026-10-21). What came of it (the glossary's questions, the
  thresholds, the differences approach) isn't recorded yet: tell Casanova, or leave a dev note.
- [ ] **Soon — check whether the GitHub Pages copy of the studio is still used** (D-26 Q7). Your answer
  (2026-10-21): "Don't think so. Remind me to check." If not, it's turned off.
- [ ] **Soon — a co-op and its StreetEasy export** for the co-op sample (TD-15); **test an invite end to end** (TD-16);
  **Noble on the size-scale bands** (TD-17); **record the next walk-through** (TD-13).
- [ ] **Soon — swap the Anthropic key in Make** (TD-18). The connection "My Anthropic Claude connection" feeds
  the live **Mailchimp ISO Blast Automation** (its three Claude steps). Give it its own key from Casa's Anthropic
  workspace, update the connection, check one run, then revoke the old key.
- [x] ~~`CB_PICS_TOKEN` and `CB_CMS_TOKEN`.~~ Done 2026-10-21. Production now answers 401, not 503, for the roster and the CMS.
- [ ] **Soon — read the writer's house voice and its eval drafts** (Dispatch 13, phase 1's PR). CR-3, 2026-10-21:
  "Wait for the eval drafts first": the writer doesn't write enough yet to judge the voice; it seems fine, and it
  may not need much more than it has. The
  style file is `tools-src/comp-report/server/house-voice.ts`, quoted in the PR. `CR_EVAL_ANTHROPIC_API_KEY` is in the
  cloud environment (2026-10-21), so Mason can run the real eval in a new session (well under a dollar).
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

### D-25 · The fair-housing list, and "appraisal contingency"
`Soon — before agents copy writer drafts` · `Think — Hannah, or counsel through her`

QA's one hard block is compliance (D-2). Dispatch 13 asks for "a fixed, reviewed list" of fair-housing
terms, and nothing else. Mason drafted the list from HUD's advertising guidance and New York City's
Human Rights Law: `tools-src/comp-report/workspace/fair-housing.ts` (version `fh-2026-10-14`).

1. **The list needs a reviewer.** A term on its hard list blocks Copy outright ("adults only",
   "perfect for young professionals", "no Section 8", "school district", "safe neighborhood"). A word
   on its near list ("family", "church", "school") warns, and the agent acknowledges it before copying.
   Who reviews it: Hannah, or counsel through her? School zones are on the hard list because design
   §14 keeps them out of client copy until Hannah approves wording.
2. **"Appraisal contingency."** "Appraisal" in client copy is a hard block (§9.3), so an agent who
   writes about waiving the appraisal contingency in the next step can't copy the email. Keep that,
   or allow the phrase as a deal term?

**Answer →** _type here — who reviews the list; keep or allow "appraisal contingency"_

---

### D-28 · Noble's walk-through: the calls it raised
`Soon — Phase A (Dispatches 15–24) builds on the recommended defaults; answer to change one` · `Quick each`

Noble walked the comp report on 2026-10-15; Kimani's notes after it are 102 numbered points in
`docs/comp-report/feedback/2026-10-15-noble/00-items.md`, triaged in reports 01–07, planned in `09-plan.md`,
with the Claude Design handoff in `08-claude-design-handoff.md`. The 28 calls it needs are on the answer sheet
as **NB-1 to NB-28**, each with its context and a recommended default. The biggest:

- **NB-13:** Hubert sees the target and the agent's own number after the reveal (revisits D-4's "never").
- **NB-8 / NB-9:** whether full agents still need a note when they've tagged (revisits D-27 item 3), and
  whether tags the data settles are suggested or pre-filled.
- **NB-18 / NB-20:** what Hubert may write (propose and confirm), and whether the writer moves to Calliste.
- **NB-22 / NB-23:** sessions read production through a keyed, redacted inspection API; mentors see every
  report, read-only.
- **NB-25:** the tracks already running start Phase A now; new tracks and production keys wait for the
  Casa account.
- **NB-28:** Gmail drafts through a Casa-internal Google client (Phase B).

**What waits for your answer, not the default:** NB-1 (NW-002's relabel), NB-2 (the type model, NW-018 a) and
NB-8 (NW-046, which changes D-27's Save rule) are built only on an A answer. Dispatch 22a doesn't merge until
NB-23: deploying it lets every mentor read every report. Samples stay admin-only on the server until NB-24.
Dispatch 21 item 1 builds on NB-19 A (B moves it to Calliste). Dispatch 23 items 3–4 (the inspection and test
keys) wait on NB-22 and TD-14, and run from Casa's account only.

**Answer →** **Kimani, 2026-10-21 (answer sheet), NB-1 to NB-10.** Four differ from the defaults: NB-3, NB-4,
NB-5 and NB-9.

| NB | Item | Answer | Applied |
|---|---|---|---|
| NB-1 | NW-002, the target | A: one number, relabelled. "Might revisit after the next walk-through with Hannah, and add a range toggle. One number works for now." | Dispatch 20 builds the relabel |
| NB-2 | NW-018 a, the type model | A: condo or co-op stays the pricing basis; a type label with sponsor and HDFC flags | Dispatch 16 (#80) |
| NB-3 | NW-020 b, email photos | **B: copy them into Blobs at copy time**, served from a public unguessable route. "We'll want to hold on to these photos per listing anyway for future reference." Replaces the design of record's "linked" | phase B; the listing read keeps full image URLs |
| NB-4 | NW-012, the condition step | **B: "Well kept"**, not "Good" | Dispatch 16 (#80) |
| NB-5 | NW-028, the word for "tag" | **C: "Tags", with an ⓘ** | Dispatch 15 (#79) |
| NB-6 | NW-026, ★ and tier | A: ★ sets 1st; 2nd or ✕ clears it | Dispatch 15 (#79), as built |
| NB-7 | NW-044 b, an overridden fact | A: a fact, marked "changed", StreetEasy's value kept | Dispatch 15 (#79), as built |
| NB-8 | NW-046, note and tags | A: practice agents need both; full agents need tags, the note optional. Reverses D-27's Save rule. "Open to C (a note only when a comp has no tags): hold it as a future alternative" | Dispatch 15 (#79), as built |
| NB-9 | NW-059 b, derived tags | **C: pre-filled for full agents, suggested for practice agents**; contradictions clear themselves | Dispatches 16 (#80) and 20 |
| NB-10 | NW-045, 059, the size scale | A: Similar within ±10%; smaller or bigger 10–25%; much past 25% (house-method configuration; TD-17, Noble's word, still open) | Dispatch 16 (#80) |

NB-11 to NB-28 are still open on the sheet.

---

### D-27 · The design port: what the handoff changes
`Now — Dispatch 14 builds on these; object on the answer sheet (DP-…) before it merges` · `Quick`

Your design handoff (`docs/comp-report/design-port/`, 2026-10-14) is newer than the design of record, so
**where they differ, the handoff wins** (Casanova's reading: it's your own later design). What that
changes, as Dispatch 14 builds it:

1. **The Gate** replaces D-1's skippable call: `practice` agents can't skip and write a why of 100+
   characters; `full` agents can skip.
2. **Tier labels 1st / 2nd / ✕** replace D-20's Primary / Secondary / Excluded, held until Noble's testing.
3. **Findings locks until every comp has a tier, a note and a tag** (02-screens had nothing required on
   Sort). Tags are new: the prototype's list, at least one per comp.
4. **Co-op is in, and the default** (01-design had co-ops "next"), with no-SF hiding everywhere.
5. **The target price moves to the first modal**; D-4's rule is unchanged (Hubert sees it only after the
   neutral result; never in the email).
6. **The assistant is Hubert**, guide only.
7. **A fourth email format, Designed;** **one ★ anchor per report;** **shared-feature pickers** on the
   home and every comp; **a Done screen** with typed-in outcomes (D-19's fallback; automatic later).

**Kept from the design of record:** Buyer stays the default side (the screenshots show Seller); D-21 (Copy
waits for a headline); D-4; no invented listings from Hubert; "True estimate" on Findings only, never in
the email.

**Where the handoff left it open, Dispatch 14 built it this way** (object to any in a dev note; each is a
small change):
- **Saving a comp needs a note and a tag for every agent.** The handoff's form asks both levels; only the
  Gate's why differs by level. Save is a real disabled button until both are in.
- **A tier can't be cleared once given**, only changed (the reasons are append-only). ✕ is the way out.
- **"True estimate" is the range** (the 48px figure is low–high, as the screenshot draws it); the engine's
  point estimate is under "How this was worked out".
- **Hubert's chips that promise what he can't do were reworded** to the nearest thing he can answer (he
  never sees the agent's number or the email, can't redraft, and can't search the market): for example
  "Find more sales like X" became "Which comps are most like X?". The rest are the prototype's words.
- **The progress row locks with the CTA:** Findings until every comp has a tier, a note and a tag; Send
  until the agent has given their number or skipped.
- **Send's Full and Short are plain text** (the source of truth, which QA reads); Designed is the
  branded view of the Full draft. One edited draft at a time: editing another length starts over.
- **The Text tab keeps the disclaimer** (QA requires it), so a text runs to about 500 characters.
- **Done's first tile reads "What the sales support",** not "True estimate" (Findings only).
- **Reports' third column is headed "Side"** (the prototype's "Client" sat over Buyer/Seller; the
  client's name is under the address).
- **A co-op report counts co-op comps only** (the engine's like-for-like rule): condo comps in a co-op
  report count in nothing, and Sort and Findings say so with a one-click switch. Set the type to match
  the comps.
- **A co-op shows no per-SF figure even with a size** (the engine prices co-ops without $/sq ft), and a
  condo without a size shows none anywhere, the email and Hubert's draft lines included.

**Answer →** **Kimani, 2026-10-15 (answer sheet): all eight as built** (DP-1 to DP-8), and DP-6 adds free-text tags as well as the prototype's list. Built in #77; free-text tags go with Dispatch 13 phase 2. Mason's case for a Condo default is on the sheet (DP-9) for after Noble.

---

### D-26 · Moving Casa's work onto Casa-owned accounts
`Later — after the comp report settles (question 1 sooner)` · `Think — some are Erez's`

Erez asked for a Casa Claude account, and for the repo and services to move to Casa accounts. The plan,
inventory and problems are in `docs/casa-accounts-transfer.md`, with the claude.ai side added from the Casa
Blanca Project. Settled so far: `casacalliste@gmail.com` **stays** Casa's identity, made Casa-held
(Kimani, 2026-10-14); the Post Log **is** the caption tracker (Casanova). Still open, for you or Erez:

1. **Move the API keys first?** Anthropic, the AI Gateway (Jev) and Firecrawl process comp report data.
   Moving them to Casa accounts before the pilot widens is independent of GitHub and Claude. And make
   every new key (Jev, the writer's eval key) on a Casa account from now on.
2. **Which Claude plan Casa buys, and who's the second admin,** with enough headroom for parallel tracks.
3. **Erez's line on the two accounts:** status and planning readable from your personal Claude (through
   the repo), with client data, agents' details and comp reports kept in Casa's?
4. **The Casa desk:** move it, or keep it personal and free of work data?
5. **What stays yours** (reusable patterns, anything your contractor agreement covers)?
6. **A second owner** on the GitHub organization and each service account: who?
7. **Is the GitHub Pages copy still used?** If not, it's turned off before the move.

**Answer →** **Kimani, 2026-10-21 (answer sheet):**
- **Q2 (AC-2):** "For now, Pro for $20/mo. Will upgrade to Max 5x if weekly use demands it." No second admin
  yet; `success@casa-blanca.com` later if needed.
- **Q3 (AC-3):** A, that line: status and planning readable from the personal Claude through the repo; client
  data, agents' details and comp reports stay in Casa's account.
- **Q4 (AC-4):** "Moved already, no?" Yes: the Casa desk is in the Casa account
  (https://claude.ai/artifact/PyiLHNqBZhCyyQYZRXWZco), so it's work-only from here. The personal copy goes in
  the clean-out.
- **Q7 (AC-7):** "Don't think so. Remind me to check." On **Your actions**.

Q1 is done (the keys moved, 2026-10-21); Q5 and Q6 are still open.

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

### D-24 · Where agents' contact details come from — answered 2026-10-21
Dispatch 12's one-time roster import (about 110 agents: names, titles, emails, phones). **Kimani (PP-1): A, the
email-signatures doc, for now.** His longer view: Casa builds its own store of agent info and headshots, with
the CMS serving the whole Creative Studio, the comp report included; an Agent Character Poll on the studio,
where signed-in agents fill in their own details (possibly gating the tools behind it, decided once the poll
exists), prefilled from the signatures doc. Alternatives: a FileMaker export (he'd need a walkthrough), or
better, FileMaker's API if it has one. Already-filed photos import as **placed** (PP-2, 2026-10-15).
**Applied:** Dispatch 12 phase 2 parses the doc; the poll and FileMaker are new work, not dispatched.

### D-15 · The esbuild / `@netlify/blobs` rule — resolved 2026-09-28
The rule was wrong. Netlify bundles every v2 function with `nft` whatever `node_bundler` says, and that
ships `@netlify/blobs` fine. The one setting that did take effect, `node_bundler = "none"` on
`agent-store`, was written to obey the rule and shipped no `node_modules` at all, so the agent CMS
backend returned 502 in production. Evidence: `docs/comp-report/cr1-esbuild-blobs.md` (Mason, CR-1).
**Applied** in `bd30b53`: the override is gone, and `CLAUDE.md` and `casa-blanca.md` carry the corrected
rule. A repo rule, so Casanova's call; nothing needed from Kimani.
