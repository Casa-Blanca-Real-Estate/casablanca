// DEV/TEST ONLY — a stand-in for Firecrawl's scrape, so reading StreetEasy
// links can be exercised with no key and no credit. It answers the extract
// the real API would, from Abacus's hand-written listing fixtures
// (engine/test/fixtures/listings), after a short wait so rows visibly fill in.
//
//   node tools-src/comp-report/dev/fake-firecrawl.ts 8792
//   CR_DEV_FIRECRAWL_BASE_URL=http://127.0.0.1:8792 npm run dev:comp-report
//
// The pages it knows are listed below. A page it doesn't know is a 404; the
// "blocked" one is StreetEasy's bot wall.
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const fixture = (name: string): Record<string, unknown> => {
  const data = JSON.parse(readFileSync(new URL(`../engine/test/fixtures/listings/${name}`, import.meta.url), 'utf8')) as Record<string, unknown>;
  delete data._fixture;
  return data;
};

/** Made up for local development, in the shape Firecrawl returns. Not a captured page, and not 17L's real facts. */
const SUBJECT_17L: Record<string, unknown> = {
  address: '100 Barclay Street', unit: '#17L', city: 'New York', state: 'NY', zip: '10007', neighborhood: 'Tribeca',
  status: 'No longer available', last_ask: '$3,995,000', original_ask: '$4,150,000', list_date: 'Mar 3, 2025',
  floor: '17', interior_size: '~2,000 ft²', beds: '3 beds', baths: '3 baths', rooms: '6 rooms',
  common_charges: '$2,650/mo', taxes: '$2,480/mo', property_type: 'Condo', building_name: 'One Hundred Barclay',
  year_built: '1927', new_development: '',
  features: ['Central air', 'City view', 'Water view', 'Dishwasher', 'Washer/dryer'],
  amenities: ['Full-time doorman', 'Concierge', 'Gym', 'Elevator'],
  policies: ['Pets allowed'],
  history: [
    { date: '03/03/2025', event: 'Listed', price: '$4,150,000' },
    { date: '05/12/2025', event: 'Price decreased', price: '$3,995,000' },
    { date: '08/30/2025', event: 'Delisted', price: '' },
  ],
  description: 'A three-bedroom on the seventeenth floor with city and river views.',
};

const WALL = 'Pardon Our Interruption. As you were browsing something about your browser made us think you were a bot.';

export const PAGES: Record<string, Record<string, unknown> | 'wall'> = {
  'https://streeteasy.com/building/100-barclay-street-new_york/17l': SUBJECT_17L,
  // Photos added here for local walks (Dispatch 20): on StreetEasy's image host, as a real read gives them.
  'https://streeteasy.com/building/200-chambers-street-new_york/10a': {
    ...fixture('sold-200-chambers-10a.json'),
    heroImageUrl: 'https://photos.zillowstatic.com/fp/dev-200-chambers-10a-1-se_large_800_400.webp',
    photos: [2, 3].map((n) => `https://photos.zillowstatic.com/fp/dev-200-chambers-10a-${n}-se_large_800_400.webp`),
  },
  'https://streeteasy.com/building/5-franklin-place-new_york/14a': fixture('sold-5-franklin-14a-approx-size.json'),
  'https://streeteasy.com/building/111-fulton-street-new_york/315': fixture('in-contract-111-fulton-315.json'),
  'https://streeteasy.com/building/20-pine-street-new_york/617': fixture('active-20-pine-617.json'),
  'https://streeteasy.com/building/111-fulton-street-new_york/309': fixture('off-market-111-fulton-309.json'),
  'https://streeteasy.com/building/99-john-street-new_york/612': fixture('junk-values.json'),
  'https://streeteasy.com/building/301-east-79-street-new_york/12c': fixture('active-coop-photos-301-east-79-12c.json'),
  'https://streeteasy.com/building/40-bond-street-new_york/5': fixture('sold-no-grey-line-40-bond-5.json'),
  'https://streeteasy.com/building/blocked-street-new_york/1a': 'wall',
};

export async function startFakeFirecrawl(port = 0, opts: { delayMs?: number } = {}): Promise<{ url: string; calls: string[]; close: () => Promise<void> }> {
  const calls: string[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.method !== 'POST' || req.url !== '/v1/scrape') return reply(404, { success: false, error: 'not found' });
      if (!/^Bearer \S+/.test(req.headers.authorization ?? '')) return reply(401, { success: false, error: 'Unauthorized' });
      let url = '';
      try {
        url = String((JSON.parse(Buffer.concat(chunks).toString('utf8')) as { url?: unknown }).url ?? '');
      } catch {
        return reply(400, { success: false, error: 'bad json' });
      }
      calls.push(url);
      const page = PAGES[url];
      setTimeout(() => {
        if (page === 'wall') return reply(200, { success: true, data: { extract: {}, markdown: WALL, metadata: { title: 'Pardon Our Interruption', statusCode: 200 } } });
        if (!page) return reply(200, { success: true, data: { extract: {}, markdown: 'Page not found', metadata: { title: 'StreetEasy', statusCode: 404 } } });
        return reply(200, { success: true, data: { extract: page, markdown: `# ${String(page.address)} ${String(page.unit)}`, metadata: { title: 'StreetEasy', statusCode: 200 } } });
      }, opts.delayMs ?? 1500 + Math.floor(Math.random() * 1500));
    });
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    calls,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startFakeFirecrawl(Number(process.argv[2] ?? 8792));
  console.log(`fake Firecrawl: ${s.url} — pages: ${Object.keys(PAGES).length}`);
}
