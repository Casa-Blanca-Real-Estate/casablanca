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

    // One lean call per attempt. We dropped the "read-more" click actions — they added
    // ~4s of scripted waiting per attempt (×3 attempts), which was the main cause of the
    // 504; the og/main-content description is enough. `timeout` makes Firecrawl abort
    // server-side *before* Netlify's function cap, so a slow scrape returns a clean error
    // instead of a gateway 504. opts: { withProxy }
    const mkBody = (opts = {}) => ({
      url,
      formats: ['extract', 'markdown'], // markdown lets us detect a bot-wall page vs. a real listing
      onlyMainContent: true,
      waitFor: 2500, // StreetEasy is JS-heavy — a little time to render, but kept short
      // Firecrawl's own cap. The primary stealth call gets the lion's share (StreetEasy
      // render + LLM extract needs ~15-20s); the bare fallback only runs after a fast
      // stealth reject, so it gets a smaller slice to keep the total under Netlify's 26s.
      timeout: opts.withProxy ? 22000 : 12000,
      extract: { schema: SCHEMA, prompt: EXTRACT_PROMPT },
      // StreetEasy always blocks the basic proxy, so go straight to stealth (skipping
      // 'auto' avoids wasting an internal basic attempt). If the plan rejects stealth it
      // fails fast and we fall back to a bare request below.
      ...(opts.withProxy ? { proxy: 'stealth', blockAds: true } : {}),
    });

    const attempts = [];
    async function call(opts) {
      const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(mkBody(opts)),
      });
      const j = await r.json().catch(() => null);
      const ok = r.ok && j && j.success !== false;
      if (!ok) attempts.push({ opts, status: r.status, error: (j && (j.error || j.details)) || ('HTTP ' + r.status) });
      return { ok, status: r.status, j };
    }

    // Single stealth attempt (best shot at StreetEasy), then a *fast-failure-only* bare
    // fallback: if stealth was rejected quickly (e.g. the plan doesn't include it) we
    // retry without a proxy; if stealth ran long and failed (timeout/wall) we stop rather
    // than risk a second slow call blowing the function budget into a 504.
    const t0 = Date.now();
    let res = await call({ withProxy: true });
    if (!res.ok && Date.now() - t0 < 7000) res = await call({ withProxy: false });
    if (!res.ok) {
      // Echo Firecrawl's actual error verbatim (no guessing) so the real cause is
      // visible in the tool's status line — e.g. credits, an invalid option, or a true
      // plan limit — instead of a misleading paraphrase.
      const detail = attempts
        .map((a) => (a.opts.withProxy ? 'stealth' : 'no-proxy') + ' → ' +
          (typeof a.error === 'string' ? a.error : JSON.stringify(a.error)))
        .join('  |  ');
      return json({ error: 'StreetEasy import failed. Firecrawl said: ' + detail.slice(0, 500), attempts }, 502);
    }

    const data = res.j;
    const ex = data.data?.extract || data.extract || {};

    // Detect a bot-wall / interstitial. StreetEasy (PerimeterX) serves a "verify you are
    // human" page that often still lists *other* (featured) properties — which is how the
    // extractor used to hand back a totally different listing. If we see wall markers, we
    // refuse to return data rather than return the wrong listing.
    const md = (data.data?.markdown || data.markdown || '');
    const meta = data.data?.metadata || data.metadata || {};
    const pageText = (md + ' ' + (meta.title || '') + ' ' + (meta.description || '')).toLowerCase();
    const WALL = /(pardon our interruption|access to this page has been denied|verify (you are|you're) (a )?human|are you a human|press & hold|enable javascript and cookies to continue|unusual activity|perimeterx|px-captcha|\bcaptcha\b)/i;
    if (WALL.test(pageText)) {
      return json({
        error: 'StreetEasy blocked this fetch with a "verify you are human" wall, so no listing data could be read. Try again in a moment, or enter the details manually.',
        blocked: true,
        finalUrl: meta.sourceURL || meta.url || url,
      }, 502);
    }

    // URL-level junk filter: drop logos, UI sprites/icons, avatars, maps, SVGs, etc.
    // before we even fetch them — these are what slip through as a bogus "hero".
    const JUNK = /(logo|sprite|favicon|\bicon\b|\/icons?\/|placeholder|avatar|headshot|\bmap\b|\bads?\b|advert|badge|watermark|pixel|\.svg(\?|$))/i;
    const looksLikePhoto = (u) => /^https?:\/\//i.test(u) && !JUNK.test(u);

    // Fetch listing photos server-side and base64 them (bypasses browser CORS / hotlink
    // blocks). Returns null for non-images and for tiny files (logos/icons are small —
    // real listing photos are tens to hundreds of KB), so junk can't become the hero.
    async function toDataUrl(u) {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 3500); // bound each image so the (parallel) phase can't run long
      try {
        const imgRes = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 CB-Carousel-Builder' }, signal: ctl.signal });
        if (!imgRes.ok) return null;
        const ct = imgRes.headers.get('content-type') || 'image/jpeg';
        if (!ct.startsWith('image/') || /svg/i.test(ct)) return null;
        const u8 = new Uint8Array(await imgRes.arrayBuffer());
        if (u8.length < 12000) return null; // ~12KB floor → filters logos/icons/spacers
        let s = ''; const chunk = 8192;
        for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
        return 'data:' + ct + ';base64,' + btoa(s);
      } catch (e) { return null; }
      finally { clearTimeout(to); }
    }

    // Build an ordered, deduped, junk-filtered URL list (hero first), cap at 8, base64 each.
    const urls = [];
    if (ex.heroImageUrl) urls.push(ex.heroImageUrl);
    if (Array.isArray(ex.photos)) for (const p of ex.photos) if (typeof p === 'string') urls.push(p);
    const seen = new Set();
    const ordered = urls.filter((u) => looksLikePhoto(u) && !seen.has(u) && seen.add(u)).slice(0, 5);
    const photos = (await Promise.all(ordered.map(toDataUrl))).filter(Boolean);
    const heroImage = photos[0] || null;

    // If essentially nothing came back, StreetEasy most likely served an anti-bot wall.
    const gotFacts = !!(ex.address || ex.beds || ex.baths || ex.price);
    // Soft sanity check: a real extract's street number should appear in the page text.
    // If it doesn't, the extractor may have latched onto a featured/related listing —
    // we still return it (manual fix beats nothing) but flag it so the user double-checks.
    const addrNum = (String(ex.address || '').match(/\d{1,5}/) || [''])[0];
    const addrSuspect = !!ex.address && !!addrNum && pageText && !pageText.includes(addrNum.toLowerCase());

    let warning = '';
    if (!gotFacts && !photos.length) {
      warning = 'StreetEasy returned no listing details or photos — it may have blocked the fetch. Try again, confirm the URL is a single listing page, or enter the details manually.';
    } else if (addrSuspect) {
      warning = 'Heads up: the imported address wasn’t found on the fetched page, so these details may be from the wrong listing — please double-check them against the URL.';
    } else if (!photos.length) {
      warning = 'Details imported, but no listing photos came through. You can add photos manually.';
    }

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
      finalUrl: meta.sourceURL || meta.url || url,
    });
  } catch (e) {
    console.error('streeteasy fn error:', e);
    return json({ error: 'Function exception', message: String(e?.message || e) }, 500);
  }
};
