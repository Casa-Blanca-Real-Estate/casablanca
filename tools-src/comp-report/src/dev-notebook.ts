// The dev notebook's capture box (docs/dev-notebook/README.md) on the comp report.
// Every other Studio page gets it from assets/studio-header.js, which asks
// assets/studio-auth.js whether this is the team. The comp report signs in on its
// own (it is the Studio's sign-in page), so studio-auth.js isn't loaded here and the
// header always answered "not the team": the box never showed on the comp report
// (Kimani's notebook, 2026-10-29). Here the answer comes from /me instead.
import type { Me } from './api.ts';

// The old dev sign-in's list, as studio-auth.js keeps it.
const TEAM = ['creative@email.casa-blanca.com', 'derek@casa-blanca.com', 'd.prestly@casa-blanca.com', 'emma@casa-blanca.com', 'erez@casa-blanca.com'];

/** Admins, a preview's guest, and the old team list: who studio-auth.js calls the team. */
export function isStudioTeam(me: Me): boolean {
  return Boolean(me.user.team) || me.user.role === 'admin' || Boolean(me.user.guest) || TEAM.includes(me.user.email.toLowerCase());
}

/** Keeps the Studio's team mark in step with /me, and loads the capture box in a browser signed in to the notebook. */
export function offerDevNotebook(me: Me): void {
  try {
    const team = isStudioTeam(me);
    // dev-notebook.js and the CMS read this mark (studio-auth.js keeps it the same way).
    if (team) localStorage.setItem('cb_auth', me.user.email.toLowerCase());
    else localStorage.removeItem('cb_auth');
    if (!team || document.querySelector('script[data-cb-dev-notebook]')) return;
    const dn = JSON.parse(localStorage.getItem('cb.devNotebook') || 'null') as { token?: unknown; expiresAt?: unknown } | null;
    if (!dn || typeof dn.token !== 'string' || !(Date.parse(String(dn.expiresAt)) > Date.now())) return;
    const s = document.createElement('script');
    s.src = '/assets/dev-notebook.js';
    s.defer = true;
    s.setAttribute('data-cb-dev-notebook', '1');
    document.head.appendChild(s);
  } catch {
    /* storage blocked: no notebook */
  }
}
