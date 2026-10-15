# Dispatch 13 — Comp report: the writer and QA (CR-5)

**Dispatched by:** Casanova · 2026-10-09 · **To:** Mason
**Builds from:** `docs/comp-report/01-design.md` v0.5.1:
- §10.2, the email and the headline;
- §9, QA;
- §8.1 and §8.8: the writer is Opus 5.5, stateless, with one call per draft;
- §8.4: the agent's number and target never reach the writer (Hubert's rule is D-4; see the note under Depends on);
- §8.6 and §8.7: the client profile and agent voice, phase 2;
- §12, `narratives`.

Also `02-screens.md` (Send), and Frankie's email in `docs/comp-report/sources/` (render the pages).
**Depends on:** nothing new. It builds on what's merged: Send, `workspace/email.ts`,
`workspace/grounding.ts`, `headline_facts` (#58), and the turn's background-function pattern (CR-1).
**Corrected 2026-10-15:** this brief said the agent's number and target "never reach a model". That is true of
the writer, as built (`workspace/writer-input.ts` reads `headline_facts.facts` and `names`, never `agent_number`,
and the engine input it reads has no named prices or deal terms). It is not the rule for Hubert: D-4 hides the target
from him only until the neutral result exists, and Dispatch 24 gives it to him after the reveal. The two lines
above and in Definition of done now say "the writer". Hubert is not covered by this brief.
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` per phase. Never merge — Casanova
or Kimani merges. Sign PRs, PR comments and commits "— Mason (CR-5)".**

## Why this exists

Send works, but its email is a fixed template, and its drafts restate the engine's sentence. The
report exists for **one sentence the agent sends a client** (Noble). This dispatch has Claude write
the headline drafts and the email in Casa's voice, in Frankie's order. Every number is checked before
anything is copied.

## Phase 1 — the writer, in Casa's house voice

1. **One write per request, in a background function**, with progress the browser reads, like a turn
   (CR-1 measured the synchronous cap). It's stateless. Use the model and settings in §8.8, checked
   against the `claude-api` skill when you build.
2. **What the writer gets, and nothing else:**
   - `headline_facts.facts` and `names` for the chosen result;
   - the comps that count, with their status, price, $/sq ft, link and the agent's notes;
   - the price table;
   - buyer or seller, and the client's first name;
   - the length: full, short or text;
   - the agent's own next-step line, if they wrote one, marked *agent-stated*.

   **Never** the agent's number, the target or deal terms the agent hasn't put in the email (§8.4).
   A test proves those can't reach the request.
3. **What it returns:** structured output, not free text.
   - **Two or three headlines.**
   - **The email's sections, in Frankie's order:**
     - the line on how the comps were chosen;
     - each comp's line;
     - things to consider;
     - the next step.

   The frame stays the code's: the greeting, the price table, the sign-off and the disclaimer. Empty
   sections are left out. If the writer fails, the fixed template from #57 is the fallback, and it
   says so.
4. **The house voice** comes from a short style file in the repo, drawn from Frankie's email and
   Kara's workshop:
   - plain;
   - specific;
   - numbers that come from the comps;
   - one to three lines per comp;
   - no hype.

   It's versioned like the assistant's prompts. Put it in the PR for Kimani to read.
5. **QA on every draft (§9),** before Copy:
   - **Numbers.** Every number in the text is matched against the facts, the comps' own figures and
     anything agent-stated (`grounding.ts`, widened from the headline to the whole email). An
     unmatched number is highlighted. The agent attributes it, edits it, or acknowledges it, and the
     acknowledgment is logged. Copy proceeds.
   - **Range language.** A point value ("worth $3.5M") is flagged; a list-price recommendation isn't.
   - **Compliance, the only hard block:**
     - "appraisal" and "appraised value";
     - fair-housing terms from a fixed, reviewed list, and nothing else. A list term is a hard stop;
       anything near one is a warning to acknowledge.
     - The disclaimer is always inserted.
   - **Estimates:** if the draft uses "with estimates", that's disclosed.
6. **Pinned to its numbers.** Each draft is stored (`narratives`, §12) with:
   - the engine version and an inputs hash;
   - the `headline_facts` it was written from;
   - the model, the prompt version and the QA results.

   An edit after a draft forks a new one; nothing is overwritten. Log `usage` per call.
7. **On Send:**
   - "Write it" produces the headlines and the email.
   - The agent picks a headline or writes their own, then edits the email inline.
   - QA stays one line. Length switches rewrite.
   - The sample is marked as before.
8. **Tests,** with a fake model:
   - a draft citing only facts passes;
   - an invented number is caught;
   - the agent's number never reaches the request;
   - "appraisal" blocks;
   - a refusal or a failed call falls back to the template;
   - the pinned facts are stored with the draft.

   Add a small eval run (the 100 Barclay sample, and Frankie's #517 rebuilt as a report), with its
   output in the PR for Kimani to read against Frankie's email.

**Phase 1 is done when,** on production, the sample and a real report each produce headlines and an
email in Frankie's order. Every number checks, Copy works, and Kimani has read the eval drafts.

## Phase 2 — the agent's voice and the client profile (§8.7, §8.6)

**Don't depend on agents responding.** Voice is optional, and the house voice is the default.

1. **Voice samples:**
   - an agent uploads their own writing, attested as theirs on upload;
   - client names and contact details are stripped before storage;
   - a style profile is derived, which the agent can read and edit;
   - mentors and admins can see both (D-8);
   - the writer uses the profile and one or two samples.

   Practice submissions count later (§11). Samples never go to Jev. **House rules outrank voice.**
2. **The client profile, D-7 B** (a few defined dimensions: decision style, priorities, how much
   math):
   - it shapes tone, emphasis and length, never the range;
   - it has no fields for protected characteristics, and capture refuses them (§8.6).

**Phase 2 is done when** an agent with samples gets drafts in their voice, an agent without them
gets the house voice, and the profile changes the tone and never a number.

## Not in scope

- The assistant drawer's real build (CR-4).
- The PDF (CR-6, which waits on Kimani's design).
- Jev screening for fair housing (a private-text lane, which waits for zero retention).
- Sending email: the tool copies, it doesn't send.

## Definition of done

- Both phases are merged and verified as above.
- No draft can be copied with a hard compliance failure.
- Every number in a draft is checked, and the check is logged.
- The agent's number and target never reach the writer.
- Internal paths still 404, including uppercase.
- PRs are open against `claude/main`, and signed.

— Casanova
