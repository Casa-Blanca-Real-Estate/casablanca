# Dispatch 19 — Comp report: the engine for Findings (CR-2.4)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Abacus
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/03-gate-findings-and-client.md` (NW-065, NW-066,
NW-077: what the price table and the gaps compute today, and the five-row table), and the engine's own
README.
**Depends on:** Dispatch 16 merged (you both edit `engine/types.ts` and the version) and Dispatch 15 merged
(it edits `workspace/engine-input.ts`, which item 3 touches).
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Abacus (CR-2.4)"** in the PR, its comments and your commits. Ledger line: `casa-r13-5`.

## The goal

On Findings, Kimani read the price table as a grid and "13 still needed" as nothing he could act on. Both come
from the engine. Give Findings a five-row table it can explain, stop co-op reports raising per-SF gaps, and
make the gap list say which gaps the agent can fill. Mason shows them in Dispatch 21.

## In scope

1. **NW-065 a · the five-row table,** returned beside today's rows (`engine/compute/price-table.ts`,
   `output.ts`):

   | Row | $/sq ft | Price |
   |---|---|---|
   | Low | the lowest rate of the counting 1st-tier sold comps with a size (or the narrowed low ÷ size), named by its comp | the range's low, exactly |
   | Quarter | low + ¼ (high − low), to the whole dollar | rate × the home's size |
   | Middle | low + ½ (high − low) | rate × size |
   | Three-quarter | low + ¾ (high − low) | rate × size |
   | High | the highest rate (or the narrowed high ÷ size), named by its comp | the range's high, exactly |

   Same conditions as today: a condo, a home size, at least two counting sold comps with different rates.
   The middle is the midpoint, not the median comp. Keep the old rows: the email, the writer and QA read them
   until Kimani answers NW-065 b.
2. **NW-066 a · co-op gaps.** On a co-op report, don't raise `subject_area_estimate_only`,
   `subject_area_missing` or `comp_area_missing`; they talk about $/sq ft (`engine/compute/index.ts`).
3. **NW-077 b · gaps an agent can act on.**
   - Raise comp gaps only for comps that count (today 101 Leonard #5B, 2nd tier, raises one).
   - Mark each gap `fillable` (the agent can close it on a screen that exists: year built, a confirmed size,
     the new pickers from Dispatch 16) or not.
   - Map the home's Building picker and the new amenity and policy groups to the engine's subject amenities
     and service level (`subjectFacts`, `workspace/engine-input.ts`), so those gaps close when the agent fills
     them.
   - Say "the home", not "the subject", in gap messages the screen shows.
4. Bump the engine version; note the change in the engine README.

## Not in scope

Showing the table, the calculator and the gap line (Dispatch 21, Mason). The email's table (NW-065 b, Kimani's
call). A five-price ladder for co-ops (NW-066 b, reviewed with Claude Design on the co-op sample). The
sale-against-ask chart (NW-071 b, Design).

## Data and constraints

- No migration. The engine stays pure and deterministic.
- Items 1, 2 and 4 leave the range unchanged (test on the 100 Barclay sample). Item 3 can change comparisons.
  Record the sample's low, base and high before and after, and explain any difference in the PR. Also map
  `intake.rooms` into `subjectFacts` if the engine has a rooms fact; if it doesn't, say so.
- `engine-input.ts` is shared: rebase on Dispatch 15's overrides before you start item 3.

## Definition of done

- On the sample: five rows, low and high equal to the range's ends; the co-op run raises no per-SF gap; the gap
  count drops from 13 to the ones that are real, each marked fillable or not.
- `test:engine`, `test:comp-report` on a local Postgres (`npm run db:local`), `typecheck`, `typecheck:engine`
  and `build` pass with nothing skipped.
- The PR lists the new output fields for Mason, and the sample's low, base and high before and after item 3.

— Casanova
