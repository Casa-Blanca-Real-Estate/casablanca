/* Casa Blanca — shared StreetEasy import client.
   window.CBImportStreetEasy(url, opts) → Promise<result>

   Uses the ASYNC flow (background function + polling) so no single request hits Netlify's
   26s function cap:
     1. POST {url, jobId} → /.netlify/functions/streeteasy-import-background   (202, instant)
     2. poll POST {id} → /.netlify/functions/streeteasy-status                  (every ~3s)
        until { status: 'done', ... } or { status: 'error', ... }

   If the async endpoints are unreachable (e.g. not deployed yet on a given host) it falls
   back to the legacy synchronous /.netlify/functions/streeteasy endpoint, so callers are
   never worse off than before. It does NOT fall back on a real timeout or a content error
   (blocked / not found) — those would fail the same way synchronously.

   opts: { backend?, onStatus?(msg), signal?, timeoutMs? }
   result: { address, neighborhood, price, beds, baths, sqft, agent, description,
             heroImage, photos[], warning?, blocked? }
*/
(function () {
  function base(opts) {
    if (opts && opts.backend != null) return String(opts.backend).replace(/\/+$/, '');
    return (localStorage.getItem('cb_backend') || '').replace(/\/+$/, '');
  }
  function uuid() {
    return (self.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'job-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
  function post(u, body, signal) {
    return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function asyncImport(url, opts) {
    const b = base(opts);
    const jobId = uuid();
    const onStatus = opts.onStatus || function () {};
    onStatus('Starting import…');

    const start = await post(b + '/.netlify/functions/streeteasy-import-background', { url, jobId }, opts.signal);
    // Background functions answer 202; a non-2xx here means the endpoint isn't available.
    if (!(start.status === 202 || start.ok)) { const err = new Error('bg-start-' + start.status); err.unavailable = true; throw err; }

    const deadline = Date.now() + (opts.timeoutMs || 150000);
    let firstDelay = 2500;
    await sleep(firstDelay);
    while (Date.now() < deadline) {
      if (opts.signal && opts.signal.aborted) throw new Error('aborted');
      let j = null;
      try {
        const r = await post(b + '/.netlify/functions/streeteasy-status', { id: jobId }, opts.signal);
        j = await r.json();
        // Signed out, or not let in (the Studio sign-in, studio-auth.js): waiting won't change it.
        if (r.status === 401 || r.status === 403) { j = { status: 'error', error: (j && j.message) || 'Sign in to import.' }; }
      } catch (e) { await sleep(3000); continue; }
      if (j && j.status === 'done') { onStatus('Imported'); return j; }
      if (j && j.status === 'error') { const e = new Error(j.error || 'import failed'); e.blocked = j.blocked; throw e; }
      onStatus(j && j.status === 'running' ? 'Reading the listing…' : 'Queued…');
      await sleep(3000);
    }
    throw new Error('Import timed out — StreetEasy was too slow. Try again.');
  }

  async function syncImport(url, opts) {
    const b = base(opts);
    const r = await post(b + '/.netlify/functions/streeteasy', { url }, opts.signal);
    const tx = await r.text();
    let j; try { j = JSON.parse(tx); } catch (_) { throw new Error('server error (HTTP ' + r.status + ')'); }
    if (!r.ok || j.error) { const e = new Error(((r.status === 401 || r.status === 403) && j.message) || j.error || 'import failed'); e.blocked = j.blocked; throw e; }
    return j;
  }

  window.CBImportStreetEasy = async function (url, opts) {
    opts = opts || {};
    try {
      return await asyncImport(url, opts);
    } catch (e) {
      // Only fall back to the sync endpoint when the async path is unavailable (not deployed).
      // Real content errors (blocked) and timeouts would fail the same way synchronously.
      if (e && e.unavailable) {
        if (opts.onStatus) opts.onStatus('Falling back…');
        return await syncImport(url, opts);
      }
      throw e;
    }
  };
})();
