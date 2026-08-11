# Note: "two agents, one property each" mode — In Contract Roundup

Parked for later. Captured so the shape of the ask isn't lost.

## What was asked for

A **two agents, one property each** slide mode in the In Contract Roundup builder
(`tools/incontract-carousel/`), alongside the two that exist today.

## Open question to settle first

The request reads two ways, and they are different builds:

1. **A restyle of the existing pair slide.** Two agents, one property apiece, is
   already what the default slide does — so this would mean re-cutting that layout in
   the language the one-agent slide established: photos stacked flush in one column,
   the other column carrying the agent squares and address blocks on a shared axis
   instead of the current staggered mirror.
2. **Two agents credited on one property each, but sharing the slide's frame** — e.g.
   a co-listing pair where both agents sit together in the header (the way one agent
   does now) and the two properties read as one team's slide rather than two separate
   deals.

Reading 1 is a layout change to `drawPairSlide`. Reading 2 is a third mode next to
`soloAgent`. Ask before building.

## Where it plugs in

The one-agent mode set the pattern to copy:

- `makeDeal()` carries the slide-level flags on the **top deal** of a pair
  (`soloAgent`, `agentLabel`). A third mode wants an enum there rather than a second
  boolean — worth refactoring `soloAgent` into `slideMode: 'pair' | 'agent' | …` when
  the third one lands, including in `serializeSession` / `applySession` / the JSON
  import path, all of which read the field by name.
- `renderCanvas()` dispatches per slide; add a branch beside `drawAgentSlide`.
- The panel's segmented control (`#ic-mode-seg`) takes a third button, and `syncForm()`
  already re-labels every field from the mode — extend the same `setTxt` block.
- Layout constants live in `TA` next to `T`; keep reusing `T.PHOTO_W/H`, `T.AGENT_W/H`
  and the 33/1047 margins so every mode stays on one grid.
