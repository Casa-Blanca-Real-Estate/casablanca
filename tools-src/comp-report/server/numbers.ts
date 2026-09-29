// The numbers as the assistant may see them (get_numbers, CR-3a): the engine
// run on the server from what's stored — the intake, the exports and the
// agent's tiers — then summarised by workspace/summary.ts.
//
// It reads only what it needs. The call itself is never selected: the database
// says whether one exists (the range is revealed), not what it is. The target
// and the deal terms aren't read at all (§8.4).
import { compute, parseExport } from '../engine/index.ts';
import { engineInput, workspaceComps, type ParsedImport } from '../workspace/engine-input.ts';
import type { WorkspaceState } from '../workspace/state.ts';
import { numbersSummary } from '../workspace/summary.ts';
import type { Queryable } from './db.ts';
import { loadJudgments } from './api/workspace.ts';

/** Today in New York, the analysis date — the engine has no clock. */
export function newYorkToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export async function numbersFor(tx: Queryable, reportId: string, asOf = newYorkToday()) {
  const report = (await tx.query<{ state: WorkspaceState | null; revealed: boolean }>(
    'select state, agent_call is not null as revealed from comp_report.reports where id = $1',
    [reportId],
  )).rows[0];
  if (!report) return null;
  const imports = (await tx.query<{ id: string; created_at: Date; as_of: string; filename: string | null; content: Buffer }>(
    `select id, created_at, as_of::text as as_of, filename, content from comp_report.imports where report_id = $1 order by created_at, id`,
    [reportId],
  )).rows;
  const parsed: ParsedImport[] = [];
  for (const i of imports) {
    try {
      parsed.push({
        importId: i.id,
        createdAt: new Date(i.created_at).toISOString(),
        parsed: parseExport(new Uint8Array(i.content), { as_of: i.as_of, ...(i.filename ? { filename: i.filename } : {}) }),
      });
    } catch {
      // Stored only after the same parser read it; if it can't now, it's left out rather than failing the turn.
    }
  }
  const comps = workspaceComps(parsed, await loadJudgments(tx, reportId));
  const intake = report.state?.intake;
  // No prices, no deal terms: nothing here can carry the call or a target.
  const output = compute(engineInput({ asOf, intake, comps }));
  return numbersSummary({ output, comps, intake, revealed: report.revealed });
}
