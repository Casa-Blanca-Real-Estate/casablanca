# Netlify's time limits for a streamed model turn — measured (CR-1)

**Mason (Dispatch 05 §6), 2026-09-24.** Measured on this site's deploy preview
(`deploy-preview-48--casa-blanca-creative-studio`), functions in AWS us-east-1 on Node 22.23.2.
Every test ran twice: once from outside, through this sandbox's HTTPS proxy, and once from an
**observer inside Netlify** (a background function that read the stream server-to-server and wrote
a timeline to Blobs), so no client-side proxy could explain a cut. Both agreed. The probes were
temporary and are reverted (commits `01c22aa`, `740a091`, reverted in `c0fc533`).

## The limits

1. **30 seconds of silence.** A response that sends no bytes for 30 s is cut by Netlify's CDN,
   which returns a 504 page titled *"Inactivity Timeout — Too much time has passed without sending
   any data for document."* This applies:
   - to **buffered** functions (anything that returns a whole response at the end). They can't run
     past ~30 s, whatever the documented 60 s execution limit says;
   - before the **first byte of a stream**. The headers don't leave until the first body byte
     does, so a stream whose first byte is 30 s late is also a 504;
   - to a **gap inside a stream**. One byte, then 45 s of silence, is terminated at ~31 s.
2. **60 seconds, total.** Every response is terminated 60 s after the request began, **streaming
   functions and edge functions alike**, while still actively sending. Netlify's docs say edge
   functions have no wall-clock limit; here they were cut at 60.1 s like everything else.
3. **Edge-function headers must start within ~40 s.** Delaying them 45 s gave a 500 at 37.5 s.

| Test | Result |
|---|---|
| Buffered v2 function, 9 / 12 / 27 s of work | 200 |
| Buffered v2 function, 31 / 45 / 59 / 65 s of work | 504 at 30.4–31.1 s — the CDN's inactivity timeout |
| Stream, headers after 12 s | fine |
| Stream, headers after 30 s | 504 at 30.4 s |
| Stream, Response returned at once, first byte after 30 s | 504 at 30.6 s |
| Stream, first byte, then 45 s silent | terminated at ~31 s |
| Stream, one event a second for 90–120 s | terminated at 60.1 s, no final event |
| Edge function, one event a second for 180–300 s | terminated at 60.1 s |
| Edge function, headers after 45 s | 500 at 37.5 s |
| **Real Opus 5.5 turn** (effort `high`, `max_tokens` 20,000, a long tool-using prompt, heartbeat every second) | **terminated at 60.1 s mid-answer**: no `stop_reason`, no final message, nothing to store or replay |

## What a real turn looked like

Two runs of the same long turn: `message_start` at 2.9–5.1 s; then **6.7 s in one run and 30 s in
the other of thinking with no visible text** (with `display: "updates"`, reasoning streams nothing).
Text followed at **~74 output tokens/s** (~296 characters/s) until the cut at 60.1 s, with ~3,700
tokens delivered. The same answer needed ~75 s of text alone.

Without the once-a-second heartbeat, the 30 s silent thinking in the first run would have tripped
the inactivity cut before any text arrived.

## What happens at the limit

The connection just ends. The browser sees the stream stop (fetch reports `TypeError: terminated`,
curl a transfer closed mid-stream), with no error event. The model keeps generating until
Anthropic notices the disconnect, and those tokens are billed. The partial reply has no final
message: no stop reason, and no complete thinking signature. **It can't be replayed**, because
Opus 5.5 rejects assistant prefill and edited history.

## What CR-1 does about it

The streamed turn (`tools-src/comp-report/server/api/turn.ts`):

- sends a keep-alive every 10 s of silence, which defeats the 30 s rule;
- **stops the model call itself at 50 s**, records what arrived as *interrupted* and out of
  context, and tells the browser plainly. The platform never gets to drop the connection
  mid-sentence;
- runs conversational turns at effort `low` with `max_tokens` 8,192, so an ordinary turn finishes
  well inside the limit;
- keeps going if the browser disconnects, and records the finished reply for the agent to see on
  reload.

That is enough for CR-1's conversational turns. It is not enough for CR-4.

## Recommendation for CR-4

**Run each model turn in a background function, and give the browser progress over short,
reconnecting requests.**

- `POST /turn` (fast, well under 30 s): run the per-request check, record the agent's message, run
  any pending tool calls, and start `…-turn-background` with the turn id. It returns `{ turnId }`.
- **The background function** (15-minute limit, available on credit-based plans; the site
  already runs `streeteasy-import-background`): re-run the per-request check with the agent's token,
  make **one** model call, stream it, and append each delta to a `turn_events` row or blob as it
  arrives. At the end it stores the verbatim message and usage exactly as `turn.ts` does now.
  Background functions are publicly invocable, so the check has to happen inside them too.
- **The browser** reads `GET /turn/:id/events?after=<cursor>` as SSE for up to ~50 s, then
  reconnects from its cursor; plain polling every second would also work. No single request comes
  near either limit, however long the model thinks.

Why not the alternatives:

- **Edge functions**: capped at 60 s here too, and 50 ms of CPU per request.
- **Shorter turns only** (`max_tokens`, effort `low`): caps the answer, not the thinking time, and
  §8.3's heavier analysis turns will need more than a minute at `high`.
- **Continuing a cut-off turn**: impossible on Opus 5.5 (no prefill, append-only history).

This keeps §8.3 rule 6 intact: one model call per unit of work, the server owning the transcript,
and the browser just asking again.

Worth one more measurement once Kimani confirms the plan: re-run the 60 s stream on **production**.
Every test here ran on a deploy preview, and production could in principle be configured
differently.
