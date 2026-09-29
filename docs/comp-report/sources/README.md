# Comp report — source material

Raw inputs from the 2026-09-23 kickoff. Read these for the original voice; read
`../00-orientation.md` for what was taken from them.

| File | What |
|---|---|
| `2026-09-23-hannah-briefing.txt` | Hannah (CEO) walking Kimani through her current comp process live, on 100 Barclay St #17L. Noble and Karen come up as the people who teach agents comps. The last few minutes drift to unrelated topics (Ian's listing-site tool). |
| `2026-09-23-noble-call.txt` | Kimani with Noble, who teaches comps to Casa Blanca agents: how agents search, where StreetEasy's comps tool fails, and the v1 scope call. |
| `2026-09-23-chatgpt-workflow-audit.md` | Hannah's own ChatGPT account, asked by Kimani to audit how she has used it for comps. Written by ChatGPT about its user, so the tone flatters; the diagnosis of where its answers went inconsistent is the valuable part. Its examples skew to her luxury deals (60 Collister at $11.5M, a ~$28M Tribeca combination). Assessed in `../00-orientation.md` §8. |
| `streeteasy-comp-export-100-barclay-17l-2026-09-23.csv` | The StreetEasy Comp Report CSV Hannah exported during the briefing. 11 comps, 31 columns. **This is the parser's reference fixture** — its quirks are documented in `../00-orientation.md` §3. |
| `2026-07-29-frankie-delessio-comp-email-111-fulton-517.pdf` | **A real comp email an agent sent a buyer**, forwarded by Hannah on 2026-09-25 as a model. Frankie Delessio to his client, after a showing at 111 Fulton #517 (FiDi, ~725 sq ft). It opens by saying how he chose the comps (floors 2–8, 550–800 sq ft). Then it gives the comps by status, each with a price and one to three plain notes on how it differs, and "Things to consider", which says which buildings trade higher or lower and how carrying costs affect asks. It also lists the building's recent listings that never sold, a table of $/sq ft against the price it implies for #517, FiDi averages, and one piece of offer advice. It has no headline sentence. The PDF's text layer is garbled, so read it as images. Contains the client's name and email: internal only. |
| `kara-comp-reports-workshop-transcript.txt` | **Kara, a Casa mentor, teaching agents to comp** (a recorded workshop, auto-transcribed). It covers her comps template: co-op and condo versions, the subject's fields, days on market, and a notes column she calls "unbelievably important". It also covers how she finds comps (same building and line first, within ¼ mile, sales from the last 3–6 months, never a price filter, never StreetEasy's comp generator), what she never compares (first floors, private outdoor space against none, new development against resale, HDFC, co-op against condo), what she notes (light, exposure, original details, windowed rooms, width, storage, renovation quality), ~3 comps per status, and deleting empty sections. And it covers why comps are pulled at all: "the comparative market report is the logic" behind a buyer's offer. |
| `streeteasy-comp-report-100-barclay-17l-2026-09-23.pdf` | The StreetEasy-generated comp report Hannah produced from the same 11 comps — what agents send clients today. 14 pages: a market value summary, performance stats, a map, then one page per comp with photos and a floor plan. Carries **year built**, photos and floor plans, which the CSV doesn't. Its headline figures are analysed in `../01-design.md` §5.2. |

## Reading the transcripts

Both are machine transcriptions, unlabelled by speaker, and they mangle the domain vocabulary
consistently. Read through these:

| Transcript says | Means |
|---|---|
| "quote", "coups", "cops", "copse" | co-op (and sometimes "comps" — context decides) |
| "comic way" / "compensators" / "comparable boards" | comps / comparables |
| "dormant", "door man" | doorman |
| "street easy", "street Etsy", "street EZ", "breathe stream easy" | StreetEasy |
| "perch well" | Perchwell (NYC listing and data platform) |
| "Barkley" | Barclay (100 Barclay Street) |
| "higher level of strength" | a higher-tier StreetEasy agent account |
| "3.5 them is a slow price" | "3.5M is a solid price" |
| "commodity", "money" | Kimani |
