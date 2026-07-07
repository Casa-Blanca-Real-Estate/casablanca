// Poll endpoint for the async StreetEasy import. The browser calls this every few seconds
// with the jobId it sent to streeteasy-import-background, until it sees status done/error.
//   GET /.netlify/functions/streeteasy-status?id=<jobId>
//     → { status: 'queued' | 'running' | 'done' | 'error', ... }
// Fast + well under the 26s cap: it only reads one Blobs key.
import { getStore } from '@netlify/blobs';

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    let id;
    if (req.method === 'POST') { const b = await req.json().catch(() => ({})); id = b.id || b.jobId; }
    else { id = new URL(req.url).searchParams.get('id'); }
    if (!id) return json({ status: 'error', error: 'id required' }, 400);

    const store = getStore('se-jobs');
    const rec = await store.get(id, { type: 'json' });
    if (!rec) return json({ status: 'queued' }); // not written yet — worker may still be starting
    return json(rec);
  } catch (e) {
    return json({ status: 'error', error: 'status exception: ' + (e?.message || String(e)) }, 500);
  }
};
