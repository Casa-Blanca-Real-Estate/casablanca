# Dev notebook

Kimani's notes on the studio's software, written while he uses it: **Ctrl+.** (**⌘.** on a Mac) on
any studio page, even inside a text field, or the ✎ at the bottom left. Claude Code sessions read
them, pick them up, leave notes on them, and mark them off against their PRs.

Built 2026-09-29 by Mason, from a handoff written for MindBinder
([`handoff-mindbinder.md`](handoff-mindbinder.md), kept for reference). This file is what applies
here; where the two differ, the differences are listed at the end.

## For Claude Code sessions

```sh
npm run -s notebook                          # open notes; the first line counts them
npm run -s notebook -- --status=all          # or active (open + read), read, resolved, answered…
npm run -s notebook -- --tag=bug --surface=comp-report --limit=20
npm run -s notebook -- --id=dn_…             # one note: its context, history and screenshots
npm run -s notebook -- --id=dn_… --shots     # …and save the screenshots to open with Read
npm run -s notebook -- --id=dn_… --set=read --by=Mason                 # picking it up
npm run -s notebook -- --id=dn_… --note="Reproduced on Safari." --by=Mason   # a note on it
npm run -s notebook -- --id=dn_… --set=resolved --pr=61 --note="…" --by=Mason
npm run -s notebook -- --feedback            # the team Feedback list, no emails, each with its note
```

- It reads the live site's API with a key in the environment, `DEV_NOTEBOOK_KEY`, so it works from a
  cloud sandbox. Without the key it says so: tell Kimani and carry on. It never prints the key.
- **Resolved needs the PR that fixed it.** Answered, deferred, won't fix and duplicate need a
  `--note` saying why (or the answer, or which note it duplicates).
- **You can't delete a note**, by design: the CLI has no delete, and the API refuses a key one.
  Deleting happens only on the notebook page.
- A key can read, re-status and comment. It can't write a note or manage keys: notes are Kimani's.
- **Notes are not app data.** Nothing in a tool reads them; nothing in the comp report computes,
  stores or shows them. The comp report only *publishes* what's on screen for the capture box.

## Setup (Kimani, once)

1. **Netlify → Site configuration → Environment variables → `CR_ADMIN_EMAILS`**: both addresses,
   comma-separated — `casacalliste@gmail.com,creative@email.casa-blanca.com` (keep anything already
   there). The notebook signs in through the site's Identity, and Identity only lets in addresses
   the comp report admits. Then **Deploys → Trigger deploy**: a variable applies from the next deploy.
2. On production, open **`/tools/dev-notebook/`** and **Sign in with Google** with either address.
   That browser now has the capture box on every studio page, for 30 days. Sign in once per
   browser you use.
3. **Keys → Make a key → Copy.** In a Claude Code session, open the cloud environment menu in the
   title bar → **Edit** → add an environment variable **`DEV_NOTEBOOK_KEY`** with that value. New
   sessions pick it up. Never paste the key into a chat; if it leaks, revoke it on the notebook page
   and make another.

The dashboard shows a **Dev notebook** card when you're signed in to it (or logged in as
creative@email.casa-blanca.com). Deploy previews can't complete Google sign-in, so the notebook runs
on production.

## How it works

| Piece | Where |
|---|---|
| Capture box | `assets/dev-notebook.js` — loaded by `assets/studio-header.js` (every tool) and the dashboard, **only** in a browser signed in to the notebook |
| Notebook page | `tools/dev-notebook/index.html` — sign-in, the list, one note, re-status, comment, **delete**, keys |
| API | `netlify/functions/dev-notebook.mts` → `tools-src/dev-notebook/server/api.ts`, at `/api/dev/notebook/*` |
| Storage | `tools-src/dev-notebook/server/store.ts` — the only code that touches the Blobs store `dev-notebook` |
| Vocabulary | `tools-src/dev-notebook/vocab.ts` — tags, statuses, surfaces, the URL params it records |
| CLI | `tools-src/dev-notebook/cli.ts` (`npm run notebook`) |
| Local server | `tools-src/dev-notebook/dev/serve.ts` (`npm run dev:notebook`) — the site, the API, local Blobs, a stub sign-in, and the team Feedback function |
| Team feedback | `tools-src/feedback/feedback.ts` — the Feedback button's function; the page reads it through `GET /api/dev/notebook/feedback` |

**Who gets in.** Sign-in exchanges a Google sign-in (the site's Netlify Identity, verified with
Identity itself, fail-closed) for a notebook session, if the address is one of the notebook's —
`DEV_NOTEBOOK_EMAILS`, defaulting to Kimani's two. Sessions last 30 days; "sign out everywhere" ends
them all. Keys are for sessions. Making one needs a sign-in from the last 15 minutes, because a key
outlives the session that made it. Only hashes are stored, never a token. Every route is in one table
and every request is authenticated before its route runs, so a route added later can't ship
ungated.

**What a note records.** The text and tags; the page (path only), the allowlisted URL params
(`report`, `step`, `tab`, `view`, `id`, `slug`, `agent` — never a search box or a draft); the page
title; the window size, or nothing if it's unknown (never `0x0`); and whatever the page published in
`window.__cbCaptureContext`. The comp report publishes the open report's id, name, sample flag and
whether it's read-only. The server adds the commit (`COMMIT_REF`, else this deploy's
`/tools/comp-report/build.json`), the deploy id, the browser, and a coarse *surface*
(`comp-report/sort`, `tool/closed-carousel`, `dashboard`…). The line under the box shows it all
before you save.

**Storage.** One Netlify Blobs store, `dev-notebook`, strongly consistent:

- `notes/<id>`: the note, written once
- `events/<id>/<time>.<rand>.<status>`: one record per status change or comment
- `shots/<id>/<shotId>`: a screenshot
- `sessions/<id>`, `keys/<id>`: hashes

The history is append-only by construction: every change is a new record, so nothing is ever
overwritten, and two writers at once can't lose each other's entry. Blobs has no conditional writes,
so a single log would race. The status is the latest status record, read from the keys alone.
Deleting a note deletes its screenshots first, then its history, then the note, so nothing is left
behind.

**Limits.** A note is 8,000 characters. A note holds up to 8 screenshots of 5 MB each: PNG, JPEG,
WebP or GIF, checked by their bytes. Pastes over 1.5 MB are re-encoded in the browser. Published
context is 4 KB.

**Statuses.** `open` → `read` → `resolved` (needs the PR) or `answered` / `deferred` / `wontfix` /
`duplicate` (each needs a note). Anything can be reopened.

**Team feedback.** The page also shows what people send with the **Feedback** button on every studio
page (open *Team feedback*). That's a different thing from notes: anyone can send it, and it carries
names and emails. Signed in, the page shows it whole, and **Make a note** turns one piece into a note
(once: after that it links to the note). A key reads it with `--feedback`: the messages, names and
tools, never the emails, each with the note made from it, if any. A note made from feedback carries
the message and the sender's name, never the email, and `context.feedback` names its source.
Details in `netlify/functions/README.md`.

## Tests

`npm run test:dev-notebook` and `npm run test:feedback`, both run in CI's site build:

- the API on Blobs' own local server: the gate on every route, who may sign in, what a key can't do,
  the resolve rule, concurrent writers, screenshots, session expiry, and team feedback being
  session-only;
- the CLI over HTTP;
- the vocabulary, including a check that the widget's copy of it hasn't drifted;
- the structural rules: the CLI can't delete, every route is under `/api/dev/notebook`, only the
  store touches the store, the comp report never reads notes, and the box loads only when signed in;
- the Feedback function (`test:feedback`): posting stays open, no method reads the list back, ten
  sent at once all land, the old list is still read, and a failure doesn't echo its error.

## Where this differs from the handoff

- **Blobs, not a database table.** A cloud session can't reach the database anyway, so read-back
  goes over HTTPS with a key (the handoff's "DB unreachable" row). Blobs also keeps the notebook
  entirely apart from the comp report's data, and needs no migration.
- **One notebook for the notebook's addresses.** Both are Kimani, so there's no per-owner scoping.
  The author of each note is still recorded.
- **Statuses add `answered`**, for questions. Closing a note in any way except `resolved` needs a
  note, not just `wontfix` and `duplicate`.
- **Notes aren't edited** after saving. Add a note to the history instead.
- **Screenshots** can also be taken with *Capture this screen*: the browser asks each time.
