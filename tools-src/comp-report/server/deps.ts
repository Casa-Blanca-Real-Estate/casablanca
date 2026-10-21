// Production wiring: what the deployed functions pass to the handlers. Tests
// and the local dev server pass their own — the stub sign-in in dev/ is never
// imported from here, so it can't reach a deployed function.
import { getStore } from '@netlify/blobs';
import { accessConfig } from './access.ts';
import { databasePool } from './db.ts';
import { deployContext, guestConfig } from './guest.ts';
import { identityUrlFor, netlifyIdentityVerifier, type IdentityVerifier } from './identity.ts';
import { firecrawlReader } from './links.ts';
import { nycGeoSearch } from './geocode.ts';
import type { GeocodeDeps } from './api/geocode.ts';
import type { LinkReadDeps } from './api/links.ts';
import type { SamplePhotoCaptureDeps, SamplePhotoDeps } from './api/sample-photos.ts';
import type { SamplePhotoStore } from './sample/photos.ts';
import type { WriteDeps } from './api/narratives.ts';
import { productionAnthropic } from './api/turn.ts';
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
  return {
    verifier: verifierFor(identityUrlFor(req)),
    access: accessConfig(),
    pool: databasePool(),
    guest: guestConfig(process.env, deployContext(req)),
  };
}

/** The sample's photos (server/sample/photos.ts): one site-wide Blobs store, shared by every deploy. */
function samplePhotoStore(): SamplePhotoStore {
  const store = getStore('comp-report-sample');
  return {
    get: (key) => store.get(key, { type: 'text' }),
    set: async (key, value) => {
      await store.set(key, value);
    },
  };
}

/** The handlers that fill a report with the sample (imports, comps): the API's dependencies and the sample's photos. */
export function productionSampleDeps(req: Request): SamplePhotoDeps {
  return { ...productionAuthDeps(req), samplePhotos: samplePhotoStore() };
}

/** Reading the sample's photos once: Firecrawl, with the key the link reads use. */
export function productionSamplePhotoCaptureDeps(req: Request): SamplePhotoCaptureDeps {
  return { ...productionSampleDeps(req), reader: firecrawlReader({ apiKey: process.env.FIRECRAWL_API_KEY }) };
}

export function productionGateDeps(): GateDeps {
  return { access: accessConfig(), pool: databasePool() };
}

/** The background link read: the API's dependencies and Firecrawl, with the key the carousel tools already use. */
export function productionLinkReadDeps(req: Request): LinkReadDeps {
  return { ...productionAuthDeps(req), reader: firecrawlReader({ apiKey: process.env.FIRECRAWL_API_KEY }) };
}

/** Locations for distance: NYC Planning's GeoSearch, which needs no key. */
export function productionGeocodeDeps(req: Request): GeocodeDeps {
  return { ...productionAuthDeps(req), geocoder: nycGeoSearch() };
}

/** The background write (CR-5): the API's dependencies and the Anthropic client, with the assistant's key. */
export function productionWriteDeps(req: Request): WriteDeps {
  return { ...productionAuthDeps(req), anthropic: productionAnthropic };
}
