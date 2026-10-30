import { getStore } from '@netlify/blobs';
import { requireStudio } from '../../tools-src/studio-auth/production.ts';

// Live site content editable in-platform by signed-in devs and read by everyone:
// the next workshop card and the "What's new" changelog. Stored as a single
// strongly-consistent blob (per-key get is strongly consistent on Netlify Blobs,
// unlike list()), so an edit propagates to every visitor on the next load.

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Studio-Token',
  'Vary': 'Origin',
};

const KEY = 'config';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function read(store) {
  try {
    const raw = await store.get(KEY, { type: 'text' });
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) { return {}; }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  // Reading: anyone signed in to the Studio. Changing: the team, as the dashboard's editing controls are.
  const refused = await requireStudio(req, { headers: CORS, team: req.method !== 'GET' });
  if (refused) return refused;

  try {
    const store = getStore('cb-site');

    if (req.method === 'GET') {
      return json(await read(store));
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const cfg = await read(store);

      // Workshop: replace the whole object when provided. Supports either a fixed
      // `date` or an auto-repeating `anchor` + `recurEveryDays` (rolls forward client-side).
      if (body.workshop && typeof body.workshop === 'object') {
        const w = body.workshop;
        cfg.workshop = {
          title: String(w.title || 'Social Media & Content Workshop').slice(0, 120),
          date: String(w.date || '').slice(0, 10),
          anchor: String(w.anchor || '').slice(0, 10),
          recurEveryDays: Number(w.recurEveryDays) > 0 ? Math.min(365, Math.floor(Number(w.recurEveryDays))) : 0,
          time: String(w.time || '').slice(0, 40),
          location: String(w.location || '').slice(0, 80),
          cadence: String(w.cadence || '').slice(0, 80),
        };
      }
      if (body.workshop === null) delete cfg.workshop;

      // Changelog: accept a full array, or prepend a single entry.
      if (Array.isArray(body.changelog)) {
        cfg.changelog = body.changelog.slice(0, 50);
      } else if (body.entry && typeof body.entry === 'object') {
        const entry = {
          date: String(body.entry.date || '').slice(0, 10),
          title: String(body.entry.title || '').slice(0, 140),
          items: Array.isArray(body.entry.items) ? body.entry.items.map((s) => String(s).slice(0, 400)).slice(0, 20) : [],
        };
        cfg.changelog = [entry, ...(Array.isArray(cfg.changelog) ? cfg.changelog : [])].slice(0, 50);
      }
      if (body.deleteChangelogDate) {
        cfg.changelog = (cfg.changelog || []).filter((e) => e.date !== body.deleteChangelogDate);
      }

      await store.set(KEY, JSON.stringify(cfg));
      return json({ ok: true, config: cfg });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('site fn error:', e);
    return json({ error: 'Function exception', message: e?.message || String(e) }, 500);
  }
};
