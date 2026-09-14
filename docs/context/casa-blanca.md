# Casa Blanca — working context for Claude Code

The default reference for booting a session. Everything here is load-bearing for building in
this repo. The archival version — full company research, the buyer's guide, the IG strategy
guide, the Framer brief, the IG API setup, the design system in full — is
[`casa-blanca-full.md`](casa-blanca-full.md); pointers below say when to go read it.

**Snapshot date: September 11, 2026.** Tool states drift. Constraints don't.

---

## 1. Who and what

**Casa Blanca** — boutique NYC residential brokerage, ~200+ agents, founded **February 2019** by
Hannah Bomze (CEO) and Erez Zarur (COO). HQ 10 Hubert Street; a Denver office since 2021. The
model: Casa Blanca generates and routes leads to agents (deep StreetEasy partnership) instead of
agents prospecting; zero desk fees; full back-office support; new agents get a dedicated mentor
for their first five transactions. Fastest agent growth in NYC (362% in 2022), ~93% retention.

**Kimani** (`kjocalliste@gmail.com`) is the sole marketing, content, and tools person — **3 days
a week**, in blocks, while also running other tracks. He is the only reviewer this repo has.
Don't design anything that assumes he's continuously available.

Two audiences: prospective agent recruits, and NYC buyers/sellers/renters. The differentiator
that actually matters is **the human infrastructure** — mentorship, culture, support — not the
tech stack. Kimani's read is that CB marketing has over-indexed on the product; there's live
internal tension with a co-founder who prefers tech-forward framing. The "dating app of real
estate" origin is history, not messaging.

Contacts: `creative@email.casa-blanca.com` (Casa work inbox — **not** connected to Claude),
`hannah@` (recruitment CTA), `derek@` (agent success), `success@` (agent-facing today; would need
routing confirmed before any client-facing use).

→ Full company research, the strategic notes, and the positioning brainstorm: full doc §8.1, §8.3.

---

## 2. Hard constraints

Repeated from `/CLAUDE.md` because they're the ones that get violated:

- **Single-file HTML per tool. No frameworks, no build pipeline.** Assets embedded as base64.
- **Object Sans** (Regular 400 / Heavy 800) is the brand font — embedded, never linked externally.
- Internal users are agents: zero-install, browser-based, **no accounts**. The bar for a tool is
  "does it work offline when the file is double-clicked."
- `netlify.toml` must explicitly declare the functions directory.
- **No esbuild bundling for functions that use `@netlify/blobs`.** `node_modules` ships in the zip.
- Image proxying genuinely needs the server (canvas taint) — cannot go client-side.
- **Fork the working reference template; never clean-room rewrite.** Patch surgically, validate
  each step. Spec-PDF brackets like `[Subhead]` are field labels, not literal characters.

## 3. Brand system — the essentials

```css
--cb-black:    #0f0f0f;  /* primary text, header bg, primary CTAs only */
--cb-white:    #cfcfcf;  /* light surface text */
--cb-sand:     #c0c2b5;  /* secondary text on dark */
--cb-lavender: #aaa3cf;  /* the ONLY accent — active borders, focus, selection, hover */
--cb-bg:       #f4f3f0;  /* page background — never pure white */
--cb-surface:  #ffffff;  /* cards, panels, inputs */
--cb-border:   #dddbd5;  /* every border and divider */
--cb-mid:      #888680;  /* labels, muted copy, placeholders */
```

Type: hero `clamp(40px, 8vw, 80px)` weight 800, uppercase, `line-height: .92`,
`letter-spacing: -.05em` — tight and negative, always, once per tool. Section labels 10px/800
uppercase at `.2em` tracking in `--cb-mid`. Body 13px. Captions and notes 11px.

Don't add colors. Work the palette.

Profile-pic generator note: the agent-photo composites use **`#c8beb8`** (taupe) as the standard
background, which is a product decision inside that tool, not a brand token.

→ Full component library (header, drop zone, buttons, settings bar, inputs, cards, swatches,
thumbnails, toasts) and JS helpers: full doc §8.2. It predates this repo's layout and names files
that no longer exist (`CB_Tool_Starter.html`, `cb-watermarker.html`) — trust the repo for
structure, the doc for tokens and components.

---

## 4. Stack

**Netlify** (hosting + functions) · **Wix Studio** (agent site template, and the main
casa-blanca.com) · **Make.com** (ISO automation) · **Mailchimp** · **Google Forms** (ISO intake) ·
**Photoshop** and **InDesign** (carousel production) · **Anthropic API, Haiku** (in-tool AI) ·
**Firecrawl** (StreetEasy scraping) · **@netlify/blobs** (sessions, agent photo storage).

Env vars present: `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `ALLOWED_ORIGIN`. Never commit
credentials — the IG long-lived token, Make keys, and blob credentials are env-only.

### Gotchas that have already cost time

- **StreetEasy blocks direct fetch.** Web-search the address + unit number and work the snippets.
  It is also the *only* source for the listing data Kimani can reach — no MLS/RLS access.
- **Make.com:** `contains()` not `startsWith()` for formula matching. Pass native date objects to
  Mailchimp scheduling (not the `formatDate` wrapper) or you fall off 15-minute intervals.
  "Set Multiple Variables" is under Tools — search `builtin:SetVariables`.
- **PDFs with custom font encoding** don't extract programmatically. Screenshot-to-text works.
- Mailchimp contact import is deprioritized — repeatedly unstable.

---

## 5. Tool state — verify before relying on it

| Tool | State |
|---|---|
| Business Card Generator | Shipped, audited. Pill selector ready for a 2nd card design. |
| Closed Carousel Builder | Shipped and deployed. AI features, agent photo library, StreetEasy autofill, session persistence. |
| Profile Pic Generator | Shipped. Batch, in-browser background removal. **Dispatch 01** covers its cutout + outpainting work. |
| Watermarker | Watermark-on and watermark-off merged into one tool. Redesign pending. |
| Listing Carousel Builder | v7. Production-readiness is the near-term goal; its three serverless functions were untested live at last check. |
| Single Property Editorial Carousel Builder | v2 delivered but broken; moved here for faster iteration. |
| ISO Email Automation (Make) | Core paths operational. Deferred: resubmission/cancellation, dual-agent ISO. |

**Web presence:**

- **`casa-blanca.com` is Webflow.** Verified against the live site, September 2026. The full doc's
  §5 says Wix Studio is the settled platform for it — that is wrong and superseded by this line.
- **Agent sites are a Wix Studio template**, one site per agent, and **each agent buys and owns
  their own custom domain** — Casa Blanca does not purchase them, since owning the domain of an
  agent who may leave is pointless. So agent sites are separate root domains, not paths or
  subdomains under `casa-blanca.com`. **When an agent leaves, their site comes down.**
  Realistic near-term scale is **~20 agent sites by end of 2026, not 200.**
  Because pointing DNS is exactly the kind of task agents stall on, every site must be live on a
  Casa-Blanca-controlled URL first, with the custom domain as an optional later swap.
  See `agent-site-template.md` for what the template contains.
- **An agent directory (`agents.casa-blanca.com`) was proposed as a scalable alternative — still
  pending with Erez and Hannah, including lead-routing implications.** The directory is the only
  piece where a subdomain-vs-subdirectory choice actually applies.
- A client-facing single-pager for `nyc.casa-blanca.com` was scoped on Framer (full doc §8.4).

**Google Business Profile:** one 1-star review from a non-client; flagging strategy and response
drafted. Agent review-building plan ready — agents ask past clients personally, no quotas, no
incentives, no copy-paste text. The real policy risks are review-gating, incentives, and
duplicated text; volume and timing alone are not signals. An agent email blast is drafted but
held until the review situation resolves.

**Content:** the IG post bank is empty and needs rebuilding. Sam Valk spotlight done; Zeshaan
Qadir starts from scratch. "Freshman Class" new-agent intro in progress.

### The next big automation: the Creative Studio pipeline

Goal: bulk-produce "recently closed" carousels ahead of time so the only manual step is review.
Closing emails arrive at the Casa work inbox with only address, agent(s), and price — not enough
for a post, which needs a photo and a description. So: read the inbox → Google the address for the
StreetEasy URL → paste into Creative Studio → Firecrawl pulls photo and description → Kimani edits
→ publish manually to Instagram (no paid scheduler).

Blocker: only Kimani's personal Gmail is connected to Claude, and he won't forward work mail into
it (clutter, no backfill, relabeling). He's open to routing the email side through Make, and to
adding an API surface to Creative Studio. Wants a dedicated session for it.

---

## 6. Ways of working

- Ships v1s and converges through iteration. Pragmatic about workarounds over full solutions.
- **Prefers Claude to execute directly** rather than walk him through changes.
- Direct, casual, stream-of-consciousness — especially by voice. Writeups: **steak, not sizzle.**
- Signals session wrap clearly and leaves continuity notes.
- On carousels: reads full transcripts not summaries, flags accuracy before publishing, maps
  photos to DSC filenames, asks for specific new shots when content has gaps, likes a mix of
  seamless spreads and standalone slides.

### Content principles

- Pillars: informative, relatable, funny, educational — ideally shareable.
- Native, non-salesy content outperforms branded. **Prominent logos make organic content read as
  advertising.**
- **Agents are very hard to get assets or responses from — even profile photos. Never build a
  workflow that depends on agent responsiveness.**

### Copy conventions

- Social/IG copy uses **normal capitalization and punctuation**. Do *not* default to casual
  lowercase — this is a CB-specific override of the general house style. See the `cb-copy` skill.

→ The buyer's guide, the 2026 IG growth playbook, and the post-call ICA one-pager are reference
text in full doc §8.6–8.8 — read them when writing client-facing or recruitment copy.
