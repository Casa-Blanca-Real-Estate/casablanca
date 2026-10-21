# Dispatches — protocol and session roster

A **dispatch** is a scoped brief that hands one piece of work to one Claude Code session. The file in
this folder is authoritative; Kimani pastes a short kickoff into the new session that points here.

## The rules — every dispatched session follows these

1. **Read first:** `/CLAUDE.md`, your dispatch file in full, and every design section it cites.
2. **Work on the branch your session is given.** Base it on `claude/main`.
3. **Open a pull request to `claude/main` when you finish** — and at each phase boundary if the
   dispatch has phases. Don't sit on finished work.
4. **Never merge.** Only **Casanova** or **Kimani** merges. The single exception is Kimani telling your
   session directly to merge something — say so in the PR when that happens.
   A merge isn't a release either: production publishes from `release`, which Casanova or Kimani moves
   with the `release to production` workflow. Never run it from a dispatch — each production deploy
   is metered. Check your work on the deploy preview, which is free.
5. **Sign your work with your session name** — at the end of every PR description and every PR comment
   (`— Mason (CR-1)`), and in the body of your commits. The platform's own attribution lines still
   apply alongside it.
6. **PR descriptions cover:** what you did; how you verified it (commands and results); what's left;
   what you decided versus what you deferred; questions for Casanova or Kimani; anything in the dispatch
   that turned out to be the wrong shape, and what you'd do instead.
7. **Don't block on Kimani mid-phase.** He works Casa in blocks, three days a week. Bank the work,
   open the PR, and list exactly what's waiting on him.
8. **Stay in your lane.** If you need something inside another dispatch's scope, say so in your PR
   rather than doing it.
9. **Anything internal-only at a new path goes on the forced-404 list** in `netlify.toml` —
   `publish = "."` serves the whole repo root to the public web (`/CLAUDE.md`).
10. **Keep your roster entry current** through your PR — never by pushing to `claude/main` directly.
11. **Mark your line on the Dispatch Ledger.** The ledger (https://claude.ai/artifact/HR14yufem1YH1TxqqiWksA) has
    one line per kickoff, and your kickoff names its id (`casa-r6-1`, say). When your PR opens, use the
    `ArtifactData` tool:
    1. `get` the line from collection `dispatches`;
    2. `update` it with the version you read as `if_version`, and data
       `{"status": "delivered", "pr": <n>, "updatedBy": "<your name>"}`.

    If your session has no `ArtifactData` tool, say so in the PR and Casanova marks it. Casanova marks
    lines landed when it merges. **Follow-up lines** (code `FU·<pr>`: work a merge comment left you) work
    the same way: the message Kimani passes you names the line's id.

## Restarting a track in a new session

A track's state lives in the repo, not in a session: its dispatch file, its roster row, its PRs and
their comments. So a track restarts in a new session (a new cloud environment, say) with one kickoff:

> You're **<name>**, continuing a Casa Blanca Creative Studio track. Read `/CLAUDE.md`, then
> `docs/dispatch/README.md` (your roster row says where you are), then your dispatch file in full, then
> your latest PR and its comments. Carry on from what's next there. Sign as "— <name> (<code>)".

Casanova restarts the same way, reading `docs/dispatch/casanova.md` (its runbook and the latest handoff),
`docs/decisions.md` and the open PRs as well.

## How Casanova writes a dispatch

Each dispatch opens with: its number and title, **dispatched by** (session name and date), **to**
(session name), the design sections it builds from, and what it depends on. It ends with a definition of
done. It carries the rules above by reference, and restates rules 3–5 so no kickoff can drop them.

**Every kickoff goes on the Dispatch Ledger** (https://claude.ai/artifact/HR14yufem1YH1TxqqiWksA) as a line, in
the round it goes out with. The kickoff names the line's id, and the line holds the kickoff text to
copy.
- **The ledger is shared with MindBinder's overseer, Big Kahuna.** Casa lines carry `"project": "casa"`
  and ids that start `casa-`; round notes are `casa-r<n>` in `rounds`.
- **Never write or change a line without those,** and never touch a MindBinder line.

## Session roster

Kimani names sessions. A persistent session keeps its name across dispatches, so context and
accountability travel with it. Surveyor, Mason and Abacus were confirmed by Kimani on 2026-09-28
(he may rename one or two later). Arbiter (Dispatch 10) started 2026-09-29.

| Name | Role | Dispatches | Status |
|---|---|---|---|
| **Casanova** | Overseer — plans, writes dispatches, reviews and merges, keeps repo context current | — | Active. From 2026-10-21 a Claude Code project session in the Casa Blanca account |
| **Casakwassa** | Planning and setup: ideas, plans, accounts and keys with Kimani, repo docs. Builds nothing, merges nothing | — | Active from 2026-10-21 (was the Casa account's first Casanova). Runbook `casakwassa.md` |
| **Surveyor** | Research — the evidence behind the comp report's adjustments and glossary | 04 (CR-R); next 17 (CR-R2) | 04: done, merged #49; handoff #69; the glossary brought up to design v0.5.1 in #70. Next: 17, StreetEasy's lists and the subway. Evidence for "the differences between comps" stays undispatched |
| **Mason** | Foundations — the comp report's scaffold, build, auth, database, streaming | 05 (CR-1), 07 (CR-3a), 09 (CR-3b), 11 (CR-3c), 13 (CR-5), 14 (CR-6); next 15, 18, 20, 21, 22, 23 (CR-7a–f) | 05: merged #48, #52; CR-1.1 item 3 merged in #57; the step-6 proof is Kimani's (Netlify's function log). 07: done, #53. 09: done, #57, #60. 11: done, #62. Handoff #65. 13: phase 1 merged #76; its production check and the real eval wait on Kimani; phase 2 after 14. 14: done, merged #77. Next: 15 (with 16 and 17), then 18, 22a, 23 items 1–2, 20, 21, 22b, 23 items 3–4 — the Noble walk-through, `docs/comp-report/feedback/2026-10-15-noble/09-plan.md`. Dev notebook and the Feedback list closed: #54 |
| **Abacus** | The comp report's calculation engine and parser | 06 (CR-2), 08 (CR-2.2); next 16 (CR-2.3), 19 (CR-2.4) | 06: done, merged #50, #51. 08: done, merged #55, #58. Handoff #66; `distance_miles` on `CompOut` merged #68 (engine 0.4.1). Next: 16, then 19 |
| **Arbiter** | The comp report's decision provider: Jev, with a Haiku fallback | 10 (CR-D) | 10: phase 1, follow-ups and the zero-retention switch merged #56, #59, #61. Handoff #64. Phase 2's pre-live build merged #75; the live run waits on Kimani's keys and the labels sheet |
| **Calliste** (named by Kimani 2026-10-15; not started) | Hubert and all the comp report's AI work: what Hubert can see and do, by role; voice, prompts, evals | 24 (CR-H1) | Waits on the move to the Casa account. Kickoff on the ledger, `casa-r13-10` |
| **Painter** (was the Dispatch 01 session; named by Kimani 2026-10-14) | Visual tools: photo and video features, manipulation and tooling. Today the profile pics: the cutout, outpainting, and the roster and store | 01, 12 | 01: parked; #41's fixes await Casanova's re-review. Handoff #67. 12: phase 1 (the roster and the record) merged #71; phase 2 after `CB_PICS_TOKEN` and D-24 |
| **Concierge** (named by Kimani 2026-10-14; not started) | Agent sites and the agent CMS: Slices 2–3 (once the Wix capture exists) and 5, agent-record fields such as Instagram handles | 02, 03 (as built) | Held. Restart kickoff in `docs/parked/sessions/agent-cms.md` (#72); ledger `casa-r9-1` |
| **Publisher** (named by Kimani 2026-10-14; not started) | The post builders (Closed, In Contract, For Sale, Listing, Editorial), the StreetEasy import, captions | — | Held. Kickoff on the ledger, `casa-r9-2`; notes in `docs/parked/sessions/editorial-builder.md` (#73) |
| *Retired 2026-10-14* | The Dispatch 02 and 03 sessions, the Editorial builder, the motion graphic generator, and five one-off sessions | 02, 03 | Final notes in `docs/parked/sessions/` (#72–#74) |

## Dispatch index

| # | Dispatch | To | State |
|---|---|---|---|
| 01 | [Profile Pic Generator — cutout quality + torso outpainting](01-profile-pic-cutout-and-outpaint.md) | Painter | **Parked.** Stack #41–#45. #41's fixes (2026-10-06) await Casanova's re-review; #45 has a conflict |
| 02 | [Agent sites, Slice 0 — data model + build hardening](02-agent-sites-foundations.md) | retired session; Concierge next | Done — merged #46 |
| 03 | [Agent sites, Slice 4 — the CMS](03-agent-cms.md) | retired session; Concierge next | Done — merged #47 |
| 04 | [Comp report — adjustment research (CR-R)](04-comp-report-research.md) | Surveyor | Done — merged #49 |
| 05 | [Comp report — foundations (CR-1)](05-comp-report-foundations.md) | Mason | Merged #48, #52, and CR-1.1 item 3 in #57. Step 6: Kimani confirms the refusal in Netlify's function log |
| 06 | [Comp report — engine and parser (CR-2)](06-comp-report-engine.md) | Abacus | Done — merged #50, #51 |
| 07 | [Comp report — the walkthrough scaffold (CR-3a)](07-comp-report-walkthrough-scaffold.md) | Mason | Done — merged #53 |
| 08 | [Comp report — the engine for a buyer's argument (CR-2.2)](08-comp-report-buyers-argument-engine.md) | Abacus | Done — merged #55, #58 |
| 09 | [Comp report — the first-class start, and the screens (CR-3b)](09-comp-report-first-class-start.md) | Mason | Done — merged #57 (phases 1–2), #60 (phase 3) |
| 10 | [Comp report — the decision provider, Jev first (CR-D)](10-comp-report-decision-provider.md) | Arbiter | Phase 1, follow-ups and the zero-retention switch merged #56, #59, #61; phase 2's pre-live build merged #75. The live run waits on Kimani's keys and the labels sheet |
| 11 | [Comp report — distance, from coordinates (CR-3c)](11-comp-report-distance.md) | Mason | Done — merged #62 |
| 12 | [Profile pics — the roster, the store and the email signature](12-profile-pic-tracker.md) | Painter | Phase 1 merged #71. Phase 2 after `CB_PICS_TOKEN` and D-24 |
| 13 | [Comp report — the writer and QA (CR-5)](13-comp-report-writer-and-qa.md) | Mason | Phase 1 merged #76. Its production check and the real eval wait on Kimani; phase 2 next |
| 14 | [Comp report — the design port, for Noble (CR-6)](14-comp-report-design-port.md) | Mason | Done — merged #77. Follow-ups listed at the end of the dispatch |
| 15 | [Comp report — Sort, as it stands (CR-7a)](15-comp-report-sort-as-it-stands.md) | Mason | Ready — ledger `casa-r13-1`. Runs with 16 and 17 |
| 16 | [Comp report — the listing read and the home's vocabulary (CR-2.3)](16-comp-report-listing-read-and-vocabulary.md) | Abacus | Ready — ledger `casa-r13-2`. Runs with 15 and 17 |
| 17 | [Comp report — StreetEasy's lists, and the subway (CR-R2)](17-comp-report-streeteasy-lists-and-subway.md) | Surveyor | Ready — ledger `casa-r13-3`. Runs with 15 and 16 |
| 18 | [Comp report — Send and Done (CR-7b)](18-comp-report-send-and-done.md) | Mason | Queued behind 15 — ledger `casa-r13-4` |
| 19 | [Comp report — the engine for Findings (CR-2.4)](19-comp-report-engine-for-findings.md) | Abacus | Queued behind 15 and 16 — ledger `casa-r13-5` |
| 20 | [Comp report — the new report and the home, filled from the read (CR-7c)](20-comp-report-new-report-from-the-read.md) | Mason | Queued behind 16 and 18 — ledger `casa-r13-6` |
| 21 | [Comp report — Findings, with whose target and the client's facts (CR-7d)](21-comp-report-findings-target-and-client.md) | Mason | Queued behind 19 and 20 — ledger `casa-r13-7` |
| 22 | [Comp report — who sees what, the sign-in log and the activity log (CR-7e)](22-comp-report-access-and-activity-log.md) | Mason, or a second builder | Two PRs: 22a after 18 (held for merge until NB-23), 22b after 21 — ledger `casa-r13-8`; replaces `casa-r12-2` |
| 23 | [Comp report — samples that reset, and reading production safely (CR-7f)](23-comp-report-samples-and-inspection.md) | Mason, or a second builder | Two PRs: items 1–2 after 22a, any account; items 3–4 from the Casa account after 22b, NB-22 and TD-14 — ledger `casa-r13-9` |
| 24 | [Calliste — Hubert sees what the agent sees (CR-H1)](24-calliste-hubert-sees-what-the-agent-sees.md) | Calliste (new) | Waits on the move to the Casa account; item 1 after 21, `messages.ts` after 22a — ledger `casa-r13-10` |
