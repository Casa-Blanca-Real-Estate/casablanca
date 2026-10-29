// The signed-in agent's profile: their name, the first name they go by, their
// title, email, phone and headshot, from Casa's own roster (the `cb-agents` store the agent CMS and
// the profile-pic roster write; Dispatch 12) rather than from Identity, which
// has no name for anyone who signed up with a password and never a phone. The
// email's sign-off uses it, and Hubert greets the agent by their first name.
//
// The signed-in agent is matched by their verified email against each record's
// contact email (draft first, then live): the store is keyed by slug, and a
// slug can't be read off an address. About 125 records, read a few at a time,
// and the match is kept in memory for a while, so the scan is rare.
//
// Only the agent's own card is ever returned: the email is the session's, never
// the request's. The headshot is one of the profile-pic generator's outputs
// (a clean square first), copied once into the email's photo store, so the
// client's mail loads it from the same public route as the comps' photos. A new
// photo in the roster is a new source, so it's copied again.
import { readPart, type FileBlobs } from '../../agent-pics/files.ts';
import { readPic, type StoredFile } from '../../agent-pics/record.ts';
import { keepCopy, MAX_PHOTO_BYTES, photoPath, type EmailPhotoStore } from './email-photos.ts';

/** What the comp report reads of the roster. Production is the Blobs stores; tests pass memory. */
export interface AgentRoster {
  /** The `_index`: every slug. */
  slugs(): Promise<string[]>;
  record(slug: string): Promise<unknown>;
  files: FileBlobs;
}

export interface AgentCard {
  slug: string;
  name: string | null;
  /** What the agent goes by: the CMS's display name, else the first word of their name. */
  firstName: string | null;
  /** e.g. Licensed Real Estate Agent. */
  title: string | null;
  /** The roster's contact email: the one they signed in with, as the roster spells it. */
  email: string | null;
  phone: string | null;
  /** The headshot's public path, once copied; null without one. */
  photo: string | null;
}

/** The outputs that suit a 56px sign-off, best first: square and clean, then round and clean, then any JPEG. */
const HEADSHOTS = ['SQ2_Clean', 'R4_Clean', 'SQ1_GrayLogo', 'R2_Logo'];

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 120): string | null => {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max) : '';
  return s || null;
};

interface Found {
  slug: string;
  name: string | null;
  firstName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  headshot: StoredFile | null;
}

/** A record's card, when its contact email is this one. Archived agents don't sign. */
export function cardOf(slug: string, rec: unknown, email: string): Found | null {
  if (!isObject(rec) || rec.status === 'archived') return null;
  const want = email.trim().toLowerCase();
  const sides = [rec.draft, rec.live].filter(isObject);
  const matches = sides.some((s) => isObject(s.contact) && text(s.contact.email, 200)?.toLowerCase() === want);
  if (!matches) return null;
  const pick = (f: (s: Record<string, unknown>) => unknown) => sides.map((s) => text(f(s))).find(Boolean) ?? null;
  const identity = (s: Record<string, unknown>) => (isObject(s.identity) ? s.identity : {});
  const contact = (s: Record<string, unknown>) => (isObject(s.contact) ? s.contact : {});
  const outputs = readPic(rec.pic).outputs;
  const headshot = HEADSHOTS.map((v) => outputs.find((o) => o.variant === v && o.type === 'image/jpeg')).find(Boolean)
    ?? outputs.find((o) => o.type === 'image/jpeg')
    ?? null;
  const name = pick((s) => identity(s).name);
  return {
    slug,
    name,
    firstName: pick((s) => identity(s).displayName) ?? name?.split(/\s+/)[0] ?? null,
    title: pick((s) => identity(s).title),
    email: pick((s) => contact(s).email),
    phone: pick((s) => contact(s).phone),
    headshot: headshot && headshot.bytes > 0 && headshot.bytes <= MAX_PHOTO_BYTES ? headshot : null,
  };
}

/** The roster record whose contact email is this one, read a few at a time: null when there's none. */
export async function findAgent(roster: AgentRoster, email: string, atOnce = 8): Promise<Found | null> {
  const slugs = await roster.slugs();
  let next = 0;
  let found: Found | null = null;
  const worker = async () => {
    while (!found && next < slugs.length) {
      const slug = slugs[next++]!;
      const hit = cardOf(slug, await roster.record(slug).catch(() => null), email);
      if (hit) found ??= hit;
    }
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, slugs.length) }, worker));
  return found;
}

/** The headshot's bytes, from its parts, checked against the size the record gives. */
async function headshotBytes(files: FileBlobs, slug: string, f: StoredFile): Promise<ArrayBuffer | null> {
  const parts: ArrayBuffer[] = [];
  for (let n = 0; n < f.parts; n++) {
    const part = await readPart(files, slug, f.key, n);
    if (!part) return null;
    parts.push(part);
  }
  const out = new Uint8Array(parts.reduce((t, p) => t + p.byteLength, 0));
  if (out.byteLength !== f.bytes) return null;
  let at = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), at);
    at += p.byteLength;
  }
  return out.buffer;
}

const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; card: AgentCard | null }>();

/** For tests: forget what was found. */
export function forgetAgentCards(): void {
  cache.clear();
}

/** The signed-in agent's card, or null when the roster doesn't know their email. */
export async function agentCard(
  roster: AgentRoster, photos: EmailPhotoStore | null, email: string, now = () => Date.now(),
): Promise<AgentCard | null> {
  const key = email.trim().toLowerCase();
  const kept = cache.get(key);
  if (kept && now() - kept.at < CACHE_MS) return kept.card;
  const found = await findAgent(roster, key);
  let card: AgentCard | null = null;
  if (found) {
    const f = found.headshot;
    const copied = f && photos
      ? await keepCopy(photos, `agent:${found.slug}`, `agent-pics:${found.slug}/${f.key}`, async () => {
        const data = await headshotBytes(roster.files, found.slug, f);
        return data ? { ok: true as const, data, contentType: f.type } : { ok: false as const, reason: 'missing parts' };
      }).catch(() => null)
      : null;
    card = {
      slug: found.slug, name: found.name, firstName: found.firstName, title: found.title, email: found.email, phone: found.phone, photo: copied ? photoPath(copied) : null,
    };
  }
  cache.set(key, { at: now(), card });
  return card;
}
