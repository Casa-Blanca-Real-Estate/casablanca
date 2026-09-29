// The dev notebook's vocabulary: the one place its tags, statuses, surfaces
// and captured URL parameters are defined. Pure — no Node, no DOM, no Blobs —
// so the functions, the CLI and the tests all import it. The browser widget
// (assets/dev-notebook.js) is plain JS and carries a copy of TAGS and PARAMS;
// vocab.test.ts fails if the copy drifts.
//
// What a note is (docs/dev-notebook/README.md): something Kimani noticed
// about the studio's software while using it. Never app data — nothing that
// computes, stores or shows a report reads these.

export const TAGS = [
  { id: 'bug', label: 'Bug', hint: 'something is broken' },
  { id: 'uiux', label: 'UI/UX', hint: 'works, but looks or feels wrong' },
  { id: 'copy', label: 'Copy', hint: 'wording' },
  { id: 'feature', label: 'Feature', hint: 'something that should exist' },
  { id: 'question', label: 'Question', hint: 'why does it do this?' },
  { id: 'critique', label: 'Critique', hint: 'an opinion about how it should be' },
  { id: 'perf', label: 'Perf', hint: 'slow' },
] as const;
export type Tag = (typeof TAGS)[number]['id'];

/**
 * Where a note is on the ledger. Every change is its own record (the status
 * history is append-only, by construction: see server/store.ts).
 *
 *   open      captured, not yet looked at
 *   read      a session or Kimani has picked it up
 *   resolved  fixed — needs the PR that fixed it
 *   answered  a question, answered — needs the answer, as a note
 *   deferred  not now — needs why
 *   wontfix   not doing it — needs why
 *   duplicate of another note — needs which
 */
export const STATUSES = ['open', 'read', 'resolved', 'answered', 'deferred', 'wontfix', 'duplicate'] as const;
export type Status = (typeof STATUSES)[number];

/** Statuses that close a note: the ledger's "done" column. */
export const CLOSED: readonly Status[] = ['resolved', 'answered', 'wontfix', 'duplicate'];

export const isStatus = (s: unknown): s is Status => typeof s === 'string' && (STATUSES as readonly string[]).includes(s);

/** What each status change must carry. Enforced by the store, so the page, the API and the CLI agree. */
export function statusRequirement(status: Status): 'pr' | 'note' | null {
  if (status === 'resolved') return 'pr';
  if (status === 'answered' || status === 'deferred' || status === 'wontfix' || status === 'duplicate') return 'note';
  return null;
}

/** Known tags only, deduplicated, in the vocabulary's own order (stable diffs). */
export function normalizeTags(raw: unknown): Tag[] {
  const given = new Set(Array.isArray(raw) ? raw : []);
  return TAGS.map((t) => t.id).filter((id) => given.has(id));
}

/**
 * URL parameters worth recording: coordinates, never things people type.
 * A search box, a draft or a token in the URL must never reach a note.
 */
export const PARAMS = ['report', 'step', 'tab', 'view', 'id', 'slug', 'agent'] as const;

export const MAX_BODY = 8000;
export const MAX_VALUE = 200;
export const MAX_CONTEXT_BYTES = 4096;

export function clip(value: unknown, max = MAX_VALUE): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

/** The allowlisted params only, each clipped. Anything else is dropped, whatever the browser sent. */
export function pickParams(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of PARAMS) {
    const v = clip((raw as Record<string, unknown>)[key]);
    if (v) out[key] = v;
  }
  return out;
}

/** "1512x945", or null. Hidden and embedded frames report 0: never store "0x0" (it reads as a measurement). */
export function viewportOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(raw);
  return m && Number(m[1]) > 0 && Number(m[2]) > 0 ? raw : null;
}

/** A route: the path only, never a query string or fragment. */
export function routeOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
  const path = raw.split(/[?#]/)[0]!;
  return path.slice(0, 300) || null;
}

/**
 * Route (and step) to a coarse label, most specific first. Derived on the
 * server from what's stored, so old notes can be re-derived if this changes.
 */
export function surfaceFor(route: string | null | undefined, params: Record<string, string> = {}): string {
  if (!route) return 'unknown';
  const r = route.toLowerCase();
  if (r.startsWith('/tools/comp-report')) return params.step ? `comp-report/${params.step}` : params.report ? 'comp-report/report' : 'comp-report';
  if (r.startsWith('/tools/dev-notebook')) return 'dev-notebook';
  const tool = /^\/tools\/([a-z0-9-]+)/.exec(r);
  if (tool) return `tool/${tool[1]}`;
  if (r === '/' || r === '/index.html') return 'dashboard';
  if (r.startsWith('/agents/')) return 'agent-site';
  return 'other';
}

/** The CLI's first line, over open notes: "7 open dev notes, 3 tagged bug, 1 tagged perf." */
export function describeOpen(notes: { tags: readonly string[] }[]): string {
  if (notes.length === 0) return 'No open dev notes.';
  const counts = new Map<string, number>();
  for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const parts = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, c]) => `${c} tagged ${t}`);
  return `${notes.length} open dev note${notes.length === 1 ? '' : 's'}${parts.length ? `, ${parts.join(', ')}` : ''}.`;
}

/**
 * The emails the notebook admits, unless DEV_NOTEBOOK_EMAILS overrides them.
 * Each must also be able to sign in to the site's Identity at all, which the
 * comp report's rule decides (CR_ADMIN_EMAILS, tools-src/comp-report/server/access.ts).
 */
export const DEFAULT_DEV_EMAILS = ['casacalliste@gmail.com', 'creative@email.casa-blanca.com'];

export function devEmails(env: Record<string, string | undefined>): string[] {
  const listed = (env.DEV_NOTEBOOK_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return listed.length ? listed : DEFAULT_DEV_EMAILS;
}
