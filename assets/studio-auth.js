/* Casa Blanca Studio — the sign-in, for every Studio page.
   Include first in <head>, before anything that asks who's signed in:
     <script src="/assets/studio-auth.js"></script>

   The Studio signs in the way the comp report does: Netlify Identity (a Casa Google
   account, or email and password), and the same rule of who's allowed in, which only
   the server applies (/api/comp-report/me; tools-src/comp-report/server/access.ts).
   The sign-in screen is the comp report's own: a signed-out visit goes there with
   ?next=<this page>, and the comp report sends it back once the server says yes.

   It reads the same session the comp report's library keeps (@netlify/identity: the
   nf_jwt and nf_refresh cookies, and gotrue.user in localStorage), and when the access
   token is near its end it renews it the way the library does, writing all three back,
   so the comp report and every Studio tab keep one session between them.

   This gate hides the page until the server has answered. It's a door, not a lock: the
   pages are static files, so the protection is in each function that checks the token.

   Window.CBStudio:
     ready         Promise of the user, {email, name, role, guest}; never resolves when
                   the visit is sent to sign in
     user          the same, once ready
     isTeam()      the Studio's team (the old dev sign-in's list, a comp report admin, or a preview's guest):
                   the team-only tools, the CMS, the dev notebook
     token()       Promise of the access token, renewed when near its end
     profile()     Promise of the agent's profile from Casa's roster (name, firstName,
                   title, email, phone, photo) or null; /api/comp-report/agent-card
     signOut()     ends the session everywhere in this browser and goes to sign in

   For the scripts written before it, a team member's email is also kept in
   localStorage "cb_auth" (dev-notebook.js, the CMS's edit log); anyone else's is
   removed. */
(function () {
  if (window.CBStudio) return;
  // Identity's links (an invitation, a reset, a refused Google sign-in) belong to the sign-in screen.
  if (/^#(access_token|confirmation_token|recovery_token|invite_token|email_change_token|error)=/.test(location.hash)) {
    location.replace('/tools/comp-report/' + location.hash);
    return;
  }

  var TEAM = ['creative@email.casa-blanca.com', 'derek@casa-blanca.com', 'emma@casa-blanca.com', 'erez@casa-blanca.com'];
  var SIGN_IN = '/tools/comp-report/';
  var ME_KEY = 'cb.studio.me';
  var ME_MS = 10 * 60 * 1000;
  var MARGIN_S = 60;
  var GUEST_KEY = 'cr-guest-key';

  // Hidden until the server answers, so nobody sees a page they'll be sent away from.
  var root = document.documentElement;
  root.classList.add('cb-gate');
  var hide = document.createElement('style');
  hide.textContent = 'html.cb-gate body{visibility:hidden!important}' +
    '.cb-gate-msg{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;' +
    "font:400 15px/1.5 'Object Sans','Helvetica Neue',Arial,sans-serif;background:#f7f5f0;color:#0f0f0f;z-index:2147483647;text-align:center;padding:24px}" +
    '.cb-gate-msg button{font-family:inherit;font-weight:800;font-size:11px;line-height:1;letter-spacing:.12em;text-transform:uppercase;background:#0f0f0f;color:#fff;border:0;padding:12px 18px;cursor:pointer}';
  (document.head || root).appendChild(hide);

  function store(s) { try { return window[s]; } catch (e) { return null; } }
  var local = store('localStorage'), session = store('sessionStorage');
  function get(s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(s, k, v) { try { if (s) { if (v === null) s.removeItem(k); else s.setItem(k, v); } } catch (e) { /* storage blocked */ } }

  function cookie(name) {
    var m = new RegExp('(?:^|; )' + name + '=([^;]*)').exec(document.cookie);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }
  function setCookie(name, value) {
    document.cookie = name + '=' + (value === null ? '; expires=Thu, 01 Jan 1970 00:00:00 GMT' : encodeURIComponent(value)) + '; path=/; secure; samesite=lax';
  }
  function claims(jwt) {
    try {
      var p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(p + '==='.slice((p.length + 3) % 4)))));
    } catch (e) { return null; }
  }
  function gotrue() { try { return JSON.parse(get(local, 'gotrue.user') || 'null'); } catch (e) { return null; } }

  var renewing = null;
  /** The token, renewed through Identity when it ends within a minute; null when there's no session. */
  function token() {
    var guest = get(local, GUEST_KEY);
    if (guest) return Promise.resolve('guest.' + guest); // guest mode on a preview, as the comp report sends it
    var jwt = cookie('nf_jwt');
    var c = jwt && claims(jwt);
    if (c && c.exp && c.exp - Date.now() / 1000 > MARGIN_S) return Promise.resolve(jwt);
    var kept = gotrue();
    var refresh = (kept && kept.token && kept.token.refresh_token) || cookie('nf_refresh');
    if (!refresh) return Promise.resolve(null);
    renewing = renewing || fetch('/.netlify/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refresh),
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (t) {
      renewing = null;
      if (!t || !t.access_token) return null;
      setCookie('nf_jwt', t.access_token);
      if (t.refresh_token) setCookie('nf_refresh', t.refresh_token);
      if (kept && kept.token) {
        kept.token = Object.assign({}, kept.token, t, { expires_at: Date.now() + (t.expires_in || 3600) * 1000 });
        set(local, 'gotrue.user', JSON.stringify(kept));
      }
      return t.access_token;
    }, function () { renewing = null; return null; });
    return renewing;
  }

  function signInUrl() {
    var here = location.pathname + location.search + location.hash;
    return SIGN_IN + (here && here !== '/' ? '?next=' + encodeURIComponent(here) : '');
  }
  function toSignIn() {
    set(session, ME_KEY, null);
    location.replace(signInUrl());
    return new Promise(function () {}); // the page is leaving
  }

  // A guest is only ever on a preview (server/guest.ts) and walks it as the team, as the comp report gives it the samples.
  function isTeamUser(u) { return u.role === 'admin' || u.guest || TEAM.indexOf(String(u.email).toLowerCase()) !== -1; }
  function keepTeam(user) {
    var team = Boolean(user && isTeamUser(user));
    set(local, 'cb_auth', team ? String(user.email).toLowerCase() : null);
    return team;
  }

  var api = window.CBStudio = {
    user: null,
    ready: null,
    token: token,
    signInUrl: signInUrl,
    isTeam: function () {
      if (api.user) return isTeamUser(api.user);
      return Boolean(get(local, 'cb_auth')); // before the answer: what this browser was last told
    },
    profile: function () {
      if (api._profile) return api._profile;
      api._profile = api.ready.then(token).then(function (t) {
        return fetch('/api/comp-report/agent-card', { headers: t ? { Authorization: 'Bearer ' + t } : {} });
      }).then(function (r) { return r.ok ? r.json() : { card: null }; }).then(function (b) { return b.card || null; }, function () {
        api._profile = null;
        return null;
      });
      return api._profile;
    },
    signOut: function () {
      var jwt = cookie('nf_jwt');
      var end = [];
      if (jwt && !get(local, GUEST_KEY)) end.push(fetch('/.netlify/identity/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + jwt }, keepalive: true }).catch(function () {}));
      try {
        var dn = JSON.parse(get(local, 'cb.devNotebook') || 'null');
        if (dn && dn.token) end.push(fetch('/api/dev/notebook/session', { method: 'DELETE', headers: { Authorization: 'Bearer ' + dn.token }, keepalive: true }).catch(function () {}));
      } catch (e) { /* unreadable: nothing to end */ }
      setCookie('nf_jwt', null);
      setCookie('nf_refresh', null);
      // The session, guest mode, the team mark, and the CMS and roster tokens remembered across tabs.
      ['gotrue.user', GUEST_KEY, 'cb_auth', 'cb_cms_token', 'cb_pics_token', 'cb.devNotebook'].forEach(function (k) { set(local, k, null); });
      set(session, ME_KEY, null);
      return Promise.all(end).then(function () { location.assign(SIGN_IN); });
    },
  };

  function admit(user, local) {
    api.user = user;
    if (!local) keepTeam(user);
    root.classList.remove('cb-gate');
    try { document.dispatchEvent(new CustomEvent('cb-studio-ready', { detail: user })); } catch (e) { /* old browser */ }
    return user;
  }

  function trouble(retry) {
    var show = function () {
      var box = document.createElement('div');
      box.className = 'cb-gate-msg';
      box.innerHTML = '<div>We couldn’t check your sign-in just now.</div><button type="button">Try again</button>';
      box.querySelector('button').onclick = function () { box.remove(); retry(); };
      root.appendChild(box);
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }

  // Local work on the hand-written tools (a plain static server, no Identity): let it through. The old dev
  // sign-in's mark decides the team there, as it did before, so a local test can be either.
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  function localUser() {
    var mark = (get(local, 'cb_auth') || '').trim().toLowerCase();
    return admit({ email: mark || 'agent@localhost', name: null, role: mark ? 'admin' : 'agent', guest: false }, true);
  }

  function check() {
    return token().then(function (t) {
      if (!t) {
        if (!LOCAL) return toSignIn();
        return fetch('/.netlify/identity/settings').then(function (r) {
          return r.ok ? toSignIn() : localUser();
        }, localUser);
      }
      var who = get(local, GUEST_KEY) ? 'guest' : ((claims(t) || {}).email || '').toLowerCase();
      try {
        var kept = JSON.parse(get(session, ME_KEY) || 'null');
        if (kept && kept.who === who && Date.now() - kept.at < ME_MS) return admit(kept.user);
      } catch (e) { /* unreadable: ask */ }
      return fetch('/api/comp-report/me', { headers: { Authorization: 'Bearer ' + t } }).then(function (r) {
        if (r.status === 401 || r.status === 403) {
          // A guest key the server won't take (production, or out of date) is forgotten, as the comp report does.
          set(local, GUEST_KEY, null);
          return toSignIn();
        }
        if (!r.ok) throw new Error('me ' + r.status);
        return r.json();
      }).then(function (body) {
        if (!body || !body.user) throw new Error('me: no user');
        var u = body.user;
        var user = { email: u.email, name: u.name || null, role: u.role, guest: Boolean(u.guest) };
        set(session, ME_KEY, JSON.stringify({ who: who, at: Date.now(), user: user }));
        return admit(user);
      });
    }).catch(function () {
      return new Promise(function (resolve) { trouble(function () { resolve(check()); }); });
    });
  }

  api.ready = check();
})();
