// GET /api/comp-report/messages?report=<uuid> — the transcript, for display.
// What's stored is verbatim (thinking signatures and all, for replay); what's
// returned is only what a person reads: the text, the progress notes, which
// tools ran, and how each turn ended.
import { withActor } from '../db.ts';
import { allowMethods, HttpError, json, respond, UUID } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';
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

    return json({
      messages: rows.map((m) => ({
        seq: m.seq,
        role: m.role,
        text: m.content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join(''),
        progress: m.content.filter((b) => b.type === 'thinking' && b.thinking).map((b) => String(b.thinking)),
        tools: m.content.filter((b) => b.type === 'tool_use').map((b) => String(b.name)),
        toolResultsOnly: m.role === 'user' && m.content.every((b) => b.type === 'tool_result'),
        model: m.model,
        stopReason: m.stop_reason,
        inContext: m.in_context,
        createdAt: new Date(m.created_at).toISOString(),
      })),
    });
  });
}
