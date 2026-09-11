# Generative outpaint — provider comparison

**For:** Casanova → Kimani (Kimani picks and adds the key).
**From:** the dispatch-01 session · prices checked against live provider pages **2026-09-11**.
**Context:** [dispatch 01](01-profile-pic-cutout-and-outpaint.md) Phase 5. Phase 4 shipped the
offline PatchMatch extension; it holds up on plain dark garments and flags itself when the
fabric is patterned. This is the paid path for everything it flags.

---

## What the job actually is

Not general outpainting. The tool has a cut-out subject on flat brand colour, knows exactly
how many pixels of body the frame is short, and has a region mask the operator has already
drawn and can redraw. Everything below the round wordmark (`0.8065 × size`) or the square
one (`0.963`) is covered in the output anyway.

So the bar is: **plausible clothing in a known region, without touching the agent's face.**
That second half is what separates the options.

---

## The options

| | Mask? | Price / image at our size | Latency (vendor) | Output ≥1080px | Notes |
|---|---|---|---|---|---|
| **FLUX.1 Fill [pro]** (BFL direct) | **Explicit** | **$0.05** | seconds | yes, billed by MP | Built for inpaint/outpaint with a supplied mask |
| **FLUX.2 [pro]** editing (BFL) | Explicit | from **$0.045/MP** | seconds | yes | Newer; edit pricing is per-MP, input MP billed too |
| **FLUX.2 [klein] 4B** (BFL) | Explicit | from **$0.014** | seconds | yes | Cheapest credible mask option |
| **Nano Banana 2** `gemini-3.1-flash-image` | **No** — semantic only | **$0.067** (1K) · **$0.101** (2K) · $0.151 (4K); **batch is half** | ~2–4s | 1K is 1024², so **2K for a 1080 frame** | SynthID watermark on every output |
| **Nano Banana 2 Lite** `gemini-3.1-flash-lite-image` | No | **$0.0336** (1K only) | ~4s | 1K only — under 1080 | Cheapest per call, but the resolution cap bites |
| **Nano Banana Pro** `gemini-3-pro-image` | No | $0.134 (1K/2K) · $0.24 (4K) | slower | yes | The quality tier |
| **Stability** inpaint / outpaint | **Explicit** | **$0.05** (5 credits @ $0.01) | seconds | ~1MP | Has a dedicated outpaint endpoint taking pixel margins |
| **fal**-hosted FLUX.1 [pro] Fill | Explicit | **$0.05 / megapixel**, rounded up | seconds | yes | Same model, hosted; convenient, no cheaper |
| **fal**-hosted Nano Banana 2 edit | No | **$0.08** base · ×1.5 at 2K = **$0.12** | ~seconds | yes | Above Google's own price |
| **Replicate** | Per model | FLUX 1.1 Pro $0.04 / output image | varies | yes | Fill Pro price is on the model page, not the pricing page |

**A batch of 20 agents, one call each:** FLUX.1 Fill $1.00 · Stability $1.00 · FLUX.2 klein
$0.28 · Nano Banana 2 at 2K $2.02 ($1.01 on the batch API) · fal-hosted NB2 at 2K $2.40.

---

## The thing that decides it: the mask

**Gemini has no mask parameter.** Editing is semantic — you describe what to change ("extend
the jacket downward, keep everything else identical") and the model decides what to touch. It
re-renders the whole image. For a headshot tool that is a real risk: the output is the agent's
face, and a model that subtly redraws it produces a photo of *almost* that person. We can
composite only the fill region back ourselves and throw the rest away, which contains the
damage — but we are then paying a premium for a model that spent most of its effort on pixels
we discard, and we still have no guarantee the region it generated is consistent with a face
it quietly altered.

**FLUX Fill and Stability take an explicit mask.** The region the operator drew in Phase 4 goes
straight to the model. Everything outside it is ours, unchanged, by construction.

Two more Gemini-specific facts worth knowing before picking it: every output carries a
**SynthID watermark** (invisible, but it is in a brand asset), and the 1K tier is 1024² —
*under* our 1080 frame — so the honest comparison is its 2K tier at $0.101, not the $0.067
headline.

---

## Recommendation

**Default to FLUX.1 Fill [pro], direct from BFL.** Cheapest of the mask-capable options at our
size, built for exactly this operation, and the mask guarantees the agent's face is untouched.
$1.00 for a 20-agent batch.

**Worth a bake-off against Nano Banana 2** once there is budget for one: it is the strongest
general image model in the list and Kimani's instinct to start there is reasonable. The catch
is structural, not about quality — no mask, a watermark, and 2K pricing to clear 1080.

**Watch FLUX.2 [klein] 4B** at $0.014. If its fills are good enough, a 20-agent batch costs 28
cents.

### What I could not test

I did not sign up for anything, so **no torso-quality numbers here are mine** — the table is
documented capability and live pricing, not a bake-off. Whoever adds the first key should run
the same five portraits through it and compare against Phase 4's output, using the
texture-ratio number the extension already reports as the yardstick.

The function shipped alongside this doc is provider-agnostic: adding a second key and flipping
`OUTPAINT_PROVIDER` is the whole cost of changing the answer.

---

## Sources

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) · [image generation docs](https://ai.google.dev/gemini-api/docs/image-generation) (mask, resolutions, SynthID)
- [Black Forest Labs pricing](https://docs.bfl.ml/quick_start/pricing) · [bfl.ai/pricing](https://bfl.ai/pricing)
- [fal · FLUX.1 [pro] Fill](https://fal.ai/models/fal-ai/flux-pro/v1/fill) · [fal · Nano Banana 2](https://fal.ai/models/fal-ai/nano-banana-2)
- [Stability developer platform pricing](https://platform.stability.ai/pricing)
- [Replicate pricing](https://replicate.com/pricing)
