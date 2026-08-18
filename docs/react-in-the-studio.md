# React in the Creative Studio — can we, should we, and what it costs

A working spike is on this branch. `npm install && npm run build` compiles it; it deploys
at `/tools/react-demo/` next to the hand-written tools, which were not modified.

---

## 1. First, a correction

`docs/motion-stories.md` said Remotion was out because "it's React, needs a build step."
That sentence conflated two unrelated things and the React half of it was wrong.

**React is not incompatible with static HTML.** A React app compiles *to* HTML, CSS and
JS — the output is a static site. The studio can host React tools and hand-written ones
side by side, on the same origin, sharing the same `/assets`, the same fonts, the same
Netlify functions. That's what the spike demonstrates.

What was actually true about Remotion was something else entirely, and it has changed
since — see below.

---

## 2. Remotion: the objection wasn't React, and the tech objection is now stale

When I wrote that note, rendering a Remotion video meant headless Chrome plus FFmpeg on a
server, via their CLI or paid Lambda service. That is no longer the only option:
Remotion now ships [`@remotion/web-renderer`](https://www.remotion.dev/docs/web-renderer/),
which renders **client-side, in the browser, encoding with WebCodecs via Mediabunny.**

Mediabunny is the library the story builder already uses. So Remotion's modern renderer
and our exporter are the same engine — Remotion wraps it in a React component model.

Which leaves the real reason not to adopt it, and it isn't technical:

### The license

[Remotion is free for individuals, non-profits, and for-profit companies with **up to 3
employees**](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md). Past that a
paid company license is required — triggered by *company headcount*, not by how many
people write the code. Casa Blanca has 112 agents in the studio's own library.

Two tiers would apply:

| Tier | Price | Applies when |
|---|---|---|
| [Creators](https://www.remotion.dev/docs/license/pricing) | $25/seat/month | Low-volume videos a team makes for itself, no automation |
| [Automators](https://www.remotion.dev/docs/license/pricing) | $0.01/render, **$100/month minimum** | Building a video tool others use — editors, prompt-to-video, automated pipelines |

A tool where agents generate their own stories is squarely the second one. Renders
produced for internal tooling and internal workflows are chargeable. That's a **floor of
$1,200/year**, forever, to wrap a library we currently call directly for free.

**Recommendation: don't adopt Remotion.** Not because of React, and not because of its
architecture — both are fine now — but because we'd be paying a recurring license for a
convenience layer over an engine we already use. Worth revisiting only if we ever want
their ecosystem badly enough to justify the line item.

### HyperFrames

[HeyGen's HyperFrames](https://github.com/heygen-com/hyperframes) is Apache-2.0 with no
per-render fees or commercial thresholds, so the licensing objection doesn't apply. But it
renders through a CLI driving headless Chrome — a build-and-render pipeline, not a thing
an agent clicks in a browser. It's aimed at AI agents authoring video compositions, which
is a different job than the one this tool does. Genuinely interesting if we ever want
Claude to *compose* videos end-to-end rather than fill in a template. Not the shape of
today's problem.

---

## 3. The real question: should React be an option here?

**Yes — for some tools.** The argument isn't about video at all, it's about what the
existing code costs to maintain.

`tools/incontract-carousel/index.html` is **3,633 lines** with **235** `getElementById` /
`querySelector` calls and a hand-written `syncForm()` whose entire job is pushing state
into the DOM by hand. Alongside it: `syncDZ`, `syncCoverPanel`, `updateStripLabel`,
`updateDlBtn`, `updateCharCount`, `updateCaptionChar`, `renderLibQueue`. Every one of
those exists because nothing else keeps the screen and the data in agreement, and every
one is a place to forget a call and ship a stale panel.

That is precisely the problem React was built to delete. In the spike, the canvas is a
`useEffect` over the state it reads. There is no sync function, and no way to forget one.

The other recurring tax is duplication: eleven tools each carry their own copy of the same
brand tokens, the same `.btn`, the same dropzone CSS, the same agent-library fetch. A
build step makes those imports instead of copies.

### Where React earns its keep

- New tools with heavy interacting state — anything shaped like the carousel builders
- A shared component library (dropzone, agent picker, canvas stage, brand chrome)
- Anything we'd want to test

### Where it does not

- `tools/brand/`, `tools/watermarker/`, the business-card page — small, mostly static
- Anything where "open one HTML file, edit, done" is the actual feature

---

## 4. What the spike does

`tools-src/react-demo/` — React 19 + Vite 8, ~200 lines. Deliberately touches every seam
that could have been a problem:

| Seam | Result |
|---|---|
| Shares studio chrome (`studio-header.js`) | ✅ "‹ Studio" and Feedback inject normally |
| Reads the real agent library | ✅ 112 agents from `/assets/agents/agents.json` |
| Brand fonts (ObjectSans) | ✅ loaded by absolute path |
| Calls a Netlify function | ✅ `/.netlify/functions/img`, same origin |
| Canvas render + PNG export | ✅ same pattern as every studio tool |
| Lives at a normal tool URL | ✅ `/tools/react-demo/` |
| Leaves hand-written tools alone | ✅ verified — `/tools/story/` and `/` unchanged, no errors |

### How the build is wired

```
tools-src/<name>/     ← React source (only these get compiled)
tools/<name>/         ← build output, gitignored
tools/*/index.html    ← hand-written tools, committed, never touched by Vite
```

`vite.config.js` lists exactly which tools compile. Everything else is invisible to it.
`netlify.toml` gains `command = "npm run build"`. `publish = "."` is unchanged, so the
site is still "the repo."

---

## 5. What it costs — the honest part

**1. A broken build breaks the whole deploy.** Today there is no build command, so a typo
in one tool breaks that tool and nothing else. With a build step, a bad import in the
React tool fails the deploy and *the entire site goes stale*. This is the single real
regression and it should drive the decision. Mitigations: keep the React surface small,
watch deploy previews, and remember the last good deploy stays live rather than the site
going down.

**2. Editing stops being trivial.** A hand-written tool is: open file, edit, commit. A
React tool is: `npm install`, `npm run dev`, edit, build. That's normal for developers and
a real barrier for anyone else.

**3. GitHub Pages drifts.** The repo has `.nojekyll` and a backend shim for running off
GitHub Pages. Pages doesn't run builds, so React tools would 404 there unless we commit
the output or add an Action. Netlify stays canonical either way.

**4. Page weight.** 196 KB raw / 62 KB gzipped for React + the tool. Fine over a network,
but it's not the zero-dependency page a hand-written tool is.

**5. Two idioms in one repo.** Some tools vanilla, some React. Needs a rule about which is
which or it becomes whatever the last person felt like.

---

## 6. Recommendation

**Adopt React as an option, not as a migration.**

1. Keep every existing tool exactly as it is. There is no payoff in rewriting working code.
2. Use React for the *next* tool that's shaped like a carousel builder — heavy state, lots
   of panels — and for a shared component library if one earns its place.
3. Keep small/static tools hand-written. The single-file property is genuinely valuable.
4. Don't adopt Remotion. Wrong price for a layer over an engine we already have.
5. Revisit HyperFrames only if the goal becomes Claude composing videos, not agents
   filling in templates.

The spike is deliberately disposable. Deleting `tools-src/`, `vite.config.js`, the two
`package.json` scripts and the `netlify.toml` command returns the repo exactly to where it
was — which is the point of testing it this way.

### To try it

```bash
npm install
npm run build
npx http-server . -p 8080 -c-1
# /tools/react-demo/  → the React tool
# /tools/story/       → hand-written, untouched
```

Or merge the branch and look at the Netlify deploy preview, which exercises the real build
and the real functions.
