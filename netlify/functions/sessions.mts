import { getStore } from '@netlify/blobs';
import { requireStudio } from '../../tools-src/studio-auth/production.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    const store = getStore('cb-sessions');

    if (req.method === 'GET') {
      const raw = await store.get('list', { type: 'text' });
      return new Response(raw || '[]', {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const newSession = await req.json();
      const raw = await store.get('list', { type: 'text' });
      let sessions = [];
      try { sessions = raw ? JSON.parse(raw) : []; } catch (e) {}
      sessions.unshift(newSession);
      sessions = sessions.slice(0, 3);
      await store.set('list', JSON.stringify(sessions));
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('sessions fn error:', e);
    return json({
      error: 'Function exception',
      message: e?.message || String(e),
      name: e?.name,
    }, 500);
  }
};
