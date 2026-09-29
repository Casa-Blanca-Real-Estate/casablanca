// Who may use the comp report (design §13). One rule, enforced twice: by the
// Identity event functions at sign-up and log-in, and by every API request,
// whatever Identity decided.
//
//   1. an email in CR_ADMIN_EMAILS            → admin (the only way to be one)
//   2. an unrevoked allowlist entry           → that entry's role: agent,
//                                               mentor or external, never admin
//   3. an email on one of Casa's domains      → agent
//   4. anything else                          → refused
//
// An allowlist row that says admin (none can be written since CR-1.1; the
// database refuses them) grants nothing: the rule reads on as if it weren't
// there.
//
// Domains match exactly: listing casa-blanca.com does not admit
// email.casa-blanca.com. Which domains Casa's Workspace uses is Kimani's call
// (Dispatch 05 §4), so it's configuration: CR_ALLOWED_DOMAINS, comma-separated.
import type { Role } from './db.ts';

export const DEFAULT_DOMAINS = ['casa-blanca.com'];

/** The roles an allowlist grant can give. Admin comes from CR_ADMIN_EMAILS only. */
export const GRANTABLE_ROLES: readonly Role[] = ['external', 'mentor', 'agent'];

export interface AccessConfig {
  domains: string[];
  adminEmails: string[];
}

export interface AccessDecision {
  allowed: boolean;
  role: Role | null;
  via: 'admin' | 'allowlist' | 'domain' | null;
}

function list(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function accessConfig(env: Record<string, string | undefined> = process.env): AccessConfig {
  const domains = list(env.CR_ALLOWED_DOMAINS);
  return {
    domains: domains.length ? domains : DEFAULT_DOMAINS,
    adminEmails: list(env.CR_ADMIN_EMAILS).filter((e) => normalizeEmail(e) === e),
  };
}

/** Lower-cased and trimmed, or null if it isn't a plausible single address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

export function isCasaEmail(email: string, config: AccessConfig): boolean {
  return config.domains.includes(emailDomain(email));
}

export function decide(email: string, config: AccessConfig, allowlistRole: Role | null): AccessDecision {
  if (config.adminEmails.includes(email)) return { allowed: true, role: 'admin', via: 'admin' };
  if (allowlistRole && GRANTABLE_ROLES.includes(allowlistRole)) return { allowed: true, role: allowlistRole, via: 'allowlist' };
  if (isCasaEmail(email, config)) return { allowed: true, role: 'agent', via: 'domain' };
  return { allowed: false, role: null, via: null };
}
