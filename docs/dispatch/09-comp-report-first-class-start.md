# Dispatch 09 — Comp report: the first-class start, and the screens (CR-3b)

**Dispatched by:** Casanova · 2026-09-29 · **To:** Mason
**Builds from:** `docs/comp-report/02-screens.md` (the screens, what goes on each). Also
`docs/comp-report/01-design.md` v0.5: §3 (the flow), §6.2 (StreetEasy links), §6.10 (the checks),
§10.2 (the headline and the email).
**Depends on:** Abacus's Dispatch 08 phase 1 (`compRecordFromListing`, `LISTING_EXTRACT_SCHEMA`). Build
against that interface, and stub it until his PR merges. Phase 2 uses his phase 2 (checks, pairs, the
price table, `headline_facts`) as it lands. Kimani reviews `02-screens.md` in parallel. Where
decisions D-20 to D-23 are open, use the recommendations, labelled in the build notes.
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` per phase. Never merge — Casanova
or Kimani merges. Sign PRs, PR comments and commits "— Mason (CR-3b)".**

## Why this exists

Kimani walked the CR-3a scaffold with sample data. What he found:
- The hardest part is putting what the agent needs now first, and folding away or cutting the rest.
- The start, from a new comp to its comps being in, should be streamlined and first-class, perhaps a
  modal rather than stepped tabs.
- Comps must be addable by **individual StreetEasy links**, because many agents research comps by
  hand and never use StreetEasy's comps export. Kara, a Casa mentor, never does.

`02-screens.md` is the answer to all three, screen by screen. Read it in full, with Kara's workshop
transcript and Frankie's email in `docs/comp-report/sources/`.

## Phase 1 — the start, and adding comps (PR first)

1. **The new-comp modal** (`02-screens.md`: The home → The details → Add comps). It replaces the
   scaffold's Home and Export steps, and it lands in the workspace on Sort.
   - It offers buyer or seller (buyer first), plus the client's name (D-22 recommendation A).
   - The target price, deal terms and client note move out of it (phase 2 places them).
2. **The home by StreetEasy link:** paste the listing and the fields fill themselves. The agent
   confirms or edits them on The details. The typed address still works.
3. **Adding comps, three ways, one list:**
   - **Paste StreetEasy links:**
     - One or many, one per line.
     - Each link runs a background job (the `streeteasy-import-background` and `streeteasy-status`
       pattern already in `netlify/functions/`), with Abacus's `LISTING_EXTRACT_SCHEMA`, then
       `compRecordFromListing()`.
     - A row shows up at once and fills in as its job finishes.
     - Each row gets a one-tap **Confirm**, since reading a page can misread it: values stay
       `inferred` until then. A failed read says so and offers "type it in".
   - **Drop the export:** as today.
   - **Type one in:** `compRecordFromManual()`.
   - **The list:** grouped by status, with "about three each" (Kara), and the guidance line from
     `02-screens.md`.
4. **"Export" becomes "Add comps"** everywhere. Sort gets the same add bar.
5. **The link import is guarded:**
   - signed-in only
   - `streeteasy.com` URLs only
   - a per-user limit (each read costs Firecrawl credit)
   - no photos stored (links only)
   - the extract stored as the property's observation (§12)

   `FIRECRAWL_API_KEY` is already set for the carousel tools.
6. **Admins:** "Use the 100 Barclay sample" on the modal's first screen fills all three screens.

**Phase 1 is done when,** in production, Kimani makes a new comp from 100 Barclay #17L's StreetEasy
link, adds five comps by link, confirms them, and lands on Sort with them. The export and typing in
still work.

## Phase 2 — the screens (after Kimani's review of `02-screens.md`)

1. **The workspace has three screens:** Sort, Findings, Send.
   - The agent's number is the gate into Findings (D-1).
   - The assistant becomes a drawer, open on all three.
   - The target and deal terms sit on Findings, after the reveal (D-4).
2. **Sort rows,** as in `02-screens.md`:
   - one notes field that is also the reason
   - the tier as three choices (labels per D-20, recommendation B)
   - Kara's checks as flags, with quick-pick note chips
   - opening a row counts as reviewing it, and the anchor is a star inside the opened row
3. **Findings,** top to bottom:
   - the neutral one-sentence reading
   - one range, or both side by side only when estimates change the answer
   - the agent's number against it
   - evidence by status, with *didn't sell* per D-23
   - the price table
   - the comps that count
   - "How this was worked out" folded, with the pairs from Dispatch 08
4. **Send:**
   - the headline first, required per D-21 (recommendation A)
   - the assistant's drafts, drawn only from `headline_facts`
   - the email in Frankie's order, still the fixed template
   - QA as one status line
5. **The build notes:** the "About this step" boxes, stub labels and decision IDs sit behind one
   switch, for admins only and off by default. A sample report shows one banner, and the per-field tags
   go.

**Phase 2 is done when** the three screens match `02-screens.md` with Kimani's review comments
applied, and a walk from a new comp to a copied email works with sample data and with real links.

## Also

- **Keep** the error boundary, the effects test, admin-only samples and the sample flag.
- **Pull `claude/main` first:** Chat.tsx changed under you (the scrollIntoView fix).
- **Still yours:** CR-1's step-6 proof (Kimani still has to try a Gmail that's on no list), then
  CR-1.1 item 3.
- **Your "wrong shape" notes from #53** (export bytes to Blobs, subject facts as sourced observations,
  a history for the call, versions) belong to CR-3 proper. Do them here only where phase 1 touches
  them anyway, and say which.

## Definition of done

Both phases are in production and verified as above. The existing tools still work. Internal paths
still 404, including uppercase. The new endpoints refuse anyone signed out. PRs are open against
`claude/main`, and signed.

— Casanova
