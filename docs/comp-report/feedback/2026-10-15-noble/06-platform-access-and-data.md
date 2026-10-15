# The platform: access, sharing, data, logs and samples

**In short**
- Admins can already open anyone's report by its link and see it read-only. What's missing is the list (it filters to the owner, `server/api/reports.ts:111`) and mentors (no policy admits them). That's a small build, and it unblocks Kimani opening Noble's report.
- NW-091's "We couldn't check your access" is a bug, not a setup problem: `@netlify/identity`'s `acceptInvite()` never writes the `nf_jwt` cookie that `src/session.ts` reads, so the first `/me` call goes out with no token. A small fix.
- For sessions reading production, build a key-gated read-only inspection API, not a database role. Writes go only to a fixed test user. The sign-in log, the activity log, the sample reset and the Feedback draft fix are all invisible to layout and can ship before Claude Design.

| Id | Who | What | Class | Track | Phase |
|---|---|---|---|---|---|
| NW-054 | Kimani | Sample report: one-click reset, and a co-op sample for the no-size flow | BUILD | Mason | A-now |
| NW-088 a | Kimani | Admins and mentors see everyone's reports in the list, read-only | BUILD | Mason | A-now |
| NW-088 b | Kimani | How others' reports sit in the list: filter and search by agent | DESIGN | Claude Design | B-after-design |
| NW-089 a | Kimani | Share a report with named users (viewer or editor) | BUILD | Mason | B-after-design |
| NW-089 b | Kimani | The Share control, who-has-access, the Shared badge | DESIGN | Claude Design | B-after-design |
| NW-090 a | Kimani | Sessions read production, read-only: API behind a key or a database role | DECIDE | Mason | A-now (after the call) |
| NW-090 b | Kimani | Sessions write only to a test user's data; copy a real report into it | BUILD | Mason | A-now (after 090 a) |
| NW-090 c | Kimani | Duplicate a report; transfer one (admin) | BUILD | Mason | B-after-design |
| NW-091 a | Kimani | "We couldn't check your access" after accepting an invite | FIX | Mason | A-now |
| NW-091 b | Kimani | Sign-in log, so a failure explains itself | BUILD | Mason | A-now |
| NW-092 | Kimani | Masthead takes half a laptop screen; design for shorter displays | DESIGN | Claude Design | B-after-design |
| NW-096 | Kimani | Move to the Casa Claude account before launching new sessions | DECIDE | Casanova | A-now |
| NW-097 | Kimani | Record the next walk-through (Meet's recorder needs a business plan) | DECIDE | Kimani | A-now |
| NW-098 | Kimani | Feedback box loses a typed draft | FIX | Mason | A-now |
| NW-099 | Kimani | Usage log: steps reached and actions, to review a walk-through | BUILD | Mason | A-now (after 091 b) |
| NW-100 | Kimani | Word count, words per minute, more subagents | NOOP | Casanova | A-now |

## Security and RLS: what these changes touch

This is the part to read twice. Each row is a place where the obvious change quietly widens access.

| Where | Today | The catch |
|---|---|---|
| `can_see_report()` in `20260925000000_comp_report_foundations.sql` | One function, used by the select, insert and update policies of `report_comps`, `reasons`, `messages`, `imports`, `link_reads`, `narratives` | Widening it to mentors or shared users would also let them **write** at the database layer. Split it first: `can_read_report` (owner, admin, mentor, member) and `can_edit_report` (owner, editor member). Point every insert and update policy at `can_edit_report`. |
| `observations_select` | `created_by = actor or admin` | A mentor, a shared user, or a report's new owner would open a report and see **comps with no facts**. Widen it to `can_read_report(report_id)` for rows that have a report. |
| `reports_update` | The owner or an admin | Its `with check` stops an owner handing a report to someone else (the new row's owner isn't them). So transfer is admin-only in v1. |
| `users_select` | Own row; admins and mentors see all | Agents can't list teammates, so a share picker can't be a directory. Type an email and validate it with `decide()` (Casa domain or allowlist). |
| Mentor read access | Not allowed anywhere | A mentor sees every agent's client names, notes and the agent's own call and target (the figures Hubert never sees). Same spirit as D-8. Say so in the agent-facing copy. |
| `report_members` against `reports` | New | `reports_select` would read `report_members`, whose own policy would read `reports`: Postgres rejects that as infinite recursion. Keep an `owner_email` copy on `report_members` (updated on transfer) so its policy never reads `reports`. |
| The decide key's actor | `system` (`server/api/decide.ts`) | Several policies admit any `system` actor broadly (`users_select`, `users_update`, `allowlist_select`). The inspect key must **not** reuse it. Give it its own actor kind with select-only policies, so read-only is the database's guarantee, not the code's. |

Nothing here needs a production connection from a session. Migrations need unique timestamps, and each new table needs the `comp_report_app` grant block the earlier migrations carry.

## NW-054 · Sample reset, and a co-op sample

**Today.** There is no standing sample report. An admin makes a normal report and clicks Fill with sample (`Workspace.tsx:506`, `canSample = admin && !readOnly`). The fill is stitched together in the browser: `/sample`, `/imports {sample:true}`, `/comps {sample:true}`, then PATCHes. The co-op variant exists only in `dev/seed-report.mjs` (`coopCsv()` strips Sqft and sets Co-op); production has no way to make one.

**Why in-place reset won't work.** `reasons` and `messages` are append-only (`refuse_change` triggers; the app role can't delete). A tester's tiers can be re-recorded, but Hubert's transcript and any extra reasons can't be cleared. A reset in place leaves Hubert remembering the last test.

**Do.** Reset = *replace*. A server function `buildSampleReport(variant)` (condo or co-op) does what the browser does now, in one transaction. "Reset sample" creates a fresh report with the same title, then sets the old one `status = 'archived'` (the list already hides archived). Move the sample out of the browser and Fill with sample can call the same function. The co-op variant is the same Barclay export with Property Type Co-op and no sizes (port `coopCsv()` into `server/sample/`), the intake without `areaSqft`, and `SAMPLE_TIERS` without the size tags (they need both sizes). Both buttons live in the Build notes menu that already exists. The new report has a new link, which is the one cost.

Who may use it: admins only today. Noble and Kara are mentors and can't. Recommend admins and mentors (question below).

## NW-088 · Everyone's reports

**Today.** `reports.ts:111` lists `where r.owner_email = $1`, for admins too. Opening a report works for an admin: `reportFor(..., write=false)` (`workspace.ts:77`) and `messages.ts:29` admit admins, the UI turns on `readOnly` when the owner isn't you, and the header shows "Read only" (`WorkspaceHeader.tsx:36`). Mentors are admitted nowhere. **Stopgap now:** ask Noble for the address bar of his report (`?report=<id>`); Kimani can open it today.

**Do (a).**
- `GET /reports?scope=all` for admin and mentor, with `?owner=` and a 200-row cap. Same columns plus the owner; show the owner in the existing client line, so the table doesn't change shape.
- Add mentor to `reportFor` (read), `messages.ts`, `reports.ts` GET `?id=`, and to `can_read_report` and `observations_select` (see the security table).
- Keep it read-only for everyone who isn't the owner. No "act as owner": every row stamps `created_by` with the actor, so an admin editing through the owner's door would write the wrong name. To change someone's report an admin transfers it (090 c) or is added as an editor (089).
- Log the opening of someone else's report in the access log (091 b), once per 30 minutes per pair.
- Update the tooltip: "Admins can read it" now includes mentors.

Mentors see all, not "their agents". Per-mentor assignment needs someone to maintain it, and the repo's rule is not to build on agent responsiveness. **(b) DESIGN:** a segmented Mine / Everyone's control, search, and a sort by agent.

## NW-089 · Share a report

**Today.** One owner column. Nothing else.

**Do (a).** Table `comp_report.report_members (report_id, member_email, role viewer|editor, owner_email, added_by, added_at, removed_at)`, keyed on `(report_id, member_email)`. Soft removal. Membership is by email, with no FK to `users`, so you can share before the person has signed in; check the address with `decide()`. Replace the raw `owner_email = $2` tests with one `reportAccess(tx, user, id)` returning `owner | editor | viewer | admin | mentor`; there are 17 `reportFor` calls plus raw tests in `reports.ts`, `messages.ts`, `turn.ts` and `workspace.ts:317`. The API returns `access` on the report so the UI's `readOnly` stops being "owner is not me" (`Workspace.tsx:272`). Shared reports appear in the list for members.

Defaults: editors do everything but share, transfer and archive; Hubert stays owner-only in v1 (`turn.ts:60`, and the drawer already says so). Viewers read, including the Hubert transcript.

With 088, mentors and admins no longer need a share, so what's left is agent to agent. That's why this is phase B: the entry point and the who-has-access display are layout, and Design is about to decide them. **(b) DESIGN:** where Share lives, the people list, a Shared badge.

## NW-090 · Sessions and production data

Kimani's ask has four parts. Grant-access-between-users is 089. The rest:

**(a) Reading production: recommend an inspection API, not a read-only database role. DECIDE.**

| | Inspection API behind a key (recommended) | Read-only Postgres role |
|---|---|---|
| Fits the repo's rule that sessions never connect to production | Yes. It's HTTPS, like the decide key | No. The rule would be rewritten |
| Redaction (client names, notes, Hubert text) | Built into each view | None. A role reads whole rows |
| Audit | Every call logged, key never logged | Postgres logs aren't ours to read |
| RLS | Own actor kind with select-only policies | Needs the same policies and a new login path through `enter()`, because with no settings FORCE RLS shows a role nothing |
| Secret in the session | One header value, rotated in Netlify | A connection string with a direct line to the database |
| Ad hoc questions | Each new view is a small change | Any SELECT. This is its one real advantage |
| Can we even create the role? | n/a | Unknown; `/health` `leastPrivilege` says whether the connecting role may manage roles |

**Do.** `/api/comp-report/inspect`, key in `X-Inspect-Key` from `CR_INSPECT_KEY` (32+ characters, constant-time compare, wrong key is a 401 and never falls through to Identity, every use logged without the key), copied from `server/api/decide.ts`. Named views only, no SQL: reports (with stage and counts), one report's workspace (reuse `loadWorkspace`), comps and reasons, usage, access log, activity log, health. **No raw SELECT endpoint.** By default it redacts `brief.clientName`, `clientNote`, comp notes and Hubert's message text; `?text=1` returns them and the call is logged with the report id. Make the key on the Casa account (D-26).

**(b) Writing: only as a fixed test user. BUILD.** A second key, `CR_TEST_KEY`, lets `requireUser` return one fixed user (`CR_TEST_USER_EMAIL`, an address on a reserved domain such as `sessions@test.invalid`, which `decide()` refuses for real sign-in). Every existing endpoint then works for that user, and RLS confines it to its own rows. That is "a developer's own" data, enforced by the database rather than a flag on every table. Add `users.is_test` so test users drop out of lists and usage counts. An inspect action `copy-to-test` copies a real report (client name scrubbed) into the test user, so a session can reproduce a bug on a copy. The test user can spend Anthropic budget through Hubert; it shows in `usage`.

**(c) Duplicate and transfer. BUILD, phase B.** Duplicate copies brief, state, target, imports, observations (as the new owner, so they're readable), link reads, comps with note, tags and features, and the latest reason per comp (replayed, because tiers change only by recording a reason). It doesn't copy Hubert's transcript, narratives or usage. Transfer is admin-only: the target needs a `users` row (they've signed in once), and `report_members.owner_email` is updated. Owner-initiated hand-off is a later change to `reports_update`, using the `cr.applying_reason`-style transaction flag.

## NW-091 · Sign-in

**(a) The stale session. FIX.** The cause, from the code:
1. `SignIn.tsx` `AcceptInvite` calls `session.acceptInvite` (`src/session.ts:93`), which calls the library's `acceptInvite`.
2. In `@netlify/identity` 2.0.0 (`dist/main.js:851`) that function stores the session but, unlike `login` (`:409`), never calls `setBrowserAuthCookies`. No `nf_jwt` cookie.
3. `App.tsx` fires `/me`. `session.token()` calls `refreshSession()`, which returns early because the token isn't near expiry, then reads the missing cookie (`session.ts:76-82`). The request goes out with no `Authorization` header.
4. The server answers 401 `signed_out`. `NotAuthorised` shows "We couldn't check your access" for any status that isn't 403.
5. Sign out and in runs `login()`, which writes the cookie. That's why it fixes itself.

Fix: after `acceptInvite` succeeds, call `login(email, password)` with the same password to set the cookie (or make `token()` fall back to `hydrateSession()`). On the error screen, replace the bare Sign out with Try again for a 401, and print the code on screen ("signed_out, no token") so a user can read it out. This can't be proven in the sandbox, which has no Identity. **Check:** one real invite to a second address, after it lands.

**(b) The sign-in log. BUILD.** Today the gate writes one `console.log` line per decision (`identity-events.ts`), and no session can read them (docs/decisions.md says so). Add `comp_report.access_events`: `at, kind, outcome, reason, email, domain, provider, via, role, report_id, browser`. Kinds: Identity validate/signup/login (same hook as the log line); a `session_start` written in `requireUser` when `last_seen_at` is older than 30 minutes (that code already runs a write then); a `refused` row for every `requireUser` refusal where Identity did verify someone (`not_authorised`, `disabled`, `unconfirmed`, `address_unverified`); and `viewed_other` from 088. As in CR-1.1, a refused person who isn't a user is stored by **domain only**. No IP addresses.

A request with no token tells the server nothing about who, so it isn't logged per request (an open endpoint that writes rows invites spam). 091 a removes that failure, and the on-screen code covers the rest. Read it in the Access panel (admin, already collapsed on the Reports page) and in the inspect API. Insert-only for the app role; a scheduled function trims rows older than 13 months, as the drift check is scheduled.

I could not read ledger line `casa-r12-2`: its text lives in the ledger's database, not the page. If it records Noble's failure, Mason should check that the cause above matches it.

## NW-092 · The masthead on a short laptop

On the Reports page the hero is the masthead: `.sh-hero h1` is 112px, two lines (`Comp<br>report`), on top of 72px of padding, a 32px gap and the intro (`shell.css:110-112`). That's about 340px before the table. The only media queries are width-based (`.sh-narrow`, and two in `styles.css`); none looks at height. Design call: a hero that shrinks with viewport height, or collapses to a bar once there are reports. Also check the report bar and the shared Studio header (`assets/studio-header.js`, which every tool shares) on a 1280x720 viewport.

## NW-096 · The Casa Claude account

The plan, inventory and key rotation are in `docs/casa-accounts-transfer.md`; the open questions are D-26. Sessions can't move between accounts, so **anything dispatched before the move is dispatched twice.** Recommend: no Phase A dispatch starts until the move is done; use the days before it to answer D-26 questions 1 and 2 (which keys, which plan, who's the second admin) and to write the dispatches. Tracks restart from their kickoffs, as on 2026-10-13. Add to the rotation list: `CR_INSPECT_KEY` and `CR_TEST_KEY` are new and should be made on the Casa side the first time, with `CR_DECIDE_KEY`.

## NW-097 · Recording the next walk-through

Meet's recorder needs a Workspace tier Casa may not be on, and no notetaker was connected. Options: (1) upgrade the host seat (Kimani is a Workspace admin and can see what it costs); (2) record on Kimani's machine, screen and microphone, whatever the call app; (3) no video, and use the activity log (NW-099) plus notebook notes. Recommend (2) now, with (3) as the backstop; upgrade only if walk-throughs become routine. No code.

## NW-098 · The Feedback box loses its draft

**Today.** `assets/feedback.js` closes the tray on any outside `mousedown` (`onOutside`, line 60) and on Escape, and stores nothing, so the text is gone. Only a successful send clears it on purpose. The notebook's capture box (`dev-notebook.js:164`) already keeps its draft in `sessionStorage`; this one never got that.

**Do.** Save name, email and message to `localStorage` on every input (`cb.feedback.draft`, in try/catch), restore on open, clear on a successful send. Stop closing on an outside click while the message has text. Feedback.js is loaded by `studio-header.js` on every tool, so check it on two tools. `studio-header.js` itself isn't touched.

## NW-099 · Usage log

**Today.** `usage` records model calls only (its `provider` check allows `anthropic` and `jev`). Much of a walk-through is already recoverable from the report itself: tier changes with times (`reasons`), Hubert's transcript (`messages`), comps added and removed, the stage reached. What's lost is anything overwritten in place (notes and tags have only `updated_at`), screens visited, and UI errors.

**Do.** `comp_report.activity (at, user_email, report_id, session_id, kind screen|action|error, name, detail)`.
- **Semantic events, not clicks.** `import.read`, `comp.added`, `comp.tiered`, `comp.removed`, `call.given`, `narrative.copied`, `report.sent`, `screen.sort`, `screen.findings`. Design is about to rework every control; events named for what happened survive that.
- **Server-side first.** The handlers for imports, comps, workspace PATCH, narratives and turns already know what happened; emit there. The only client events are `screen.*` (from the router, whose screen ids the design port fixed) and `error.*` from `ErrorBoundary`.
- **Closed vocabulary, no free text.** Names come from a list; `detail` is a few enums and counts, validated per name. No addresses, client names or notes in it.
- Viewer: a per-user, per-report timeline in the Access panel and the inspect API. This is the "review a walk-through without asking them to run it again" Kimani wants.
- Not a session-replay or analytics vendor: client data, third parties, and agents install nothing.

## NW-100 · FYI

Dictation word count and words per minute, and whether Casanova may request more subagents, are Casanova's to answer. The call wasn't recorded and the dictation isn't in the repo.

## Questions for Kimani

1. **Mentors see every agent's report** (recommended), or only agents assigned to them? Assignment needs someone to keep it current.
2. **Sessions reading production:** the inspection API (recommended) over a database role? And may it return client names, notes and Hubert's text on request, logged, with them hidden by default?
3. **Who may start and reset a sample:** admins only, or mentors too (Noble, Kara)? And is a reset that gives a **new link** to a fresh sample OK?
4. **Recording walk-throughs:** machine recording plus the activity log (recommended), or upgrade the Meet host seat?
5. **D-26 questions 1 and 2** (which keys, which Claude plan, who is the second admin) before the move early next week, and agree no dispatch starts before it.
6. When 091 a lands: send yourself one real invite from a second address to prove it.
