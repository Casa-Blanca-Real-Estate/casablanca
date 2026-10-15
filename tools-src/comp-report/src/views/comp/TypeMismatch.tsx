// Co-op or condo, like for like (Dispatch 14): the engine keeps a comp of the
// other type out of every statistic. Co-op is the new-report default and most
// of Tribeca is condos, so a report set to the wrong type would sort fine and
// then have no range, for a reason Sort never showed. This says it where it
// matters, with the one-click fix.
import type { Workspace } from '../workspace/model.ts';
import '../../styles/compform.css';

export function TypeMismatch({ ws }: { ws: Workspace }) {
  const ids = new Set((ws.output?.warnings ?? []).filter((w) => w.code === 'property_type_mismatch').flatMap((w) => w.comp_ids ?? []));
  if (!ids.size) return null;
  const n = ids.size;
  const coop = ws.propertyType === 'coop';
  const other = coop ? 'condo' : 'coop';
  return (
    <div className="type-mismatch" role="status">
      <p>
        <strong>{n} comp{n === 1 ? ' isn’t a' : 's aren’t'} {coop ? 'co-op' : 'condo'}{n === 1 ? '' : 's'}</strong>, and this report is a {coop ? 'co-op' : 'condo'}.
        Comps count like for like only, so {n === 1 ? 'it counts' : 'they count'} in nothing.
      </p>
      {!ws.readOnly && (
        <button type="button" className="btn" onClick={() => ws.setPropertyType(other)}>
          Make this report a {other === 'coop' ? 'co-op' : 'condo'}
        </button>
      )}
    </div>
  );
}
