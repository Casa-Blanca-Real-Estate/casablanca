# Workflow Audit: How ChatGPT Has Been Used for Comparable Analysis

Based on the comp and deal work across this project, there is a very clear repeatable workflow underneath what we’ve been doing. The biggest opportunity for the build is not simply “AI that writes comp analyses”; it is a **structured real-estate decision engine that does the math first, preserves the assumptions, and then generates the right client-facing argument for the specific audience.**

## 1. How You’ve Actually Been Using ChatGPT

Your process usually has four stages.

### Stage 1 — Give me the property/data and establish the question

You typically start with a listing, comp report, spreadsheet, proposed purchase price, or offer structure and ask something like:

- Is $11.5M supported?
- What is this worth based on the closest five comps?
- Why is $3.5M a good price for 100 Barclay 17L?
- Which of these is the better investment?
- What would the combined Tribeca apartment be worth?
- What is the monthly carry/cap rate?
- Which transactions are missing from the pipeline?

So the underlying request is generally not merely **“analyze the comps.”** It is **“use the comps to answer a transaction question.”**

### Stage 2 — Aggressively narrow the analytical lens

One of the most consistent things you do is refine the analysis with follow-up instructions such as:

> “Focus on the data supporting this number.”

> “The seller is a numbers guy.”

> “Based on price per square foot.”

> “Compare to the five most similar ones.”

> “I don’t need to convince him why the apartment is good.”

> “Give me more mathematical support.”

> “What about the outdoor space?”

That means the initial generic CMA is almost never the actual finished product. You want the analysis progressively stripped down to **the evidence that matters to this specific negotiation.**

### Stage 3 — Stress-test assumptions

You frequently catch assumptions that materially alter the result:

- Rent is $58,000 total, not rent plus carrying costs.
- Buyer does not pay taxes/common charges before closing.
- Mortgage should be labeled “mortgage payment,” not necessarily interest-only.
- Deposit is paid at contract signing.
- Rent credits change depending on closing timing.
- Certain units should or should not be included.
- Outdoor space deserves more value than initially assigned.
- A property is materially larger than the comps.
- A transaction belongs in the closed tab rather than the pending tab.

This stage is important because many of the largest errors in these analyses are not arithmetic errors — they are **assumption errors.**

### Stage 4 — Turn the analysis into something usable

You rarely stop at the analysis. You usually want one or more of:

- Seller email
- Buyer email
- Short text
- Investment summary
- Excel model
- Ranked shortlist
- Pricing argument
- Counteroffer language

So your workflow is really:

**DATA → ANALYSIS → TRANSACTION POSITION → COMMUNICATION**

That distinction should be central to the tool you are building.

---

## 2. Your Strongest Prompting Habits

Several practices consistently improve the quality of the output and should probably become actual UI controls in the product.

### You identify the audience

This dramatically changes what you want.

For example, on 60 Collister you specifically said that the seller was a **“numbers guy.”** That changed the answer from descriptive brokerage copy into a much more quantitative argument.

Typical audience modes are:

- **Seller analysis** → Why this is a rational price to accept.
- **Buyer analysis** → Why the buyer is not overpaying.
- **Investment buyer** → Yield, carry, rent, appreciation, downside protection.
- **Broker/internal** → What price is actually defensible before creating the sales narrative.

The tool should therefore have a mandatory **Audience** field:

- Seller
- Buyer
- Investor
- Broker/internal
- Attorney/other

### You tell me the conclusion being tested

For example:

> “Convince him $11.5M is a good price based on the data.”

That is useful because it tells me the negotiation question.

But the best implementation would separate:

**Target price:** $11.5M

from

**Data-supported value:** calculated independently.

Then the system can say:

> $11.5M represents $3,012/SF and is 6.8% above/below the weighted comparable benchmark.

Rather than unconsciously reverse-engineering every assumption to support $11.5M.

### You push toward truly comparable properties

You repeatedly ask things like:

> “Compare to the five most similar ones.”

That is much better than simply averaging every sale in a building or neighborhood.

Your practical definition of similarity appears to be roughly:

**location + building quality + interior size + bedroom count + condition + outdoor space + floor/view + amenities + parking + transaction timing**

That should become a formal comp-scoring algorithm.

### You distinguish value drivers

You consistently call out factors such as:

- Interior square footage
- PPSF
- Terrace/outdoor space
- Deeded parking
- Boutique versus large building
- Floor
- Views
- Exact micro-location
- Condition
- Scarcity of large units
- Monthly carrying costs
- Rent potential
- Closing timing

This is exactly the right analytical approach.

### You keep asking for the underlying math

You often reject vague statements like:

> “This seems to support the high $20Ms.”

and instead ask:

> “Use the price per square foot.”

or:

> “Give an actual range.”

or:

> “Make it more mathematical.”

The product should therefore make every major conclusion **auditable**.

For example:

- **Comparable interior PPSF:** $3,850
- **Subject interior:** 6,700 SF
- **Base indicated value:** $25.80M
- **Outdoor contribution:** $2.1M–$3.0M
- **Parking contribution:** $400K–$600K
- **Indicated range:** $28.3M–$29.4M

Then separately generate the prose.

---

## 3. Where Responses Have Been Consistent

Across the chats, the responses have been relatively consistent in a few important areas.

### Numbers first

Most final analyses eventually gravitate toward:

**price → PPSF → comps → adjustments → implied value**

rather than generic real-estate language.

### Micro-market matters

The responses generally recognize that a generic Manhattan average is not useful.

For Tribeca, for example, the analysis repeatedly moved toward:

- Northwest Tribeca
- Similar building type
- Large-format units
- Outdoor space
- Boutique condo environment

rather than comparing something simply because it was technically in Tribeca.

### Scarcity gets treated separately from PPSF

A recurring theme has been:

> There are very few units of this scale.

That matters because very large apartments do not always trade linearly with smaller-unit PPSF.

### The story is tailored to the transaction

60 Collister is a particularly good example.

When speaking to the seller, the argument eventually became:

**“Here is why $11.5M is economically rational relative to actual transactions.”**

rather than:

**“4A is a beautiful apartment.”**

### Analysis is translated into communication

You frequently get the same underlying analysis repackaged as:

- Detailed explanation
- Email
- Short email
- Text
- Spreadsheet

That part of the workflow is very repeatable and therefore highly automatable.

---

## 4. Where Responses Have Been Inconsistent

This is probably the most useful area for the product build.

### A. Comparable weighting has not been standardized

Sometimes the analysis effectively uses:

- Simple average PPSF
- Closest few comps
- A qualitative weighted range
- The best single comp as an anchor

All can be reasonable, but the method is not always explicit.

The tool should calculate at least:

- **Median PPSF**
- **Mean PPSF**
- **Weighted mean PPSF**
- **Most comparable sale PPSF**
- **Implied subject values from each**

Then choose the appropriate benchmark according to predetermined rules.

---

## 5. Outdoor Space Has Been the Biggest Subjective Adjustment

This came up very clearly in the large Tribeca combination analysis.

You challenged the initial adjustment with essentially:

> “I think the outdoor space is worth more.”

That is exactly the kind of issue a generalized LLM handles inconsistently.

One answer may treat 1,500 SF of terrace at 25% of interior PPSF. Another might use 40%. Another might simply assign $2M.

The product needs a defined system.

For example:

**Effective terrace SF = terrace SF × outdoor weighting**

Possible weighting:

- Ordinary balcony: 15–25%
- Meaningful terrace: 25–35%
- Exceptional contiguous terrace: 35–50%
- Extraordinary/private roof/outdoor experience: separately adjusted

Then:

**Adjusted SF = interior SF + effective outdoor SF**

That gives a repeatable starting point.

A scarcity premium can still be applied separately.

---

## 6. Valuation and Negotiation Argument Sometimes Get Blurred

This is subtle but important.

You frequently ask:

> “Help me explain why $11.5M is a good price.”

That means the system is being asked to construct an argument.

But there are really two different exercises:

### Analytical answer

**What does the comp data indicate?**

### Negotiation answer

**What data most strongly supports selling at $11.5M?**

Those should not be the same module.

The tool should first generate a neutral valuation.

Then it can have:

- **Generate seller case**
- **Generate buyer case**
- **Generate broker recommendation**

using the same underlying facts.

That reduces confirmation bias.

---

## 7. Offer Structures Have Produced Context Drift

60 Collister illustrates this particularly well.

Over the course of the deal we modeled variations involving:

- $11.5M price
- 5%, 7.5%, or 10% deposit
- Deposits at contract
- 3–4 month closing
- 6–7 month closing
- 9 month closing
- 14 month closing
- No rent
- $58K rent
- 25% rent credit
- 30% rent credit
- 50% rent credit
- 70% rent credit
- No rent credit
- Changing incentives for early versus late closing

Because these scenarios live in conversational context, it becomes easy to mix versions.

The product should fix this by making each offer an immutable scenario.

### Scenario A — Traditional

- Price: $11.5M
- Deposit: 10%
- Closing: 6 months
- Interim rent: $0

### Scenario B — Rent-to-own

- Price: $11.5M
- Deposit: 10%
- Rent: $58K
- Credit: 30%
- Closing deadline: 14 months

Then revisions create:

**Scenario B v2**

rather than silently overwriting previous assumptions.

---

## 8. Spreadsheet Modeling Has Exposed Dependency Problems

A good example was when the assumptions tab was removed and formulas began producing `#REF!`.

That reveals something important about the future tool.

The assumptions should not merely be another worksheet that can accidentally be deleted.

They should be a **structured data layer**.

Example:

```text
purchase_price = 11,500,000
monthly_rent = 58,000
mortgage_rate = 5.375%
down_payment = 10%
closing_month = 8
rent_credit_pct = 30%
```

The output spreadsheet should be generated from that schema.

That makes the calculations reproducible.

---

## 9. Carry Calculations Need Tighter Definitions

Across the work, terms such as the following have sometimes been used interchangeably:

- Mortgage payment
- Interest-only payment
- Monthly carry
- True burn
- Effective rent
- Equity credit
- Taxes/common charges

That can create confusion.

The tool should define these permanently.

### Housing cash outflow

Everything actually paid that month.

### Ownership carrying cost

Interest + taxes + common charges + insurance + other ownership costs.

### Principal amortization

Not treated as expense.

### Rent leakage

Rent not credited toward purchase.

### Purchase credit

Rent that reduces purchase price.

### Economic burn

Cash outflow less principal/equity-building components.

Once those definitions are fixed, every model becomes comparable.

---

## 10. Comp Selection Needs an Audit Trail

A recurring issue is effectively:

> Why did this comp get included?

or:

> Why wasn’t this transaction included?

The future tool should store explicit inclusion/exclusion logic.

| Comp | Included? | Reason |
|---|---|---|
| Comp A | Yes | Same building, similar size |
| Comp B | Yes | Nearby, recent, terrace |
| Comp C | No | Too small |
| Comp D | No | Sponsor sale |
| Comp E | Secondary | Similar size but materially different location |

That way the comp universe does not have to be rediscovered repeatedly.

---

## 11. Data Freshness Has Been Another Bottleneck

You frequently say things like:

> “These are the most recent monthly taxes available.”

or:

> “I reached out to management to confirm.”

That is because transaction information, common charges, taxes, and listing data are often from different dates.

The system should attach a timestamp to every important data point.

For example:

- **Common charges:** $8,452 — source dated June 2026
- **Taxes:** $6,225 — source dated June 2026
- **Asking rent:** $20,000 — September 2026 listing
- **Closed sale:** May 2026

And flag potentially stale information rather than silently treating every number equally.

---

## 12. You Often Require Two Layers of Output

This pattern occurs constantly.

You want:

### Internal analysis

Very detailed, sometimes long.

Then:

### Client version

Short, confident, and clean.

Those should be separate output modes.

For example:

- **Analyst View**
- **Send to Client**

---

## 13. Recommended Future Comp Workflow

The replacement tool could be structured like this.

### 1. Subject Property

- Address
- Unit
- Interior SF
- Outdoor SF
- Bedrooms/baths
- Floor
- Condition
- Parking
- View
- Building type
- Monthly charges
- Current rent
- Target price

### 2. Import Comps

- Comp report
- StreetEasy export
- CSV
- Manual entry

### 3. Normalize Data

- Closed date
- Sale price
- Interior SF
- PPSF
- Outdoor SF
- Building
- Distance
- Condition
- Floor
- Bedrooms

### 4. Score Similarity

Example concept:

`Similarity = location + size + building + outdoor + condition + recency + layout`

### 5. Produce Statistics

- Median PPSF
- Weighted PPSF
- Range
- Adjusted PPSF
- Subject implied value

### 6. Adjust

- Outdoor
- Parking
- View
- Floor
- Renovation
- Scarcity

### 7. Produce Valuation

- Low
- Base
- High

With the complete mathematical bridge.

### 8. Compare Target Price

Example:

- **Target price:** $11.5M
- **Model midpoint:** $11.8M
- **Discount:** 2.5%
- **Target PPSF:** $3,012
- **Weighted comp PPSF:** $3,090

### 9. Generate Narrative

- Seller
- Buyer
- Investor
- Internal broker

### 10. Generate Deliverable

- Email
- Text
- PDF
- Excel
- Comp sheet

This captures most of the repeated work that is currently being done manually.

---

## 14. The Prompt Structure You Have Naturally Evolved Toward

Your strongest prompts generally contain six pieces:

> **Property:** 60 Collister 4A  
> **Question:** Is $11.5M a defensible sale price?  
> **Audience:** Seller; numbers-oriented.  
> **Method:** Focus on the five most comparable closed sales and PPSF. Account for size, terrace and parking.  
> **Goal:** Explain why accepting $11.5M makes economic sense.  
> **Output:** Two concise, data-heavy paragraphs suitable for email.

That is dramatically better than:

> “Analyze these comps.”

Those six fields should probably become part of the product rather than requiring the user to learn prompting.

---

## 15. The Most Important Change From the Current ChatGPT Workflow

Today, the iterative workflow often looks like:

**answer → correction → new answer → assumption correction → new answer → wording correction → final**

The replacement tool should instead work:

**facts → locked assumptions → calculations → QA → narrative**

The narrative should be the last step.

That would eliminate a large amount of back-and-forth.

---

# Core Product Insight

The way ChatGPT is being used here is not primarily as a CMA generator.

It is acting as a combination of:

**comp analyst + valuation modeler + transaction strategist + financial modeler + brokerage copywriter**

The work separates naturally into two systems.

## The Calculation Engine Should Be Deterministic

PPSF, rent, cap rates, mortgage economics, adjustments, comp ranking, offer scenarios, averages, and ranges should not depend on what wording the AI happens to generate that day.

## AI Should Sit on Top of That Engine

Its role should be to understand requests such as:

> “I’m talking to Jason. He already knows his apartment is great. He’s a numbers guy. Show him why taking $11.5M makes sense.”

and transform verified calculations into exactly the right argument.

That separation — **deterministic real-estate math underneath, flexible AI communication on top** — is probably the single biggest lesson from how this project has been used.
