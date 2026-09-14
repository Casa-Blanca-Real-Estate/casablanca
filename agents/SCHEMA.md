# Agent site data model

One JSON file per agent in `agents/data/`, named `<slug>.json`. The build reads them,
validates them, and writes `agents/<slug>/index.html`, `agents/index.html` and the generated
block in `/_redirects`.

```
agents/data/sam-valk.json  ─┐
agents/template.html        ├─ node agents/build.js ─→  agents/sam-valk/index.html
agents/directory.template.html                      ─→  agents/index.html
agents/site.json           ─┘                       ─→  /_redirects
```

```sh
node agents/build.js          # build
node agents/build.js --check  # validate only, write nothing
node --test agents/build.test.js
```

The build also runs on every Netlify deploy (`netlify.toml` → `[build] command`). **A validation
failure fails the whole deploy**, tools included — which is why `.github/workflows/agents-build.yml`
runs `--check` and the tests on every PR that touches `agents/`.

### Two hosts, one of which never runs the build

The repo is served from **Netlify** (`casa-blanca-creative-studio.netlify.app`, which runs the
build) **and from GitHub Pages** (`kjcamron.github.io/casablanca/`, which serves the repo as-is
and runs nothing). So:

- **Generated output is committed**, and the CI check asserts a fresh build reproduces it byte for
  byte. Commit `agents/<slug>/index.html`, `agents/index.html` and `_redirects` with the data
  change that caused them, or Pages serves stale pages.
- **`_redirects` is Netlify-only.** On Pages a `suspended` or `archived` agent's URL 404s instead
  of redirecting. The page still comes down either way, which is the part that matters.

---

## Scale this is designed for

~20 agent sites, not 200. No pagination, no sharding, no per-agent infrastructure. If that
assumption changes, this file is the place to revisit.

---

## Fields

Required fields are marked **required**. Everything else may be `null`, omitted, or an empty
array; the template drops the block it belongs to rather than rendering an empty one. Nothing is
invented at build time — a missing bio means no bio section, not filler.

### `identity`  — required

| Field | | Notes |
|---|---|---|
| `name` | **required** | Full legal/professional name. |
| `slug` | **required** | Lowercase, digits, single hyphens. **Must equal the filename** — that is what makes slugs unique; the build rejects a mismatch. Changing it changes the public URL. |
| `title` | **required** | e.g. `Licensed Real Estate Agent`. |
| `licenseNumber` | **required** | 6–12 digits. Rendered as `Lic. #:` in the hero and the footer, on every page. |
| `displayName` | | First-name form used in headings and CTAs. Defaults to the first word of `name`. |
| `licenseState` | | Two-letter code, e.g. `NY`. |

### `contact` — required

| Field | | Notes |
|---|---|---|
| `email` | **required** | |
| `phone` | **required** | Any human format; must resolve to 10 US digits. The `tel:` href is normalised to `+1…`, the display keeps what you typed. |
| `instagram` | | Full `https://instagram.com/…` URL. Rejected if it points elsewhere. |
| `linkedin` | | Full `https://linkedin.com/…` URL. |
| `streeteasy` | | Full `https://streeteasy.com/…` URL. |

### `profile`

| Field | Notes |
|---|---|
| `bio` | Plain text. Blank lines split it into paragraphs. Escaped on output — an `&` or a `<` is safe. |
| `neighborhoods` | Array of strings. Also drives the directory's filter buttons (a neighborhood needs two agents before it earns one). |
| `languages` | Array of strings. |
| `specialties` | Array of strings. |
| `acceptingClients` | `true` shows the "Available for new clients" badge. Omit rather than guess. |
| `stats` | `{ closedDeals, yearsExperience, avgDaysOnMarket, satisfactionRate }`, all optional positive integers. Only the ones present render. |
| `team` | Array of `{ name, role, email?, phone?, photo? }`. `name` and `role` required. |
| `testimonials` | See below. |

#### `profile.testimonials[]`

| Field | | Notes |
|---|---|---|
| `quote` | **required** | ≤1200 chars. |
| `author` | **required** | |
| `source` | **required** | `manual` or `google`. |
| `date` | **required** | `YYYY-MM-DD`, and a real calendar date. |
| `detail` | | e.g. `Buyer · SoHo`. |
| `rating` | | 1–5. |
| `sourceUrl` | | The review's own URL. Warned about when `source` is `google`. |

`source`, `date`, `rating` and `sourceUrl` exist now so that Google review ingestion (a later
slice) can write into this shape without reshaping it.

### `deals[]`

The most genuinely per-agent content on the site.

| Field | | Notes |
|---|---|---|
| `address` | **required** | Street address without the unit. |
| `unit` | | As written on the listing, e.g. `4E`, `#706A`. |
| `price` | | Whole dollars, integer. Formatted as `$1,280,000`. |
| `squareFeet` | | Integer. |
| `neighborhood` | | |
| `side` | | `buyer` / `seller` / `both`. |
| `closedOn` | | `YYYY-MM-DD`. |

### `assets`

| Field | Notes |
|---|---|
| `photo` | Filename in `agents/photos/`. The file **must exist** or the build fails. Omit it and the page renders the agent's initials on a gradient — see *Photos* below. |
| `photoAlt` | **Required whenever `photo` is set.** |
| `photoColor` | Two `#rrggbb` values; the gradient behind the initials. Defaults to a neutral pair. |
| `buyersGuidePdf` | Filename in `agents/guides/`. Must exist. Carried in the schema; the viewer lands in a later slice. |

### `seo`

| Field | Notes |
|---|---|
| `pageTitle` | ≤70 chars. Defaults to `<name> — Casa Blanca Real Estate`. |
| `metaDescription` | ≤200 chars. Defaults to name, title and neighborhoods. |
| `ogImage` | Filename in `agents/photos/`. Defaults to `assets.photo`. |
| `canonicalUrl` | Overrides the canonical entirely. You rarely want this — see `delivery.canonical`. |
| `noindex` | `true` emits `noindex, nofollow`. Use it while a site is live but not ready to be found. |

### `delivery` — required

Where the site is reachable, and whether it is.

| Field | | Notes |
|---|---|---|
| `status` | **required** | `draft` / `live` / `suspended` / `archived`. See below. |
| `customDomain` | | Bare hostname the agent owns, e.g. `samvalk.com` — no scheme, no path. |
| `canonical` | | `cb` (default) or `custom`. |
| `launchedOn`, `archivedOn` | | `YYYY-MM-DD`. |

**The Casa Blanca URL is not a field.** It is always `<origin>/agents/<slug>/`, derived from
`agents/site.json`. A site is therefore live and shareable the moment its JSON says `live` —
nothing waits on an agent pointing DNS, which is exactly the kind of task that stalls for weeks.

The custom domain is a later, optional swap: the agent buys and owns it, points it at the site,
and only then does `canonical` flip to `custom`. Setting `canonical: "custom"` without a
`customDomain` is rejected — a site is never canonical at a domain that does not exist yet.

---

## `status`, and what a URL returns

| `status` | Page | Directory | `/agents/<slug>/` returns |
|---|---|---|---|
| `draft` | not built | no | 404 — it has never been public |
| `live` | built | yes | the page |
| `suspended` | removed | no | **302** to `/agents/` |
| `archived` | removed | no | **301** to `/agents/` |

When an agent leaves, flip `status` to `archived`. The next build deletes the page and writes the
301. The brief allowed a 410 instead; a 301 to the directory wins because it needs no extra
"this agent has gone" page, it keeps a human who followed an old link somewhere useful, and it
still tells crawlers the URL is permanently done. Revisit if a dedicated gone page ever exists.

Suspended is the reversible one — a leave of absence, a compliance hold — so it is a 302.

The sweep that removes departed pages only ever deletes files carrying the build's own
`GENERATED BY agents/build.js` marker. A hand-written page under `agents/` is never touched.

---

## Photos

`agents/photos/<file>`, referenced by `assets.photo`. One file serves both the 3:4 hero and the
4:3 directory card via `object-fit: cover`, so a square-ish head-and-shoulders crop around
1080px wide works for both.

**Initials on a gradient are the documented fallback, not a bug.** Agents are notoriously hard to
get assets from, so most agents will start without a photo, and a site must never wait on one.
Dropping a correctly-named file into `agents/photos/` later is the whole change.

> `sam-valk.jpg` is currently a crop of the carousel headshot library
> (`assets/agents/taupe/sam-v.jpg`) with the burned-in "SAM V." caption cut off. It is a real
> photo of the real agent, but it was produced for a carousel slide, not for the web. Replace it
> with a proper web headshot at the same path — no code change needed.

---

## Validation

The build validates every file — drafts included — collects **every** problem before reporting,
and writes nothing at all if any file fails. Half a directory of pages is worse than none.

Rejected: missing required fields · a slug that disagrees with its filename · a malformed email ·
a phone that is not 10 US digits · a licence number that is not 6–12 digits · a social URL
pointing at the wrong host · an unknown `status` · a referenced photo or PDF that is not on disk ·
a photo with no alt text · a testimonial with no `source` or `date` · an impossible date
(`2026-02-30`) · a negative price · a custom domain with a scheme · `canonical: "custom"` with no
domain · a template token the build does not supply.

Warned about, never fatal: a `live` site with no bio, no photo, or no neighborhoods; an archived
agent with no `archivedOn`; a Google testimonial with no `sourceUrl`.

**Every interpolated value is HTML-escaped.** The old build wrote agent data straight into the
template, so an `&` in a bio broke the page and a `<` could inject markup. Values now escape by
default and only pre-escaped markup built by the build itself can be emitted raw
(`{{{TOKEN}}}`); a plain value in a raw slot is a build error, as is an escaped value holding
markup. `agents/build.test.js` covers this directly.

---

## Templates

All markup lives in `template.html` and `directory.template.html` — none in `build.js`, so the
Wix visual port (Slices 2–3) rewrites the templates and leaves the build alone.

| | |
|---|---|
| `{{TOKEN}}` | escaped value |
| `{{{TOKEN}}}` | pre-escaped markup |
| `<!--{{#if TOKEN}}--> … <!--{{/if}}-->` | include when truthy (a non-empty array counts) |
| `<!--{{#unless TOKEN}}--> … <!--{{/unless}}-->` | the inverse |
| `<!--{{#each TOKEN}}--> … <!--{{/each}}-->` | repeat; items expose their own tokens plus `INDEX`, `NUMBER`, `IS_FIRST`, `IS_LAST` |

Block delimiters are HTML comments so an unrendered template still opens in a browser. A token
the build does not supply, or one left unreplaced, fails the build.

---

## `agents/site.json`

Site-level facts the agent pages share.

| Field | Notes |
|---|---|
| `origin` | Scheme + host the CB-controlled URLs are built from. **Overridden by `CB_SITE_ORIGIN`, then by Netlify's `URL`** — so on a deploy this file's value is not used, and on a deploy preview the canonical still points at production, not the preview. |
| `originConfirmed` | `false` while `origin` is still a placeholder; the build warns on every local build until someone confirms the real Netlify site name and sets it `true`. |
| `brokerage` | Name, founded year and address used in the footer. Casa Blanca was founded **February 2019** — the prototype's "since 2006" was wrong. |
