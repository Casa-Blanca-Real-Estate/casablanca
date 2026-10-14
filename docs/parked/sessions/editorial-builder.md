# Editorial builder session — handoff

Retired 2026-10-14. Its builder work continues under **Publisher** (the post builders).

## Publisher: read this first

**The Editorial builder is not broken, as far as anything in a sandbox can show.** The
"v2 delivered but broken" line in the tool table in `docs/context/casa-blanca.md` predates the
Claude Code work and is stale. A smoke test of `claude/main` on 2026-10-14: the page loads with no
errors or failed requests, all seven slide types render, and every entry point exists (import, AI
captions, auto-fill, condense, download).

What a sandbox **can't** reach is the live backend: the StreetEasy import and the `/claude` calls.
So start with one real run on the deployed site: import a StreetEasy listing with auto-fill on,
then download the slides. If anything is broken, that's where it will be. Fix the table line once
you've seen it work.

## What was built, and where

Everything is in **`tools/carousel/cb_editorial.html`**, merged to `claude/main`. The branch
(`claude/nice-bohr-nj42vw`) is deleted. Nothing is unpushed. `claude/main`'s history has since been
consolidated, so these commits don't show up by message in `git log`; the code is there.

**PR #21** (merged):
- Placeholders (the gray hints) show in the editor but never in downloads. `downloadCanvas()`
  turns them off for the export render only.
- Captions fit their slide. The AI prompt gives each slide type a hard line budget (`LINE_BUDGET`
  in `doAI()`): Single A 5, Single B 5 (narrow column), Double A 3, context 5. The subhead is held
  to 9 words or fewer, with line breaks.
- Render guards. The cover subhead word-wraps to the frame instead of running off it. The Double A
  caption shrinks to fit the gap between its two photos.
- Auto-fill on import. Imported photos go into the image slots in order: the first to the cover,
  then each slide (Double A takes two; the End slide's headshots are skipped). Then captions are
  written. A checkbox ("Auto-fill photos + captions right after import", on by default) runs it
  after every import. There's also an "Auto-fill slides" button, and "Captions only".

**PR #27** (merged):
- Status is **deal side × status**. A Sell side / Buy side toggle sits on the cover editor above
  Status. The statuses are Listed, Exclusive, In Contract, Closed. Just Listed and Just Sold are
  gone; old saves are migrated.
- The badge reads the same on both sides (Closed is `CLOSED`). The price lead-in carries the
  difference: "Sold for" on the sell side, "Acquired for" on the buy side.
- The agent line reads "with agent" on the sell side and "by agent" on the buy side. It shortens to
  "w/ agent" once the name reaches 20 characters. A new Agent lead-in field on the teaser
  overrides it.
- The agent name shrinks to stay on one line, down to 85% of the header size, and wraps only past
  that.
- Beds, baths and sqft sit in the top-right corner, flush with the top of the address. That leaves
  the agent line the full width, so a 36-character name fits on one line.

Earlier in this session: the **In Contract carousel builder** (`tools/incontract-carousel/`),
cloned from the closed builder, with two deals per slide and a header field per slide. Another
session has since added a multi-property agent mode (#26).

## Unfinished, and how I'd fix it

1. **The caption budgets have never been checked against a real generation.** The sandbox can't
   call `/claude`. Generate one post. If a slide type still runs long, lower its `LINE_BUDGET`.
2. **The model ID is hardcoded twice**: `model:'claude-opus-4-8'` in `doAI()` and
   `condenseDescription()`. `netlify/functions/claude.mjs` passes it through untouched. If captions
   fail with a model error, update both. The closed builder uses Haiku on purpose (speed and cost);
   the Editorial builder uses Opus.
3. **The editor fields don't match the canvas.** Kimani saw the Double A text field show 5 lines
   where the canvas fits 4. The render guard keeps the canvas right, but the field still misleads.
   Fix: size each caption field's rows from the same per-type budget.
4. **Only Double A shrinks to fit.** The other slides rely on the prompt. Fix: move the gap-fit
   loop from `drawDoubleA` into `drawDesc` with a per-type max-lines.
5. **Auto-fill pairs by order, not by content.** Photo N lands on slide N, and that slide's caption
   is written for it, but the AI never sees the photo. Vision pairing (kitchen photo with kitchen
   caption) can sit on top of it later; it's Kimani's call.
6. **Old saves default to the sell side.** A saved Closed post with no side now reads "Sold for",
   where the old default was "Acquired for". The field is editable. A StreetEasy "sold" maps to
   Closed and leaves the side as it is.

## Decisions Kimani made in this conversation

- The four statuses plus the side, as above. **CLOSED on both sides is a design choice; don't
  change it.**
- "with agent" / "by agent" / "w/ agent" at 20 characters; specs in the top-right corner.
- Placeholders in the editor only, never in an export.
- Auto-fill on by default, pairing by order for now. He took this recommendation over vision
  pairing.
- A subhead of 9 words or fewer, with hard line breaks.

## Waiting on Kimani

- **Testing #21 and #27 live.** He said he would. Item 1 above depends on it.
- **The unified Compilation builder.** Parked before it started. It needs his picture of what it is
  (one deck of several listings? a recurring roundup?) before anyone plans it.
- **The single-agent, several-listing In Contract format.** He was going to mock it up. Check
  whether #26's multi-property mode already covers it.
- **Vision pairing for auto-fill**: yes or no (item 5).

— the Editorial builder session (retiring)
