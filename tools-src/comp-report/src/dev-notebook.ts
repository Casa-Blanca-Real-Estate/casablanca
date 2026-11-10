// The dev notebook's capture box (docs/dev-notebook/README.md) on the comp report.
// Every other Studio page gets it from assets/studio-header.js, which asks
// assets/studio-auth.js whether this is the team. The comp report signs in on its
// own (it is the Studio's sign-in page), so studio-auth.js isn't loaded here and the
// header always answered "not the team": the box never showed on the comp report
// (Kimani's notebook, 2026-10-29). Here the answer comes from /me instead.
import type { Me } from './api.ts';
import { NOTEBOOK_OFF } from './dev-settings.ts';

// The old dev sign-in's list, as studio-auth.js keeps it.
const TEAM = ['creative@email.casa-blanca.com', 'derek@casa-blanca.com', 'd.prestly@casa-blanca.com', 'emma@casa-blanca.com', 'erez@casa-blanca.com'];

/** Admins, a preview's guest, and the old team list: who studio-auth.js calls the team. */
export function isStudioTeam(me: Me): boolean {
  return Boolean(me.user.team) || me.user.role === 'admin' || Boolean(me.user.guest) || TEAM.includes(me.user.email.toLowerCase());
}

const KEY = 'cb.devNotebook';
/** A team member the notebook turned away (not a dev email): not asked again for a day. */
const REFUSED = 'cb.devNotebook.refused';

function hasSession(): boolean {
  const dn = JSON.parse(localStorage.getItem(KEY) || 'null') as { token?: unknown; expiresAt?: unknown } | null;
  return Boolean(dn && typeof dn.token === 'string' && Date.parse(String(dn.expiresAt)) > Date.now());
}

function loadBox(): void {
  const old = document.querySelector('script[data-cb-dev-notebook]');
  // A script that loaded while the box was off stopped at once: it goes, so this one runs.
  if (old && !(window as { CBDevNotebook?: unknown }).CBDevNotebook) old.remove();
  else if (old) return;
  const s = document.createElement('script');
  s.src = '/assets/dev-notebook.js';
  s.defer = true;
  s.setAttribute('data-cb-dev-notebook', '1');
  document.head.appendChild(s);
}

/**
 * The notebook's session lasts 30 days, and when it ran out the box just stopped showing, with nothing
 * said (Kimani, 2026-11-06: "my dev notes aren't appearing while I'm signed in"; his notes stop on
 * 10-29, 30 days after he first signed in). The notebook signs in with the same Identity sign-in as the
 * Studio, so a dev signed in here gets a fresh notebook session from it, without visiting the notebook page.
 */
async function renewSession(token: string): Promise<boolean> {
  const res = await fetch('/api/dev/notebook/session', { method: 'POST', headers: { 'X-Studio-Token': token } });
  if (res.status === 403) {
    localStorage.setItem(REFUSED, String(Date.now()));
    return false;
  }
  if (!res.ok) return false;
  const data = (await res.json()) as { token?: unknown; email?: unknown; expiresAt?: unknown };
  if (typeof data.token !== 'string' || typeof data.expiresAt !== 'string') return false;
  localStorage.setItem(KEY, JSON.stringify({ token: data.token, email: data.email, expiresAt: data.expiresAt }));
  return true;
}

/** Keeps the Studio's team mark in step with /me, and loads the capture box for a dev: renewing the notebook's session when it has run out. */
export function offerDevNotebook(me: Me, identityToken?: () => Promise<string | null>): void {
  try {
    const team = isStudioTeam(me);
    // dev-notebook.js and the CMS read this mark (studio-auth.js keeps it the same way).
    if (team) localStorage.setItem('cb_auth', me.user.email.toLowerCase());
    else localStorage.removeItem('cb_auth');
    // Turned off in Settings: nothing loads, and no new session is asked for.
    if (!team || localStorage.getItem(NOTEBOOK_OFF) === '1' || document.querySelector('script[data-cb-dev-notebook]')) return;
    if (hasSession()) return loadBox();
    const refused = Number(localStorage.getItem(REFUSED) || 0);
    if (!identityToken || Date.now() - refused < 86_400_000) return;
    void identityToken()
      .then((t) => (t ? renewSession(t) : false))
      .then((ok) => ok && loadBox(), () => undefined);
  } catch {
    /* storage blocked: no notebook */
  }
}

/** Settings turned the box back on: it shows now if this browser has (or can renew) a notebook session. */
export function notebookBackOn(me: Me, identityToken?: () => Promise<string | null>): void {
  try {
    if ((window as { CBDevNotebook?: unknown }).CBDevNotebook) return; // already loaded: it shows itself again
    document.querySelector('script[data-cb-dev-notebook]')?.remove();
    localStorage.removeItem(REFUSED);
  } catch {
    /* fine */
  }
  offerDevNotebook(me, identityToken);
}

/** Whether this browser holds a notebook session (for Settings to say so). */
export function notebookSignedIn(): boolean {
  try {
    return hasSession();
  } catch {
    return false;
  }
}
