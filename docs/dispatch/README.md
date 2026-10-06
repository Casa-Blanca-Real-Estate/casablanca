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

## Restarting a track in a new session

A track's state lives in the repo, not in a session: its dispatch file, its roster row, its PRs and
their comments. So a track restarts in a new session (a new cloud environment, say) with one kickoff:

> You're **<name>**, continuing a Casa Blanca Creative Studio track. Read `/CLAUDE.md`, then
> `docs/dispatch/README.md` (your roster row says where you are), then your dispatch file in full, then
> your latest PR and its comments. Carry on from what's next there. Sign as "— <name> (<code>)".

Casanova restarts the same way, reading `docs/decisions.md` and the open PRs as well.

## How Casanova writes a dispatch

Each dispatch opens with: its number and title, **dispatched by** (session name and date), **to**
(session name), the design sections it builds from, and what it depends on. It ends with a definition of
done. It carries the rules above by reference, and restates rules 3–5 so no kickoff can drop them.

## Session roster

Kimani names sessions. A persistent session keeps its name across dispatches, so context and
accountability travel with it. Surveyor, Mason and Abacus were confirmed by Kimani on 2026-09-28
(he may rename one or two later). Arbiter (Dispatch 10) started 2026-09-29.

| Name | Role | Dispatches | Status |
|---|---|---|---|
| **Casanova** | Overseer — plans, writes dispatches, reviews and merges, keeps repo context current | — | Active |
| **Surveyor** | Research — the evidence behind the comp report's adjustments and glossary | 04 (CR-R) | Done — merged #49 |
| **Mason** | Foundations — the comp report's scaffold, build, auth, database, streaming | 05 (CR-1), 07 (CR-3a), 09 (CR-3b) | 05: merged #48, #52; CR-1.1 item 3 merged in #57; the step-6 proof is Kimani's (Netlify's function log). 07: done, merged #53. 09: phases 1 and 2 merged #57; phase 3 next. Dev notebook and the Feedback list closed: merged #54 |
| **Abacus** | The comp report's calculation engine and parser | 06 (CR-2), 08 (CR-2.2) | 06: done, merged #50, #51. 08: done, merged #55, #58 |
| **Arbiter** | The comp report's decision provider: Jev, with a Haiku fallback | 10 (CR-D) | 10: phase 1 merged #56; follow-ups next; phase 2 waits on Casa's Gateway key |
| *unnamed* (`claude/kind-heisenberg-ujrdup`) | Profile pic cutout and outpainting | 01 | Parked — PR stack #41–#45 open |
| *unnamed* (`claude/jolly-shannon-b6j14l`) | Agent sites foundations | 02 | Done — merged #46 |
| *unnamed* (`claude/laughing-newton-f96x9t`) | Agent CMS | 03 | Done — merged #47 |

## Dispatch index

| # | Dispatch | To | State |
|---|---|---|---|
| 01 | [Profile Pic Generator — cutout quality + torso outpainting](01-profile-pic-cutout-and-outpaint.md) | unnamed | Parked |
| 02 | [Agent sites, Slice 0 — data model + build hardening](02-agent-sites-foundations.md) | unnamed | Done |
| 03 | [Agent sites, Slice 4 — the CMS](03-agent-cms.md) | unnamed | Done |
| 04 | [Comp report — adjustment research (CR-R)](04-comp-report-research.md) | Surveyor | Done — merged #49 |
| 05 | [Comp report — foundations (CR-1)](05-comp-report-foundations.md) | Mason | Merged #48, #52, and CR-1.1 item 3 in #57. Step 6: Kimani confirms the refusal in Netlify's function log |
| 06 | [Comp report — engine and parser (CR-2)](06-comp-report-engine.md) | Abacus | Done — merged #50, #51 |
| 07 | [Comp report — the walkthrough scaffold (CR-3a)](07-comp-report-walkthrough-scaffold.md) | Mason | Done — merged #53 |
| 08 | [Comp report — the engine for a buyer's argument (CR-2.2)](08-comp-report-buyers-argument-engine.md) | Abacus | Done — merged #55, #58 |
| 09 | [Comp report — the first-class start, and the screens (CR-3b)](09-comp-report-first-class-start.md) | Mason | Phases 1 and 2 merged #57; phase 3 (wiring in #58) in PR #60 |
| 10 | [Comp report — the decision provider, Jev first (CR-D)](10-comp-report-decision-provider.md) | Arbiter | Phase 1 merged #56; follow-ups next; phase 2 waits on Casa's Gateway key |
