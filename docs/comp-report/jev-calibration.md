# Jev calibration — Dispatch 10, phase 2

**Arbiter (CR-D).** Pre-registered on 2026-10-14, before any live call to Jev. **No results yet:** the run waits on
Kimani's Jev key. Each "Results" section below fills in from the live run.

## What this measures

For each question and each provider, it measures how often an answer matches a person's reading of the same listing,
at each probability. Phase 2 ends with a proposed bar per question, or "not ready". Casanova then puts the next
decision to Kimani: which questions start showing agents a suggestion. Nothing is shown to agents in this dispatch.

## The labelled set

- **The sheet is [`jev-labels.csv`](jev-labels.csv).** It has 30 StreetEasy listings, and every class column was blank
  when it was committed, before any call to Jev. That commit is the pre-registration.
- **Where the listings come from:**
  - Hannah's export: 10 of its 11 rows. 79 Laight #1A is a closing record with no listing text.
  - The subject, 100 Barclay #17L.
  - Frankie's email: 111 Fulton #517, #315 and #309, and 20 Pine #617.
  - Web searches for the classes the export's Tribeca condos won't have: 15 listings. The classes are tenant in place,
    sponsor units, estate or as-is, "bring your architect", river and park views, private and shared terraces, and parking.
- **`picked_for` says why a listing was picked. It isn't a label.** Searching by phrase favours listings that state a
  class outright. The results report that, with the positives counted on their own.
- **The text is what a link read gets.** Export rows carry no listing text: "Agent Commentary" is empty in all 11 rows.
  So Jev sees the scrubbed description of the listing's page, as an import stores it. The person labelling reads the
  same page.

## How to label it (Kimani or Hannah, about 20 minutes)

1. **Don't look at any Jev output first.** The point is that the labels come before the answers.
2. **Open the row's link and read only the listing's description.** Skip the photos, the amenity tags and the
   building page.
3. **If the page has no description, put `no` in `has_text` and leave the row.** Otherwise put `yes`.
4. **Fill each class column with one key, exactly as written below.**
   - **For a yes/no column, `no` means the description doesn't say so.** It doesn't mean the opposite is true.
   - **If you're unsure, pick the closest key and say why in `note`.**
5. **Put your initials in `labelled_by` and the date in `labelled_on`.**
6. **Edit the file on GitHub and commit it.** The test suite checks every cell, so a typo fails CI and names its row.
   If a link no longer opens, say so in `note`. Swapping in another listing is fine, but only before any live run.

The wording is the registry's own (`REGISTRY_VERSION` `listing-2026-09-29.1`, in
`tools-src/comp-report/server/decide/registry.ts`). Where the registry says "false", read it as `no`.

**`condition`** — What condition does the description say the home's interior is in? Praise alone ("beautiful", "stunning", "sun-filled") is not a statement of condition.

- `renovated`: the text says the home itself was renovated, redone or newly built, or calls it mint or brand-new. Not a renovation of the building's lobby or amenities only, and not new appliances or fresh paint alone.
- `good`: the text says the home is well kept, move-in ready or in good condition, without saying it was renovated. Not a home the text calls renovated, and not one it says needs work.
- `needs_work`: the text says the home needs updating or renovation, is original or dated, or invites the buyer to renovate ("bring your architect", "TLC", "estate condition"). Not a home that is only offered with the option to customize.
- `not_stated`: the text says nothing about the home's condition, or too little to tell which of the others it is.

**`view`** — What does the description say the home's own windows look out on? Count only views from inside this home, not from a shared roof deck or other common space.

- `notable`: the text says the home looks out on a park, the water, the skyline or a landmark, or has open, unobstructed views over the rooftops. Not a view from a shared or common space, and not a park or river the text only says is nearby.
- `ordinary`: the text says the windows face the street, a courtyard or a neighbouring building, or that the view is partial or obstructed. Not a park, water, skyline or landmark view from the home.
- `not_stated`: the text says nothing about what the home's windows look out on.

**`outdoor`** — Does the description say the home has outdoor space of its own?

- `private`: the text says this home has its own balcony, terrace, private roof deck, garden or patio, for this home's use only. Not a shared roof deck, courtyard or garden other residents use, and not a Juliet balcony or a window box.
- `shared_only`: the text mentions outdoor space only as the building's shared or common space. Not space that belongs to this home alone.
- `not_stated`: the text mentions no outdoor space, for the home or for the building.

**`sponsor_unit`** — Does the description say this home is a sponsor sale?

- `yes`: The text says the home is sold by the building's sponsor, its developer or a holder of unsold shares: a "sponsor unit", "sponsor sale", "no board approval" because it is a sponsor sale, or a new development's first sale by its developer.
- `no`: The text doesn't say so. A resale by an owner who bought it earlier is false, and so is a text that doesn't say who is selling.

**`estate_or_as_is`** — Does the description say this is an estate sale or an as-is sale?

- `yes`: The text says the home is sold by an estate or an executor, or is sold as-is ("estate sale", "sold as-is", "being sold in its current condition").
- `no`: The text doesn't say so. A home that needs work, without the text saying it is sold as-is or by an estate, is false.

**`tenant_in_place`** — Does the description say the home is sold with a tenant in place?

- `yes`: The text says the home is sold occupied, with a tenant living in it or a lease the buyer takes over ("tenant in place", "investor unit, leased through …", "sold with a tenant").
- `no`: The text doesn't say so. "Great investment" or "sublets allowed" alone is false, and so is a home the text says will be delivered vacant.

**`parking_or_storage_included`** — Does the description say a parking space or a storage unit is included in the price?

- `yes`: The text says a parking space or a private storage unit comes with the home at this price ("deeded parking included", "storage unit conveys", "includes a storage cage").
- `no`: The text doesn't say so. Parking or storage the building offers for rent, or for sale separately, is false, and so is a garage in the building with no space said to be included.

## How it runs, once the key is in

| Step | Who | What |
|---|---|---|
| 1 | Kimani | **In Netlify (Functions scope):** set `AI_GATEWAY_API_KEY`, `CR_JEV_ZDR=off` and `CR_DECIDE_KEY`, then redeploy. **In the Claude Code environment:** set the same `CR_DECIDE_KEY`. `CR_DECIDE_KEY` is any random string of 32 characters or more, such as one from a password manager. Never paste it into a chat. |
| 2 | Arbiter | `npm run -s jev -- probe`: the go/no-go call. On NO-GO, stop: the outcome names why. An account gate shows as `http-403`. |
| 3 | Kimani | Set `CR_JEV_MODE=watch` in Netlify, then redeploy. |
| 4 | Kimani | In the comp report, paste the sheet's links into one comp's links, 20 at a time. Each read costs Firecrawl credit: 30 of an admin's 200 reads a day. With watch mode on, each read also queues the listing's own questions for Jev. |
| 5 | Arbiter | Run `labelled`, then `results`. Run `orders` for the order check, and `probes --out=…` to pin the parser to the raw bodies. Write up the sections below. |

## The analysis plan

The plan is pre-registered: it's implemented in `agreement.ts`, and fixed before any data.

- **A verdict:**
  - **A choice is asked in both option orders, in one request.** It counts when both orders give the same top option.
    Its probability is the mean of the two orders' probabilities.
  - **A yes/no is asked once.** Its probability is the larger of P and 1 − P.
- **Agreement:** the answer equals the label. For a yes/no, a `no` label matches a "false" answer.
- **Reporting:** results are reported per question and provider, with Haiku 4.5 asked alongside Jev as a second judge.
  The probability bands are:
  - order flip;
  - below 0.4;
  - 0.4–0.6, which is always "ask";
  - 0.6–0.8;
  - 0.8–0.9;
  - 0.9–0.95;
  - 0.95 and above.
- **How a bar is proposed.** The high bar is the lowest of 0.6, 0.7, 0.8, 0.85, 0.9 and 0.95 that meets all three
  conditions. Only order-stable answers at or above it count, outside 0.4–0.6:
  - there are at least 10 of them;
  - at least 95% of them match the labels;
  - at least 3 of the matches are on a positive label, meaning a named class or a yes.
- **The middling bar** is found the same way at 85%, and must sit below the high bar.
- **No high bar means the question is "not ready".** The rule is `BAR_RULE` in `agreement.ts`.
- **Why the positives rule exists.** Most listings say nothing about a sponsor sale or a tenant. Without the rule, a
  question could pass on "not stated" and "no" answers alone.
- **Also measured:**
  - coverage: answered against dropped, by reason;
  - latency: in the queue, and per call;
  - cost per listing: Jev on imports only;
  - **order independence on 20 questions.** On each of the 5 fixtures, each choice is asked in each order alone, and
    the sponsor yes/no alone. Each is compared with the same fixture asked everything in one request. It costs about 40
    calls, all on fixtures, with no user data;
  - **re-asking.** The labelled batch re-asks the text an import already asked, so the two answers on the same text
    can be compared.

## Results

### The go/no-go call
Not run yet.

### Coverage
Not run yet.

### Latency
Not run yet.

### Cost per listing
Not run yet.

### Both orders in one request, against separate requests
Not run yet.

### Agreement with the labels, by band
Not run yet.

### Proposed bars
Not run yet.

### The drift check's first week
Not run yet. The weekly check re-asks the five fixtures in `fixtures.ts` every Monday at 06:17 UTC, once watch mode
is on. The readout's `drift` section compares each answer with the first one recorded.

— Arbiter (CR-D)
