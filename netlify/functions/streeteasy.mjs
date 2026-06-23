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
      description: 'Street address INCLUDING apt/unit number if present, but no city, state, or ZIP. E.g. "304 E 73rd St #1C" or "10 Hubert St".',
    },
    neighborhood: {
      type: 'string',
      description: 'NYC neighborhood name only, in title case. E.g. "Tribeca" or "Greenwich Village" or "Upper West Side"',
    },
    price: {
      type: 'string',
      description: 'Listing price in shorthand format like "1.5M" or "850K" (no dollar sign). Convert $1,500,000 to "1.5M" and $850,000 to "850K"',
    },
    beds: { type: 'string', description: 'Bedroom COUNT only — digits, or the word "Studio". No "BD"/"bed" suffix. E.g. "2" or "Studio". Empty if unknown.' },
    baths: { type: 'string', description: 'Bathroom COUNT only — digits, may be decimal. No "BA"/"bath" suffix. E.g. "1" or "2.5". Empty if unknown.' },
    sqft: { type: 'string', description: 'Interior square footage with commas, digits only (no "sqft"). E.g. "1,530". Empty if unknown.' },
    agent: { type: 'string', description: 'Primary listing agent full name, if shown. Empty if unknown.' },
    description: {
      type: 'string',
      description: 'The COMPLETE "About this home" / listing description — every paragraph, in full. If a "read more"/"see more"/"show more" expander truncates it on the page, still return the entire description, never the shortened preview. Do not summarize or cut it off.',
    },
    photos: {
      type: 'array',
      items: { type: 'string' },
      description: 'Full-resolution listing photo image URLs, in display order (the first is the hero). Full https:// URLs.',
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

    // Fetch listing photos server-side and base64 them (bypasses browser CORS / hotlink blocks).
    async function toDataUrl(u) {
      try {
        const imgRes = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 CB-Carousel-Builder' } });
        if (!imgRes.ok) return null;
        const ct = imgRes.headers.get('content-type') || 'image/jpeg';
        if (!ct.startsWith('image/')) return null;
        const u8 = new Uint8Array(await imgRes.arrayBuffer());
        let s = ''; const chunk = 8192;
        for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
        return 'data:' + ct + ';base64,' + btoa(s);
      } catch (e) { return null; }
    }

    // Build an ordered, deduped URL list (hero first), cap at 6, base64 each.
    const urls = [];
    if (ex.heroImageUrl) urls.push(ex.heroImageUrl);
    if (Array.isArray(ex.photos)) for (const p of ex.photos) if (typeof p === 'string') urls.push(p);
    const seen = new Set();
    const ordered = urls.filter((u) => /^https?:\/\//i.test(u) && !seen.has(u) && seen.add(u)).slice(0, 6);
    const photos = (await Promise.all(ordered.map(toDataUrl))).filter(Boolean);
    const heroImage = photos[0] || null;

    return json({
      address: ex.address || '',
      neighborhood: ex.neighborhood || '',
      price: ex.price || '',
      beds: ex.beds || '',
      baths: ex.baths || '',
      sqft: ex.sqft || '',
      agent: ex.agent || '',
      description: ex.description || '',
      heroImage,   // back-compat: first photo (base64)
      photos,      // base64 data URLs, hero first
      sourceUrl: url,
    });
  } catch (e) {
    console.error('streeteasy fn error:', e);
    return json({ error: 'Function exception', message: String(e?.message || e) }, 500);
  }
};
