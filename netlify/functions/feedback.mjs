import { getStore } from '@netlify/blobs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const store = getStore('cb-feedback');

    if (req.method === 'GET') {
      const raw = await store.get('list', { type: 'text' });
      return new Response(raw || '[]', {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const message = (body && body.message || '').trim();
      if (!message) return json({ error: 'message required' }, 400);

      const item = {
        name: (body && body.name) || '',
        email: (body && body.email) || '',
        message: (body && body.message) || '',
        tool: (body && body.tool) || '',
        ts: new Date().toISOString(),
      };

      const raw = await store.get('list', { type: 'text' });
      let list = [];
      try { list = raw ? JSON.parse(raw) : []; } catch (e) {}
      list.unshift(item);
      list = list.slice(0, 200);
      await store.set('list', JSON.stringify(list));
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('feedback fn error:', e);
    return json({
      error: 'Function exception',
      message: e?.message || String(e),
      name: e?.name,
    }, 500);
  }
};
