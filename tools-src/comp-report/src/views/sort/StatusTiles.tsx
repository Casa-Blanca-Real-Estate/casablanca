// The status tiles (the prototype's statusStatsLive): count and median per
// status, from the same figures Sort's rows show. The handoff puts them on
// Findings; they're built here, from Sort's rows, so both read the same numbers.
import { useMemo } from 'react';
import type { CompOut } from '../../../engine/index.ts';
import type { Workspace } from '../workspace/model.ts';
import { statusStats, toRow } from './rows.ts';
import '../../styles/sort.css';

export function StatusTiles({ ws }: { ws: Workspace }) {
  const stats = useMemo(() => {
    const outById = new Map<string, CompOut>((ws.output?.comps ?? []).map((c) => [c.id, c]));
    return statusStats(ws.comps.map((c) => toRow(c, outById.get(c.id))), ws.sf);
  }, [ws.comps, ws.output, ws.sf]);
  if (!stats.length) return null;
  return (
    <div className="so-tiles" role="list" aria-label="By status">
      {stats.map((s) => (
        <div key={s.status} className="so-tile" role="listitem">
          <div className="so-tile-head">
            <span className={`so-sw ${s.status}`} aria-hidden="true" />
            {s.name} <span className="so-tile-n">{s.n}</span>
          </div>
          <div className="so-tile-val">
            {s.median}<span className="so-tile-unit">{s.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
