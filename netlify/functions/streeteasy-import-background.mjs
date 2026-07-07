// Netlify BACKGROUND function (filename ends in `-background` → up to 15 min, not the 26s
// sync cap). This is the async StreetEasy import worker: it renders the listing once under
// the Firecrawl stealth proxy, extracts the FULL fields (whole description, since time is
// no longer tight), fetches + base64s the photos, and writes the finished result to the
// `se-jobs` Blobs store keyed by jobId. The browser never waits on this — it polls
// streeteasy-status.mjs for `{ status: 'done' | 'error', ... }`.
//
// Client contract:
//   POST /.netlify/functions/streeteasy-import-background   { url, jobId }
//     → 202 immediately (Netlify background contract; body ignored)
//   then poll GET /.netlify/functions/streeteasy-status?id=<jobId>
//
// Env: FIRECRAWL_API_KEY
import { getStore } from '@netlify/blobs';

const SCHEMA = {
  type: 'object',
  properties: {
    address:      { type: 'string', description: 'Street address INCLUDING apt/unit if present, but no city, state, or ZIP. E.g. "304 E 73rd St #1C".' },
    neighborhood: { type: 'string', description: 'NYC neighborhood name only, title case. E.g. "Tribeca" or "Upper West Side".' },
    price:        { type: 'string', description: 'Listing price in shorthand like "1.5M" or "850K" (no dollar sign).' },
    beds:         { type: 'string', description: 'Bedroom COUNT only — digits or "Studio". No "BD" suffix. Empty if unknown.' },
    baths:        { type: 'string', description: 'Bathroom COUNT only — digits, may be decimal. No "BA" suffix. Empty if unknown.' },
    sqft:         { type: 'string', description: 'Interior square footage with commas, digits only. E.g. "1,530". Empty if unknown.' },
    agent:        { type: 'string', description: 'Primary listing agent full name, if shown. Empty if unknown.' },
    description:  { type: 'string', description: 'The COMPLETE "About this home" description — every paragraph in full, including anything behind a "read more"/"see more" expander. Never a truncated preview.' },
    photos:       { type: 'array', items: { type: 'string' }, description: 'URLs of the actual PROPERTY photographs from the gallery, hero first. NEVER the StreetEasy logo, UI icons, agent headshots, maps, floor plans, or ads.' },
    heroImageUrl: { type: 'string', description: 'Complete https:// URL of the primary/first PROPERTY photo (the large hero image). A real listing photograph only.' },
  },
};
const EXTRACT_PROMPT =
  'Extract every field from this real-estate listing page. ' +
  'address: street address with apt/unit if present (no city/state/zip). ' +
  'neighborhood: the NYC neighborhood name. price: the listing price. ' +
  'beds / baths / sqft: from the key-details/specs row. agent: the listing agent\'s name. ' +
  'description: the COMPLETE "About this home" text — every paragraph in full, including anything hidden behind a "read more"/"see more" expander; never a truncated preview. ' +
  'photos: the real property photographs from the gallery (NOT the logo, icons, agent headshots, maps, or ads). ' +
  'If a field genuinely is not on the page, leave it empty — do not guess.';

const JUNK = /(logo|sprite|favicon|\bicon\b|\/icons?\/|placeholder|avatar|headshot|\bmap\b|\bads?\b|advert|badge|watermark|pixel|\.svg(\?|$))/i;
const looksLikePhoto = (u) => /^https?:\/\//i.test(u) && !JUNK.test(u);

async function toDataUrl(u) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 8000); // background: we can afford a bit more per image
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 CB-Carousel-Builder' }, signal: ctl.signal });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || 'image/jpeg';
    if (!ct.startsWith('image/') || /svg/i.test(ct)) return null;
    const u8 = new Uint8Array(await r.arrayBuffer());
    if (u8.length < 12000) return null; // ~12KB floor → drops logos/icons/spacers
    let s = ''; const chunk = 8192;
    for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    return 'data:' + ct + ';base64,' + btoa(s);
  } catch { return null; }
  finally { clearTimeout(to); }
}

export default async (req) => {
  // Background functions are POST-invoked; there's no useful response to the caller.
  let url, jobId;
  try { ({ url, jobId } = await req.json()); } catch { return new Response('bad json', { status: 202 }); }
  if (!url || !jobId) return new Response('missing url/jobId', { status: 202 });

  const store = getStore('se-jobs');
  const put = (obj) => store.setJSON(jobId, { ...obj, url, at: Date.now() }).catch(() => {});
  await put({ status: 'running' });

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) { await put({ status: 'error', error: 'FIRECRAWL_API_KEY not configured in Netlify env vars' }); return new Response('', { status: 202 }); }

  const mkBody = (withProxy) => ({
    url,
    formats: ['extract', 'markdown'],
    onlyMainContent: true,
    waitFor: 3000,
    timeout: 55000, // generous — a background function has a 15-min budget, no 26s cap
    extract: { schema: SCHEMA, prompt: EXTRACT_PROMPT },
    ...(withProxy ? { proxy: 'stealth', blockAds: true } : {}),
  });

  async function call(withProxy) {
    const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(mkBody(withProxy)),
    });
    const j = await r.json().catch(() => null);
    return { ok: r.ok && j && j.success !== false, status: r.status, j };
  }

  try {
    // Stealth first; a fast reject (plan issue) falls back to a bare request.
    const t0 = Date.now();
    let res = await call(true);
    if (!res.ok && Date.now() - t0 < 8000) res = await call(false);
    if (!res.ok) {
      await put({ status: 'error', error: 'Firecrawl scrape failed', detail: JSON.stringify(res.j || '').slice(0, 400) });
      return new Response('', { status: 202 });
    }

    const data = res.j;
    const ex = data.data?.extract || data.extract || {};
    const md = data.data?.markdown || data.markdown || '';
    const meta = data.data?.metadata || data.metadata || {};
    const pageText = (md + ' ' + (meta.title || '') + ' ' + (meta.description || '')).toLowerCase();
    const WALL = /(pardon our interruption|access to this page has been denied|verify (you are|you're) (a )?human|are you a human|press & hold|enable javascript and cookies to continue|unusual activity|perimeterx|px-captcha|\bcaptcha\b)/i;
    if (WALL.test(pageText)) {
      await put({ status: 'error', blocked: true, error: 'StreetEasy blocked this fetch with a "verify you are human" wall. Try again in a moment, or enter details manually.' });
      return new Response('', { status: 202 });
    }

    // Build ordered, deduped, junk-filtered photo URL list (hero first) → base64 each.
    const urls = [];
    if (ex.heroImageUrl) urls.push(ex.heroImageUrl);
    if (Array.isArray(ex.photos)) for (const p of ex.photos) if (typeof p === 'string') urls.push(p);
    const seen = new Set();
    const ordered = urls.filter((u) => looksLikePhoto(u) && !seen.has(u) && seen.add(u)).slice(0, 8);
    const photos = (await Promise.all(ordered.map(toDataUrl))).filter(Boolean);

    await put({
      status: 'done',
      address: ex.address || '', neighborhood: ex.neighborhood || '', price: ex.price || '',
      beds: ex.beds || '', baths: ex.baths || '', sqft: ex.sqft || '', agent: ex.agent || '',
      description: ex.description || '',
      heroImage: photos[0] || null,
      photos,
    });
  } catch (e) {
    await put({ status: 'error', error: 'Worker exception: ' + (e?.message || String(e)) });
  }
  return new Response('', { status: 202 });
};
