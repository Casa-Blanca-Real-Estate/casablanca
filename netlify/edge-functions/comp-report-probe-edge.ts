// TEMPORARY — CR-1 time-limit probe, edge runtime (Deno). Netlify documents a
// 50 ms CPU budget and a 40 s limit to send headers, but no wall-clock limit
// for edge functions. ?mode=ticks streams a tick a second for ?s= seconds;
// ?pre= delays the headers. ?mode=claude passes one long Claude Opus 5.5 turn
// straight through (raw bytes, no parsing — CPU stays near zero). Refused in
// production and without the probe key. Removed once measured.
//
// Raw fetch here on purpose: this is a platform measurement, not product code,
// and the edge runtime isn't where the product's Anthropic client lives.

const KEY_SHA256 = 'cc1f06f053c6cb48a9258d750829a9b315ff195c8bd26b14b9eb86cf9ed025ef';

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (u: URL, k: string, d: number, max: number) => {
  const n = Number(u.searchParams.get(k) ?? d);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : d;
};

// deno-lint-ignore no-explicit-any
export default async (req: Request, context: any) => {
  if (context?.deploy?.context === 'production') return new Response('Not found', { status: 404 });
  const url = new URL(req.url);
  if ((await sha256Hex(url.searchParams.get('k') ?? '')) !== KEY_SHA256) return new Response('Not found', { status: 404 });

  const pre = num(url, 'pre', 0, 120);
  if (pre) await sleep(pre * 1000);

  if (url.searchParams.get('mode') === 'claude') {
    // deno-lint-ignore no-explicit-any
    const apiKey = (globalThis as any).Netlify?.env?.get('ANTHROPIC_API_KEY');
    if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY is not visible to edge functions' }, { status: 503 });
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'thinking-display-updates-2026-08-18,server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5-5',
        max_tokens: num(url, 'max', 20000, 32000),
        stream: true,
        fallbacks: 'default',
        thinking: { type: 'adaptive', display: 'updates' },
        output_config: { effort: 'high' },
        system: 'You are helping test a streaming pipeline for a real estate tool. Follow the user\'s instructions exactly and write the full requested length.',
        messages: [{
          role: 'user',
          content: 'Write a thorough, well-structured explainer - about 4,000 words, in 12 sections with headings - on how a comparative market analysis for a New York City condo is built: choosing comparable sales, keeping sold, in-contract and active listings as separate evidence, price per square foot, adjustments, and presenting a range rather than a single number.',
        }],
      }),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'text/event-stream', 'cache-control': 'no-store' },
    });
  }

  const seconds = num(url, 's', 10, 1800);
  const t0 = Date.now();
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const emit = (e: Record<string, unknown>) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ ...e, t: Date.now() - t0 })}\n\n`));
      emit({ type: 'open', runtime: 'edge' });
      for (let i = 1; i <= seconds; i++) {
        await sleep(1000);
        emit({ type: 'tick', i });
      }
      emit({ type: 'done' });
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
};

export const config = { path: '/api/comp-report/probe/edge' };
