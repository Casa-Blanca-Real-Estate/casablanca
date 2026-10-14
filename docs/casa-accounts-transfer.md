# Moving Casa's work onto Casa-owned accounts

**Asked for by** Erez, through Kimani, 2026-10-14: a Claude account for Casa (Casa pays), and the GitHub
repo and the other services moved from Kimani's accounts to Casa's. **When:** after the comp report is
built and mostly settled. **Written by** Casanova, 2026-10-14. The open questions are D-26 in
`docs/decisions.md`.

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

## What moves, service by service

| Service | Today | Moves to | How | Watch for |
|---|---|---|---|---|
| **Netlify** | Casa's account | stays | nothing | After the GitHub move, **relink the repo** (Site → Build & deploy → Link repository). Deploys stop until you do |
| **GitHub repo** `kjcamron/casablanca` | Kimani's personal account | a Casa GitHub organization | Settings → Transfer ownership. PRs, history and branches go with it; GitHub redirects the old URLs | The Netlify relink above. The Claude GitHub App must be installed on the new org. **GitHub Pages doesn't redirect** (see *Problems*). The repo has no Actions secrets, so nothing is lost there |
| **Anthropic API** (`ANTHROPIC_API_KEY`: the assistant, the writer) | (confirm whose console) | a Casa org in the Anthropic Console, Casa's card | new key → Netlify → redeploy → revoke the old one | It processes client data from comp reports, so it should be Casa's before the pilot |
| **Vercel AI Gateway** (Jev, `AI_GATEWAY_API_KEY`) | not set yet; the plan was MindBinder's Vercel account | a Casa Vercel account | **make the key on Casa's account the first time**, not MindBinder's | Vercel's free plan is non-commercial, and zero retention needs Pro: both questions go away on a Casa account |
| **Firecrawl** (`FIRECRAWL_API_KEY`: StreetEasy reads) | (confirm whose account) | a Casa account | new key → Netlify → redeploy | Its daily read limit is per account (200 a day today) |
| **Claude** (claude.ai, Claude Code, Cowork) | Kimani's personal account | a Casa account | see *Claude* below | the part that takes thought |
| **Google** (`casacalliste@gmail.com`) | a Gmail Kimani made for Casa work | `creative@email.casa-blanca.com`, or keep it | D-26 | The roundup skills read this inbox. It's also a default dev email (`tools-src/dev-notebook/vocab.ts`) and in `CR_ADMIN_EMAILS` |
| **Google sign-in branding** (optional) | Netlify's default client | a Casa Google Cloud client | Netlify → Identity → External providers | only if you want the sign-in screen to say Casa Blanca |
| **Make.com, Mailchimp, Wix, Webflow, Instagram token** | (confirm owners) | Casa's, if they aren't already | per service | Not in this repo, so check each one |

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
   4. Rotate the internal secrets in one redeploy, and run the checks.
   5. Restart the tracks in the new account from their kickoffs, Casanova first.
   6. Archive the personal-account sessions.

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
- **The Claude-account links:** the ledger link in `CLAUDE.md` and `docs/dispatch/README.md`, and the
  caption tracker link in four builders.
- **The Jev credits** ($25 on MindBinder's Vercel account) stay personal. Casa's Gateway account starts
  with its own.

## What it unlocks

- **Connecting `creative@email.casa-blanca.com` to the Casa Claude account** removes the blocker on the
  closings pipeline (`docs/context/casa-blanca.md` §5). The work inbox can be read without forwarding
  anything into your personal Gmail.
- **Client data processed on Casa's keys,** under Casa's terms, before the pilot widens.
- **A second owner on every account,** so Casa's tools don't depend on one person's logins.
