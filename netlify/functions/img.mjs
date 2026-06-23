// GET /api/img?u=<encoded image url>
// Proxies a listing photo so the browser can draw it onto the <canvas> without
// tainting it (StreetEasy's CDN doesn't send permissive CORS headers, which would
// otherwise break canvas export). Returns the image bytes with ACAO.
import { cors } from './_lib.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: cors() });

  const u = new URL(req.url).searchParams.get('u');
  if (!u || !/^https?:\/\//i.test(u)) {
    return new Response('Bad or missing ?u= image url', { status: 400, headers: cors() });
  }

  let r;
  try {
    r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (CasaBlancaTool)' } });
  } catch (e) {
    return new Response('Upstream fetch failed: ' + String(e), { status: 502, headers: cors() });
  }
  if (!r.ok) return new Response('Upstream returned ' + r.status, { status: 502, headers: cors() });

  const ct = r.headers.get('content-type') || 'image/jpeg';
  if (!ct.startsWith('image/')) {
    return new Response('Not an image (' + ct + ')', { status: 415, headers: cors() });
  }

  const buf = await r.arrayBuffer();
  return new Response(buf, {
    status: 200,
    headers: { ...cors(), 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' },
  });
};

