// POST /api/import  { url }
// Scrapes a real-estate listing (built for StreetEasy) via Firecrawl and returns
// structured facts + photo URLs the carousel tool can drop onto slides.
//
// Env: FIRECRAWL_API_KEY  (set in Netlify → Site settings → Environment variables)
import { cors, json, preflight } from './_lib.mjs';

const LISTING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    address: { type: 'string', description: 'Street address line, e.g. "71 Bleecker St #2E"' },
    neighborhood: { type: 'string', description: 'Neighborhood + city, e.g. "NoHo, NYC"' },
    price: { type: 'string', description: 'Headline price as shown, e.g. "$5,400,000"' },
    status: { type: 'string', description: 'Listing status: For Sale / In Contract / Sold / Closed' },
    beds: { type: 'string' },
    baths: { type: 'string' },
    sqft: { type: 'string' },
    agent: { type: 'string', description: 'Primary listing agent full name' },
    brokerage: { type: 'string' },
    description: { type: 'string', description: 'Marketing / "about" description of the home' },
    photos: {
      type: 'array',
      items: { type: 'string' },
      description: 'Full-resolution listing photo image URLs, in order',
    },
  },
  required: ['address', 'price'],
};

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return json({ error: 'FIRECRAWL_API_KEY is not set on the backend' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const url = (body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return json({ error: 'Provide a listing URL (https://…)' }, 400);

  // Firecrawl v1 scrape + structured extract (same API the closed-carousel tool uses).
  // withActions clicks a "read more" expander so the full description loads; if that
  // selector isn't present Firecrawl errors and we retry cleanly without actions.
  const mkBody = (withActions) => ({
    url,
    onlyMainContent: true,
    waitFor: 2500,
    formats: ['extract', 'markdown'],
    extract: {
      schema: LISTING_SCHEMA,
      prompt: 'Extract the listing fields. For "description" return the COMPLETE listing text — every paragraph in full, including anything hidden behind a "read more"/"see more" expander. Never return a truncated preview.',
    },
    ...(withActions ? {
      actions: [
        { type: 'wait', milliseconds: 1800 },
        { type: 'click', selector: 'button[aria-expanded="false"]' },
        { type: 'wait', milliseconds: 1000 },
      ],
    } : {}),
  });
  let fc;
  try {
    let res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mkBody(true)),
    });
    fc = await res.json();
    if (!res.ok || fc?.success === false) {
      res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(mkBody(false)),
      });
      fc = await res.json();
      if (!res.ok || fc?.success === false) {
        return json({ error: 'Firecrawl request failed', detail: fc }, 502);
      }
    }
  } catch (e) {
    return json({ error: 'Could not reach Firecrawl', detail: String(e) }, 502);
  }

  const data = fc.data || fc || {};
  const facts = data.extract || data.json || {};

  // Prefer photos the extractor found; otherwise pull image URLs out of the markdown.
  let photos = Array.isArray(facts.photos) ? facts.photos : [];
  if (!photos.length && typeof data.markdown === 'string') {
    photos = [...data.markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
  }
  photos = [...new Set(photos.filter((u) => /^https?:\/\//i.test(u)))].slice(0, 24);
  delete facts.photos;

  return json({ ok: true, facts, photos });
};

export const config = { path: '/api/import' };
