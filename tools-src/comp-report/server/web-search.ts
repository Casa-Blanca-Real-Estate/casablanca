// Hubert on the web (Kimani, 2026-10-28): web_search and read_page, through
// Firecrawl, the key the link reads already use. For what the report's data
// doesn't say and the agent's question needs: a building's amenities or
// policies, when it was built, a subway line, a term. Never a sale for the
// comps: those come from the agent's export and links (the prompt says so).
//
// What comes back is the web's text, which the prompt tells Hubert to treat as
// information, never as instructions. Each search or page read costs Firecrawl
// credit, so they're counted per person over any 24 hours, from the
// transcript itself: no table of their own.
import type { Queryable } from './db.ts';

export interface WebResult {
  title: string;
  url: string;
  /** A search's snippet, or a page's text (cut to fit). */
  text: string;
}

export type WebOutcome = { ok: true; results: WebResult[] } | { ok: false; error: string };

/** Searches and reads the web. Production is Firecrawl; tests and local dev pass their own. */
export interface WebSearcher {
  search(query: string): Promise<WebOutcome>;
  read(url: string): Promise<WebOutcome>;
}

/** Searches and page reads per person over any 24 hours. */
export function webLimit(env: Record<string, string | undefined> = process.env): number {
  const set = Number(env.CR_WEB_LOOKUPS_PER_DAY);
  return Number.isInteger(set) && set > 0 ? set : 60;
}

const RESULTS = 5;
const SNIPPET = 400;
/** A page's text, cut to what a turn can carry. */
const PAGE_TEXT = 8_000;
/** Both well inside the turn's 50 s: the model call still needs its time after. */
const SEARCH_MS = 12_000;
const READ_MS = 20_000;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Only a public https page: no credentials, no ports, no local addresses. */
export function readableUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^[\d.]+$/.test(host) || host.includes(':')) return null;
  return u.toString();
}

export function firecrawlSearcher(opts: { apiKey: string | undefined; baseUrl?: string; fetch?: typeof fetch }): WebSearcher {
  const base = (opts.baseUrl ?? 'https://api.firecrawl.dev').replace(/\/+$/, '');
  const doFetch = opts.fetch ?? fetch;
  const notSetUp: WebOutcome = { ok: false, error: 'Web search isn’t set up on this site (no Firecrawl key). Say so to the agent.' };

  async function post(path: string, body: unknown, ms: number) {
    const res = await doFetch(`${base}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  }

  return {
    async search(query) {
      if (!opts.apiKey) return notSetUp;
      try {
        const { status, body } = await post('/v2/search', { query, limit: RESULTS, sources: ['web'] }, SEARCH_MS);
        if (status >= 400 || !body || body.success === false) {
          console.error('comp-report: Firecrawl search refused', { status, error: String(body?.error ?? '').slice(0, 300) });
          return { ok: false, error: 'The search didn’t work just now. Say so; the agent can try again in a minute.' };
        }
        // v2 answers { data: { web: [...] } }; v1 answered { data: [...] }.
        const data = body.data as unknown;
        const rows = (Array.isArray(data) ? data : (data as { web?: unknown } | null)?.web) as Array<Record<string, unknown>> | undefined;
        const results = (rows ?? [])
          .filter((r) => typeof r.url === 'string' && readableUrl(r.url))
          .slice(0, RESULTS)
          .map((r) => ({ title: String(r.title ?? r.url), url: String(r.url), text: cut(String(r.description ?? r.snippet ?? ''), SNIPPET) }));
        return { ok: true, results };
      } catch (error) {
        console.error('comp-report: Firecrawl search unreachable', String(error).slice(0, 300));
        return { ok: false, error: 'The search took too long. Say so; the agent can try again.' };
      }
    },
    async read(url) {
      if (!opts.apiKey) return notSetUp;
      try {
        const { status, body } = await post('/v1/scrape', { url, formats: ['markdown'], onlyMainContent: true, timeout: READ_MS - 2_000 }, READ_MS);
        const data = (body?.data ?? {}) as { markdown?: string; metadata?: { title?: string; statusCode?: number } };
        if (status >= 400 || !body || body.success === false || (data.metadata?.statusCode ?? 200) >= 400) {
          return { ok: false, error: 'That page couldn’t be read. Say so, and use what the search showed.' };
        }
        return { ok: true, results: [{ title: String(data.metadata?.title ?? url), url, text: cut(data.markdown ?? '', PAGE_TEXT) }] };
      } catch {
        return { ok: false, error: 'That page took too long to read. Say so, and use what the search showed.' };
      }
    },
  };
}

/** The person's searches and page reads over the last 24 hours, from Hubert's calls in their reports. */
export async function webLookupsToday(tx: Queryable, email: string): Promise<number> {
  const { rows } = await tx.query<{ n: string }>(
    `select count(*)::text as n
       from comp_report.messages m
       join comp_report.reports r on r.id = m.report_id
       cross join lateral jsonb_array_elements(m.content) b
      where r.owner_email = $1 and m.role = 'assistant' and m.created_at > now() - interval '24 hours'
        and b ->> 'type' = 'tool_use' and b ->> 'name' in ('web_search', 'read_page')`,
    [email],
  );
  return Number(rows[0]?.n ?? 0);
}
