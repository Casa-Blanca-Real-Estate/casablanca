// TEMPORARY — CR-1 time-limit probe: an observer inside Netlify. A background
// function (15-minute limit, returns 202 at once) fetches one of the other
// probes server-to-server — no client-side proxy in the path — timestamps
// every event, and writes the timeline to a deploy-scoped Blobs store, read
// back through comp-report-probe-result. Removed once measured.
import { getDeployStore } from '@netlify/blobs';
import { probeAllowed, type ProbeContext } from '../../tools-src/comp-report/server/probe.ts';

export default async (req: Request, context: ProbeContext) => {
  if (!probeAllowed(req, context)) return;
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? 'unnamed';
  const target = url.searchParams.get('target') ?? '';
  if (!target.startsWith('/api/comp-report/probe/')) return;
  const sep = target.includes('?') ? '&' : '?';
  const targetUrl = `${url.origin}${target}${sep}k=${encodeURIComponent(url.searchParams.get('k') ?? '')}`;

  const store = getDeployStore('comp-report-probes');
  const t0 = Date.now();
  const timeline: Array<Record<string, unknown>> = [];
  const save = (outcome: string, extra: Record<string, unknown> = {}) =>
    store.setJSON(id, { id, target, outcome, elapsedMs: Date.now() - t0, events: timeline.length, timeline, ...extra });

  try {
    const res = await fetch(targetUrl);
    timeline.push({ at: Date.now() - t0, status: res.status });
    if (!res.body) return await save('no-body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = chunk.startsWith('data: ') ? chunk.slice(6) : chunk;
        let parsed: unknown = data;
        try { parsed = JSON.parse(data); } catch { /* keep raw */ }
        timeline.push({ at: Date.now() - t0, event: parsed });
      }
    }
    await save('ended', { tail: buf.slice(0, 500) });
  } catch (e) {
    await save('error', { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
  }
};
