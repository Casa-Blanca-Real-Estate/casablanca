# The Gate, Findings, the target and the client

**In short**
- The Gate works, and so does the top of Findings. What confuses people is the wording and some leftovers: "13 still needed" counts every gap the engine raises, including ones nobody can fill. The price table runs 10 to 12 rows. The pricing details use the engine's words.
- Ships now: plainer copy (063 a, 071 a, 072, 073 a, 077), the five-row price table and calculator (065 a), Hubert seeing the target after the reveal (068, which D-4 already decided and the build never did), who the target belongs to (070), and the client fields as data (074 a). None of them changes the layout.
- Goes to Claude Design: chips in How Hubert got there, setting the target, the sale-against-ask chart, a first-class client and deal section, the loop after Findings (069 b, 075), and the factor dropdown (076).

| Id | Who | What | Class | Track | Phase |
|---|---|---|---|---|---|
| NW-061 | Kimani | "The two closest sales" and the true estimate are fine | NOOP | — | — |
| NW-062 | Kimani | The Gate was easy; View as new agent works | NOOP | — | — |
| NW-063 a | Both | How Hubert got there: plainer, no parentheticals | FIX | Mason | A-now |
| NW-063 b | Both | Comps as chips in How Hubert got there | DESIGN | Claude Design | B-after-design |
| NW-064 | Kimani | Make setting the target easier | DESIGN | Claude Design | B-after-design |
| NW-065 a | Both | Price table: five rows, the explanation on top, a calculator | BUILD | Abacus, then Mason | A-now |
| NW-065 b | Both | Five rows in the email too? Is the table needed, and for whom? | DECIDE | Kimani | A-now |
| NW-066 a | Kimani | Co-op: no interior-size gaps or $/sq ft wording | FIX | Abacus | A-now |
| NW-066 b | Kimani | Review the co-op flow on the co-op sample | DESIGN | Kimani, Claude Design | B-after-design |
| NW-067 a | Both | ⓘ on every accordion; say why these comps count; show the tags | BUILD | Mason | A-now |
| NW-067 b | Both | Hubert's own reason per comp | LATER | Calliste | C-later |
| NW-068 | Kimani | Hubert sees the target once Findings is reached; hint behind ⓘ | BUILD | Calliste (Mason if Calliste isn't up) | A-now |
| NW-069 a | Both | Pin the neutral result at the reveal; show movement toward the target | BUILD | Abacus, then Mason | A-now |
| NW-069 b | Both | The loop after Findings: find better comps toward the target | DESIGN | Claude Design, then Calliste | B-after-design |
| NW-070 | Kimani | Whose target: client, agent or both | BUILD | Mason | A-now |
| NW-071 a | Noble | Timing and Sales against ask: plain words | FIX | Mason | A-now |
| NW-071 b | Noble | A strip chart of each sale against its ask | DESIGN | Claude Design | B-after-design |
| NW-072 | Kimani | Days on market: median or average? | FIX | Mason | A-now |
| NW-073 a | Kimani | Terms: follow the report's side, plain label | FIX | Mason | A-now |
| NW-073 b | Kimani | Client and deal details first-class, not in the sixth accordion | DESIGN | Claude Design | B-after-design |
| NW-074 a | Both | Client fields in the data model (financing, urgency, values, non-negotiables) | BUILD | Mason | A-now |
| NW-074 b | Both | Where they're asked: intake or after Findings | DESIGN | Claude Design | B-after-design |
| NW-075 | Kimani | A justification step after Findings, with Hubert | DESIGN | Claude Design, then Calliste | B-after-design |
| NW-076 | Kimani | How this was worked out as a factor dropdown under How Hubert got there | DESIGN | Claude Design | B-after-design |
| NW-077 a | Kimani | "13 still needed": count only what the agent can fill, and say what | FIX | Mason | A-now |
| NW-077 b | Kimani | Engine: no gaps for comps that don't count or for facts no form asks | FIX | Abacus | A-now |

## Points that need more than their row

**NW-061, NW-062.** "The N closest sales" is the number of 1st-tier sold comps in the range (`Findings.tsx`, `TopCard`). The Gate's rule is in `Gate.tsx` and again on the server (`server/api/workspace.ts`, `checkCall`: `gate_required`, `gate_why`, 100 characters). "View as a new agent" shows to admins only.

**NW-063 a.** The text isn't a model reply. `hubertTake` (`src/views/findings/findings.ts`) builds it in code from the engine's output. On the sample it reads: "I started from your three 1st-tier sales: 5 Franklin Place #14A ($4.18M, 1,840 sq ft, sold Sep 2026), 66 Leonard Street #12A ($5.7M, 2,319 sq ft, sold Sep 2026) and 200 Chambers Street #10A (…). At $2,112–$2,457 a sq ft on 17L's 2,000 sq ft, that comes to $4.23M–$4.92M. …" The fix: one short sentence per idea, and the names without the parentheticals. The price, size and date go in a `title` on the name now, and in the chip later (063 b). "1st-tier" becomes "your closest". Keep the low-end and top-end sentence. That's the useful part.

**NW-065 a. What the price table computes today** (`engine/compute/price-table.ts`). It takes every 1st-tier sold comp that counts in the result and has a size. Each one's $/sq ft is its sale price ÷ its interior size (adjusted where an adjustment applies; with today's house method none does). The table runs from the lowest of those rates to the highest. If the agent narrowed the range, it runs between the narrowed ends. The rows are each comp's own rate plus round steps between the ends. The step is the largest of $5, $10, $20, $25, $50, $100 … that's at most 2.5% of the low rate, then widened until no more than ten steps fit. Each row is the home's size × the rate. On the sample that's 10 rows ($2,113, $2,150, $2,200 … $2,458; steps of $50). With more comps it passes 12. Asks (in contract, active, didn't sell), 2nd-tier, ✕ and size-less comps never count, and neither does any co-op report. The basis sentence sits under the grid. The same rows go into the Full email ("Price per sq ft for …", `workspace/email.ts`), the writer's input and QA's checks (`workspace/qa.ts`).

**The five-row version:**

| Row | $/sq ft | Price |
|---|---|---|
| Low | the lowest rate above (or the narrowed low ÷ size), named by its comp | the range's low, exactly |
| Quarter | low + ¼ (high − low), to the whole dollar | rate × size |
| Middle | low + ½ (high − low) | rate × size |
| Three-quarter | low + ¾ (high − low) | rate × size |
| High | the highest rate (or the narrowed high ÷ size), named by its comp | the range's high, exactly |

- The middle is the midpoint, not the median comp, so the rows are evenly spaced. The median (the engine's base) stays in How this was worked out.
- The same conditions as today: a condo, a home size, and at least two counting sold comps with different rates.
- The engine returns the five rows as a new field beside the old ones (Abacus, engine version bump). Findings reads the new field. The email keeps the old rows until 065 b is decided.
- **The explanation goes on top:** "What 17L's 2,000 sq ft comes to, from the lowest to the highest $/sq ft of your closest sales."
- **The calculator goes below:** a $/sq ft field and a size field (the home's size filled in). The price shows as you type. Typing a price instead gives its $/sq ft at the home's size, and where it sits against the true estimate (`againstEstimate` in `Terms.tsx`). It's arithmetic in the browser only: nothing is saved, and nothing feeds the engine. It fits inside the existing accordion body.

**NW-065 b.** Should the email get five rows too? Options: (a) five rows on Findings and in the email; (b) five on Findings, Frankie's full steps in the email; (c) five everywhere, with the full steps behind a "more rows" link on Findings. **Recommend (a).** One table everywhere is easier to explain, and the client reads it more easily than the agent does. On whether the table is needed at all: keep it for condos with a size, on both sides, inside an accordion that's closed by default (it is now). For co-ops, see 066.

**NW-066 a.** On a co-op the price table and the per-SF figures are already hidden (`ws.sf`, `hasSF`). But the engine still raises "The subject's interior area is only the agent's estimate, so 'on the facts' has no $/sqft implied values" and "has no interior area, so it contributes no unit-rate indication" on a co-op (checked on the sample run as a co-op). Drop both gaps when `property_type` is `coop`. **066 b** needs the co-op sample from NW-054 b first. A five-price ladder (low, quarters, high, with no $/sq ft) could stand in for the table on co-ops: Kimani's call during that review.

**NW-067 a.** `CountingComps` already shows the agent's note ("No note yet. Edit to say why it's here." when there's none). Add the comp's tags beside the note. Add one line at the top: "Your 1st-tier comps. Only the sales set the range; the asks show where the market is." Give every accordion header an ⓘ. Reuse the one in `src/views/newcomp/Frame.tsx` (hover, focus and tap), not a new component. **067 b:** Hubert writes nothing per comp today, and he's a guide only (D-27.6). A per-comp reason waits for Calliste (NW-093).

**NW-068. Hubert never receives the target today, and that's not what D-4 decided.** The target is stored in `comp_report.reports.target` (jsonb, `{price, note}`: `workspace/state.ts`, `TargetState`; saved by `PATCH /workspace`). `server/numbers.ts` never selects it ("the target isn't read at all"). The current prompt (`server/assistant.ts`, `cr6-2026-10-15`) tells Hubert "You never see the agent's own number or any target price". The writer can't receive it by construction either (`workspace/writer-input.ts`). D-4 (A), design §8.5 and D-27 item 5 all say Hubert sees the target **once the neutral result exists**. The copy on Findings ("Hubert never sees it") and the modal's tip contradict `Terms.tsx`'s own header comment. To do:
- Add a new prompt version (never edit a shipped one). It says Hubert sees the target only after the reveal, and helps argue for it per §8.5: the legitimate levers, and the illegitimate ones named as such.
- `get_numbers` returns the target only when `revealed` is true. Its tool description changes with it, so the change goes in the same new version.
- The writer stays blind. "Never in the email" holds.
- The hint goes behind an ⓘ: "Hubert, the AI assistant, sees this only after you reach Findings, so it can't steer the true estimate. It's never in the email."
- Update the tests that assert Hubert never sees the target (`server/assistant.test.ts`), and Dispatch 13's line "the agent's number and target never reach a model".

**NW-069 a.** §8.4's backstop isn't built: "once a target exists, every change shows how far it moved the base toward or away from it." Store the neutral range and base at the first reveal in `reports.state` (jsonb, no migration). Then the target accordion can say "Since you first saw the findings, the range has moved $X toward your target." Without this, the loop in 069 b is silent target-seeking. **069 b** is §8.5's path-to-target mode. Its design is written; its screens aren't.

**NW-070.** Add `owner: 'client' | 'agent' | 'both'` to `TargetState`. It goes in the same `reports.target` jsonb, so no migration. `checkTarget` validates it. It shows as a three-way toggle beside "Whose, and why" in the target accordion (`Terms.tsx`), and in the modal later if Design wants it there. Default: Client. The label follows it: "Client's offer target", "Your list price".

**NW-071 a.** "Timing: List in October" is the seller template's own Timing field (`pricingRows`, `Terms.tsx`). On the sample it's the sample's value. It's what the agent typed, not advice. Label it "Seller's timing". A buyer report never shows it, but a buyer's "Target closing" isn't shown at all: add it as "Buyer's closing". "Sales against ask": `sale_to_ask` is the median of (sale ÷ last ask − 1) over the 1st-tier sold comps that count (`engine/compute/results.ts`). Reword it so the words follow the median's sign: on the sample, "Your 3 sales closed a median 4.0% below their last asking price (3.0% to 4.2% below)"; a positive median reads "above". Dispatch 21 item 6 has the rule. **071 b:** the data for the chart exists per comp (`output.comps[].sale_to_ask_percent`). The chart is Design's.

**NW-072.** It's a **median**, and median is right. Days on market comes from StreetEasy's own figure (the export's "Days on Market" column, or the listing page). StreetEasy and REBNY count from going active to contract, carried across price cuts, and reset after 30 days off the market. A public-record closing's 0 is dropped (`engine/parser/index.ts`). The engine takes the median over the 1st-tier sold comps that count, and also computes the mean, min and max (`statSummary`). With 2 to 6 comps, one stale listing drags an average: the sample's sales are 24, 148 and 259 days. Fix the line to show the spread and the count: "Your 3 sales took 24 to 259 days to go into contract; the middle one, 148." With two sales, name both. The in-contract comps' days are computed too and could show the same way.

**NW-073 a.** The Terms dropdown offers both templates whatever the side (`DealTerms`, `Terms.tsx`). Show only the template for the report's side, labelled "Buyer's terms" or "Seller's terms", and keep "None".

**NW-074 a. What exists, and what to add.** Today: `brief.clientName`; `brief.clientNote` ("Client note", on Send); the target; and deal terms. The buyer template has price, deposit %, down payment %, rate, term and target closing. The seller template has target, timing and flexibility. Missing: cash or mortgage, pre-approval, why the date matters, what they'd pay more for, and non-negotiables. Dispatch 13 phase 2's client profile (D-7 B: decision style, priorities, how much math) is a different thing. It shapes the writer's tone and never a number. The two should share one home. Add with no migration (`reports.brief` is free jsonb up to 16 KB; `reports.state.dealTerms` likewise):
- **On the deal terms**, because the engine's §6.7 reads them: `financing: 'cash' | 'mortgage'` (cash hides rate, down payment and term), `preApproved: boolean` and `preApprovalAmount`. Timing and flexibility go on the buyer template too.
- **On `brief.client`**, which the engine never reads: `urgency` (text plus a close-by date), `paysMoreFor` (text), `nonNegotiables` (text) and `priorities` (price, speed, certainty: D-7 B's first dimension).
- The server validates the shapes in `PATCH /workspace`.
- Free text runs through `workspace/fair-housing.ts` on save, and a hard term is refused (§8.6: "capture refuses them"). "A new baby" is the kind of urgency note that must not reach the writer.
- The deal-term fields fit the existing Terms grid. The `brief.client` fields have no place in today's layout, so the data lands now and the fields wait for 074 b. Dispatch 13 phase 2 then reads `brief.client` for the writer, and Hubert reads it after the reveal (with 068).

**NW-075, NW-076.** Both are Design. 075 combines 069 b and 074 b: after Findings, the client details and Hubert's help toward the target. 076: the engine already lists every factor (`res.bridge.lines`, with "considered, not calculated"). Design decides how the dropdown looks.

**NW-077. "13 still needed" is the engine's gap count** (`o.gaps.length`, the sub-label on "How this was worked out" in `Findings.tsx`). On the sample it's exactly 13:
- 2 are the result of the size being an estimate: no base and no range "on the facts".
- 2 are comps. One is 101 Leonard #5B's missing floor, but that comp is 2nd tier and counts in nothing.
- 2 are the home's size, raised twice.
- 6 are home facts the form never asks for: amenities, shared outdoor space, parking, policies, service level and unit type.
- 1 is year built, which the form does ask for. Year built and a confirmed size are the only gaps "Fill it in" can close.

The "Fill it in" link opens Details, which can't fill most of them, and the messages are the engine's words ("The subject's …"). **a (Mason):** count only gaps the agent can act on and say what they are ("2 facts about the home to fill in"). Put the rest under Warnings, run every message through `engineWhy`, and say "the home" for "the subject". **b (Abacus):** raise comp gaps only for comps that count. Mark each gap as fillable or not. Map the home's Building picker (Doorman, Gym …) to the engine's amenities and service level, so those gaps close.

## Questions for Kimani

1. NW-065 b: five rows in the email too (recommended), or only on Findings?
2. NW-068: after the reveal, should Hubert also see the agent's own low and high from the Gate, under the same rule as the target? D-4 covers only the target. NW-093 ("Hubert sees what the agent sees") suggests yes.
3. NW-070: default owner of the target: Client (recommended), Agent or Both?
4. NW-074: is pre-approval a yes/no, or yes/no plus the amount? Is the rate the client's quoted rate, or a default the agent can change?
