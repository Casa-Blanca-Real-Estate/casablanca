# NW-018 probe: what StreetEasy's grey line and amenity lists can say

First probe 2026-10-15 (search snippets, the reference export, the parsers). **Finished 2026-10-21 by Surveyor
(Dispatch 17)** with live reads of StreetEasy pages: seven listing pages, three search-results pages, and the
per-borough browse pages. StreetEasy served every page asked for except the Queens sales browse page (one
failed read; the Queens rental browse page was used, and for the other four boroughs the sale and rental lists
are identical). Only paths StreetEasy's `robots.txt` allows were read: `/building/<building>/<unit>`,
`/for-sale/<area>` and `/browse/...`. It disallows `/sale/*`, `/rental/*` and `/building/*/for-sale/*`,
which were not read.

Each line below is marked **verified** (with its source) or **not verified**. Anything not verified is on
Kimani's checklist at the end.

## Sources (read 2026-10-21)

| Key | Page | Grey line as shown |
|---|---|---|
| P1 | `streeteasy.com/building/309-west-83-street-new_york/4a` | Co-op · Upper West Side · Resale |
| P2 | `streeteasy.com/building/256-east-4-street-new_york/2` | Condo · East Village · Sponsor unit |
| P3 | `streeteasy.com/building/222-16-street-brooklyn/3e` (built 2026) | Condo · Park Slope · Sponsor unit |
| P4 | `streeteasy.com/building/128-west-138-street-new_york/3e` (an HDFC co-op) | Co-op · Central Harlem · Restricted sale |
| P5 | `streeteasy.com/building/432-fenimore-street-brooklyn/twnhse` | House · Prospect Lefferts Gardens · Resale |
| P6 | `streeteasy.com/building/62-bainbridge-street-brooklyn/multi` | Three-family home · Stuyvesant Heights · Resale |
| P7 | `streeteasy.com/building/113-east-81-street-new_york/twnh` | Two-family home · Upper East Side · Resale |
| P8 | `streeteasy.com/building/67-east-82-street-new_york/twnhs` (a rental) | House · Upper East Side · (rental) |
| C1–C3 | search results: `/for-sale/manhattan`, `/for-sale/downtown`, `/for-sale/brooklyn` | cards read "<Type> in <Neighborhood>" |
| B | `/browse`, `/browse/sale/{manhattan,brooklyn,bronx,staten-island}`, `/browse/rental/{manhattan,…,queens}` | neighborhood lists |
| X | the reference export, `docs/comp-report/sources/streeteasy-comp-export-100-barclay-17l-2026-09-23.csv` | |
| F | StreetEasy's listing-feed spec (search snippets, 2026-10-15) | |

The page renders the three values as separate items (the "·" here is ours). Note the capitals: StreetEasy
writes "Sponsor unit" and "Restricted sale", lower-case second word.

## Field 1: type

| Label as shown | Status | Source |
|---|---|---|
| Condo | verified | P2, P3, C1–C3; X ("Property Type") |
| Co-op | verified, spelled "Co-op" on pages and cards | P1, P4, C1, C2, C3 |
| Condop | verified (card) | C2 "Condop in Battery Park City", C3 "Condop in Downtown Brooklyn" |
| House | verified: a single-family townhouse shows as **House** | P5, P8, C3 "House in Ocean Hill" |
| Two-family home · Three-family home · Four-family home | verified: multi-family homes say how many families | P7, P6, C1 "Two-family home in Hamilton Heights", C3 "Four-family home in Boerum Hill" |
| Hybrid | verified (card); meaning not checked | C3 "Hybrid in Brighton Beach" |
| Rental unit | verified (card); not a sale type | C3 "Rental unit in Coney Island" |
| Townhouse | **not seen** on any page or card. Three townhouse listings (URL slugs `twnhse`, `twnh`, `twnhs`) showed House or Two-family home. The feed's `townhouse` most likely displays as House | P5, P7, P8 |
| Multi-family, Other | not seen as labels | — |

- The grey line's type is the unit's type. The export also has **Building Type** ("Condo building" in all 11
  rows). Other building labels ("Co-op building") are not verified. **X**
- What the export writes for a co-op ("Co-op" or "Coop") is **not verified**: the reference export is all
  condos. On Kimani's checklist.

## Field 2: neighborhood

- One name per listing, StreetEasy's own. The grey line uses the same names as the browse lists: Upper West
  Side, East Village, Park Slope, Central Harlem, Prospect Lefferts Gardens, Stuyvesant Heights and Upper East
  Side are all in them. **verified, P1–P7 against B**
- "Upper East Side" and "Upper West Side" are names of their own, beside Lenox Hill, Yorkville, Carnegie Hill
  and Lincoln Square. The browse page lists them separately from the umbrella links "All Upper East Side" and
  "All Upper West Side", and P7 (East 81st Street) and P1 (West 83rd Street) carry them. How StreetEasy draws
  the line between "Upper East Side" and Lenox Hill or Carnegie Hill was not checked. **verified, B, P1, P7**
- The full list, 311 names across the five boroughs, is
  `tools-src/comp-report/workspace/data/streeteasy-neighborhoods.json`, with its note beside it. **verified, B**
- Corrections to the first probe's from-memory list: StreetEasy says **Hell's Kitchen** (not "Clinton"),
  **Fulton/Seaport** (not "South Street Seaport"), **Soho** and **Noho** (not "SoHo", "NoHo"). It has no
  "Alphabet City" or "Meatpacking District". It adds Beekman, Hudson Heights, NoMad, South Harlem, Two Bridges
  and Upper Carnegie Hill. **verified, B**
- The export's **Neighborhood** and **Building Neighborhood** columns: both "Tribeca" in the reference file.
  **verified, X**

## Field 3: sale kind

| Label as shown | Status | Source |
|---|---|---|
| Resale | verified | P1, P5, P6, P7 |
| Sponsor unit | verified | P2, P3 |
| Restricted sale | verified, on an HDFC co-op | P4 |
| New development | **not on the grey line** in the two sponsor units read, one of them in a building finished in 2026 (P3). It is a **card badge** ("New development") on search results. Whether a never-sold building's line ever says it is not verified | P2, P3, C2, C3 |
| Foreclosure, Auction, Short sale | feed values; display labels not seen | F |
| "Sponsored" | a **paid-placement card badge** (beside "Featured"), not a sponsor unit. Don't map it | C2, C3 |

- The export has **no sale-kind column**. Its 31 columns are Address … Building Amenities, none of them a sale
  kind. **verified, X (header row)**
- Treat the third field as a label from a known set, not a closed enum. Keep unknown text as shown.

### HDFC, sponsor and new development

- **HDFC** is a Co-op with sale kind **Restricted sale**. "HDFC" itself appears only in the description
  (P4: "prewar HDFC building"). The page also says "This is a restricted sale. Buyer income limits apply."
  **verified, P4**. Restricted sale is the signal; "HDFC" in the text confirms it.
- **Sponsor unit** is a sale kind, not a type. **verified, P2, P3**
- **New development** is a building-level badge on cards, not a grey-line value in what was read. **verified,
  P3, C2, C3** (the never-sold case is on the checklist)
- **Estate / as-is**: not a StreetEasy field. The tool asks it (`estate_or_as_is`). **repo**

## Amenities, policies and home features as a listing shows them

A listing page has three blocks: **Policies**, **Building amenities** (in three groups) and **Home features**.
An empty group says "No info on <group>". An empty Policies block says "Sorry, policy info isn't available
right now. Check back later." (P4–P7). **verified, P1–P7**

An item can carry sub-items, shown under it: "Pets allowed" › "Cats and dogs allowed"; "View" › "City",
"Garden"; "Private outdoor space" › "Balcony, Garden, Roof deck, Terrace"; "Fireplace" › "Decorative";
"Doorman" › "Virtual"; "Parking" › "Garage".

| Block / group | Items seen | Source |
|---|---|---|
| Policies | Co-purchase allowed · Gifts allowed · Parents buying allowed · Pets allowed (› Cats and dogs allowed) · Pied-a-terre allowed · Sublets allowed | P1, P2, P3; X adds Smoke-free |
| Building amenities › Services and facilities | Elevator · Laundry in building · Doorman (› Virtual) · Package room · Parking (› Garage) · Storage space · Wheelchair access | P1, P2, P3, P6, P7. X adds Bike room, Concierge, Full-time doorman, Live-in super, Verizon Fios |
| Building amenities › Wellness and recreation | Gym | P3. X adds Children's playroom, Swimming pool |
| Building amenities › Shared outdoor space | Roof deck · Courtyard | P3, P5, P6, P7. X flattens the group to the one tag "Shared outdoor space" |
| Home features | Central air · Dishwasher · Hardwood floors · Washer/dryer · Fireplace (› Decorative) · Loft · View (› City, Garden) · Private outdoor space (› Balcony, Garden, Roof deck, Terrace) | P1, P2, P3, P5, P6, P7, P8 |

- The first probe's other items (Hot tub, Media room, Cold storage, Locker/cage, Valet parking, Gas fireplace,
  Water view, Skyline view, Guarantors accepted, Smoke-free on a page) were **not seen on a page**. Water view
  and Smoke-free are in the export. They are plausible, not verified.
- Export vs page: the export has three flat columns (Building Policies, Home Features, Building Amenities), no
  group names and no sub-items. A page's "View › City" is the export's "City view". **verified, X against P2**
- "No pets" never appears. Absence is the only signal, and a blank Policies block can mean StreetEasy has no
  policy data at all (P4–P7). Never derive "no pets" from a blank. **verified**

## What we already get

| Field | Export column | Link read (Firecrawl extract, `engine/parser/listing.ts`) | In the engine today |
|---|---|---|---|
| Type | Property Type, Building Type | `property_type` ("Condo, Co-op, Condop or Townhouse") | `condo, coop, condop, townhouse, multi_family, other`. `house` and `single-family` map to townhouse; anything else becomes `other` with a low-confidence note |
| Neighborhood | Neighborhood, Building Neighborhood | `neighborhood` | free text |
| Resale / new dev | none | `new_development`, `sponsor_unit`, `income_restricted` as yes/no flags | `sponsor_unit` is a decision-provider question (`server/decide/registry.ts`); new development and income-restricted are read but have no field in `PropertyFacts` |
| Policies | Building Policies | `policies` tags | tags |
| Amenities | Building Amenities | `amenities` tags | `deriveFromAmenities` pulls doorman level, concierge, parking, shared outdoor; the rest stay tags |
| Features | Home Features | `features` tags | views, private outdoor, etc. derived |
| Year built, units, stories | Units / Stories in Building | `year_built`, `building_units`, `building_stories` | read |

For Dispatch 16: the extract's type hint should list the labels StreetEasy actually shows (Condo, Co-op,
Condop, House, N-family home), not "Townhouse"; "Two-, Three-, Four-family home" map to `multi_family`, and
"House" to `townhouse` (or a `house` type, per NW-018 a).

## Recommended data shape

```ts
type PropertyType =
  | 'condo' | 'coop' | 'condop' | 'townhouse' | 'house' | 'multi_family' | 'other';
// StreetEasy shows "House" for a single-family townhouse and "Two-family home" etc. for multi-family

type SaleKind =                  // StreetEasy's third field; one value
  | 'resale' | 'sponsor' | 'restricted' | 'new_development' | 'foreclosure'
  | 'auction' | 'short_sale' | 'other';
// seen: "Resale", "Sponsor unit", "Restricted sale". New development is a card badge, kept as a flag too

interface PropertyFacts {
  property_type: PropertyType;
  property_type_label?: string;   // text as shown ("Three-family home")
  sale_kind?: SaleKind;
  sale_kind_label?: string;       // text as shown
  hdfc: boolean | 'unknown';      // Co-op + "Restricted sale"; "HDFC" in the text confirms
  neighborhood?: string;          // SE name as shown
  borough?: 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx' | 'Staten Island' | 'Other';
  floors?: number;                // townhouse / house: floors in the home (NW-019)
}
```

- Keep HDFC as a flag, not a type: P4 is "Co-op" with "Restricted sale".
- Keep `sponsor` in `SaleKind` and also keep the decision question `sponsor_unit`; one signal fills both.
- Neighborhood: the static list `{ name, borough }` is now in the repo. Store the name as shown and keep
  unknown names.
- Policies and amenities stay as tags. Add `pets: 'allowed' | 'not_listed'` and `smoke_free: boolean`.

### What can auto-fill from a link

| Field | From a link | From the export | Notes |
|---|---|---|---|
| property_type | yes | yes | map the label; keep raw text when unknown |
| sale_kind | yes, once the extract asks for the grey line's third value | no (no column) | map "Resale", "Sponsor unit", "Restricted sale" |
| hdfc | yes when the sale kind is "Restricted sale" on a co-op | no | else ask |
| neighborhood, borough | yes | neighborhood yes; borough from the static list | |
| floors (house) | partly | no | usually in the description |
| pets, smoke-free | yes (policy tags) | yes | |

## Still unverified: Kimani's five-minute checklist

Everything above not marked verified. Two minutes in a browser, three in an export:

1. **Co-op in the export.** In StreetEasy's comp tool, export any search that includes a co-op. In the
   `Property Type` column, is it "Co-op" or "Coop"? And the `Building Type` for it ("Co-op building"?).
2. **A never-sold new development.** Open any unit in a building StreetEasy badges "New development" where no
   unit has sold yet. Copy the three words of the grey line: does the third say "Sponsor unit" or
   "New development"?
3. **Foreclosure or short sale.** If one turns up in a search, copy its grey line's third word.
4. **Townhouse.** If any listing's grey line says "Townhouse" rather than "House", note the link.
5. **Photos (item 4).** Already confirmed from seven listing pages (all `photos.zillowstatic.com`). If you open
   a listing whose photos come from another host (right-click a photo › Copy image address), send the address.
