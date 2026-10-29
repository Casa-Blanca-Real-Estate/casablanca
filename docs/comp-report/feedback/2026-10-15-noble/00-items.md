# Noble's walk-through, 2026-10-15 — every point, numbered

**Source:** Kimani's dictation to Casanova after the call (about two and a half hours after it ended at
2:15 PM; the call itself wasn't recorded, and the notes typed in the Feedback box were lost when the
box closed). Kimani re-walked the tool while dictating, so the list mixes three voices:

- **Noble** — what Noble said or did on the call, as Kimani remembers it;
- **Kimani** — Kimani's own critique or idea while re-walking;
- **Both** — Noble raised it and Kimani built on it.

Casanova extracted it in the order spoken, one point per id. Nothing is dropped; duplicates point at
the first mention. Kimani's account: Noble ran the flow as a **buyer**, on a **condo**, from a pasted
StreetEasy link, and stopped at **Send** (he didn't mark it sent). He filled notes and tiers with
**gibberish** to move fast, so his report's notes aren't real data.

## The new-report modal, step 1: the home

- **NW-001 · Noble.** "Paste a StreetEasy link or type an address": he couldn't tell whether typing an
  address searches for it. Make it clear that typing doesn't search. Typing means starting from scratch
  and filling the home in by hand; a link fills it in. Keep the field as simple as it is now (Kimani
  likes how it looks). *Later:* real address search, hard because of units and keeping listings current.
- **NW-002 · Both.** Offer target, "optional (what your client hopes to pay)": Noble couldn't tell if it
  wanted one number, a range, the lowest or the highest. His instinct for a buyer: the highest the client
  would pay. Kimani: maybe a toggle to enter a range, for buyer and seller; but how would a range change
  the math and the display?
- **NW-003 · Both.** The target's ⓘ hint ("Hidden from Hubert, the assistant, so it can't steer the
  range. Never in the email; can't change your findings"): a new agent won't remember that Hubert is the
  AI assistant, and won't know what the rest means. Say "AI assistant"; the hint may need more in it.
- **NW-004 · Noble.** Strip StreetEasy's tracking from a pasted link (everything after the `?`). Noble
  does it by hand every time; it's about cleanliness, and the tool doesn't need it.
- **NW-005 · Kimani (question).** When does a new report first save? Kimani's reading: when "Starting the
  report…" shows, after the home's side and type are set.

## The new-report modal, step 2: details

- **NW-006 · Kimani.** Without a link nothing auto-fills, and the home is typed in by hand. Interior size
  then shouldn't sit behind "+ Add an estimate": make it a plain field the agent fills, with an
  "Estimate?" toggle beside it.
- **NW-007 · Noble.** Floor, asking price, common charges and taxes: all good.
- **NW-008 · Noble.** "About the home" opens with Outdoor space (None / Balcony / Terrace / Private
  roof), and he asked at once: what about a shared roof or shared terrace? He only found Roof deck later,
  under Building. **Separate the home's features from the building's.**
- **NW-009 · Noble.** Building is under-served: buildings have far more amenities than the list. StreetEasy
  groups them by category, for example **Services and facilities** (bike room, concierge, doorman,
  elevator…), **Wellness and recreation**, and **Shared outdoor space** (courtyard, deck, roof deck…),
  all implicitly shared. Mirror those categories.
- **NW-010 · Kimani.** Capture **policies**: pets allowed, smoking allowed or not, and the like.
- **NW-011 · Noble.** The pasted link didn't select all the features and pickers: he had to go through
  and set them himself. Whatever reads the StreetEasy link should fill every picker it can.
- **NW-012 · Noble.** Unit condition (Original / Updated / Renovated / Mint): he read "Original" as
  "new". His unit fit none of them: one owner for a few years, not updated, renovated or mint. It needs
  a "like new" or "good condition" option, and the meaning of Original made clear. Kimani: also add the
  other end, units that are gutted or need work (fixer-uppers).
- **NW-013 · Kimani.** Year built should fill in automatically, and should look like a field (an
  underline): today it reads as a default value.
- **NW-014 · Kimani.** "More about the home" (washer/dryer, dishwasher, central air, working fireplace,
  corner unit, new development): make laundry first-class. Consider splitting About the home and About
  the building (tabs, or one long scroll, but not a two-step modal); at the least, move Building below
  all the home's fields. *(Layout: Claude Design.)*
- **NW-015 · Noble.** Notes: he didn't know what to write, even with the placeholder ("light, views,
  condition, layout, storage"). Make it clearer, perhaps with a hint behind an ⓘ.
- **NW-016 · Kimani.** "New development" probably belongs to the building, not the unit.
- **NW-017 · Noble.** Capture the **neighborhood**. StreetEasy always shows it, and there's no field for
  it. It keeps the agent oriented, and comps should mostly stay within the same few neighborhoods even
  though the tool ranks comps by distance. Show it on the home, and as a column on Sort. *Idea:* in Add
  comps, suggest a list of similar or nearby neighborhoods to look in.
- **NW-018 · Noble.** Property type needs more than Co-op / Condo: **HDFC**, **sponsor unit**,
  **townhouse**, condop, and whole houses (brownstones). StreetEasy's grey line under the price ("Condo ·
  Turtle Bay · Resale" on 100 United Nations Plaza #17C) carries type, neighborhood, and resale or new
  development. **Probe StreetEasy for every value those three fields can take**, so the tool can capture
  and auto-fill them.
- **NW-019 · Kimani.** A townhouse or whole house has a number of floors rather than a floor.
- **NW-020 · Kimani.** Photos aren't captured yet. How quickly can photos come in with everything else
  the StreetEasy link fills?

## Adding comps

- **NW-021 · Noble.** Rentals: on a recent comp a client was buying to rent out, so Noble comped rentals.
  On the call he pasted rental links and got the "these are rentals" warning. He liked that it caught
  it. Keep the gate, but make it depend on the kind of report: a rental-comps report takes rentals and
  warns on a sale ("this is a sold property, not a rental").
- **NW-022 · Kimani.** "Features: lavender outline, Test has it too" confused Kimani for a moment, only
  because his test home is named "Test". Not a bug.

## Hubert

- **NW-023 · Kimani.** **Hubert's replies show raw markdown** (asterisks and the like) instead of
  rendering it. A bug.
- **NW-024 · Kimani.** Hubert needs some "zhuzhing" (look and persona). Claude Design first.
- **NW-025 · Kimani.** The drawer: a softer open and close animation, a drag handle to widen it, and maybe
  the left side instead of the right (a chat on the left may feel better). *(Design.)*

## Sort

- **NW-026 · Noble.** He found the ★ only by hovering, and didn't know what starring meant. Make it more
  obvious. Kimani: move the star into the tier control (beside 1st / 2nd / ✕), since anchoring is a kind
  of tiering, with a hint: "the main comp you're comparing to".
- **NW-027 · Kimani.** Keep ✕ (not "Excluded", which adds clutter), but hovering it should say
  "Excluded". The Tier header gets an ⓘ explaining the options and what they do; the other headers are
  obvious.
- **NW-028 · Noble.** The tag filter row was open by default before he'd tagged anything, and he didn't
  know what it was. "Tag" may be developer jargon to an agent: find a better word ("comp tags"?
  "similarity tags"?), or make it obvious what a tag is and why.
- **NW-029 · Noble.** He expanded rows with the +. Clicking the row itself also works; he'll find it.
- **NW-030 · Kimani.** "No note yet. Edit to say why it's here": the note needs its own way to start
  writing, without hunting for Edit.
- **NW-031 · Kimani.** "Checks, sources and history" (Kara's checks): great, keep it. Kimani wants a short
  brief on how it works, for himself.
- **NW-032 · Kimani.** An onboarding walkthrough for a first run (tiers, notes, tags, and why Hubert
  can't see some things until Findings), though the goal is a tool that needs no guidance.
- **NW-033 · Kimani.** The home's line on Sort ("10 Hubert Street · 2,000 sf est · 3 bed · 3 bath")
  needs the neighborhood, and the table could take a Neighborhood column: there's room with Hubert
  closed, not with him open. *(Design.)*
- **NW-034 · Kimani.** Days on market may matter more in the collapsed row. Better: **a column chooser**
  (a checklist dropdown). Price and Tier are always on; $/ft, size, date, neighborhood and days on
  market are optional. If the columns outgrow the screen, the table scrolls sideways like a spreadsheet,
  with **Tier pinned** so it's never off-screen. *(Design, then build.)*
- **NW-035 · Kimani.** The expanded card's layout: the StreetEasy link, the unit's facts (neighborhood,
  type), the Features list, and "Checks, sources and history" can all go **under the photo** (enlarge the
  photo's column if needed). The Edit button shouldn't take a row of its own: put it in the facts row or
  under the photo, to win back the vertical space. *(Design.)*
- **NW-036 · Kimani.** The note should feel first-class. Moving Features under the photo lifts it up the
  card; it still needs its own edit affordance.
- **NW-037 · Kimani.** Transit: distance to the nearest subway lines, shown with the MTA's line bullets
  (the official coloured circles).
- **NW-038 · Kimani.** "Needs tier, note, tag" should point at where to act: mark the tier control (a
  small yellow marker) when it's empty, and do the same for the note and the tags, so the "N to finish"
  count leads somewhere.
- **NW-039 · Kimani.** Split building from unit in a comp's features too. Some options can depend on
  others (a house has no concierge, so hide that group), which means the deciding fields (the type) go
  first.
- **NW-040 · Kimani.** Features and tags look alike: selected features look like tags already filled
  in, and the unselected tags (grey, dashed) look optional. Make the tags first-class, give their
  section a label, and make clear which is which and why.
- **NW-041 · Kimani.** (Same as NW-035: features under the photo in the non-edit state.)
- **NW-042 · Kimani.** (Same as NW-025: the drawer's animation.)
- **NW-043 · Kimani.** In edit mode the row can't collapse (right), but nothing says to save or cancel. On
  a collapse attempt with unsaved changes, ask Save or Cancel; with no changes, just leave edit mode and
  collapse.
- **NW-044 · Kimani.** "Facts from a StreetEasy export stay as they are" costs a whole line. Put a lock on
  those facts instead, with the reason on hover. Let the agent unlock one to override it: keep
  StreetEasy's value on record, show the agent's value first, and mark the field as changed.
- **NW-045 · Kimani.** Group the tags by kind instead of one long run:
  - **Similarities:** same building, same area, same layout…
  - **Size**, as an ordered scale: much smaller, smaller, similar, bigger, much bigger;
  - **Floor:** lower, higher, first floor, penthouse (several floors can be penthouse);
  - **Multi-floor homes:** one, two or three floors.

  Label the section, with the yellow "required" marker on the label.
- **NW-046 · Kimani (question).** Are a note and tags redundant? The note, in the agent's own words, is
  the active-learning part. Ideas: after graduation, tags alone suffice and the note becomes optional;
  or a note is required only when there are no tags (but a note never excuses the tags).
- **NW-047 · Kimani.** (Same as NW-028: the word "tag".) Perhaps "Needs tier, note, comp tags".
- **NW-048 · Kimani (unsure).** In edit view, show a faint outline on the features the home also has, as
  a quick orientation without making them the obvious click. Maybe it's fine as it is; to discuss.
- **NW-049 · Kimani.** The only way to see the home's own details on Sort is Edit details. Add a
  read-only view: a panel (left side if Hubert stays right) or an expanding sticky header showing the
  home. Edit details stays the modal.
- **NW-050 · Kimani.** Put the Sort / Findings / Send progress row on the same line as the title, to win
  back that row. The home panel (NW-049) could expand there and stay sticky while scrolling. *(Design.)*
- **NW-051 · Noble, answered by Kimani.** Should expanding one row collapse the others? Kimani: no; agents
  will want several open. **Keep it as is.**
- **NW-052 · Kimani.** A **compare view**: the home and one comp side by side, the same fields in the
  same columns, with arrows to step through the comps. Several at once later.
- **NW-053 · Noble.** At the bottom of the list, with everything sorted, he expected the button to
  Findings there. **Repeat the CTA at the bottom.**
- **NW-054 · Kimani.** The sample report needs **a reset button** that restores it in one click, so
  testing doesn't ruin it for next time. And **a co-op sample**, to review the no-size flow.
- **NW-055 · Kimani (FYI).** Noble's notes and tiers are gibberish typed in a rush; don't read them as
  data.
- **NW-056 · Kimani.** Removing a comp needs Edit today. Add:
  - a **trash** button in the expanded card;
  - **hover affordances** in the margins: the edit pencil on the right, the trash on the left;
  - a **bin** at the bottom of the page to restore removed comps.

  Removing isn't excluding (✕).
- **NW-057 · Kimani.** (Same as NW-056: having to expand a row and find Edit before editing is
  annoying.)
- **NW-058 · Kimani.** (Same as NW-020: photos.)
- **NW-059 · Kimani.** Tags that contradict or follow from the facts:
  - picking an outdoor-space feature should remove the "no outdoor space" tag;
  - tags the data already settles should be pre-filled: same building when the address matches, the
    size comparison when both sizes are known, the floor when both floors are known;
  - a known first floor is filled in or hidden.

  "Lower" and "higher" floor depend on the building's height, so they stay manual. Kimani invites
  pushback: perhaps agents in training should fill them in themselves.
- **NW-060 · Kimani.** Once comps are tagged, the filter offers those tags (same building, etc.). Good.

## The Gate and Findings

- **NW-061 · Kimani.** "The two closest sales" and the true estimate: fine. Noble found it useful.
- **NW-062 · Kimani.** The Gate was easy for Noble (low and high). His account is `full`, so he never saw
  the 100-character rule. "View as new agent" at the bottom works.
- **NW-063 · Both.** "How Hubert got there" is dense and jargony: comps with long parentheticals that
  invite skimming. Show the comps as chips, and write it plainer.
- **NW-064 · Kimani.** Showing the target list price on Findings is good; setting it could be easier.
  *(Design.)*
- **NW-065 · Both.** The price table:
  - Noble understood it, but thinks a less experienced agent won't.
  - Kimani didn't, at first: 12 rows of 100 sq ft steps read as a grid, with the only explanation at the
    bottom.
  - Proposal: **five rows** (the lowest and highest of the primary sold comps, the middle, and the two
    midpoints), the explanation at the top, and a **calculator** below (type a size or a $/sq ft and get
    the price).
  - Is the table needed at all, and for which clients?
- **NW-066 · Kimani.** A co-op has no size, so no price table. Review the co-op flow (the sample in
  NW-054).
- **NW-067 · Both.** "Comps that count" lists the 1st-tier comps. Why do they count? Show the agent's
  note, and perhaps Hubert's reason. Every accordion needs an ⓘ hint explaining what it is.
- **NW-068 · Kimani.** Target price ("Only you see this. Hubert never sees it, and it isn't in the
  email"): **why can't Hubert see it?**
  - Hubert should see it once the agent reaches Findings (the neutral result), to help justify a price.
  - If the agent asks Hubert outright to justify a price, no guard is needed: the math runs without
    Hubert anyway.
  - The hint text can go behind an ⓘ.
  - Onboarding explains that Hubert sees some things only after Findings, to stay objective.
- **NW-069 · Both (product direction).** Hannah's point: agents and clients often want a target price
  justified, and pick comps that move toward it. Noble said the true estimate was right and he
  understood why it came out above his guess, but he wanted the argument more in his favour. When the
  target falls in or near the range, agents want to find better comps to bring it closer. The tool
  should support that loop after Findings.
- **NW-070 · Kimani.** The target's owner: whose hoped-for price is it (the client's, the agent's, or
  both)? A toggle, plus the reasoning field that's already there.
- **NW-071 · Noble.** Pricing details confused him:
  - **"Timing: list in October"**: is that advice? On the buyer side, what does timing mean?
  - **"Sales against ask: median 4.6% above last ask across 2 sales"**: is that the sales compared to
    their asking prices? Calm the math words. Say "median of what"; "median" itself is fine.
  - Better still, show it: a bar or strip chart of each comp's sale against its ask, beside the
    estimate bar.
- **NW-072 · Kimani (question).** "Sales took a median of 25 days": median or average? They differ.
- **NW-073 · Kimani.** "Terms: seller pricing / buyer traditional purchase" sits in Pricing details,
  unexplained. These are client and deal details, and belong somewhere first-class, not in the sixth
  accordion. *(Design.)*
- **NW-074 · Both.** Client details: the tool captures only the client's name. Capture, optionally, at
  intake:
  - the buyer's or seller's target, timing and flexibility;
  - **all cash or mortgage**; pre-approval and rate; deposit and down payment;
  - urgency: a move, a new job, a date to close by;
  - what the client values and would pay a premium for (a great loft), and their non-negotiables.

  Noble: his last client was **all cash**, which let them move fast and justify an offer at or below the
  low end of the range.
- **NW-075 · Kimani.** Perhaps a justification step after Findings, or prompts there, to add client
  details and refine: what's non-negotiable, what could the client gain or give up, and can the target
  move toward the supportable range? Hubert helps. *(Design and product.)*
- **NW-076 · Kimani.** "How this was worked out" should sit under "How Hubert got there", as a dropdown of
  every factor in the estimate, displayed cleanly. *(Design.)*
- **NW-077 · Kimani.** Something on Findings says "13 still needed": 13 of what? Unclear.

## Send and Done

- **NW-078 · Kimani.** Remove the line "Hubert drafts the headline and the email from the comps, in the
  house voice, or edit the template below". It's a template; agents know to edit it.
- **NW-079 · Both.** Noble (and Hannah before him) want **Designed as the default, first tab**: Designed,
  Full, Short, Text. Agents will want to send the designed one.
- **NW-080 · Both.** Noble copied the Designed email and sent it to Kimani. In Gmail it arrived
  **left-aligned, not centred**. Agents won't fix that by hand. Centre it as pasted.
- **NW-081 · Kimani.** The received email looked like the wrong font. On a closer look it was ours, but
  **all italic**. Find out why.
- **NW-082 · Kimani.** The address title arrived as a **blue hyperlink**, not in the template's styling.
- **NW-083 · Both.** The subject matters more than the headline, and the headline isn't the subject. Put
  the **subject** first. Noble found it odd that typing the headline made it appear in the email body.
- **NW-084 · Kimani.** Give Full and Short a little formatting (hierarchy that points the eye), reversing
  the earlier plain-text call. Links become short clickable labels ("StreetEasy"), not raw URLs.
- **NW-085 · Kimani.** Somewhere on Send, an example of a good email to look at (useful on other screens
  too).
- **NW-086 · Kimani.** After copying the email, there's **no way on to Done**: the "congrats" screen
  with "what did it sell for" can't be reached.
- **NW-087 · Kimani.** Keep **Write it** where it is.

## The platform, access and data

- **NW-088 · Kimani.** **Admins (and mentors such as Kara and Noble) need to see other people's
  reports** in the Reports list. Kimani needs it now to open Noble's.
- **NW-089 · Kimani.** **Share a report**: an agent adds another user (a mentor, another agent) to a
  report so it shows up for them too.
- **NW-090 · Kimani.** Sessions should be able to **read the production database**, read-only, and write
  only to data marked test or dev (or to a developer's own). Also: duplicate a report, transfer one, and
  grant access between users.
- **NW-091 · Kimani.** (Earlier today) a **sign-in log and usage tracking**, so a failure like Noble's
  explains itself (ledger `casa-r12-2`). Plus the invite flow's stale session: after setting a password
  from the invite email, the tool said "We couldn't check your access" until a sign-out and sign-in.
- **NW-092 · Kimani.** On Noble's laptop the masthead took half the screen. Design for shorter and
  smaller displays, across the tool. *(Design.)*
- **NW-093 · Kimani.** **A persistent AI track, named "Collister"** (after Casa's other address, 60 Collister St), owning
  Hubert and all the AI work:
  - give Hubert as much ability as possible to observe, read, write and act on the platform, then gate
    it by role (dev, admin, new agent, graduated agent);
  - Hubert should see what the agent sees. The calculations are separate from Hubert, so that's safe, and
    agents shouldn't have to re-explain context on Sort.
- **NW-094 · Kimani.** Ask Hubert itself for feedback after the first round of changes lands.
- **NW-095 · Kimani (process).**
  - First, reports, one per topic; update the answer sheet and the to-do lists.
  - Dispatch what's ready: functionality, buttons, back end and data that don't change the tool's layout,
    flow or architecture. Those go first, especially anything that would stop Claude Design seeing the
    tool as it is.
  - Then a handoff to Claude Design for the layout, flow and polish, including responsive design and
    micro-interactions.
  - Keep dispatching small things while Kimani spends a few days in Claude Design. Work in phases.
- **NW-096 · Kimani.** Move to the Casa Claude account first, maybe early next week, before launching new
  sessions, since sessions can't move between accounts. Plan now; answer the open questions in the
  meantime.
- **NW-097 · Kimani (process).** Next walk-through: record it. Google Meet's recorder needs a business
  plan, and no notetaker was connected.
- **NW-098 · Kimani.** **The Feedback box lost his typed notes** when he clicked away without sending.
  It should keep a draft, or ask before closing.
- **NW-099 · Kimani.** Usage tracking (with NW-091): a record of what someone did in the tool (steps
  reached, actions), so a walk-through can be reviewed without asking them to run it again.
- **NW-100 · Kimani (questions for Casanova).** What's his word count and words per minute for this
  dictation? May Casanova request more subagents if needed?

## Added by Kimani after the list (2026-10-15, evening)

- **NW-101 · Kimani.** Reading that Noble "stopped at Send and didn't mark it sent" made it plain:
  **Mark as sent is the forward step, so it belongs on the right.** Copy and Mark as sent are different
  actions. Options: swap their places; stack them; or keep them apart, with the way on to Done greyed out
  until the email is marked sent. Goes with NW-086.
- **NW-102 · Kimani (question).** Could the tool ask for access to the agent's email and **create the
  email as a Gmail draft**, so all the agent does is press Send? Kimani has admin access to Casa's
  Google Workspace and can allow the app there.
