# Dispatch 03 — Agent sites, Slice 4: the CMS

**Owner:** a dedicated session. **Dispatched by:** Casanova · 2026-09-14.
**PRs to `claude/main`. Casanova reviews and merges — don't self-merge.**
**Read first:** `/CLAUDE.md`, `docs/context/casa-blanca.md`, `docs/design/README.md` and
`docs/design/surfaces/01-dashboard.md` (the shipped design reference), and
`docs/context/agent-site-template.md`.

**Depends on Dispatch 02** for the schema. Coordinate: if 02 hasn't landed, build against its
draft schema and expect to adjust. Don't redefine the schema yourself — one owner for that.

## Why this exists

Agent sites are built from one JSON file per agent (Dispatch 02). Editing JSON by hand doesn't
scale past Kimani, and he's the only person who can currently change anything. The CMS is the
surface where agent content gets created, AI-assisted, reviewed, and published.

**This slice needs none of the Wix design work.** It's a Casa Blanca *tool* surface, in the house
design system — not a port of the agent site's public design. That's why it can run in parallel
with the template capture.

## Scale

**~20 agents by end of year.** Build for 20. No pagination, no virtualised lists, no search
infrastructure. A roster that reads well at 20 rows is the target.

## Scope

### 1. Two views

- **Roster** — every agent, their `status` (`draft` / `live` / `suspended` / `archived`), custom
  domain if set, and when they were last edited. Departed agents get suspended here, which is how
  a site comes down.
- **Scoped agent view** — the editing form for one agent. **Kimani's framing: this is a
  simplified version of the agent's public site**, not a bare form — the current prototype's
  layout is roughly the right shape for it. Fields grouped the way the real pages are grouped, so
  editing feels like editing the page.

Follow the house design system: the dashboard (`index.html`, redesigned 2026-08-28) carries the
token vocabulary, the Day/Night pair and the primitives — row, badge, media rail, utility card,
theme switch. **Adopt those names rather than inventing a parallel set.** Single-file HTML, no
build pipeline, no frameworks.

### 2. Storage — bring Casanova a recommendation before building

The agent JSON has to live somewhere the CMS can write and the build can read. At least two
plausible shapes:

- **Netlify Blobs as the live store**, build reads from blobs, periodic export to git for history.
- **Git as the source of truth**, CMS commits through the GitHub API.

Each has real tradeoffs (version history, review-before-publish, auth surface, how a rollback
works). **Don't pick silently — write up both with the tradeoffs and let Casanova and Kimani
choose.** Note the hard constraint either way: **no esbuild bundling for functions that use
`@netlify/blobs`**, and `node_modules` ships in the zip.

### 3. Security — read this before writing the function

The dashboard's existing sign-in is an allowlist of approved emails checked in the browser and
kept in `localStorage` (`ALLOWED` in `index.html`). **That is a dev affordance, not
authentication.** It's fine for hiding a tool card. It is *not* fine as the only thing standing in
front of an endpoint that writes site content.

So: the write path needs server-side protection — at minimum a shared secret the function checks,
scoped so a leaked front-end can't rewrite arbitrary agents. Real per-agent auth is Slice 6.
**Say plainly in the PR what the security model is and what it doesn't cover.** Don't let a
front-end check imply a guarantee it can't make. If the right answer is "this endpoint can't be
safely exposed yet, here's what it needs," that's a legitimate finding — bring it.

### 4. AI autofill

Use the existing pattern in `netlify/functions/claude.mjs` (Anthropic API, Haiku) — the carousel
tools already do this. Useful fields:

- Bio, drafted from Kimani's notes or a spotlight transcript
- SEO title and meta description from the bio
- Specialties inferred from the bio
- Cleanup passes on imported testimonial text

Rules: **every generated field is a draft the human edits — nothing auto-publishes.** Show
generated vs. edited state. Follow house voice: normal capitalization and punctuation, *not*
casual lowercase (see the `cb-copy` skill and `casa-blanca.md` §6). Agent bios are published claims
about real people's careers — **never invent credentials, sales figures, licence numbers, or
biography.** Leave a field empty rather than guessing, and say so in the UI.

### 5. Publish flow

`draft` → preview → `live`, and publishing triggers a build. A preview an agent or Kimani can look
at before it goes public is the point of the whole slice. Suspending an agent takes the site down
per Dispatch 02.

## Definition of done

Kimani can create an agent, fill the fields with AI help, preview, publish, and later suspend —
without touching JSON. The roster reads well at 20 agents. The security model is written down and
honest.

## Non-goals

- **No agent-facing editing.** That's Slice 6, gated on this existing and on agents actually
  engaging with a review link. Don't build multi-tenant auth on spec.
- No Google review ingestion (Slice 5) — but the schema's testimonial `source` field should
  already display imported entries correctly.
- No public-site design work.

## Working agreement

Kimani works Casa in blocks, 3 days a week — don't block on him mid-slice. Direct execution over
walkthroughs, steak over sizzle. If a piece is the wrong shape once you're in it, say so in the PR
with what you'd do instead.
