# Comp report demo to Erez, Hannah and Kara — 2026-10-22

Captured from the meeting transcript and checked against the recording. **Kimani's decisions on it
(2026-10-22) are at the end and win over anything above.** About 63 minutes. Kara left
at about 54:00 for an appointment; the last ten minutes are Erez, Hannah and Kimani.

## What I could and couldn't check in the audio

- I matched every turn's voice against the four intro samples ("this is Kimani…", 0:00–0:15) with a
  speaker-embedding model (SpeechBrain ECAPA), in 1.5-second windows.
- **On the long turns the transcript's labels are right:** 105 of 106 turns over about 9 seconds matched
  the labelled speaker. The mix-ups are in short cross-talk ("Yeah", "Right", one-liners), which is where
  you'd expect them.
- **Settled by the voice match:**
  - Kimani said "You're wrong. But if it tells them, then they're not going to learn" (11:07), "If you just
    let this do the work for the agents they're not going to learn anything" (24:15), and "You're not going
    to be productive properly until they know what they're doing" (27:29).
  - Kara said "I agree with Erez" on dropping the buyer's target (12:39), "You need a human to extrapolate
    the data" (15:14), and "I 100% want learning" (26:09–26:18).
  - Hannah carried the seller-side case for a guide price (11:40–14:59), and "maybe we should have two
    different versions" (27:33).
- **Not settled:** "The market dictates the price, not the client's" (13:19, labelled Kara) is a mix of
  Erez's and Kara's voices. "Look how nice this branding is" (47:18, labelled Hannah) could be Kimani.
  "I think they should still have an idea of what they think" (11:22, labelled Hannah) leans Kara. None of
  these change a decision.
- I didn't re-transcribe the words: a full Whisper pass was too slow on this machine (about 90 minutes),
  so the wording below is the transcript's.

## Who wants what

**Erez (the decision-maker in the room)**
- **The end product is one branded visual and nothing else.** "Forget emails on the side. Forget
  paragraphs… no short, long version, nothing." Every agent who finishes sends the client one branded piece
  "with the listings and a little story in it." An HTML email or a long PDF are both fine ("they'll just
  open it and scroll").
- **Each comp gets its own box:** thin line round it, address big and bold on top, the photo, price and
  $/sq ft, and an AI paragraph on why it does or doesn't compare to the anchor. "Ten to fifteen units that
  are actual addresses, photos, with the price per square foot." The separate $/sq ft price table goes;
  its numbers belong per unit.
- **The AI's per-comp analysis lives on the Sort page,** per property (a tab, or a pop-up on the comp).
  The agent gives feedback on that comp, the AI rewrites that comp's paragraph, and once the agent approves
  it, it flows into the final piece. One chat across all comps is confusing; feedback has to be tied to the
  property.
- **Condense the tags page** ("crush it a little").
- **See it live first:** "Before anything… I want to see that it pulls out the photos." Real fetches, real
  photos, not the sample.
- **Drop the buyer's target.** "The market knows… if your tool is correct, it'll give us the right price."
  Skeptical even for sellers ("you're pulling a number out of where?"). Also: "Don't give people options.
  Either yes or no." (aimed at the target being optional).
- **Phase 2: the AI finds the comps from the anchor,** without the StreetEasy side trip. He and Kara both
  assumed the tool already did this (19:20–19:22). By the end: "I'm over the fact that you go outside to get
  the link. We'll get to that phase two."
- Productivity over teaching: "They don't have time to learn… I want to be productive."
- Wants to understand where it lives (Netlify, GitHub, Google sign-in, each agent sees only their own
  work). He's satisfied on that; it connects to his earlier ask to move to Casa-owned accounts (D-26).
- Liked: the branding and colours ("you didn't throw in any random colours"), dark mode, the agent's
  range before the reveal ("that's smart"), the tags as apples-to-apples attributes once he got them.

**Hannah**
- Keep a target or guide price **for sellers** ("you have to guide the price for a seller"); for buyers
  she uses one to orient, as long as it doesn't limit the data.
- **The AI writes the per-comp notes** ("make the AI do it for them"): "200 square feet smaller", "took 175
  days to go to a deal", "no amenities", "closed three years ago". She wants it to **flag a bad comp** ("I
  don't think this is a good comp"), and the agent to be able to edit the notes.
- **An overview at the top** of the client piece, then each listing with its reasoning. The notes have to
  be digestible.
- Her own flow: a StreetEasy search (one to five minutes), then upload the PDF or screenshots and let the AI
  interpret them. Maybe two modes: upload your own comps, or let the AI search.
- Her current emails "look like shit"; this is the problem she wants solved.
- Loves the branding and the name Hubert.

**Kara**
- Agreed with Erez on dropping the buyer's target (agents get pushed into lowballs by buyers).
- But wants learning, and a human to extrapolate from the data.
- **Limit comps by distance** (new agents add buildings half a mile away), and show the distance on every
  comp. Told it exists.
- **Square footage is unreliable and co-ops are most of the business;** the co-op flow matters most.
  Floor plans aren't a reliable source of size.
- The wide sample range ($1,157–$2,112/sq ft) read as a bad comp list. That was the sample, but it landed
  as the tool's output.

## What went wrong in the room (my read)

1. **The live read failed,** so they saw the sample: no photos, a yellow sample strip, and a range wide
   enough to look broken. Most of Erez's doubt follows from "I'm not seeing it."
2. **They expected the tool to find the comps.** Hearing it doesn't (yet) reframed the rest as "it
   formats your research."
3. **The demo opened on the target field,** which started a fifteen-minute argument before any output was
   on screen. The design's answer (the target never enters the calculation, D-4) was said once at 15:33 and
   didn't land.
4. **Walked in the order of the screens,** when Erez kept asking for the end ("show me the end").

## Against the plan (09-plan.md, Phase A at 6 of 10)

| What they asked | Where it stands | The change |
|---|---|---|
| One branded piece, no Full/Short/Text | Send has four tabs; Designed is rendered from the Full draft's plain text (D-27 item 7, Dispatch 18) | Designed becomes the product; the others hide or go |
| A box per comp with photo, $/sq ft, AI paragraph | Designed has a block per comp with grey photo placeholders; photos in the email are phase B (NW-020 b) | Photos move up; layout is a Designed rework |
| AI's per-comp reasoning, editable, with feedback | Hubert is "guide only" (D-27 item 6); "Hubert's reason per comp" is phase C (NW-067 b) | The biggest reversal: moves to the front |
| AI flags a bad comp | Not built | New, with the per-comp reasoning |
| Overview at the top | The headline and intro exist in Full | Part of the Designed rework |
| Drop the $/sq ft table | NW-065 b makes it five rows everywhere (Dispatch 21) | Rethink 21's table for the client piece |
| See it live, with photos | The listing read (16) and photos (#88, sample only) are merged; today's live read failed | First: find why it failed |
| No buyer target | One number, relabelled (NW-002, NB answer A) | Decision for you |
| Condense the tags page | Phase B layout (Claude Design) | Fits the design pass |
| AI finds comps from the anchor | Phase C (NW-001 b) | Erez's phase 2; research can start |
| Distance limit and distance per comp | Built (Dispatch 11) | None; show it next time |
| Co-op first, size unreliable | Co-op is the default; no-SF handling built | None |

Dispatches 21 (Findings), 22 and 23 weren't touched in the meeting; the bosses barely looked at Findings.

## Kimani's decisions (2026-10-22, after reading this)

Agreed with everything above except where this section says otherwise.

1. **The target stays, for buyers and sellers.** It's the client's top budget (buyer) or target (seller):
   Findings' chart shows where it falls against the computed range, and it never enters the calculation
   (D-4). It can help choose comps closer to the client's budget after the true estimate exists, and it
   helps Hubert word the email ("the estimate is $20K above your budget, and here's why"). **Relabel the
   buyer's as "budget".** Kara's lowball worry is answered by the same chart: the agent sees where the
   buyer's number sits against the range.
2. **The human drives the per-comp analysis.** It's a **modal flow, one focused step per listing** (not one
   chat across all comps), on Sort, **for every comp, before it's tiered**: the reasoning is how the agent
   decides the tier.
   - **Agents in mentorship (practice):** the agent writes their reasoning first. Hubert checks it and gives
     feedback, and only after that can they reveal Hubert's own take. If Hubert did the thinking first, a new
     agent wouldn't know what feedback to give.
   - **Graduated agents (full):** Hubert's take comes first, and the agent edits it, gives feedback and
     tiers, as Erez described.
   - **The client's words are a separate step at Send:** the overview and each comp's paragraph are written
     for the client from the whole process, not lifted from the Sort reasoning. Practice agents write them and
     get feedback first; full agents edit the writer's draft.
3. **Optional fields stay.** The tool becomes part of agent training (Hannah, Noble, Kara and Kimani agree):
   new agents learn what each part is for, so they know what to do with optional fields.
4. **Teaching is the product.** New agents have to learn CMAs anyway. The tool halves the time while teaching
   them how a CMA is done and making sure they understand what the AI produced. New agents learn the flow;
   experienced agents move through it faster.
5. **Hubert flags a bad comp.** That matters most when the agent supplies the comps; once the tool finds
   comps itself (phase 2), it shouldn't pull ones it considers bad.
6. **The client piece:** the Designed email is the main thing sent, still as a pasted email for now (a
   hosted page or PDF link are later phases). The Text stays, as a secondary message to send after the
   Designed email. Full and Short stay as fallbacks in case an agent has trouble sending the HTML. Kimani
   wants the email drafted straight into the agent's Gmail from the tool (NW-102, NB-28).
7. **Order:** fix the live listing read first (its own thread; a live run-through for Erez was promised for
   end of day, and next week is fine). Then per-comp analysis and photos, then the Designed email as the
   one piece, then Dispatch 21, then Dispatch 23 (both still go).
