/* Casa Blanca Studio — Feedback widget.
   Self-contained; loaded by studio-header.js so every tool gets it for free.
   Injects a "Feedback" pill into the top chrome + a drop-down tray to submit feedback. */
(function () {
  if (document.querySelector('.cb-fb-btn')) return; // guard against double-injection

  var BACKEND = (localStorage.getItem('cb_backend') || '').replace(/\/+$/, '');

  function mount() {
    if (document.querySelector('.cb-fb-btn')) return;

    var css = document.createElement('style');
    css.textContent =
      ".cb-fb-btn{position:fixed;top:11px;left:112px;z-index:100000;" +
      "background:rgba(15,15,15,.9);color:#fff;border:1px solid rgba(255,255,255,.22);" +
      "font:800 10px/1 'ObjectSans','Object Sans','Helvetica Neue',Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;" +
      "padding:8px 11px;border-radius:8px;cursor:pointer;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);transition:background .12s}" +
      ".cb-fb-btn:hover{background:rgba(30,26,46,.96)}" +
      "@media(max-width:560px){.cb-fb-btn{top:11px;left:auto;right:62px}}" +
      ".cb-fb-tray{position:fixed;top:46px;left:14px;width:300px;max-width:calc(100vw - 28px);z-index:100001;" +
      "background:#fff;border-radius:12px;box-shadow:0 18px 40px -16px rgba(0,0,0,.45);padding:16px;" +
      "font-family:'ObjectSans','Object Sans','Helvetica Neue',Arial,sans-serif;color:#0f0f0f;box-sizing:border-box}" +
      ".cb-fb-tray *{box-sizing:border-box}" +
      ".cb-fb-close{position:absolute;top:10px;right:12px;background:none;border:none;font-size:18px;line-height:1;color:#888;cursor:pointer;padding:2px 6px}" +
      ".cb-fb-close:hover{color:#0f0f0f}" +
      ".cb-fb-h{font-weight:800;font-size:14px;margin:0 0 4px}" +
      ".cb-fb-help{font-size:11px;color:#8a877f;margin:0 0 12px}" +
      ".cb-fb-tray input,.cb-fb-tray textarea{border:1px solid #dddbd5;border-radius:8px;padding:9px 11px;width:100%;font:inherit;box-sizing:border-box;margin-bottom:8px;color:#0f0f0f}" +
      ".cb-fb-tray textarea{resize:vertical}" +
      ".cb-fb-send{width:100%;background:#aaa3cf;color:#1e1a2e;font-weight:800;border:none;border-radius:8px;padding:10px;cursor:pointer;font-family:inherit}" +
      ".cb-fb-send:disabled{opacity:.6;cursor:default}" +
      ".cb-fb-status{font-size:11px;color:#8a877f;margin-top:8px;min-height:14px}";
    document.head.appendChild(css);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cb-fb-btn';
    btn.textContent = 'Feedback';
    btn.setAttribute('aria-label', 'Share feedback');
    document.body.appendChild(btn);

    var tray = null;

    function close() {
      if (tray) { tray.parentNode && tray.parentNode.removeChild(tray); tray = null; }
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    }

    function onKey(e) { if (e.key === 'Escape') close(); }

    function onOutside(e) {
      if (!tray) return;
      if (tray.contains(e.target) || btn.contains(e.target)) return;
      close();
    }

    function open() {
      if (tray) return;
      tray = document.createElement('div');
      tray.className = 'cb-fb-tray';
      tray.innerHTML =
        '<button type="button" class="cb-fb-close" aria-label="Close">&times;</button>' +
        '<p class="cb-fb-h">Share feedback</p>' +
        '<p class="cb-fb-help">Suggestions, bugs, ideas — all welcome.</p>' +
        '<input type="text" class="cb-fb-name" placeholder="Name (optional)">' +
        '<input type="email" class="cb-fb-email" placeholder="Email (optional)">' +
        '<textarea class="cb-fb-msg" rows="4" placeholder="What’s on your mind?"></textarea>' +
        '<button type="button" class="cb-fb-send">Send feedback</button>' +
        '<div class="cb-fb-status"></div>';
      document.body.appendChild(tray);

      var nameEl = tray.querySelector('.cb-fb-name');
      var emailEl = tray.querySelector('.cb-fb-email');
      var msgEl = tray.querySelector('.cb-fb-msg');
      var sendEl = tray.querySelector('.cb-fb-send');
      var statusEl = tray.querySelector('.cb-fb-status');

      var auth = (localStorage.getItem('cb_auth') || '').trim();
      if (auth) emailEl.value = auth;

      tray.querySelector('.cb-fb-close').onclick = close;

      sendEl.onclick = function () {
        var msg = (msgEl.value || '').trim();
        if (!msg) { statusEl.textContent = 'Add a message first'; msgEl.focus(); return; }
        sendEl.disabled = true;
        statusEl.textContent = 'Sending…';
        var payload = {
          name: nameEl.value || '',
          email: emailEl.value || '',
          message: msg,
          tool: document.title || location.pathname,
        };
        fetch(BACKEND + '/.netlify/functions/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(function (r) {
          if (!r.ok) throw new Error('bad status');
          msgEl.value = '';
          statusEl.textContent = 'Thanks! ✓';
          setTimeout(close, 1200);
        }).catch(function () {
          statusEl.textContent = "Couldn't send — try again";
          sendEl.disabled = false;
        });
      };

      msgEl.focus();
      document.addEventListener('keydown', onKey);
      document.addEventListener('mousedown', onOutside);
    }

    btn.onclick = function () { if (tray) close(); else open(); };
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
