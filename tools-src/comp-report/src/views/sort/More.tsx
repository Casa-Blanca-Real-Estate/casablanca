// What Sort's rows showed before the design port and agents still need, folded
// under the comp's card: Kara's checks (the engine's flags, §6.10), the
// distance and where it came from (Dispatch 11), where the comp came from,
// every fact with its source, the import's notes and the history of reasons.
import { useMemo } from 'react';
import type { CompOut, ParseWarning } from '../../../engine/index.ts';
import type { Distance } from '../../../workspace/distance.ts';
import { MAPPED_BY, type WorkspaceComp } from '../../../workspace/engine-input.ts';
import { isoDay, TIER_LABEL } from '../../../workspace/format.ts';
import { factLines, usualSource } from '../../../workspace/sort.ts';
import type { Workspace } from '../workspace/model.ts';

/** Where the comp came from, in a line. */
function originLine(c: WorkspaceComp): string {
  const o = c.record.origin;
  const on = o ? isoDay(o.as_of) : null;
  if (c.origin === 'listing') return `Read from its StreetEasy page${on ? ` on ${on}` : ''}${c.unconfirmed ? '; not confirmed yet' : ''}.`;
  if (c.origin === 'manual') return `Typed in${on ? ` on ${on}` : ''}.`;
  return `From StreetEasy’s export${o?.row ? `, row ${o.row}` : ''}${on ? `, pulled ${on}` : ''}.`;
}

function DistanceLine({ d }: { d: Distance }) {
  if (d.kind === 'same_building') return <p>Same building as the home.</p>;
  if (d.kind === 'miles') {
    return (
      <p>
        {d.label} from the home, from each building’s mapped location.
        {d.home && d.comp && <span className="so-more-mid"> Mapped by {MAPPED_BY}: the home as {d.home}; this comp as {d.comp}.</span>}
      </p>
    );
  }
  return <p className="so-more-mid">{d.why}</p>;
}

export function More({ ws, c, out, distance }: { ws: Workspace; c: WorkspaceComp; out: CompOut | undefined; distance: Distance | null }) {
  const j = c.judgment;
  const facts = useMemo(() => factLines(c.record), [c.record]);
  const usual = usualSource(facts);
  const checks = out?.checks ?? [];
  const flagged = checks.filter((k) => k.status === 'flagged');
  const unknown = checks.filter((k) => k.status === 'unknown' && !(distance && k.code === 'distance'));
  const notes: ParseWarning[] = c.origin === 'export'
    ? (ws.parsed.find((p) => p.importId === c.importId)?.parsed.warnings ?? []).filter((w) => w.row !== undefined && w.row === c.record.origin?.row)
    : c.origin === 'listing'
      ? ws.reads.find((r) => r.id === c.readId)?.warnings ?? []
      : [];
  const reasons = j?.reasons ?? [];

  return (
    <details className="so-more">
      <summary>Checks, sources and history</summary>
      <div className="so-more-body">
        {checks.length > 0 && (
          <section>
            <h5>Kara’s checks</h5>
            <ul>
              {flagged.map((k) => (
                <li key={k.code}>
                  <strong>{k.label}</strong>: {k.message}.{k.suggestion && <span className="so-more-deep"> Suggests {k.suggestion}.</span>}
                </li>
              ))}
              {flagged.length === 0 && <li className="so-more-mid">None flagged.</li>}
              {unknown.map((k) => <li key={k.code} className="so-more-mid">{k.message}.</li>)}
            </ul>
          </section>
        )}
        {distance && (
          <section>
            <h5>Distance</h5>
            <DistanceLine d={distance} />
          </section>
        )}
        <section>
          <h5>Where it came from</h5>
          <p>{originLine(c)}</p>
          {facts.length > 0 && (
            <table className="so-facts">
              <tbody>
                {facts.map((f) => (
                  <tr key={f.label}>
                    <th scope="row">{f.label}</th>
                    <td>{f.value}</td>
                    <td className="so-more-mid">{[f.from !== usual ? f.from : null, f.sureness || null].filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {notes.length > 0 && (
          <section>
            <h5>From the import</h5>
            <ul>{notes.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
          </section>
        )}
        {reasons.length > 0 && (
          <section>
            <h5>History</h5>
            <ol>
              {reasons.map((r, i) => (
                <li key={i}>
                  {TIER_LABEL[r.tier]} · {r.reason} <span className="so-more-mid">— {r.by}, {new Date(r.at).toLocaleString()}{r.sample ? ' · sample' : ''}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </details>
  );
}
