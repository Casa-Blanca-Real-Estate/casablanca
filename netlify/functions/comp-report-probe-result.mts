// TEMPORARY — CR-1 time-limit probe: reads back an observer timeline written
// by comp-report-probe-observe-background. Removed once measured.
import { getDeployStore } from '@netlify/blobs';
import { notFound, probeAllowed, type ProbeContext } from '../../tools-src/comp-report/server/probe.ts';

export default async (req: Request, context: ProbeContext) => {
  if (!probeAllowed(req, context)) return notFound();
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const result = await getDeployStore('comp-report-probes').get(id, { type: 'json' });
  return result ? Response.json(result) : Response.json({ id, status: 'pending' }, { status: 404 });
};

export const config = { path: '/api/comp-report/probe/result' };
