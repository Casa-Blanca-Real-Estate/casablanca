# Dispatch 25 — Comp report: the per-comp review on Sort, the human first (CR-8a)

**Dispatched by:** the bosses' demo debrief thread, for Kimani · 2026-10-22 · **To:** a build thread in
Mason's lane (Collister hasn't started; the prompt in item 5 moves to Collister's track when it does)
**Builds from:** `docs/comp-report/feedback/2026-10-22-bosses-demo/notes.md`, **its last section (Kimani's
decisions) first**; D-29 in `docs/decisions.md`; `src/views/comp/CompForm.tsx` and `src/views/sort/*` (the
note, tags and tier today); `server/lines.ts` and `api/lines.ts` (#89: the pattern for a small model call that
executes the agent's thinking); `src/views/workspace/Gate.tsx` (the guess-before-the-reveal pattern this
copies per comp).
**Depends on:** the live listing read working again (its own thread). Nothing else.
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` when done; never merge.**

## The goal

The agent reasons about each comp before tiering it: that reasoning is how they decide its tier. Erez wants
that reasoning reviewed one comp at a time, with the AI's view of each comp beside it, not in one chat across
all of them. Kimani's rule decides who goes first: **the human drives.** A practice agent writes their
reasoning, gets Hubert's feedback, and only then sees Hubert's own take. A full agent sees Hubert's take first
and edits or accepts it. Either way, **the agent sets the tier.**

The client-facing words are a separate, later step at Send (Dispatch 26). This dispatch is the internal
reasoning on Sort.

This reverses D-27 item 6 ("Hubert, guide only") for the per-comp take, as Kimani's 2026-10-21 rule already did
for execution: Hubert never tiers, tags or picks comps.

## In scope

1. **Review comps: a modal flow on Sort, one comp per step.** For **every comp in the report** (the ones not
   removed), untiered ones first, in Sort's order. Opened from Sort ("Review comps", the primary CTA while any
   comp is unreviewed), and from any comp's card ("Review" opens the flow at that comp). One focused screen per
   comp: photo, address, the facts Sort shows (price, $/sq ft, size, floor, days on market, distance), the
   features and tags, the reasoning box, Hubert's area, and the tier control. Back and Next, a count ("3 of
   11"), and Escape closes and keeps what was written. It's a step, not a chat: what Hubert says here is
   about this comp only.
2. **The reasoning is the Sort note.** The step writes the comp's existing `note` ("Why it's a comp") and
   `tags`, with today's save rules (NB-8: practice agents need both; full agents need tags). There's no new
   field for the reasoning. Hubert's takes and the feedback rounds go in a new append-only
   `review?: { at: string; kind: 'feedback' | 'take'; text: string; weak: { reason: string } | null; by:
   string }[]` on `CompJudgment` (`workspace/state.ts`), so a mentor can see the learning later.
3. **Practice agents: reason, feedback, reveal, tier.**
   - The agent writes the note and picks tags. "Get feedback" sends them to the review call (item 5). It says
     what holds up, what's missing or wrong against the comp's facts and the home, and whether the comp looks
     weak (item 6). It does not rewrite the note.
   - The agent can revise and ask again, as often as they like. "Show Hubert's take" unlocks only after one
     round of feedback, and shows his reasoning beside theirs, with the tier he would give and why. They
     keep theirs, revise it, or copy from his.
   - The agent then sets the tier (1st / 2nd / ✕, ★ for the anchor) in the step. Their note stays theirs.
4. **Full agents: take, edit, tier.** Hubert's take shows on first open of a comp, with the tier he would
   give. The agent writes or edits their note (they can copy his in one click), can ask him again with
   feedback typed under it ("he's comparing a renovated unit to an original one"), and sets the tier. Skipping
   the step is fine: today's Sort still works without it.
5. **The calls.** One endpoint, `/api/comp-report/comp-review`, three jobs, built on `server/lines.ts`'s
   settings (model, effort set explicitly, structured output, stop reason checked, run in the request):
   - `feedback`: the agent's note and tags, the comp, the home and the engine's figures in → feedback points
     and a `weak` flag with a reason out. No rewrite, no tier.
   - `take`: the same inputs (with the agent's feedback text, if any) in → Hubert's reasoning, a suggested
     tier and a `weak` flag. Grounded as `lines.ts` is: a figure the report doesn't hold is dropped in code,
     never shown.
   - For a practice agent the server refuses `take` on a comp with no `feedback` round stored. A test proves it.
   The target and the agent's call stay out of all three (D-4): the reveal hasn't happened yet.
6. **Hubert flags a weak comp.** `weak` comes with a plain reason: "closed three years ago", "no amenities
   against a full-service home", "half a mile away". It shows on the step and on the Sort card as a flag, and
   never changes the tier: the agent decides, and ✕ is one click from the step. (Kimani: this matters most when
   the agent brought the comps. The tool won't pull comps it thinks are weak once it finds them itself.)
7. **The sample.** The sample fill (Workspace's `fillSample`, and #92's buttons) also fills a stored take per
   sample comp, so a demo shows the flow with Hubert's view already there.

## Not in scope

The client-facing per-comp paragraphs and the overview (Dispatch 26). Hubert's chat panel (Dispatch 24). The
tool finding comps itself (phase 2, NW-001 b). Mentor views of the review history (22 and later).

## Data and constraints

- No migration: `state` is jsonb. Validate the new shape on the server, as `checkTarget` does.
- Practice and full come from the agent's level (`ws.level`), as the Gate's rules do.
- The take is advice. Nothing in the engine reads `review`.

## Definition of done

- On the sample and on a live report, as a practice agent and as a full agent, condo and co-op: the flow
  walks every comp, the practice reveal is refused before a feedback round (a server test), the tier set in
  the step is the comp's tier on Sort, and a weak flag shows on the card.
- Tests: the new shape's validation, the grounding drop for a figure the report lacks, and that `review`
  never changes a tier or the engine's output.
- Every suite and typecheck passes with nothing skipped. A Playwright walk with screenshots in the PR.
