# Agent CMS — handoff from the Dispatch 03 session

Written 2026-10-14 by the session that built Dispatch 03, on retiring. The track continues as
**Concierge** (agent sites and the CMS). Restart kickoff at the end.

## What was built, and where

**PR #47, merged 2026-09-14** (branch `claude/laughing-newton-f96x9t`, deleted after merge).
Nothing from this session is unpushed.

| | |
|---|---|
| `tools/agent-cms/index.html` | The CMS. Single file. Roster (status, domain, last edited, suspend/restore) and a per-agent editor laid out in the public site's section order. Draft → preview → publish. |
| `netlify/functions/agent-store.mjs` | Blobs store `cb-agents`, one key per slug plus `_index`. Each record holds `draft` and `live`. Bearer `CB_CMS_TOKEN` on every request, reads too; 503 when unset. Per-agent read-only `previewToken`. Publish/suspend POST `NETLIFY_BUILD_HOOK` if set. |
| `netlify/functions/agent-copy.mjs` | AI autofill, Haiku, four fixed tasks: `bio`, `seo`, `specialties`, `testimonial`. Same token. Prompts forbid invented credentials, figures, licence numbers or biography and return a `flags` list of what was left out. |
| `docs/agent-cms/` | `README.md`, `storage-decision.md`, `security-model.md`. |
| `tools/agent-cms/verify.spec.mjs` | 68 Playwright checks against an in-memory stand-in for the store. Not in `package.json` on purpose. |
| `index.html` | The `agentcms` row in the Agent sites tab, Team-gated. |

## Unfinished or broken

1. **The CMS doesn't reach the public site yet. This is the big one.** Two gaps:
   - **Field names don't match `agents/SCHEMA.md`.** The CMS was built against Dispatch 02's draft, and
     02 then merged a different shape. The CMS writes `content.{bio,neighborhoods,…}`, top-level
     `stats`, `deals[].sqft`/`price` as text, `assets.heroPhoto` (a URL), `seo.title/description/
     canonical`, `team[].title`, and `status` beside the record. The schema wants `profile.*`,
     `profile.stats`, `profile.testimonials`, `deals[].squareFeet`/`price` as integers,
     `assets.photo` (a filename in `agents/photos/`), `seo.pageTitle/metaDescription/canonicalUrl`,
     `team[].role`, `identity.slug`, `identity.licenseNumber` (required), `contact.phone` and
     `contact.email` (required), and `delivery.status`. The schema also has fields the CMS can't edit
     yet: `licenseState`, `acceptingClients`, `rating`/`sourceUrl` on testimonials, `neighborhood`/
     `side`/`closedOn` on deals, `photoColor`, `noindex`, `delivery.canonical`, `launchedOn`/`archivedOn`.
   - **`agents/build.js` reads `agents/data/*.json`, not Blobs.** Nothing turns a published record
     into a file.

   **How I'd fix it:** make `SCHEMA.md` the single source. Rewrite `SPEC`/`ROWS` in `agent-store.mjs`
   and `SECTIONS` in the tool to its exact names and types, with a one-time migration of any
   records already in `cb-agents` (there's at most Sam Valk). Add a `validate` step in the store
   that reuses the build's rules, so Publish refuses what the build would refuse. Then
   connect the build. The cheapest correct route is the git export that `storage-decision.md` already
   recommends: a function (or a step in the build) that writes each `live` record whose status
   isn't `draft` to `agents/data/<slug>.json`. Alternatively, have `build.js` read Blobs at deploy
   time. Photos are the awkward part, because the schema wants a file on disk and the CMS has a URL field. The
   CMS needs an upload that stores the image where the build can see it.
2. **Env not set.** As of 2026-09-28 `CB_CMS_TOKEN` was unset, so `agent-store` answers 503. Kimani
   generates one (`openssl rand -hex 32`) and sets it in Netlify; `NETLIFY_BUILD_HOOK` is optional.
3. **My `node_bundler = "none"` override broke `agent-store` (502 in production)** until Casanova
   removed it under D-15. I added it to obey a rule that turned out to be wrong; `CLAUDE.md` now
   carries the correct one. Recorded here so nobody re-adds it.
4. **The suite was never run against a real deploy.** Re-run `verify.spec.mjs` after item 1. Its mock
   and assertions will need the new field names too.

## Decisions, findings and ideas that lived only in this conversation

- **Storage:** Option A (Blobs live, git export) was ratified by Casanova; Kimani can still veto. The
  git export is the hedge and also the build bridge in item 1, so it's worth building either way.
- **Security, plainly:** one shared secret for one person. No identity, so `updatedBy` is forgeable.
  No per-agent scoping, and revocation is all-or-nothing. Fine for Kimani alone. Not fine for agents. Slice 6 needs real
  identity, per-slug authorisation and a server-written audit log (`security-model.md` §6).
- **`claude.mjs` is an unauthenticated open proxy to the Anthropic API.** It's still open as far as I know.
  The cheapest step is to cap `max_tokens` and allowlist models inside it. Worth its own small dispatch.
- **Blank stays blank.** A blank stat is `null`, never `0`, in both the store and the form. A
  stat that silently became 0 would publish "0 years in NYC" about a real person. Keep that rule
  through the schema rewrite.
- **The store strips `<`/`>` from text and allowlists URL schemes.** That was written when `build.js`
  didn't escape. 02's build escapes now, so the stripping is belt-and-braces; it's fine to keep.
- **Two design calls to keep:** the roster uses a row-scale `.face` tile, not the dashboard's `.rail`;
  and the tool owns its header instead of loading `studio-header.js` (option b in `docs/design/README.md` §4).
- **Agent records want more fields.** Instagram as a handle (Kimani's ask), alongside the URL the
  schema has now. Derive one from the other so the carousel tools and the email signature (Dispatch 12) can
  read the handle without parsing URLs. Dispatch 12's roster of about 110 agents and the CMS records
  are the same people. Decide which one owns contact details (D-24) before both start writing them.

## Waiting on Kimani

- Set `CB_CMS_TOKEN` (and optionally `NETLIFY_BUILD_HOOK`) in Netlify.
- Sam Valk's bio and neighborhoods. His spotlight transcript can seed the bio through the CMS's AI draft.
- Confirm the production origin pinned in `agents/site.json`.
- The Wix capture (`docs/context/agent-site-template.md` §5), which unblocks Slices 2–3.
- D-24: where agents' contact details come from.

## What's next for Concierge, in order

1. **Wire the CMS to the site** (item 1 above): the schema reconciliation, publish-time validation and the build bridge.
   Without it, nothing published in the CMS ever shows up on the site.
2. **Slice 5:** SEO output and Google review ingestion. Use the Google Business Profile API, owner-authorised,
   for the full set; not Places, which returns about 5 and restricts storage. Make.com's Google Business modules are the
   low-lift path. Reviews land as `testimonials` with `source: "google"`, `sourceUrl` and `rating`.
   The CMS already badges them.
3. **Agent-record fields:** the Instagram handle, plus the schema fields the CMS can't edit yet (item 1).
4. **Slices 2–3**, the visual port, once the Wix capture exists. Port from the extracted CSS
   (`agent-site-template.md` §6); the screenshots are the acceptance check.

## Restart kickoff for Concierge

> You're **Concierge**, continuing a Casa Blanca Creative Studio track: agent sites and the agent CMS.
> Read `/CLAUDE.md`, then `docs/dispatch/README.md` (your roster row says where you are), then
> `docs/dispatch/03-agent-cms.md` in full, then this handoff (`docs/parked/sessions/agent-cms.md`),
> then PR #47 and its comments. Carry on from "What's next" here, starting with wiring the CMS to
> `agents/SCHEMA.md` and the build. Sign as "— Concierge (agent sites)".

— the Dispatch 03 session (retiring)
