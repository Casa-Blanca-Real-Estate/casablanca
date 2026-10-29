# Hubert across the comp report: what he knows, what he can do, what's next

Written 2026-10-29 with the PR that adds his trail, his comp edits, web search and the step guides.
The rule it builds on is Kimani's (2026-10-21): **Hubert carries out the agent's thinking; he never does
it for them.** The tiers, notes and tags are the agent's call. Hubert puts in what they said.

## What this PR gives him

| | What | Where |
|---|---|---|
| Comp edits | `edit_comp`: the tier the agent names, their note, the tags they name, a corrected price, size, date or floor, or StreetEasy's value back. Saved through the agent's own PATCH (same checks, same reason history), with the reason marked `assistant` | `server/hubert-comps.ts`, `api/comps.ts` `patchComp` |
| The trail | Every change he makes, to a comp or the email, shows under his reply: the comp, the field, before → after, and **Show**, which opens Sort on that comp's row at that field (or Send, for the email). It's built from the stored tool results, so it survives a reload | `server/hubert-trail.ts`, `api/messages.ts`, `Chat.tsx` |
| The web | `web_search` (five results) and `read_page` (one page's text), through Firecrawl with the key the link reads use. Sources show as links under his reply. 60 lookups per person per 24 hours (`CR_WEB_LOOKUPS_PER_DAY`). Never a sale, price or listing from the web; nothing about who lives in a neighborhood | `server/web-search.ts` |
| Step guides | A preset note from Hubert (no model call) joins his chat the first time the agent reaches each step, and starts a new section of it. Rough look; the design pass decides how the sections read | `src/views/hubert/guides.ts`, `state.stepsAt` |
| Prompt | `hb-trail-2026-10-28`, built on `hb-listing-2026-10-28`. Old conversations keep their version | `server/assistant.ts` |

## What he should know at each step

"Knows now" is what his tools return today. "Should know" is the gap, in the order it would help most.

| Step | Knows now | Should know | Can do now | Should be able to do |
|---|---|---|---|---|
| New report: the home, details, comps | Nothing: he isn't in the New report window. His guides for these steps show once he's opened on Sort | Whether the home's link read, what it filled, what's still missing | — | Fill a detail the agent dictates ("it's 1,850 feet, floor 12"); read a link pasted in the chat |
| Sort | Every comp: status, tier, note, tags, price, size, date, floor, beds, baths, time on market, flagged checks; the removed export rows | **Which screen and which comp is open** (`get_view`); each comp's features, amenities and building; the neighborhood | Tier, note, tags and fact corrections on the agent's say-so; the web | Star a comp, take one out or put it back; add a comp from a pasted StreetEasy link |
| Per-comp review | The same as Sort. His feedback and his take run as a separate call (Dispatch 25), not in the chat | The comp under review and its rounds, so the chat and the review agree | The same as Sort | Answer about the comp on screen without being told which |
| Your number (gate) | That the range is hidden | — | Nothing on the number: it's the agent's | — (by design) |
| Findings | Both results, the evidence, the bridge | The target, after the reveal (D-4; Dispatch 24 item 1); the engine's checks | Explain any figure | — |
| Send | The email as the agent sees it, their lines | QA's issues; the client words (overview and per-comp paragraphs) | Change the email's words, with Undo on Send | Change a comp's client paragraph on the agent's say-so |
| Done | The report | — | Summarize for notes | — |

## Tools next, in order

1. **`get_view`**: the screen and the open comp, sent with each message. The cheapest big gain: "this one"
   and "the comp I'm looking at" start to work. (Dispatch 24 item 2 has it.)
2. **A wider `get_numbers`**: each comp's features, amenities and building, the home's neighborhood and
   type, listing text as quoted data. (Dispatch 24 item 2.)
3. **`set_home_fact`**: the home's details on dictation, with the trail. Needs Hubert in the New report
   window, or on Sort through the details.
4. **Star, take out, put back** through `edit_comp`: small, the PATCH already does them.
5. **Add a comp from a link** pasted in the chat, through the link read that exists.
6. **The target after the reveal** (D-4, NB-13): Dispatch 24 item 1.
7. After 11-13: comp search from the anchor (Erez's phase 2), Hubert across the Studio.

## Questions for Kimani

1. **Practice agents dictating tiers.** This PR lets any agent tell Hubert "make it 1st tier". For a practice
   agent, should Hubert refuse until they've written their own reasoning in the review (Dispatch 25's order),
   or is dictating their own call fine? *Default built: fine, it's their call either way.*
2. **The web.** Any public site, 60 lookups a person a day, Firecrawl credit per lookup. Keep that, or limit
   the sites (StreetEasy, NYC.gov, the MTA, building sites)? *Default: any site, 60.*
3. **Hubert in the New report window.** Worth adding before 11-13, so the first three guides show where they
   happen and he can fill details by dictation? *Recommend after the design pass.*
4. **Step guides for everyone,** or only practice agents? *Default: everyone.*
5. **Undo on a comp edit,** on the trail entry itself? The email's edits have Undo on Send already.
   *Recommend yes, small.*
6. **Dispatch 24 (Calliste).** Items 1 and 2 overlap this lane. Fold them in here before 11-13, or keep them
   for after? *Recommend `get_view` and the wider read now, the target after.*

## Notes for other threads

- The activity log (Dispatch 22b) exports `logActivity(..., { by: 'hubert' })`. Whichever PR lands second
  calls it after Hubert's comp edits commit (the edit runs inside the turn's own transaction in
  `api/turn.ts` `prepare`).
- Dispatch 24's write set (D-27 item 6) is superseded for comps by this PR, on Kimani's 2026-10-21 and
  2026-10-28 notes.
