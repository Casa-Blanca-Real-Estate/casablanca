// TEMPORARY — CR-1 time-limit probe: a streamed response that ticks once a
// second for ?s= seconds. ?pre= sleeps before returning the Response (headers
// late); ?ttfb= sleeps inside the stream before the first byte (headers on
// time, body late); ?gap= goes silent for that long after the first tick, to
// find an idle-connection cutoff. Removed once measured.
import { notFound, numberParam, probeAllowed, sleep, sseResponse, type ProbeContext } from '../../tools-src/comp-report/server/probe.ts';

export default async (req: Request, context: ProbeContext) => {
  if (!probeAllowed(req, context)) return notFound();
  const seconds = numberParam(req, 's', 10, 1, 900);
  const pre = numberParam(req, 'pre', 0, 0, 120);
  const ttfb = numberParam(req, 'ttfb', 0, 0, 120);
  const gap = numberParam(req, 'gap', 0, 0, 600);
  if (pre) await sleep(pre * 1000);
  return sseResponse(async (emit) => {
    if (ttfb) await sleep(ttfb * 1000);
    emit({ type: 'open', node: process.version, region: process.env.AWS_REGION ?? null });
    if (gap) {
      await sleep(gap * 1000);
      emit({ type: 'after-gap', gap });
    }
    for (let i = 1; i <= seconds; i++) {
      await sleep(1000);
      emit({ type: 'tick', i });
    }
    emit({ type: 'done' });
  });
};

export const config = { path: '/api/comp-report/probe/stream' };
