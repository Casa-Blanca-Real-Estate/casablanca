// Production wiring: what the deployed functions pass to the handlers. Tests
// and the local dev server pass their own — the stub sign-in in dev/ is never
// imported from here, so it can't reach a deployed function.
import { accessConfig } from './access.ts';
import { databasePool } from './db.ts';
import { identityUrlFor, netlifyIdentityVerifier, type IdentityVerifier } from './identity.ts';
import { firecrawlReader } from './links.ts';
import type { LinkReadDeps } from './api/links.ts';
import type { AuthDeps } from './session.ts';
import type { GateDeps } from './identity-events.ts';

const verifiers = new Map<string, IdentityVerifier>();

function verifierFor(identityUrl: string): IdentityVerifier {
  let v = verifiers.get(identityUrl);
  if (!v) {
    v = netlifyIdentityVerifier(identityUrl);
    verifiers.set(identityUrl, v);
  }
  return v;
}

export function productionAuthDeps(req: Request): AuthDeps {
  return { verifier: verifierFor(identityUrlFor(req)), access: accessConfig(), pool: databasePool() };
}

export function productionGateDeps(): GateDeps {
  return { access: accessConfig(), pool: databasePool() };
}

/** The background link read: the API's dependencies and Firecrawl, with the key the carousel tools already use. */
export function productionLinkReadDeps(req: Request): LinkReadDeps {
  return { ...productionAuthDeps(req), reader: firecrawlReader({ apiKey: process.env.FIRECRAWL_API_KEY }) };
}
