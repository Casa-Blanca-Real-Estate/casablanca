// POST /api/copy  { facts, status, slides:[{kind}], tone? }
// Writes Casa Blanca editorial copy for a carousel from listing facts, using Claude.
//
// Env: ANTHROPIC_API_KEY  (set in Netlify → Site settings → Environment variables)
import Anthropic from '@anthropic-ai/sdk';
import { json, preflight } from './_lib.mjs';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const SYSTEM = `You are the copywriter for Casa Blanca, a New York City luxury real-estate brand.
Voice: understated, confident, editorial — like a design magazine, not a hype ad.
Rules:
- Present tense. No exclamation marks. No emoji. No hashtags.
- Concrete and specific over superlatives; let the architecture and address do the bragging.
- Tight. Captions are for an Instagram carousel, read on a phone.
- Never invent facts that aren't supported by the provided listing details.
- American English. Title-case headings; sentence-case body.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    coverSubhead: { type: 'string', description: '2–3 short lines for the cover, e.g. a hook + the price. Use \\n between lines.' },
    teaser: { type: 'string', description: 'One or two sentence teaser/description for the second slide.' },
    slides: {
      type: 'array',
      description: 'One entry per requested mid slide, in order.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          heading: { type: 'string', description: 'Short all-caps-friendly heading (a few words).' },
          body: { type: 'string', description: '1–3 sentences of body copy.' },
        },
        required: ['heading', 'body'],
      },
    },
  },
  required: ['coverSubhead', 'teaser', 'slides'],
};

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY is not set on the backend' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const facts = body?.facts || {};
  const status = body?.status || 'closed';
  const slides = Array.isArray(body?.slides) ? body.slides : [];
  const tone = body?.tone ? `\nExtra direction from the editor: ${body.tone}` : '';

  const statusLabel = {
    justlisted: 'Just Listed', incontract: 'In Contract', justsold: 'Just Sold', closed: 'Closed (off-market sale)',
  }[status] || status;

  const prompt = `Listing facts (JSON):
${JSON.stringify(facts, null, 2)}

Post status: ${statusLabel}.
The carousel has ${slides.length} mid slide(s) after the cover and teaser. Their kinds, in order:
${slides.map((s, i) => `  ${i + 1}. ${s?.kind || 'single'}`).join('\n') || '  (none)'}

Write:
- coverSubhead: the cover hook. For a "Closed"/"Just Sold" post the last line is typically the price; for "Just Listed"/"In Contract" it can be the asking price or a hook.
- teaser: the second-slide line.
- slides: ${slides.length} heading+body pair(s), one per mid slide above, each focused on a different angle (the architecture, the neighborhood, a standout room/detail, the building).${tone}

Return only the structured JSON.`;

  let resp;
  try {
    resp = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 3000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    return json({ error: 'Claude request failed', detail: String(e?.message || e) }, 502);
  }

  if (resp.stop_reason === 'refusal') return json({ error: 'Request was declined', detail: resp.stop_details }, 422);

  const text = resp.content.find((b) => b.type === 'text')?.text || '{}';
  let data;
  try { data = JSON.parse(text); } catch { return json({ error: 'Model did not return valid JSON', raw: text }, 502); }

  return json({ ok: true, ...data });
};

export const config = { path: '/api/copy' };
