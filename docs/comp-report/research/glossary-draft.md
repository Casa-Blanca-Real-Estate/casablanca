# House glossary — DRAFT

**CR-R · Dispatch 04 · Surveyor · 2026-09-24.** A draft for Noble and the mentors to make official
(`../01-design.md` §6.9). **Every entry is DRAFT** until they do. Once adopted, one definition per term is
used by the tool's field names, the assistant, the writer and every agent — so that "monthly carry" and
"mortgage payment" can't drift into meaning the same thing.

**How an entry is built.** A plain-English house definition first — the proposal for Noble to accept or
change. Then:
- **Authoritative** — the strongest source found, quoted: statute, regulation, a city or federal agency,
  Fannie Mae. Where none exists the entry says so and gives industry usage, labelled as such.
- **Synonyms** and **not to be confused with** — the neighbours each term gets mixed up with.
- **Source** — keys resolve in [`sources.md`](sources.md); design sections are `01-design.md` §n.

Statute quotations were read through a web tool that returns text in fragments; check them against the
official text before adoption. Infrastructure terms in the design (Netlify, Postgres, streaming, model
settings) are left out — this glossary is for agents and for what the tool says to them.

## Open questions for Noble

The research turned up these conflicts; each entry has the detail.

1. **"Carry" means three things.** The tool's carry excludes the mortgage; NYC brokers' and attorneys'
   "carrying costs" include it; the audit's "ownership carrying cost" adds interest and insurance.
   Proposed: *carry* for the narrow sense, *carrying costs* only for the broad one, and a new name for
   *ownership carrying cost* (§1).
2. **"Mortgage payment" is ambiguous** even in federal usage — principal and interest, or the lender's
   total with escrowed taxes and insurance. Proposed: P&I only, or the tool double-counts taxes (§1).
3. **Economic burn duplicates** ownership carrying cost for owners and rent leakage for renters, and
   isn't the economists' cost of owning (§1).
4. **Purchase credit against Fannie Mae's rent credit** — a price reduction in the audit's framing,
   down-payment money capped at the market-rent gap in the lender's (§1).
5. **Housing cash outflow:** do utilities count? (§1)
6. **Sale-to-list denominator:** StreetEasy uses the initial ask and medians; Miller Samuel the last ask
   and averages. Proposed: sale-to-last-ask by default, always labelled (§3).
7. **Days on market** is defined three ways — REBNY and StreetEasy from going active, with a 30-day reset;
   the Elliman Report from the last price change (§3).
8. **Price per square foot and outdoor space:** no NYC residential measurement standard was found.
   Proposed: interior only in the house figure (§3).
9. **421-a is an exemption, not an abatement**, and StreetEasy's "35 years" is the affordability term, not
   the tax benefit (§2).
10. **Condop has two meanings** in StreetEasy's own usage (§2).
11. **CMA and New York's broad definition of appraisal** — a question for counsel before the disclaimer is
    final (§3; D-13).
12. **In the design itself:** "confidence" names both input confidence (exact / approx / inferred /
    guesstimate) and Jev's judgment confidence; "evidence class" (§6.3) and "evidence status" (Appendix A,
    32) name one thing; "sale-to-ask" and "sale-to-last-ask" name one ratio (§6).

## Contents

1. The carrying-cost family
2. NYC ownership and building terms
3. Comps and market terms
4. Adjustment methods
5. Fair housing and compliance
6. The tool's own terms

## 1. The carrying-cost family

These terms have been used interchangeably — "mortgage payment", "interest-only payment", "monthly
carry", "true burn" — and the audit that found it (`sources/2026-09-23-chatgpt-workflow-audit.md` §9)
proposed the working definitions this section starts from. Three findings shape it:

- **"Carry" means three different things today.** The tool's *carry* excludes the mortgage; NYC
  industry *carrying costs* include it [BU-2023-carrydef]; the audit's *ownership carrying cost* adds
  interest and insurance. Each needs its own label, below.
- **"Mortgage payment" is ambiguous even in federal usage.** The CFPB uses it both for principal and
  interest alone and for the total including escrowed taxes and insurance [CFPB-PI]. If an agent types
  a condo buyer's escrowed lender payment into "mortgage payment" and the tool adds carry, **the taxes
  are counted twice.** The house definition below is P&I only.
- **Several of the audit's terms are identities of one another.** For an owner, *economic burn* equals
  *ownership carrying cost* when both count the same items; in a rent-to-own, it equals *rent
  leakage*. Noble may want fewer terms, not more.

How the family fits together, using the house definitions below:

```
Mortgage payment (P&I)     = interest portion + principal portion
Carry                      = common charges + real estate taxes     (condo)
                           = maintenance                            (co-op)
Monthly cost estimate      = mortgage payment + carry               (the tool, §6.7)
Housing cash outflow       = mortgage payment + carry + insurance + other housing bills   (owner)
                           = rent paid                              (renter, or before a rent-to-own closes)
Ownership carrying cost    = interest portion + carry + insurance + other ownership costs
Economic burn              = housing cash outflow − principal portion − purchase credit
Rent leakage               = rent paid − purchase credit
```

#### Principal · DRAFT
The amount borrowed and still owed. The **principal portion** of a payment is the part that reduces
that balance — money out of the buyer's account, but not an expense, because it becomes equity.
- **Authoritative:** CFPB: "The amount of a mortgage loan that you have to pay back." [CFPB-KT].
  BLS, on mortgage principal paid: "This is not included in homeowner costs but is repayment of a
  loan." [BLS-CE]
- **Synonyms:** loan balance, mortgage balance (the amount owed); principal portion, principal
  paydown (the monthly part that reduces it).
- **Not to be confused with:** the loan amount at origination; *equity* (value minus balance, which
  moves with price); the *down payment*.
- **Note:** the house treats principal as not an expense (§6.7), as BLS does. Economists would add that
  the owner's equity has an opportunity cost [HMS-2005]; the house deliberately leaves it out.
- **Source:** [CFPB-KT], [CFPB-PAY], [BLS-CE].

#### Interest · DRAFT
What the lender charges for the money, in dollars. The interest in each payment is an expense of
owning. The *interest rate* is the annual percentage it is calculated from.
- **Authoritative:** CFPB: "interest is what the lender charges for lending you the money." [CFPB-PI]
- **Synonyms:** interest charge; interest portion (the part of a monthly payment).
- **Not to be confused with:** the interest rate; APR (which includes fees); an *interest-only
  payment*; after-tax interest (the tool's figures are pre-tax).
- **Source:** [CFPB-PI], [CFPB-KT].

#### Amortization · DRAFT
Paying a loan down on a schedule: each payment covers that month's interest and pays off some
principal, so early payments are mostly interest and later ones mostly principal.
- **Authoritative:** CFPB: "Paying off a loan with regular payments over time, so that the amount you
  owe decreases with each payment." [CFPB-KT]
- **Synonyms:** paydown; principal amortization (the audit's term).
- **Not to be confused with:** negative amortization; the amortization period versus the loan term (a
  balloon loan can amortize over 30 years but fall due sooner).
- **Source:** [CFPB-KT], [CFPB-PAY].

#### Mortgage payment · DRAFT
The scheduled monthly payment on the buyer's loan: **principal plus interest (P&I)**. In Casa usage it
never includes taxes, insurance or building charges, even when the lender collects them through escrow.
- **Authoritative:** CFPB separates the "principal and interest payment" from the "total monthly
  payment", which "usually includes additional costs like homeowners insurance, taxes, and possibly
  mortgage insurance." [CFPB-PI]
- **Synonyms:** monthly mortgage payment; P&I.
- **Not to be confused with:** the lender's *total monthly payment* or *PITI* (which include escrowed
  taxes and insurance); *carry*; an *interest-only payment*.
- **Note:** the tool's monthly cost estimate (P&I plus carry) only works if this term means P&I. A field
  that takes it should read "Mortgage payment (P&I)" and say not to enter the escrowed total.
- **Source:** [CFPB-PI], [CFPB-LE].

#### Interest-only payment · DRAFT
A payment that covers only the interest due, so the loan balance doesn't fall. Use the term only for
loans with an interest-only period; for an ordinary loan, say "interest portion".
- **Authoritative:** CFPB: "An interest-only mortgage is a loan with scheduled payments that require you
  to pay only the interest for a specified amount of time." [CFPB-IO]
- **Synonyms:** IO payment.
- **Not to be confused with:** the interest portion of an amortizing payment (which starts near the IO
  amount and then shrinks, so a month-one IO figure overstates later years); the *mortgage payment*.
- **Source:** [CFPB-IO].

#### PITI and escrow · DRAFT
**PITI** — principal, interest, property taxes and homeowners insurance: the lender's view of a full
monthly housing payment. **Escrow** — the account a lender may use to collect taxes and insurance
monthly and pay them when due. In Casa reports escrowed taxes are shown in *carry* and insurance under
insurance, never inside the *mortgage payment*.
- **Authoritative:** CFPB: "Principal, Interest, Taxes, and Insurance, known as PITI, are the four basic
  elements of a monthly mortgage payment." [CFPB-PITI] Fannie Mae calls its fuller version, which adds
  association dues or the co-op fee, **PITIA**: "Monthly housing expense ... is referred to as PITIA"
  [FNMA-B3-6-03].
- **Synonyms:** impound account (escrow); monthly housing expense (Fannie Mae).
- **Not to be confused with:** in NYC, the **contract deposit held in escrow** by the seller's
  attorney — same word, different thing; *carry*.
- **Source:** [CFPB-PITI], [CFPB-ESC], [FNMA-B3-6-03].

#### Monthly carry (carry) · DRAFT
The building-and-tax cost of holding the apartment each month, before any mortgage: **common charges
plus real estate taxes for a condo; maintenance for a co-op.** Shown per month, and per square foot
where area is known. Say "carry" for this, and "carry plus mortgage" or "monthly cost" when the loan
is included. This is the tool's definition (§6.7).
- **Authoritative:** none found — no government or GSE source defines "carry". The CFPB notes condo
  and HOA dues are "usually paid separately from your monthly mortgage payment" [CFPB-KT].
- **Synonyms:** carry; monthlies; monthly charges.
- **Not to be confused with:** *carrying costs* in the broad NYC sense, which include the mortgage
  (next entry); *ownership carrying cost*; *PITIA*; the finance term "cost of carry".
- **Open for Noble:** whether special assessments belong in carry (Fannie Mae counts them in housing
  expense [FNMA-B3-6-03]); how an expiring abatement is shown (see factor 20 in `adjustments.md`).
- **Source:** `01-design.md` §6.7.

#### Carrying costs (NYC industry usage) · DRAFT
In NYC broker and attorney usage, all the monthly costs of owning an apartment, **including the
mortgage**. The house keeps the phrase for this broad sense only and says *carry* for the narrow one.
- **Authoritative:** none official. Industry: attorney Jeffrey Reich, quoted by Brick Underground: "The
  term carrying costs includes monthly maintenance or common charges, mortgage principal and interest,
  and with respect to condominium unit owners, real estate taxes." [BU-2023-carrydef]
- **Synonyms:** monthly costs; all-in monthly cost.
- **Not to be confused with:** *carry* (excludes the mortgage). Clients and other brokers often mean
  this broad sense — the assistant should ask which is meant when it's unclear (§6.9).
- **Source:** [BU-2023-carrydef].

#### Housing cash outflow · DRAFT
Every housing dollar that actually leaves the buyer's account in a month: the mortgage payment (P&I),
carry, insurance and any other housing bills. While renting — including before a rent-to-own closes —
it is the full rent paid. It is a cash measure: principal and credited rent both count.
- **Authoritative:** the name is coined. The nearest standard measure is the Census Bureau's "selected
  monthly owner costs": "the sum of payments for mortgages ... real estate taxes; fire, hazard, and
  flood insurance on the property; utilities ...; and fuels" [ACS-SMOC].
- **Synonyms:** all-in monthly housing cost; monthly outlay.
- **Not to be confused with:** *ownership carrying cost* (excludes principal); *carry* (excludes the
  mortgage); *PITIA* (the lender's figure, which leaves out the unit's own utilities); *economic burn*.
- **Open for Noble:** whether utilities count — Census includes them, Fannie Mae's housing expense
  doesn't. The choice also decides whether economic burn equals ownership carrying cost. A one-time
  deposit is upfront cash, not monthly outflow.
- **Source:** audit §9; [ACS-SMOC]; [FNMA-B3-6-03].

#### Ownership carrying cost · DRAFT
The monthly cost of owning, **excluding principal**: interest plus carry plus insurance plus other
ownership costs, such as assessments and upkeep.
- **Authoritative:** the name is coined; the concept is standard. It matches the scope of the Bureau of
  Labor Statistics' "owned dwellings" expenditure, which "includes interest on mortgages ... property
  taxes and insurance ... expenses for repairs and maintenance" and leaves principal repayments out
  [BLS-CE]. Its fuller academic sibling is the *user cost* of owning (see economic burn) [HMS-2005].
- **Synonyms:** cost of owning (excluding principal); owned-dwelling costs (BLS).
- **Not to be confused with:** *carry*; NYC *carrying costs* (which include principal); *user cost*
  (which adds the forgone return on equity and subtracts expected appreciation).
- **Open for Noble:** the name collides with *carry* and *carrying costs*; a distinct label ("cost of
  owning") would stop the drift the glossary exists to prevent. "Other ownership costs" needs a closed
  list.
- **Source:** audit §9; [BLS-CE]; [HMS-2005].

#### Economic burn · DRAFT
The part of monthly housing cash outflow the buyer doesn't get back as equity or purchase credit:
cash outflow minus the principal portion minus purchase credit. For an owner it equals ownership
carrying cost; for a renter it equals rent leakage — in an ordinary lease, all of the rent.
- **Authoritative:** none — the term is coined; searches found only startup "burn rate" usage. The
  nearest standard concept is the economists' **user cost**, "the true one-year cost of owning a
  house", whose first component "is the cost of foregone interest that the homeowner could have earned
  by investing in something other than a house" [HMS-2005].
- **Synonyms:** true burn (the audit's variant); non-recoverable monthly cost.
- **Not to be confused with:** *user cost* — economic burn is a cash measure and ignores the forgone
  return on the down payment, so it understates the cost of owning for buyers who put in a lot of cash;
  the writer should never call it "the true cost".
- **Open for Noble:** keep it only as the rent-versus-own comparison figure, or drop it — for owners it
  duplicates ownership carrying cost.
- **Source:** audit §9; [HMS-2005].

#### Rent leakage · DRAFT
Rent paid that is not credited toward a purchase: rent minus purchase credit. In an ordinary lease,
all rent is leakage.
- **Authoritative:** none — coined; no housing usage found.
- **Synonyms:** uncredited rent (plainer, and needs no definition for clients).
- **Not to be confused with:** a landlord's "revenue leakage"; *rent credit*; a rent-back credit.
- **Source:** audit §9.

#### Purchase credit (rent credit) · DRAFT
Money paid before closing — a share of rent, or a deposit — that the agreement credits toward the
purchase at closing. **Rent credit** is the part that comes from rent.
- **Authoritative:** Fannie Mae: rent credit with an option to purchase is "the portion of rental
  payments ... paid by the borrower that can be credited towards the down payment or minimum borrower
  contribution"; "the credit may be no more than the difference between the market rent and the actual
  rent paid"; it "is not considered an interested party contribution" [FNMA-B3-4.3-12].
- **Synonyms:** rent credit; credit toward purchase.
- **Not to be confused with:** a *rent-back credit* — "an amount paid by the property seller to the
  borrower in exchange for allowing the seller to stay in the home ... after closing" [FNMA-B3-4.3-12];
  seller concessions; the contract deposit; an option fee that isn't credited.
- **Conflict for Noble:** the audit's working definition says a purchase credit "reduces purchase
  price"; Fannie Mae treats rent credit as down-payment money, and caps what a lender will count at the
  gap between market rent and rent paid. A flat percentage-of-rent credit, as in the rent-to-own the
  audit describes, may not all be recognised by a conforming lender. Keep "contract credit" and
  "lender-recognised credit" as separate figures; whether a credit lowers the recorded price is a
  question for counsel.
- **Source:** audit §9; [FNMA-B3-4.3-12].

#### Down payment · DRAFT
The part of the price the buyer pays from their own funds rather than borrowing: price minus loan
amount.
- **Authoritative:** CFPB: "The amount you pay toward the home upfront. You put a percentage of the
  home's value down and borrow the rest." [CFPB-KT]
- **Synonyms:** cash down; equity contribution.
- **Not to be confused with:** the contract deposit (paid at contract and credited toward the down
  payment); *cash to close*, which the Loan Estimate defines as "the amount you will have to pay at
  closing, in addition to any money you have already paid" [CFPB-LE]; *closing costs*; *post-closing
  liquidity*.
- **Source:** [CFPB-KT], [CFPB-LE].

#### Loan-to-value ratio (LTV) · DRAFT
The loan amount as a percentage of the property's value — 80% LTV is 20% down.
- **Authoritative:** CFPB: "a measure comparing the amount you are financing with the appraised value of
  the property." [CFPB-LTV]
- **Not to be confused with:** combined LTV (which includes second loans); a co-op board's maximum
  financing rule, which is set by the board, not the lender.
- **Source:** [CFPB-LTV].

#### Debt-to-income ratio (DTI) · DRAFT
Monthly debt payments — including the new mortgage payment and the carry — divided by gross monthly
income. Lenders and co-op boards each set their own limits.
- **Authoritative:** CFPB: "all your monthly debt payments divided by your gross monthly income."
  [CFPB-DTI]; Fannie Mae counts co-op fees and association dues in the housing expense [FNMA-B3-6-03].
- **Synonyms:** back-end ratio.
- **Not to be confused with:** the front-end (housing-only) ratio; a co-op board's own income test.
- **Source:** [CFPB-DTI], [FNMA-B3-6-02], [FNMA-B3-6-03].

#### Post-closing liquidity · DRAFT
Liquid assets the buyer still has after the down payment and closing costs, usually expressed as months
or years of mortgage plus maintenance. Each co-op board sets its own requirement and decides which
assets count.
- **Authoritative:** none official; NYC industry usage. Brick Underground: "Boards typically want six
  months to two years of maintenance and liquidity after closing." [BU-2019-board]; "enough in the bank
  to cover two years of mortgage and maintenance payments after closing" [BU-2026-finances].
- **Synonyms:** PCL; post-closing reserves.
- **Not to be confused with:** the *down payment*; *cash to close*; a lender's reserve requirement.
- **Source:** [BU-2019-board] `[>5y]`, [BU-2026-finances].

#### Closing costs · DRAFT
The one-time costs of buying and financing, paid at closing on top of the down payment: lender fees,
title, attorneys, taxes such as the mortgage recording tax, building fees.
- **Authoritative:** CFPB: "Closing costs, or 'settlement costs,' are the upfront costs you will be
  charged to get your loan and transfer ownership of the property" [CFPB-LE].
- **Synonyms:** settlement costs.
- **Not to be confused with:** *cash to close* (which includes the down payment, net of deposits and
  credits); the *down payment*.
- **Source:** [CFPB-KT], [CFPB-LE].

#### Mortgage recording tax · DRAFT
The state and city tax charged when a mortgage on NYC real property is recorded, as a percentage of
the loan. The NYC Department of Finance's 2022 statistical profile gives state plus city residential
rates totalling 2.05% for loans under $500,000 and 2.175% at $500,000 or more. **Loans on co-op
apartments are not subject to it** (a co-op buyer buys shares — see *co-op*, §2).
- **Authoritative:** NYC DOF: "Mortgages on individual cooperative apartments do not incur liability
  under the mortgage recording tax." City rates: "1.0 percent for residential mortgages of less than
  $500,000" and "1.125 percent for residential mortgages of $500,000 or more", on top of the state's
  components [NYCDOF-MRT-2022]; NYS DTF [NYSDTF-MRT].
- **Synonyms:** MRT; mortgage tax.
- **Not to be confused with:** transfer taxes; the mansion tax; a co-op's flip tax (§2).
- **Unverified:** how the total is split between borrower and lender on residential loans — confirm
  with a closing attorney before the tool uses a buyer-side figure.
- **Source:** [NYCDOF-MRT-2022], [NYSDTF-MRT].

## 2. NYC ownership and building terms

#### Condominium (condo) · DRAFT
A condo unit is real property: the owner holds a deed to the unit plus an undivided percentage interest
in the building's common elements, pays common charges to the condominium, and pays the unit's own real
estate taxes.
- **Authoritative:** New York's Condominium Act defines the pieces, not the whole — a unit owner owns "a
  unit in fee simple absolute" or, in a qualified leasehold condominium, "a unit held under a lease or
  sublease" [RPL-339-e]. Fannie Mae: "Each unit owner has title to their individual unit, an individual
  interest in the project's common areas" [FNMA-Glossary].
- **Synonyms:** condominium unit, condo apartment.
- **Not to be confused with:** a *co-op*; a *condop*; a "condo-style" rental.
- **Note:** Battery Park City condos sit on leased land — "Condos are owned in fee simple with the
  exception of those located in Battery Park City" [MS-NYC-Methodology].
- **Source:** [RPL-339-e], [FNMA-Glossary].

#### Cooperative (co-op) · DRAFT
A building owned by a corporation. The buyer purchases shares in the corporation and receives a
proprietary lease for a particular apartment, usually subject to board approval — shares in a
corporation, not real property.
- **Authoritative:** a "cooperative housing corporation" is one whose stockholders are each "entitled,
  solely by reason of his ownership of stock in the corporation, to occupy for dwelling purposes … an
  apartment in a building, owned or leased by such corporation" [IRC-216]. Fannie Mae: a co-op
  corporation "holds title to a co-op project and grants occupancy rights to particular apartments or
  units to shareholders through proprietary leases" [FNMA-Glossary].
- **Synonyms:** co-op apartment; tenant-shareholder (the owner).
- **Not to be confused with:** a *condo*; a *condop*.
- **Note:** co-op share transfers pay the NYC transfer tax [NYCDOF-RPTT] but not the mortgage recording
  tax (§1).
- **Source:** [IRC-216], [FNMA-Glossary].

#### Condop · DRAFT
A building whose residential apartments are held as co-op shares, with the commercial space (retail, a
garage) held as a separate condominium unit. Apartment buyers buy co-op shares, often under more
condo-like rules. **For comps, condop apartments group with co-ops.**
- **Authoritative:** none — industry usage only. StreetEasy uses the word both for "co-op buildings that
  have rules and by-laws similar to that of a condominium" and for a building split between commercial
  units and residential units "controlled by a Co-op corporation" [SE-Help-Condop]; Miller Samuel
  includes condops in its co-op data "since the individual apartments are allocated shares and largely
  function as a co-op" [MS-NYC-Methodology].
- **Open for Noble:** StreetEasy gives two meanings; the house should pick one.
- **Source:** [SE-Help-Condop], [MS-NYC-Methodology].

#### Proprietary lease · DRAFT
The long-term lease a co-op gives each shareholder for their apartment. It sets the maintenance and the
rules on subletting, alterations and any flip tax.
- **Authoritative:** Fannie Mae: "A lease that a co-op corporation gives to a tenant-stockholder to cover
  the unit that they will occupy" — "proprietary because the tenant-stockholder is both a shareholder in
  the landlord co-op corporation and a tenant under the lease" [FNMA-Glossary].
- **Synonyms:** occupancy agreement.
- **Not to be confused with:** a rental lease; a *ground lease*; the offering plan.
- **Source:** [FNMA-Glossary], [NYAG-13NYCRR-18.3].

#### Offering plan · DRAFT
The disclosure document a sponsor files with the NY Attorney General before offering co-op shares or
condo units for sale. With its amendments it sets out prices, share or common-interest allocations,
projected maintenance or common charges, building condition, mortgages and reserves.
- **Authoritative:** the offering statement "required by section 352-e of the General Business Law"
  [NYAG-13NYCRR-18.1].
- **Synonyms:** offering statement; the plan and its amendments.
- **Note:** a non-eviction conversion plan needs purchase agreements from "at least fifty-one percent" of
  bona fide tenants under the current statute [NY-GBL-352-eeee]; the Attorney General's unofficial
  regulation text still says 15%, which predates the 2019 amendment.
- **Source:** [NYAG-13NYCRR-18.1], [NY-GBL-352-eeee].

#### Sponsor; sponsor sale; sponsor unit; holder of unsold shares · DRAFT
The **sponsor** is the developer or converter who filed the offering plan. A **sponsor sale** is the first
sale of a condo unit, or of a co-op apartment's shares, by the sponsor or by a **holder of unsold shares**
the sponsor designated. A **sponsor unit** is one still held that way. Every later sale is a *resale*.
- **Authoritative:** "the word sponsor(s) means any person … who makes or takes part in a public offering
  or sale … of securities consisting primarily of shares or participation interests or investment in real
  estate, including cooperative interests in realty" [NYAG-13NYCRR-18.1]; "A holder of unsold shares is the
  sponsor or any individual designated to hold unsold shares by the sponsor. Such shares shall cease to be
  unsold shares when purchased by a purchaser for occupancy" [NYAG-13NYCRR-18.3].
- **Synonyms:** first sale; new-development sale (for condos).
- **Not to be confused with:** Miller Samuel's *new development*, which is age-based — "any and all sales
  that close within 5 years of the construction date" [MS-NYC-Methodology]; a sponsor sale in a 1980s
  conversion isn't new development.
- **Notes:** sponsor sales differ from resales in who pays transfer taxes and in concessions
  (`adjustments.md` factor 18); occupied sponsor units come with tenants the buyer can't evict
  (`adjustments.md`, *Possibly missing*).
- **Source:** [NYAG-13NYCRR-18.1], [NYAG-13NYCRR-18.3].

#### Common charges · DRAFT
The monthly amount a condo unit owner pays the condominium for the unit's share of the building's
operating costs, set by the unit's common-interest percentage. Common charges exclude the unit's real
estate taxes, which are billed to the unit's own tax lot, and any special assessment.
- **Authoritative:** "each unit's proportionate share of the common expenses in accordance with its common
  interest" — Real Property Law §339-e [RPL-339-e].
- **Synonyms:** CCs.
- **Not to be confused with:** co-op *maintenance* (which includes the building's taxes and mortgage);
  *carry* (common charges plus taxes); a *special assessment*. Outside NYC: HOA dues.
- **Source:** [RPL-339-e], [NYAG-13NYCRR-20.3].

#### Maintenance · DRAFT
The monthly charge a co-op shareholder pays the corporation under the proprietary lease, allocated by
shares. It covers the shareholder's share of the building's operating costs, real estate taxes and
underlying-mortgage payments — which is why part of it is usually tax-deductible.
- **Authoritative:** Business Corporation Law §501(c) refers to "maintenance charges and general
  assessments pursuant to a proprietary lease", fixed "on an equal per-share basis or on an equal per-room
  basis" [NY-BCL-501]; the federal deduction for co-op shareholders' proportionate share of taxes and
  interest is IRC §216 [IRC-216].
- **Synonyms:** maintenance charges; monthly maintenance.
- **Not to be confused with:** condo *common charges*; assessments; the tax-deductible portion.
- **Note:** no single authoritative sentence says maintenance "covers taxes and the underlying mortgage";
  the definition is assembled from §216, the offering-plan rules and Fannie Mae's co-op definitions.
- **Source:** [NY-BCL-501], [IRC-216], [NYAG-13NYCRR-18.3].

#### Real estate taxes (NYC; tax class 2) · DRAFT
The annual NYC property tax. Most co-op and condo buildings are tax class 2, which state law requires to
be assessed as if they weren't co-ops or condos — in practice as rental buildings — not at the prices
their units sell for. A condo unit gets its own tax bill; a co-op's taxes are billed to the building and
paid through maintenance.
- **Authoritative:** co-op and condo property "shall be assessed … at a sum not exceeding the assessment
  which would be placed upon such parcel were the parcel not owned or leased by a cooperative corporation or
  on a condominium basis" — RPTL §581 [NY-RPTL-581]; DOF "is prohibited from valuing co-ops and
  condominiums using sales data" [NYCDOF-Hyman-2016]; "We generally value your class 2 property based on its
  income producing potential" [NYCDOF-Class2-2026]. Class 1 includes "most condominiums that are not more
  than three stories" [NYCDOF-Terms].
- **Synonyms:** property taxes; "Monthly Taxes" in the StreetEasy export.
- **Not to be confused with:** DOF's "market value", an assessment figure that is **not evidence of what a
  unit is worth** and must never appear as a value indication in a CMA; transfer taxes (paid once, at
  sale).
- **Note:** a unit's bill can reflect the owner's personal exemptions (STAR, senior, disability) and the
  co-op/condo abatement — see `adjustments.md` factor 19 on why carry should be compared before them.
- **Source:** [NY-RPTL-581], [NYCDOF-Terms], [NYCDOF-Class2-2026].

#### Tax exemption and tax abatement (421-a, J-51, 485-x, the co-op/condo abatement) · DRAFT
A tax benefit lowers a property's taxes for a set period. An **exemption** lowers the assessed value before
the tax is calculated; an **abatement** reduces the bill afterwards. **421-a** is a partial *exemption* for
new multiple dwellings; **485-x** is its successor; **J-51** is an exemption and abatement for
rehabilitation; the **Cooperative and Condominium Property Tax Abatement** is an owner-level abatement for
primary residences. Every comp with a tax benefit records the program and the year it ends.
- **Authoritative:** "Abatements reduce your taxes after they've been calculated"; "Exemptions reduce your
  property's assessed value before your taxes are calculated" [NYCDOF-Terms]; "The 421-a Tax Incentive is a
  partial tax exemption for new multiple dwellings" [HPD-421a]; J-51 "is an as-of-right tax exemption and
  abatement for residential rehabilitation or conversion" [HPD-J51]; the co-op/condo abatement applies where
  "The unit is the owner's primary residence" [NYCDOF-Abatement].
- **Synonyms:** tax break, tax benefit; "421-a abatement" (common but technically wrong).
- **Not to be confused with:** one another; owners' personal exemptions (STAR, senior, disability).
- **Conflict:** StreetEasy calls 421-a an abatement lasting "up to 35 years" [SE-Help-421a]; HPD's 35-year
  figure is the rent-stabilisation term for affordable units, and the tax benefit runs 10 to 25 years after
  construction [HPD-421a]. Follow HPD and DOF.
- **Source:** [NYCDOF-Terms], [HPD-421a], [HPD-J51], [HPD-485x], [NYCDOF-Abatement].

#### Flip tax · DRAFT
A fee a co-op charges, usually to the seller, when shares change hands — provided for in the proprietary
lease, the offering plan or a properly approved amendment. Usually a percentage of the price, a percentage
of the profit, or a flat amount per share, paid to the building, not the government.
- **Authoritative:** Business Corporation Law §501(c): shares "shall not be considered unequal because of
  variations in fees or charges payable to the corporation upon sale or transfer of shares and appurtenant
  proprietary leases that are provided for in proprietary leases, occupancy agreements or offering plans"
  [NY-BCL-501]. A law firm: "Ordinarily, buildings charge between 1 and 3 percent of the sales price as a fee
  to the seller" [NM-Flip-2019].
- **Synonyms:** transfer fee.
- **Not to be confused with:** government transfer taxes; the mansion tax.
- **Notes:** a comp's recorded price is gross of any flip tax; if the buyer pays it, flag it as a
  condition of sale. The history — *Fe Bland v. Two Trees Management* (1985) and the 1986 amendment to
  §501(c) — is described differently by the sources reached and wasn't verified; the current statute is
  what's settled.
- **Source:** [NY-BCL-501], [NM-Flip-2019], [NYAG-13NYCRR-18.3].

#### Underlying mortgage · DRAFT
The co-op corporation's own mortgage on the whole building. Each shareholder carries a share of it through
maintenance. It isn't the buyer's loan.
- **Authoritative:** Fannie Mae: "the co-op interest is the equity portion that is over and above the pro
  rata share of the blanket mortgage(s)" [FNMA-B4-1.4-04].
- **Synonyms:** blanket mortgage; building mortgage.
- **Not to be confused with:** the buyer's share loan.
- **Source:** [FNMA-B4-1.4-04], [NYAG-13NYCRR-18.3].

#### Reserve fund · DRAFT
Money a co-op or condo holds for future capital work — roof, façade, elevators — so it doesn't have to levy
special assessments.
- **Authoritative:** offering plans "must state whether the apartment corporation will have funds for
  working capital and/or as a reserve for capital expenditures" [NYAG-13NYCRR-18.3]; Fannie Mae expects
  reserves of "at least 10% of the budget" for eligible projects [FNMA-B4-2.2-02].
- **Synonyms:** reserves; capital reserve.
- **Not to be confused with:** a working-capital fund; a *special assessment*.
- **Source:** [NYAG-13NYCRR-18.3], [NYAG-13NYCRR-20.3], [FNMA-B4-2.2-02].

#### Special assessment · DRAFT
A one-time or temporary charge a co-op or condo board levies on owners, on top of maintenance or common
charges, usually for capital work.
- **Authoritative:** offering plans must set out "the procedures to establish common charges and
  assessments" [NYAG-13NYCRR-20.3]; §501(c) refers to "general assessments pursuant to a proprietary lease"
  [NY-BCL-501].
- **Not to be confused with:** a municipal "special assessment district" levy [FNMA-Glossary].
- **Note:** record whether an assessment is in place and who pays it at sale; a seller-paid assessment can
  work as a concession.
- **Source:** [NYAG-13NYCRR-20.3], [NY-BCL-501].

#### Board package · DRAFT
The application a buyer submits to a co-op board — or, for a condo, the package supporting the board's
waiver of its right of first refusal: financials, references, the contract.
- **Authoritative:** none found. Related law: it is unlawful to deny or delay "the processing of an
  application made by a purchaser … for occupancy in a cooperative or condominium dwelling because of"
  a protected characteristic [CFR-100.70].
- **Source:** [CFR-100.70].

#### Ground lease (leasehold) · DRAFT
A long-term lease of the land under a building. In a leasehold condo or co-op the owners don't own the
land and pay ground rent — directly or through charges — until the lease expires.
- **Authoritative:** Fannie Mae: "A way of holding title to a property wherein the borrower does not
  actually own the property but rather has a recorded long-term lease on it" [FNMA-Glossary]; the lease
  must outlast the loan "by five (5) years or more" [FNMA-B2-3-03].
- **Synonyms:** land lease; leasehold condo or co-op.
- **Not to be confused with:** a *proprietary lease*; fee simple ownership.
- **Source:** [FNMA-Glossary], [FNMA-B2-3-03], [RPL-339-e].

#### Certificate of occupancy (C of O) · DRAFT
The Department of Buildings document stating a building's legal use and occupancy. In comps it matters
where legal residential use or room count is in question — lofts, lower-level rooms, conversions.
- **Authoritative:** "A Certificate of Occupancy (CO) states a legal use and/or type of permitted occupancy
  of a building"; "No one may legally occupy a building until the Department has issued a CO or Temporary
  Certificate of Occupancy (TCO)"; buildings from before 1938 may have a Letter of No Objection instead
  [DOB-CO].
- **Synonyms:** CO; TCO (temporary).
- **Source:** [DOB-CO].

#### Air rights (transferable development rights) · DRAFT
A zoning lot's unused permitted floor area — floor-area ratio times lot area, minus what's built — usable
on the lot, shareable through a zoning lot merger, or transferable elsewhere only where the Zoning
Resolution allows.
- **Authoritative:** "'Floor area ratio' is the total floor area on a zoning lot, divided by the lot area of
  that zoning lot" [ZR-12-10]. No general definition of "development rights" was found.
- **Synonyms:** unused development rights; TDRs.
- **Source:** [ZR-12-10], [Furman-2013].

#### NYC Real Property Transfer Tax (RPTT) · DRAFT
New York City's tax on transfers of real property or co-op shares: 1% of the price for residential
transfers of $500,000 or less, 1.425% above.
- **Authoritative:** "If the value is $500,000 or less, the rate is 1% of the price. If the value is more
  than $500,000 the rate is 1.425%" — for "a one- to three-family house; an individual residential
  condominium unit; or an individual cooperative apartment" [NYCDOF-RPTT].
- **Not to be confused with:** the NYS transfer tax; the mansion tax; a flip tax.
- **Note:** who customarily pays is set by contract; in sponsor sales the buyer usually does
  (`adjustments.md` factor 18).
- **Source:** [NYCDOF-RPTT].

#### NYS real estate transfer tax · DRAFT
New York State's tax on conveyances — $2 per $500 of consideration (0.4%), plus an additional $1.25 per
$500 (0.25%) on NYC residential conveyances of $3 million or more — paid by the seller unless the
contract shifts it.
- **Authoritative:** "Tax is computed at a rate of two dollars for each $500, or fractional part thereof,
  of consideration"; "The base tax and additional base tax are paid by the grantor (seller), and such tax
  shall not be paid directly or indirectly by the grantee (buyer) except as provided in a contract"
  [NYSDTF-RETT].
- **Source:** [NYSDTF-RETT], [NYSDTF-TP584].

#### Mansion tax · DRAFT
New York State's 1% tax on residential purchases of $1 million or more, paid by the buyer. In NYC a
separate **supplemental tax** rises in tiers from 0.25% at $2 million to 2.9% at $25 million and over;
NYC usage often calls both "the mansion tax".
- **Authoritative:** "An additional tax (mansion tax) of 1% of the sale price applies to residences where
  consideration is $1 million or more" [NYSDTF-RETT]; "The additional tax and supplemental tax are paid by
  the grantee" [NYSDTF-TP584].
- **Source:** [NYSDTF-RETT], [NYSDTF-TP584].

## 3. Comps and market terms

#### Comparative market analysis (CMA) · DRAFT
A Casa Blanca agent's analysis of comparable sales, contracts and listings, used to recommend a price range
for a specific home — a licensee's estimate of market value for listing or selling. **It is not an
appraisal, is never called one, and can't stand in for one where a lender needs one.** This is what the
comp report tool produces.
- **Authoritative:** the NY Department of State treats "Market value estimates as a real estate licensee in
  connection with the listing and/or sale of real estate (i.e., 'comparative market analysis')" as
  unacceptable appraisal experience [NYDOS-Appraiser-FAQ]; Executive Law §160-jjjj(3) refers to "a
  comparative market analysis for the purpose of or intention to list or sell real estate"
  [NYDOS-AMC-FAQ]. REBNY's Code: "The term 'appraisal' shall refer only to an opinion rendered by a
  licensed appraiser" [REBNY-Ethics-2025].
- **Synonyms:** comps; comp report (StreetEasy's term); pricing analysis. REBNY calls a paid one a "market
  evaluation" or "broker opinion letter".
- **Not to be confused with:** an *appraisal*; a *broker price opinion*; an AVM estimate; DOF market value.
- **Open for counsel:** Executive Law §160-a defines appraisal broadly — "an analysis, opinion or conclusion
  relating to the nature, quality, value or utility of specified interests in, or aspects of, identified
  real estate" [NY-Exec-160-a] — and no source found states outright that a CMA falls outside it. The
  design's hard block on "appraisal" and "appraised value" in client copy (§9, §14) is the safe convention.
- **Source:** [NYDOS-Appraiser-FAQ], [NYDOS-AMC-FAQ], [REBNY-Ethics-2025], [NY-Exec-160-a].

#### Appraisal · DRAFT
An opinion of a property's market value as of a specific date, prepared independently by a licensed or
certified appraiser — usually for a lender. Casa agents don't prepare appraisals.
- **Authoritative:** "a written statement independently and impartially prepared by a qualified appraiser
  setting forth an opinion as to the market value of an adequately described property as of a specific
  date(s)" [CFR-12-34.42]; New York's definition is broader (under CMA) [NY-Exec-160-a].
- **Not to be confused with:** a CMA; a BPO; DOF's assessment.
- **House rule:** "appraisal" and "appraised value" are banned from client copy (§9, §14).
- **Source:** [CFR-12-34.42], [NY-Exec-160-a].

#### Broker price opinion (BPO) · DRAFT
A broker's estimate of a property's probable selling price, usually ordered by a lender, servicer or
investor. A close cousin of a CMA, different in purpose and audience.
- **Authoritative:** "an estimate prepared by a real estate broker, agent, or sales person that details the
  probable selling price of a particular piece of real estate property" — and it "may not be used as the
  primary basis to determine the value" for a purchase-money mortgage on a principal dwelling
  [USC-12-3355]; "A BPO is not by itself an appraisal or evaluation" [IAEG-2010].
- **Note:** don't provide CMAs to lenders as BPOs without a compliance check.
- **Source:** [USC-12-3355], [IAEG-2010].

#### Market value · DRAFT
The most probable price a home would bring in a competitive, open-market sale between typically
motivated, well-informed parties, after reasonable exposure and without unusual financing or concessions.
An estimate; a sale price is a fact.
- **Authoritative:** "the most probable price which a property should bring in a competitive and open
  market under all conditions requisite to a fair sale, the buyer and seller each acting prudently and
  knowledgeably, and assuming the price is not affected by undue stimulus" [CFR-12-34.42].
- **Not to be confused with:** DOF's "market value" (an assessment figure) [NYCDOF-Terms]; a list price.
- **Open for Noble:** the proposed disclaimer (D-13) calls a CMA "an estimate of market value", matching the
  Department of State's wording; confirm the phrase is wanted in client copy, since it is also the
  regulatory definition behind appraisals.
- **Source:** [CFR-12-34.42].

#### Comparable (comp) · DRAFT
A recent sale — or, labelled as such, a contract or listing — of a home like the subject: same ownership
type, similar building, location, size, layout, condition and outdoor space. Evidence of what the subject
would sell for.
- **Authoritative:** Fannie Mae: "Comparable sales should have similar physical and legal characteristics
  when compared to the subject property"; those "closed within the last 12 months should be used …
  however, the best and most appropriate comparable sales may not always be the most recent"
  [FNMA-B4-1.3-08].
- **Synonyms:** comp, comparable sale.
- **Not to be confused with:** the *subject*; active competition (evidence of supply, not value).
- **Source:** [FNMA-B4-1.3-08].

#### Subject property · DRAFT
The home the CMA is about — the one being priced. It is never in the StreetEasy export (§6.2).
- **Synonyms:** the subject.
- **Source:** [FNMA-B4-1.3-08]; `01-design.md` §6.2.

#### Arm's-length transaction · DRAFT
A sale between unrelated parties, each acting in their own interest, after normal market exposure, with no
special relationship, pressure or unusual terms affecting the price. Only arm's-length sales count as
comps; family transfers, $0 or nominal deeds, related-entity and bulk sales are flagged or excluded.
- **Authoritative:** no statutory definition found. The market-value conditions include "Buyer and seller
  are typically motivated" [CFR-12-34.42]; NYC DOF: "A $0 sale indicates that there was a transfer of
  ownership without a cash consideration" [DOF-RollingSales].
- **Not to be confused with:** a distressed sale (possibly arm's-length, with a condition of sale); an
  "off-market" sale (arm's-length but with limited exposure).
- **Source:** [CFR-12-34.42], [DOF-RollingSales], [FNMA-B4-1.3-07].

#### Conditions of sale · DRAFT
Circumstances of a transaction that can move its price away from market value: related parties, estate or
distress sales, a tenant in place, the buyer paying the seller's transfer taxes or flip tax, bulk
purchases, furniture included, unusual financing. Flagged always; adjusted or excluded.
- **Authoritative:** market value assumes "The price represents the normal consideration for the property
  sold unaffected by special or creative financing or sales concessions" [CFR-12-34.42].
- **Not to be confused with:** property characteristics; market conditions (time).
- **Source:** [CFR-12-34.42], [FNMA-B4-1.3-07].

#### Concessions (seller credits) · DRAFT
Anything the seller, sponsor or another interested party gives the buyer that lowers the buyer's real cost
without lowering the recorded price — closing-cost credits, paid transfer taxes, months of common charges.
A comp is adjusted down by the concession's market effect, never up.
- **Authoritative:** "A cash or noncash contribution that is provided by the seller or other party to the
  transaction and reduces the purchaser's cost to acquire the real property" — excluding "fees that a seller
  is customarily required to pay under state or local laws" [IAEG-2010]; "Positive adjustments for sales or
  financing concessions are not acceptable" [FNMA-B4-1.3-09].
- **Synonyms:** seller credit; sponsor concession; closing credit.
- **Not to be confused with:** a price reduction; Fannie Mae's narrower "sales concessions" (non-realty
  items only) [FNMA-B3-4.1-02]. The house term is simply "concessions".
- **Source:** [IAEG-2010], [FNMA-B4-1.3-09], [FNMA-B3-4.1-02].

#### Interested party contributions (IPCs) · DRAFT
Fannie Mae's term for money or value from someone with a stake in the sale toward costs the buyer would
normally pay. Casa says "concessions"; "IPC" only when talking about mortgage limits.
- **Authoritative:** "contributions made by third parties with a vested interest in the transaction. These
  funds are used to cover costs that are typically the buyer's responsibility" [FNMA-B3-4.1-02].
- **Source:** [FNMA-B3-4.1-02].

#### Sold, in contract, active (evidence status) · DRAFT
- **Sold (recorded):** closed, with the price from the city record (ACRIS/DOF) — the strongest evidence.
  **Sold (unrecorded):** closed per the broker, not yet recorded — provisional.
- **In contract:** a contract signed by buyer and seller; the final price usually isn't public. Evidence of
  demand near the last ask.
- **Active:** on the market at an asking price — evidence of competition, not of value.
- **Authoritative (industry):** "In contract (sales): A sales listing with an accepted offer and contract
  signed by the buyer and the seller"; "Sold: … StreetEasy will automatically start looking for sale
  records on ACRIS" [SE-Help-Status]; recorded sales "take anywhere from 6 days to up to 90 days to be
  reported" [SE-Help-Diff]; "most sales get recorded within 2-8 weeks of the closing" [SE-Help-Closing].
  Fannie Mae: "Contract offerings and current listings can be used as supporting data" [FNMA-B4-1.3-08].
- **Synonyms:** closed; pending, under contract; on market.
- **Not to be confused with:** a broker-marked "sold" and a recorded sale; an accepted offer (not yet in
  contract); REBNY's ban on describing an exclusive listing as "Off-Market" [REBNY-UCBA-rules-2026].
- **Note:** Fannie Mae time-adjusts from the **contract** date, so the tool should keep contract, closing
  and recording dates apart. See also *evidence class* in §6.
- **Source:** [SE-Help-Status], [SE-Help-Diff], [SE-Help-Closing], [FNMA-B4-1.3-08].

#### Public-record closing · DRAFT
A sale that appears in the StreetEasy export only from city records — a `/closing/` URL — with no listing
data: no ask, no days on market, no features. It can't be checked for condition, and it isn't by itself
proof of an off-market or non-arm's-length sale.
- **Source:** `01-design.md` §6.2; `00-orientation.md` §3; `adjustments.md` factor 29.

#### Asking price; last ask; original ask · DRAFT
The **asking price** is a listing's published price. The **last ask** is the asking price in force when the
home went into contract — the export's `Listing Price` column. The **original ask** is the first asking
price. After price cuts the two differ.
- **Source:** [MS-Metrics]; `01-design.md` §6.3.

#### Sale-to-list ratio (sale-to-last-ask) · DRAFT
The closed price divided by the asking price, as a percentage. **The house default is sale-to-last-ask**;
sale-to-original-ask is always labelled separately. Listing discount = 100% − sale-to-last-ask.
- **Authoritative (industry):** StreetEasy: "the ratio of a home's final recorded sale price to its initial
  asking price", and area figures use "the median ratio" [SE-Blog-STL-2023]. Miller Samuel's **listing
  discount**: "The average percentage difference between the last list price and the contract price"
  [MS-Metrics].
- **Synonyms:** S/L; "list-to-sale ratio" (StreetEasy's comps report).
- **Not to be confused with:** sale-to-original-ask; a price reduction (original ask against last ask).
- **Conflict:** StreetEasy divides by the *initial* ask and reports medians; Miller Samuel uses the *last*
  ask and averages. Never mix them in one table. The design uses both "sale-to-ask" (§6.7, §6.8) and
  "sale-to-last-ask" (§6.3); one label would be clearer.
- **Source:** [SE-Blog-STL-2023], [MS-Metrics].

#### Days on market (DOM) · DRAFT
Days from when a listing first went active to the signed contract (or to today, if still active). It
carries across price changes and relistings unless the home was off the market 30+ consecutive days — the
REBNY and StreetEasy rule.
- **Authoritative (industry):** REBNY: DOM starts when a listing is transmitted over the RLS; Coming Soon
  and Participant Only listings "shall not accrue 'days on market'"; DOM resets "where the Exclusive
  Listing has been in 'withdrawn' or 'cancelled' status for thirty (30) consecutive days"
  [REBNY-UCBA-rules-2026]. StreetEasy: a listing's DOM "can only be refreshed by creating a new listing" after
  "at least 30 consecutive days" off the market [SE-Help-DOMreset]. **Miller Samuel's differs:** "The average
  number of days from the last change in list price to the contract date" [MS-Metrics].
- **Synonyms:** DOM; time on market.
- **Not to be confused with:** Elliman Report DOM (restarts at each price cut, so runs shorter); an
  appraisal's "exposure time" [IAEG-2010]; contract-to-close time.
- **Note:** store DOM for this listing and cumulative DOM separately; label every DOM figure with its
  definition.
- **Source:** [REBNY-UCBA-rules-2026], [SE-Help-DOMreset], [MS-Metrics].

#### Price per square foot ($/sqft) — interior only, and with outdoor space · DRAFT
Price divided by the unit's **interior** square footage, with its basis: **sale** for sold comps, **ask**
for in-contract and active ones (§6.3). Every figure carries its square-footage source — offering plan,
listing, StreetEasy estimate. **Outdoor space is never added to the denominator in the house figure**; it
is recorded as its own field and handled as an adjustment. A "with outdoor space" figure, where shown,
states its method.
- **Authoritative:** Fannie Mae requires interior-perimeter measurement for condo and co-op units, and says
  "The ANSI standard cannot be used to measure apartment/multifamily buildings" [FNMA-B4-1.3-05]. Miller
  Samuel's average $/sf is "The sum of all apartment sales prices … divided by the total square footage of
  all sales" [MS-Metrics]. StreetEasy: "When square footage is estimated, price per square foot is also
  estimated" [SE-Help-Comps].
- **Synonyms:** PPSF, $/sf, price per foot.
- **Not to be confused with:** an average of each sale's $/sf (Miller Samuel's aggregate weights large units
  more); DOF's building "gross square feet" [DOF-RollingSales]; **the export's `$/Sqft` column**, which
  switches basis by status and truncates (§6.2).
- **Open for Noble:** no NYC residential measurement standard was found; offering-plan figures include walls
  (`adjustments.md` factor 1). Whether and how a "with outdoor space" figure is ever shown is a house
  decision — Miller Samuel's method converts outdoor area to interior-equivalent area at 25–50%
  (`adjustments.md` factor 7).
- **Source:** [FNMA-B4-1.3-05], [MS-Metrics], [SE-Help-Comps].

#### Approximate and estimated square footage · DRAFT
A square footage marked approximate at its source — StreetEasy's `~1,840 ft²` — or estimated by
StreetEasy's own model. Used as `approx` and flagged; its $/sqft inherits the uncertainty.
- **Source:** [SE-Help-Comps]; `01-design.md` §6.1.

#### Gross rent multiplier (GRM) · DRAFT
Price divided by gross rent; always say whether the rent is monthly or annual.
- **Authoritative:** the income approach must include "the calculations used to determine the gross rent
  multiplier" [FNMA-B4-1.3-10].
- **Not to be confused with:** a cap rate (net income); gross yield (its inverse).
- **Source:** [FNMA-B4-1.3-10], [URAR-2026].

#### Gross yield · DRAFT
Annual gross rent divided by price, as a percentage — before common charges, taxes, maintenance and
vacancy. A net yield subtracts them.
- **Authoritative:** none found; industry usage — "All yields are gross - i.e., before taxes, repair costs,
  ground rents, estate agents' fees, and any other costs" [GPG-2026].
- **Not to be confused with:** a cap rate; net yield.
- **Source:** [GPG-2026].

#### Capitalization rate (cap rate) · DRAFT
Yearly net operating income divided by value or price.
- **Authoritative:** NYC DOF: "capitalization rate equals yearly net operating income divided by total
  value" — for tax purposes, with property taxes left out of operating expenses [NYCDOF-Terms]; investors'
  cap rates usually include them. Label which.
- **Source:** [NYCDOF-Terms].

## 4. Adjustment methods

#### Adjustment · DRAFT
A change applied to a comp's price for a difference between it and the subject — size, floor, view,
condition, outdoor space, time, concessions. The comp is adjusted toward the subject: a better comp is
adjusted down.
- **Authoritative:** "The appraiser's adjustments must reflect the market's reaction (that is, market based
  adjustments) to the difference in the properties" [FNMA-B4-1.3-09].
- **Not to be confused with:** a price reduction; a reconciliation weight.
- **Note:** in the tool, no adjustment has a value until Noble sets it (§6.6).
- **Source:** [FNMA-B4-1.3-09].

#### Elements of comparison · DRAFT
The standard list of ways a comp can differ from the subject: property rights conveyed, financing terms,
conditions of sale, expenditures immediately after purchase, market conditions, location, physical
characteristics, economic characteristics, use, non-realty components — transactional elements first.
- **Source:** [UBC-ARE-2010]; `adjustments.md`, methods section.

#### Paired sales (matched pairs) · DRAFT
Isolating what one feature is worth by comparing sales alike except for that feature — two similar units
in one building, one with a terrace.
- **Authoritative:** "two similar sales that exhibit a difference in only one attribute with the price
  difference reflecting the value of the attribute" [UBC-ARE-2010]; named among accepted methods
  [FNMA-B4-1.3-09].
- **Not to be confused with:** repeat sales (the same home sold twice — an index method).
- **Source:** [UBC-ARE-2010], [FNMA-B4-1.3-09].

#### Grouped data analysis · DRAFT
Comparing groups of sales that differ on one characteristic — median $/sf with and without a doorman.
Reliable only "when there are many sales available all with similar characteristics" [UBC-ARE-2010];
groups usually differ in other ways too.
- **Source:** [UBC-ARE-2010].

#### Hedonic regression · DRAFT
A statistical model that estimates price from a home's characteristics, giving each an implied value with
the others held constant.
- **Authoritative:** "Hedonic models generally use property characteristics (such as square footage and room
  count) and methodologies to process information, often based on statistical regression" [IAEG-2010].
- **Not to be confused with:** index or repeat-sales models; paired sales.
- **Note:** if the tool ever uses regression to suggest adjustments, the result is still the agent's
  opinion — not an AVM value, not an appraisal.
- **Source:** [IAEG-2010].

#### Cost to cure; contribution · DRAFT
**Cost to cure** is what it would cost to bring a comp to the subject's condition. **Contribution** is what
the market actually pays for an item — usually less than its cost ("cost does not equal value"
[UBC-ARE-2010]). Cost is a cap or cross-check, not an adjustment by itself.
- **Source:** [UBC-ARE-2010], [CVV-2025].

#### Capitalisation (of a cost or income difference) · DRAFT
Turning a monthly or annual difference — higher maintenance, a lost rent — into a price difference, by a
capitalisation rate or a loan-equivalent.
- **Authoritative:** "the loss of income due to some deficiency is capitalized into a capital value"
  [UBC-ARE-2010].
- **Source:** [UBC-ARE-2010], [MS-2013-maint].

#### Bracketing · DRAFT
Choosing comps so the subject sits between them on each key feature — some larger and some smaller, higher
and lower floors, sold above and below — so its value is bounded by evidence rather than extrapolated. In
the tool, the range brackets the subject with the primary sold comps (§6.5).
- **Authoritative:** none read beyond a textbook note: "Reliable results may be obtained by bracketing the
  subject between those inferior and superior properties" [UBC-ARE-2010].
- **Source:** [UBC-ARE-2010]; `01-design.md` §6.5.

#### Reconciliation · DRAFT
The last step: weighing the evidence into one conclusion, favouring the most similar, recent, closed and
least-adjusted comps, and explaining the weighting. In the tool, the agent's choice of lead indicator and
range is the reconciliation.
- **Authoritative:** "the appraiser considers the reliability and applicability of each of the approaches to
  value" [FNMA-B4-1.3-11]; the redesigned form weights each comp "Most", "Less" or "No Weight" [URAR-2026].
- **Not to be confused with:** averaging.
- **Source:** [FNMA-B4-1.3-11], [URAR-2026].

#### Time (market-conditions) adjustment · DRAFT
An adjustment for how the market moved between a comp's contract date and today, supported by a price index
or by sales.
- **Authoritative:** comps must be analysed "for any changes in market conditions from their contract dates
  through the effective date"; "Use of home price indices (HPIs) to support time adjustments is consistent
  with our policy" [FNMA-B4-1.3-09].
- **Source:** [FNMA-B4-1.3-09]; `adjustments.md` factor 28.

## 5. Fair housing and compliance

#### Fair housing · DRAFT
The federal, state and NYC laws that bar discrimination in selling, renting, advertising or financing
housing because of a protected characteristic. They apply to every CMA, listing and message the tool
writes.
- **Authoritative:** it is unlawful "To refuse to sell or rent … or otherwise make unavailable or deny, a
  dwelling to any person because of race, color, religion, sex, familial status, or national origin"
  [USC-42-3604]; "The New York City Human Rights Law … prohibits discrimination in New York City, in
  employment, housing, and public accommodations" [CCHR-Law].
- **Not to be confused with:** FHA the Federal Housing Administration.
- **Source:** [USC-42-3604], [CCHR-Law].

#### Protected class · DRAFT
A characteristic the law bars from influencing housing decisions or communications. Casa uses the widest
applicable list — federal, New York State and NYC — including lawful source of income, lawful occupation
and the presence of children.
- **Authoritative:** federal — "race, color, religion, sex, familial status, or national origin", plus
  handicap [USC-42-3604]; NYC adds, among others, age, immigration or citizenship status, disability, gender
  identity, marital and partnership status, sexual orientation, and in housing "Lawful source of income",
  "Lawful occupation" and "The presence of children" [CCHR-Law].
- **Note:** the New York State Human Rights Law (Executive Law §296) wasn't read and should be added before
  adoption.
- **Source:** [USC-42-3604], [CCHR-Law].

#### Steering · DRAFT
Guiding a buyer or renter toward or away from homes, buildings or neighbourhoods because of a protected
characteristic — by what's said, shown or left out.
- **Authoritative:** unlawful "to restrict or attempt to restrict the choices of a person by word or
  conduct … so as to perpetuate, or tend to perpetuate, segregated housing patterns"; including
  "Communicating to any prospective purchaser that he or she would not be comfortable or compatible with
  existing residents" [CFR-100.70]. The NYC Human Rights Law prohibits "Steering people toward or away from
  certain neighborhoods" [CCHR-Law].
- **Note:** HUD's April 2026 letter says discussing school quality or crime "in an equal and consistent
  manner" is not by itself steering under federal law [HUD-DCL-2026]; state and city law are enforced
  separately [NYAG-2023-CB]. School zone stays in the analyst view only (§14).
- **Source:** [CFR-100.70], [CCHR-Law], [HUD-DCL-2026].

#### Disclaimer and StreetEasy attribution · DRAFT
Every export carries a not-an-appraisal disclaimer and "Data provided by StreetEasy". StreetEasy's own
report reads: "It is not an appraisal, valuation, broker price opinion, and is meant to be a starting
point." The wording for Casa is pending Hannah (D-13).
- **Source:** `01-design.md` §14; `docs/decisions.md` D-13.

## 6. The tool's own terms

Defined by the design (`01-design.md`), so the source for each is the section named. They are listed
here so the assistant, the writer and the agents use them one way. Infrastructure terms (Netlify,
Postgres, streaming, effort settings) are left out — this glossary is for agents and for what the tool
says to them.

### Inputs and capture

#### Your call · DRAFT
The agent's own opinion of the subject's value, given as a range ("I think it trades at $3.4–3.6M")
before the computed range is revealed. It never enters the calculation; at the reveal it is shown
against the data.
- **Synonyms:** the call; the agent's call.
- **Not to be confused with:** *target* (a price goal); *stated fact*; *broker recommendation* (the
  agent's advice to the client, made after the analysis).
- **Source:** `01-design.md` §2, §3.1, §8.4.

#### Target · DRAFT
A price goal — the seller's number or the buyer's ceiling ("The seller wants $11.5M"). It never enters
the calculation; once the neutral result exists it drives *Path to target*.
- **Synonyms:** target price; the client's number.
- **Not to be confused with:** *your call* (the agent's opinion of value); *asking price* (a listing's
  published price); *list-price recommendation* (a strategy the agent proposes).
- **Source:** `01-design.md` §2, §8.5.

#### Stated fact · DRAFT
A fact about a property supplied by the agent ("the terrace is 400 sq ft — it's on the floor plan").
It feeds the calculation, attributed to the agent. With a source it is used as `exact` and checked where
possible; as the agent's estimate ("probably about 400") it is a *guesstimate* and lands only in *with
estimates*.
- **Not to be confused with:** *note* (context that never enters a number); *method setting*.
- **Source:** `01-design.md` §2.

#### Method setting · DRAFT
An instruction that changes how the analysis runs — a recency window, a comp's tier, the lead
indicator, "add 5% for the terrace" — recorded with the agent's reason. A setting that carries a number
is the agent's estimate and lands only in *with estimates*.
- **Synonyms:** setting.
- **Not to be confused with:** *stated fact* (about the property, not the method); *house method* (the
  firm's calibrated values, set by Noble).
- **Source:** `01-design.md` §2.

#### Note (context, not calculated) · DRAFT
Context or opinion without figures ("the seller is motivated"). It never enters the numbers; it informs
strategy and the writer, labelled as the agent's view. The assistant's own speculation ("a corner unit
on this block usually commands more") is shown the same way — *context, not calculated*.
- **Synonyms:** context; context note.
- **Not to be confused with:** *stated fact*; *considered, not calculated* (an adjustment factor
  without a determined value).
- **Source:** `01-design.md` §2, §8.3 rule 2.

#### Statement · DRAFT
Anything the agent tells the tool — a call, target, fact, setting or note — as captured: its kind,
field, value and basis, the message it came from, and when it was confirmed.
- **Not to be confused with:** *judgment* (a decision made by Jev or its fallback, not by the agent).
- **Source:** `01-design.md` §2, §12.

#### Assumptions panel · DRAFT
The one place, always reachable, that holds every captured input. The agent edits it directly; the
assistant writes to it as the agent talks; nothing lives only in chat history.
- **Source:** `01-design.md` §2.

#### Two-keyed capture · DRAFT
The assistant and Jev each classify an agent's statement independently. Where they agree it appears
as a chip to confirm; where they disagree, or either is unsure, the agent gets a one-tap question.
Disagreements are logged.
- **Source:** `01-design.md` §2.

#### Trust but verify · DRAFT
A stated fact is used at once, attributed to the agent, then checked against the listing, the export
and earlier imports of the same property. A contradiction is flagged; neither side is silently
overridden.
- **Source:** `01-design.md` §2.

#### Intake · DRAFT
The opening form. Only the subject property is required; everything else — the comps, the brief, the
call, a target, deal terms — is a module the agent can fill now, later or never. Intake asks once.
- **Source:** `01-design.md` §3.

#### Brief · DRAFT
What the report is for: the question being answered, the audience, and the client profile. Derived
from the six-part prompt (property, question, audience, method, goal, output) found in the ChatGPT
workflow audit.
- **Source:** `01-design.md` §3; `sources/2026-09-23-chatgpt-workflow-audit.md` §14.

#### Deal terms · DRAFT
An optional intake module built from scenario templates — for a buyer: price point, deposit, financing,
target closing, any interim rent; for a seller: target, timing, flexibility. Revising terms makes a
new scenario version.
- **Source:** `01-design.md` §6.7; `docs/decisions.md` D-10.

### Comps and review

#### StreetEasy comp export · DRAFT
The CSV (or XLSX) an agent downloads from StreetEasy's comps tool: one row per comp, 31 columns, mapped by
header name. The subject is never in it. Its `Listing Price` is the last ask; its `$/Sqft` column divides
the sale price for sold rows and the asking price otherwise, and truncates — the tool never uses it and
recomputes $/sqft with its basis. A `/closing/` URL marks a public-record closing.
- **Synonyms:** the export; the comp export.
- **Source:** `01-design.md` §6.2; `00-orientation.md` §3.

#### Neutral valuation · DRAFT
The analysis computed without the agent's call or any target — what the comps indicate before any
argument is made. The design's internal term. Proposed for client copy: "price range" or "comparative
market analysis" — never "appraisal" or "appraised value" (§9, §14).
- **Not to be confused with:** an *appraisal*; Path to target (which starts from it).
- **Source:** `01-design.md` §4 (non-negotiable 5), §8.4.

#### Comparability score · DRAFT
A Jev judgment of how similar a comp is to the subject, used only to **sort and warn** — the agent decides
what counts.
- **Source:** `01-design.md` §7; `00-orientation.md` §8.

#### Tier — primary, secondary, excluded · DRAFT
The agent's judgment of how much a comp counts, always with a reason. **Primary** comps are the closest
like-for-like evidence, and primary *sold* comps set the range. **Secondary** comps are shown as
supporting context. **Excluded** comps are kept, with the reason, but don't count.
- **Not to be confused with:** *evidence class* (sold / in contract / active — what kind of evidence a
  comp is, not how much it counts).
- **Source:** `01-design.md` §3, §6.5; audit §10.

#### Reason · DRAFT
Why a comp is tiered as it is, typed as **property** (about the home), **client** (about this client's
needs) or **method** (about the analysis). Reasons are kept as an append-only history; the latest is
the current one.
- **Source:** `01-design.md` §12.

#### Reviewed · DRAFT
The agent has opened the comp's listing and marked it reviewed.
- **Source:** `01-design.md` §3.

#### First-pass review · DRAFT
The stage where the agent tiers each comp, with the computed range hidden until they give their call
or skip it.
- **Source:** `01-design.md` §3, §3.1.

#### The reveal · DRAFT
The moment the computed range is shown — after the agent gives their call, or skips it. The call is
shown against the data: the teaching moment.
- **Source:** `01-design.md` §3.1, §8.4.

#### Like for like · DRAFT
The rule that a comp must be the same kind of property as the subject: condos against condos, co-ops
against co-ops.
- **Source:** `00-orientation.md` §2 (Hannah); `01-design.md` §6.5.

#### Anchor · DRAFT
The single most comparable sold comp, marked by the agent (Jev suggests one). Its $/sqft is one of the
unit-rate indicators.
- **Synonyms:** anchor comp; best comp; most comparable sale.
- **Not to be confused with:** *anchoring* (the bias of fixing on a number seen first — the reason the
  range stays hidden until the call).
- **Source:** `01-design.md` §6.3; audit §4.

#### Evidence class · DRAFT
What kind of evidence a comp is: **sold** (a closed sale), **in contract** (a signed contract, not yet
closed — ask basis) or **active** (on the market — ask basis). Classes never mix inside one statistic.
- **Synonyms:** evidence status (the name used in Appendix A, factor 32).
- **Not to be confused with:** *tier*; *listing status* (StreetEasy's column, which the evidence class
  is read from).
- **Source:** `01-design.md` §6.3; Appendix A #32. See also *sold*, *in contract*, *active* in §3.

### Numbers and results

#### Unit-rate indicator · DRAFT
A $/sqft statistic — the **median**, the **mean**, or the **anchor**'s — computed over comps that have
square footage, as is the subject. Each yields an *implied value* for the subject. Condos only; co-ops
switch it off.
- **Not to be confused with:** *adjusted-price indicator*.
- **Source:** `01-design.md` §6.3.

#### Adjusted-price indicator · DRAFT
Each sold comp's price with any *determined* adjustments applied, read as an indication of the
subject's price; summarised with the same statistics.
- **Source:** `01-design.md` §6.3.

#### Implied value · DRAFT
The subject value an indicator implies — for a unit-rate indicator, the indicator's $/sqft times the
subject's square footage.
- **Synonyms:** implied subject value; indicated value (appraisal usage).
- **Source:** `01-design.md` §6.3.

#### Lead indicator · DRAFT
The indicator the agent picks to set the *base*. The default shown is the median, labelled as the
default method pending Noble.
- **Source:** `01-design.md` §6.5.

#### Base · DRAFT
The lead indicator's implied value — the midpoint the rest of the analysis works from.
- **Not to be confused with:** *base case* (the featureless unit the additive model starts from).
- **Source:** `01-design.md` §6.5.

#### Range · DRAFT
Lowest to highest implied value among the agent's **primary sold** comps; the agent can narrow it,
with a reason. The tool always gives value as a range, never a point.
- **Not to be confused with:** StreetEasy's "estimated sale price range", which runs from the lowest
  price to the highest across every status; *list-price recommendation*, which may be a single number
  because it is a strategy, not a value claim.
- **Source:** `01-design.md` §4.4, §6.2, §6.5.

#### Additive model · DRAFT
The engine's shape: the base case is a featureless unit, and each factor switches on when a property
has it and the data exists. A Brooklyn one-bedroom and a Tribeca penthouse run the same engine.
- **Source:** `01-design.md` §6.5.

#### On the facts · DRAFT
The result computed from inputs whose confidence is `exact` or `approx`, and from adjustments with
determined values only.
- **Not to be confused with:** *with estimates*.
- **Source:** `01-design.md` §6.4.

#### With estimates · DRAFT
The *on the facts* result plus the agent's *guesstimate* inputs and any adjustment values the agent has
stated. Always shown beside *on the facts*; if client copy uses it, the estimates are disclosed
automatically. A wide gap between the two means the range rests on guesses.
- **Source:** `01-design.md` §6.4, §9.

#### Input confidence — exact, approx, inferred, guesstimate · DRAFT
How far an input can be trusted. **Exact** — as given by its source. **Approx** — marked approximate
at its source (StreetEasy's `~1,840 ft²`). **Inferred** — derived from listing text or a Jev judgment;
needs the agent's confirmation. **Guesstimate** — the agent's estimate.
- **Not to be confused with:** *judgment confidence* (Jev's calibrated score for a decision). The design
  uses "confidence" for both; the tool should label them differently.
- **Source:** `01-design.md` §6.1.

#### Input source · DRAFT
Where an input came from: `se_export` (the StreetEasy CSV), `se_pdf` (StreetEasy's PDF report),
`listing` (a listing lookup), `agent`, `hypothetical`, or `engine` (computed).
- **Source:** `01-design.md` §6.1.

#### Provenance · DRAFT
The source, as-of date and confidence carried by every figure.
- **Source:** `01-design.md` §4.7.

#### As-of date · DRAFT
The date a figure was true at its source — a closing date, a listing's date, the date of a tax bill.
- **Not to be confused with:** the date the figure was imported or entered (recorded separately).
- **Source:** `01-design.md` §4.7, §6.1; audit §11.

### Adjustments

#### Factor · DRAFT
One entry in the adjustment catalog (Appendix A): what it captures, what data it needs, where the data
can come from. Its magnitude is undetermined until Noble sets it in the house method.
- **Synonyms:** adjustment factor.
- **Source:** `01-design.md` §6.6, Appendix A.

#### Adjustment catalog · DRAFT
The list of 36 factors that can bear on an NYC residential comp, in Appendix A, with the interaction
map in A.5.
- **Source:** `01-design.md` Appendix A.

#### House method · DRAFT
The one versioned file holding every magnitude, weight and bound the engine uses. In production every
value is `null` until Noble sets it; every version of a report records which house method produced it.
- **Not to be confused with:** *method setting* (the agent's choice for one report); the *test config*
  (values used only to exercise the arithmetic, refused outside tests).
- **Source:** `01-design.md` §6.6.

#### Determined · DRAFT
A factor whose magnitude has been set in the house method. Only determined adjustments enter *on the
facts*.
- **Not to be confused with:** a value the agent states, which is the agent's estimate and enters only
  *with estimates*.
- **Source:** `01-design.md` §6.4, §6.6.

#### Considered, not calculated · DRAFT
A factor that applies but has no determined value. It appears in the bridge marked *value not yet
determined*, the assistant can discuss it, and it moves no number.
- **Not to be confused with:** *context, not calculated* (a note or speculation, not a factor).
- **Source:** `01-design.md` §6.6.

#### Bridge · DRAFT
The itemised path from the comp evidence to the subject's range: each adjustment line with its value,
or *value not yet determined*. The analyst view shows it in full; the client view in plain language.
- **Source:** `01-design.md` §6.6, §10.1; audit §2 ("the complete mathematical bridge").

#### Interaction map · DRAFT
Appendix A.5: which factors change one another's value, and how. Structure only until magnitudes are
researched (CR-R2).
- **Source:** `01-design.md` §6.6, Appendix A.5.

#### Substitutes · DRAFT
Two factors that meet the same need, so having one lowers what the other adds — a private terrace and
a building roof deck. The engine applies a substitute group as the larger adjustment, never the sum.
- **Not to be confused with:** *overlap* (one factor partly *is* the other).
- **Source:** `01-design.md` §6.6, A.5.

#### Complements · DRAFT
Two factors worth more together than apart — a terrace with a skyline view. Shown as an interaction
line whose value is not yet determined.
- **Source:** `01-design.md` §6.6, A.5.

#### Overlap · DRAFT
Two factors that partly measure the same thing — a high floor often *is* the view; extra rooms usually
arrive with extra area. Adjusting for both double counts; the assistant warns when the agent states
values for both.
- **Source:** `01-design.md` §6.6, A.5.

#### Conditional, offsetting, correlated · DRAFT
The other relationships in A.5. **Conditional** — one factor's value depends on another's state (a
garage space adds less where street parking is easy). **Offsetting** — one factor's benefit comes with
a cost that is priced separately (amenities raise common charges). **Correlated** — factors that tend
to occur together (large buildings more often carry full service), which matters when reading
evidence, not necessarily when adjusting.
- **Source:** `01-design.md` A.5.

#### Double counting · DRAFT
Adjusting for both sides of a substitute or overlapping pair, so one difference is paid for twice —
the classic comp error.
- **Source:** `01-design.md` §6.6.

### Price, carry and scenarios

#### Carry · DRAFT
Defined in §1 (*monthly carry*): common charges plus real estate taxes for a condo, maintenance for a
co-op — excluding the mortgage.

#### Price evaluation · DRAFT
What the tool computes for any price the agent names — a list price, an offer, a target, a what-if: its
$/sqft, where it falls in each result's range, its distance from each indicator, and what the comps'
typical sale-to-ask implies about negotiating room.
- **Source:** `01-design.md` §6.7.

#### Monthly cost estimate · DRAFT
Optional: from a rate, a down payment and a term the agent enters, principal and interest plus carry.
Always labelled an estimate.
- **Not to be confused with:** *carry* (excludes the mortgage); *housing cash outflow* (§1).
- **Source:** `01-design.md` §6.7.

#### Scenario · DRAFT
A named, immutable record of an evaluation — a what-if, a price evaluation, a set of deal terms.
Revising one makes a new version; it never overwrites.
- **Source:** `01-design.md` §6.7, §12; audit §7.

#### What-if (hypothetical) · DRAFT
A hypothetical built from values the agent gives ("what if it had a 400 sq ft terrace?"). Labelled
`hypothetical`, never mixed into either result, and in client copy only if the agent includes it.
- **Source:** `01-design.md` §8.3 rule 4.

#### Path to target · DRAFT
The mode for closing the gap between a target and the neutral result. Entering it pins the neutral
numbers; the assistant sets out what would have to be true, the legitimate levers (missing evidence,
uncaptured subject facts, method settings that are defensibly wrong), and names the illegitimate ones
(dropping comps only because they're low). The honest outcome is a supported path, a recommendation to
re-anchor the target, or both.
- **Source:** `01-design.md` §8.5.

#### Toward target · DRAFT
The tag on every change made in Path to target mode; each needs a reason grounded in the property or
the client.
- **Source:** `01-design.md` §8.5.

#### Target-seeking total · DRAFT
The running total of how far the agent's changes have moved the base toward or away from their call or
target, shown in the analyst view.
- **Source:** `01-design.md` §8.4.

### Writing, versions and QA

#### Version · DRAFT
An immutable snapshot of the numbers: engine and house-method versions, a hash of the inputs, and both
results. Drafting pins one; any later change silently starts the next.
- **Source:** `01-design.md` §3, §12.

#### Draft · DRAFT
A piece of writing — full email, short email, text, report narrative — bound to the version it was
written from.
- **Source:** `01-design.md` §3, §10.2.

#### QA · DRAFT
The checks run on every draft before it can be copied or exported: numeric grounding, range language,
compliance (the only hard block), freshness, and disclosure of estimates.
- **Source:** `01-design.md` §9.

#### Numeric grounding · DRAFT
The QA check that matches every number in a draft against the pinned version and the agent's
statements. An unmatched number is highlighted and must be attributed in the text or acknowledged by
the agent.
- **Source:** `01-design.md` §9.

#### Analyst view · DRAFT
The full working layer: every comp including exclusions and reasons, both results, all indicators, the
bridge with its undetermined lines, provenance, statements, history, target-seeking totals.
- **Not to be confused with:** *client view*.
- **Source:** `01-design.md` §10.1.

#### Client view · DRAFT
What the client sees: the range, the primary evidence, the bridge in plain language, market signals,
assumptions and their dates, disclosures, agent contact.
- **Source:** `01-design.md` §10.1.

#### Broker recommendation · DRAFT
The agent's own advice to the client — what to list at, offer or accept, and why. The tool asks for
it, checks it against the data and sharpens it; it never writes one cold.
- **Not to be confused with:** *your call* (the agent's opinion of value); the *range*.
- **Source:** `01-design.md` §8.3 rule 8.

#### Audience role · DRAFT
Who the writing is for: seller, buyer, investor, or broker-internal.
- **Source:** `01-design.md` §8.6.

#### Client profile · DRAFT
How the client decides — decision style, priorities, sophistication, the agent's notes — never who
they are. It shapes the writing and strategy within the range, never the range. It has no fields for
protected characteristics.
- **Source:** `01-design.md` §8.6.

#### Style profile (agent voice) · DRAFT
The tone, length, formality and number habits derived from an agent's own writing samples, which the
writer uses as reference. House rules outrank it.
- **Source:** `01-design.md` §8.7.

#### Coaching level · DRAFT
How much the tool asks before it drafts. Practice mode and newer agents: it asks first. Unlocked,
experienced agents: it drafts directly, with the neutral numbers beside the draft.
- **Source:** `01-design.md` §8.3 rule 9; `docs/decisions.md` D-5.

### Training, records and decisions

#### Practice mode · DRAFT
The same tool with the help switched off: the agent fills the fields, no assistant, results hidden, then
submits for grading and sees their work against the tool's.
- **Source:** `01-design.md` §11.

#### Training gate · DRAFT
The proposal that agents unlock the full tool by showing they can build a comp in practice mode, or by
a direct grant.
- **Source:** `01-design.md` §11; `docs/decisions.md` D-11.

#### Submission and rubric · DRAFT
A **submission** is a practice report sent for grading; the **rubric** is the set of criteria it's graded
on — code checks what code can, Jev scores judgment criteria, the LLM writes feedback, and Noble makes the
pass/fail call until the rubric is trusted.
- **Source:** `01-design.md` §11.

#### Roles: agent, mentor, admin, external · DRAFT
The tool's user roles. **Agents** build reports; **mentors** coach and can grant or deny access; **admins**
(Kimani, Hannah) manage users, the allowlist and spend; **external** users are authorised non-Casa people.
- **Source:** `01-design.md` §1, §11, §12.

#### Property record · DRAFT
One record per property — normalised address and unit, StreetEasy listing id, sourced facts with as-of
dates — shared by every report that brings it in. Facts belong to the property; tiers and reasons
belong to the report.
- **Source:** `01-design.md` §12.

#### Property observation · DRAFT
One sighting of a property's facts in one import — so status and price history accumulate instead of
being overwritten.
- **Source:** `01-design.md` §12.

#### Property pool · DRAFT
Casa's own growing record of properties across every agent's imports, which could later suggest sales a
given export missed. Cross-agent use waits on D-9.
- **Source:** `01-design.md` §12; `docs/decisions.md` D-9.

#### Jev · DRAFT
TypeSafe AI's "System One" model, used for typed judgments — pick an option, score on levels, yes/no —
each with calibrated probabilities and a confidence score. It generates no text and cannot output a
dollar figure.
- **Source:** `01-design.md` §7.1.

#### Judgment · DRAFT
A typed decision made by Jev or its fallback — a comp's tier suggestion, a view class, whether a comp
differs from the subject on a factor — stored with its probabilities and confidence.
- **Not to be confused with:** *statement* (the agent's input); *determined value* (a house-method
  magnitude).
- **Source:** `01-design.md` §7, §12.

#### Judgment confidence · DRAFT
Jev's calibrated score for a judgment. **High** — applied at once, visible and undoable; **middling**
— shown as a suggestion with its reason; **low** — asked of the agent. Thresholds are house-method
values.
- **Not to be confused with:** *input confidence* (exact / approx / inferred / guesstimate).
- **Source:** `01-design.md` §7.1.

#### Decision provider · DRAFT
The interface behind which Jev sits, with Claude Haiku 4.5 as the fallback, so the tool keeps working
if Jev is unavailable.
- **Source:** `01-design.md` §7.1.
