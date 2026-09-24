// TEMPORARY — CR-1 time-limit probe: a buffered (non-streamed) response after
// sleeping ?s= seconds. Removed once measured. See tools-src/comp-report/server/probe.ts.
import { notFound, numberParam, probeAllowed, sleep, type ProbeContext } from '../../tools-src/comp-report/server/probe.ts';

export default async (req: Request, context: ProbeContext) => {
  if (!probeAllowed(req, context)) return notFound();
  const seconds = numberParam(req, 's', 1, 0, 120);
  const t0 = Date.now();
  await sleep(seconds * 1000);
  return Response.json({
    slept: seconds,
    elapsedMs: Date.now() - t0,
    node: process.version,
    region: process.env.AWS_REGION ?? null,
    context: context.deploy?.context ?? null,
  });
};

export const config = { path: '/api/comp-report/probe/sync' };
