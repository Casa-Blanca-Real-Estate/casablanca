# Moving Casa's work onto Casa-owned accounts

**Asked for by** Erez, through Kimani, 2026-10-14: a Claude account for Casa (Casa pays), and the GitHub
repo and the other services moved from Kimani's accounts to Casa's. **When:** after the comp report is
built and mostly settled. **Written by** Casanova, 2026-10-14. The open questions are D-26 in
`docs/decisions.md`.

**Added the same day from the claude.ai side** (the Casa Blanca Project, which Casanova can't see): the
section *Claude Web*, the connectors row, the roundup-inbox problem, the desktop-app problem, the
personal/Casa boundary, and extra steps and questions. Additions are marked *(Web)*.

## The short version

- **Most of this is cheap, because the work already lives in the repo.** Every track's state is in its
  dispatch file, its PRs and the roster, and every track restarts from a kickoff; we did exactly that on
  2026-10-13. Moving the Claude account means restarting the tracks once more, in the new account.
- **Netlify is already Casa's,** and the site's data (the comp report database, Blobs, Identity users,
  the dev notebook) lives on the Netlify site, not on GitHub or Claude. None of it moves.
- **The key rotation is about an hour, not a day:** about ten values, one redeploy, and a check list
  (below).
- **The real cost is Claude-side context:** chats, Projects and memory don't move between accounts. The
  fix is to keep the repo as the one source of truth that both accounts read (below).
- **Do it in three steps, not one:** service keys first (before the pilot, if possible), then GitHub,
  then Claude.
- *(Web)* **The claude.ai side is a checklist, not "download and upload."** The Casa Blanca Project holds
  6 docs, 3 PDFs, 2 synced Google Docs and its own memory; three roundup skills depend on Gmail
  read/unread state, the desktop app's browser and the Post Log; and several artifacts hold Casa
  records. None of it is hard, but two pieces will break quietly if they're missed: **the desktop app
  being signed into one account**, and **the roundups' "unread = unused" rule** (safe while
  `casacalliste` stays the inbox and only one account runs roundups). See *Claude Web*.

## What moves, service by service

| Service | Today | Moves to | How | Watch for |
|---|---|---|---|---|
| **Netlify** | Casa's account | stays | nothing | After the GitHub move, **relink the repo** (Site → Build & deploy → Link repository). Deploys stop until you do |
| **GitHub repo** `kjcamron/casablanca` | Kimani's personal account | a Casa GitHub organization | Settings → Transfer ownership. PRs, history and branches go with it; GitHub redirects the old URLs | The Netlify relink above. The Claude GitHub App must be installed on the new org. **GitHub Pages doesn't redirect** (see *Problems*). The repo has no Actions secrets, so nothing is lost there |
| **Anthropic API** (`ANTHROPIC_API_KEY`: the assistant, the writer) | (confirm whose console) | a Casa org in the Anthropic Console, Casa's card | new key → Netlify → redeploy → revoke the old one | It processes client data from comp reports, so it should be Casa's before the pilot |
| **Vercel AI Gateway** (Jev, `AI_GATEWAY_API_KEY`) | not set yet; the plan was MindBinder's Vercel account | a Casa Vercel account | **make the key on Casa's account the first time**, not MindBinder's | Vercel's free plan is non-commercial, and zero retention needs Pro: both questions go away on a Casa account |
| **Firecrawl** (`FIRECRAWL_API_KEY`: StreetEasy reads) | (confirm whose account) | a Casa account | new key → Netlify → redeploy | Its daily read limit is per account (200 a day today) |
| **Claude** (claude.ai, Claude Code, Cowork) | Kimani's personal account | a Casa account | see *Claude* below | the part that takes thought |
| **Google** (`casacalliste@gmail.com`) | a Gmail Kimani made for Casa work; already Casa's official sign-in for services | *(Web)* **stays**, made Casa-held (D-26, question 2) | Casa-reachable password, a second person, recovery to `creative@casa-blanca.com` | The roundup skills read this inbox. It's also a default dev email (`tools-src/dev-notebook/vocab.ts`) and in `CR_ADMIN_EMAILS`, and none of that has to change |
| **Google sign-in branding** (optional) | Netlify's default client | a Casa Google Cloud client | Netlify → Identity → External providers | only if you want the sign-in screen to say Casa Blanca |
| **Make.com, Mailchimp, Wix, Webflow, Instagram token** | (confirm owners) | Casa's, if they aren't already | per service | Not in this repo, so check each one. The ISO automation runs in Make, and its Mailchimp connection lives inside whichever Make account owns it |
| *(Web)* **Claude connectors** (GitHub, Gmail, Google Drive, Make, Webflow, Calendar) | connected to Kimani's personal Claude account | reconnected in the Casa account | per connector, signed in as Casa's accounts | Connectors don't move between accounts. Gmail must sign into the inbox the roundups read; Drive must be able to see the two synced notes docs (see *Claude Web*) |

## The key rotation (the boring day, shortened)

Do each external key in this order: **make the new one → set it in Netlify → redeploy once at the end →
check → revoke the old one.** Revoking last means nothing goes dark in between.

**New keys from new accounts:** `ANTHROPIC_API_KEY`, `AI_GATEWAY_API_KEY`, `FIRECRAWL_API_KEY`, and the
Instagram token if it lives in Netlify.

**Internal secrets, freshly generated** (`openssl rand -hex 32`). They've lived in personal environments,
so replace them:
- `CB_CMS_TOKEN`, `CB_PICS_TOKEN`;
- `CR_DECIDE_KEY`, in Netlify and in the Claude Code environment, matching;
- `DEV_NOTEBOOK_KEY`: make a new key on the notebook page, then revoke the old one there.

**Config that changes value but isn't secret:** `CR_ADMIN_EMAILS`, `DEV_NOTEBOOK_EMAILS` (if the Gmail
changes), and `ALLOWED_ORIGIN` (if it names `kjcamron.github.io`).

**The Claude Code environment in the Casa account:** `DEV_NOTEBOOK_KEY`, `CR_DECIDE_KEY`,
`CR_EVAL_ANTHROPIC_API_KEY`. Never `DATABASE_URL`.

**The checks after the redeploy:**
- `/tools/comp-report/build.json` shows the new commit;
- `/api/comp-report/health` shows `ready` and `leastPrivilege: true`;
- one assistant reply, one StreetEasy link read, and one Jev call if it's live;
- the CMS and the roster open with their new tokens;
- `npm run -s notebook` works from a Casa-account session.

**Make new keys on Casa's accounts from now on.** The keys due soon (the Jev key, the writer's eval key,
`CB_PICS_TOKEN`, `CR_DECIDE_KEY`) can be made the Casa way the first time, so they never need rotating.

## Claude: what moves, what doesn't, and keeping two accounts in step

**What moves easily:**
- **Claude Code tracks.** Their state is in the repo. In the Casa account: connect GitHub, make a cloud
  environment (network policy, setup, the secrets above), then start each track from its restart kickoff.
  Casanova goes first.
- **Skills.** Copy `cb-copy`, `cb-in-contract-roundup` and `cb-just-closed-roundup` to the Casa account.
  **Keep `casa-invoice` personal:** it's how you invoice Casa as a contractor.
- **Project knowledge files.** Download them, then upload them to a Casa Project.

**What doesn't move, and the workaround:**
- **Chats and Project conversations.** Before switching, have one session in the old Casa Blanca Project
  write up anything that isn't already in the repo (a retirement dispatch, like the ones the unnamed
  sessions just did) into `docs/context/`. The old chats stay readable in your personal account.
- **Memory.** Export the Casa-relevant part of your personal memory and import it into the Casa account
  (Claude's import-memory skill does this). Leave the personal part where it is. The repo already
  carries your working style (`docs/context/casa-blanca.md` §6).
- **Artifacts.** These are owned per account:
  - **The Dispatch Ledger** is shared with MindBinder. Split it: a new Casa ledger in the Casa account,
    with Casa's lines copied across (a session can copy them with `ArtifactData`). MindBinder keeps the
    original.
  - **The caption tracker** (`claude.ai/artifact/U5g6cCuSs1igsswBWn5Jxc`) is linked from four builders:
    `tools/closed-carousel`, `tools/incontract-carousel`, `tools/forsale-carousel` and
    `tools/carousel/cb_editorial.html`. Recreate it in the Casa account, copy its records, and update
    the four links. Records kept in browser storage can't be copied.

**Keeping the two accounts in step.** The repo is the bridge.
- **The Casa account does all the building:** the tracks, Casanova, the artifacts, anything holding
  client or agent data.
- **Your personal account keeps planning your week.** It reads Casa's state from the repo through its
  GitHub connection (your GitHub user stays a member of the Casa organization):
  - `docs/decisions.md`: what's waiting on you;
  - the roster in `docs/dispatch/README.md`: what's in flight;
  - a short `docs/status.md` that Casanova would keep current at the end of each block: what merged,
    what's next, and your short list.
- **The line Casa sets (D-26):** status and planning in your personal account is fine. Client data,
  agents' contact details and comp reports stay in Casa's.
- **One upside:** Casa's work stops counting against your personal weekly limit.

## *(Web)* Claude Web: what's in the Casa Blanca Project today, and where each piece goes

### The Project itself

| Piece | Today | What to do |
|---|---|---|
| **Project docs (6):** `CB_Tool_Design_System.md`, `CB_ClientSite_BuildBrief.md`, `Casa_Blanca_Notes.md`, `claude/IG_Analytics_API_Setup.md`, the strategic analysis, `listing_carousel_builder.html` | personal account's Casa Blanca Project | Commit the ones still current into `docs/context/` so both accounts read them from the repo, then upload to the new Project. `listing_carousel_builder.html` is probably an old copy of what's in the repo now: check, and drop it if so |
| **Project files (3):** CB Buyers Guide, the Instagram growth instructions, the PostCall ICA | same | Download and upload |
| **Synced Google Docs (2):** `@ CB NOTES`, `@ CB IG Notes` | synced through the Drive connector of the account that owns them | These aren't files, so "download and upload" freezes them. Either share/move them into a Drive the Casa account's Drive connector can see and re-add them as synced sources, or (since the Casa desk replaced them for new notes) upload a one-time snapshot and stop syncing |
| **Project instructions** | empty | Write them in the new Project: a pointer to `docs/context/casa-blanca.md`, the social copy rules (normal capitalization and punctuation, never casual lowercase), and the D-26 line (client and agent data stay here) |
| **Project memory** (overview, tooling and platforms, ways of working, In Contract/Just Closed rules, Casa desk, the Ashley Epstein mailers, index) | already its own subtree in personal memory | Export these and import them (import-memory). Plus two account-level notes that are Casa's: the closings-pipeline plan (stale: it says only the personal Gmail is connected) and the Casa parts of the dev-workflow notes. **Fix stale lines on the way in** rather than copying them. Nothing else from personal memory moves |
| **Scheduled tasks** | none today | Nothing to move. Any set up before the move belong in whichever account owns that work |

### The roundup skills (the part most likely to break)

The three skills (`cb-copy`, `cb-in-contract-roundup`, `cb-just-closed-roundup`) do more than the
transfer list implies. They read the Casa Gmail, drive Creative Studio through the desktop app's
browser, and log to the Post Log. Each of those is account-bound.

- **"Unread = unused" is safe as long as `casacalliste` stays the inbox,** which it does (D-26,
  question 2). The Casa account's Gmail connector signs into the same `casacalliste`, so the read
  history comes along. Two things still break it: a second person reading that inbox once it's
  Casa-held, or both Claude accounts running roundups during the overlap. **Worth doing eventually, not
  urgent:** make the Post Log (or a Gmail label such as `CB/posted`) the record of used deals instead
  of read state. The Post Log already holds every post's addresses.
- **The skills name links:** the Post Log's URL changes when it's recreated. `casacalliste` stays.
- **Dry-run one Just Closed and one In Contract in the Casa account** before retiring the personal
  copies. During the overlap, only one account runs roundups and writes to the Post Log, the same rule
  as "only one Casanova."

### The desktop app and its browser

The roundups (and any Creative Studio work Claude does on screen) run through the built-in browser in
the Claude desktop app, and the desktop app is signed into one Claude account at a time. Its browser
pane keeps its own sign-ins (Creative Studio's Netlify Identity, Gmail, StreetEasy).

- **Decide which account the desktop app lives in.** Suggested: **desktop app → Casa account** (it does
  the building and the roundups); **personal account → a browser tab and the phone** (planning,
  MindBinder, everything else). Test this before committing, since personal on-screen tasks would then
  mean switching.
- **Plan for fresh sign-ins** in the browser pane after switching.
- A **separate Chrome profile for Casa** keeps the two Claude logins from colliding in the browser.

### Artifacts, beyond the ledger and caption tracker

| Artifact | Casa or personal | What to do |
|---|---|---|
| **Casa Blanca Post Log** (`claude.ai/code/artifact/db4dd026-033d-4b82-b7b9-1c2f8068f30d`) | Casa | It **is** the caption tracker the builders link to (`U5g6cCuSs1igsswBWn5Jxc`, checked 2026-10-14). Recreate it once in the Casa account, then update the four builder links and the skills |
| **Casa desk** (private notes + project tracker) | decide | It was built to be private to Kimani. In a Casa-owned account, assume Casa's admins can see it. Either move it and keep it work-only, or keep it personal and keep client/agent data out of it |
| **Comp Report Preview** | Casa | May hold client data: recreate in the Casa account if still needed, otherwise delete from personal |
| **Dispatch Ledger** | split | As above |
| **Vendors, Outreach CRM** | check | Move only if they're Casa's |
| **Bone Media Invoice Maker, KJ desk** and the rest | personal | Stay. The invoice maker and `casa-invoice` are how Kimani bills Casa |

### The boundary between Kimani and Casa

The account being Casa's is the point, and it changes who can see what.

- **Assume Casa's admins can see or export what's in the Casa account.** Import only Casa memory.
  Personal preferences, other projects, Bone Media and anything about Kimani himself stay in the
  personal account, not imported "for context."
- **Billing stays personal:** the invoice skill, the invoice maker and the invoice log.
- **Decide what's Casa's and what's Kimani's before the repo transfer.** Patterns he reuses elsewhere
  (the tool design system approach, the dispatch/kickoff method, skill structure) can be kept as a
  personal copy. If his contractor agreement says anything about IP, that governs, so check it rather
  than assume.
- **Past spend:** if any Casa API, Firecrawl or Claude usage has been on a personal card, step 1 below
  stops it, and the past amounts can go on an invoice.
- **After the move, clean Casa data out of the personal account:** the mailer memory (an agent's
  contact details and 29 client units), the Comp Report Preview, Post Log and desk records once copied,
  and any old chats with client data. Until this happens, D-26's line isn't actually true.

## Order of operations

1. **Now, at no cost:** make every new key on a Casa-owned account. Keep the repo as the record (it
   already is).
2. **Before the comp report pilot opens to more agents:** move the API keys that process client data
   (Anthropic, AI Gateway, Firecrawl) to Casa accounts. This is independent of GitHub and Claude.
3. **After the comp report settles, at a quiet point** (every PR merged, no session mid-phase):
   1. Create the Casa GitHub organization. Add Kimani's GitHub user as owner and one Casa person as
      a second owner, so the repo isn't stuck if Kimani is away.
   2. Transfer the repo and relink Netlify.
   3. Set up the Casa Claude account: connect GitHub, make the environment and its secrets, copy the
      skills, split the ledger, recreate the caption tracker, and import memory.
      *(Web)* Also: create the Project and write its instructions; upload the docs and files; re-share
      or snapshot the two synced notes docs; connect Gmail, Drive, Make, Webflow and Calendar as Casa's
      accounts; edit the skills' account and Post Log references; sign the desktop app and its browser
      pane in; decide on the Casa desk.
   4. Rotate the internal secrets in one redeploy, and run the checks.
   5. Restart the tracks in the new account from their kickoffs, Casanova first.
      *(Web)* Dry-run one Just Closed and one In Contract roundup in the Casa account.
   6. Archive the personal-account sessions.
   7. *(Web)* Clean Casa client and agent data out of the personal account (memory, artifacts, chats).

*(Web)* **Before anyone else gets into `casacalliste`:** move the roundups off read/unread state and
onto the Post Log or a label.

## Problems we'll hit

- **Netlify deploys stop after the repo transfer** until the repo is relinked.
- **GitHub Pages URLs change and don't redirect.** `agents/SCHEMA.md` and `netlify/functions/_lib.mjs`
  name `kjcamron.github.io`. If the Pages copy is still used, its origin changes, and `ALLOWED_ORIGIN`
  with it. If it isn't used, turn Pages off and drop those mentions.
- **Sessions are bound to the repo's name.** Running sessions in the personal account stop being useful
  after the move. Hence the quiet point and the restart kickoffs.
- **Only one Casanova at a time.** During the overlap, the personal-account Casanova stops writing once
  the Casa one starts.
- **Hard-coded Kimani addresses:** `casacalliste@gmail.com` is the dev notebook's default email
  (`tools-src/dev-notebook/vocab.ts`) and appears in its tests. Change it only if that inbox is retired.
  *(Web)* It isn't being retired (D-26, question 2), so these stay.
- **The Claude-account links:** the ledger link in `CLAUDE.md` and `docs/dispatch/README.md`, and the
  caption tracker link in four builders.
- **The Jev credits** ($25 on MindBinder's Vercel account) stay personal. Casa's Gateway account starts
  with its own.
- *(Web)* **The roundups' "unread = unused" rule** breaks if a second person reads `casacalliste`, or
  if both Claude accounts run roundups at once.
- *(Web)* **`creative@email.casa-blanca.com` can't connect to Claude** (a webmail proxy, no Google
  sign-in). The closings pipeline keeps reading `casacalliste`.
- *(Web)* **The desktop app is one account at a time**, and its browser needs fresh sign-ins.
- *(Web)* **Synced Google Docs don't upload;** they re-sync through a Drive the Casa account can see.
- *(Web)* **Memory import re-files rather than copies,** so review what lands, and fix stale lines first.

## *(Web)* Open questions to add to D-26

1. **Which plan does Casa buy, and who's the second admin?** It needs Projects, memory, connectors,
   artifacts with databases, the desktop app and Claude Code cloud sessions, with enough usage for
   parallel tracks. A seat with less headroom than today's setup would slow the tracks down. Sign it in
   with `casacalliste` (see 2), so it survives any one person once that account is Casa-held.
2. ~~Is `creative@email.casa-blanca.com` a Google Workspace mailbox?~~ **Answered (Kimani,
   2026-10-14): no.** There are three Casa addresses, and only one does everything:
   - `creative@email.casa-blanca.com`: a webmail proxy. No Google sign-in, so no Gmail connector.
   - `creative@casa-blanca.com`: on Casa's Google Workspace, but for sign-ins and admin only. It
     receives mail and can't send unless Casa pays for a full seat (about $20 a month).
   - `casacalliste@gmail.com`: already Casa's official sign-in for services, with Google features.

   **Recommendation: `casacalliste` stays the identity**, and the Casa Claude account signs in with it
   too. Don't move the accounts registered to it to `creative@casa-blanca.com`: that means re-registering
   or transferring every service for no gain, and a paid seat only to send mail. Instead, make
   `casacalliste` Casa-held: its password in a place Casa can reach, a second person who can get in,
   and recovery set to `creative@casa-blanca.com` (receiving is all recovery needs) rather than
   Kimani's personal email or phone. The paid seat stays a separate, later question, only if Casa wants
   to send as `creative@casa-blanca.com`.
3. ~~Are the Post Log and the caption tracker the same thing?~~ **Answered (Casanova, 2026-10-14): yes.**
   The builders link `claude.ai/artifact/U5g6cCuSs1igsswBWn5Jxc`, which is the Casa Blanca Post Log;
   the `claude.ai/code/artifact/…` address is the same artifact. One tracker to recreate, not two.
4. **Does the Casa desk move, or stay personal and work-data-free?**
5. **What stays Kimani's** (reusable patterns, anything his contractor agreement covers)?

## What it unlocks

- ~~Connecting `creative@email.casa-blanca.com` to the Casa Claude account~~ *(Web)* That address has
  no Google sign-in, so it can't connect. **What the move does unlock:** the closings pipeline
  (`docs/context/casa-blanca.md` §5) runs entirely in the Casa account against `casacalliste`, with
  nothing passing through Kimani's personal Gmail or personal Claude account. If closing emails still
  arrive only at `creative@email.casa-blanca.com`, forwarding them to `casacalliste` (or through Make)
  is the bridge.
- **Client data processed on Casa's keys,** under Casa's terms, before the pilot widens.
- **A second owner on every account,** so Casa's tools don't depend on one person's logins.
