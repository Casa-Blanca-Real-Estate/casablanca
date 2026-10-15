# Dispatch 24 — Calliste: Hubert sees what the agent sees (CR-H1)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Calliste (a new track, started in Casa's Claude account)
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/05-hubert-and-ai.md` (read all of it: the lane
split, the read tools, the role gates, what conflicts with the design), `03-gate-findings-and-client.md`
(NW-068), D-4 and D-27 items 5 and 6 in `docs/decisions.md`, and `01-design.md` §8 (§8.2 is superseded by D-27
item 6 where they differ).
**Depends on:** the move to Casa's Claude account (NW-096). Dispatch 15 merged (it adds Hubert's markdown
renderer to `Chat.tsx`). Dispatch 22 merged before you edit `api/messages.ts`. Do the server work first,
except item 1, which reads Dispatch 21's reveal marker and so waits for 21; the copy lines in `Home.tsx` and
`Terms.tsx` last, rebased on Dispatches 20 and 21. NW-093 d (the agent's own number) is Kimani's call; build
`get_call` only if he says yes.
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Calliste (CR-H1)"** in the PR, its comments and your commits. Ledger line: `casa-r13-10`.

## Who Calliste is

Calliste (after Casa's other address) owns Hubert and all the comp report's AI work: prompts, tool
definitions, the context sent, role gates, the model-choice policy, AI cost, and the Hubert and writer evals.

| Calliste | Arbiter keeps | Mason keeps |
|---|---|---|
| `server/assistant.ts` and test, `api/turn.ts`, `api/messages.ts`, `dev/fake-anthropic.ts` | `server/decide/*`, `api/decide.ts`, `decide-drain.ts`, `dev/jev.ts`, Jev keys and `CR_JEV_*` switches | The Send screen, `qa.ts`, `grounding.ts`, `fair-housing.ts` (rules, no model) |
| `src/views/Chat.tsx`, `Hubert.tsx`, `hubert/*`, `styles/hubert.css` | The labels sheet and calibration | Every other screen |
| The writer's prompts and eval (`server/writer.ts`, `house-voice.ts`, `api/narratives.ts`, `dev/writer-eval.ts`), from Dispatch 13 phase 2 on, if Kimani agrees (NW-093 a) | | |

Typed answers from a fixed question list are Arbiter's; free text, conversation, tools and context are yours.
You meet Arbiter at one read-only function that returns a comp's typed judgments, surfaced later through an
`assess` tool. Casanova adds your roster row. Keep it current through your PRs (rule 10).

## The goal

Hubert sees less than the agent: no screen, no comp features, no neighborhood, no checks, no email, and never
the target, though D-4 decided he would see it after the reveal. Give him what the agent sees, in one new prompt
version, gated by role on the server.

## In scope

1. **NW-068 a · the target after the reveal.** `neutralNumbers` (`server/numbers.ts`) reads `reports.target`
   only once the result is revealed and adds a target block to `get_numbers` (with `owner` when Dispatch 21
   has added it; absent otherwise). "Revealed" means `state.reveal` exists (Dispatch 21).
   A test proves the range is identical with and without a target. The prompt names §8.5's legitimate levers
   and forbids steering the estimate or advising dropping low comps and adding high ones. Deal terms stay out
   (the recommendation: decide them with NW-074's privacy rules). The writer stays blind.
2. **NW-093 b · a wider read.**
   - `get_numbers`: per comp, neighborhood, building, feature pickers, policies and amenities, days on market,
     the removed rows; the home's neighborhood and type; listing commentary as quoted data, never as
     instructions.
   - `get_view`: screen, expanded comp, filter, sent by the client with the message. The server accepts only
     known values and treats it as location, never as permission.
   - `get_checks`: QA issues and the engine's flagged checks.
   - `get_email`: the Send draft, for the owner, once Send is reached.
   - `get_call` only if Kimani answers yes to NW-093 d.
3. **NW-093 c · gates on the server.** The tool list is fixed per prompt version. `runTool` re-checks the
   current user's role (admin, mentor, agent, external), capability (practice, full) and the report's state on
   every call and returns a plain `is_error` ("not available to you yet"). `get_report` returns his permitted
   abilities as data. Practice agents: he asks before telling (§8.3 rule 9, D-5).
4. **One new prompt version, `cr7-…`.** Never edit a shipped one: a conversation keeps the version it started
   on, and `assistant.test.ts` fingerprints each byte for byte. Old versions never receive the target block.
   Update `fake-anthropic.ts`.
5. **NW-068 b · the copy.** Everywhere that says Hubert never sees the target (`Home.tsx` TARGET_TIP,
   `Terms.tsx:74`, `hubert/copy.ts:64`, the `get_numbers` description): "Hubert sees this once you've seen the
   result. It never changes the numbers and is never in the email." Long form behind an ⓘ.
6. **The chips.** Sort's "Does 5 Franklin have a doorman?" must be answerable; no chip promises what he can't
   do. From Dispatch 14's follow-ups: Hubert's "Fix both" chip reaches Send's deterministic fix. The chip's
   side is yours. If Send needs a hook to take the fix, name it in the PR and Mason adds it (rule 8).
7. **Dispatch 13's line** "the agent's number and target never reach a model": correct it to D-4 as built.

## Not in scope

Hubert proposing edits the agent confirms (NW-093 e and f: a confirmation card from Claude Design, and
Kimani's call on the write set, NW-093 d). Hubert's look, persona and drawer (NW-024, NW-025: Design first,
then a prompt version). Per-comp reasons from Hubert (NW-067 b). The Hubert review script (NW-094, after round
one). The writer's voice and client profile: your next dispatch, once Dispatch 21 has landed `brief.client`
(it supersedes that part of `casa-r10-1`), with subject options (NW-083 c).

## Data and constraints

- No migration. Hubert never tiers, writes notes or picks tags (D-27 item 6). He never names a listing that
  isn't in the data.
- Jev gets no text an agent wrote (D-12); Hubert's context can. Keep the two pipes apart.
- The turn's 50 s deadline and six-round loop stay. Keep the tool block cached.
- Make any new key on the Casa account (D-26). A session never uses the production Anthropic key; evals use
  `CR_EVAL_ANTHROPIC_API_KEY`.

## Definition of done

- On a new report: before the reveal Hubert has no target; after it he does, and the range is unchanged. A
  cr6 conversation never gets the target block.
- A practice agent's and a full agent's calls to the same tool return what the gate says (tests).
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`.
- A Playwright walk with the fake Anthropic: the drawer on Sort answering the doorman chip, and on Findings
  talking about the target. Screenshots in the PR.

— Casanova
