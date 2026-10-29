import { getStore } from '@netlify/blobs';
import { requireStudio } from '../../tools-src/studio-auth/production.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const refused = await requireStudio(req, { headers: CORS });
  if (refused) return refused;

  try {
    const store = getStore('agents');
    const url = new URL(req.url);
    const keyParam = url.searchParams.get('key');
    const imageParam = url.searchParams.get('image');

    if (req.method === 'GET') {
      // ?image=KEY  →  raw image bytes (for <img> tags)
      if (imageParam) {
        const raw = await store.get(imageParam, { type: 'text' });
        if (!raw) return new Response('Not found', { status: 404, headers: CORS });
        let src = '';
        try { src = JSON.parse(raw).src || ''; } catch (e) {}
        const m = /^data:([^;]+);base64,(.+)$/.exec(src);
        if (!m) return new Response('No image data', { status: 404, headers: CORS });
        const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        return new Response(bytes, {
          headers: { ...CORS, 'Content-Type': m[1], 'Cache-Control': 'public, max-age=86400' },
        });
      }

      // ?key=KEY  →  JSON {name, src} (for applying to a deal)
      if (keyParam) {
        const raw = await store.get(keyParam, { type: 'text' });
        if (!raw) return json({ error: 'Not found' }, 404);
        return new Response(raw, { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      // no param  →  list of {key, name}
      const { blobs } = await store.list();
      const agents = await Promise.all(
        blobs.map(async (b) => {
          try {
            const raw = await store.get(b.key, { type: 'text' });
            if (!raw) return null;
            const { name } = JSON.parse(raw);
            return { key: b.key, name };
          } catch (e) { return null; }
        })
      );
      return json(agents.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)));
    }

    if (req.method === 'POST') {
      const { name, src } = await req.json();
      if (!name || !src) return json({ error: 'name and src required' }, 400);
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      await store.set(key, JSON.stringify({ name, src }));
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
    console.error('agents fn error:', e);
    return json({ error: 'Function exception', message: e?.message || String(e), name: e?.name }, 500);
  }
};
