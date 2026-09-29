/* Casa Blanca Studio — the dev notebook's capture box (docs/dev-notebook/README.md).
   Loaded by studio-header.js and the dashboard only in a browser signed in to the
   notebook (localStorage "cb.devNotebook", written by /tools/dev-notebook/), so an
   agent's browser never loads it. Ctrl+. / ⌘. anywhere, inside text fields too, or
   the ✎ button at the bottom left. Everything lives in a shadow root: no tool's CSS
   reaches in, and no keystroke typed here reaches a tool's own shortcuts. */
(function () {
  'use strict';
  if (window.__cbDevNotebookLoaded) return;
  window.__cbDevNotebookLoaded = true;

  var KEY = 'cb.devNotebook';
  var DRAFT = 'cb.devNotebook.draft';
  var API = '/api/dev/notebook';
  var NOTEBOOK = '/tools/dev-notebook/';
  // Copies of tools-src/dev-notebook/vocab.ts: vocab.test.ts fails if they drift.
  var TAGS = [{"id":"bug","label":"Bug"},{"id":"uiux","label":"UI/UX"},{"id":"copy","label":"Copy"},{"id":"feature","label":"Feature"},{"id":"question","label":"Question"},{"id":"critique","label":"Critique"},{"id":"perf","label":"Perf"}];
  var PARAMS = ["report","step","tab","view","id","slug","agent"];
  var MAX_SHOTS = 8;

  function session() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s.token === 'string' && Date.parse(s.expiresAt) > Date.now()) return s;
    } catch (e) { /* storage blocked: not signed in */ }
    return null;
  }
  if (!session()) return;

  // ── What's on screen ─────────────────────────────────────────────────────────
  function clip(s, n) { s = String(s).trim(); return s.length > n ? s.slice(0, n) : s; }

  /** "1512x945", or null: a hidden or embedded frame reports 0, and "0x0" would read as a measurement. */
  function readViewport() {
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    return w > 0 && h > 0 ? w + 'x' + h : null;
  }

  /** Coordinates only: a search box or a draft in the URL must never reach a note. */
  function readParams() {
    var out = {};
    var q = new URLSearchParams(location.search);
    PARAMS.forEach(function (k) { var v = q.get(k); if (v && v.trim()) out[k] = clip(v, 200); });
    return out;
  }

  /** A JSON-safe copy of what the page published (window.__cbCaptureContext): short strings, three levels deep. */
  function plain(v, depth) {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string') return clip(v, 200);
    if (depth >= 3 || typeof v !== 'object') return undefined;
    if (Array.isArray(v)) return v.slice(0, 20).map(function (x) { var y = plain(x, depth + 1); return y === undefined ? null : y; });
    var o = {};
    Object.keys(v).slice(0, 20).forEach(function (k) { var y = plain(v[k], depth + 1); if (y !== undefined) o[clip(k, 40)] = y; });
    return o;
  }

  function capture() {
    var published = window.__cbCaptureContext;
    return {
      route: location.pathname,
      params: readParams(),
      title: clip(document.title || '', 200) || null,
      viewport: readViewport(),
      context: published && typeof published === 'object' ? plain(published, 0) : {},
    };
  }

  /** The line under the box: exactly what will be saved with the note. */
  function describe(c) {
    var parts = [c.route];
    var p = Object.keys(c.params).map(function (k) { return k + '=' + c.params[k]; }).join(' ');
    if (p) parts.push(p);
    Object.keys(c.context).forEach(function (k) {
      var v = c.context[k];
      parts.push(k + ': ' + (v && typeof v === 'object' ? (v.name || v.title || v.id || JSON.stringify(v)) : String(v)));
    });
    if (c.title) parts.push('“' + c.title + '”');
    parts.push(c.viewport ? c.viewport.replace('x', '×') : 'viewport unknown');
    return parts.join(' · ');
  }

  // ── The box ─────────────────────────────────────────────────────────────────
  var host = document.createElement('div');
  host.id = 'cb-dev-notebook';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:"Object Sans","ObjectSans","Helvetica Neue",Arial,sans-serif}' +
    '.fab{position:fixed;left:14px;bottom:14px;z-index:2147483000;width:38px;height:38px;border-radius:50%;' +
    'background:rgba(15,15,15,.9);color:#fff;border:1px solid rgba(255,255,255,.25);font-size:17px;line-height:1;cursor:pointer;' +
    'box-shadow:0 6px 18px -6px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;opacity:.75}' +
    '.fab:hover,.fab:focus-visible{opacity:1;background:#1e1a2e;outline:none}' +
    '.panel{position:fixed;left:14px;bottom:62px;z-index:2147483001;width:min(440px,calc(100vw - 28px));max-height:calc(100vh - 90px);overflow:auto;' +
    'background:#fff;color:#0f0f0f;border-radius:14px;box-shadow:0 22px 50px -18px rgba(0,0,0,.5);border:1px solid #dddbd5;padding:14px 16px 12px;font-size:13px}' +
    '.panel[hidden]{display:none}' +
    '.head{display:flex;align-items:center;gap:8px;margin:0 0 8px}' +
    '.head b{font-size:13px;font-weight:800;letter-spacing:.04em}' +
    '.head a{margin-left:auto;font-size:11px;color:#3c3654;text-decoration:none;border-bottom:1px solid #aaa3cf}' +
    '.head button{background:none;border:none;font-size:18px;line-height:1;color:#888680;cursor:pointer;padding:0 2px}' +
    'textarea{width:100%;min-height:96px;resize:vertical;border:1px solid #dddbd5;border-radius:10px;padding:9px 11px;font-size:13px;line-height:1.45;color:#0f0f0f}' +
    'textarea:focus{outline:none;border-color:#aaa3cf;box-shadow:0 0 0 3px rgba(170,163,207,.35)}' +
    '.tags{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 6px}' +
    '.tag{font-size:11px;font-weight:800;border:1px solid #dddbd5;background:#fff;color:#0f0f0f;border-radius:999px;padding:4px 9px;cursor:pointer}' +
    '.tag[aria-pressed="true"]{background:#0f0f0f;color:#fff;border-color:#0f0f0f}' +
    '.drop{border:1px dashed #cfccd9;border-radius:10px;padding:7px 9px;color:#888680;font-size:11px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
    '.drop.over{border-color:#aaa3cf;background:#faf9fd}' +
    '.drop button{font-size:11px;font-weight:800;border:1px solid #dddbd5;background:#fff;border-radius:8px;padding:4px 8px;cursor:pointer}' +
    '.thumb{position:relative;width:54px;height:40px;border-radius:6px;overflow:hidden;border:1px solid #dddbd5;background:#f4f3f0}' +
    '.thumb img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.thumb button{position:absolute;top:0;right:0;border:none;background:rgba(15,15,15,.75);color:#fff;font-size:11px;line-height:1;padding:2px 4px;cursor:pointer;border-radius:0 0 0 6px}' +
    '.ctx{margin:8px 0 0;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#6f6c66;word-break:break-word}' +
    '.row{display:flex;align-items:center;gap:8px;margin-top:10px}' +
    '.save{background:#0f0f0f;color:#fff;border:none;border-radius:9px;padding:9px 14px;font-size:12px;font-weight:800;letter-spacing:.04em;cursor:pointer}' +
    '.save:disabled{opacity:.5;cursor:default}' +
    '.hint{font-size:11px;color:#888680}' +
    '.status{margin-left:auto;font-size:11px;color:#3c3654;text-align:right}' +
    '.status a{color:#3c3654}' +
    '</style>' +
    '<button class="fab" type="button" aria-label="Write a dev note (Ctrl+. or ⌘.)" title="Dev note — Ctrl+. / ⌘.">✎</button>' +
    '<div class="panel" role="dialog" aria-label="Dev note" hidden>' +
    '  <div class="head"><b>Dev note</b><a href="' + NOTEBOOK + '" target="_blank" rel="noopener">Notebook ↗</a>' +
    '    <button type="button" class="close" aria-label="Close">×</button></div>' +
    '  <textarea aria-label="What did you notice?" placeholder="What did you notice? Paste or drop screenshots here too."></textarea>' +
    '  <div class="tags" role="group" aria-label="Tags"></div>' +
    '  <div class="drop"><span class="thumbs"></span><span class="drophint">Paste or drop screenshots</span></div>' +
    '  <p class="ctx"></p>' +
    '  <div class="row"><button type="button" class="save">Save</button><span class="hint">Ctrl/⌘ ↵ · Esc</span><span class="status" aria-live="polite"></span></div>' +
    '</div>';

  var fab = root.querySelector('.fab');
  var panel = root.querySelector('.panel');
  var ta = root.querySelector('textarea');
  var tagsEl = root.querySelector('.tags');
  var drop = root.querySelector('.drop');
  var thumbs = root.querySelector('.thumbs');
  var ctxEl = root.querySelector('.ctx');
  var saveBtn = root.querySelector('.save');
  var statusEl = root.querySelector('.status');

  var selected = {};
  var shots = [];
  var captured = null;
  var saving = false;
  var returnFocus = null;

  TAGS.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'tag'; b.textContent = t.label; b.setAttribute('aria-pressed', 'false');
    b.onclick = function () { selected[t.id] = !selected[t.id]; b.setAttribute('aria-pressed', String(!!selected[t.id])); };
    tagsEl.appendChild(b);
  });

  if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
    var grab = document.createElement('button');
    grab.type = 'button'; grab.textContent = 'Capture this screen';
    grab.onclick = function () { void captureScreen(); };
    drop.appendChild(grab);
  }

  try { ta.value = sessionStorage.getItem(DRAFT) || ''; } catch (e) { /* no draft */ }
  ta.addEventListener('input', function () { try { sessionStorage.setItem(DRAFT, ta.value); } catch (e) { /* fine */ } });

  function setStatus(text, link) {
    statusEl.textContent = text;
    if (link) {
      statusEl.appendChild(document.createTextNode(' · '));
      var a = document.createElement('a'); a.href = link.href; a.textContent = link.text; a.target = '_blank'; a.rel = 'noopener';
      statusEl.appendChild(a);
    }
  }

  function renderThumbs() {
    thumbs.textContent = '';
    shots.forEach(function (s, i) {
      var d = document.createElement('span'); d.className = 'thumb';
      var img = document.createElement('img'); img.src = s.url; img.alt = 'Screenshot ' + (i + 1);
      var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove screenshot ' + (i + 1));
      x.onclick = function () { URL.revokeObjectURL(s.url); shots.splice(i, 1); renderThumbs(); };
      d.appendChild(img); d.appendChild(x); thumbs.appendChild(d);
    });
    root.querySelector('.drophint').textContent = shots.length ? shots.length + ' of ' + MAX_SHOTS : 'Paste or drop screenshots';
  }

  /** Big pastes are re-encoded (longest side 2000 px) so they upload fast and fit the 5 MB cap. */
  function shrink(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve(b && b.size < file.size ? b : file); }, 'image/webp', 0.9);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function addImage(file) {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { setStatus('Screenshots are PNG, JPEG, WebP or GIF.'); return Promise.resolve(); }
    if (shots.length >= MAX_SHOTS) { setStatus(MAX_SHOTS + ' screenshots at most.'); return Promise.resolve(); }
    return (file.size > 1500000 ? shrink(file) : Promise.resolve(file)).then(function (blob) {
      if (blob.size > 5 * 1024 * 1024) { setStatus('That image is over 5 MB even shrunk.'); return; }
      shots.push({ blob: blob, url: URL.createObjectURL(blob) });
      renderThumbs();
    });
  }

  /** One frame of this tab, with the box hidden while it's taken. The browser asks first, every time. */
  function captureScreen() {
    host.style.display = 'none';
    return navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true })
      .then(function (stream) {
        var video = document.createElement('video');
        video.muted = true; video.srcObject = stream;
        return video.play().then(function () {
          return new Promise(function (r) { setTimeout(r, 350); });
        }).then(function () {
          var c = document.createElement('canvas');
          c.width = video.videoWidth; c.height = video.videoHeight;
          c.getContext('2d').drawImage(video, 0, 0);
          stream.getTracks().forEach(function (t) { t.stop(); });
          return new Promise(function (r) { c.toBlob(r, 'image/png'); });
        });
      })
      .then(function (blob) { return blob ? addImage(new File([blob], 'screen.png', { type: 'image/png' })) : undefined; })
      .catch(function () { setStatus('No screen captured.'); })
      .then(function () { host.style.display = ''; ta.focus(); });
  }

  function open() {
    if (!panel.hidden) { ta.focus(); return; }
    returnFocus = document.activeElement;
    captured = capture();
    ctxEl.textContent = describe(captured);
    setStatus('');
    panel.hidden = false;
    ta.focus();
  }

  function close() {
    panel.hidden = true;
    if (returnFocus && typeof returnFocus.focus === 'function') { try { returnFocus.focus(); } catch (e) { /* gone */ } }
  }

  function signedOut() {
    try { localStorage.removeItem(KEY); } catch (e) { /* fine */ }
    setStatus('Signed out of the notebook.', { href: NOTEBOOK, text: 'Sign in again' });
  }

  function save() {
    var text = ta.value.trim();
    if (!text) { setStatus('Write something first.'); ta.focus(); return; }
    if (saving) return;
    var s = session();
    if (!s) { signedOut(); return; }
    saving = true; saveBtn.disabled = true; setStatus('Saving…');
    var auth = { Authorization: 'Bearer ' + s.token };
    var ctx = captured || capture();
    var body = { body: text, tags: TAGS.map(function (t) { return t.id; }).filter(function (id) { return selected[id]; }) };
    Object.keys(ctx).forEach(function (k) { body[k] = ctx[k]; });
    fetch(API + '/notes', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body: JSON.stringify(body) })
      .then(function (res) {
        if (res.status === 401) { signedOut(); throw null; }
        return res.json().then(function (data) { if (!res.ok) throw new Error(data.message || 'Couldn’t save.'); return data.note; });
      })
      .then(function (note) {
        // Screenshots go up after the note: a failed upload never loses the text.
        var failed = 0;
        return shots.reduce(function (p, s) {
          return p.then(function () {
            return fetch(API + '/notes/' + note.id + '/shots', { method: 'POST', headers: auth, body: s.blob })
              .then(function (r) { if (!r.ok) failed++; }, function () { failed++; });
          });
        }, Promise.resolve()).then(function () { return { note: note, failed: failed }; });
      })
      .then(function (r) {
        shots.forEach(function (s) { URL.revokeObjectURL(s.url); });
        shots = []; renderThumbs();
        ta.value = ''; try { sessionStorage.removeItem(DRAFT); } catch (e) { /* fine */ }
        Object.keys(selected).forEach(function (k) { selected[k] = false; });
        tagsEl.querySelectorAll('.tag').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        setStatus('Saved ' + r.note.id + (r.failed ? ' — ' + r.failed + ' screenshot' + (r.failed > 1 ? 's' : '') + ' didn’t upload' : ''),
          { href: NOTEBOOK + '?note=' + encodeURIComponent(r.note.id), text: 'Open' });
        setTimeout(function () { if (!ta.value) close(); }, r.failed ? 5000 : 1800);
      })
      .catch(function (err) { if (err) setStatus((err.message || 'Couldn’t save') + ' — your note is still here.'); })
      .then(function () { saving = false; saveBtn.disabled = false; });
  }

  fab.onclick = function () { if (panel.hidden) open(); else close(); };
  root.querySelector('.close').onclick = close;
  saveBtn.onclick = save;

  // Keystrokes typed in the box stay in the box: the carousels, for one, bind ⌘↵ and the arrows.
  ['keydown', 'keyup', 'keypress'].forEach(function (type) {
    panel.addEventListener(type, function (e) {
      e.stopPropagation();
      if (type !== 'keydown') return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
    });
  });

  panel.addEventListener('paste', function (e) {
    var files = [].slice.call((e.clipboardData && e.clipboardData.files) || []).filter(function (f) { return /^image\//.test(f.type); });
    if (!files.length) { e.stopPropagation(); return; }
    e.preventDefault(); e.stopPropagation();
    files.reduce(function (p, f) { return p.then(function () { return addImage(f); }); }, Promise.resolve());
  });
  panel.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
  panel.addEventListener('dragleave', function () { drop.classList.remove('over'); });
  panel.addEventListener('drop', function (e) {
    e.preventDefault(); e.stopPropagation(); drop.classList.remove('over');
    [].slice.call((e.dataTransfer && e.dataTransfer.files) || []).reduce(function (p, f) { return p.then(function () { return addImage(f); }); }, Promise.resolve());
  });

  // The chord works everywhere, text fields included: the field you're in is often the thing to note.
  window.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === '.' || e.code === 'Period')) {
      e.preventDefault(); e.stopPropagation();
      if (panel.hidden) open(); else close();
    }
  }, true);

  function mount() { if (!host.isConnected) document.body.appendChild(host); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  // For the notebook page and tests: open the box programmatically.
  window.CBDevNotebook = { open: open, close: close };
})();
