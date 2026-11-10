# Live follow-along: what it would take

Kimani asked on 2026-11-10: can agents follow Noble's walk-through live on their own device, seeing his
cursor and clicks, while still working in their own copy? This note answers it with options from light to
heavy and a recommendation.

## What's already built (the guide PR)

- **Step numbers everyone shares.** The guide numbers the flow 1 to 8. Noble can say "we're on step 5" and
  everyone can find it.
- **Presenter mode** (the switch in the guide). Noble's screen shows a large "Step 5 of 8 · Sort the comps"
  badge at the bottom left. It follows the screen he's on. A ring follows his cursor and each click shows a
  ripple, so clicks are easy to see on a compressed Zoom or Meet share.
- **Links to a step.** `/tools/comp-report/?guide=5` opens the guide at step 5, and `?guide=glossary` opens
  the glossary. Noble can drop either in the meeting chat.

## Options

| | What agents get | Work | Needs |
|---|---|---|---|
| **0. As built** | Noble shares his screen. Agents watch the share and work in their own tab, following the step numbers. | None | Nothing |
| **1. "Follow Noble" step sync** | Agents join with a short code. A banner in their own copy says "Noble is on step 5 · Sort", with a **Go there** button. They don't see his cursor. | About 1 day | A small endpoint and Netlify Blobs, polled every few seconds. No new service. |
| **2. Ghost cursor** | Option 1, plus Noble's cursor and clicks drawn over each agent's own screen, pinned to the same button or row, not to a pixel position. | About 3 to 5 days, and fiddly | A realtime service (Ably, Pusher or Liveblocks), because Netlify functions can't hold websockets open. That means a new account and key. Agents' reports have different comps and different scroll positions, so the cursor only lines up on shared parts like buttons, steps and the top bar. |
| **3. Full mirror or co-browse** | Agents see Noble's exact screen inside the tool. Either each step he takes replays into their copy, or a third-party co-browse tool is used. | Weeks to build. A co-browse tool is quicker but is paid per seat. | Mirroring one screen conflicts with "they can still change their own copy": once an agent changes something, their copy and Noble's drift apart. |

## Recommendation

**Before 11-13:** stay with option 0. It's built, it can't break the handoff, and over Zoom the step
numbers and presenter mode cover most of what people lose on a share.

**After 11-13:** build option 1 only if Noble finds people getting lost in his first sessions. It's cheap
and needs no new service. Skip options 2 and 3: the cursor can't line up across different data, and a
mirror defeats the point of each agent working in their own copy.

## Calls for Kimani

1. **Same data for everyone.** Following along works best when everyone has the same report. Today only
   admins and guests can load the sample data, so a plain agent can't make the practice report Noble is
   showing. Options: let agents load the sample (it's already marked "not for clients"), or have Noble use
   a real-looking address everyone types in. Recommended: let agents load the sample.
2. **Glossary sign-off.** The glossary in the guide is a plain-language first pass. It follows the
   research draft (`research/glossary-draft.md`), and Noble should approve the wording before training.
