# The agent CMS — Dispatch 03, Slice 4

Where agent site content gets created, AI-assisted, reviewed and published, so that changing an
agent's page doesn't mean hand-editing JSON.

| | |
|---|---|
| **The tool** | [`tools/agent-cms/index.html`](../../tools/agent-cms/index.html) — single file, no build step |
| **The store** | [`netlify/functions/agent-store.mjs`](../../netlify/functions/agent-store.mjs) |
| **AI autofill** | [`netlify/functions/agent-copy.mjs`](../../netlify/functions/agent-copy.mjs) — Haiku, four fixed tasks |
| **Brief** | [`docs/dispatch/03-agent-cms.md`](../dispatch/03-agent-cms.md) |
| **Verification** | [`tools/agent-cms/verify.spec.mjs`](../../tools/agent-cms/verify.spec.mjs) — 68 browser checks; adds no dependency |

**Two decisions this slice deliberately did not make quietly:**

- **[`storage-decision.md`](storage-decision.md)** — Netlify Blobs vs. git as the source of truth,
  with the tradeoffs on history, review-before-publish, auth surface and rollback. Built on Blobs
  behind a four-function seam; Casanova and Kimani pick. Also carries the esbuild /
  `@netlify/blobs` contradiction — **resolved 2026-09-28 (D-15):** the rule was wrong and the
  `agent-store` override it produced was removed; see `../comp-report/cr1-esbuild-blobs.md`.
- **[`security-model.md`](security-model.md)** — what the shared-secret write gate covers and
  what it does not, plus a pre-existing finding: `claude.mjs` is an unauthenticated open proxy to
  the Anthropic API.

---

## How it works, in one pass

**Two views.** A **roster** — every agent, status, custom domain, last edited, and the Suspend
action that takes a site down. And a **scoped agent view** whose sections are the public site's
own sections in the site's own order (Hero → About → Team → Deals → Client stories → Drop me a
note → Buyer's guide → Search listing → Delivery), each labelled with the page it appears on, so
editing a field feels like editing the page.

**Draft → preview → live.** Each record holds a `draft` the CMS edits and a `live` snapshot the
build renders. Editing a live agent changes nothing public until Publish. Publishing copies draft
over live, flips `status`, and POSTs the Netlify build hook — and says plainly when no hook is
configured rather than implying a build that never ran. Suspending flips `status` and keeps
`live`, so restoring republishes the same page instead of an empty one.

**Preview links.** Each agent carries a random, rotatable `previewToken`. A link
(`#/preview/<slug>?t=…`) reads that one agent's draft, read-only, with no CMS token — safe to
send the agent. The token rides in the URL fragment, which browsers never send to a server.

**AI is always a draft.** Four tasks (bio from notes or a transcript, SEO title and description,
specialties from the bio, testimonial cleanup). Generated fields are badged **AI draft** until a
human edits them or marks them reviewed, then **AI · edited**. Publishing with unreviewed drafts
warns and names them. The prompts refuse to invent credentials, sales figures, licence numbers or
biography, and return a list of what they left out, which the UI shows under the field.

**Empty stays empty.** A blank stat is `null`, never `0` — "0 years in NYC" is a false claim about
a real person, and both the store and the form are written to make it impossible.

---

## Running it

```
CB_CMS_TOKEN=$(openssl rand -hex 32)   # required; without it both functions 503
NETLIFY_BUILD_HOOK=https://api.netlify.com/build_hooks/…   # optional
ANTHROPIC_API_KEY=…                    # required for autofill
```

The CMS prompts for the token on load and holds it in `sessionStorage` for that tab only.
The functions only run on Netlify — opening the file locally gets an honest "backend
unreachable", not a hang.

To exercise the tool without a backend (a real browser against an in-memory stand-in for
`agent-store`), with a `playwright` available on the machine:

```
npx http-server -p 8099 -s .          # from the repo root
node tools/agent-cms/verify.spec.mjs
```

It is deliberately outside `package.json` — Netlify installs from that file, so a dev
dependency there would ship to production.

## Known limits

- **Schema ownership is Dispatch 02's.** 02 had not landed when this was built, so the field list
  is its draft (02 §1 + `agent-site-template.md` §1), mirrored in both the tool and the store.
  Reconcile all three against `agents/SCHEMA.md` when 02 ships.
- **The build side is 02's too.** This writes records; making `build.js` read them (and honour
  `status`) is that slice. The contract is in `storage-decision.md` §4.
- **`build.js` does not HTML-escape yet.** The store strips `<`/`>` from text and rejects
  non-`http`/`mailto`/`tel` URLs as a second line of defence, but **do not enable publishing
  against an unescaped build** — see `security-model.md` §5.
- **The preview is a content preview**, not the finished design. The visual port off Wix is
  Slices 2–3; the preview banner says so rather than implying otherwise.
- **One editor.** No per-agent auth, no audit trail. Slice 6.
