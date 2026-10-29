# What Hubert can do

Every tool Hubert has in the comp report, and what each one can and can't change. Kept current with
the prompt in `tools-src/comp-report/server/assistant.ts` (the current version is `hb-view-2026-10-29`).
Plans and open questions are in `hubert-plan.md`; this list is the one place to see everything he does.

The rule across all of them: Hubert changes something only when the agent tells him to. Every change
shows in the chat with **Show** (to the field he changed), and comp changes also have **Undo**.

## He reads

| Tool | What it gives him |
|---|---|
| `get_report` | The report: its title, property type, buyer or seller, status. |
| `get_numbers` | The comps and the numbers: each comp's sale, size, $/ft, date, floor, tier, note and tags; both results; the home. Each comp also carries its listing: building, charges, rooms, features, amenities, policies, outdoor space, views, the agent's picked features and the listing text. |
| `get_view` | What the agent has on screen: which screen (New report and its step, Sort, the per-comp review, Your number, Findings, Send, Done), Sort's rows numbered top to bottom, and the comp that's open. This is how "this one" and "comps 1 and 2" work. |
| `get_email` | The client email as the agent sees it on Send. |
| `web_search` | Searches the public web. Results from StreetEasy, NYC.gov, ny.gov and the MTA come first, and he looks for the building's own site. Any public site is allowed. Limit: 60 a day per person. |
| `read_page` | Reads one web page's text, usually one a search found. |

## He changes (only when the agent asks)

| Tool | What it changes | Limits |
|---|---|---|
| `edit_comp` | One comp on Sort: its tier (1st, 2nd, out), its note ("Why it's a comp"), its tags, or a corrected price, size, date or floor (or StreetEasy's value put back). Several comps in one message work, e.g. "comps 1 and 2 second tier, 3 and 5 first". Practice agents may dictate too: the thinking must be theirs. | Undo in the chat while the comp still reads as he left it. |
| `edit_email` | The email's words on Send: subject, headline, the agent's lines, exact passages of the body. | It can't touch the layout, photos, price table or disclaimer. QA rechecks every figure before the email can be copied. |
| `show_comp_link` | Nothing, by itself. It shows a sale he found as a card in the chat, by its StreetEasy link. The card's "Checked: add it" button only works after the agent opens the link to check it's the right unit, a sale (not an asking price) and current. Approved, it's read onto Sort untiered and counts in nothing until the agent tiers it. | StreetEasy links only. Figures come from the read, never from the page where he found it. Counts against the agent's daily link reads. |

## Where he shows up

- **The drawer** on every comp report screen, with the screen's preset questions.
- **Beside the New report window** (rough, until the design pass): he answers questions there but can't fill in details yet.
- **Step guides**: a short note as the agent reaches each step, for every agent.
- **The per-comp review on Sort** ("Review with Hubert", `api/comp-review.ts`): feedback on the agent's note
  and tags, or his own take on the comp. A practice agent gets his take only after a feedback round.
  He never sees the agent's number, the target or the tier.
- **Send's client step** (`api/client-words.ts`): feedback on the agent's overview and per-comp paragraphs,
  or his draft. Same rule: practice agents write first.

## Not yet

From `hubert-plan.md` "Tools next": filling in the home's details (`set_home_fact`), starring or taking
out a comp through `edit_comp`, the target after the reveal, and after 11-13 comp search from the
anchor and Hubert across the Studio.
