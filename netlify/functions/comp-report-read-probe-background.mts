// TEMPORARY diagnostic (live listing read failure, 2026-10-22) — removed before merge.
// Runs the production link reader on one StreetEasy link and keeps what happened, with
// timings, in Blobs. Opens only to the X-Decide-Key header.
import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { cleanListingExtract, compRecordFromListing } from '../../tools-src/comp-report/engine/index.ts';
import { checkListingLink, firecrawlReader } from '../../tools-src/comp-report/server/links.ts';

const same = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export default async (req: Request) => {
  const key = process.env.CR_DECIDE_KEY ?? '';
  const given = req.headers.get('x-decide-key') ?? '';
  if (key.length < 32 || !same(given, key)) return new Response('no', { status: 401 });
  const { id, url, plain } = (await req.json().catch(() => ({}))) as { id?: string; url?: string; plain?: boolean };
  const check = checkListingLink(url ?? '');
  if (!id || !/^[a-z0-9-]{4,40}$/.test(id) || !check.ok) return new Response('bad', { status: 400 });
  const store = getStore('comp-report-probe');
  const log: unknown[] = [];
  const t0 = Date.now();
  const tracing: typeof fetch = async (input, init) => {
    const t = Date.now();
    const body = JSON.parse(String(init?.body ?? '{}'));
    const res = await fetch(input, init);
    const text = await res.clone().text();
    log.push({ at: t - t0, ms: Date.now() - t, stealth: body.proxy === 'stealth', status: res.status, body: text.slice(0, 1500) });
    return res;
  };
  await store.setJSON(id, { state: 'running', keySet: Boolean(process.env.FIRECRAWL_API_KEY) });
  try {
    const read = await firecrawlReader({ apiKey: process.env.FIRECRAWL_API_KEY, fetch: tracing }).read(check.url);
    let record: unknown = null;
    if (read.ok) {
      try {
        const r = compRecordFromListing(cleanListingExtract(read.extract), { as_of: '2026-10-22', url: check.url });
        record = { key: r.record.identity.key, status: r.record.status.listing_status, warnings: r.warnings.map((w) => w.code) };
      } catch (e) {
        record = { parseError: String(e) };
      }
    }
    await store.setJSON(id, { state: 'done', ms: Date.now() - t0, read: read.ok ? { ok: true, fields: Object.keys(read.extract).filter((k) => read.extract[k]) } : read, record, log, plain });
  } catch (e) {
    await store.setJSON(id, { state: 'threw', ms: Date.now() - t0, error: String(e), log });
  }
  return new Response('', { status: 202 });
};
