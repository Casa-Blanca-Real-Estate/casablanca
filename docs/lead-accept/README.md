# Lead auto-accept — StreetEasy referral leads

Built 2026-11-03 → 11-10 with Kimani in a Claude session (https://claude.ai/code/session_01UYdn92KnUfkzoUGCHzGwes),
for Derek, who had been accepting every referral lead by hand. The service code is its own repo,
**`Casa-Blanca-Real-Estate/se-autoaccept`** (README there). This repo holds only the Studio's admin page.

## The problem

StreetEasy sends referral leads to each referral agent's `@email.casa-blanca.com` alias, which lands in
the shared inbox **blancacasa1002@gmail.com**. The agent has to click **Respond Now** in StreetEasy's
Agent Tools within about 30 minutes (leads after ~6 PM get until 9:30 AM), or the lead goes to another
agent. The referral agents aren't active; Casa handles these internally. StreetEasy only allows one
login per browser, every agent has their own account, and logging in sends a verification code.

## How it works

1. **Forwarding.** A Gmail filter in blancacasa1002 (`from:streeteasy.com` → forward) sends lead emails
   and sign-in code emails to the Make mailhook `4e9gic2s9bd2ilinxs0rplu7htjgavtd@hook.us2.make.com`.
   It doesn't mark anything read. blancacasa1002's separate "forward all mail" setting (to another
   inbox) is unrelated.
2. **Make → Railway.** Scenario *StreetEasy Referral Lead → Auto-Accept* (id 6887314) posts each email
   to `https://casablanca-production-e067.up.railway.app/lead` with the `x-casa-secret` header. Since
   2026-11-12 that header comes from the Make key **"Casa lead service (x-casa-secret)"** (key id 247869, type
   `http:ActionSendDataAPIKeyAuth`) instead of a plain-text header typed into the HTTP module, so the value no
   longer shows in the scenario's blueprint. Changing `CASA_SECRET` in Railway means updating that key in Make
   (Keys, in team 1942598) too.
3. **The service** (Node + Playwright, Docker on Railway, disk at `/data`):
   - sorts the email: a lead ("…to respond to an Inquiry from <ADDRESS>"), a sign-in code
     ("Your authentication code"), or ignored;
   - finds the agent by the alias it was sent to (or StreetEasy's "This email was sent to" footer) and
     adds new agents automatically;
   - reads the deadline from the subject and skips expired leads;
   - opens the lead link with the agent's saved session (one cookie file per agent, so any number of
     agents share one browser without logging each other out);
   - if signed out: sign-up page → **Log in** → email → shared password (a rejected password is remembered
     per agent and never retried; it falls back to "send a one-time code") → StreetEasy's SMS verification
     → **Try Another Method → Email** → code read from the forwarded email → "Remember this device for 30 days";
   - on **Agent Tools → Experts → Connections**, finds the lead's card by building number + unit, clicks
     **Respond Now**, clicks **Send** in the pre-filled message pop-up, reloads and checks the card no
     longer offers a response;
   - logs the run to `/data/runs.jsonl` with screenshots of every step (`/data/captures`, kept 14 days).
4. **Alerts.** The service posts to the Make webhook of *StreetEasy Lead Alerts → Email* (id 6889011),
   which sends from creative@casa-blanca.com:
   - needs a person → **d.prestly@casa-blanca.com** (Derek), cc casacalliste: subject
     `ACTION NEEDED by <time> (<n> min left): respond to lead for <agent> — <address>`, with the link,
     the agent account and a screenshot;
   - done, or a new agent added → casacalliste only.

Observe mode (switch on the Studio page) does everything except click Respond Now, and treats every lead
as needing a person.

## Variables

| Where | Name | What |
|---|---|---|
| Railway | `CASA_SECRET` | Shared key; Make sends it, the Studio's function sends it |
| Railway | `SE_SHARED_PASSWORD` | The referral agents' StreetEasy password |
| Studio page | an agent's own password | For agents whose StreetEasy password differs: *Set own password* on their card. Kept in the agent list on Railway's disk (`/data/agents.json`), never sent back to the page |
| Railway | `ALERT_WEBHOOK_URL` | The alert scenario's Make webhook |
| Railway | `PUBLIC_URL` | The service's own URL |
| Railway | `OBSERVE_MODE` | Starting value only; the Studio switch (saved in `/data/settings.json`) wins once used |
| Netlify | `SE_AUTOMATION_URL` | `https://casablanca-production-e067.up.railway.app` |
| Netlify | `SE_AUTOMATION_SECRET` | Same value as `CASA_SECRET` |
| Netlify | `MAKE_API_TOKEN` | A Make user API token for the page's Make panel (Production; Functions scope). Scopes `scenarios:read`, `scenarios:write`, `connections:read`. Zone us2, team 1942598, organization 6744294 |
| Make | key "Casa lead service (x-casa-secret)" | Id 247869. Same value as `CASA_SECRET`; the Auto-Accept scenario's HTTP module sends it |

## The Studio page

`tools/lead-accept/` (team only, dashboard tab *Automations*), through `/api/lead-accept`
(`tools-src/lead-accept/api.ts`), which checks the team sign-in and holds the service's key. The page is
public static HTML like every Studio page, so it names no addresses, keys or webhooks; they're here.
Service endpoints it uses: `GET /admin/status`, `GET /admin/runs`, `GET /agents`, `GET /captures/<name>.png`,
`POST /admin/settings`.

### The Make panel (Nov 12)

The *Make* section shows the two scenarios and the alerts' Gmail connection, read live from Make's API
(`https://us2.make.com/api/v2`, `Authorization: Token <MAKE_API_TOKEN>`; the code is
`tools-src/lead-accept/make.ts`, and the token never reaches the browser or a log):

- **Lead intake**, scenario 6887314, and **Lead alerts**, scenario 6889011: name, an On/Off switch, last run,
  incomplete runs (Make's `dlqCount`), last edited, an "invalid" warning, and the last 10 executions with the
  error message of up to 3 failed ones. Turning intake off asks first, since it stops lead intake entirely.
  The switch calls Make's `POST /scenarios/{id}/start` or `/stop`; the function refuses any other scenario id.
  Guests see the panel but the switches are disabled.
- **The Gmail connection** 12126157 (creative@): red, *Needs reconnecting*, when the alerts scenario is off or its
  last run failed on the connection; *Working* when its last run went through; with the last alert sent and a
  *Reconnect in Make* button to `https://us2.make.com/1942598/connections`. Make's `expire` for this connection
  is no use here: on Nov 12 it read 2027-05-12 while the sign-in lapses about weekly. Make's own check
  (`POST /connections/{id}/test`) needs `connections:write`, which the token doesn't have.
- Make endpoints used: `GET /scenarios/{id}`, `GET /scenarios/{id}/logs`, `GET /scenarios/{id}/executions/{executionId}`,
  `POST /scenarios/{id}/start|stop`, `GET /connections/{id}`. No token: the panel says to set `MAKE_API_TOKEN`
  (503). Make refusing it (401/403): "refused the API token, or it is missing a scope".
- Nothing about the scenarios' URL, fields or key can be changed from the page.

## Known upkeep and open items

- **The creative@ Make connection expires weekly** (a Workspace account without a paid seat). A scheduled
  Claude task reminds Kimani every Tuesday at 3:21 PM ET. When it lapses, Make switches the alert
  scenario off and alerts queue. Alternative under consideration: send from casacalliste via Make's
  SMTP module with a Gmail app password.
- **blancacasa1002 access is unexplained** (Nov 5): Gmail's activity list showed a Chrome browser and a
  phone in South Korea, and an authorized app in Minnesota checking the inbox right after leads arrived.
  Something marks lead emails read. Ask Derek; if unknown, change the password, sign out other sessions,
  turn on 2-step verification.
- Marking lead emails read/starred in blancacasa1002 by outcome was proposed and set aside (Kimani,
  Nov 10): the ACTION NEEDED email is Derek's signal instead.
- StreetEasy terms on automated access to agent accounts weren't reviewed.

## Alert emails, run links and the guide (Nov 12)

- **Recipients per alert type**, edited on the page under *Alert emails*: **Needs a person** (ACTION NEEDED;
  default Derek and success@casa-blanca.com), **Accepted** and **Notices** (new agent, password rejected;
  both casacalliste by default). Kept in the service's `/data/settings.json`. The Make alert scenario splits the
  comma-separated `to` the service sends; casacalliste is still cc'd on every alert so Claude sessions can read them.
- **Every alert links to its run**: `https://casa-blanca-creative-studio.netlify.app/tools/lead-accept/#run-<id>`
  (service variable `STUDIO_URL`). Opening it selects and highlights that run in the log.
- **How it works** is an editable guide (for Erez and the team): steps with a summary and collapsed
  step-by-step beats, free sections, and a link list. Stored in Netlify Blobs (`cb-lead-accept` / `guide`); the
  starting text is `tools-src/lead-accept/guide.ts`. Plain text: emails are highlighted, names in the link list
  become links wherever they appear, `**bold**`, and `- ` bullets in sections.
