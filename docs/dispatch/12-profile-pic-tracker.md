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

> **Phase 1, as built (Painter, 2026-10-14, #71).** Where it differs from the list above:
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

## Handoff, 2026-10-13

From the Dispatch 01 session, leaving the old cloud environment (ledger line `casa-r7-4`). Main was
`aee2e09` when this was written.

### Where it stands

- **Dispatch 12: approved, not started.** The draft merged in #63 on 2026-10-09 with Casanova's
  answers in §7. No code exists for it on any branch. Its ledger line, `casa-r6-2`, is still
  `queued`; mark it delivered when phase 1's PR opens.
- **Dispatch 01: parked.** All five phases are open as a stack, #41–#45. Nothing moves on it until
  Casanova re-reviews #41 (§7.6).

### Open PRs (all Dispatch 01, all base `claude/main`)

| PR | Branch | Head | Merge state | What's left |
|---|---|---|---|---|
| #41 | `claude/kind-heisenberg-ujrdup` | `dead409` | clean | Casanova's re-review of the 2026-10-06 fixes: the rectangular seam (`cbLocalColour` now blends continuously) and the edge halo (coherence-gated sharpening). Two points are still open in the thread: curly-1, where I think the real fault is the model half-claiming a background object, not hair; and whether to bound the decontamination band (not added). |
| #42 | `…-p2` | `b785d9a` | clean | Carries the pre-fix `fc3aee2`. Merge `claude/main` in after #41 lands; it should be clean. |
| #43 | `…-p3` | `857383b` | clean | **Where #41's fix will conflict.** #43 deletes the inlined pipeline from `tools/profile-pic/index.html` and moves the old code into `js/cb-cutout.js`. Keep the deletion and port #41's three changes into `js/cb-cutout.js`: the new `cbLocalColour`, the `// 4b` edge-sharpening stage, and the `edgeSharpen`/`edgeRef`/`edgeGain` defaults. Then re-prove with the harness that the module's output is byte-identical to #41's. |
| #44 | `…-p4` | `37c39cc` | clean | Follows #43. Its `js/cb-inpaint.js` changes don't overlap the fix. |
| #45 | `…-p5` | `2f22fe1` | **conflict** | Only `netlify/functions/README.md`; take both sides. #45 also fixes the 204 preflight in `netlify/functions/_lib.mjs` (`new Response('', …)` → `new Response(null, …)`), which main still lacks. If #45 sits for long, lift that fix out on its own. The provider comparison's prices date from 2026-09-11; re-check them before Kimani picks a provider. |

### What's next

**Dispatch 12, phase 1 — the roster and the record (§5.1–§5.4),** on Casanova's terms in §7:

- The `pic` group and `placements` go on the `cb-agents` record. Put them **outside** `draft` and
  `live`. Publish copies `draft` over `live` (`netlify/functions/agent-store.mjs`), so fields kept
  outside both can't be published by it.
- **The test Casanova asked for:** the agent-site build never renders or publishes `pic` or
  `placements`. `agents/build.js` reads `agents/data/<slug>.json` today, not Blobs, so check how
  records reach the build before writing the test. It goes in `agents/build.test.js` (`npm test`).
- **`CB_PICS_TOKEN`, not `CB_CMS_TOKEN`.** §5.1 still says reuse the CMS token; §7.5 overrides it.
  The pics token writes `pic` and `placements` only. It can't publish or touch the rest of the record.
- The one-time roster import waits on D-24. Build the roster so it works empty, or with agents
  added by hand, until then.

Then phases 2–4 in order, one PR each. Return to Dispatch 01 only after Casanova's re-review, and
never both at once.

### Gotchas

- **Don't push a fresh `claude/kind-heisenberg-ujrdup`.** On origin that branch is #41's head. A new
  environment may check it out fresh from main; pushing that wipes #41. Work Dispatch 12 on a new
  branch.
- **The harness that proved Dispatch 01 is gone** (it lived in this environment). To rebuild it:
  RMBG-1.4 from Hugging Face; `@huggingface/transformers@3.0.2` from npm, using
  `dist/transformers.js` (`transformers.mjs` is the Node build); a local server sending COOP/COEP
  headers; Chromium at `/opt/pw-browsers/chromium`. Serve the model and library locally, because
  the browser couldn't reach CDNs through the proxy. The fixtures and their credits are in
  `docs/dispatch/01-evidence/` on #41.
- **The studio's members gate** (`cb_auth`) needs a localStorage seed in headless runs.
- **The model:** Transformers.js defaults to q8 on wasm (`model_quantized.onnx`, about 44 MB);
  fp32 is 176 MB and optional. The ONNX input is fixed at 1024×1024. Letterboxing was tried and
  rejected; don't retry it.
- **Gmail drops `data:` images** from a pasted signature. The photo has to be hosted over https —
  that's why phase 3 commits it to `assets/agents/sig/<slug>.jpg`.
- **Netlify buffers about 6 MB per request** (about 4.5 MB of binary), so NEF uploads go up in
  chunks. Blobs' per-object limit and storage pricing are unconfirmed; check them before phase 2.
- **The sigs doc holds a credential-looking string.** Parse the name, title, email and phone fields
  only. Never copy or repeat the string, and confirm Kimani has removed and rotated it.
- **Don't commit agents' phones or emails.** `publish = "."` serves the repo root.
- **Drive:** the connector finds `@ Profile Pics` and `@ All Email Sigs` by name. Don't paste their
  share links into the repo.
- **The dev notebook:** `DEV_NOTEBOOK_KEY` was never set in this environment, so I haven't read it.
  It is set in the new one; read it at the start.
- **Delete `docs/dispatch/01-evidence/`** once real before/afters replace the stand-ins. Hard cases
  can now come from `@ Profile Pic RAWS`.

### Waiting on Kimani

- **D-24:** is the sigs doc the source for agents' details, or FileMaker? This blocks the roster
  import.
- **Set `CB_PICS_TOKEN`** in Netlify before phase 1 can write.
- **Remove and rotate the credential** in the sigs doc.
- **Name this session.**
- For Dispatch 01, later: the outpaint provider and its key, and whether to ship the fp32 weights.

### Waiting on Casanova

- **Re-review #41,** including the curly-1 disagreement. Then #42–#45, in order.

### Restart kickoff

> You're **the Dispatch 01 session**, continuing a Casa Blanca Creative Studio track. Read
> `/CLAUDE.md`, then `docs/dispatch/README.md` (your roster row says where you are), then your
> dispatch file in full — `docs/dispatch/12-profile-pic-tracker.md`, ending with "Handoff,
> 2026-10-13" — then your latest PR and its comments, and #63, where Casanova approved Dispatch 12
> and set its conditions. Carry on from what's next there: **Dispatch 12, phase 1 — the roster and
> the record**, ledger line `casa-r6-2`. Pull `claude/main` first, open one PR per phase to
> `claude/main`, never merge, and mark `casa-r6-2` delivered when phase 1's PR opens (rule 11).
> **Leave Dispatch 01's parked stack alone:** #41–#45 are open; #41 carries the 2026-10-06 seam and
> halo fixes and waits for Casanova's re-review, #42–#45 follow it in order, and #45 has a conflict.
> Don't work both at once. If your environment hands you the branch `claude/kind-heisenberg-ujrdup`,
> don't push it — on origin that's #41. Sign as "— the Dispatch 01 session (D12)".

— the Dispatch 01 session
