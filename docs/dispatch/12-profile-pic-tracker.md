# Dispatch 12 — Profile pics: the roster, the store, and the email signature

**Drafted by:** the Dispatch 01 session (unnamed) · 2026-10-06 · **For:** Casanova to approve
**To:** the Dispatch 01 session (unnamed) · **Approved by Casanova, 2026-10-09** (#63)
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
| Where raws live | **In the store**, not just linked in Drive — so the tool can re-cut an original without him re-uploading. Extended 2026-10-06: **the Nikon NEF camera files too**, if they can be stored. Big files are fine; Casa pays for the storage if it comes to that |
| Placements to track | **Gmail signature · Gmail profile pic · FileMaker profile pic · StreetEasy profile · business card** |
| Process | A dispatch first, Casanova approves, then build in phases |

He did **not** pick the agent site or Instagram as tracked placements. Don't add them.

*FileMaker* is a destination this session has no context on beyond the name — treat it as a named
checkbox, not an integration.

## 4. Where the records live — extend the agent CMS

**Kimani's call, 2026-10-06:** extend Dispatch 03's `cb-agents` records rather than stand up a
second store. His reasoning, and it's the right one: a photo's placement on FileMaker is not
sensitive data, and two stores means two things to keep in step forever.

This session had drafted the opposite — a separate `cb-agent-pics` store — on the grounds that
`cb-agents` publishes to the public web. **That objection doesn't survive checking the code.** New
records are created `status: 'draft'` with `live: null`, and publishing is an explicit `publish`
action that copies draft to live and pings the build hook. So seeding ~110 agents to track their
photos does *not* publish ~110 agent sites, and nothing in the pic fields reaches the open web until
someone deliberately publishes that agent. Verified in `agent-store.mjs` (`STATUSES`, the create
path, and the `action === 'publish'` branch).

So: **a `pic` group and a `placements` row-set added to the existing record**, same slug space
(`firstname-lastinitial`, matching `assets/agents/agents.json`).

Two consequences to handle rather than discover:

1. **This is Dispatch 03's schema.** Rule 8 — Casanova approves the addition, or hands it to whoever
   owns 03. Don't widen `SPEC` unilaterally.
2. **It populates an almost-empty store.** `cb-agents` holds one record today (`sam-valk`) against a
   roster of ~110. Seeding is therefore a bigger act than it looks: it creates the agent CMS's
   roster as a side effect. That's a *good* outcome — one roster, as Kimani wants — but it should be
   a deliberate, reviewed, one-time import, not a quiet consequence of a photo tool.

**PII still stays out of the repo.** `publish = "."` serves the repo root, so a seed carrying 110
direct phone numbers and emails lives in Blobs only — never a committed JSON file, even one on the
forced-404 list. The 180×180 photos are the single exception in §5.3, and they're public-facing
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

> **Phase 1, as built (Painter, 2026-10-14, PR-TBD).** Where it differs from the list above:
> - **The token is `CB_PICS_TOKEN`**, per §7.5, not `CB_CMS_TOKEN` as item 1 says. The function
>   refuses everything when it's unset or the same as `CB_CMS_TOKEN`, and `agent-store` refuses it.
> - **`raws` and `notes` sit inside `pic`**, so the token writes exactly two groups, `pic` and
>   `placements`, both outside `draft` and `live`. A body naming anything else is refused whole.
> - **`pic.rawInDrive` is new.** Until phase 2 stores originals, it's how "raw" is known.
> - **The status keeps two more rules, still derived:** a placement done before the latest generate
>   counts as not done (it shows as *stale*), and a raw stored after it puts the agent back at `raw`.
> - **Agents are never created by the roster**, only in the agent CMS or by the import.
> - **The import** (`tools-src/agent-pics/import.ts`) takes a reviewed JSON file, whatever D-24
>   makes its source, dry-runs by default, creates CMS drafts only, and never overwrites a photo
>   side recorded by hand.
> - **`agent-store` reads with strong consistency now**, so neither function writes a cached copy
>   of the shared record back over the other's change.

### Phase 2 — storage

5. **Two classes of file, and they are not the same thing.**
   - **Archive originals — the Nikon NEF.** Kimani wants these held so he stops managing them by
     hand. **No browser can decode a NEF**, so it is an opaque archive: stored, listed, re-downloaded,
     never previewed or cut out. Don't pretend otherwise in the UI — show it as "original, download
     only", with its size and capture date if the EXIF is readable without a decoder.
   - **Working files — the JPEG/PNG exports.** These are what the generator actually reads, and his
     folders already carry them (`James Campanella 01.jpeg` … `04.png`). A record's working file is
     the one the cutout re-runs against. An agent can have an archive with no working file, and the
     roster should say so.
6. **Chunked upload is now mandatory, not an option.** Netlify functions take **6MB buffered per
   request, ~4.5MB after base64**. His JPEG/PNG raws run 2–7MB and a NEF runs 20–50MB. So: split
   client-side into parts under 4MB, upload them in sequence, have the function assemble into one
   blob, and make the whole thing resumable — a 40MB upload that dies at part 7 of 11 must not start
   over. **Confirm Netlify Blobs' per-object size limit before building this**; this session could
   not find it in the public docs, and a cap below 50MB changes the design to a multi-part object.
7. **Store the ten outputs** against the record when a generate finishes, so a re-download never
   means a re-run. Key them by variant id (`SQ1_GrayLogo`), which is also the Drive folder name.
8. **Put a real number on the spend before bulk-uploading.** With NEFs this is no longer 1–2GB: ~110
   agents × a few originals at 20–50MB is **10–50GB and growing**. Kimani has said he's fine with
   that and that Casa will pay if it comes to it — which is a reason to tell him the number, not a
   reason to skip finding it. Netlify's pricing page lists bandwidth at 20 credits/GB (≈$0.13/GB);
   this session **could not confirm Blobs storage allowance or overage** — two docs URLs 404'd.
   Confirm against the live pricing page and put it in the PR.
9. **Deleting has to be real.** At this size, "remove this raw" must actually free the blob, and the
   roster needs to show what an agent is costing. Storage nobody can see is storage nobody prunes.

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

1. ~~Does "raw" mean the untouched camera file?~~ **Answered 2026-10-06: yes — Nikon NEF, and
   store them. Big files are fine.** Folded into §5.5–5.8.
2. ~~Separate store or extend the CMS?~~ **Answered 2026-10-06: extend the CMS.** Folded into §4.
3. **For Kimani — is the sigs doc the authority for names, titles, emails and phones, or is there a
   system of record behind it** (FileMaker?) the seed should read instead? This decides whether the
   one-time import is a parse of a Google Doc or a proper export.
4. **For Casanova — the §4 schema addition is Dispatch 03's lane (rule 8).** Approve it, or hand the
   schema change to whoever picks 03 back up.
   **Approved (Casanova, 2026-10-09).** Dispatch 03 is done and has no owner, so the addition is
   yours. One condition: a test proves the agent-site build never renders or publishes the `pic`
   group or `placements`.
5. **For Casanova — reuse `CB_CMS_TOKEN` or mint a second one?** Reuse is less to rotate; separate
   keeps the CMS's blast radius smaller if the profile-pic tool is ever opened to anyone else.
   **A second token (Casanova, 2026-10-09):** `CB_PICS_TOKEN`. It may write the `pic` group and
   `placements` only. It can't publish, and it can't touch the rest of the record. The CMS token
   publishes public pages, and the photo tool shouldn't be able to.
6. **For Casanova — does this jump the comp report queue, and who takes it?**
   **It runs alongside it (Casanova, 2026-10-09).** It takes no comp report session, and Kimani asked
   for it. This session takes it. Leave Dispatch 01's stack alone meanwhile: #41 waits for
   Casanova's re-review, then #42–#45 follow. Don't work both at once. Question 3 is D-24 in
   `docs/decisions.md`.

## 8. Definition of done

- A roster of every agent, with a derived status, that answers "who needs a photo" and "whose photo
  hasn't been deployed" in one screen.
- Raws and outputs stored against the agent, re-downloadable without a re-run, with the upload
  ceiling handled rather than hit.
- A signature that pastes into Gmail with its photo intact, generated from the record — verified by
  pasting, with a screenshot in the PR.
- Five placements per agent, with dates.
- `@ to do` in Drive is redundant, and Kimani says so.
