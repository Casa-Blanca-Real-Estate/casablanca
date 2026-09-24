// TEMPORARY — CR-1's function time-limit probes (Dispatch 05 §6). They exist
// only to measure Netlify's limits on a deploy preview, and are removed once
// the measurements are written up in docs/comp-report/cr1-function-limits.md.
//
// Every probe is refused in production and needs a key whose SHA-256 is below;
// the key itself was never committed. Deploy previews are public URLs.
import { createHash, timingSafeEqual } from 'node:crypto';

const KEY_SHA256 = Buffer.from('cc1f06f053c6cb48a9258d750829a9b315ff195c8bd26b14b9eb86cf9ed025ef', 'hex');

export interface ProbeContext {
  deploy?: { context?: string };
}

export function probeAllowed(req: Request, context: ProbeContext): boolean {
  if (context.deploy?.context === 'production') return false;
  const key = new URL(req.url).searchParams.get('k') ?? '';
  const got = createHash('sha256').update(key).digest();
  return timingSafeEqual(got, KEY_SHA256);
}

export const notFound = () => new Response('Not found', { status: 404 });

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function numberParam(req: Request, name: string, fallback: number, min: number, max: number): number {
  const raw = new URL(req.url).searchParams.get(name);
  const n = raw === null ? fallback : Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** An SSE response whose body a producer writes to; every event carries ms since start. */
export function sseResponse(produce: (emit: (event: Record<string, unknown>) => void) => Promise<void>): Response {
  const t0 = Date.now();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...event, t: Date.now() - t0 })}\n\n`));
      try {
        await produce(emit);
      } catch (e) {
        emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}
