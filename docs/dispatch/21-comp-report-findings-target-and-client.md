# Dispatch 21 — Comp report: Findings, in plainer words, with whose target and the client's facts (CR-7d)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Mason
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/03-gate-findings-and-client.md` (the code map for
NW-061 to NW-077), `05-hubert-and-ai.md` (NW-063), Abacus's PR for Dispatch 19 (the five-row table and the
`fillable` gaps), and `01-design.md` §8.4 (the backstop) and §8.6 (no protected characteristics).
**Depends on:** Dispatch 19 merged (items 3 and 10) and Dispatch 20 merged (Mason's queue). Dispatch 22 also
edits `server/api/workspace.ts`: whichever of 20, 21 and 22 opens second rebases on the first. Your one edit
to `workspace/engine-input.ts` (item 9) rebases on Dispatches 15 and 19, which also edit it.
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Mason (CR-7d)"** in the PR, its comments and your commits. Ledger line: `casa-r13-7`.

## The goal

Noble understood Findings; a newer agent won't. Say each thing plainly, show the five-row table with a
calculator, record whose target it is, and give the client's facts a home in the data. Every change fits the
existing accordions; the client section's own place is Claude Design's.

## In scope

1. **NW-063 a · "How Hubert got there", plainer.** Built on NB-19's recommendation, A: a plainer template, not
   a model call. If Kimani answers B (Hubert's live words), stop this item and say so in the PR; it goes to
   Calliste. One short sentence per idea; comp names without the price,
   size and date parentheticals (put them in a `title`); "your closest" for "1st-tier". Keep the sentence on
   which comp sets each end. Return segments (text or comp id) instead of one string, so Design can draw chips
   later. It stays deterministic, built from the engine (`src/views/findings/findings.ts`).
2. **NW-067 a.** An ⓘ on every accordion header (the one in `src/views/newcomp/Frame.tsx`). A line on top of
   Comps that count: "Your 1st-tier comps. Only the sales set the range; the asks show where the market is."
   Each comp's tags beside its note.
3. **NW-065 a (UI) · the five-row table.** The explanation on top ("What 17L's 2,000 sq ft comes to, from the
   lowest to the highest $/sq ft of your closest sales"), the five rows, and a calculator below: $/sq ft and
   size give a price; a price gives its $/sq ft and where it sits against the true estimate. Browser
   arithmetic only: never saved, never fed to the engine. Show the table only with a size and two or more
   counting sold comps (with one, the five rows would repeat it). Whether the client's email gets it, and
   which clients need it at all, are NB-12's and Design's: say in the PR that you did not answer them.
4. **NW-069 a · §8.4's backstop.** Pin the neutral range and base on the server the first time the result is
   revealed, under `state.reveal` = {at, low, base, high, engineVersion}. Dispatch 24 trusts this marker to
   decide whether Hubert may see the target, so the client must never be able to write it. All in
   `server/api/workspace.ts`.
   - **The client never writes it.** The PATCH handler removes any `reveal` from the incoming `state` before
     anything else, and a `reveal` anywhere else in the body is never read.
   - **The carry-over is inside the one UPDATE,** not a read then a write, so a slow autosave can't erase a
     pin. `state = case when jsonb_typeof(reports.state->'reveal') = 'object' then ($n::jsonb - 'reveal') ||
     jsonb_build_object('reveal', reports.state->'reveal') else ($n::jsonb - 'reveal') end`. (Not
     `jsonb_build_object` alone inside a `coalesce`: with no stored reveal it returns `{"reveal": null}`, a
     key that exists.) Under READ COMMITTED, the default, a concurrent UPDATE re-reads the row it waited on,
     so this holds.
   - **Only `pinReveal()` writes it.** It runs in the same transaction when a PATCH gives the call or skips it
     (a `call` that isn't null), after the PATCH's other fields are saved. It computes low, base and high on
     the server with `neutralNumbers` (`server/numbers.ts`) from the stored comps and state, and
     `engineVersion` from `ENGINE_VERSION`: never from the request. Name in the PR which result's range it
     pins (the one Findings leads with). One statement: `update comp_report.reports set state =
     jsonb_set(state, '{reveal}', $pin::jsonb) where id = $1 and jsonb_typeof(state->'reveal') is distinct
     from 'object'`. It never overwrites a stored pin, including after the call is cleared (`call: null`)
     and given again.
   - **Reports revealed before this deploys** (a stored `call` and no `state.reveal`: Noble's, the samples)
     are backfilled on the owner's first load, not in a migration: the engine runs in code, so SQL can't
     compute the range. In the GET handler, only when the caller is the owner, `agent_call` is set and no
     reveal is stored, compute the pin as above and write it with the same conditional UPDATE, adding
     `late: true` and taking `at` from the call's own `at`. Dispatch 24 treats a late reveal as revealed.
     An admin reading another agent's report writes nothing, so Hubert shows no target there until the
     owner opens it.
   - Tests, in `db/workspace.test.ts` on a local Postgres: (a) a PATCH with `state.reveal` when none is stored
     leaves none; (b) a PATCH without `reveal` keeps the stored one; (c) a PATCH with a changed `reveal`
     keeps the stored one; (d) `call: null`, then a new call, leaves the pin as it was; (e) a `reveal` in the
     body outside `state` is ignored; (f) two concurrent PATCHes, a state autosave and a call, leave exactly
     one reveal, equal to the first pin; (g) the pinned numbers are the engine's, whatever the body says;
     (h) a report with a call and no reveal gets a `late` one on the owner's first load, and an admin's load
     writes nothing.
   - The target accordion says how far later changes moved the range toward or away from the target.
5. **NW-070 · whose target.** `target.owner: 'client' | 'agent' | 'both'`, default client, validated in
   `checkTarget`; a three-way toggle beside "Whose, and why"; the label follows it. Client, the default, uses
   the labels Dispatch 20 sets: "Client's offer target" (buyer) or "Client's target price" (seller). Agent
   reads "Your offer target" (buyer) or "Your list price" (seller). Both reads "Shared target". One label
   scheme, set by owner and side; if 20 left the label alone (NW-002 unanswered), these start here. Then the
   modal's label is yours too: change it in `Home.tsx`, and make it follow `target.owner`, since Edit
   details reopens the modal and would otherwise show a stale label after the owner changes.
6. **NW-071 a.** "Seller's timing" for the seller template's Timing; show the buyer's Target closing as
   "Buyer's closing". Give Seller's timing a short ⓘ: "When your client plans to list." (Whether timing is
   advice is NW-071's question; this answers it for the label only.) "Sales against ask" becomes "Your N sales closed a median X% above (or below) their
   last asking price, from a% to b%." Pick the word from the sign, and say "at their asking price" at 0.
7. **NW-072.** Days on market shows the spread and the count: "Your 3 sales took 24 to 259 days to go into
   contract; the middle one, 148." With two sales, name both.
8. **NW-073 a.** The Terms dropdown offers only the report side's template ("Buyer's terms" or "Seller's
   terms") and None.
9. **NW-074 a · the client's facts, as data.**
   - On the deal terms (the engine's §6.7 reads them): `financing: 'cash' | 'mortgage'` (cash hides rate, down
     payment and term; and with `'cash'`, `dealTermsInput` in `workspace/engine-input.ts` drops the
     `financing` block even if rate, down payment and term entries are still stored, so a mortgage isn't
     computed for a cash buyer. That is your only edit to that file), `preApproved` and `preApprovalAmount` (the recommendation: yes/no plus the amount),
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
  (`workspace/writer-input.ts`). Nothing here changes the range or the base; the one change to deal-term
  output is that a cash buyer no longer gets a mortgage computed (item 9).
- Don't put the client's name or any protected characteristic into any new field's prompt text or example.

## Definition of done

- On the sample, buyer and seller, condo and co-op: the take reads plainly, the five rows and calculator show
  only with a size, the backstop line appears after a change made post-reveal, the owner toggle saves.
- A test proves the range is identical with and without the new deal-term and client fields, and that
  `financing: 'cash'` with stale rate, down payment and term entries yields no `financing` block.
- The reveal tests (a) to (h) of item 4 pass on a local Postgres.
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`.
- A Playwright walk of Findings at 1440px with every accordion open, condo and co-op. Screenshots in the PR.

— Casanova
