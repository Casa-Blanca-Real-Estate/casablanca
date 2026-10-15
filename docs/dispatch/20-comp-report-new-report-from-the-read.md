# Dispatch 20 — Comp report: the new report and the home, filled from the read (CR-7c)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Mason
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/01-new-report-and-home-data.md` (the modal's copy
and fields), `02-sort.md` (tag groups and suggested tags on the card), Abacus's PR for Dispatch 16 (the new
fields and exports), and the follow-ups at the end of `docs/dispatch/14-comp-report-design-port.md`.
**Depends on:** Dispatch 16 merged (the data this shows) and Dispatch 18 merged (Mason's queue). The transit
line (item 13) needs Dispatch 17's station data; skip it if that hasn't merged.
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Mason (CR-7c)"** in the PR, its comments and your commits. Ledger line: `casa-r13-6`. With 18,
22 and 24, it supersedes `casa-r12-1`, and it takes the free-text tags (DP-6) out of `casa-r10-1`.

## The goal

Dispatch 16 makes the read fill the home and the comps. Show it, in the modal and on the card, inside today's
layout, and fix the modal's copy so a new agent knows what each field wants. New groups go in as more rows of
the existing pickers; how they're laid out is Claude Design's.

## In scope

**Step 1, the home (`src/views/newcomp/Home.tsx`, `src/views/comp/AddBar.tsx`)**
1. **NW-001 a.** Placeholder: "Paste its StreetEasy link to fill it in, or type the address and fill it in
   yourself". The same idea on Add comps' bar ("or start typing an address" reads like search).
2. **NW-003.** The target's ⓘ: "Hubert, the AI assistant, doesn't see this, so it can't sway his read of the
   comps. It's never in your client's email and doesn't change any number. Findings shows it against the range,
   and you can change it there." (Dispatch 24 rewrites it once Hubert sees the target after the reveal.)
3. **NW-004.** When a pasted link checks out, replace the field's text with the clean `check.url`, on step 1
   and in Add comps.
4. **NW-017 a.** The neighborhood in step 1's match line ("Condo · Turtle Bay · …").
4a. **NW-002, if Kimani has answered "A" (one number).** One number stays, and the modal's label reads
   "Client's offer target" (buyer) or "Client's target price" (seller). These are the client-owner labels
   Dispatch 21 uses, since client is the owner's default. 21 changes the label when the owner changes. If he
   chose a range or hasn't answered, leave the field as it is.

**Step 2, details (`src/views/newcomp/Details.tsx`)**
5. **NW-006.** With no home read, the size field is open (not marked an estimate), with the existing Estimate
   toggle beside it. "Not listed" only after a read that gave no size.
6. **NW-011 (UI).** When the page's type differs from the report's, a notice with a one-tap switch. Show the
   pickers Dispatch 16 now fills: Policies, the building's amenity groups, rooms.
7. **NW-012 (UI).** The six-step condition scale, with its ⓘ.
8. **NW-013.** Year built's empty state gets the tile's underline and ✎, as Floor has.
9. **NW-015.** Notes ⓘ: "What someone would notice walking through that the facts don't say: light, views,
   layout, condition, noise, storage. Hubert reads it. Your client never sees it."
10. **NW-017 a (UI).** A neighborhood field on the details, and the neighborhood on Sort's home sub line
    (`src/views/shell/subline.ts`, NW-033 a's home half).

**Sort's card and the add form**
11. **NW-020 a (UI) · photos.** Show the read's photos with a plain `<img>` in Sort's photo area
    (`CompCard.tsx:172`) only. The home's photo in the modal goes to Claude Design. Comps with none keep the
    placeholder.
12. **NW-039 a (UI), NW-045 (UI), NW-059 a (UI) · groups and tags.**
    - Hide feature groups that don't apply to the type.
    - Show the tag groups under their labels inside the existing tag area; Size and Multi-floor take one choice.
    - Tags the data settles show as one-click chips marked "from the data" (the recommendation for NW-059 b);
      a contradicted tag clears itself when its fact changes, and "First floor" hides when the floor is known
      and isn't 1.
    - **DP-6 · free-text tags:** an agent can add their own tag. Cap it at 40 characters, run it through
      `workspace/fair-housing.ts` on save (refuse a hard term), and store it as typed. Free-text tags are
      validated by a new `isFreeTag` in a new `workspace/free-tags.ts`. `isTag` and `features.ts` stay
      untouched, and the server accepts `isTag(t) || isFreeTag(t)` (`server/api/comps.ts`). Only list tags
      count toward "needs a tag" unless Kimani says otherwise; list it among the recommendations in the PR.
      Free-text tags show in the filter.
13. **NW-037 a (Mason's half) · transit,** if Dispatch 17's data has merged. A pure function in
    `workspace/transit.ts` from the building's geocoded coordinates (`ws.geocodes`) to the nearest stations and
    their lines, and one line in the card's Distance section with plain coloured circles. Transit stays out of
    the engine. If skipped, say so in the PR; Casanova queues it as a follow-up line.

**From Dispatch 14's follow-ups**
14. Escape in the new-report modal no longer drops a half-filled comp form (ask, or keep the draft).
15. Changing the home's address on step 1 retitles the report.

## Not in scope (Claude Design, phase B)

The home/building split, laundry first-class and New development moving to the building (NW-008 b, NW-014,
NW-016); how a long amenity list shows (NW-009 b); the card's unit/building split (NW-039 b); where the transit
bullets show beyond the card line (NW-037 b); a Neighborhood column (NW-033 b). Photos in the email (NW-020 b)
and the home's photo in the modal (NW-020 a).

## Data and constraints

- No migration unless free-text tags need one: they fit `report_comps.tags` (text[], at most 30). If a check
  constraint refuses them, add a migration for it and say why. Its timestamp must be later than every
  migration on `claude/main` when your PR opens (e.g. `20261018000000_comp_report_free_tags.sql`), because
  15, 22 and 23 hold `20261016000000`, `20261016120000` and `20261017000000`.
- Fair-housing screening runs on save, on the server. A tag is free text a client may read in the email.
- Every stored tag and feature still loads (Dispatch 16's `cleanFeatures` test covers features; add one for
  tags).

## Definition of done

- From a fixture link, a new report fills the home without hand-setting a picker that the page shows.
- A typed-in home asks for its size as a plain field.
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`.
- A Playwright walk of the three modal steps and an expanded Sort card at 1440px, condo and co-op, with a
  photo, the tag groups and a "from the data" chip. Screenshots in the PR.

— Casanova
