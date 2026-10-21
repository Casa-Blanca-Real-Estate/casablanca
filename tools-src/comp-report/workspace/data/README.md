# Reference data for the comp report (Dispatch 17, CR-R2)

Static lists the builders read. Names and labels only: no StreetEasy photo, listing text or other content.
`data.test.ts` in `workspace/` checks their shape. — Surveyor (CR-R2), 2026-10-21

## `streeteasy-neighborhoods.json`

`{ name, borough }[]`, 311 names: Manhattan 55, Brooklyn 65, Queens 76, Bronx 51, Staten Island 64.

- **Source:** StreetEasy's browse pages, read 2026-10-21: `streeteasy.com/browse/sale/<borough>` for Manhattan,
  Brooklyn, Bronx and Staten Island, and `streeteasy.com/browse/rental/queens` for Queens (the Queens sales page
  failed to load once; for the other four boroughs the sale and rental lists are identical).
- **As written:** names are exactly as StreetEasy links them, including its own disambiguations ("Murray Hill
  (Queens)", "Chelsea (Staten Island)", "Bay Terrace (Queens)" beside Staten Island's "Bay Terrace") and its
  spellings ("Soho", "Noho", "Hell's Kitchen", "Mt. Hope", "Rockaway All"). Names are unique across boroughs.
- **Left out:** Manhattan's five umbrella links ("All Downtown", "All Midtown", "All Upper East Side",
  "All Upper Manhattan", "All Upper West Side"), which group neighborhoods already listed; and New Jersey, which
  StreetEasy also covers but isn't a borough. "Upper East Side" and "Upper West Side" stay: StreetEasy lists
  them as names of their own, and listings carry them.
- **Use:** NW-017 b (later) and checking the read's neighborhood spelling. Keep unknown names; don't reject.
  Re-check twice a year.

## `subway-stations.json`

`{ source, lines, stations }`. `lines` maps a line (`"A"`, `"6"`, `"S"`, `"SIR"`) to `{ color, textColor }`;
each station is `{ name, lines, otherLines, lat, lng, gtfsStopIds }`. 464 stations, 24 lines.

- **Source:** MTA New York City Transit's static subway GTFS, `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip`
  (linked from `mta.info/developers`), downloaded 2026-10-21; file dated 2026-08-27, feed version
  `20260826-X-long-term-supplement-trip-ids`, valid 2026-05-26 to 2026-10-31. Colours are `routes.txt`'s
  `route_color` and `route_text_color`. Stations, lines and coordinates are from `stops.txt`, `trips.txt`
  and `stop_times.txt`. The MTA's separate Stations list (data.ny.gov) wasn't reachable from here, so lines
  come from the timetable instead.
- **Built by** `dev/subway-stations.ts` (its header says how). `lines` are the services that stop on a
  weekday 7am–7pm; `otherLines` stop only at nights or weekends (the 2 on the 1 local, the 4 on the 6).
  Same-name stations joined by a transfer are one (Times Sq-42 St, Fulton St); others stay separate, as the MTA
  signs them. 6X, 7X and FX show as 6, 7 and F; the three shuttles as S.
- **Licence:** the MTA's developer terms (`mta.info/developers/terms-and-conditions`, updated 2024-03-13) let
  anyone who accepts them download and host the data, and use it in an app, on conditions: don't modify or
  delete the data, don't present it in a misleading way, don't imply the MTA licenses or endorses the app, and
  don't serve it straight from the MTA's servers. Saying "data from the MTA" is allowed. Keeping a copy here
  and reading it in the tool fits.
- **The bullets.** The developer terms say nothing about route symbols, so they don't permit them either. The
  MTA's licensing page (`mta.info/doing-business-with-us/licensing-program`) says it owns "registered
  trademarks like the MTA symbol, the MetroCard and the NYC subway route symbols", and charges for their use in
  advertising and publishing. A coloured circle with the line's letter in the official colour *is* the route
  symbol's design, so drawing our own doesn't take it outside that claim. Naming which trains stop nearby is
  ordinary descriptive use, and the plain-text form carries the least risk.
- **Decided (Kimani, 2026-10-21):** the tool shows the bullets (a circle in the line's colour with its letter).
  Client emails use plain text, the line's letter with a small dot in its colour beside it ("● A ● C ● E"),
  never the bullet. This note is not legal advice.

## `streeteasy-photo-hosts.json`

`string[]`, bare hostnames. Replaces Dispatch 16's provisional `PHOTO_HOSTS`.

| Host | Seen serving property photographs on |
|---|---|
| `photos.zillowstatic.com` | Live reads, 2026-10-21, of seven listing pages: 309 W 83 St #4A, 256 E 4 St #2, 222 16 St #3E (Brooklyn), 128 W 138 St #3E, 432 Fenimore St, 62 Bainbridge St, 113 E 81 St. Every gallery photo, and each page's share image, came from this host (paths `/fp/<hash>-se_large_800_400.webp` and `-se_extra_large_1500_800.webp`) |

Floor plans come from the same host, so the host alone can't tell a photo from a plan. Maps come from Google
Static Maps (not listed). No fixture in the repo has a photo URL, and Kimani's checklist (07, item 5) asks only
for a host other than this one.
