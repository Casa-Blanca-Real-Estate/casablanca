# Dispatch 17 — Comp report: StreetEasy's lists, and the subway (CR-R2)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Surveyor
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/07-streeteasy-taxonomy.md` (the probe so far, and
its "Still unverified" checklist), `02-sort.md` (NW-037 a), and Noble's points NW-009, NW-017, NW-018 and NW-037
in `00-items.md`.
**Depends on:** nothing. Runs alongside Dispatch 15 (Mason) and 16 (Abacus). Abacus starts from 07's lists and
picks up yours when they land; item 4's photo hosts replace the provisional `PHOTO_HOSTS` Dispatch 16 ships with.
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Surveyor (CR-R2)"** in the PR, its comments and your commits. Ledger line: `casa-r13-3`.

## The goal

Three research jobs, small, delivered as data the builders can use without asking you again.

## In scope

1. **NW-018 · finish the StreetEasy probe.** 07 is partly unverified. Confirm, with a source per value:
   - every value of the grey line's three fields (type, neighborhood, sale kind), including a co-op, a
     townhouse, a new-development sponsor unit and an HDFC listing's line;
   - whether the grey line ever says "New development" or "Sponsor Unit";
   - the export's spelling of co-op ("Co-op" or "Coop") and whether any export column carries the sale kind;
   - the amenity, policy and home-feature items under each category, as listing pages show them.

   Update 07 in place: mark each line verified or not, with its source.
2. **The neighborhood list.** StreetEasy's own names with their borough, from `streeteasy.com/browse`, as
   `tools-src/comp-report/workspace/data/streeteasy-neighborhoods.json` (`{ name, borough }[]`) with a short
   source note beside it. Keep names exactly as StreetEasy writes them. For NW-017 b (later) and to check the
   read's neighborhood spelling. No builder uses it this round.
3. **NW-037 a · the subway data.** The MTA's open station list (station, lines, coordinates) and the official
   line colours (GTFS `routes.txt`), as `tools-src/comp-report/workspace/data/subway-stations.json`, with the
   licence and the source date in a note beside it. The bullets will be plain coloured circles with the line's
   letter or number, not MTA artwork: say whether the licence allows that.

4. **StreetEasy's image hostnames.** The exact hosts StreetEasy's listing photos are served from, as
   `tools-src/comp-report/workspace/data/streeteasy-photo-hosts.json` (`string[]`, hostnames only, no paths),
   with a short note beside it saying where each came from (a fixture, a live read, or Kimani's checklist).
   Dispatch 16's `cleanPhotoUrls` allowlists photo URLs against `PHOTO_HOSTS`; 16 ships with a provisional
   list and takes yours when this lands. List a host only if you saw it serve a property photograph, not a logo,
   map or headshot. Names only: no photo is downloaded or stored.

## Not in scope

Any code that uses these lists: Abacus maps the taxonomy (Dispatch 16), Mason computes nearest stations and
shows them (Dispatch 20, if your data has landed). The neighborhood adjacency list for NW-017 b is later.

## Data and constraints

- **If StreetEasy refuses automated fetches,** don't work around it. Write the exact five-minute checklist for
  Kimani (which listing, what to copy, including the address of two property photos for item 4) at the end of 07, and deliver what search results and the export
  confirm.
- No StreetEasy content beyond names and labels goes into the repo. No photos, no listing text.
- `tools-src/` is already guarded from the public web. A new folder elsewhere would need rule 9.

## Definition of done

- 07 says, line by line, what's verified and from where; anything unverified is on Kimani's checklist.
- The photo-hosts file lists only hosts you saw serve a property photograph, each with its source, so Dispatch
  16 can replace its provisional `PHOTO_HOSTS` with it.
- All three JSON files parse, and a small test in `workspace/` checks their shape (no duplicate names, every
  station has coordinates and at least one line, every line has a colour; the photo hosts are bare lowercase
  hostnames with no scheme, path or duplicate, and none is a dot-suffix of another).
- `test:comp-report` on a local Postgres and `typecheck` pass with nothing skipped.

— Casanova
