// TEMPORARY diagnostic (live listing read failure, 2026-10-22) — removed before merge.
import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';

const same = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export default async (req: Request) => {
  const key = process.env.CR_DECIDE_KEY ?? '';
  if (key.length < 32 || !same(req.headers.get('x-decide-key') ?? '', key)) return new Response('no', { status: 401 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const got = await getStore('comp-report-probe').get(id, { type: 'json' });
  return Response.json(got ?? { state: 'none' });
};
