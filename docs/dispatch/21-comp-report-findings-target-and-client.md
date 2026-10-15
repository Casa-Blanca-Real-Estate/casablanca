# Dispatch 21 — Comp report: Findings, in plainer words, with whose target and the client's facts (CR-7d)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Mason
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/03-gate-findings-and-client.md` (the code map for
NW-061 to NW-077), `05-hubert-and-ai.md` (NW-063), Abacus's PR for Dispatch 19 (the five-row table and the
`fillable` gaps), and `01-design.md` §8.4 (the backstop) and §8.6 (no protected characteristics).
**Depends on:** Dispatch 19 merged (items 3 and 10) and Dispatch 20 merged (Mason's queue).
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Mason (CR-7d)"** in the PR, its comments and your commits. Ledger line: `casa-r13-7`.

## The goal

Noble understood Findings; a newer agent won't. Say each thing plainly, show the five-row table with a
calculator, record whose target it is, and give the client's facts a home in the data. Every change fits the
existing accordions; the client section's own place is Claude Design's.

## In scope

1. **NW-063 a · "How Hubert got there", plainer.** One short sentence per idea; comp names without the price,
   size and date parentheticals (put them in a `title`); "your closest" for "1st-tier". Keep the sentence on
   which comp sets each end. Return segments (text or comp id) instead of one string, so Design can draw chips
   later. It stays deterministic, built from the engine (`src/views/findings/findings.ts`).
2. **NW-067 a.** An ⓘ on every accordion header (the one in `src/views/newcomp/Frame.tsx`). A line on top of
   Comps that count: "Your 1st-tier comps. Only the sales set the range; the asks show where the market is."
   Each comp's tags beside its note.
3. **NW-065 a (UI) · the five-row table.** The explanation on top ("What 17L's 2,000 sq ft comes to, from the
   lowest to the highest $/sq ft of your closest sales"), the five rows, and a calculator below: $/sq ft and
   size give a price; a price gives its $/sq ft and where it sits against the true estimate. Browser
   arithmetic only: never saved, never fed to the engine.
4. **NW-069 a · §8.4's backstop.** Pin the neutral range and base on the server the first time the result is
   revealed (where the call is given or skipped in `server/api/workspace.ts`), under `state.reveal` = {at,
   low, base, high, engineVersion}. The PATCH handler carries the stored `state.reveal` over the incoming
   state and never takes it from the client. A test proves a PATCH without `reveal`, or with a changed one,
   leaves it as it was. The target accordion says how far later changes moved the range toward or away from
   the target.
5. **NW-070 · whose target.** `target.owner: 'client' | 'agent' | 'both'`, default client, validated in
   `checkTarget`; a three-way toggle beside "Whose, and why"; the label follows it. Client, the default, uses
   the labels Dispatch 20 sets: "Client's offer target" (buyer) or "Client's target price" (seller). Agent
   reads "Your offer target" (buyer) or "Your list price" (seller). Both reads "Shared target". One label
   scheme, set by owner and side; if 20 left the label alone (NW-002 unanswered), these start here.
6. **NW-071 a.** "Seller's timing" for the seller template's Timing; show the buyer's Target closing as
   "Buyer's closing". "Sales against ask" becomes "Your N sales closed a median X% above (or below) their
   last asking price, from a% to b%." Pick the word from the sign, and say "at their asking price" at 0.
7. **NW-072.** Days on market shows the spread and the count: "Your 3 sales took 24 to 259 days to go into
   contract; the middle one, 148." With two sales, name both.
8. **NW-073 a.** The Terms dropdown offers only the report side's template ("Buyer's terms" or "Seller's
   terms") and None.
9. **NW-074 a · the client's facts, as data.**
   - On the deal terms (the engine's §6.7 reads them): `financing: 'cash' | 'mortgage'` (cash hides rate, down
     payment and term), `preApproved` and `preApprovalAmount` (the recommendation: yes/no plus the amount),
     and timing and flexibility on the buyer template too. These go in the existing Terms grid.
   - On `brief.client`, which the engine never reads: `urgency` (text and a close-by date), `paysMoreFor`,
     `nonNegotiables`, `priorities` (price, speed, certainty: D-7 B). No screen yet: they land as data for
     Design (NW-074 b) and for the writer's client profile (Dispatch 13 phase 2).
   - The server validates the shapes. Free text runs through `workspace/fair-housing.ts` on save and a hard
     term is refused (§8.6).
10. **NW-077 a · "13 still needed".** Count only the gaps Dispatch 19 marks fillable, and say what they are ("2
    facts about the home to fill in"). The rest go under Warnings. Messages run through `engineWhy`.

## Not in scope (Claude Design, phase B, or other tracks)

Comps as chips (NW-063 b); setting the target more easily (NW-064); the sale-against-ask chart (NW-071 b); a
first-class client and deal section and where the client fields are asked (NW-073 b, NW-074 b); the loop after
Findings and the justification step (NW-069 b, NW-075); the factor dropdown (NW-076); the co-op review
(NW-066 b). Hubert seeing the target and the copy that says so (NW-068): Dispatch 24, which edits
`Terms.tsx`'s "Hubert never sees it" line after this merges, so leave that line alone. The email's table
(NW-065 b, Kimani's call).

## Data and constraints

- No migration. `reports.target` and `reports.state` are jsonb; `reports.brief` is size-checked at 16 KB.
- The writer stays blind to the target and to `brief.client` until Dispatch 13 phase 2 says otherwise
  (`workspace/writer-input.ts`). Nothing here changes a number the engine computes.
- Don't put the client's name or any protected characteristic into any new field's prompt text or example.

## Definition of done

- On the sample, buyer and seller, condo and co-op: the take reads plainly, the five rows and calculator show
  only with a size, the backstop line appears after a change made post-reveal, the owner toggle saves.
- A test proves the range is identical with and without the new deal-term and client fields.
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`.
- A Playwright walk of Findings at 1440px with every accordion open, condo and co-op. Screenshots in the PR.

— Casanova
