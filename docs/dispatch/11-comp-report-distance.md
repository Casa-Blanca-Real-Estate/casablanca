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
