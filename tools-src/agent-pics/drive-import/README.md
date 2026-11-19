# The Drive photo import

Copies the photos in Kimani's Drive (`@ Profile Pics`: SQUARE, ROUND, `@ to do`, `@ Profile Pic RAWS`) into
the profile-pic store, so each agent's set shows in the Agent CMS and the profile pic roster. First run
2026-11-05: 1,485 files, 3.1 GB, 126 agents. The report is in project files, `agent-drive-photo-import/`.

It reads Drive through the folder's anyone-with-link sharing (`embeddedfolderview` to list, `drive.usercontent`
to download). No Google key. If Kimani turns that sharing off, it lists nothing.

```sh
mkdir -p /tmp/drive-import && cd /tmp/drive-import      # never inside the repo: it writes drive/
python3 <repo>/tools-src/agent-pics/drive-import/crawl.py
python3 <repo>/tools-src/agent-pics/drive-import/plan.py   # needs CB_PICS_TOKEN; prints counts and what it skipped
python3 <repo>/tools-src/agent-pics/drive-import/upload.py # dry run
python3 <repo>/tools-src/agent-pics/drive-import/upload.py --go [--only=slug,slug]
```

What it does, so a rerun is safe:
- **Only adds.** A photo type the agent already has, or an original with the same filename, is skipped.
  It never deletes or replaces.
- **Keeps the status.** Storing a finished photo sets the generate date to now, and an original stored now
  counts as newer than the last generate. Either one would mark every placement stale. So for an agent who
  already had a generate date, it dates originals a day before it and puts the date back afterwards.
  An agent whose first set this is reads "generated" once you set `pic.generatedAt` (see below).
- **Matching.** Full name first, then former names, then "First L." when only one agent fits. `ALIAS` in
  plan.py covers the folder names that differ from the CMS (King Coleman, Isabel Izzy Godwin, …).
  The newest file wins: `@ to do`, then generator-named files (`Name_SQ2_Clean.jpg`), then the old names.
  Anything it can't place is listed with the reason, never guessed.
- **Limits.** 50 originals an agent (the store's cap). JPEG, PNG and NEF only. Files whose owner turned
  off downloads come back as a "Can't download" page and are reported as failed.
- People in Drive who aren't in the CMS are reported as `nomatch`. Add them (below), then rerun.

## Changing the roster from a Claude session

`CB_CMS_TOKEN` and `CB_PICS_TOKEN` are in the cloud environment. With them a session can do what the CMS does.
Kimani asked for this (2026-11-06): "any time I ask Claude to do something like that, Claude is able to".
Production is `https://casa-blanca-creative-studio.netlify.app/.netlify/functions/…`.

| To | Call |
|---|---|
| Read the roster | `GET agent-store` (CMS token): every agent, status, face |
| Read one agent | `GET agent-store?slug=…` (the record) or `GET agent-pics?slug=…` (the photo side) |
| Add an agent | `POST agent-pics {"action":"create","slug","name","title","by"}`: a draft with a name and title |
| Edit their page fields | `POST agent-store {"action":"save","slug","draft","by"}`: send the whole draft back, read first |
| Archive / restore | `POST agent-store {"action":"status","slug","status":"archived"\|"draft","by"}` |
| Set the generate date or placements | `POST agent-pics {"action":"update","slug","pic":{…},"placements":{…},"by"}` |
| Store a photo | `upload.py`'s `put()`: `upload-start`, the parts, `upload-finish` |

Rules: a slug is `first-lastinitial` unless the photo library already names the person otherwise. Never
`live`/Publish from a session without Kimani's go: that changes a public page. Deleting an agent deletes their
photos too; archive instead. Sign every write with `by`. Never commit names with emails or phones.
