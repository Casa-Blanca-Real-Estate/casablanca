const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SCHEMA = {
  type: 'object',
  properties: {
    address: {
      type: 'string',
      description: 'Street address only without apt/unit number, city, state, or ZIP. E.g. "10 Hubert St" not "10 Hubert St, Apt 4B, New York, NY 10013"',
    },
    neighborhood: {
      type: 'string',
      description: 'NYC neighborhood name only, in title case. E.g. "Tribeca" or "Greenwich Village" or "Upper West Side"',
    },
    price: {
      type: 'string',
      description: 'Listing price in shorthand format like "1.5M" or "850K" (no dollar sign). Convert $1,500,000 to "1.5M" and $850,000 to "850K"',
    },
    description: {
      type: 'string',
      description: 'The COMPLETE "About this home" / listing description — every paragraph, in full. If a "read more"/"see more"/"show more" expander truncates it on the page, still return the entire description, never the shortened preview. Do not summarize or cut it off.',
    },
    heroImageUrl: {
      type: 'string',
      description: 'Complete URL of the primary/first hero photo of the listing. Should be a full https:// URL.',
    },
  },
};
const EXTRACT_PROMPT =
  'Extract the listing fields. For "description", return the COMPLETE listing / "About this home" text — every paragraph in full, including any text hidden behind a "read more" / "see more" / "show more" expander. Never return a truncated preview.';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { url } = await req.json();
    if (!url) return json({ error: 'url required' }, 400);

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) return json({ error: 'FIRECRAWL_API_KEY not configured in Netlify env vars' }, 500);

    // Body builder. `withActions` clicks a "read more" expander before scraping so the
    // full description loads; if the selector isn't present Firecrawl errors and we
    // transparently retry without actions (so we're never worse off than before).
    const mkBody = (withActions) => ({
      url,
      formats: ['extract'],
      onlyMainContent: true,
      waitFor: 2500, // let the listing fully render
      extract: { schema: SCHEMA, prompt: EXTRACT_PROMPT },
      ...(withActions ? {
        actions: [
          { type: 'wait', milliseconds: 1800 },
          { type: 'click', selector: 'button[aria-expanded="false"]' }, // common "read more" expander
          { type: 'wait', milliseconds: 1000 },
        ],
      } : {}),
    });

    async function call(withActions) {
      const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(mkBody(withActions)),
      });
      const j = await r.json().catch(() => null);
      return { ok: r.ok && j && j.success !== false, status: r.status, j };
    }

    let res = await call(true);
    if (!res.ok) res = await call(false); // expander click missing/failed → clean retry
    if (!res.ok) {
      return json({ error: 'Firecrawl ' + res.status, message: JSON.stringify(res.j || '').slice(0, 500) }, 502);
    }

    const data = res.j;
    const ex = data.data?.extract || data.extract || {};

    // Fetch the hero image server-side and convert to base64 (bypasses browser CORS)
    let heroImage = null;
    if (ex.heroImageUrl) {
      try {
        const imgRes = await fetch(ex.heroImageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 CB-Carousel-Builder' },
        });
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          const u8 = new Uint8Array(buf);
          let s = '';
          const chunk = 8192;
          for (let i = 0; i < u8.length; i += chunk) {
            s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
          }
          const b64 = btoa(s);
          const mime = imgRes.headers.get('content-type') || 'image/jpeg';
          heroImage = 'data:' + mime + ';base64,' + b64;
        }
      } catch (e) {
        console.warn('hero image fetch failed:', e);
      }
    }

    return json({
      address: ex.address || '',
      neighborhood: ex.neighborhood || '',
      price: ex.price || '',
      description: ex.description || '',
      heroImage,
      sourceUrl: url,
    });
  } catch (e) {
    console.error('streeteasy fn error:', e);
    return json({ error: 'Function exception', message: String(e?.message || e) }, 500);
  }
};
