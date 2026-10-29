/* Casa Blanca Studio — shared tool chrome.
   Include once per tool:  <script src="../../assets/studio-header.js" defer></script>
   Injects the "‹ Studio" home button + a "signed in" chip, and reserves header space.
   Who's signed in comes from the Studio sign-in (assets/studio-auth.js), loaded first. */
(function () {
  var FB_SRC = (document.currentScript && document.currentScript.src || '').replace(/studio-header\.js.*$/, 'feedback.js') || 'feedback.js';
  var DN_SRC = (document.currentScript && document.currentScript.src || '').replace(/studio-header\.js.*$/, 'dev-notebook.js') || 'dev-notebook.js';
  var S = window.CBStudio;
  function team() { return Boolean(S && S.isTeam()); }

  // Chrome layout: "‹ Studio" pins to the LEFT; the account chip + Feedback button
  // (the latter injected by feedback.js) cluster together on the RIGHT inside
  // #cb-chrome-r. The header is forced left-aligned so the brand logo + tool label
  // sit together after the Studio button, and nothing floats on top of them.
  var css = document.createElement('style');
  css.textContent =
    ".cb-home,.cb-whoami,.cb-fb-btn{display:inline-flex;align-items:center;gap:6px;" +
    "background:rgba(15,15,15,.9);color:#fff;border:1px solid rgba(255,255,255,.22);" +
    "font:800 10px/1 'ObjectSans','Object Sans','Helvetica Neue',Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;" +
    "padding:8px 11px;border-radius:8px;text-decoration:none;cursor:pointer;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);transition:background .12s}" +
    ".cb-home:hover,.cb-whoami:hover,.cb-fb-btn:hover{background:rgba(30,26,46,.96)}" +
    ".cb-home{position:fixed;top:11px;left:14px;z-index:100000}" +
    "#cb-chrome-r{position:fixed;top:11px;right:14px;z-index:100000;display:flex;align-items:center;gap:8px}" +
    ".cb-whoami{letter-spacing:.05em;text-transform:none;color:#cbc8c2;max-width:34vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".cb-whoami:hover{color:#fff}" +
    "body>header,header:first-of-type{justify-content:flex-start!important;gap:14px;padding-left:112px!important}" +
    "@media(max-width:560px){body>header,header:first-of-type{padding-left:14px!important;padding-top:46px}.cb-whoami{display:none}.h-lbl,.hname{display:none}}";
  document.head.appendChild(css);

  // Shared right-side dock. feedback.js prepends its button here (order becomes
  // [Feedback] [account]). Created up front so it exists before feedback.js runs.
  function rightDock() {
    var d = document.getElementById('cb-chrome-r');
    if (!d) { d = document.createElement('div'); d.id = 'cb-chrome-r'; document.body.appendChild(d); }
    return d;
  }

  function mount() {
    if (document.querySelector('.cb-home')) return;
    var home = document.createElement('a');
    home.className = 'cb-home'; home.href = '../../';
    home.title = 'Back to the Studio'; home.setAttribute('aria-label', 'Back to the Studio');
    home.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Studio';
    document.body.appendChild(home);

    var dock = rightDock();
    if (S) S.ready.then(function (user) {
      if (document.querySelector('.cb-whoami')) return;
      var who = document.createElement('button');
      who.type = 'button'; who.className = 'cb-whoami'; who.title = 'Click to sign out';
      who.textContent = '● ' + (user.name || user.email);
      // Signing out ends the session everywhere in this browser, the dev notebook's too (Kimani's notebook, 2026-10-22).
      who.onclick = function () {
        if (!confirm('Sign out of the Studio on this device?')) return;
        S.signOut();
      };
      dock.appendChild(who);
    });

    // The dev notebook's capture box (docs/dev-notebook/README.md): only in a browser
    // signed in to the notebook and to the studio as the team, so nobody else downloads it.
    try {
      var dn = JSON.parse(localStorage.getItem('cb.devNotebook') || 'null');
      if (team() && dn && dn.token && Date.parse(dn.expiresAt) > Date.now() && !document.querySelector('script[data-cb-dev-notebook]')) {
        var dns = document.createElement('script');
        dns.src = DN_SRC; dns.defer = true; dns.setAttribute('data-cb-dev-notebook', '1');
        document.head.appendChild(dns);
      }
    } catch (e) { /* storage blocked: no notebook */ }

    if (!document.querySelector('script[data-cb-feedback]')) {
      var fb = document.createElement('script');
      fb.src = FB_SRC;
      fb.defer = true; fb.setAttribute('data-cb-feedback', '1');
      document.head.appendChild(fb);
    }
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
