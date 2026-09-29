# Comp report — switching on sign-in and the database

**Mason (CR-1), 2026-09-25; updated for CR-1.1, 2026-09-29.** What's built, what's waiting on
Kimani, and the exact steps. Until the steps are done, the tool still deploys and runs, showing
what's missing:

- **Identity off:** the page says sign-in isn't switched on yet.
- **Database not provisioned:** agents are admitted by the domain rule, but can't save reports
  (a clear notice, and 503 from the API).
- **API key missing:** the assistant answers 503 (`assistant_not_configured`).

## Kimani's steps, in order

### 1. Protect non-production deploys — now, security
Netlify → **Project configuration → Access & security → Visitor access**: password-protect
non-production deploys. Deploy previews are public, numbered by PR and so guessable, and from now
on they carry sign-in and a database branch. (Already on `docs/decisions.md`.)

### 2. The database — nothing to do
PR #48's deploy preview settled this. Netlify provisioned a database branch for it and applied the
migration, and the preview's `/api/comp-report/health` reports
`"database":{"state":"ready","leastPrivilege":true}`: the schema is in place, and requests run as
the restricted `comp_report_app` role. Netlify only creates new databases on credit-based plans, so
this also answers the plan question.

The production database gets the migration on the first production deploy after the merge. Every
deploy preview gets its own database branch, a copy of production data, so a PR never touches
production data.

### 3. Turn on Netlify Identity
Netlify → **Identity → Enable Identity**, then:

- **Registration: Open.** Casa agents must be able to sign up with Google without an invite. Our
  `identity-validate`, `identity-signup` and `identity-login` functions refuse anyone who isn't on
  Casa's domain, the allowlist or the admin list.
- **Email confirmation: keep it on.** An email-and-password sign-up must prove it owns the inbox.
  If it's off (Identity > Emails > Confirmation template > Configure, the box that lets people sign
  up without verifying), the comp report refuses every password sign-in, and the health page reports
  a setup error. Google sign-in isn't affected, since Google has verified the address.
- **External providers → Google: enable**, with Netlify's default credentials for now. That's
  enough for step 6's test; the consent screen will say Netlify until step 4.

Invitation and password-reset emails link to the site root; the dashboard now forwards those links
to the comp report.

### 4. Casa's own Google OAuth client — so the consent screen says Casa Blanca
In Google Cloud, under Casa's Workspace:

1. Create a project "Casa Blanca Creative Studio".
2. Set up the OAuth consent screen with app name Casa Blanca and the logo.
3. Credentials → **OAuth client ID → Web application**.
4. **Authorized redirect URI:** Identity's own callback. Netlify doesn't document it; the evidence
   points to `https://identity.services.netlify.com/callback`. Confirm it once step 3 is done:
   open `https://casa-blanca-creative-studio.netlify.app/.netlify/identity/authorize?provider=google`
   and copy the `redirect_uri` parameter from the Google page's address.
5. Paste the client ID and secret into Netlify → **Identity > Registration > External providers >
   Google**, as the provider's own credentials. **Not** into environment variables: Identity doesn't
   read them there, and neither does anything else on the site.

Until then, Google's page says "to continue to Netlify Identity". That's Netlify's own Google
client, and it works: step 4 only changes the name on the consent screen.

**Consent screen user type:** *Internal* would make Google itself refuse non-Casa accounts. That's
a sound third guard for production, but it would also hide whether *our* gate works. Run step 6
first, then decide.

### 5. Environment variables
Netlify → **Project configuration → Environment variables**:

| Variable | Value |
|---|---|
| `CR_ADMIN_EMAILS` | Comma-separated admins — Kimani's and Hannah's Casa addresses. Admins see every report and manage the allowlist. **The only way to be an admin**: the allowlist can't grant it. |
| `CR_ALLOWED_DOMAINS` | Leave unset for `casa-blanca.com` only. **Question for Kimani:** do people sign in with `@email.casa-blanca.com` addresses (the creative inbox)? If so, set `casa-blanca.com,email.casa-blanca.com`. Domains match exactly. |
| `ANTHROPIC_API_KEY` | Already set; the existing tools use it. |

**After changing any of these, redeploy** (Deploys > Trigger deploy > Deploy site). Functions keep
the values from the deploy they were built in. And if the variable has scopes, they must include
Functions.

### 6. Prove it — the dispatch's tests
First open https://casa-blanca-creative-studio.netlify.app/api/comp-report/health. It reports the
setup without a sign-in and shows no user data. Once steps 3–5 are done, expect:

- `identity`: `"state":"enabled"`, `openRegistration: true`, `google: true`. A `setup_error`
  state comes with `errors` saying what to change;
- `database`: `"state":"ready"`, `leastPrivilege: true`;
- `assistant`: `configured: true`.

Then:

1. Open https://casa-blanca-creative-studio.netlify.app/tools/comp-report/ and choose **Sign in with
   Google** with a **non-Casa** Google account (a personal Gmail).
2. **Expected:** Google completes, then Netlify refuses the sign-up and you don't get in. Netlify →
   **Logs → Functions → identity-validate / identity-signup** shows a line like
   `{"gate":"comp-report","event":"signup","email":"…@gmail.com","provider":"google","allowed":false}`.
   The sign-in page says: "That account isn't authorised for the comp report."
3. **If you do get in** (the page says "… can't use the comp report"), the event functions didn't
   fire for Google. The second check — every API request — refused you instead, which is §13's
   fallback. Tell Casanova either way, since §13 asks CR-1 to prove which.
4. Then sign in with your Casa Google account. You should reach the reports list. Create a report,
   reload, and it's still there.
5. Open it and ask the assistant **"Which report is this?"** It looks the report up with its tool
   (the reply shows "Looked up: get_report") and answers with the title. Then send a second message,
   e.g. "What can you do so far?". The second reply is the first live test that the stored
   conversation is sent back to the model exactly as the model wrote it. Opus 5.5 refuses an edited
   history.
6. If the assistant says it hit an error: Netlify → **Logs → Functions → comp-report-turn** shows
   `comp-report turn: model call failed` with the API's reason. Send that line to Casanova.

### 7. Staging and deploy previews
Google sign-in completes only on the production hostname. After Google, Identity sends people back
to the page they started from *only if* it's on the site's main hostname; otherwise it sends them to
the production root. So a sign-in started on a deploy preview or branch deploy lands on production.
Email-and-password sign-in (invites) works on any deploy URL.

The design's "one fixed staging branch deploy registered as an OAuth origin" was about Google
refusing wildcard origins. Since Google's redirect goes to Netlify's callback rather than ours, that
concern falls away; this one replaces it. **Test Google sign-in on production, which is safe: the
per-request check stands behind it. Test everything else on previews with invited email
accounts.** To be confirmed once Identity is on.

### 8. Letting in someone from outside Casa — when it comes up
1. Sign in to the comp report as an admin. Under **Access · admins only**, add their address, pick
   a role (External for most people outside Casa), and note who they are.
2. Then Netlify → **Identity → Invite users** → their address. They get an email, choose a
   password, and land in the comp report.

Grant first, invite second: the sign-up gate refuses anyone who isn't on the list yet. Removing
someone under Access shuts them out on their next request. The same list gives a Casa address a
different role, such as Mentor. It can't make anyone an admin; only `CR_ADMIN_EMAILS` does.

## If Google sign-in comes back to the sign-in page

Since CR-1.1 the page says why: "That account isn't authorised for the comp report" means our gate
refused the Google account. Before CR-1.1 it returned to the sign-in page with no message. To see
which kind of account was refused:

1. Netlify > **Logs > Functions > identity-validate** (then `identity-signup`, `identity-login`).
2. Find the line `{"gate":"comp-report","event":"…","domain":"…","allowed":false,…}`. A refused
   person isn't a user, so since 2026-09-30 their line names only their address's **domain**, as
   Google reported it (`gmail.com`, `email.casa-blanca.com`). Admitted people's lines carry their
   address.
3. Then:
   - **A personal account** (gmail.com and the like): sign in with the Casa Blanca Google account
     instead. To use that account anyway, add its exact address to `CR_ADMIN_EMAILS` or grant it
     under Access, and redeploy after changing the variable.
   - **A Casa address on another domain** (for example `email.casa-blanca.com`): add the domain to
     `CR_ALLOWED_DOMAINS`, then redeploy.
   - **Your address is in `CR_ADMIN_EMAILS` but was still refused:** the variable changed after the
     last deploy. Redeploy.
   - **No gate line at all:** the refusal came before our functions ran. Check Identity > Audit log,
     and tell Casanova.

## How it works — for Casanova and the next sessions

- **Two checks** (§13). At sign-up and log-in, the Identity event functions apply the access rule
  (`server/access.ts`). Then, **on every API request**, `requireUser()` (`server/session.ts`)
  verifies the token by asking Identity's `/user` endpoint and applies the same rule. It fails
  closed: if Identity is unreachable, the answer is 503, never the token's unverified claims.
- **Whose address is proven.** Google has verified a Google account's address. A password account's
  address counts only while Identity requires email confirmation, which `requireUser()` reads from
  Identity's settings (cached up to a minute). Any other provider is refused
  (`provider_not_allowed`), since the comp report uses only these two. With autoconfirm on, every password sign-in is
  refused (403 `address_unverified`), and so is one whose settings can't be read (503). Accounts
  created while autoconfirm was on stay confirmed after it's turned off: review Identity > Users if
  that ever happens.
- **The rule:** `CR_ADMIN_EMAILS` → admin, the only way to be one; an unrevoked allowlist row →
  that row's role, which is agent, mentor or external and never admin (the database refuses an admin
  grant, and the rule ignores an old one); Casa's domain → agent; anyone else → refused. Users are keyed by email. `users.role` mirrors the rule on
  every request, so granting or revoking takes effect on the next request, not the next sign-in.
  Admins manage the allowlist in the app (`/api/comp-report/allowlist`, `src/views/Access.tsx`);
  row-level security lets only admins read or change it.
  Capability (`practice` / `full`) is scaffolded; everyone is `full` until the training gate exists.
- **Row-level security:**
  - Every query runs inside `withActor()` (`server/db.ts`), which opens a transaction and calls
    `comp_report.enter()`. That sets who's asking (transaction-local, so pooled connections never
    leak it) and drops to the `comp_report_app` role where the platform allows.
  - `FORCE ROW LEVEL SECURITY` binds even the tables' owner, and the server refuses to run if the
    connection role bypasses RLS.
  - Queries are also scoped explicitly.
  - Tested against real PostgreSQL in CI: `tools-src/comp-report/db/*.test.ts`.
- **The data** (§12 first slice, `netlify/database/migrations/20260925000000_comp_report_foundations.sql`):
  - Every row records when it was created and by whom — set by triggers, not by app code.
  - Reasons, messages, usage and observations are append-only, even against the table owner.
  - A comp's tier changes only by recording a reason.
  - **Property identity rows are shared, so imports dedupe; what an import observed is visible only
    to that agent** until D-9 decides otherwise.
- **The assistant** (`server/api/turn.ts`):
  - One streamed Opus 5.5 call per request, with model, prompt and tools pinned server-side.
  - Effort set explicitly, `display: "updates"`, no forced tool choice.
  - `fallbacks: "default"` on refusals; `prefix_mismatch_behavior: "error"`, so any history edit
    fails loudly.
  - The verbatim transcript and per-call usage are stored.
  - Time limits: `docs/comp-report/cr1-function-limits.md`.
- **Setup state:** `GET /api/comp-report/health` needs no sign-in and returns no user data. It
  reports whether the database is migrated and runs requests as `comp_report_app`, whether
  Identity is on and how it's configured, and whether the API key is set. It's the one comp report
  endpoint without the per-request check.
- **Never `DATABASE_URL`.** In the Claude Code cloud environment it points at another project's
  database. Deployed functions use the platform's `NETLIFY_DB_URL`; local development uses
  `CR_LOCAL_DATABASE_URL`, and the local tools refuse anything that isn't on the machine.
