// Guest mode: a way past sign-in for Kimani on deploy previews, where
// Identity can't sign in his Google account (cr1-setup.md §7). It is off
// unless all three hold, and fails closed on each:
//
//   1. CR_GUEST_KEY is set, and long enough to be a secret (Kimani sets it in
//      Netlify scoped to Deploy Previews only, so production never has it);
//   2. the request is to a deploy preview or a branch deploy — never
//      production, and never a deploy whose context can't be told;
//   3. the request carries that key (`Authorization: Bearer guest.<key>`).
//
// A guest is one fixed account, GUEST_EMAIL, an agent: row-level security
// keeps it to its own reports, so it never sees a real agent's (a preview's
// database is a copy of production's). It is never an admin. What it gets
// beyond an agent is the sample data, so a walkthrough can fill every step.
import { createHash, timingSafeEqual } from 'node:crypto';

/** The guest's one account. `.invalid` can never be a real address (RFC 2606). */
export const GUEST_EMAIL = 'guest@comp-report.invalid';
export const GUEST_NAME = 'Guest';
/** How a guest's token starts; the rest is the key. */
export const GUEST_PREFIX = 'guest.';
/** A key shorter than this is treated as unset: it has to be a secret, not a word. */
export const MIN_GUEST_KEY = 24;

export type DeployContext = 'production' | 'deploy-preview' | 'branch-deploy' | 'dev' | null;

export interface GuestConfig {
  key: string;
}

/** Netlify's own preview and branch hostnames: deploy-preview-12--site.netlify.app, staging--site.netlify.app. */
const PREVIEW_HOST = /^deploy-preview-\d+--[a-z0-9-]+\.netlify\.app$/;
const BRANCH_HOST = /^[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/;

/**
 * Which deploy is answering. Netlify's runtime says so when it can; otherwise
 * the hostname does — Netlify routes a request by its host, so a preview's
 * hostname reaches only that preview. Anything else, a custom domain
 * included, is production as far as guest mode is concerned.
 */
export function deployContext(req: Request, runtime: unknown = (globalThis as { Netlify?: unknown }).Netlify): DeployContext {
  const said = (runtime as { context?: { deploy?: { context?: unknown } } | null } | undefined)?.context?.deploy?.context;
  if (said === 'production' || said === 'deploy-preview' || said === 'branch-deploy' || said === 'dev') return said;
  let host: string;
  try {
    host = new URL(req.url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (PREVIEW_HOST.test(host)) return 'deploy-preview';
  // A deploy's permalink (<24 hex>--site) may be a production deploy's: not a branch.
  if (BRANCH_HOST.test(host) && !/^[0-9a-f]{24}--/.test(host)) return 'branch-deploy';
  return null;
}

/** Guest mode's configuration for this request, or null when it is off. */
export function guestConfig(env: Record<string, string | undefined>, context: DeployContext): GuestConfig | null {
  const key = env.CR_GUEST_KEY?.trim() ?? '';
  if (key.length < MIN_GUEST_KEY) return null;
  if (context !== 'deploy-preview' && context !== 'branch-deploy' && context !== 'dev') return null;
  return { key };
}

export function isGuestToken(token: string): boolean {
  return token.startsWith(GUEST_PREFIX);
}

/** Whether a guest token carries the key. Compared as hashes, in constant time. */
export function guestKeyMatches(token: string, config: GuestConfig): boolean {
  const given = createHash('sha256').update(token.slice(GUEST_PREFIX.length)).digest();
  const wanted = createHash('sha256').update(config.key).digest();
  return timingSafeEqual(given, wanted);
}
