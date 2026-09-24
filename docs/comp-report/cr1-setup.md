# Comp report — switching on sign-in and the database

**Mason (CR-1), 2026-09-24.** What's built, what's waiting on Kimani, and the exact steps. Until
the steps are done, the tool still deploys and runs, showing what's missing:

- **Identity off:** the page says sign-in isn't switched on yet.
- **Database not provisioned:** agents are admitted by the domain rule, but can't save reports
  (a clear notice, and 503 from the API).
- **API key missing:** the assistant answers 503 (`assistant_not_configured`).

## Kimani's steps, in order

### 1. Protect non-production deploys — now, security
Netlify → **Project configuration → Access & security → Visitor access**: password-protect
non-production deploys. Deploy previews are public, numbered by PR and so guessable, and from now
on they carry sign-in and a database branch. (Already on `docs/decisions.md`.)

### 2. Tell Casanova which Netlify plan the team is on — blocks the database
Netlify → **Team settings → Billing**.

- **Credit-based (Free, Personal or Pro with credits):** nothing to click. This code installs
  `@netlify/database` and ships `netlify/database/migrations/`, so the next deploy provisions the
  database and applies the migration. Every deploy preview gets its own database branch, a copy of
  production data, so a PR never touches production data.
- **Legacy (Starter, or Pro before credits):** Netlify Database can't be created at all. The GA
  product is credit-only, and the beta stopped creating databases on 2026-04-13. The options:
  - switch the team to credit-based (Netlify says that's irreversible);
  - or use Neon directly. That's a small change: read a `CR_DATABASE_URL` in deployed functions,
    and apply migrations by hand, since only Netlify Database applies them on deploy.

### 3. Turn on Netlify Identity
Netlify → **Identity → Enable Identity**, then:

- **Registration: Open.** Casa agents must be able to sign up with Google without an invite. Our
  `identity-validate`, `identity-signup` and `identity-login` functions refuse anyone who isn't on
  Casa's domain, the allowlist or the admin list.
- **Email confirmation: keep it on.** An email-and-password sign-up must prove it owns the inbox.
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
5. Paste the client ID and secret into Netlify → **Identity → External providers → Google → use my
   own credentials**.

**Consent screen user type:** *Internal* would make Google itself refuse non-Casa accounts. That's
a sound third guard for production, but it would also hide whether *our* gate works. Run step 6
first, then decide.

### 5. Environment variables
Netlify → **Project configuration → Environment variables**:

| Variable | Value |
|---|---|
| `CR_ADMIN_EMAILS` | Comma-separated admins — Kimani's and Hannah's Casa addresses. Admins see every report and manage the allowlist. |
| `CR_ALLOWED_DOMAINS` | Leave unset for `casa-blanca.com` only. **Question for Kimani:** do people sign in with `@email.casa-blanca.com` addresses (the creative inbox)? If so, set `casa-blanca.com,email.casa-blanca.com`. Domains match exactly. |
| `ANTHROPIC_API_KEY` | Already set; the existing tools use it. |

### 6. Prove the domain rule — the dispatch's test
1. Open https://casa-blanca-creative-studio.netlify.app/tools/comp-report/ and choose **Sign in with
   Google** with a **non-Casa** Google account (a personal Gmail).
2. **Expected:** Google completes, then Netlify refuses the sign-up and you don't get in. Netlify →
   **Logs → Functions → identity-validate / identity-signup** shows a line like
   `{"gate":"comp-report","event":"signup","email":"…@gmail.com","provider":"google","allowed":false}`.
3. **If you do get in** (the page says "… can't use the comp report"), the event functions didn't
   fire for Google. The second check — every API request — refused you instead, which is §13's
   fallback. Tell Casanova either way, since §13 asks CR-1 to prove which.
4. Then sign in with your Casa Google account. You should reach the reports list. Create a report,
   reload, and it's still there. Open it and send the assistant a message; a reply streams back.

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

## How it works — for Casanova and the next sessions

- **Two checks** (§13). At sign-up and log-in, the Identity event functions apply the access rule
  (`server/access.ts`). Then, **on every API request**, `requireUser()` (`server/session.ts`)
  verifies the token by asking Identity's `/user` endpoint and applies the same rule. It fails
  closed: if Identity is unreachable, the answer is 503, never the token's unverified claims.
- **The rule:** `CR_ADMIN_EMAILS` → admin; an unrevoked allowlist row → that row's role; Casa's
  domain → agent; anyone else → refused. Users are keyed by email. `users.role` mirrors the rule on
  every request, so granting or revoking takes effect on the next request, not the next sign-in.
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
- **Never `DATABASE_URL`.** In the Claude Code cloud environment it points at another project's
  database. Deployed functions use the platform's `NETLIFY_DB_URL`; local development uses
  `CR_LOCAL_DATABASE_URL`, and the local tools refuse anything that isn't on the machine.
