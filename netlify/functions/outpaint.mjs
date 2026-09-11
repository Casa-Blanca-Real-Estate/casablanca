// POST /.netlify/functions/outpaint
//
// Generative torso extension for the Profile Pic Generator. The browser sends the
// composited frame (subject on top, empty region below) plus a mask of the region to
// fill; this returns an image of the same size with the region generated.
//
// Deliberately provider-agnostic: the adapters below all take (image, mask, prompt,
// size) and return PNG/JPEG bytes. Which one runs is decided by OUTPAINT_PROVIDER, or
// by whichever key is present. See docs/dispatch/01-outpaint-provider-comparison.md
// for why the default is a mask-capable model.
//
// Env:
//   OUTPAINT_PROVIDER  flux | gemini | stability | fal   (optional; inferred from keys)
//   BFL_API_KEY        Black Forest Labs      (flux)
//   GEMINI_API_KEY     Google AI Studio       (gemini)
//   STABILITY_API_KEY  Stability              (stability)
//   FAL_KEY            fal.ai                 (fal)
//
// No key set → 501 with the name of the variable to add. Nothing here signs up for,
// or spends on, anything by itself: the client only calls this on an explicit click.

import { cors, json, preflight } from './_lib.mjs';

const MAX_BYTES   = 12 * 1024 * 1024;   // a 2048px PNG cutout is comfortably inside this
const POLL_MS     = 1200;
const POLL_TRIES  = 40;

const DEFAULT_PROMPT =
  'Continue the person\'s clothing straight downward to fill the empty area. Match the ' +
  'existing garment\'s colour, fabric texture, folds and lighting exactly. No new objects, ' +
  'no hands, no logos, no text, no background — clothing only.';

// ── provider registry ─────────────────────────────────────────────────────────
const PROVIDERS = {
  flux: {
    env: 'BFL_API_KEY',
    label: 'FLUX.1 Fill [pro] (Black Forest Labs)',
    est: () => 0.05,
    run: runFlux,
  },
  gemini: {
    env: 'GEMINI_API_KEY',
    label: 'Nano Banana 2 (Gemini 3.1 Flash Image)',
    est: ({ width, height }) => (Math.max(width, height) > 1024 ? 0.101 : 0.067),
    run: runGemini,
  },
  stability: {
    env: 'STABILITY_API_KEY',
    label: 'Stability inpaint',
    est: () => 0.05,
    run: runStability,
  },
  fal: {
    env: 'FAL_KEY',
    label: 'FLUX.1 [pro] Fill (fal)',
    est: ({ width, height }) => 0.05 * Math.max(1, Math.ceil((width * height) / 1e6)),
    run: runFal,
  },
};

function pickProvider(requested) {
  const want = (requested || process.env.OUTPAINT_PROVIDER || '').toLowerCase();
  if (want) {
    const p = PROVIDERS[want];
    if (!p) return { error: `Unknown provider "${want}". One of: ${Object.keys(PROVIDERS).join(', ')}.` };
    if (!process.env[p.env]) return { error: `Provider "${want}" needs ${p.env} in the Netlify environment.`, missing: p.env };
    return { name: want, ...p };
  }
  for (const [name, p] of Object.entries(PROVIDERS)) {
    if (process.env[p.env]) return { name, ...p };
  }
  return {
    error: 'No image-generation key is set. Add one of ' +
      Object.values(PROVIDERS).map(p => p.env).join(', ') +
      ' in Netlify → Site settings → Environment variables. ' +
      'ANTHROPIC_API_KEY cannot do this — the Anthropic API does not generate or edit images.',
    missing: Object.values(PROVIDERS).map(p => p.env),
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────
function splitDataURL(s, what) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(s || '');
  if (!m) throw new Error(`${what} must be a base64 data URL (png/jpeg/webp)`);
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_BYTES) throw new Error(`${what} is larger than ${MAX_BYTES / 1048576}MB`);
  return { mime: m[1], b64: m[2], bytes };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function toDataURL(bytes, mime = 'image/png') {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Synthetic provider used by ?dry=1 — lets the whole client path (request shape,
 *  caching, compositing, cost display) be exercised without a key or a cent. */
async function runDry({ image }) {
  return { bytes: image.bytes, mime: image.mime, note: 'dry run — the input came straight back' };
}

// ── adapters ──────────────────────────────────────────────────────────────────
// Each returns { bytes, mime }. None of these has been run against a live key in
// this session; the request shapes follow each provider's published API reference.

async function runFlux({ image, mask, prompt }) {
  const key = process.env.BFL_API_KEY;
  const start = await fetch('https://api.bfl.ai/v1/flux-pro-1.0-fill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-key': key, accept: 'application/json' },
    body: JSON.stringify({ image: image.b64, mask: mask.b64, prompt, output_format: 'png' }),
  });
  if (!start.ok) throw new Error(`BFL ${start.status}: ${(await start.text()).slice(0, 300)}`);
  const { polling_url: pollUrl, id } = await start.json();
  const url = pollUrl || `https://api.bfl.ai/v1/get_result?id=${id}`;

  for (let i = 0; i < POLL_TRIES; i++) {
    await sleep(POLL_MS);
    const r = await fetch(url, { headers: { 'x-key': key, accept: 'application/json' } });
    if (!r.ok) throw new Error(`BFL poll ${r.status}`);
    const j = await r.json();
    if (j.status === 'Ready') {
      const img = await fetch(j.result.sample);
      if (!img.ok) throw new Error(`BFL result fetch ${img.status}`);
      return { bytes: Buffer.from(await img.arrayBuffer()), mime: 'image/png' };
    }
    if (j.status && !/pending|queued|processing|request moderated|^Task not found$/i.test(j.status)) {
      if (/Ready|Pending|Queued|Processing/i.test(j.status)) continue;
      throw new Error(`BFL returned status "${j.status}"`);
    }
  }
  throw new Error('BFL timed out waiting for the result');
}

async function runGemini({ image, mask, prompt }) {
  // No mask parameter exists — the mask goes in as a second image the prompt refers to,
  // and the client composites only the region back regardless of what else moved.
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt + ' The second image is a mask: fill only the WHITE area, leave ' +
                'every black-area pixel exactly as it is.' },
        { inline_data: { mime_type: image.mime, data: image.b64 } },
        { inline_data: { mime_type: mask.mime, data: mask.b64 } },
      ],
    }],
    generationConfig: { responseModalities: ['IMAGE'] },
  };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inline_data || p.inlineData);
  if (!img) throw new Error('Gemini returned no image part');
  const inline = img.inline_data || img.inlineData;
  return { bytes: Buffer.from(inline.data, 'base64'), mime: inline.mime_type || inline.mimeType || 'image/png' };
}

async function runStability({ image, mask, prompt }) {
  const key = process.env.STABILITY_API_KEY;
  const form = new FormData();
  form.append('image', new Blob([image.bytes], { type: image.mime }), 'image.png');
  form.append('mask',  new Blob([mask.bytes],  { type: mask.mime  }), 'mask.png');
  form.append('prompt', prompt);
  form.append('output_format', 'png');
  const r = await fetch('https://api.stability.ai/v2beta/stable-image/edit/inpaint', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' },
    body: form,
  });
  if (!r.ok) throw new Error(`Stability ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return { bytes: Buffer.from(await r.arrayBuffer()), mime: 'image/png' };
}

async function runFal({ image, mask, prompt }) {
  const key = process.env.FAL_KEY;
  const r = await fetch('https://fal.run/fal-ai/flux-pro/v1/fill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
    body: JSON.stringify({
      prompt,
      image_url: `data:${image.mime};base64,${image.b64}`,
      mask_url:  `data:${mask.mime};base64,${mask.b64}`,
      output_format: 'png',
    }),
  });
  if (!r.ok) throw new Error(`fal ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const url = j?.images?.[0]?.url;
  if (!url) throw new Error('fal returned no image');
  if (url.startsWith('data:')) {
    const { bytes, mime } = splitDataURL(url, 'fal result');
    return { bytes, mime };
  }
  const img = await fetch(url);
  if (!img.ok) throw new Error(`fal result fetch ${img.status}`);
  return { bytes: Buffer.from(await img.arrayBuffer()), mime: 'image/png' };
}

// ── handler ───────────────────────────────────────────────────────────────────
export default async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  const url = new URL(req.url);

  // GET: what would this cost, and is it wired up? The client asks before showing a
  // button, so nobody clicks "generate" on a site with no key.
  if (req.method === 'GET') {
    const p = pickProvider(url.searchParams.get('provider'));
    const width  = +(url.searchParams.get('w') || 1080);
    const height = +(url.searchParams.get('h') || 1080);
    if (p.error) return json({ ready: false, reason: p.error, missing: p.missing }, 200);
    return json({
      ready: true,
      provider: p.name,
      label: p.label,
      estimatedUsd: +p.est({ width, height }).toFixed(3),
    });
  }

  if (req.method !== 'POST') return json({ error: 'POST an image and a mask' }, 405);

  let body;
  try { body = await req.json(); }
  catch { return json({ error: 'Body must be JSON' }, 400); }

  const dry = url.searchParams.get('dry') === '1' || body.dry === true;

  let image, mask;
  try {
    image = splitDataURL(body.image, 'image');
    mask  = splitDataURL(body.mask,  'mask');
  } catch (e) {
    return json({ error: String(e.message || e) }, 400);
  }

  const prompt = (typeof body.prompt === 'string' && body.prompt.trim())
    ? body.prompt.trim().slice(0, 2000)
    : DEFAULT_PROMPT;

  const p = dry
    ? { name: 'dry', label: 'dry run (no provider called)', est: () => 0, run: runDry }
    : pickProvider(body.provider);
  if (p.error) return json({ error: p.error, missing: p.missing }, 501);

  const t0 = Date.now();
  let out;
  try {
    out = await p.run({ image, mask, prompt });
  } catch (e) {
    return json({ error: `${p.label}: ${String(e.message || e)}`, provider: p.name }, 502);
  }

  return json({
    image: toDataURL(out.bytes, out.mime || 'image/png'),
    provider: p.name,
    label: p.label,
    note: out.note,
    estimatedUsd: +p.est({ width: body.width || 1080, height: body.height || 1080 }).toFixed(3),
    ms: Date.now() - t0,
  });
};
