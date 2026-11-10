// Hubert's web lookups (server/web-search.ts): only public https pages, and
// Firecrawl's answers read in either shape, cut to fit.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanThumb, firecrawlSearcher, isListingPage, readableUrl } from './web-search.ts';

test('only a public https page can be read', () => {
  assert.equal(readableUrl('https://www.nyc.gov/site/x.page'), 'https://www.nyc.gov/site/x.page');
  for (const bad of ['http://example.com', 'https://localhost/x', 'https://10.0.0.1/', 'https://user:pw@example.com/', 'https://example.com:8443/', 'https://[::1]/', 'https://db.internal/', 'javascript:alert(1)', 'not a url']) {
    assert.equal(readableUrl(bad), null, bad);
  }
});

const answering = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test('search results in v2’s shape and v1’s, unsafe links dropped, snippets cut', async () => {
  const long = 'x'.repeat(1_000);
  const v2 = await firecrawlSearcher({ apiKey: 'k', fetch: answering({ success: true, data: { web: [
    { url: 'https://example.com/a', title: 'A', description: long },
    { url: 'http://example.com/b', title: 'B', description: 'plain http' },
  ] } }) }).search('q');
  assert.ok(v2.ok);
  assert.deepEqual(v2.results.map((r) => r.url), ['https://example.com/a']);
  assert.ok(v2.results[0]!.text.length <= 401);
  const v1 = await firecrawlSearcher({ apiKey: 'k', fetch: answering({ success: true, data: [{ url: 'https://example.com/c', title: 'C' }] }) }).search('q');
  assert.ok(v1.ok && v1.results[0]!.url === 'https://example.com/c');
});

test('no key, a refusal or a dead page: a plain error for Hubert to pass on', async () => {
  assert.equal((await firecrawlSearcher({ apiKey: undefined }).search('q')).ok, false);
  assert.equal((await firecrawlSearcher({ apiKey: 'k', fetch: answering({ success: false, error: 'nope' }, 402) }).search('q')).ok, false);
  const dead = await firecrawlSearcher({ apiKey: 'k', fetch: answering({ success: true, data: { markdown: '', metadata: { statusCode: 404 } } }) }).read('https://example.com/x');
  assert.equal(dead.ok, false);
});

test('the comp tool leans toward StreetEasy, the city and the MTA, keeping five', async () => {
  const { leanToPreferred } = await import('./web-search.ts');
  const r = (url: string) => ({ url, title: url, text: '' });
  const got = leanToPreferred([
    r('https://a.com/1'), r('https://b.com/2'), r('https://www.nyc.gov/x'), r('https://c.com/3'),
    r('https://streeteasy.com/building/100-barclay'), r('https://d.com/4'), r('https://new.mta.info/y'), r('https://notnyc.gov.evil.com/z'),
  ]);
  assert.deepEqual(got.map((x) => new URL(x.url).hostname), ['www.nyc.gov', 'streeteasy.com', 'new.mta.info', 'a.com', 'b.com']);
});

test('listing cards (2026-11-06): StreetEasy listing and building pages only', () => {
  assert.ok(isListingPage('https://streeteasy.com/building/60-collister-street-new_york/4a'));
  assert.ok(isListingPage('https://www.streeteasy.com/sale/1234567'));
  assert.ok(!isListingPage('https://streeteasy.com/for-sale/tribeca'));
  assert.ok(!isListingPage('https://example.com/building/x'));
  assert.ok(!isListingPage('not a url'));
});

test('a card photo: the page’s og:image, only a public https link; stealth when a plain visit is refused', async () => {
  assert.equal(cleanThumb('https://photos.zillowstatic.com/fp/a.webp'), 'https://photos.zillowstatic.com/fp/a.webp');
  assert.equal(cleanThumb(['https://x.example/a.jpg']), 'https://x.example/a.jpg');
  assert.equal(cleanThumb('http://x.example/a.jpg'), null);
  assert.equal(cleanThumb('javascript:alert(1)'), null);
  const bodies: Array<Record<string, unknown>> = [];
  const replies = [
    { success: true, data: { metadata: { statusCode: 403 } } },
    { success: true, data: { metadata: { statusCode: 200, ogImage: 'https://photos.zillowstatic.com/fp/b.webp' } } },
  ];
  const web = firecrawlSearcher({
    apiKey: 'k',
    fetch: (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    }) as typeof fetch,
  });
  assert.equal(await web.thumb!('https://streeteasy.com/building/x/1a'), 'https://photos.zillowstatic.com/fp/b.webp');
  assert.equal(bodies[0]!.proxy, undefined);
  assert.equal(bodies[1]!.proxy, 'stealth');
  assert.equal(await firecrawlSearcher({ apiKey: undefined }).thumb!('https://streeteasy.com/building/x/1a'), null);
});
