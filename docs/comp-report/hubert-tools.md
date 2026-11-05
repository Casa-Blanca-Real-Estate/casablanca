# What Hubert can do

Every tool Hubert has in the comp report, and what each one can and can't change. Kept current with
the prompt in `tools-src/comp-report/server/assistant.ts` (the current version is `hb-home-2026-10-29`; a
conversation keeps the version it started on, so older reports' Hubert has the tools of his day).
Plans and open questions are in `hubert-plan.md`; this list is the one place to see everything he does.

The rule across all of them: Hubert changes something only when the agent tells him to. Every change
shows in the chat with **Show** (to the field he changed), and comp and home changes also have **Undo**.

## He reads

| Tool | What it gives him |
|---|---|
| `get_report` | The report: its title, property type, buyer or seller, status. |
| `get_numbers` | The comps and the numbers: each comp's sale, size, $/ft, date, floor, tier, note and tags; both results; the home. Each comp also carries its listing: building, charges, rooms, features, amenities, policies, outdoor space, views, the agent's picked features and the listing text. |
| `get_view` | What the agent has on screen: which screen (New report and its step, Sort, the per-comp review, Your number, Findings, Send, Done), Sort's rows numbered top to bottom, and the comp that's open. This is how "this one" and "comps 1 and 2" work. In the New report window, the home's details as they stand. |
| `get_email` | The client email as the agent sees it on Send. |
| `web_search` | Searches the public web. Results from StreetEasy, NYC.gov, ny.gov and the MTA come first, and he looks for the building's own site. Any public site is allowed. Limit: 60 a day per person. |
| `read_page` | Reads one web page's text, usually one a search found. |

## He changes (only when the agent asks)

| Tool | What it changes | Limits |
|---|---|---|
| `edit_comp` | One comp on Sort: its tier (1st, 2nd, out), its note ("Why it's a comp"), its tags, a corrected price, size, date or floor (or StreetEasy's value put back), the ★ (star it, which moves the star from any other comp and makes it 1st tier, or take the star off), or taking it out of the report and putting it back. Several comps in one message work, e.g. "comps 1 and 2 second tier, 3 and 5 first". Practice agents may dictate too: the thinking must be theirs. | Undo in the chat while the comp still reads as he left it. Taking out is a change on its own; a comp taken out takes no other change until it's put back. He stars only the comp the agent names. |
| `set_home_fact` | The home's details, as the agent dictates them: size, beds, baths, rooms, floor, asking price, common charges or maintenance, taxes, outdoor size, year built, neighborhood, the notes (added under what's there), dishwasher, central air, fireplace, corner, new development, washer/dryer, outdoor space, condition, views, exposure, the building's features and policies. A size said as a guess is marked the agent's estimate. Works on any screen; built for the New report window. | Only the details screen's fields and its lists' options: anything else he asks about. Never from the web, a listing's text or a comp. Not the address (step 1 owns it), not Co-op or Condo. Not once the email is marked sent. Undo in the chat while the field still reads as he left it; Show opens the details. |
| `edit_email` | The email's words on Send: subject, headline, the agent's lines, exact passages of the body. | It can't touch the layout, photos, price table or disclaimer. QA rechecks every figure before the email can be copied. |
| `show_comp_link` | Nothing, by itself. It shows a sale he found as a card in the chat, by its StreetEasy link. The card's "Checked: add it" button only works after the agent opens the link to check it's the right unit, a sale (not an asking price) and current. Approved, it's read onto Sort untiered and counts in nothing until the agent tiers it. | StreetEasy links only. Figures come from the read, never from the page where he found it. Counts against the agent's daily link reads. |

## Where he shows up

- **The drawer** on every comp report screen, with the screen's preset questions.
- **Beside the New report window** (rough, until the design pass): he answers questions there and fills in the details the agent tells him. On a tablet the window narrows to fit beside him.
- **Step guides**: a short note as the agent reaches each step, for every agent.
- **The per-comp review on Sort** ("Review with Hubert", `api/comp-review.ts`): feedback on the agent's note
  and tags, or his own take on the comp. A practice agent gets his take only after a feedback round.
  He never sees the agent's number, the target or the tier.
- **Send's client step** (`api/client-words.ts`): feedback on the agent's overview and per-comp paragraphs,
  or his draft. Same rule: practice agents write first.

## Not yet

From `hubert-plan.md` "Tools next": adding a comp from a link the agent pastes in the chat (a sale he
finds already comes in through `show_comp_link`), the target after the reveal, and after 11-13 comp
search from the anchor and Hubert across the Studio.
