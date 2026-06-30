import { getStore } from '@netlify/blobs';

// Brand asset library — logos, fonts, colors, guidelines and other on-brand
// downloads, managed in-platform by signed-in devs and readable by everyone.
// Mirrors the `agents` function: metadata + base64 src stored per blob; raw
// bytes served on demand via ?file=KEY so listings stay light.

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
};

const CATEGORIES = ['logo', 'font', 'color', 'guideline', 'template', 'other'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const slug = (s) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const store = getStore('brand');
    const url = new URL(req.url);
    const fileParam = url.searchParams.get('file');
    const keyParam = url.searchParams.get('key');

    if (req.method === 'GET') {
      // ?file=KEY  →  raw bytes (for <img src> and direct downloads)
      if (fileParam) {
        const raw = await store.get(fileParam, { type: 'text' });
        if (!raw) return new Response('Not found', { status: 404, headers: CORS });
        let src = '';
        try { src = JSON.parse(raw).src || ''; } catch (e) {}
        const m = /^data:([^;]+);base64,(.+)$/.exec(src);
        if (!m) return new Response('No file data', { status: 404, headers: CORS });
        const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        return new Response(bytes, {
          headers: { ...CORS, 'Content-Type': m[1], 'Cache-Control': 'public, max-age=3600' },
        });
      }

      // ?key=KEY  →  full metadata JSON for one asset
      if (keyParam) {
        const raw = await store.get(keyParam, { type: 'text' });
        if (!raw) return json({ error: 'Not found' }, 404);
        return new Response(raw, { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      // no param  →  list of metadata (no file src; colors keep their hex)
      const { blobs } = await store.list();
      const assets = await Promise.all(
        blobs.map(async (b) => {
          try {
            const raw = await store.get(b.key, { type: 'text' });
            if (!raw) return null;
            const a = JSON.parse(raw);
            return {
              key: b.key,
              name: a.name || b.key,
              category: a.category || 'other',
              kind: a.kind || (a.hex ? 'color' : 'file'),
              hex: a.hex || '',
              filename: a.filename || '',
              format: a.format || '',
              note: a.note || '',
              ts: a.ts || 0,
            };
          } catch (e) { return null; }
        })
      );
      return json(assets.filter(Boolean).sort((a, b) => (b.ts || 0) - (a.ts || 0)));
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const name = (body.name || '').trim();
      const category = CATEGORIES.includes(body.category) ? body.category : 'other';
      const note = (body.note || '').trim();
      if (!name) return json({ error: 'name required' }, 400);

      // A color asset carries a hex value; everything else carries a file (data URL).
      if (category === 'color' || body.kind === 'color') {
        const hex = (body.hex || '').trim();
        if (!/^#?[0-9a-fA-F]{3,8}$/.test(hex)) return json({ error: 'valid hex required' }, 400);
        const norm = hex[0] === '#' ? hex : '#' + hex;
        const key = 'color-' + slug(name);
        await store.set(key, JSON.stringify({
          name, category: 'color', kind: 'color', hex: norm, note, ts: Date.now(),
        }));
        return json({ ok: true, key });
      }

      const src = body.src || '';
      if (!/^data:([^;]+);base64,(.+)$/.test(src)) return json({ error: 'file (data URL) required' }, 400);
      const filename = (body.filename || name).trim();
      const format = (body.format || (filename.split('.').pop() || '')).toLowerCase();
      const key = category + '-' + slug(name) + '-' + format;
      await store.set(key, JSON.stringify({
        name, category, kind: 'file', src, filename, format, note, ts: Date.now(),
      }));
      return json({ ok: true, key });
    }

    if (req.method === 'DELETE') {
      const { key } = await req.json();
      if (!key) return json({ error: 'key required' }, 400);
      await store.delete(key);
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('brand fn error:', e);
    return json({ error: 'Function exception', message: e?.message || String(e), name: e?.name }, 500);
  }
};
