# The writer's eval, rerun on the new house voice (2026-10-29)

The same twelve drafts as `writer-eval-2026-10-29.md`, rerun after CR-3's four fixes: house voice
`house-2026-10-29`, prompt `cr5-2026-10-29`, QA `qa-2026-10-29`. About $0.21.

## What changed, against the first run

- **Things to consider are the agent's.** Barclay: the agent's two points, tightened; the writer's three
  extra points are gone. #517: Frankie's three. With no points from the agent, the section stays empty
  (the code drops anything the writer sends back).
- **No headline names one price for the home.** The closest-comp headline now says what that comp sold
  for. QA's range check also flags "would put #17L at about $4.23M" if it ever comes back.
- **Carrying costs once.** No comp in the Barclay full email closes on a carrying-cost line; the agent's
  point covers it. "Shows what sellers are asking now" appears once, not on each in-contract comp.
- **The text message is a text.** No greeting and no email layout: the headline, the estimate note, the
  next step, the agent's name, then the disclaimer (D-13 still requires it, and QA blocks without it).
- **Still the same:** 11 of 12 pass QA. The one flag is the same fair one: #517's full email writes
  Frankie's "on the market in 12/25" as "December 2025", and QA asks the agent to confirm it.

---

> effort `medium`, prompt `cr5-2026-10-29` (house voice `house-2026-10-29`).

## 100 Barclay Street #17L (the sample)

Result: With estimates. Comps that count: 6.

### Full email

**Headlines**

- The three sales put #17L at $2,112–$2,457 a square foot, about $4.23M–$4.92M.
- The closest sale, 200 Chambers Street #10A, sold for $4,650,000, or $2,112 a square foot.
- The three sales closed a median 4.0% below their last asks, after a median 148 days on the market.

**The email, with the first headline** — subject: 100 Barclay Street #17L: what the comps say

```text
Hi Jordan and Sam,

The three sales put #17L at $2,112–$2,457 a square foot, about $4.23M–$4.92M.

The home’s interior size is our estimate.

I focused on full-service condos close in size and floor, sold in the last few months.

SOLD
- 200 Chambers Street #10A — sold for $4,650,000 ($2,112 a sq ft), 3.0% below its last ask · 24 days on the market — https://streeteasy.com/building/200-chambers-street-new_york/10a
  The closest match: a full-service Tribeca condo with water views, close in size.
  201 sq ft bigger, the same three bedrooms, 7 floors lower.
- 5 Franklin Place #14A — sold for $4,175,000 ($2,269 a sq ft), 4.0% below its last ask · 148 days on the market — https://streeteasy.com/building/5-franklin-place-new_york/14a
  Full service, similar size: 160 sq ft smaller, half a bath more, 3 floors lower.
  Better outdoor space than #17L, and its square footage is approximate.
- 66 Leonard Street #12A — sold for $5,700,000 ($2,457 a sq ft), 4.2% below its last ask · 259 days on the market — https://streeteasy.com/building/textile-building/12a
  Full-service building, similar floor and size.
  319 sq ft bigger, half a bath fewer, 5 floors lower.
  Took the longest of the three sales to get a deal.

IN CONTRACT
- 108 Leonard Street #7G — last asking $4,835,000 ($2,400 a sq ft) · 300 days on the market — https://streeteasy.com/building/108-leonard/7g
  Full service and nearly the same size: 14 sq ft bigger, half a bath more.
  10 floors lower. Shows what sellers are asking now.
- 25 North Moore Street #9C — last asking $4,495,000 ($2,387 a sq ft) · 18 days on the market — https://streeteasy.com/building/atalanta-condominium/9c
  117 sq ft smaller, one bathroom fewer, 8 floors lower.
  Got a deal in 18 days, the quickest here.

ACTIVE
- 100 Barclay Street #11F — asking $4,250,000 · 2 days on the market — https://streeteasy.com/building/100-barclay/11f
  Same building, 6 floors lower, with better outdoor space and half a bath more.
  Just listed, so it's your nearest competition; no square footage was given, so there's no price per square foot to compare.

THINGS TO CONSIDER
- Newer towers nearby trade higher than 100 Barclay.
- Its monthly charges run below most of the comparable sales.

PRICE PER SQ FT FOR 100 BARCLAY STREET #17L
$2,112 - $4.23M
$2,150 - $4.3M
$2,200 - $4.4M
$2,250 - $4.5M
$2,269 - $4.54M
$2,300 - $4.6M
$2,350 - $4.7M
$2,400 - $4.8M
$2,450 - $4.9M
$2,457 - $4.92M

I'd list in October near the top of what the sales support, leaving some room on price for a quick, clean close.

Hannah

This comparative market analysis is an estimate of market value prepared by a licensed real estate agent for informational purposes. It is not an appraisal. Data provided by StreetEasy and other sources, which may be incomplete or subject to change.
```

**QA:** Ready to send


<sub>the writer’s model · 16s · 4198 in / 1733 out · ~$0.063</sub>

### Short email

**Headlines**

- The three sales put #17L at $2,112–$2,457 a sq ft, or about $4.23M–$4.92M.
- The closest match, 200 Chambers Street #10A, sold for $4,650,000, or $2,112 a sq ft.
- The three sales closed a median 4.0% below their last asks, after a median 148 days on the market.

**The email, with the first headline** — subject: 100 Barclay Street #17L: what the comps say

```text
Hi Jordan and Sam,

The three sales put #17L at $2,112–$2,457 a sq ft, or about $4.23M–$4.92M.

The home’s interior size is our estimate.

SOLD
- 200 Chambers Street #10A — sold for $4,650,000 ($2,112 a sq ft), 3.0% below its last ask · 24 days on the market — https://streeteasy.com/building/200-chambers-street-new_york/10a
  The closest match: a full-service Tribeca condo with water views, 201 sq ft bigger and 7 floors lower.
- 5 Franklin Place #14A — sold for $4,175,000 ($2,269 a sq ft), 4.0% below its last ask · 148 days on the market — https://streeteasy.com/building/5-franklin-place-new_york/14a
  Full service, 160 sq ft smaller (its size is approximate) with better outdoor space, and $3,078 a month more to carry.
- 66 Leonard Street #12A — sold for $5,700,000 ($2,457 a sq ft), 4.2% below its last ask · 259 days on the market — https://streeteasy.com/building/textile-building/12a
  Full service, 319 sq ft bigger and 5 floors lower, with half a bathroom fewer.

I'd suggest listing in October near the top of what the sales support, leaving some room on price for a quick, clean close.

Hannah

This comparative market analysis is an estimate of market value prepared by a licensed real estate agent for informational purposes. It is not an appraisal. Data provided by StreetEasy and other sources, which may be incomplete or subject to change.
```

**QA:** Ready to send


<sub>the writer’s model · 9.2s · 2680 in / 923 out · ~$0.030</sub>

### Text message

**Headlines**

- The three sales put #17L at $2,112–$2,457 a sq ft, about $4.23M–$4.92M.
- The closest sale went for $4,650,000, at $2,112 a sq ft.
- The sales typically closed 4.0% below their last ask, after a median of 148 days on the market.

**The email, with the first headline** — subject: 100 Barclay Street #17L: what the comps say

```text
The three sales put #17L at $2,112–$2,457 a sq ft, about $4.23M–$4.92M. The home’s interior size is our estimate. I'd suggest listing in October near the top of what the sales support, with some room on price for a quick, clean close. Happy to talk it through when you have a minute.
– Hannah

This comparative market analysis is an estimate of market value prepared by a licensed real estate agent for informational purposes. It is not an appraisal. Data provided by StreetEasy and other sources, which may be incomplete or subject to change.
```

**QA:** Ready to send


<sub>the writer’s model · 4.3s · 1413 in / 396 out · ~$0.014</sub>

## 111 Fulton Street #517 (Frankie’s, rebuilt)

Result: On the facts. Comps that count: 8.

### Full email

**Headlines**

- The three closest sales put #517 at $949–$1,031 a sq ft, or about $689K–$748K.
- The four sales here had a median price of $717,500, or $1,006 a sq ft.
- Two listings that asked around $630,000 never sold, while the one in contract was last asking $715,000 and the one still for sale is asking $725,000.

**The email, with the first headline** — subject: 111 Fulton Street #517: what the comps say

```text
Hi Leeann,

The three closest sales put #517 at $949–$1,031 a sq ft, or about $689K–$748K.

I focused on apartments on the 2nd through 8th floors and close in size to #517. Anything much higher up, around 550 sq ft or over 800 sq ft wouldn't be a fair comparison.

SOLD
- 80 John Street #2A — sold for $695,000 ($1,031 a sq ft)
  About 50 sq ft smaller and three floors lower than #517.
  It sets the top of the range.
- 20 Pine Street #715 — sold for $660,000
  A bigger apartment, two floors higher.
  It may face the interior, with little light.
  It took 175 days to get a deal, the longest of these sales.
- 20 Pine Street #712 — sold for $740,000 ($949 a sq ft)
  Similar layout, in a building with similar amenities.
  54 sq ft bigger and two floors higher; it sets the low end of the range.
- 88 Greenwich Street #602 — sold for $740,000 ($1,006 a sq ft)
  Closest in size: 10 sq ft bigger, one floor higher.
  Sold last November, the oldest sale here.

IN CONTRACT
- 111 Fulton Street #315 — last asking $715,000
  In your building: same layout, two floors lower.
  It took 41 days to get a deal, which could close at asking or slightly below.

ACTIVE
- 20 Pine Street #617 — asking $725,000
  A bigger apartment, one floor higher, in a building with similar amenities.
  On the market 86 days so far.

DIDN’T SELL
- 111 Fulton Street #309 — on the market for $625,000, and never sold
  In your building, a similar size, two floors lower.
  Listed in December 2025.
- 111 Fulton Street #716 — on the market for $635,000, and never sold
  In your building, a similar size, two floors higher.
  The second apartment in the building that didn't sell.

THINGS TO CONSIDER
- The Greenwich Club is a similar building that trades higher than 111 Fulton.
- 56 Pine trades lower than 111 Fulton.
- Lower carrying costs can lead sellers to list higher; higher carrying costs tend to mean lower asking prices.

PRICE PER SQ FT FOR 111 FULTON STREET #517
$949 - $689K
$960 - $696K
$980 - $711K
$1,000 - $725K
$1,006 - $730K
$1,020 - $740K
$1,031 - $748K

Let me know if you have any questions, and feel free to share this with your father. If you put in an offer, I'd ask the seller to take care of the assessment.

Frankie

This comparative market analysis is an estimate of market value prepared by a licensed real estate agent for informational purposes. It is not an appraisal. Data provided by StreetEasy and other sources, which may be incomplete or subject to change.
```

**QA:** 1 thing to fix

- December 2025 doesn’t match the comps, the facts or anything you stated: edit, or keep it and say why. — “December 2025” (…two floors lower. Listed in December 2025. - 111 Fulton Street #716 —…)

<sub>the writer’s model · 20.8s · 3137 in / 2280 out · ~$0.059</sub>

### Short email

**Headlines**

- The three closest sales put #517 at $949–$1,031 a square foot, or about $689K–$748K.
- The four recent sales in the numbers sold at a median of $1,006 a square foot and a median price of $717,500.
- The one active listing is asking $725,000, while the two listings that didn't sell had a median last ask of $630,000.

**The email, with the first headline** — subject: 111 Fulton Street #517: what the comps say

```text
Hi Leeann,

The three closest sales put #517 at $949–$1,031 a square foot, or about $689K–$748K.

SOLD
- 80 John Street #2A — sold for $695,000 ($1,031 a sq ft)
  51 sq ft smaller and three floors lower than #517.
- 20 Pine Street #715 — sold for $660,000
  Bigger and two floors higher, but it may face the interior with little light, carries slightly higher costs and took 175 days to get a deal.
- 20 Pine Street #712 — sold for $740,000 ($949 a sq ft)
  Similar layout in a building with similar amenities, but 54 sq ft bigger and two floors higher.
- 88 Greenwich Street #602 — sold for $740,000 ($1,006 a sq ft)
  Similar size, just 10 sq ft bigger and one floor higher, though it sold last November.

Let me know if you have any questions, and feel free to share this with your father. If you put in an offer, I'd ask the seller to take care of the assessment.

Frankie

This comparative market analysis is an estimate of market value prepared by a licensed real estate agent for informational purposes. It is not an appraisal. Data provided by StreetEasy and other sources, which may be incomplete or subject to change.
```

**QA:** Ready to send


<sub>the writer’s model · 9.4s · 1970 in / 935 out · ~$0.027</sub>

### Text message

**Headlines**

- The three closest sales put #517 at $949–$1,031 a sq ft, about $689K–$748K.
- The four sales in the numbers had a median price of $717,500, or $1,006 a sq ft.
- Two listings didn't sell, the lowest at $625,000, while the one active listing is asking $725,000.

**The email, with the first headline** — subject: 111 Fulton Street #517: what the comps say

```text
The three closest sales put #517 at $949–$1,031 a sq ft, about $689K–$748K. Send me any questions, and feel free to share this with your father. If you make an offer, I'd ask the seller to take care of the assessment.
– Frankie

This comparative market analysis is an estimate of market value prepared by a licensed real estate agent for informational purposes. It is not an appraisal. Data provided by StreetEasy and other sources, which may be incomplete or subject to change.
```

**QA:** Ready to send


<sub>the writer’s model · 5.5s · 1075 in / 564 out · ~$0.016</sub>

Spent about $0.21.
