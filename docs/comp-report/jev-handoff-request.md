# Request: the Jev integration, packaged from MindBinder for Casa's comp report

**From Casanova (the Casa Blanca overseer session), 2026-09-29, via Kimani.** Paste this whole file
into a Claude Code session in the MindBinder repo. It asks that session to gather what Casa's comp
report needs in order to use Jev the way MindBinder does, without reading MindBinder's code or data
directly (decision D-12).

## What the comp report uses Jev for

Casa Blanca's comp report tool helps real estate agents price a home from comparable sales. It sends
Jev **typed judgments only**, never text generation. Its master design is `01-design.md` §7.1 in the
Casa repo. The judgments:

- **Comparability:** a comp's score against the subject (ordered levels), for sorting.
- **A tier suggestion:** primary, secondary or excluded, one of three.
- **Classes from listing text:** view, outdoor space, condition, service level, sale conditions (one of
  N).
- **Yes/no checks:** "is this the same floor plan?", "is this a sponsor unit?", and "does the agent use
  'carry' the way the glossary defines it?"
- **Intent:** which of three kinds of argument the agent is asking for (one of three).

The confidence decides how a judgment lands:
- **high:** applied, visibly and undoably
- **middling:** shown as a suggestion
- **low:** asked of the agent

Jev sits behind a "decision provider" interface, with Claude Haiku 4.5 (structured outputs) as the
fallback when Jev is unavailable.

## What to gather

Write one markdown file, `jev-handoff.md`, and copy the relevant code into a `code/` folder beside
it. **Leave out every secret, key, token and user or client record.** Describe where MindBinder keeps
a key, never its value.

1. **Access**
   - How MindBinder authenticates to Jev: the header, the environment variable's *name*, and the base
     URL.
   - What early access allows, rate limits, observed pricing, and the terms on data handling and
     retention, as far as MindBinder knows them.
2. **The API as MindBinder uses it**
   - Which calls (pick one of up to 255, score on ordered levels, yes/no), with the request and
     response shapes: fields, types and limits.
   - How structured state is passed alongside text.
   - What confidence and probabilities come back, and on what scale.
   - Batching, if it exists, and latency seen in practice.
3. **The client code**
   - The module(s) that call Jev: request building, parsing, timeouts, retries and backoff,
     idempotency, caching and error handling.
   - Whether there's a provider interface and a fallback. If so, how the two are kept consistent.
4. **Prompting that works**
   - How options and levels are worded.
   - How much context goes in, and how many options are too many.
   - A few representative examples, redacted: what went in, and what came back.
5. **Confidence in practice**
   - What thresholds MindBinder uses, and how it chose them.
   - Whether the confidence proved calibrated, and any calibration it does.
6. **Tests:** fixtures, mocks, or a fake Jev server, if there are any.
7. **Gotchas**
   - Failure modes, outages, model or version changes, and anything surprising.
   - What MindBinder would do differently if it started again.

## Where it goes

Kimani commits the result to the Casa repo at `docs/comp-report/sources/jev/`. It's private there:
`docs/` is never served.
