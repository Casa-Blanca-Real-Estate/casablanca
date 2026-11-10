# Kimani's walkthrough, 2026-11-06 (part 1)

Kimani ran a real report (60 Collister St #4A, a seller, about $11.5–13.5M, 5 bed / 5 bath) at the office,
with a colleague watching, and recorded it ("CB_Comps_Nov_6_Walkthrough_Pt1", 30 min). His written notes
came with it. This file is everything from both: the problems, ideas and decisions, and where each one went.
Transcribed locally (the recording is noisy and half the talk is the room); where the words were unclear,
it says so.

Where each item stands: **Built** (the Hubert round's PR), **Design pass** (Kimani's own next design pass),
**Ask** (on the Answer Sheet, with a suggested answer), **Check** (needs a look on production).

## 1. The StreetEasy read that failed

What happened: on New report → the home's link, the read failed for a live listing and for a past sale,
after about 45 seconds to a minute (not the 3-minute limit). StreetEasy's own site was also slow in his
browser and showed its "are you human" checks; StreetEasy's own search found nothing for "60 Collister 4A".
A few minutes later the same link worked through the "Start with Hubert" box on Reports. He wondered if
it's the office Wi-Fi.

What we know (2026-11-06, 20:35 UTC):

- **The read doesn't run on his Wi-Fi.** The browser asks our server to read the link; our server asks
  Firecrawl, and Firecrawl's machines load StreetEasy. His connection only carries the tiny "start" request
  and the page checking back every 2.5 seconds, and both are retried if they drop. So slow Wi-Fi makes the
  page feel slow, but it can't make a read fail with a message.
- **Both entry points are the same read.** "New report" and "Start with Hubert" open the same window and queue
  the same server read (`NewComp.tsx` → `linksApi.add` → the background function). There's no difference
  between them to explain one failing and one working; the retry worked because time passed.
- **A failure at 45–60 s fits StreetEasy turning Firecrawl away** (the "verify you're human" message,
  `blocked`) or Firecrawl itself erroring (`provider_error`). StreetEasy was clearly in a bot-checking
  mood today: it was challenging Kimani's own browser too.
- **Production reads StreetEasy fine now**: a live probe through the same Firecrawl key read a StreetEasy
  page in about 40 seconds.
- **One exception**: if Hubert's chat said literally "Failed to fetch" (or "Load failed"), that's the
  browser not reaching our site at all, which is the connection. The chat now says that in plain words,
  and keeps the message in the box.

Not confirmed: the exact error on his report's read row. The inspection API would show it
(`view=workspace&report=…`), but `CR_INSPECT_KEY` isn't in the Casa cloud environment, so no session can
call it. **Check**: Kimani adds `CR_INSPECT_KEY` to the Casa environment (TD-23 on the Answer Sheet) (it's set in Netlify per
`docs/comp-report/inspect-api.md`), or reads the report's activity log in Reports → Access.

Follow-up worth considering (not built): when a read fails as `blocked`, retry it once by itself after a
minute before showing the failure. Today the agent has to press Try again.

## 2. Hubert's chat

| # | What Kimani said | Where it went |
|---|---|---|
| H1 | Hubert is dry, cut, flat. "sup!" got a flat list of what he can't do. Match the agent's energy, a step above. Only the chat: what he writes into fields and the email reads fine. | **Built**: prompt `hb-voice-2026-11-06` |
| H2 | He said "the engine" without saying what it is; a new agent won't know. Asked, he explained it too long. Give it a simple definition, maybe a better name, short unless asked. | **Built**: "the calculator", with a two-line definition. Name **decided** (Kimani, 21:08): "the calculator" for now ("pricing calculator" and "pricing model" also fine) |
| H3 | Searched listings show as plain links. Show cards: a thumbnail, the address, clickable. Top three, the rest as text links. | **Built** |
| H4 | Animations showing he's thinking or searching, not a static box. | **Built**: moving dots on Thinking / Searching the web / Checking |
| H5 | A way to stop a message sent by mistake (Enter hit mid-sentence) before he answers, and take it back. | **Built**: Stop |
| H6 | Make the current step more prominent, with Hubert calling out where the agent is. | **Built**: the step row's current step stands out; a "You're on" band at the top of his panel; he says the step when greeted or asked what's next |
| H7 | Maybe the step flashes over the whole Hubert panel in large text, then fades as they start working. | **Decided** (Kimani, 21:08): keep the small band for now; he'll design the big flash himself in Claude Design |
| H8 | "For like": for newer agents, Hubert matches the number of comps they added (they add 3, he proposes 3 more), so they keep learning and he doesn't do all the work. | **Built** (Kimani, 21:08: yes): asked to find comps, Hubert matches the agent's own one for one, up to 5 at a time, without announcing it. With none added, he asks them to add one first ("we'll build it together"); unsure, he says what to search for from the home's details |
| H9 | Hubert's panel slides in well on a first New report, but its intro text is small. | **Built** (a little: hint text 12 → 13px, guides 14px); the rest is **Design pass** |
| H10 | The step guides ("check the details, the listing…") should be larger, so the guidance is obvious. | **Built**: guide text 14px, its heading darker |

## 3. The rest of the flow (from the recording)

| # | What came up | Where it goes |
|---|---|---|
| F1 | The New report window shows "Co-op" (the type) before the link has been read: it reads as if it found that, and it's wrong for a condo. "Turn off that label until it fills." | **Built**: the type isn't shown until the page has been read |
| F2 | The client's name ("optional"): where does it show? It should show somewhere the agent can identify the report by it. | **Design pass**: show it on the report row and header |
| F3 | Two ways in, the New report button and the "Start with Hubert" box, open the same window. Pick one place: "get rid of the field and just move the button there." Kimani agreed. | **Design pass** (decision made: one entry, the button moved up) |
| F4 | His dev notes / dev log didn't show while signed in as admin, though it did before. | **Built**: the cause was the notebook's 30-day session (his first sign-in was 09-29; his notes stop on 10-29), which ran out silently. The comp report now renews it from the Studio sign-in for a dev email, so the box comes back without visiting the notebook page |
| F5 | The colleague asked what the client's target number is for. Kimani: a visual marker, so the agent can see where the client's number falls against the range and justify going up or down. | Decision stands (target stays, display only) |
| F6 | The details step went well dictated out loud ("you can talk it out"): outdoor space (terrace vs balcony), views, exposure, fireplace, building features, year built. | No change. A note for training: dictating to Hubert works here |
| F7 | Some agents (Noble) do their research themselves rather than from a StreetEasy export. | Context for H8 and for training |
| F8 | "The AI can do a lot, but it doesn't tell you how it's going to use you, so you still have to go through some of this." | Context for onboarding (Phase C) |
| F9 | A lot on the platform still needs cutting and consolidating. | **Design pass** (already planned) |

## 4. Decisions

- Hubert's voice changes in the chat only; anything he writes into the report keeps the agent's words.
- "The engine" gets a plain name in Hubert's mouth (suggested: "the calculator") and a two-line definition.
- Search results: three listing cards, the rest as links, and every card asks the agent to check it on StreetEasy.
- One way into a new report (F3), in the design pass.
- Older conversations keep the Hubert they started with (the prompt versions rule): the new voice shows in
  reports whose chat starts after this ships. The 60 Collister report keeps the old voice.

## 5. Round two (Kimani, 2026-11-06 21:23)

- **Inspection key**: the Casa environment's Network secrets take a Bearer token per domain. The inspection API
  now accepts the key as `Authorization: Bearer`, so the key goes there and sessions never see it
  (`docs/comp-report/inspect-api.md`). TD-23 closes once it's set and released.
- **Dev notebook sign-in**: no 30-day end any more; it lasts until you sign out or turn the notebook off.
- **Settings** (built): a gear in the name menu. You (name, email, access, the roster card) and, for the Studio team,
  the dev switches per browser: the dev notebook's box, the dashboard's build marker, and for admins Dev tools in
  reports and the Gate as a new agent, with "Turn all off".
- **Fresh chat (HB-12)**: dropped for **Duplicate report** (built): a row's copy icon on Reports makes a new report
  with the home, details, comps, tiers and finished reads. "Carry over the chat with Hubert" is off by default.
