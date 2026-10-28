// Hubert's web lookups (server/web-search.ts): only public https pages, and
// Firecrawl's answers read in either shape, cut to fit.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firecrawlSearcher, readableUrl } from './web-search.ts';

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
