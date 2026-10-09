// DEV/TEST ONLY — a stand-in for NYC Planning's GeoSearch, so distance can be
// exercised offline and without leaning on a free public service. It answers
// with real answers recorded from geosearch.planninglabs.nyc on 2026-10-06 for
// the sample's and the link fixtures' streets (geosearch-fixtures.json, the
// first three results each); a street it doesn't know gets no results.
//
//   node tools-src/comp-report/dev/fake-geosearch.ts 8793
//   CR_DEV_GEOSEARCH_BASE_URL=http://127.0.0.1:8793 npm run dev:comp-report
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const RECORDED = JSON.parse(readFileSync(new URL('./geosearch-fixtures.json', import.meta.url), 'utf8')) as Record<string, unknown[]>;
const BY_TEXT = new Map(Object.entries(RECORDED).map(([street, features]) => [street.toLowerCase(), features]));

export async function startFakeGeoSearch(port = 0, opts: { delayMs?: number } = {}): Promise<{ url: string; texts: string[]; close: () => Promise<void> }> {
  const texts: string[] = [];
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET' || url.pathname !== '/v2/search') return reply(404, { error: 'not found' });
    const text = url.searchParams.get('text') ?? '';
    texts.push(text);
    setTimeout(() => reply(200, { type: 'FeatureCollection', features: BY_TEXT.get(text.toLowerCase()) ?? [] }), opts.delayMs ?? 300);
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    texts,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startFakeGeoSearch(Number(process.argv[2] ?? 8793));
  console.log(`fake GeoSearch: ${s.url} — streets: ${BY_TEXT.size}`);
}
