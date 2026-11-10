// Co-op or condo, like for like (Dispatch 14): the engine keeps a comp of the
// other type out of every statistic. Co-op is the new-report default and most
// of Tribeca is condos, so a report set to the wrong type would sort fine and
// then have no range, for a reason Sort never showed. This says it where it
// matters, with the one-click fix. It names the comps (the walk of 2026-11-10:
// "1 comp isn't a condo" left the agent hunting for it), and offers to flip the
// report only when most of its comps are the other type; otherwise the fix is to
// take the odd one out.
import { compAddress } from '../workspace/comps.tsx';
import type { Workspace } from '../workspace/model.ts';
import '../../styles/compform.css';

export function TypeMismatch({ ws }: { ws: Workspace }) {
  const ids = new Set((ws.output?.warnings ?? []).filter((w) => w.code === 'property_type_mismatch').flatMap((w) => w.comp_ids ?? []));
  if (!ids.size) return null;
  const n = ids.size;
  const coop = ws.propertyType === 'coop';
  const other = coop ? 'condo' : 'coop';
  const odd = ws.comps.filter((c) => ids.has(c.id));
  const live = ws.comps.filter((c) => c.judgment && !c.judgment.removedAt && !c.unsortable).length;
  const names = odd.map(compAddress);
  const named = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
  // Most comps the other type: the report's type is likely what's wrong. Otherwise the odd comps are.
  const flip = n * 2 > live;
  return (
    <div className="type-mismatch" role="status">
      <p>
        <strong>{n} comp{n === 1 ? ' isn’t a' : 's aren’t'} {coop ? 'co-op' : 'condo'}{n === 1 ? '' : 's'}</strong>{named ? ` (${named})` : ''}, and this report is a {coop ? 'co-op' : 'condo'}.
        Comps count like for like only, so {n === 1 ? 'it counts' : 'they count'} in nothing.
      </p>
      {!ws.readOnly && (flip ? (
        <button type="button" className="btn" onClick={() => ws.setPropertyType(other)}>
          Make this report a {other === 'coop' ? 'co-op' : 'condo'}
        </button>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() => {
            for (const c of odd) if (c.judgment) void ws.editComp(c.judgment.reportCompId, { removed: true }).catch(() => undefined);
          }}
        >
          Take {n === 1 ? 'it' : 'them'} out
        </button>
      ))}
    </div>
  );
}
