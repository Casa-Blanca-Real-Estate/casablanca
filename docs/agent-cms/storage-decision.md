# Where the agent records live — two shapes, and a recommendation

**Dispatch 03, decision 1.** Casanova and Kimani pick; this session does not pick silently.
Written 2026-09-14 against Dispatch 02's *draft* schema — 02 had not landed when this was
written, so the field list here tracks `docs/dispatch/02-agent-sites-foundations.md` §1 plus
`docs/context/agent-site-template.md` §1, and 02 remains the schema's owner.

The CMS as built runs on **Option A**. That choice is isolated behind one seam (see §4), so
switching to B is a rewrite of one function, not of the tool.

---

## The question

An agent site is one JSON record. Three things touch it:

1. **The CMS** writes it (Kimani, from a browser).
2. **The build** reads it (`agents/build.js`, at deploy time) and emits `<slug>/index.html`.
3. **A human** occasionally needs to read the history of it — what changed, when, by whom, and
   how to get the previous version back.

Netlify Blobs and git both do (1) and (2). They differ sharply on (3), and on what has to be
true about authentication for (1) to be safe.

---

## Option A — Netlify Blobs is the live store, git gets periodic exports

The CMS writes to a Blobs store (`cb-agents`). The build reads the same store and generates
pages. A scheduled or manual export writes the records back into `agents/data/*.json` and commits
them, so git carries a readable trail even though it isn't authoritative.

**What it costs to build:** one function, `@netlify/blobs`, zero new credentials. This is the
same shape as `site.mjs`, `sessions.mjs` and `agents.mjs` — a pattern already in production here.

### Good

- **Nothing new in the auth surface.** Blobs is ambient on Netlify: no token to issue, store,
  rotate or leak. The only secret the write path needs is the one gating the endpoint itself.
- **Writes are instant and atomic-per-record.** No merge conflicts, no rebase, no "someone else
  pushed". At 20 agents and one editor that matters less than it sounds, but it means the CMS
  never has to show a conflict UI.
- **Publishing and editing are the same speed.** A draft save is a blob write — tens of
  milliseconds. Kimani can type, save, and look at the preview without a build in between.
- **The build is a plain read.** `build.js` fetches records and renders. No git plumbing inside
  the build.

### Bad

- **History is whatever we build.** Blobs has no versioning. Everything in §3 that git gives free
  — diff, blame, revert, "what did this look like in June" — has to be implemented, backed up, or
  given up. The draft/live split in §4 covers *one* step of rollback and nothing deeper.
- **The export is a second system that can silently stop working.** A cron that quietly fails
  leaves git looking authoritative and being months stale. That is worse than no export, because
  it invites someone to trust it.
- **Blobs is invisible from the repo.** Someone reading `agents/data/` sees a snapshot with no
  indication of how fresh it is. Requires a loud README in that directory.
- **Recovering from a bad write is manual.** If Kimani pastes a bio into the wrong agent and
  publishes, the previous `live` snapshot is one undo deep, and then it's the last export.
- **Ties the content to the host.** Moving off Netlify means moving the store.

---

## Option B — git is the source of truth, the CMS commits through the GitHub API

The CMS writes by calling the GitHub Contents API: read `agents/data/<slug>.json`, apply the
edit, commit. Publishing is either a commit to `claude/main` (which Netlify already builds) or a
PR that Casanova merges. The build reads the checked-out files, exactly as `build.js` does today.

**What it costs to build:** one function holding a GitHub token, plus commit/PR plumbing, plus
handling the cases where a write races a human's own commit.

### Good

- **History is free and complete.** `git log agents/data/sam-valk.json` is the audit trail.
  Every field change is diffable. Reverting is `git revert`. Nothing to build, nothing to back
  up, nothing that can silently stop.
- **Review-before-publish is free too.** If publishing opens a PR, Casanova reviewing agent
  content is the same motion as reviewing code, with the diff rendered. That is a genuinely
  strong fit for *published claims about real people's careers* — the case where a second pair of
  eyes matters most, and the case Dispatch 03 flags hardest.
- **One source of truth, visible in the repo.** No export, no staleness question. What you read in
  `agents/data/` is what is live.
- **Portable.** The content moves with the repo, independent of Netlify.
- **The build needs no change at all.** `build.js` already reads these files.

### Bad

- **It puts a GitHub write token in the auth surface** — and that is the expensive part. A token
  that can commit to this repo can commit *anything* to this repo, including to
  `netlify/functions/`. A compromised CMS endpoint stops being "someone edited an agent bio" and
  becomes "someone has repo write access." Mitigable with a fine-grained PAT scoped to contents
  on one repo, but the blast radius is still the whole repo, not one directory.
- **Every save costs a round trip and a commit.** Autosaving drafts into git would produce an
  unreadable log, so drafts need somewhere else to live anyway — which reintroduces a second
  store and most of Option A's plumbing alongside B's.
- **Publishing takes a deploy.** Fine. *Previewing* taking a deploy is not fine — the preview is
  the point of this slice, and a Netlify deploy preview per draft save is slow enough to change
  how the tool feels.
- **Races are real, if rare.** Kimani edits in the CMS while a session edits the same file on a
  branch. At 20 agents and one editor this is unlikely, but the failure mode is a lost write and
  the CMS has to detect it (compare SHAs) and say so.
- **Review-before-publish has a cost of its own.** It is only a feature if a reviewer is actually
  there. Kimani works Casa three days a week; Casanova is a session that has to be running. A PR
  that nobody merges is a site that doesn't go live, which collides with "never block a launch on
  someone doing something."

---

## Recommendation

**Start on Option A. Keep the door to B open, and revisit once the schema is settled.**

The reasoning, in order of weight:

1. **The preview is the point of the slice, and B makes previewing slow.** Draft → preview → live
   only works if preview is immediate. Under B, either drafts live outside git (in which case you
   are running both systems) or a preview costs a deploy.
2. **B's real prize is review-before-publish, and we can't staff it yet.** PR-gated publishing is
   the best answer to "these are published claims about real people" — but only with a reviewer
   who is reliably present. Right now Kimani is the only person who can change anything and works
   three days a week. A gate nobody is standing at is a stalled launch, not a safeguard.
3. **B widens the auth surface at exactly the moment we are admitting the auth is thin.** See
   `security-model.md`: the write path is currently protected by a shared secret, which is honest
   about being one password for one person. Putting a repo-write GitHub token behind one shared
   secret means that secret now guards the repository. Blobs needs no such token.
4. **A's worst weakness — no history — is the one we can partly buy back cheaply.** The draft/live
   split gives one-step rollback today. A weekly export gives coarse history for the cost of a
   scheduled function. Neither matches git, and the doc should not pretend otherwise.

**What would change the recommendation:** if Casanova is going to be a standing reviewer on agent
content, B's PR flow is the better product and worth its costs. That is a staffing question, not
a technical one, which is why it is Casanova's and Kimani's call and not this session's.

---

## §4 The seam — what has to change to switch

Everything storage-specific lives in `netlify/functions/agent-store.mjs`, in four functions:

```
readRecord(slug)      →  record | null
writeRecord(slug, r)  →  void
listRecords()         →  record[]
deleteRecord(slug)    →  void
```

The HTTP surface above them, every validation rule, the token check, the draft/live snapshot
model and the whole CMS front end are storage-agnostic. Switching to B means reimplementing those
four against the GitHub Contents API and deciding where drafts live. The CMS does not change.

The record shape is the same either way — one JSON object per agent — so an Option A → B
migration is "export the blobs into `agents/data/` and commit", which is the export job Option A
wants anyway. **Building the export first is therefore the cheapest possible hedge**, and it is
the one follow-up worth doing regardless of which option wins.

### The draft/live split

Stored under one key per slug:

```jsonc
{
  "slug": "sam-valk",
  "status": "draft",         // draft | live | suspended | archived
  "draft":  { /* the record being edited */ },
  "live":   { /* the last published snapshot, or null */ },
  "previewToken": "…",       // read-only, per agent, rotatable
  "updatedAt": "…", "publishedAt": "…"
}
```

The build reads `live`, never `draft`, and only for `status === "live"`. So:

- Editing a live agent cannot change the public site until Publish is pressed.
- **Rollback is one step deep**: after publishing, `live` holds the new copy and the old copy is
  gone. "Revert to the published version" works for *un*published edits, not for a bad publish.
  That is the honest limit of Option A without an export.
- Suspending flips `status` and leaves `live` intact, so unsuspending republishes the same page
  rather than an empty one.

---

## The constraint that applies either way

**`@netlify/blobs` must not be bundled with esbuild** (`CLAUDE.md`, `casa-blanca.md` §2) —
`node_modules` ships in the zip instead.

`netlify.toml` currently sets `node_bundler = "esbuild"` **globally**, and `site.mjs`,
`sessions.mjs` and `agents.mjs` all import `@netlify/blobs`. Those three are therefore built in
the configuration the constraint forbids, and have been for some time while apparently working.

This session did not resolve that contradiction, because resolving it either way is a live risk
to three daily-use tools and this slice is not the place to take it:

- If the constraint is current, three shipped functions are mis-bundled and need per-function
  overrides — a change that should be made and *verified on a deploy*, not assumed.
- If the constraint is stale, `CLAUDE.md` is carrying a rule that no longer applies and should be
  corrected, because it will keep costing sessions time.

What was done instead: the new `agent-store` function gets its own scoped override, so it obeys
the written constraint without touching how anything else deploys.

```toml
[functions."agent-store"]
  node_bundler = "none"
```

**Casanova: this needs a verdict.** Either is fine; the current state — a written hard constraint
that the committed config contradicts — is not.
