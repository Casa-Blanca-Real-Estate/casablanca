// The wiring (Dispatch 10 phase 1 step 10): the link import calls
// enqueueListingJudgments() once it has stored a listing's observation, after
// its own transaction commits. Judgments then arrive over minutes, from the
// paced queue; nothing waits on them, and in phase 1 nothing shows them.
//
// - CR_JEV_MODE=off (the default, and production's): nothing is queued,
//   nothing is recorded, nothing is sent.
// - watch: the listing's description is scrubbed and becomes the whole state;
//   the questions its tags and extract leave open are queued as one request,
//   and a drainer is started. With no Jev key and no fallback, the request is
//   recorded as dropped (no-key) at once, so coverage still counts it.
// Never throws: an import must never fail because of this.

import type { CompRecord } from '../../engine/types.ts';
import { withActor, type PoolLike } from '../db.ts';
import { decideConfig, fallbackReady, type DecideConfig } from './config.ts';
import { zdrRefusal } from './drain.ts';
import { listingQuestionsFor, REGISTRY_VERSION } from './registry.ts';
import { stateHash, wireCount } from './render.ts';
import { listingState, scrubListingText } from './scrub.ts';
import { PgStore } from './pg-store.ts';
import type { DecideStore, NewRequest } from './store.ts';

/** MindBinder's cap. A full import is tens of listings. */
export const MAX_QUEUE = 5_000;
/** How long a kick token lets a drainer start. */
export const KICK_TTL_MS = 5 * 60_000;
export const DRAIN_PATH = '/.netlify/functions/comp-report-decide-drain-background';

export interface ListingObservation {
  /** comp_report.property_observations.id of the stored listing read. */
  observationId: number;
  /** The record compRecordFromListing made from the page. Only its description and facts are read. */
  record: Pick<CompRecord, 'facts' | 'listing'>;
  /** The agent whose import it was — the usage row is theirs. */
  userEmail?: string | null;
}

export type EnqueueResult =
  | { queued: false; why: 'off' | 'no-text' | 'nothing-open' | 'error' }
  | { queued: true; requestId: number; status: 'queued' | 'dropped'; questions: string[]; kicked: boolean };

export interface EnqueueDeps {
  pool: PoolLike | null;
  config?: DecideConfig;
  store?: DecideStore;
  /** The site's origin, to start the background drainer; none means don't start one. */
  origin?: string | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Names to scrub besides Casa's users'. */
  extraNames?: readonly string[];
}

/** Casa's people, from comp_report.users — their names come out of any listing that mentions them. */
async function casaNames(pool: PoolLike): Promise<string[]> {
  return withActor(pool, { kind: 'system', does: 'decide-enqueue' }, async (tx) => {
    const { rows } = await tx.query<{ name: string }>("select name from comp_report.users where name is not null and btrim(name) <> ''");
    return rows.map((r) => r.name);
  });
}

/** A StreetEasy page as the ledger keeps it — https, no query or fragment — or null. Never fails an enqueue. */
export function canonicalSourceUrl(url: string | null | undefined): string | null {
  return typeof url === 'string' && url.length <= 500 && /^https:\/\/streeteasy\.com\/[^?#\s]+$/.test(url) ? url : null;
}

/** PURE: the request for one listing, or why there isn't one. */
export function listingRequest(obs: ListingObservation, names: readonly string[]): NewRequest | { skip: 'no-text' | 'nothing-open' } {
  const scrubbed = scrubListingText(obs.record.listing?.description ?? null, { names });
  if (!scrubbed.text) return { skip: 'no-text' };
  const questionIds = listingQuestionsFor(obs.record.facts ?? {}).map((q) => q.id);
  if (questionIds.length === 0) return { skip: 'nothing-open' };
  const state = listingState(scrubbed.text);
  return {
    lane: 'listing',
    target: { kind: 'property_observation', observationId: obs.observationId },
    questionIds,
    wireQuestions: wireCount(questionIds),
    registryVersion: REGISTRY_VERSION,
    state,
    stateHash: stateHash(state),
    userEmail: obs.userEmail ?? null,
    sourceUrl: canonicalSourceUrl(obs.record.listing?.url),
  };
}

/** Starts a background drainer with a fresh one-use token. Never throws. */
export async function kickDrainer(store: DecideStore, origin: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<boolean> {
  try {
    const token = await store.issueKick(now, KICK_TTL_MS);
    const res = await fetchImpl(new URL(DRAIN_PATH, origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    // A background function answers 202 at once; the drain happens after.
    return res.status === 202 || res.ok;
  } catch (error) {
    console.error('comp-report decide: could not start the drainer:', String(error).slice(0, 200));
    return false;
  }
}

export async function enqueueListingJudgments(obs: ListingObservation, deps: EnqueueDeps): Promise<EnqueueResult> {
  const config = deps.config ?? decideConfig();
  if (config.mode !== 'watch' || !deps.pool) return { queued: false, why: 'off' };
  try {
    const store = deps.store ?? new PgStore(deps.pool);
    const now = (deps.now ?? Date.now)();
    const names = [...(await casaNames(deps.pool)), ...(deps.extraNames ?? [])];
    const req = listingRequest(obs, names);
    if ('skip' in req) return { queued: false, why: req.skip };
    // Refused before it's queued, as the drainer would refuse it before it's sent.
    const refusal = zdrRefusal(req.lane, config) ? 'zdr-required' as const
      : config.jevKey === null && !fallbackReady(config) ? 'no-key' as const : null;
    if (refusal) {
      const { id } = await store.enqueueDropped(req, now, refusal);
      return { queued: true, requestId: id, status: 'dropped', questions: req.questionIds, kicked: false };
    }
    const { id, status } = await store.enqueue(req, now, MAX_QUEUE);
    const kicked = status === 'queued' && deps.origin
      ? await kickDrainer(store, deps.origin, deps.fetchImpl ?? fetch, now)
      : false;
    return { queued: true, requestId: id, status: status === 'queued' ? 'queued' : 'dropped', questions: req.questionIds, kicked };
  } catch (error) {
    console.error('comp-report decide: could not queue listing judgments:', String(error).slice(0, 200));
    return { queued: false, why: 'error' };
  }
}
