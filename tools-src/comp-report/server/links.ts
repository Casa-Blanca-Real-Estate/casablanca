// StreetEasy links (§6.2, Dispatch 09): which links the tool will read, how
// many a person may read, and the reader itself. Reading a page costs Firecrawl
// credit, so every read is signed in, StreetEasy only, and counted.
//
// The page is read with the extract schema and prompt Abacus wrote for it
// (engine/parser/listing.ts): values as the page shows them, empty when it
// doesn't. The engine turns the extract into a comp record; nothing here reads
// a number. Photos are links only (NW-020 a): the extract's photo URLs are
// cleaned before the read is returned (and stored), keeping https URLs on
// StreetEasy's image hosts (cleanListingExtract). No image is fetched, proxied
// or copied.
import { cleanListingExtract, LISTING_EXTRACT_PROMPT, LISTING_EXTRACT_SCHEMA } from '../engine/index.ts';
import type { Role } from './db.ts';

export { checkListingLink, MAX_LINKS_PER_REQUEST, titleFromLink, type LinkCheck, type LinkPurpose } from '../workspace/links.ts';

/** Today in New York, where the listings are: the as-of date of a read or a typed-in comp. */
export function newYorkToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Reads per person over any 24 hours: each one costs Firecrawl credit. */
export function readLimit(role: Role, env: Record<string, string | undefined> = process.env): number {
  const set = Number(env.CR_LINK_READS_PER_DAY);
  const agents = Number.isInteger(set) && set > 0 ? set : 60;
  return role === 'admin' ? Math.max(agents, 200) : agents;
}

// ─── The reader ─────────────────────────────────────────────────────────────

/**
 * How long one read may take, retries and all: 2½ minutes. With the function's
 * start and the save, a read is done or failed by 3:00, which the bar says
 * (ReadingNotice). A usual read takes about a minute.
 */
export const READ_BUDGET_MS = 150_000;
/** One Firecrawl request's own limit, and the wait on it. */
const SCRAPE_TIMEOUT_MS = 55_000;
const REQUEST_WAIT_MS = 90_000;
/** Too little time left for a request to finish: stop rather than start one. */
const MIN_REQUEST_MS = 20_000;

export const TOO_LONG = 'StreetEasy’s page took more than 3 minutes to read, so it was stopped. Try the link again, or type it in.';

export type ReadFailure = 'blocked' | 'not_found' | 'timeout' | 'provider_error' | 'not_configured' | 'unreadable';

export type PageRead =
  | { ok: true; extract: Record<string, unknown> }
  | { ok: false; code: ReadFailure; message: string };

/** Reads one listing page. Production is Firecrawl; tests and local dev pass their own. */
export interface PageReader {
  read(url: string): Promise<PageRead>;
}

// A bot wall is a page too: Firecrawl returns it like any other, so its text is checked.
const WALL = /(pardon our interruption|access to this page has been denied|verify (you are|you're) (a )?human|are you a human|press & hold|enable javascript and cookies to continue|unusual activity|perimeterx|px-captcha|\bcaptcha\b)/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True when the extract has at least one value: a page that gave nothing is no read. */
function hasAnything(extract: Record<string, unknown>): boolean {
  return Object.values(extract).some((v) => (typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined));
}

/**
 * Firecrawl's scrape with extract, as the carousel tools' import already calls
 * it (netlify/functions/streeteasy-import-background.mjs): the stealth proxy
 * first, a plain request if that's refused at once, and a wait-and-retry when
 * Firecrawl is busy. Runs in a background function, so it can take its time.
 */
export function firecrawlReader(opts: {
  apiKey: string | undefined;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Waits between retries; tests pass shorter ones. */
  backoffMs?: number[];
  /** The whole read's limit (READ_BUDGET_MS); tests pass their own, with their own clock. */
  budgetMs?: number;
  now?: () => number;
}): PageReader {
  const base = (opts.baseUrl ?? 'https://api.firecrawl.dev').replace(/\/+$/, '');
  const doFetch = opts.fetch ?? fetch;
  const backoff = opts.backoffMs ?? [5_000, 15_000];
  const budget = opts.budgetMs ?? READ_BUDGET_MS;
  const now = opts.now ?? Date.now;

  async function scrape(url: string, stealth: boolean, left: number) {
    const res = await doFetch(`${base}/v1/scrape`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        formats: ['extract', 'markdown'],
        onlyMainContent: true,
        waitFor: 3000,
        timeout: Math.max(5_000, Math.min(SCRAPE_TIMEOUT_MS, left - 5_000)),
        extract: { schema: LISTING_EXTRACT_SCHEMA, prompt: LISTING_EXTRACT_PROMPT },
        ...(stealth ? { proxy: 'stealth', blockAds: true } : {}),
      }),
      signal: AbortSignal.timeout(Math.max(1, Math.min(REQUEST_WAIT_MS, left))),
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
      data?: { extract?: unknown; markdown?: string; metadata?: { title?: string; description?: string; statusCode?: number } };
    } | null;
    return { status: res.status, body };
  }

  return {
    async read(url) {
      if (!opts.apiKey) return { ok: false, code: 'not_configured', message: 'Reading links isn’t set up on this site yet (no Firecrawl key).' };
      const deadline = now() + budget;
      const left = () => deadline - now();
      // Another try only when its wait still leaves time for a request.
      const canRetry = (attempt: number) => attempt < backoff.length && left() - backoff[attempt]! >= MIN_REQUEST_MS;
      for (let attempt = 0; ; attempt++) {
        let result: Awaited<ReturnType<typeof scrape>>;
        try {
          const started = now();
          result = await scrape(url, true, left());
          // A fast refusal of the stealth proxy (a plan limit: a 4xx, not busy) gets a plain request instead.
          const refused = (result.status >= 400 && result.status < 500 && result.status !== 429) || (result.status < 400 && result.body?.success === false);
          if (refused && now() - started < 8_000 && left() >= MIN_REQUEST_MS) {
            result = await scrape(url, false, left());
          }
        } catch (error) {
          const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
          if (canRetry(attempt)) {
            await sleep(backoff[attempt]!);
            continue;
          }
          console.error('comp-report: Firecrawl unreachable', { url, timedOut, error: String(error).slice(0, 300) });
          return timedOut || left() < MIN_REQUEST_MS
            ? { ok: false, code: 'timeout', message: TOO_LONG }
            : { ok: false, code: 'provider_error', message: 'The page couldn’t be reached. Try the link again, or type the comp in.' };
        }
        const { status, body } = result;
        if (status === 429 || status >= 500) {
          if (canRetry(attempt)) {
            await sleep(backoff[attempt]!);
            continue;
          }
          if (left() < MIN_REQUEST_MS) {
            console.error('comp-report: Firecrawl ran out of time', { url, status });
            return { ok: false, code: 'timeout', message: TOO_LONG };
          }
        }
        if (status >= 400 || !body || body.success === false) {
          // What Firecrawl said, in the function's log: the agent's message stays plain.
          console.error('comp-report: Firecrawl refused a read', { url, status, error: String(body?.error ?? '').slice(0, 300) });
          return { ok: false, code: 'provider_error', message: 'The page couldn’t be read just now. Try the link again, or type the comp in.' };
        }
        const data = body.data ?? {};
        const meta = data.metadata ?? {};
        if (meta.statusCode === 404 || meta.statusCode === 410) {
          return { ok: false, code: 'not_found', message: 'StreetEasy says that page doesn’t exist. Check the link, or type the comp in.' };
        }
        const pageText = `${data.markdown ?? ''} ${meta.title ?? ''} ${meta.description ?? ''}`;
        if (WALL.test(pageText)) {
          return { ok: false, code: 'blocked', message: 'StreetEasy asked for a “verify you’re human” check, so the page couldn’t be read. Try again in a minute, or type the comp in.' };
        }
        const extract = data.extract;
        if (!extract || typeof extract !== 'object' || Array.isArray(extract) || !hasAnything(extract as Record<string, unknown>)) {
          return { ok: false, code: 'unreadable', message: 'Nothing could be read from that page. Type the comp in instead.' };
        }
        return { ok: true, extract: cleanListingExtract(extract as Record<string, unknown>) };
      }
    },
  };
}
