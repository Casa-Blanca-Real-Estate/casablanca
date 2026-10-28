// GET /api/comp-report/messages?report=<uuid> — the transcript, for display.
// What's stored is verbatim (thinking signatures and all, for replay); what's
// returned is only what a person reads: the text, the progress notes, which
// tools ran, and how each turn ended.
import { withActor } from '../db.ts';
import { allowMethods, HttpError, json, respond, UUID } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { trailOf, type TrailEntry, type TrailSource } from '../hubert-trail.ts';
import { asUser, requirePool } from './reports.ts';
import { reportFor } from './workspace.ts';

interface Row {
  seq: number;
  role: 'user' | 'assistant';
  content: Array<Record<string, unknown> & { type: string }>;
  model: string | null;
  stop_reason: string | null;
  in_context: boolean;
  created_at: Date;
}

export function handleMessages(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);
    const reportId = new URL(req.url).searchParams.get('report') ?? '';
    if (!UUID.test(reportId)) throw new HttpError(400, 'bad_report');

    const rows = await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, false);
      return (await tx.query<Row>(
        `select seq, role, content, model, stop_reason, in_context, created_at
           from comp_report.messages where report_id = $1 order by seq`,
        [reportId],
      )).rows;
    });

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

    return json({
      messages: rows.map((m) => ({
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
