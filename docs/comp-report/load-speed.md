# Comp report — load speed (2026-10-22)

Kimani's dev note dn_mvjqn8yk0g2a: "Loading is slow". The first load seemed fine, but later reloads were slow.

## What was measured (production, 2026-10-22, curl from a cloud session)

| Call | Cold | Warm |
|---|---|---|
| A comp report function answering 401 (no sign-in, so no Identity check and no database) | 1.1–1.9 s | 0.2–0.3 s |
| `/api/comp-report/health` (opens a database connection) after 2 min idle | 0.6 s | 0.3–0.4 s |
| The same after 6–10 min idle (the database asleep too) | 2.2–2.6 s | |
| `/tools/comp-report/` HTML | 0.35–1.5 s | |
| The JS bundle, 725 KB (226 KB gzipped) | revalidated on every load | |

Each function is its own server instance, and each goes cold separately. One function called after
gaps of 1, 1.5 and 2.5 minutes took 0.5, 0.4 and 0.7 s on the server against 0.2 s warm and 1.9 s
fully cold: it cools within minutes. The database sleeps after 5 minutes idle (Netlify's
default, and the only setting on the Free and Personal plans), and waking it adds about another
second.

That fits "later reloads were slow". A reload ran, one after another:

1. the HTML and a revalidation of the JS and CSS;
2. Identity's settings (`/.netlify/identity/settings`), even when already signed in;
3. `/api/comp-report/me`, cold, and the database, waking;
4. only then the report (`/workspace`) or the list (`/reports`), a second function, cold too.

The first load in a session usually came soon after other use, with things still warm.

## What changed

- **The first screen's data is asked for alongside `/me`**, not after it (`src/api.ts`, `prefetch`).
  The two cold starts overlap instead of adding up. Locally, with every call held 800 ms, a report
  showed in 1.8 s instead of 2.3 s.
- **A reload skips the Identity settings call** when this browser is already signed in
  (`src/session.ts`). The settings are still read on the sign-in screen.
- **The built JS and CSS are cached for good** (`netlify.toml`): their names carry a content hash,
  so a release is a new file. A reload no longer asks the server about them.
- **Keep-warm pings** (`netlify/functions/comp-report-keep-warm.mts`): a scheduled function calls
  the four first-load functions without signing in, every 2 minutes in business hours: 9am–9pm New
  York time, Monday to Saturday (Kimani, 2026-10-22). Outside them a reload may start cold. The
  schedule is in UTC, so it runs across both the summer and winter windows and the function skips
  any run outside business hours, Sundays included, before it pings. Each answers 401
  before touching Identity or the database, so the pings warm the functions and nothing else.
  Scheduled functions run only on the production deploy, so this starts with the next release.

## What keeping things warm costs

Rates from Netlify's credit pricing (docs.netlify.com, "How credits work" and Netlify Database
"Billing and usage", read 2026-10-22): function compute 10 credits per GB-hour, web requests 2
credits per 10,000, database compute 10 credits per compute-unit hour, idle time before sleep
included. A production deploy is 15 credits.

- **Keeping the functions warm** (this PR, as scheduled): about 310 business hours a month, so about
  50,000 requests (about 10 credits) and about 1.6 GB-hours (about 16 credits): **roughly 25 credits
  a month**, under two production deploys' worth. Every day 8am–8pm would be about 30; around the
  clock, about 60; every minute instead of every 2, about double. Other downsides:
  a 401 in the function logs every 2 minutes, it only covers the functions it pings, and it
  can't promise a warm start (Netlify may still start a fresh instance).
- **Keeping the database awake** (not done): the database bills by the hour while awake. Always on
  is about 730 hours, **about 7,300 credits a month**, and needs the Pro plan; pinging it through
  working hours only is still about 3,600. That buys back about a second on the first call after a
  quiet spell. Not worth it at this size; the setting is in the database dashboard ("Sleep on
  inactivity") if that changes.

## Left for later

- **Fit the warm window to real use.** Once enough agents use the comp report, look at when calls
  come in (the busiest and quietest hours and days) and set the keep-warm window to match: the
  `inBusinessHours` check and the schedule in `comp-report-keep-warm.mts`. Until then it's Kimani's
  9am–9pm, Monday to Saturday.
- The JS bundle is 725 KB and Vite warns it's over 500 KB. Splitting it (the engine and the
  subway data loaded when needed) would speed up the first visit; reloads now come from the cache.
- Every request, function calls included, passes through the `block-internal` edge function. It's
  the security guard for the public repo root, so it stays.
