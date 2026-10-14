# Dispatch 11 — Comp report: distance, from coordinates for the home and every comp (CR-3c)

**Dispatched by:** Casanova · 2026-10-06 · **To:** Mason
**Builds from:** `docs/comp-report/01-design.md` §6.10 (the checks), §12 (property records). The
engine's README, under "New in CR-2.2 (phase 2)", covers the `coordinates` fact and the `distance`
check.
**Depends on:** nothing. The engine already has both (#58). Neither the export nor a listing page
supplies coordinates, so every comp reads "Distance can't be checked yet".
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main`. Never merge — Casanova or Kimani
merges. Sign PRs, PR comments and commits "— Mason (CR-3c)".**

## Why this exists

**Distance is Kara's first rule:** "Same building first. Within a quarter mile." The engine flags a
comp over ¼ mile away (noted) and over ½ mile (far, suggests Secondary), but only once both the
home and the comp have coordinates.

## What to build

1. **Geocode on the server** when a home or comp is saved: by link, by export, or typed in. Do it
   after the save, so a slow or failed lookup never holds up the row. The row updates when the
   coordinates land.
2. **One lookup per building, cached on the property record.** Coordinates are a building's, so a
   building is looked up once across every report and agent. Record each lookup as an observation
   (§12), with the geocoder's name and the matched address.
3. **The geocoder.** NYC Planning's GeoSearch (`geosearch.planninglabs.nyc`) is free, needs no key, and
   covers the five boroughs. Use it unless you find a better one, and say why in the PR.
   - **Only the street address goes out:** no unit, no name, nothing else.
   - **Accept a match only when its house number and borough agree with ours.** Anything else is
     missing, never a guess, and the distance check keeps saying why.
   - Timeouts, a polite rate, and no retry storm.
4. **The fact:** `coordinates` as `Sourced<{ lat, lng }>`, `approx` (a building's point, not the
   unit's), with a source that names the geocoder. If the engine's source list has no fitting value,
   add the smallest one and flag it for Abacus (rule 8).
5. **On screen:**
   - Sort's row shows the distance ("0.3 mi"). The flags already come from the check.
   - The opened row says where it came from: "0.3 mi, from each building's mapped location".
   - Same-building comps read "Same building", not "0.0 mi".
6. **Backfill:** homes and comps saved before this get looked up the next time their report opens.
7. **Tests** with a fake geocoder:
   - a match;
   - a wrong-borough or wrong-number match refused;
   - a timeout;
   - one lookup per building across two reports;
   - the distance flag firing past ¼ and ½ mile.

## Definition of done

- **On production,** the 100 Barclay sample and a real comp added by link both show distances.
- **The distance flag fires** on a comp over ¼ mile away.
- **A refused match says why**, in the opened row.
- **The existing walk still passes.** Internal paths still 404, including uppercase.
- **The PR is open against `claude/main`, and signed.**

— Casanova

## Handoff, 2026-10-13

Mason's track is moving to a new cloud environment. This is where it stands, for the session that
picks it up.

**Where the work stands.** Dispatch 11 is done: merged in #62 and live at `7d415f9`. Casanova
accepted its six decisions and fixed the engine's stale "can't be checked yet" wording at merge.
Mason's earlier dispatches are done too: 05 (CR-1; step 6 is Kimani's, below), 07 (CR-3a) and 09
(CR-3b). Main was `aee2e09` when this was written.

**Open PRs:** none but this handoff, which is docs only.

**What's left on Dispatch 11:**
- **Kimani's check on production:** the 100 Barclay sample, and a report with a real comp added by
  link, both show distances, and a comp past ¼ mile has its flag. Casanova has already checked that
  the endpoint answers 401 signed out and the new files 404.
- **Abacus:** `distance_miles` on `CompOut`, on Casanova's list for his next engine pass. When it
  lands, `workspace/distance.ts` drops its deep import of `distanceMiles` from
  `engine/compute/checks.ts`.
- **Noble:** Kara's ½ mile flags 6 of the sample's 11 comps, five of them Primary. The thresholds stay
  as they are until Noble sets them (`docs/decisions.md`, "Later").

**What's next: Dispatch 13, the writer and QA (CR-5), ledger line `casa-r6-1`.** Phase 1 has Claude
write the headlines and the email in Casa's house voice, in Frankie's order, with QA on every number.
Where it starts:
- **Send today:** `src/views/workspace/SendStep.tsx`. The fixed template, which becomes the fallback,
  is `workspace/email.ts`. The number check is `workspace/grounding.ts`; it covers the headline now
  and widens to the whole email. The reading from `headline_facts` is `workspace/reading.ts`.
- **The model call:** `server/assistant.ts` holds the model, its settings, the versioned prompts
  (`PROMPTS`) and `usageTotals`. `server/api/turn.ts` streams synchronously and stops itself at 50 s.
  It is not a background function.
- **The background pattern to copy** is the link reads: `server/api/links.ts` and
  `netlify/functions/comp-report-links-background.mts`. They queue a row, claim it exactly once, and
  the browser polls.
- **Tables:** `usage` exists (the foundations migration). `narratives` doesn't yet, so it needs a new
  migration.
- **The fake model:** `dev/fake-anthropic.ts`, for the tests and the dev server
  (`CR_DEV_ANTHROPIC_BASE_URL`).
- **Check the model and its parameters** against the `claude-api` skill when you build (the
  dispatch's item 1).

**Gotchas:**
- **Never read `DATABASE_URL`.** It was MindBinder's database in the old environment.
- **Local databases.** The tests use `CR_TEST_DATABASE_URL`, a role that can create databases and
  roles. The dev server uses `CR_LOCAL_DATABASE_URL`, owned by a non-superuser: superusers bypass
  row-level security, and the server refuses them. `npm run db:local` migrates it. Without
  `CR_TEST_DATABASE_URL` the database suites skip, so a skip isn't a pass.
- **Migrations are append-only, and their timestamps must be unique** across open PRs. Arbiter's and
  mine collided, and Casanova renamed his at merge.
- **Netlify's limits:** 30 s of silence gets a 504, and every response is cut at 60 s. Anything that
  waits on a model or a slow service goes in a background function, or is capped per call (the
  geocoder does three lookups a call).
- **Deploy previews answer 401 for every path** (the visitor login), so they can't show a 404. Run
  the changed files through `isInternal()` from `netlify/edge-functions/block-internal.js` (as is,
  uppercase and percent-encoded), and `curl` production after merge.
- **Server code runs under Node's type stripping:** imports carry `.ts`, and only erasable
  TypeScript works (no enums or namespaces).
- **React:** every `useEffect` and `useLayoutEffect` has a block body (`src/effects.test.ts` checks).
  `useAutosave` returns a new object each render, so depend on `save.flush`, not `save`.
- **Browser walks:** Playwright, with the preinstalled Chromium (`/opt/pw-browsers`; never
  `playwright install`). Sign in to the dev server by setting `sessionStorage['cr-dev-session']` to an
  email in an init script. Run the fakes, which are Anthropic on 8791, Firecrawl on 8792 and GeoSearch
  on 8793, and start the dev server with their `CR_DEV_*_BASE_URL`s. My walk scripts were in the old
  session's scratchpad and don't carry over.
- **Stop servers by task ID or PID,** never `pkill -f`, which can match your own shell.
- **The proxy refuses branch deletion by `git push` (403).** Kimani deletes branches.
- **The engine is Abacus's.** A new `SOURCES` value or engine field is his lane: add the smallest
  one and flag it in your PR (rule 8).

**Waiting on Kimani:**
- Dispatch 11's production check, above.
- CR-1's step 6: find the `"allowed":false` line in Netlify's identity-signup log
  (`docs/decisions.md`). No session can read function logs.
- The production walk of the comp report (`docs/decisions.md`, "Now").
- In Dispatch 13's phase 1 PR, he reads the house-voice style file and the eval drafts.

**Waiting on Casanova:** nothing from this track. Abacus's `distance_miles` is already on Casanova's
list.

**The restart kickoff,** for Kimani to paste into the new session:

> You're **Mason**, continuing a Casa Blanca Creative Studio track. Read `/CLAUDE.md`, then
> `docs/dispatch/README.md` (your roster row says where you are), then your dispatch file in full:
> `docs/dispatch/13-comp-report-writer-and-qa.md`, Dispatch 13, the writer and QA (CR-5), ledger line
> `casa-r6-1`. Then read the handoff at the end of `docs/dispatch/11-comp-report-distance.md`, and your
> latest PRs and their comments: #65 (this handoff) and #62. Carry on from what's next there: Dispatch
> 13, phase 1. Sign as "— Mason (CR-5)".

— Mason (CR-3c)
