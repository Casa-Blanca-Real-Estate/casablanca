# Dispatch 12 — Profile pics: the roster, the store, and the email signature

**Drafted by:** the Dispatch 01 session (unnamed) · 2026-10-06 · **For:** Casanova to approve
**To:** unassigned — this session unless Casanova reassigns
**Asked for by:** Kimani, directly, 2026-10-06, with the scope answers in §3.
**Builds from:** `tools/profile-pic/index.html` (the generator), `docs/agent-cms/storage-decision.md`
(the Blobs-vs-git reasoning this reuses), `netlify/functions/agent-store.mjs` (the record/index/auth
shape to copy), `docs/context/casa-blanca.md` §2 (hard constraints).
**Depends on:** nothing merged. It is **independent of Dispatch 01's parked PR stack** — this touches
the tool's shell and a new function, not the cutout pipeline. If #41–#45 land first there is no
conflict beyond the usual rebase.
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` at each phase boundary. Never
merge — Casanova or Kimani merges. Sign PRs, PR comments and commits with the session name.**

> **Priority note.** CLAUDE.md names the comp report as the current priority and parks everything
> else. Kimani asked for this directly on 2026-10-06, which is the only thing that un-parks the
> profile-pic area. Casanova should confirm it jumps the queue rather than assume it.

---

## 1. Why this exists

The generator makes ten files per agent in one shot. Everything *around* those files is manual and
lives in three places that don't know about each other:

- **Google Drive** holds the raws and the finished files, filed by hand.
- **A Google Doc** (`@ All Email Sigs`, ~110 blocks) holds each agent's signature.
- **Kimani's head** holds who still needs a photo, and where each photo has actually been put.

So "has Rikki Tauber's new photo gone into her Gmail signature and StreetEasy yet" is a question
nobody can answer without opening three tabs, and a photo that gets generated often doesn't get
*deployed*. The generator solves production. This solves everything after it.

## 2. What Kimani does today — read this before designing anything

Verified against his Drive on 2026-10-06.

```
@ Profile Pics/
├── @ Profile Pic RAWS/   one folder per agent, full name
│   └── James Campanella/  "James Campanella 01.jpeg" … "04.png"  +  photo_180x180.jpg
├── SQUARE/   1G MAIN Logo · 2G Clean · 3G Name · 4 Color Name · 5 Color Clean · …
├── ROUND/    the same split
├── @ to do/  one folder per pending agent: Nuri_Daynish_PP, Rikki_Tauber_PP, …
├── Duos/ · @ old/ · @ Agent Packages ↗
```

Two things to notice, because they're the seams this build hangs on:

1. **The `SQUARE/` and `ROUND/` subfolder names map 1:1 onto the generator's existing ten
   variants.** `1G MAIN Logo` is `SQ1_GrayLogo`, `2G Clean` is `SQ2_Clean`, and so on. The tool
   already produces exactly the set he files.
2. **`photo_180x180.jpg` already exists** in each agent's raw folder. That's the email-signature
   export, and it's a variant the generator does *not* currently produce — he's making it by hand.

The signature blocks are uniform: name / `Casa Blanca Real Estate` / title / email / phone / three
icon links (Instagram, casa-blanca.com, LinkedIn). Titles vary — `Licensed Real Estate Agent` for
almost everyone, with `CEO and Co-Founder`, `COO and Co-Founder`, `Head of Agent Success`,
`Creative Associate`, `Agent Support Team` as the exceptions.

**Data problems found in that doc, worth fixing while we're in here** (Kimani's call, not this
session's): a credential-looking string sitting in one agent's block (flagged to him separately —
delete and rotate); Hannah Bomze duplicated; `# Z` twice; two emails that look like typos
(`w.wang@` for Esther Wang, `a.yen@` for Annika Yan); two `mailto:` links pointing at
`creative@email.casa-blanca.com` instead of the agent; one agent with a second malformed sig; two
agents with no phone; one missing the Instagram link; phone formats mixed between dots and dashes.

## 3. Scope Kimani already settled (2026-10-06)

| Question | His answer |
|---|---|
| Where raws live | **In the store**, not just linked in Drive — so the tool can re-cut an original without him re-uploading |
| Placements to track | **Gmail signature · Gmail profile pic · FileMaker profile pic · StreetEasy profile · business card** |
| Process | A dispatch first, Casanova approves, then build in phases |

He did **not** pick the agent site or Instagram as tracked placements. Don't add them.

*FileMaker* is a destination this session has no context on beyond the name — treat it as a named
checkbox, not an integration.

## 4. Where the records live — and why not in the CMS

The obvious move is to extend Dispatch 03's `cb-agents` records, which already carry `identity`
(name, title) and `contact` (phone, email, instagram, linkedin) — exactly what a signature needs.
**Don't.** Three reasons:

1. **That store is nearly empty.** One record exists (`sam-valk`). The real roster of ~110 lives in
   the sigs doc and Drive. This dispatch would be seeding someone else's store with someone else's
   schema.
2. **Those records publish.** They carry a `draft`/`live` split and a build hook, because they
   render an agent's public web page. Whether a photo reached FileMaker is operations, not site
   content, and must never be one bad publish away from the open web.
3. **Rule 8.** The schema belongs to Dispatch 03.

**So: a new store, `cb-agent-pics`, keyed by the same slug** (`firstname-lastinitial`, matching
`assets/agents/agents.json`). Where a `cb-agents` record exists for the same slug, the pic record
*reads* identity and contact from it and falls back to its own copy. One slug space, two stores, no
schema in anyone else's lane. If Casanova would rather merge them later, the slug key makes that a
migration rather than a rewrite.

**PII stays out of the repo.** `publish = "."` serves the repo root, so a seeded roster carrying 110
direct phone numbers and emails must live in Blobs only — never a committed JSON file, even one on
the forced-404 list. The 180×180 photos are the single exception in §5.3, and they're public-facing
headshots.

## 5. What to build

### Phase 1 — the roster and the record

1. **`netlify/functions/agent-pics.mts`** — v2, `@netlify/blobs`, modelled closely on
   `agent-store.mjs`: one JSON record per slug, an `_index` key, bearer-token auth on **every**
   method including reads, and a refuse-everything default when the token env var is unset.
   Reuse `CB_CMS_TOKEN` rather than minting a second secret, or justify a new one in the PR.
   Per CLAUDE.md, functions are v2 and **`node_bundler` must not be set to `none`** — D-15 records
   what that cost the agent CMS.
2. **The record:**
   ```
   slug, name, title, email, phone, status,
   pic:        { sigPhotoKey, generatedAt, variants: { round: […], square: […] } },
   raws:       [ { key, filename, bytes, uploadedAt, width, height } ],
   placements: { gmailSig, gmailAvatar, filemaker, streeteasy, businessCard }
                 each: { state: 'todo'|'done'|'na', at, note },
   notes, updatedAt
   ```
   `status` is derived, not typed: `none` → `raw` → `generated` → `deployed` (every placement
   resolved). Derived, so it can't go stale.
3. **Seed it** from the two sources that already exist: the sigs doc for name/title/email/phone, and
   the Drive folder listing for who has raws and who's in `@ to do`. A one-off script, run once,
   output reviewed by Kimani before it's written. Don't invent agents.
4. **A roster screen in the tool** — a new tab beside the generator, not a new tool: sortable list,
   status per agent, filter to "needs a photo" and "generated but not deployed". This is the view
   that replaces `@ to do`.

Phase 1 ships without a single upload and is already useful: it answers "who still needs one".

### Phase 2 — storage

5. **Uploads have a hard ceiling.** Netlify functions take **6MB buffered per request, ~4.5MB once
   base64 overhead is counted**, and his raws run 2–7MB. So either:
   - **(a) cap on the client** — downscale to ~3000px long edge, re-encode, upload. Simple, always
     fits, and still 3× the 1080 output. Loses the untouched camera file.
   - **(b) chunk it** — split client-side under 4MB, function reassembles. Keeps true originals,
     more code and more failure modes.

   **Recommended: (a) now, (b) only if Kimani says "raw" means the untouched file.** This is the one
   open question in §7.
6. **Store the ten outputs** against the record when a generate finishes, so a re-download never
   means a re-run. Key them by variant id (`SQ1_GrayLogo`), which is also the Drive folder name.
7. **Watch the spend before bulk-uploading.** ~110 agents × a few images is 1–2GB. Netlify's pricing
   page lists bandwidth at 20 credits/GB (≈$0.13/GB); this session **could not confirm Blobs storage
   allowance or overage** from the public docs — two URLs 404'd. Confirm it against the live pricing
   page and put the number in the PR before anyone uploads in bulk.

### Phase 3 — the email signature

8. **Generate the 180×180** as an eleventh output in the generator. He's making it by hand today.
9. **A hosted URL for it.** Gmail's signature editor won't keep a `data:` URI, so the photo needs a
   real https URL. Commit the 180×180 to `assets/agents/sig/<slug>.jpg` — the repo is already served
   by Netlify's CDN, it's free, stable, cached, and these are public-facing headshots anyway. 110 × ~18KB
   is about 2MB of repo. Don't serve it from a function: that's a function invocation per email render.
10. **Build the signature** from the record and the house template in §2, and put it on the clipboard
    as `text/html` (with a `text/plain` fallback) so it pastes into Gmail's signature box intact —
    formatting, links and photo. Verify by actually pasting into Gmail, not by inspecting markup.
11. **Normalise on the way out:** one phone format, the right `mailto:`, all three icon links.

### Phase 4 — placements

12. The five checkboxes from §3 per agent, each with a date stamped when it flips, and a free-text
    note. No integrations — he ticks them. The point is the view, not automation.
13. **A batch view:** "these 12 agents have a generated photo that hasn't reached StreetEasy." That
    is the thing he cannot get today at any price.

## 6. What this must not do

- **Don't touch the cutout pipeline, the ten variants, or the batch system.** Dispatch 01 owns those
  and has a PR stack open against them.
- **Don't write agent contact details into the repo.**
- **Don't build anything that needs an agent to respond.** They don't (CLAUDE.md).
- **Don't let the roster screen become a second CMS.** It tracks photos. Bio, neighborhoods and deals
  are Dispatch 03's.
- **Don't add a new internal path without both guards** — `netlify/edge-functions/block-internal.js`
  and the forced-404 list in `netlify.toml` — then curl the live site, including an UPPERCASE variant.

## 7. Open questions

1. **For Kimani — does "raw" mean the untouched camera file, or is a 3000px re-encode fine?**
   Decides §5.5(a) vs (b). The recommendation is (a).
2. **For Kimani — is the sigs doc the authority for names, titles, emails and phones, or is there a
   system of record behind it** (FileMaker?) the seed should read instead?
3. **For Casanova — reuse `CB_CMS_TOKEN` or mint a second one?** Reuse is less to rotate; a separate
   token keeps the CMS's blast radius smaller if the profile-pic tool is opened to anyone else.
4. **For Casanova — does this jump the comp report queue, and who takes it?**

## 8. Definition of done

- A roster of every agent, with a derived status, that answers "who needs a photo" and "whose photo
  hasn't been deployed" in one screen.
- Raws and outputs stored against the agent, re-downloadable without a re-run, with the upload
  ceiling handled rather than hit.
- A signature that pastes into Gmail with its photo intact, generated from the record — verified by
  pasting, with a screenshot in the PR.
- Five placements per agent, with dates.
- `@ to do` in Drive is redundant, and Kimani says so.
