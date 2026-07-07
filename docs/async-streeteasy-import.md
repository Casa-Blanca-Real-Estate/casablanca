# Async StreetEasy import — dispatch / handoff

**Branch:** `claude/nice-bohr-nj42vw`
**Why:** StreetEasy under Firecrawl's stealth proxy sometimes needs >22s to render, but a
synchronous Netlify function is hard-capped at **26s**. We can't move that ceiling for a
sync call, so the import is being moved to an **async background-function + polling** flow
that has a 15-minute budget and never risks the cap.

Design note (important): the slow part is the **stealth page render**, which happens once.
Splitting "pull text" vs "pull images" into two scrapes would render the page **twice** and
be worse. So we render once in a background worker, extract the full fields (including the
whole multi-paragraph description — time is no longer tight), base64 the photos, and stash
the finished result for the browser to poll.

## What's already built on this branch

**Backend (new files — the working sync endpoint `streeteasy.mjs` is left untouched as a fallback):**
- `netlify/functions/streeteasy-import-background.mjs` — Netlify **background** function
  (filename ends in `-background`). `POST {url, jobId}` → renders once via Firecrawl stealth
  (`timeout: 55000`), extracts full fields, base64s up to 8 photos, writes the result to the
  **`se-jobs`** Blobs store under `jobId` as `{status:'running'|'done'|'error', ...}`. Returns 202.
- `netlify/functions/streeteasy-status.mjs` — `GET ?id=<jobId>` (or `POST {id}`) → reads the
  `se-jobs` Blobs record. Returns `{status:'queued'}` if not written yet.

**Frontend helper (new):**
- `assets/se-import.js` → `window.CBImportStreetEasy(url, {backend, onStatus, signal, timeoutMs})`
  → Promise<result>. Generates a jobId, POSTs to the background function, polls status every
  ~3s until done/error. **Falls back to the sync `streeteasy` endpoint only if the async
  endpoints are unavailable** (non-202 start), so callers never regress.

**Wired so far:**
- `tools/carousel/cb_editorial.html` — includes `se-import.js` and its `doImport()` now calls
  `CBImportStreetEasy(...)`. (This is the tool the user is actively hitting.)

## What's LEFT to do (for the session with a live environment)

1. **Verify Netlify background functions are enabled on the plan.** If not, the background
   file returns 404 and the helper falls back to sync (no regression, but no fix either).
   Confirm in the Netlify dashboard / `netlify dev`.
2. **Wire the other two tools** the same way editorial was wired:
   - `tools/closed-carousel/index.html` and `tools/forsale-carousel/index.html`.
   - Add `<script src="../../assets/se-import.js"></script>` in `<head>`.
   - Replace the direct `fetch('/.netlify/functions/streeteasy', …)` calls with
     `CBImportStreetEasy(url, {onStatus, signal})`. There are **three** call sites in each:
     the single-row "Fetch →" (`#btn-se-fetch`), the per-row bulk fetch, and "⚡ Fetch all URLs".
     The result object shape is identical to today's sync response, so only the network call
     changes — the field-mapping code stays.
3. **Test against the failing listing** (the one that timed out: a StreetEasy Williamsburg /
   UWS listing). Expected: `running…` for ~15-30s, then a full import with photos.
4. **Tune** if needed: `waitFor` (currently 3000) and `timeout` (55000) in
   `streeteasy-import-background.mjs`; poll interval / `timeoutMs` in `se-import.js`.
5. **Optional split** (the user's "store text then LLM separately" idea): if the Firecrawl
   `extract` LLM step is itself slow, change the worker to `formats:['markdown']` only (fast),
   store the raw markdown, and run a **separate `/claude` call** to structure the fields from
   it. Cleaner separation; more moving parts. Only do this if extract latency is the problem.

## Local test plan

```bash
git fetch origin claude/nice-bohr-nj42vw && git checkout claude/nice-bohr-nj42vw
# Netlify CLI with the real key so Firecrawl + Blobs work:
export FIRECRAWL_API_KEY=...        # same value as the Netlify env var
netlify dev                          # serves functions + static at localhost:8888
# Then open http://localhost:8888/tools/carousel/cb_editorial.html, paste the failing
# StreetEasy URL, hit Import, and watch: it should poll "Reading the listing…" then fill in.
# Direct function probes:
curl -s -XPOST localhost:8888/.netlify/functions/streeteasy-import-background \
  -H 'content-type: application/json' -d '{"url":"<listing>","jobId":"test1"}' -i   # expect 202
curl -s "localhost:8888/.netlify/functions/streeteasy-status?id=test1"              # poll until done
```

## Rollback

Nothing here changes the sync `streeteasy.mjs`. To revert the editorial tool to pure-sync,
restore its old `doImport()` fetch and drop the `se-import.js` include. The two new backend
files can stay (unused) or be deleted.
