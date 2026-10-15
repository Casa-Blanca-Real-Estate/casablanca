# NW-018 probe: what StreetEasy's grey line and amenity lists can say

Probe date 2026-10-15. StreetEasy blocks direct fetches, so this is built from web-search snippets of StreetEasy pages, the repo's reference export, and the parsers.

Confidence key: **seen SE** (a StreetEasy page or help article in a search result) · **seen export** (the reference CSV) · **repo** (what our parser already assumes) · **inferred** (memory or reasoning; verify).

## What is confirmed

- The line is real. Search results for 100 United Nations Plaza units (#5A, #3D, #19C, #25G, #31C, #7G, #20E) show "Condo", "Turtle Bay", "Resale" as the three tags. **seen SE**
- StreetEasy's own listing-feed format (the XML agents upload) has a **building type** field and a separate **sale status** field. They are different fields. **seen SE**
  - Building type: condo, coop, townhouse, condop, rental, house, other.
  - Sale status: Sponsor Unit, Resale, Foreclosure, Auction Sale, Restricted Sale, Short Sale.
- So "Resale" is not a property type. It sits in a second field. The grey line likely renders feed values (type, neighborhood, sale status), but the exact display labels were not seen for every value.

## Field 1: type

| Value | Source | Sure? |
|---|---|---|
| Condo | line on 100 UN Plaza; export "Property Type" | seen SE, seen export |
| Co-op | feed value `coop`; display spelling "Co-op" is the likely label | seen SE (feed), label inferred |
| Condop | feed value `condop` | seen SE (feed) |
| Townhouse | feed value `townhouse`; SE Experts docs define a townhouse listing as a 1-, 2- or 3-family home | seen SE |
| House | feed value `house` | seen SE (feed) |
| Multi-family | a "Multi Family" browse category beside condos, co-ops, houses, townhouses; not in the feed's building-type list | seen SE (browse), label inferred |
| Rental | feed value `rental` (rental buildings; irrelevant to sales comps) | seen SE (feed) |
| Other | feed value `other` | seen SE (feed) |

The export also has a **Building Type** column, which reads "Condo building" for all 11 rows. So the building label and the unit label differ ("Condo building" vs "Condo"). Other building labels (for example "Co-op building") are inferred, not seen. **seen export / inferred**

### Where HDFC, sponsor and new development show up

- **HDFC**: not found as a type value anywhere. It is a co-op with income and resale limits. On StreetEasy it most likely shows as type Co-op plus a sale status such as **Restricted Sale**, or only in the description. Not confirmed. **inferred**
- **Sponsor unit**: a **sale status** value ("Sponsor Unit"), not a type. SE new-development pages list sponsor units ahead of resales. **seen SE**
- **Foreclosure, Auction Sale, Short Sale, Restricted Sale**: sale status values. **seen SE (feed)**
- **Estate / as-is**: not a StreetEasy field. Description only. The tool already asks it as a question (`estate_or_as_is`). **repo**

## Field 2: neighborhood

- StreetEasy uses its own neighborhood names, one per listing, and shows the borough in the page title ("in Turtle Bay, Manhattan"). The export has two columns: **Neighborhood** (the unit) and **Building Neighborhood**; both were "Tribeca" in the reference file. **seen SE, seen export**
- One neighborhood per listing. Names are StreetEasy's, not the city's or the REBNY's. A name can differ from what agents say (Lenox Hill, Yorkville and Carnegie Hill are separate on SE and all "Upper East Side" in speech; the SE page for Upper East Side is an umbrella "area"). **seen SE**
- **Full list could not be pulled.** Search never returned the index page. Get it from the source instead: `https://streeteasy.com/browse` (all boroughs) and `https://streeteasy.com/browse/rental/manhattan` (Manhattan), both found in search results; a person can open them in a browser and copy the lists. **seen SE (URLs)**
- Manhattan names below are from memory and from what search snippets showed. **inferred, verify against the browse page before shipping**:

Alphabet City, Battery Park City, Carnegie Hill, Central Harlem, Central Park South, Chelsea, Chinatown, Civic Center, Clinton (Hell's Kitchen), East Harlem, East Village, Financial District, Flatiron, Fort George, Gramercy Park, Greenwich Village, Hamilton Heights, Harlem, Hudson Square, Hudson Yards, Inwood, Kips Bay, Lenox Hill, Lincoln Square, Little Italy, Lower East Side, Manhattan Valley, Manhattanville, Marble Hill, Meatpacking District, Midtown, Midtown East, Midtown South, Midtown West, Morningside Heights, Murray Hill, NoHo, Nolita, Roosevelt Island, SoHo, South Street Seaport, Stuyvesant Town/PCV, Sutton Place, Theater District, Tribeca, Turtle Bay, Upper East Side, Upper West Side, Washington Heights, West Chelsea, West Harlem, West Village, Yorkville.

Seen in snippets: Upper East Side, Lenox Hill, Yorkville, Carnegie Hill, Civic Center, Turtle Bay, Tribeca, Chelsea, Flatiron, Gramercy Park, Greenwich Village, West Village, East Village, Lower East Side, Midtown East, Battery Park City, East Harlem, Morningside Heights, Washington Heights, Lincoln Square.

To get the other boroughs: the same `/browse` page groups neighborhoods under Manhattan, Brooklyn, Queens, Bronx, Staten Island (and Jersey-side areas StreetEasy also covers). Plan: capture it once into a static list in the repo (see shape below), re-check twice a year.

## Field 3: resale or new development

| Value | Source | Sure? |
|---|---|---|
| Resale | line on 100 UN Plaza; feed sale status | seen SE |
| Sponsor Unit | feed sale status | seen SE (feed) |
| New development | an SE filter and building flag ("New Developments" pages); whether the line says "New development" or "Sponsor" for a developer's own unit is not confirmed | seen SE (filter), label inferred |
| Foreclosure / Auction / Short Sale / Restricted Sale | feed sale status | seen SE (feed) |

Treat the third field as a free label with a known set, not a closed enum. Unknown text must be kept as shown.

## Amenities as a listing shows them

Building pages split into **Policies**, then **Building amenities** in groups. A group with nothing says "No info". **seen SE**

| Group | Items seen (SE pages or export) |
|---|---|
| Policies | Guarantors accepted · Pets allowed · Smoke-free · Pied-a-terre allowed · Sublets allowed (rental-leaning ones are inferred to hide on sale pages) |
| Services and facilities | Elevator · Doorman / Full-time doorman · Concierge · Live-in super · Package room · Laundry in building · Bike room · Storage space · Cold storage · Locker/cage · Wheelchair access · Verizon Fios · Parking / Garage parking / Valet parking |
| Wellness and recreation | Gym · Swimming pool · Hot tub · Children's playroom · Media room |
| Shared outdoor space | Courtyard · Garden · Deck · Patio · Roof deck · "Shared outdoor space" (the export flattens the group into this one tag) |
| Private outdoor space (unit) | Balcony · Terrace · Garden · Roof deck · Patio. In the export these appear under Home Features. |
| Home features (unit) | Central air · Dishwasher · Hardwood floors · Washer/dryer · Fireplace · Gas fireplace · Loft · City view · Water view · Skyline view |

Export vs page: the export puts everything in three columns (Building Policies, Home Features, Building Amenities) with no group names. Page groups are lost, so "Shared outdoor space" in the export is one flat tag while the page lists courtyard, garden and so on. **seen export**

### Pets and smoking

- Policies shows tags, not a rule. Seen: "Pets allowed", "Smoke-free". 8 of 11 export rows say "Pets allowed", one adds "Smoke-free", two are blank. **seen export**
- Blank means "StreetEasy shows nothing", not "no pets". One SE page shows cats and dogs allowed; a StreetEasy blog says many buildings ban pets or cap dog size, and that detail is in the building's house rules, not the tag. **seen SE**
- Nothing seen for "No pets" as a tag. Absence is the only signal. **inferred**

## What we already get

| Field | Export column | Link read (Firecrawl extract, `engine/parser/listing.ts`) | In the engine today |
|---|---|---|---|
| Type | Property Type, Building Type | `property_type` ("Condo, Co-op, Condop or Townhouse") | `condo, coop, condop, townhouse, multi_family, other`. `house` and `single-family` map to townhouse; anything else becomes `other` with a low-confidence note |
| Neighborhood | Neighborhood, Building Neighborhood | `neighborhood` | free text |
| Resale / new dev | none | `new_development`, `sponsor_unit`, `income_restricted` as yes/no flags | `sponsor_unit` is a decision-provider question (`server/decide/registry.ts`); new development and income-restricted are read but have no field in `PropertyFacts` that I found |
| Policies | Building Policies | `policies` tags | tags |
| Amenities | Building Amenities | `amenities` tags | `deriveFromAmenities` pulls doorman level, concierge, parking, shared outdoor; the rest stay tags |
| Features | Home Features | `features` tags | views, private outdoor, etc. derived |
| Year built, units, stories | Units / Stories in Building | `year_built`, `building_units`, `building_stories` | read |

Gaps: no field for the third value as a label ("Resale"); no HDFC or restricted-sale capture except the `income_restricted` flag; no floors-count for houses (NW-019); "Building Type" is read but the engine does not use it as a separate field.

## Recommended data shape

```ts
type PropertyType =
  | 'condo' | 'coop' | 'condop' | 'townhouse' | 'house' | 'multi_family' | 'other';
// add 'house' (whole brownstone, single-family) so it stops folding into townhouse

type SaleKind =                  // StreetEasy's third field; one value
  | 'resale' | 'new_development' | 'sponsor' | 'restricted' | 'foreclosure'
  | 'auction' | 'short_sale' | 'other';

interface PropertyFacts {
  property_type: PropertyType;
  property_type_label?: string;   // text as shown, kept when 'other'
  sale_kind?: SaleKind;
  sale_kind_label?: string;       // text as shown
  hdfc: boolean | 'unknown';      // independent flag: co-op + income limits
  neighborhood?: string;          // SE name as shown
  borough?: 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx' | 'Staten Island' | 'Other';
  floors?: number;                // townhouse / house: floors in the home (NW-019)
}
```

- Keep HDFC as a flag, not a type. It is a co-op with limits, and it can pair with Restricted Sale.
- Keep `sponsor` in `SaleKind` and also keep the decision question `sponsor_unit`; the link read fills both from one signal.
- Neighborhood: a static list `{ name, borough }` captured from `/browse`, used for a picker and for matching. Store the name as shown, and keep unknown names (do not reject).
- Policies and amenities stay as tags. Add one derived field, `pets: 'allowed' | 'not_listed'`, and `smoke_free: boolean`. Never derive "no pets" from a blank.

### What can auto-fill from a link

| Field | From a link | From the export | Notes |
|---|---|---|---|
| property_type | yes | yes | map the label; keep raw text when unknown |
| sale_kind | yes, once the extract asks for the grey line's third tag | no (no column) | add "the third tag of the grey line" to the extract schema; map "Resale", "Sponsor", "New development" |
| hdfc | partly | no | only if the page says HDFC or income-restricted; else ask |
| neighborhood, borough | yes | neighborhood yes; borough from the static list | |
| floors (house) | partly | no | usually in the description, not a labelled field |
| pets, smoke-free | yes (policy tags) | yes | |

## Still unverified (ask a person with a browser, five minutes)

1. Open one co-op, one townhouse, one new-development sponsor unit and one HDFC listing on StreetEasy and copy each grey line.
2. Copy the Manhattan and other-borough lists from `streeteasy.com/browse`.
3. Check whether the export's Property Type column says "Co-op" or "Coop", and whether any export row ever has a sale-kind value.
