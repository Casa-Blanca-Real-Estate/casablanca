/* Casa Blanca Studio — shared tool chrome.
   Include once per tool:  <script src="../../assets/studio-header.js" defer></script>
   Injects the "‹ Studio" home button + a "signed in" chip, and reserves header space. */
(function () {
  var FB_SRC = (document.currentScript && document.currentScript.src || '').replace(/studio-header\.js.*$/, 'feedback.js') || 'feedback.js';
  var ALLOWED = ['creative@email.casa-blanca.com', 'derek@casa-blanca.com', 'emma@casa-blanca.com', 'erez@casa-blanca.com'];
  function email() { return (localStorage.getItem('cb_auth') || '').trim().toLowerCase(); }
  function authed() { return ALLOWED.indexOf(email()) !== -1; }

  var css = document.createElement('style');
  css.textContent =
    ".cb-home,.cb-whoami{position:fixed;top:11px;z-index:100000;display:inline-flex;align-items:center;gap:6px;" +
    "background:rgba(15,15,15,.9);color:#fff;border:1px solid rgba(255,255,255,.22);" +
    "font:800 10px/1 'ObjectSans','Object Sans','Helvetica Neue',Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;" +
    "padding:8px 11px;border-radius:8px;text-decoration:none;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);transition:background .12s}" +
    ".cb-home{left:14px;cursor:pointer}.cb-home:hover{background:rgba(30,26,46,.96)}" +
    ".cb-whoami{right:14px;letter-spacing:.05em;text-transform:none;color:#cbc8c2;cursor:pointer;max-width:42vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".cb-whoami:hover{background:rgba(30,26,46,.96);color:#fff}" +
    "body>header,header:first-of-type{padding-left:122px}" +
    "@media(max-width:560px){body>header,header:first-of-type{padding-left:14px;padding-top:46px}.cb-whoami{display:none}}";
  document.head.appendChild(css);

  function mount() {
    if (document.querySelector('.cb-home')) return;
    var home = document.createElement('a');
    home.className = 'cb-home'; home.href = '../../';
    home.title = 'Back to Creative Studio'; home.setAttribute('aria-label', 'Back to Creative Studio');
    home.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Studio';
    document.body.appendChild(home);

    if (authed()) {
      var who = document.createElement('button');
      who.type = 'button'; who.className = 'cb-whoami'; who.title = 'Click to sign out';
      who.textContent = '● ' + email();
      who.onclick = function () { if (confirm('Sign out of Dev on this device?')) { localStorage.removeItem('cb_auth'); location.reload(); } };
      document.body.appendChild(who);
    }

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
