// The labelled batch (Dispatch 10 phase 2 step 3): the pre-registered listings
// (docs/comp-report/jev-labels.csv), each asked every registry question by Jev
// and by Haiku 4.5 as a second judge, once, so the write-up can measure both
// against the labels.
//
// - The text is the scrubbed text an import already queued for that page
//   (decide_requests.source_url): exactly what Jev sees in production. So each
//   listing is read in first, through the ordinary link import with watch mode
//   on. A page that was never read that way is reported missing, not read here.
// - Every question, not only those the tags leave open: calibration wants an
//   answer to each, and the tags' answers are a check on the labels.
// - One batch name per run ("labels-v1"). Running a name again needs `rerun`,
//   so a second run is never an accident; the results read the latest per page.
// Never throws.

import { checkListingLink } from '../../workspace/links.ts';
import type { DecideConfig } from './config.ts';
import { kickDrainer, MAX_QUEUE } from './enqueue.ts';
import { QUESTIONS, REGISTRY_VERSION } from './registry.ts';
import { wireCount } from './render.ts';
import type { DecideStore, NewRequest } from './store.ts';

export const MAX_LABELLED = 60;
export const BATCH_NAME = /^[a-z0-9][a-z0-9._-]{0,47}$/;

export type LabelledResult =
  | { queued: false; why: 'off' | 'no-key' | 'bad-batch' | 'batch-exists' | 'no-urls' | 'too-many' | 'error'; batch: string }
  | {
    queued: true; batch: string; kicked: boolean;
    requests: Array<{ url: string; requestId: number }>;
    /** Never read with watch mode on, or read with no description: read it in through a comp's links first. */
    missing: string[];
    /** Not a StreetEasy listing link. */
    invalid: string[];
  };

export async function enqueueLabelledBatch(deps: {
  store: DecideStore;
  config: DecideConfig;
  urls: readonly unknown[];
  batch: string;
  rerun?: boolean;
  nowMs: number;
  origin: string | null;
  fetchImpl?: typeof fetch;
}): Promise<LabelledResult> {
  const { store, config, batch } = deps;
  if (!BATCH_NAME.test(batch) || batch.startsWith('drift-')) return { queued: false, why: 'bad-batch', batch };
  if (config.mode !== 'watch') return { queued: false, why: 'off', batch };
  if (!config.jevKey) return { queued: false, why: 'no-key', batch };
  if (deps.urls.length === 0) return { queued: false, why: 'no-urls', batch };
  if (deps.urls.length > MAX_LABELLED) return { queued: false, why: 'too-many', batch };
  try {
    if (!deps.rerun && (await store.batchExists(batch))) return { queued: false, why: 'batch-exists', batch };
    const questionIds = QUESTIONS.map((q) => q.id);
    const requests: Array<{ url: string; requestId: number }> = [];
    const missing: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();
    for (const raw of deps.urls) {
      const check = checkListingLink(typeof raw === 'string' ? raw : '');
      if (!check.ok) { invalid.push(String(raw).slice(0, 200)); continue; }
      if (seen.has(check.url)) continue;
      seen.add(check.url);
      const stored = await store.latestListingState(check.url);
      if (!stored) { missing.push(check.url); continue; }
      const req: NewRequest = {
        lane: 'listing',
        target: { kind: 'property_observation', observationId: stored.observationId },
        questionIds,
        wireQuestions: wireCount(questionIds),
        registryVersion: REGISTRY_VERSION,
        state: stored.state,
        stateHash: stored.stateHash,
        userEmail: 'system:decide-labelled',
        secondJudge: true,
        batch,
        sourceUrl: check.url,
      };
      const { id } = await store.enqueue(req, deps.nowMs, MAX_QUEUE);
      requests.push({ url: check.url, requestId: id });
    }
    const kicked = requests.length > 0 && deps.origin ? await kickDrainer(store, deps.origin, deps.fetchImpl ?? fetch, deps.nowMs) : false;
    return { queued: true, batch, kicked, requests, missing, invalid };
  } catch (error) {
    console.error('comp-report decide: could not queue the labelled batch:', String(error).slice(0, 200));
    return { queued: false, why: 'error', batch };
  }
}
