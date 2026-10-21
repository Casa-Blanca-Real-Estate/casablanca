// The Gate, Findings and Send, reached before Sort is finished (a typed ?step=,
// the browser's Back, a comp untagged after the reveal): what's left, and the
// way back to it. Findings stays locked until every comp has a tier and comp
// tags, and a practice agent's a note (Dispatch 14 item 6; NB-8).
import type { Workspace } from './model.ts';
import { needsPhrase, readinessLine } from './screens.ts';
import '../../styles/compform.css';

export function SortFirst({ ws }: { ws: Workspace }) {
  const line = readinessLine(ws.readiness);
  return (
    <div className="type-mismatch" role="status">
      <p>
        <strong>Finish sorting first.</strong> Every comp needs {needsPhrase(ws.readiness)} before Findings opens{line ? `: ${line}.` : '.'}
      </p>
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          ws.setSortFilter({ incomplete: ws.readiness.incomplete.length > 0, tags: [] });
          ws.go('sort');
        }}
      >
        Back to Sort
      </button>
    </div>
  );
}
