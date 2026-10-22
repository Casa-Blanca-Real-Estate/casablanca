// The numbers as the assistant may see them (get_numbers, CR-3a): the engine
// run on the server from what's stored — the intake, the exports and the
// agent's tiers — then summarised by workspace/summary.ts.
//
// It reads only what it needs. The call itself is never selected: the database
// says whether one exists (the range is revealed), not what it is. The target
// and the deal terms aren't read at all (§8.4).
import { compute, parseExport, type EngineOutput } from '../engine/index.ts';
import { engineInput, locationsFrom, removedExportComps, workspaceComps, type ParsedImport, type WorkspaceComp } from '../workspace/engine-input.ts';
import type { CompRecord } from '../engine/index.ts';
import type { Brief, WorkspaceState } from '../workspace/state.ts';
import { numbersSummary } from '../workspace/summary.ts';
import { loadGeocodes, reportBuildings } from './buildings.ts';
import type { Queryable } from './db.ts';
import { loadJudgments } from './api/workspace.ts';
import { newYorkToday } from './links.ts';

/** Today in New York, the analysis date — the engine has no clock. */
export { newYorkToday };

export interface NeutralNumbers {
  output: EngineOutput;
  comps: WorkspaceComp[];
  state: WorkspaceState;
  brief: Brief;
  /** Whether the agent has given their call or skipped it — never what it is. */
  revealed: boolean;
  /** Export rows the agent took out of the report: the only other sales Hubert may point to (Dispatch 14). */
  removed: CompRecord[];
  /** The Co-op/Condo toggle the engine computed with. */
  propertyType: 'condo' | 'coop';
}

/**
 * The engine run on the server from what's stored, with no named prices and no
 * deal terms: the numbers a model may see (§8.4). The call is never selected —
 * only whether there is one — and the target isn't read at all.
 */
export async function neutralNumbers(tx: Queryable, reportId: string, asOf = newYorkToday()): Promise<NeutralNumbers | null> {
  const report = (await tx.query<{ state: WorkspaceState | null; brief: Brief | null; revealed: boolean; property_type: 'condo' | 'coop' }>(
    'select state, brief, property_type, agent_call is not null as revealed from comp_report.reports where id = $1',
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
      // Stored only after the same parser read it; if it can't now, it's left out rather than failing the request.
    }
  }
  const judgments = await loadJudgments(tx, reportId);
  const comps = workspaceComps(parsed, judgments);
  const removed = removedExportComps(parsed, judgments).map((r) => r.record);
  const state = report.state ?? {};
  // The buildings' locations, as the screens have them, so distance reads the same here.
  const locations = locationsFrom(await loadGeocodes(tx, (await reportBuildings(tx, reportId)).map((b) => b.key)));
  // No prices, no deal terms: nothing here can carry the call or a target.
  const output = compute(engineInput({ asOf, intake: state.intake, comps, locations, propertyType: report.property_type }));
  return { output, comps, state, brief: report.brief ?? {}, revealed: report.revealed, removed, propertyType: report.property_type };
}

export async function numbersFor(tx: Queryable, reportId: string, asOf = newYorkToday()) {
  const n = await neutralNumbers(tx, reportId, asOf);
  if (!n) return null;
  return numbersSummary({ output: n.output, comps: n.comps, intake: n.state.intake, revealed: n.revealed, removed: n.removed });
}
