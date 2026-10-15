# Hubert and the AI work

**In short**
- Hubert's raw markdown (NW-023) is a plain bug: `Chat.tsx` prints his text in a `<p>` with `white-space: pre-wrap`, and nothing renders markdown anywhere. A small safe renderer fixes it for old and new conversations alike.
- Hubert today sees much less than the agent does: two tools, no screen, and no comp features, neighborhood, policies, checks or email. Ships now: the renderer, the target after the result (NW-068, which D-4 already allows), a wider read of the report, and role checks. One new prompt version carries all of it.
- The Calliste track (NW-093) takes Hubert and the writer; Arbiter keeps Jev and the typed-judgment queue. Hubert proposing edits the agent confirms needs a confirmation card from Claude Design first. Four calls for Kimani first, below.

| Id | Who | What | Class | Track | Phase |
|---|---|---|---|---|---|
| NW-017 b | Noble | Suggest similar or nearby neighborhoods in Add comps | LATER | Surveyor (list), Abacus (module), Calliste (Hubert reads it) | C-later |
| NW-023 | Kimani | Hubert's replies show raw markdown: render it safely | FIX | Mason (Calliste after) | A-now |
| NW-024 a | Kimani | Hubert's look: mark, bubbles, motion, presence | DESIGN | Claude Design | B-after-design |
| NW-024 b | Kimani | Hubert's persona and voice in the prompt, once the design says who he is | BUILD | Calliste | B-after-design |
| NW-025 | Kimani | Drawer: softer open and close, drag to widen, maybe on the left | DESIGN | Claude Design | B-after-design |
| NW-063 a | Both | "How Hubert got there": write it plainer, and return comps as references, not parentheticals | BUILD | Mason (copy), Calliste owns after | A-now |
| NW-063 b | Both | Show the comps as chips | DESIGN | Claude Design (the Findings report owns the layout) | B-after-design |
| NW-068 a | Kimani | Hubert sees the target price once the result exists (D-4 as built means never) | BUILD | Calliste (Mason until it starts) | A-now |
| NW-068 b | Kimani | Fix the "Hubert never sees it" wording in four places; the long hint goes behind an ⓘ | FIX | Mason | A-now, ships with 068 a |
| NW-068 c | Kimani | Onboarding says Hubert sees some things only after Findings | LATER | Claude Design | C-later (with NW-032) |
| NW-093 a | Kimani | Stand up Calliste: roster row, dispatch brief, what moves from where | BUILD | Casanova | A-now |
| NW-093 b | Kimani | Hubert sees what the agent sees: wider reads of the report, plus where the agent is | BUILD | Calliste | A-now |
| NW-093 c | Kimani | Gate Hubert by role, capability and report state, on the server | BUILD | Calliste | A-now |
| NW-093 d | Kimani | What Hubert may write, and whether he sees the agent's own number | DECIDE | Kimani | A-now |
| NW-093 e | Kimani | The card where Hubert proposes a change and the agent confirms | DESIGN | Claude Design | B-after-design |
| NW-093 f | Kimani | Propose-and-confirm tools, applied as the agent | BUILD | Calliste | B-after-design |
| NW-094 | Kimani | Ask Hubert for feedback once round one lands | LATER | Calliste | C-later |

## What Hubert is today

| | |
|---|---|
| Model and prompt | `claude-opus-5-5`, effort low, prompt `cr6-2026-10-15` (`server/assistant.ts`). A conversation stays on the version it started with, because its thinking blocks are bound to that prompt and tool list. A test fingerprints every shipped version (`assistant.test.ts`). |
| Tools | `get_report` (title, type, mode, status, created) and `get_numbers`. Nothing writes. |
| Context | The system prompt, the transcript the server owns, and whatever `get_numbers` returns when he calls it. The browser sends only the message; the screen is not sent (`api/turn.ts`). |
| `get_numbers` has | The home's intake facts, per comp: status, tier, note, tags, anchor, price, size, date, beds, baths, floor, flagged checks, whether it counts and why not; both results once the agent has given a call or skipped; still-needed and warnings; the agent's removed export rows. Built in `server/numbers.ts` and `workspace/summary.ts`. |
| `get_numbers` lacks | Comp features (the pickers), neighborhood, building name, policies and amenities from the export, days on market, engagement, listing commentary, the email draft, QA issues, deal terms, the brief and the client, the target. All are on the records (`CompRecord.tags`, `.neighborhood`, `.building_name`) or in the report, and none reach him. |
| Who talks | The report's owner only. Admins can read the transcript (`api/messages.ts`) but not write in it. |
| What the chips promise | "Does 5 Franklin have a doorman?" is a Sort chip (`hubert/copy.ts`). He can't answer it: comp features are not in `get_numbers`. |

The decide layer (Arbiter, `server/decide/*`) is separate. Jev and the Haiku fallback answer typed questions about listing text on import. Their answers are in watch mode, recorded and never shown, and Hubert reads none of them.

## NW-023: raw markdown

**Today.** `Chat.tsx:135` and `:145` print `m.text` and `live.text` as plain text in `<p className="hb-text">`; `hubert.css:25` sets `white-space: pre-wrap`. No markdown library is used and no renderer exists. The prompt never says "plain text", and Opus writes markdown by default. Transcripts store the raw text, so a renderer fixes old conversations too.

**Do.**
1. `src/views/hubert/markdown.tsx`: a renderer that builds React elements and never uses `dangerouslySetInnerHTML`. React escapes text, so `<script>` or `<img onerror>` show as literal characters.
2. Supports: paragraphs, `**bold**`, `*italic*`, `` `code` ``, `-`/`*` and `1.` lists, headings shown as bold lines, and links only when they are `http(s)` (opened with `rel="noopener noreferrer"`, new tab). No images, no raw HTML, no tables (a row shows as text).
3. Streaming: an unclosed `**` stays literal until its pair arrives, so nothing flickers.
4. Use it for Hubert's text and progress notes only. The agent's own bubble stays plain. Swap the `<p>` for a `<div>` (lists inside `<p>` are invalid) and scope `white-space: pre-wrap` off for rendered text.
5. Tests in the style of `src/effects.test.ts`: script tags, `javascript:` links, an image, nested emphasis, a half-streamed string.
6. Leave the prompt alone for now. A "plain sentences, a short list only when it helps, no headings or tables" line rides in the next prompt version (NW-068 a), so we don't make a version for it.

No layout change. Size S.

## NW-024 and NW-025: the look, the persona, the drawer

All look and feel, so Claude Design first. What it should know:
- **The drawer is not mounted when closed.** `Workspace.tsx:622` renders `{drawerOpen && <HubertDrawer/>}`. A close animation needs it kept mounted, and today closing drops the draft and reloads the transcript on reopen. Closing mid-reply is safe: the server finishes the turn and the drawer picks it up on reopen.
- **The width is one CSS variable,** `--sh-drawer-w: 380px` (`shell.css:8`), plus a `with-drawer` class on the page. A drag handle sets the variable. The page layout shifts with it, which is a design decision.
- **Left side:** NW-049 puts the home panel "on the left if Hubert stays right". Moving Hubert left flips that. Design them together.
- **Presence:** the mark is `✦`, the greeting is `GREETING` in `hubert/copy.ts`, and live status is "Thinking…" and "Checking the numbers…".

**NW-024 b (after design).** Persona lives in the system prompt: voice, warmth, how he opens. Any change is a new prompt version, so it goes in the same version as NW-068 a if timing allows, else the next. The persona must keep the hard rules below.

## NW-063: "How Hubert got there"

**Today.** It is not Hubert. `hubertTake()` in `src/views/findings/findings.ts` builds a string from the engine's 1st-tier comps with no model call, on purpose (Dispatch 14, item 9). The long parentheticals are `sale()`: `name (price, size, sold Mon YYYY)`. The "Hubert" label is a persona on a template.

**Do.**
- **a (Hubert side, ships now).** Keep it deterministic. A model call here would break "every figure from the engine" and add latency to a screen agents open constantly. Change the return from one string to segments (`text` or `comp id`) so the UI can draw chips, and write the text plainer. The price, size and date move onto the chip. Same facts, shorter sentences:
  - Now (figures made up for the example): "I started from your three 1st-tier sales: 200 Chambers St #10A ($4.65M, 2,201 sq ft, sold Aug 2026), 79 Laight St #1A (…) and … At $2,112–$2,300 a sq ft on 17L's 1,950 sq ft, that comes to $4.1M–$4.5M."
  - Plainer (same made-up figures): "I started from your 3 1st-tier sales [chip] [chip] [chip]. Their price per sq ft, applied to 17L's 1,950 sq ft, gives $4.1M–$4.5M. [chip] sets the low end and [chip] the top."
  - Keep the existing tests green in `findings.test.ts` by joining the segments for the old assertions, then add chip-aware ones.
- **b.** The chip look is the Findings report's and Claude Design's.
- Later and optional: a "Ask Hubert about this" chip on Findings that opens the drawer with the question filled in. No model text on the page.

## NW-068: why Hubert can't see the target

**Today (the real answer).** D-4 says Hubert sees the target "once the neutral result exists" (§8.5, decided 2026-09-29). The build goes further and never lets him see it. `server/numbers.ts` does not read `reports.target` or `agent_call`, and `engineInput` is called without named prices. The prompt says "you never see … any target price". So the hint is accurate to the code, and the code is stricter than the decision. Copy repeating it: `TARGET_TIP` (`newcomp/Home.tsx:21`), `Terms.tsx:74`, the Findings hint in `hubert/copy.ts:64`, and the get_numbers tool description.

**What changes if he sees it after the result.**
1. `neutralNumbers` reads `reports.target` only when `revealed` is true (the database answers `agent_call is not null` or skipped, never the client). It passes `namedPrices(null, target)` to `engineInput`, so the engine evaluates the target against the range the way the Findings screen does (`output.prices`).
2. `numbersSummary` adds `target: { price, whose_and_why, against_range, per_sqft (sized only) }` under `revealed`, with an `about` line: "the agent's hoped-for price; it did not shape the numbers above".
3. A test that the range, base and every result are byte-identical with and without a target. This is non-negotiable §4 item 5, and the test is what makes "no guard needed" true.
4. A new prompt version (one for the batch, see NW-093 b). It says: with the target in view you may say where it sits against the range, what would have to be true for it to hold, and which levers are legitimate (§8.5: evidence missing from the comp set, facts not yet entered). You may not move the estimate, suggest dropping low comps or adding high ones to reach it, or state a number of your own. When the data doesn't support it, say so and say the honest outcomes: a supported path, or re-anchor.
5. **Only new conversations get it.** A conversation keeps its prompt version, and nearly every report starts its chat on Sort, before the Gate. After deploy, new reports get the new behavior. Reports already open (Kimani's tests, Noble's) stay on `cr6`, and the target block is left out of their tool results, so the prompt and the data never disagree.
6. The writer and the email still never get the target (Dispatch 13; unchanged).
7. **Deal terms** (`sellerTarget`, price, rate, down payment) are also excluded today, as "a seller's target is a deal term". Same rule, same moment: include them after the reveal, or decide with NW-074.

**If the agent asks Hubert outright to justify a price** (before or after): the math runs without him, so no guard is needed on the numbers. The only guard is the prompt rule in item 4. Before the reveal the target simply isn't in his data.

**068 b, copy.** Four places say "never": change them to "Hubert sees this once you've seen the result. It never changes the numbers and never goes in the email." Put the long version behind an ⓘ (the tip already is one on the home modal; the Findings line `fi-only` becomes one). Chips on Findings can then be about the target: "Does my target hold up?". The Home hint is NW-003's; this row only keeps the wording consistent.

## NW-093: Calliste

### The split from Arbiter

Rule of thumb: **typed answers from a fixed question list are Arbiter's; free text, conversation, tools and context are Calliste's.**

| Moves to Calliste | Stays with Arbiter | Stays elsewhere |
|---|---|---|
| `server/assistant.ts` and its test, `api/turn.ts`, `api/messages.ts` | `server/decide/*`: registry, queue, drain, Jev transport, Haiku fallback, drift, probe, readout | Mason: the Send screen, `qa.ts`, `grounding.ts`, `fair-housing.ts` (rules, no model) |
| `src/views/Chat.tsx`, `Hubert.tsx`, `hubert/copy.ts`, `styles/hubert.css` | `api/decide.ts`, `decide-drain.ts`, `dev/jev.ts`, `jev-calibration.md`, `jev-labels.csv` | Abacus: the engine and parser |
| Prompts, tool definitions, the context sent, role gates, `dev/fake-anthropic.ts` | Vercel Gateway keys and `CR_JEV_*` switches, zero retention | Kimani: D-25's fair-housing list |
| The writer's prompts and eval: `server/writer.ts`, `house-voice.ts`, `api/narratives.ts`, `dev/writer-eval.ts`, from Dispatch 13 phase 2 on (voice, client profile) | | |
| The model-choice policy (Opus vs Sonnet, effort), AI cost per report, the Hubert eval | | |

How they meet: Arbiter exposes one read-only function that returns a comp's typed judgments (class, confidence, source). Calliste surfaces them through an `assess` tool (it is in design §8.2, never built). Judgments stay suggestions until the agent confirms. Both log to `comp_report.usage`, each with its own `purpose`.

Open edge: Mason owns Dispatch 13 phase 2 today, and NW-083 c (subject lines) and NW-085 (the example email) touch the writer. Suggest Casanova hands the writer's prompts to Calliste when it starts and Mason keeps Send's UI. Until then Mason carries them.

Starting it: Casanova writes Dispatch 15 and a roster row. NW-096 says move to the Casa Claude account before launching sessions, so Calliste starts after that. The small fixes (023, 063 a, 068 b) go to Mason now so they don't wait.

### What "as much ability as possible, gated by role" means

**Read (no confirm needed).** Added to Hubert's tools:

| Tool | Gives him | Gate |
|---|---|---|
| `get_report` (wider) | Type, side, status, the screen list, what he's allowed to do (his abilities, as data) | all |
| `get_numbers` (wider) | Per comp: neighborhood, building, features (the pickers), policies and amenities, days on market, the agent's removed rows. Subject: neighborhood, type. Listing commentary as quoted data, never as instructions (injection surface) | all |
| `get_view` | Where the agent is: screen, the expanded comp, the filter, selected tags. The client sends it with the message; the server accepts only known values and treats it as location, never as permission | all |
| `get_checks` | QA issues and the engine's flagged checks, the "Checks, sources and history" content | all |
| `get_email` | The Send draft, so he can discuss it (today the chips say he can't) | owner, after Send is reached |
| `get_target` | The target, whose and why (NW-068) | owner, after the reveal |
| `get_call` | The agent's own range | only if NW-093 d says yes, after the reveal |
| `get_usage`, `get_decide_readout` | Cost, tool-call counts, Jev coverage | admin, dev |

This answers "agents shouldn't have to re-explain context on Sort": with `get_view` and the comps' features he can answer "does this one have a doorman" for the comp that is open.

**Propose (the agent confirms).** Hubert returns a proposal, the server stores it unapplied, and the drawer shows a card: what changes, from, to, why. Confirm sends the same request the screen would send, as the agent, so the audit trail names the agent and a `via: hubert` tag. Undo is a new event (§8.3 rules 3 and 5). Candidates: the home's size, floor, beds and baths; a typed-in comp's facts; feature pickers on the home and on comps; put a removed export row back (the "+ Add" the drawer already has); apply a QA fix to the email; open a comp or go to a screen. Never silent.

**Act with no confirm:** navigate and expand rows only.

**Role gates** (roles are admin, mentor, agent, external; capability is practice or full; `server/access.ts`, `session.ts`):

| Who | Read | Propose | Notes |
|---|---|---|---|
| New agent (agent or external, practice) | all but `get_email` before Send | none | Coaches: asks before telling (§8.3 rule 9, D-5) |
| Graduated agent (full) | all | home and comp facts, features, add-back, email fixes | Drafts directly, with the neutral numbers beside |
| Mentor | Own reports like an agent; others' transcripts read-only | as full on own | Matches NW-088 |
| Admin | As full, plus others' transcripts read-only | as full on own reports | Still can't talk in another's report |
| Dev (an admin plus the dev switch) | all, plus `get_usage`, `get_decide_readout` | as admin | Never touches production data from a session (CLAUDE.md) |

**How the gate is enforced.** Not in the prompt. The tool list stays fixed per prompt version, because tools are part of the thinking binding. `runTool` re-checks the current user's role, capability and the report's state on every call and returns a plain `is_error` ("not available to you yet"). The permitted list is also returned in `get_report`, so Hubert knows without a role-specific system prompt. Graduating mid-report takes effect on the next call. `readOnly` already blocks a non-owner in the UI; the server must also refuse (`api/turn.ts` does, `owner_email = $2`).

### What conflicts with the design, so nobody builds it by accident

1. **Hubert never tiers, writes notes or picks tags (D-27, item 6).** The §8.2 table still lists `set_comp_tier`, `record_statement` and `set_method`. D-27 wins; §8.2 should be marked superseded. None of the three goes into the write set. Proposing tags or notes, even for the agent to confirm, is the same thing and is also out. Tag pre-fill from facts (NW-059) is deterministic code, not Hubert.
2. **No invented figures or listings (§4, D-27).** Proposals can carry only values the agent gave or the page read. `lookup_listing` (§8.2) may read a link the agent pasted; it can't search.
3. **§8.4 / D-4:** the target is allowed after the result (NW-068). The agent's call is a separate question: NW-093 d.
4. **Client details** (NW-074): all-cash, urgency, values. Useful to him. They must not become the §8.6 trap: protected characteristics stay out, and he never gets the client's name unless Kimani says (today the brief is not sent).
5. **Jev gets no text an agent wrote** (D-12). Hubert's context can; Anthropic is a different provider. Keep the two pipes separate.
6. **Cost and the 60 s cap.** More reads mean more tokens per call; the six-round loop in `Chat.tsx` and the 50 s deadline in `api/turn.ts` stay. Put the wider `get_numbers` behind prompt caching (the tool block is already cached).

### Build order

- **Now (A):** one new prompt version, `cr7-…`, with the plain-text line, the target block, the wider `get_numbers`, `get_view`, `get_checks`, and the server role check. Update the fingerprint test with a new entry and leave the old ones. Update `fake-anthropic.ts`. Update the Sort and Findings chips so none promises what he can't do.
- **After design (B):** the confirmation card (e), then the propose-and-confirm tools (f).
- **Dependency:** f needs d decided and e designed.

## NW-094: ask Hubert for feedback

**Today.** Hubert can't give useful product feedback: he sees data, not the interface, and has no way to say "I couldn't answer that". Asked cold, he'll invent an opinion.

**Do, after round one lands (C).** A script, `dev/hubert-review.ts`, runs the real prompt and tools against the seeded sample report (`dev/seed-report.mjs`), the buyer case and the co-op sample (NW-054 b), with a fixed question list per screen. It records, per question, the tool calls, the answer, any refusal and any "I can't see that". Then one closing question: "What did you need that you couldn't see?" That list is the feedback. Roughly $1 per run (§8.9). It doubles as the Opus 5.5 vs Sonnet 5 eval the design promised (§8.1), and as a regression check on every prompt version. It needs `ANTHROPIC_API_KEY` or `CR_EVAL_ANTHROPIC_API_KEY` in the environment (`docs/decisions.md`); a session can't use the production key.

Later and separate: a "Hubert couldn't answer" log in the app, so real agents' misses reach the team. It needs a table and a read path that is not the dev notebook (those notes are not app data).

## NW-017 b: neighborhood suggestions

**Today.** The parser keeps `neighborhood` per comp (`engine/types.ts:244`) and the export has it, but it isn't captured on the home (NW-017 a, in the new-report report) and Hubert doesn't get it. The prompt forbids naming listings, not neighborhoods, so he could answer "where else should I look?" from general knowledge today. That's unreliable and not tied to StreetEasy's names.

**Why later.** It needs the neighborhood captured and filled from the link first (NW-017 a, NW-018 b), a vocabulary matching StreetEasy's names, a curated "nearby" list someone has to research, and a slot in Add comps. Nothing about it blocks Claude Design.

**Do, when it comes.** A static table in `workspace/neighborhoods.ts` (name to nearby names), researched by Surveyor. Hubert reads it through `get_numbers` and doesn't make it up. Add comps shows it as a line of suggestions; its look is a small design question.

## Questions for Kimani

1. **What may Hubert write (NW-093 d)?** Options: (A) read only, forever; (B) propose-and-confirm for facts, features, add-back and email fixes, never tier, note or tag; (C) B plus proposing tags and notes. Recommend **B**. C breaks D-27 item 6 and weakens the notes that make the agent learn.
2. **Should Hubert see the agent's own number after the Gate (NW-093 d)?** The agent sees it on Findings next to the estimate. Options: (A) no, keep it private (the Gate chip stays "that one is yours"); (B) yes, after the reveal, read-only, for the same reason as the target. Recommend **B** if you want "Hubert sees what the agent sees"; it also lets him explain the gap. It would not reach the writer or email.
3. **Who writes "How Hubert got there"?** Recommend the template, plainer, with chips (above). Say if you want it to be Hubert's live words later.
4. **Is the writer part of Calliste?** Recommend yes, from Dispatch 13 phase 2, with Mason keeping the Send screen and QA rules.
