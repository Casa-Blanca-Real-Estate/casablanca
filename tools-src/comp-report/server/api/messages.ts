// GET /api/comp-report/messages?report=<uuid> — the transcript, for display.
// What's stored is verbatim (thinking signatures and all, for replay); what's
// returned is only what a person reads: the text, the progress notes, which
// tools ran, and how each turn ended. Messages taken back with Stop are left out.
//
// POST { reportId, stop: true, text } — Stop (Kimani, 2026-11-06): takes the agent's last message back
// before Hubert's reply is in (or just after), so they can fix it and send it again. Append-only: it adds
// a marker (assistant.ts withdrawnSeqs), and the reply still being written sees it and stops.
//
// GET ?report=<uuid>&thumb=<url> — a listing card's photo (2026-11-06): the page's preview image, for a
// StreetEasy page among the first three results of one of Hubert's searches in this report. Never any other link.
import { withActor, type Queryable } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { WITHDRAW, withdrawnSeqs } from '../assistant.ts';
import { CARDS_PER_SEARCH, isListingPage, readableUrl, type WebSearcher } from '../web-search.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { trailOf, type TrailEntry, type TrailSource } from '../hubert-trail.ts';
import { asUser, requirePool } from './reports.ts';
import { reportFor } from './workspace.ts';
import { logViewed } from '../logs.ts';

interface Row {
  seq: number;
  role: 'user' | 'assistant';
  content: Array<Record<string, unknown> & { type: string }>;
  model: string | null;
  stop_reason: string | null;
  in_context: boolean;
  created_at: Date;
}

export interface MessagesDeps extends AuthDeps {
  /** For a listing card's photo. Without it, cards show without one. */
  web?: () => WebSearcher;
}

/** How long after sending the agent can still take a message back. */
const STOP_WINDOW_MINUTES = 10;

type Block = Record<string, unknown> & { type: string };
const hasText = (content: Block[]) => content.some((b) => b.type === 'text' && String(b.text ?? '').trim());
const textOf = (content: Block[]) => content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('').trim();

async function stop(pool: Parameters<typeof withActor>[0], user: Parameters<typeof asUser>[0], reportId: string, text: string | null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await withActor(pool, asUser(user), async (tx) => {
        // Only the owner talks to Hubert, so only the owner takes a message back.
        const own = await tx.query("select 1 from comp_report.reports where id = $1 and owner_email = $2 and status <> 'deleted'", [reportId, user.email]);
        if (!own.rowCount) throw new HttpError(404, 'not_found', 'No such report.');
        const rows = (await tx.query<Row & { prompt_version: string | null }>(
          `select seq, role, content, model, stop_reason, in_context, created_at, prompt_version
             from comp_report.messages where report_id = $1 order by seq`,
          [reportId],
        )).rows;
        const gone = withdrawnSeqs(rows);
        const last = rows.findLast((m) => m.role === 'user' && !gone.has(m.seq) && hasText(m.content));
        const recent = last && Date.now() - new Date(last.created_at).getTime() < STOP_WINDOW_MINUTES * 60_000;
        // Not in yet (Stop pressed as it was sent), or not the message they meant: nothing is taken back.
        if (!last || !recent || (text !== null && textOf(last.content) !== text)) {
          throw new HttpError(409, 'nothing_to_stop', 'That message isn’t in yet. Try again in a moment.');
        }
        const seq = (rows.at(-1)?.seq ?? 0) + 1;
        await tx.query(
          `insert into comp_report.messages (report_id, seq, role, content, in_context, prompt_version)
           values ($1, $2, 'user', $3, false, $4)`,
          [reportId, seq, JSON.stringify([{ type: WITHDRAW, from: last.seq }]), rows[0]?.prompt_version ?? null],
        );
        return { stopped: last.seq, text: textOf(last.content) };
      });
    } catch (error) {
      // The reply landed in that place first: look again, and take it back with the message.
      if ((error as { code?: string }).code !== '23505') throw error;
    }
  }
  throw new HttpError(409, 'busy', 'Hubert is mid-reply. Try again in a moment.');
}

/** The search results of this report's web_search calls that may show as cards: StreetEasy pages, the first three of each search. */
async function cardUrls(tx: Queryable, reportId: string): Promise<Set<string>> {
  const { rows } = await tx.query<{ content: Block[] }>(
    `select content from comp_report.messages where report_id = $1 and role = 'user' and in_context`,
    [reportId],
  );
  const searches = new Set<string>();
  const { rows: calls } = await tx.query<{ content: Block[] }>(
    `select content from comp_report.messages where report_id = $1 and role = 'assistant'`,
    [reportId],
  );
  for (const m of calls) for (const b of m.content) if (b.type === 'tool_use' && b.name === 'web_search' && typeof b.id === 'string') searches.add(b.id);
  const out = new Set<string>();
  for (const m of rows) {
    for (const b of m.content) {
      if (b.type !== 'tool_result' || b.is_error || !searches.has(String(b.tool_use_id)) || typeof b.content !== 'string') continue;
      try {
        const results = (JSON.parse(b.content) as { results?: Array<{ url?: unknown }> }).results ?? [];
        results.map((r) => String(r.url ?? '')).filter(isListingPage).slice(0, CARDS_PER_SEARCH).forEach((u) => out.add(u));
      } catch {
        /* not a result */
      }
    }
  }
  return out;
}

export function handleMessages(req: Request, deps: MessagesDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'POST');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);
    if (req.method === 'POST') {
      const body = await readJsonObject(req);
      const id = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
      if (!id || body.stop !== true) throw new HttpError(400, 'bad_request', 'Which report, and stop?');
      const text = typeof body.text === 'string' ? body.text.trim() : null;
      return json(await stop(pool, user, id, text));
    }
    const params = new URL(req.url).searchParams;
    const reportId = params.get('report') ?? '';
    if (!UUID.test(reportId)) throw new HttpError(400, 'bad_report');

    const thumbFor = params.get('thumb');
    if (thumbFor !== null) {
      const url = readableUrl(thumbFor);
      const allowed = await withActor(pool, asUser(user), async (tx) => {
        await reportFor(tx, user, reportId, false);
        return url ? (await cardUrls(tx, reportId)).has(url) : false;
      });
      if (!url || !allowed) throw new HttpError(404, 'not_a_card', 'That link isn’t one of Hubert’s results here.');
      const web = deps.web?.();
      const image = web?.thumb ? await web.thumb(url) : null;
      return new Response(JSON.stringify({ image }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=86400' },
      });
    }

    const { report, rows } = await withActor(pool, asUser(user), async (tx) => ({
      report: await reportFor(tx, user, reportId, false),
      rows: (await tx.query<Row>(
        `select seq, role, content, model, stop_reason, in_context, created_at
           from comp_report.messages where report_id = $1 order by seq`,
        [reportId],
      )).rows,
    }));
    await logViewed(pool, user, report);

    // Hubert's trail (2026-10-28): what each reply's tools changed or read, from the results that answered them.
    const results = new Map<string, Record<string, unknown>>();
    for (const m of rows) {
      if (m.role !== 'user') continue;
      for (const b of m.content) if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') results.set(b.tool_use_id, b);
    }
    const trail = (m: Row) => {
      const changes: TrailEntry[] = [];
      const sources: TrailSource[] = [];
      for (const b of m.content) {
        if (b.type !== 'tool_use' || typeof b.id !== 'string') continue;
        const result = results.get(b.id);
        if (!result) continue;
        const got = trailOf(String(b.name), result);
        changes.push(...got.changes);
        for (const s of got.sources) if (!sources.some((x) => x.url === s.url)) sources.push(s);
      }
      return { changes, sources };
    };

    const gone = withdrawnSeqs(rows);
    return json({
      messages: rows.filter((m) => !gone.has(m.seq)).map((m) => ({
        seq: m.seq,
        role: m.role,
        text: m.content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join(''),
        progress: m.content.filter((b) => b.type === 'thinking' && b.thinking).map((b) => String(b.thinking)),
        tools: m.content.filter((b) => b.type === 'tool_use').map((b) => String(b.name)),
        ...(m.role === 'assistant' ? trail(m) : { changes: [], sources: [] }),
        toolResultsOnly: m.role === 'user' && m.content.every((b) => b.type === 'tool_result'),
        model: m.model,
        stopReason: m.stop_reason,
        inContext: m.in_context,
        createdAt: new Date(m.created_at).toISOString(),
      })),
    });
  });
}
