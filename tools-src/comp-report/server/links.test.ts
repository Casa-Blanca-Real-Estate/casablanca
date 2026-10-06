// Which links the tool reads, and how it reads them: StreetEasy only, sale
// listings only, canonical; a per-person limit; and the Firecrawl reader's
// handling of bot walls, missing pages, a busy service and a missing key.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LISTING_EXTRACT_SCHEMA } from '../engine/index.ts';
import { checkListingLink, firecrawlReader, newYorkToday, readLimit, titleFromLink } from './links.ts';

test('only StreetEasy sale listings are read, canonical and without tracking', () => {
  const ok = (raw: string) => {
    const c = checkListingLink(raw);
    return c.ok ? c.url : `refused: ${c.reason}`;
  };
  assert.equal(ok('https://streeteasy.com/building/200-chambers-street-new_york/10a?sst=abc#photos'), 'https://streeteasy.com/building/200-chambers-street-new_york/10a');
  assert.equal(ok('  www.streeteasy.com/building/200-chambers-street-new_york/10a  '), 'https://streeteasy.com/building/200-chambers-street-new_york/10a');
  assert.equal(ok('http://streeteasy.com/sale/1234567'), 'https://streeteasy.com/sale/1234567');
  assert.equal(ok('https://streeteasy.com/closing/11324235'), 'https://streeteasy.com/closing/11324235');
  assert.match(ok('https://streeteasy.com/rental/4455667'), /rental/);
  assert.match(ok('https://streeteasy.com/building/200-chambers-street-new_york'), /building’s page/);
  assert.match(ok('https://streeteasy.com/for-sale/tribeca'), /isn’t a listing/);
  assert.match(ok('https://streeteasy.com.evil.example/building/x/1'), /Only StreetEasy/);
  assert.match(ok('https://evil.example/?u=https://streeteasy.com/sale/1'), /Only StreetEasy/);
  assert.match(ok('javascript:alert(1)'), /Only StreetEasy/);
  assert.match(ok(''), /Paste/);
  assert.match(ok(`https://streeteasy.com/sale/${'1'.repeat(600)}`), /too long/);
});

test('a title from a link, before the page is read', () => {
  assert.equal(titleFromLink('https://streeteasy.com/building/100-barclay-street-new_york/17l'), '100 Barclay Street #17L');
  assert.equal(titleFromLink('https://streeteasy.com/building/the-greenwich-club-brooklyn/ph2'), 'The Greenwich Club #PH2');
  assert.equal(titleFromLink('https://streeteasy.com/sale/1234567'), null);
});

test('each person reads up to 60 links a day (admins 200), unless the site sets another limit', () => {
  assert.equal(readLimit('agent', {}), 60);
  assert.equal(readLimit('admin', {}), 200);
  assert.equal(readLimit('agent', { CR_LINK_READS_PER_DAY: '25' }), 25);
  assert.equal(readLimit('admin', { CR_LINK_READS_PER_DAY: '300' }), 300);
  assert.equal(readLimit('agent', { CR_LINK_READS_PER_DAY: 'lots' }), 60);
});

test('the as-of date is New York’s day', () => {
  assert.equal(newYorkToday(new Date('2026-10-01T03:30:00Z')), '2026-09-30');
  assert.equal(newYorkToday(new Date('2026-10-01T05:30:00Z')), '2026-10-01');
});

type Answer = { status: number; body: unknown } | 'throw';

function fakeFetch(answers: Answer[]) {
  const sent: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get('authorization') });
    const next = answers.shift();
    if (!next) throw new Error('no answer queued');
    if (next === 'throw') throw Object.assign(new Error('network down'), { name: 'TypeError' });
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fn, sent };
}

const page = (extract: unknown, markdown = '# 200 Chambers Street #10A', statusCode = 200) =>
  ({ status: 200, body: { success: true, data: { extract, markdown, metadata: { title: 'StreetEasy', statusCode } } } });

test('the reader asks Firecrawl for the listing schema, stealth first, and returns what the page gave', async () => {
  const { fn, sent } = fakeFetch([page({ address: '200 Chambers Street', status: 'Sold' })]);
  const reader = firecrawlReader({ apiKey: 'fc-key', baseUrl: 'https://fc.test/', fetch: fn, backoffMs: [1] });
  const read = await reader.read('https://streeteasy.com/building/200-chambers-street-new_york/10a');
  assert.deepEqual(read, { ok: true, extract: { address: '200 Chambers Street', status: 'Sold' } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, 'https://fc.test/v1/scrape');
  assert.equal(sent[0]!.auth, 'Bearer fc-key');
  assert.deepEqual((sent[0]!.body.extract as { schema: unknown }).schema, LISTING_EXTRACT_SCHEMA);
  assert.equal(sent[0]!.body.proxy, 'stealth');
  assert.deepEqual(sent[0]!.body.formats, ['extract', 'markdown'], 'no screenshots, no photos');
});

test('a quick refusal of the stealth proxy gets a plain request', async () => {
  const { fn, sent } = fakeFetch([{ status: 402, body: { success: false, error: 'stealth not on this plan' } }, page({ address: '1 A St', status: 'Sold' })]);
  const read = await firecrawlReader({ apiKey: 'k', fetch: fn, backoffMs: [1] }).read('https://streeteasy.com/sale/1');
  assert.equal(read.ok, true);
  assert.deepEqual(sent.map((s) => s.body.proxy ?? 'plain'), ['stealth', 'plain']);
});

test('StreetEasy’s bot wall, a missing page and an empty read each say so', async () => {
  const wall = await firecrawlReader({ apiKey: 'k', fetch: fakeFetch([page({}, 'Pardon Our Interruption… verify you are human')]).fn }).read('https://streeteasy.com/sale/1');
  assert.deepEqual(wall.ok ? null : wall.code, 'blocked');
  const gone = await firecrawlReader({ apiKey: 'k', fetch: fakeFetch([page({ address: '' }, 'Not found', 404)]).fn }).read('https://streeteasy.com/sale/1');
  assert.deepEqual(gone.ok ? null : gone.code, 'not_found');
  const empty = await firecrawlReader({ apiKey: 'k', fetch: fakeFetch([page({ address: '', history: [] })]).fn }).read('https://streeteasy.com/sale/1');
  assert.deepEqual(empty.ok ? null : empty.code, 'unreadable');
});

test('a busy Firecrawl is waited for and tried again; one that stays down is a failure, not a hang', async () => {
  const busy = fakeFetch([{ status: 429, body: { success: false } }, { status: 503, body: { success: false } }, page({ address: '1 A St' })]);
  const read = await firecrawlReader({ apiKey: 'k', fetch: busy.fn, backoffMs: [1, 1] }).read('https://streeteasy.com/sale/1');
  assert.equal(read.ok, true);
  assert.equal(busy.sent.length, 3);
  const down = fakeFetch(['throw', 'throw', 'throw']);
  const failed = await firecrawlReader({ apiKey: 'k', fetch: down.fn, backoffMs: [1, 1] }).read('https://streeteasy.com/sale/1');
  assert.deepEqual(failed.ok ? null : failed.code, 'provider_error');
  assert.equal(down.sent.length, 3);
});

test('without a key nothing is sent', async () => {
  const { fn, sent } = fakeFetch([]);
  const read = await firecrawlReader({ apiKey: undefined, fetch: fn }).read('https://streeteasy.com/sale/1');
  assert.deepEqual(read.ok ? null : read.code, 'not_configured');
  assert.equal(sent.length, 0);
});
