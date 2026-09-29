// Production wiring for netlify/functions/dev-notebook.mts. Tests and the local
// dev server (dev/serve.ts) build their own: a local Blobs server and a stub
// sign-in that no deployed function can reach.
import { getStore } from '@netlify/blobs';
import { identityUrlFor, netlifyIdentityVerifier, type IdentityVerifier } from '../../comp-report/server/identity.ts';
import type { NotebookDeps } from './api.ts';
import { notebookStore, STORE_NAME, type BlobStore } from './store.ts';

const verifiers = new Map<string, IdentityVerifier>();
let knownCommit: string | null = null;

const COMMIT = /^[0-9a-f]{7,40}$/;

/**
 * The commit this deploy was built from — the process answering knows its own
 * build; a stale browser tab might not. COMMIT_REF when the function sees it,
 * else this deploy's own /tools/comp-report/build.json (written at build time
 * from COMMIT_REF). Unknown is null: never a plausible wrong value.
 */
export async function buildCommit(req: Request, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (env.COMMIT_REF && COMMIT.test(env.COMMIT_REF)) return env.COMMIT_REF.slice(0, 12);
  if (knownCommit) return knownCommit;
  try {
    const res = await fetchImpl(new URL('/tools/comp-report/build.json', req.url), { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const info = (await res.json()) as { commit?: unknown };
    if (typeof info.commit !== 'string' || !COMMIT.test(info.commit)) return null;
    knownCommit = info.commit.slice(0, 12); // one deploy per function instance: it can't change
    return knownCommit;
  } catch {
    return null;
  }
}

export function productionDeps(req: Request, context?: { deploy?: { id?: string } }): NotebookDeps {
  const identityUrl = identityUrlFor(req);
  let verifier = verifiers.get(identityUrl);
  if (!verifier) {
    verifier = netlifyIdentityVerifier(identityUrl);
    verifiers.set(identityUrl, verifier);
  }
  return {
    // Strong consistency: a note saved is in the list the next moment, not up to a minute later.
    store: notebookStore(getStore({ name: STORE_NAME, consistency: 'strong' }) as unknown as BlobStore),
    verifier,
    env: process.env,
    commit: () => buildCommit(req),
    deployId: context?.deploy?.id ?? null,
    now: () => Date.now(),
  };
}
