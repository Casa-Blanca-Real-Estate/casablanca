// Shared helpers for the Casa Blanca tool backend (Netlify Functions v2).

// CORS: the tools are served from GitHub Pages (and sometimes opened from
// file://), a different origin than this Netlify backend. No cookies/credentials
// are used, so a permissive ACAO is fine. Lock it down by setting ALLOWED_ORIGIN
// in the Netlify env (e.g. https://kjcamron.github.io) if you prefer.
export function cors() {
  const o = process.env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, X-Studio-Token',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json' },
  });
}

export function preflight() {
  return new Response('', { status: 204, headers: cors() });
}
