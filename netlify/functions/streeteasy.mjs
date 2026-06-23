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
      description: 'URLs of the actual PROPERTY photographs from the listing\'s photo gallery/carousel, in display order (the first is the hero). Full https:// URLs of real interior/exterior listing photos only. NEVER include the StreetEasy logo, site navigation/UI icons, agent headshots or avatars, neighborhood maps, floor-plan thumbnails, or advertisement images.',
    },
    heroImageUrl: {
      type: 'string',
      description: 'Complete https:// URL of the primary/first PROPERTY photo of the listing (the large hero image in the gallery). Must be a real listing photograph — never the StreetEasy logo, a UI icon, an agent headshot, or a map.',
    },
  },
};
const EXTRACT_PROMPT =
  'Extract every field from this real-estate listing page. ' +
  'address: the street address with apt/unit if present (no city/state/zip). ' +
  'neighborhood: the NYC neighborhood name. ' +
  'price: the listing price. ' +
  'beds / baths / sqft: read these from the listing\'s key-details / specs row (bedroom count, bathroom count, interior square footage). ' +
  'agent: the listing agent\'s name. ' +
  'description: the COMPLETE "About this home" text — every paragraph in full, including anything hidden behind a "read more"/"see more"/"show more" expander; never return a truncated preview. ' +
  'photos: the real property photographs from the gallery (NOT the logo, icons, agent headshots, maps, or ads). ' +
  'If a field genuinely is not on the page, leave it empty — do not guess.';

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
    // opts: { withActions, withProxy }
    const mkBody = (opts = {}) => ({
      url,
      formats: ['extract'],
      onlyMainContent: true,
      waitFor: 4000, // StreetEasy is JS-heavy — give the listing time to fully render
      extract: { schema: SCHEMA, prompt: EXTRACT_PROMPT },
      // StreetEasy aggressively blocks bots; without a stealthier proxy it serves a
      // stripped/anti-bot page whose only "image" is the SE logo and whose listing
      // details never render (you get the og: description but no address/beds/baths).
      // 'auto' starts on the basic proxy and transparently retries via stealth on a
      // block. We gate it so we can fall back to a bare request if the plan rejects it.
      ...(opts.withProxy ? { proxy: 'auto', blockAds: true } : {}),
      ...(opts.withActions ? {
        actions: [
          { type: 'wait', milliseconds: 2500 },
          { type: 'click', selector: 'button[aria-expanded="false"]' }, // common "read more" expander
          { type: 'wait', milliseconds: 1200 },
        ],
      } : {}),
    });

    async function call(opts) {
      const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(mkBody(opts)),
      });
      const j = await r.json().catch(() => null);
      return { ok: r.ok && j && j.success !== false, status: r.status, j };
    }

    // Best case first (stealth proxy + read-more click), then progressively simpler so
    // we're never worse off than a bare scrape if an option/selector isn't supported.
    let res = await call({ withActions: true, withProxy: true });
    if (!res.ok) res = await call({ withActions: false, withProxy: true });
    if (!res.ok) res = await call({ withActions: false, withProxy: false });
    if (!res.ok) {
      return json({ error: 'Firecrawl ' + res.status, message: JSON.stringify(res.j || '').slice(0, 500) }, 502);
    }

    const data = res.j;
    const ex = data.data?.extract || data.extract || {};

    // URL-level junk filter: drop logos, UI sprites/icons, avatars, maps, SVGs, etc.
    // before we even fetch them — these are what slip through as a bogus "hero".
    const JUNK = /(logo|sprite|favicon|\bicon\b|\/icons?\/|placeholder|avatar|headshot|\bmap\b|\bads?\b|advert|badge|watermark|pixel|\.svg(\?|$))/i;
    const looksLikePhoto = (u) => /^https?:\/\//i.test(u) && !JUNK.test(u);

    // Fetch listing photos server-side and base64 them (bypasses browser CORS / hotlink
    // blocks). Returns null for non-images and for tiny files (logos/icons are small —
    // real listing photos are tens to hundreds of KB), so junk can't become the hero.
    async function toDataUrl(u) {
      try {
        const imgRes = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 CB-Carousel-Builder' } });
        if (!imgRes.ok) return null;
        const ct = imgRes.headers.get('content-type') || 'image/jpeg';
        if (!ct.startsWith('image/') || /svg/i.test(ct)) return null;
        const u8 = new Uint8Array(await imgRes.arrayBuffer());
        if (u8.length < 12000) return null; // ~12KB floor → filters logos/icons/spacers
        let s = ''; const chunk = 8192;
        for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
        return 'data:' + ct + ';base64,' + btoa(s);
      } catch (e) { return null; }
    }

    // Build an ordered, deduped, junk-filtered URL list (hero first), cap at 8, base64 each.
    const urls = [];
    if (ex.heroImageUrl) urls.push(ex.heroImageUrl);
    if (Array.isArray(ex.photos)) for (const p of ex.photos) if (typeof p === 'string') urls.push(p);
    const seen = new Set();
    const ordered = urls.filter((u) => looksLikePhoto(u) && !seen.has(u) && seen.add(u)).slice(0, 8);
    const photos = (await Promise.all(ordered.map(toDataUrl))).filter(Boolean);
    const heroImage = photos[0] || null;

    // If essentially nothing came back, StreetEasy most likely served an anti-bot wall.
    const gotFacts = !!(ex.address || ex.beds || ex.baths || ex.price);
    const warning = (!gotFacts && !photos.length)
      ? 'StreetEasy may have blocked this scrape (no details or photos came back). Try importing again, or check the URL is a single listing page.'
      : '';

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
      warning,
      sourceUrl: url,
    });
  } catch (e) {
    console.error('streeteasy fn error:', e);
    return json({ error: 'Function exception', message: String(e?.message || e) }, 500);
  }
};
