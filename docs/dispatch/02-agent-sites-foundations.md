# Dispatch 02 — Agent sites, Slice 0: data model + build hardening

**Owner:** a dedicated session. **Dispatched by:** Casanova · 2026-09-14.
**PRs to `claude/main`. Casanova reviews and merges — don't self-merge.**
**Read first:** `/CLAUDE.md`, `docs/context/casa-blanca.md`,
`docs/context/agent-site-template.md` (what the Wix template contains and what's broken today).

## Why this exists

Casa Blanca is moving individual agent sites off a Wix Studio template onto the `agents/`
pipeline in this repo, so that one template edit propagates to every agent site. The pipeline
already exists in embryo — `template.html` + `data/*.json` + `build.js` → `<slug>/index.html` —
and the *shape* is right. Everything else about it is a stale prototype.

**This slice is the plumbing only. It needs none of the Wix design work**, which is why it goes
first: Kimani is capturing the template in parallel. Your output still renders on the existing
generic design and will still look wrong. That is expected and fine. Do not start the visual port.

## Scale and lifecycle — design for these, they're decided

- **~20 agents by end of year, not 200.** Don't build for 200. No pagination, no sharding, no
  multi-tenant infrastructure. Simple and correct at 20; we revisit when it's 20.
- **Each agent buys and owns their own domain.** Casa Blanca does not purchase domains — owning
  the domain of someone who may leave is pointless.
- **When an agent leaves, their site comes down.** So lifecycle state is a first-class field, not
  an afterthought, and the build has to honour it.
- **Never block a launch on an agent doing something.** Agents are notoriously unresponsive (see
  `casa-blanca.md` §6) and pointing DNS is exactly the kind of task that stalls for weeks. So
  every site must be live and shareable on a Casa-Blanca-controlled URL **first**, with the custom
  domain as an optional later swap. A site that only works once the agent configures DNS is a
  broken design.

## Scope

### 1. The data model — the main deliverable

Rewrite the per-agent JSON schema. The current one (`agents/data/*.json`) is missing most of what
the real template needs. Read §1 of `agent-site-template.md` for the field list that fell out of
the live site, and cover at least:

- **Identity** — name, slug, preferred/display name, title, **licence number** (`Lic. #:` appears
  on every page of the real template)
- **Contact** — phone, email, Instagram, LinkedIn, StreetEasy
- **Content** — bio, neighborhoods, languages, specialties, stats, testimonials, team members
- **Past deals** — address, unit, square footage, price; the Deals page is the most genuinely
  per-agent content on the site and matters for SEO
- **Assets** — hero photo, alt text, the buyer's-guide PDF reference
- **SEO** — page title, meta description, OG image, canonical
- **Delivery** — custom domain (optional), the Casa-Blanca-controlled URL, and **`status`:
  `draft` / `live` / `suspended` / `archived`**

Testimonials need a `source` field (`google` / `manual`) and a date now, even though Google review
ingestion lands in a later slice — so the shape doesn't have to change again.

Document the schema. A commented example file or a short `agents/SCHEMA.md`, your call.

### 2. Build hardening

- **HTML-escape every interpolated value.** Today an `&` or `<` in a bio breaks the page or
  injects markup. This is the one outright bug in `build.js`.
- **Validate and fail loudly.** Required fields present, slugs unique, phone/email well-formed,
  referenced images actually exist. A build that silently emits a broken page is how the current
  prototype shipped with a footer full of raw bullet lists.
- **Honour `status`.** Only `live` agents build and appear in the directory. Decide and implement
  what a departed agent's URL returns — a 410 or a redirect to the directory beats a dangling page.
- **Build on deploy.** `netlify.toml` currently has `publish = "."` and no build command. Adding
  one changes the deploy path for the whole site, so **verify every existing tool still deploys
  and still works** — the tools are in daily use and matter more than this slice. If it looks like
  it can't be done safely, stop and bring it to Casanova rather than risking the tools.
- Turn on deploy previews if they aren't already.

### 3. Fix the two asset defects

- **Fonts.** `template.html` requests `assets/fonts/ObjectSans-*.woff2`; only `.otf` exists, so
  pages silently fall back to DM Sans from Google Fonts. Convert to `.woff2`, self-host, drop the
  Google Fonts link. **Note on the constraint:** `CLAUDE.md` says the brand font is "embedded,
  never linked externally" — that rule exists to stop third-party CDN font links, and it's written
  for single-file tools. For a multi-page site, self-hosted `.woff2` files referenced by relative
  path are the correct reading. **Do not base64 a webfont into every page.** Confirm with Casanova
  if that reading seems wrong.
- **Photos.** `build.js` computes a photo path and then never uses it, so every agent renders as
  initials on a gradient, and `agents/photos/` doesn't exist. Wire it up, with initials as the
  documented fallback when an agent hasn't supplied a photo — which, per the agent-responsiveness
  rule, will be the common case.

### 4. Real content, and delete the fake

`agents/data/` holds five fictional agents (Claire Dubois, David Kim, Isabel Santos, Marcus
Johnson, Sofia Ramirez) whose pages claim Casa Blanca has served NYC "since 2006" — the company
was founded February 2019. **Delete them.** They are a liability if ever deployed publicly.

Replace with **Sam Valk** as the single real fixture. From the live template site:
phone `401-440-3132`, `s.valk@casa-blanca.com`, `Lic. #: 10401379863`, past deals
`54 West 16th St, 4E — $1,280,000` and `23 West 73rd St, #706A — $930,000`. Ask Kimani for the
bio, photo, and anything else the schema wants — don't invent biography.

`agents/index.html` (527 lines) is a directory page listing the fictional agents. It needs to
follow the same data, not hardcode names.

## Definition of done

`node agents/build.js` (or the deploy) produces one Sam Valk page from a documented schema, with
correct fonts, a real photo, escaped output, validation that fails on bad input, and `status`
honoured — and every existing tool still deploys and works. The page still looks like the old
generic design. Good.

## Non-goals

No design work. No new pages. No CMS. No form wiring. No SEO output beyond carrying the fields in
the schema. Those are Slices 2–5.

## Working agreement

Kimani works Casa in blocks, 3 days a week, across several tracks — don't block on him mid-slice;
bank the work and open the PR. He prefers direct execution over walkthroughs and steak over sizzle.
If a piece of this turns out to be the wrong shape once you're in the code, say so in the PR with
what you'd do instead.
