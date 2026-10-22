# Dispatch 25 — Comp report: the per-comp review, the human first (CR-8a)

**Dispatched by:** the bosses' demo debrief thread, for Kimani · 2026-10-22 · **To:** a build thread in
Mason's lane (Calliste hasn't started; the prompt in item 4 moves to Calliste's track when it does)
**Builds from:** `docs/comp-report/feedback/2026-10-22-bosses-demo/notes.md`, **its last section (Kimani's
decisions) first**; `server/lines.ts` and `api/lines.ts` (#89: the pattern for a small model call that
executes the agent's thinking); `workspace/email.ts` (how a comp's lines reach the email today);
`src/views/workspace/Gate.tsx` (the guess-before-the-reveal pattern this copies per comp).
**Depends on:** the live listing read working again (its own thread). Nothing else.
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` when done; never merge.**

## The goal

Erez wants every comp in the client's email to come with a short paragraph on how it compares to the home,
reviewed one comp at a time. Kimani's rule decides who writes first: **the human drives.** A practice agent
writes the paragraph and then gets Hubert's feedback, and only then sees Hubert's own version. A full agent
gets Hubert's draft and edits or approves it. The approved paragraph is what the Designed email shows for that
comp (Dispatch 26).

This reverses D-27 item 6 ("Hubert, guide only") for the per-comp paragraph, as Kimani's 2026-10-21 rule
already did for execution (`hubert-direction`): he still never tiers, tags or picks comps.

## In scope

1. **Review comps: a modal flow, one comp per step.** A new step between Sort and the Gate, opened from Sort's
   CTA ("Review comps") once Findings would unlock. One focused screen per comp, in the email's order (the
   comps `countedComps` would show, `workspace/email.ts`): photo, address, the line the email prints (price,
   $/sq ft, days on market), the agent's tags and Sort note, distance, and the paragraph box. Back and Next
   between comps, a count ("3 of 7"), Escape closes and keeps what was written. It's a step, not a chat:
   anything Hubert says here is about this comp only.
2. **The paragraph.** A new `clientLine?: { text: string; by: 'agent' | 'hubert' | 'both'; approvedAt: string
   | null; at: string }` on `CompJudgment` (`workspace/state.ts`), separate from the internal Sort note so the
   note can stay shorthand. The box starts from the Sort note for practice agents, so they rewrite rather than
   start over. One to three sentences, client-facing; it runs through `workspace/fair-housing.ts` on save.
3. **Practice agents: write, then feedback, then reveal.**
   - The agent writes the paragraph. "Get feedback" sends it to the review call (item 4), which says what's
     right, what's missing or wrong against the comp's facts and tags, and whether the comp looks weak (item
     5). It does not rewrite it.
   - The agent can revise and ask again, as often as they like. "Show Hubert's version" unlocks only after one
     round of feedback, and shows his paragraph beside theirs. They keep theirs, take his, or merge by hand.
   - "Approve" saves `approvedAt`. Every counted comp needs an approved paragraph before the Gate opens, the
     way Findings waits on tiers today. Each feedback round is appended to `reasons`-style history (append
     only), so a mentor can see the learning later.
4. **Full agents: draft, feedback, approve.** Hubert's draft fills the box on first open. The agent edits it
   or types feedback into a field under it ("he's comparing a renovated unit to an original one") and asks
   for a redraft, which goes back through the same call with their words. "Approve" as above. A full agent
   can skip a comp (no paragraph), which the email then leaves without one.
5. **The calls.** One endpoint, `/api/comp-report/comp-line`, three jobs, built on `server/lines.ts`'s
   settings (model, effort set, structured output, stop reason checked, in-request):
   - `review`: the agent's paragraph plus the comp, the home, the tags and the engine's figures in → feedback
     points and a `weak` flag with a reason out. No rewritten paragraph.
   - `draft`: the comp, the home, the tags, the agent's Sort note and any feedback text in → one paragraph.
     Grounded as `lines.ts` is: a figure the report doesn't hold is dropped in code, never printed.
   - `reveal`: as `draft`, for a practice agent, refused by the server unless a `review` for this comp exists.
   The target and the agent's call stay out of all three (D-4): the reveal hasn't happened yet.
6. **Hubert flags a weak comp.** `weak` comes with a plain reason ("closed three years ago", "no amenities
   against a full-service home", "half a mile away"). It shows on the step and on the Sort card as a flag. It
   never changes the tier: the agent decides, and ✕ is one click from the step.
7. **The email reads the approved paragraph.** In `workspace/email.ts`, an approved `clientLine` wins over the
   writer's per-comp lines and the Sort note, for every length. Without one, today's behaviour holds.

## Not in scope

The Designed email's new layout and photos (Dispatch 26). Hubert's chat panel changes (Dispatch 24). The
tool finding comps itself (phase 2, NW-001 b). Mentor views of the feedback history (22 and later).

## Data and constraints

- No migration: `state` is jsonb. Validate the new shape on the server, as `checkTarget` does.
- The sample: the sample fill (Workspace's `fillSample`, and #92's buttons) also fills an approved
  `clientLine` per sample comp, written in house voice, so a demo can skip straight to Send.
- Practice and full come from the agent's level (`ws.level`), as the Gate's rules do.

## Definition of done

- On the sample and on a live report, as a practice agent and a full agent, condo and co-op: the flow
  walks every counted comp; the practice reveal is refused before feedback (a server test); the approved
  paragraphs appear per comp in Full and Short and in Designed.
- Tests: the new shape's validation; the grounding drop for a figure the report lacks; email.ts's
  precedence (approved line, then writer lines, then note).
- Every suite and typecheck passes with nothing skipped. A Playwright walk with screenshots in the PR.
