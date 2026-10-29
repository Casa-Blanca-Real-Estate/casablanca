// StreetEasy links being read for Sort's comps (Dispatch 09): each pasted link
// shows "Reading…" until its page is read, then turns into a row in its group,
// to confirm. A read that failed says why, and offers to type the comp in.
import { useState } from 'react';
import { compRecordFromListing } from '../../../engine/index.ts';
import { linksApi, type LinkReadView } from '../../api.ts';
import { titleFromLink } from '../../../workspace/links.ts';
import { CompForm, type CompPrefill } from '../comp/CompForm.tsx';
import type { Workspace } from '../workspace/model.ts';
import { inFlight } from '../workspace/reads.ts';
import { ReadingNotice } from '../workspace/ReadingNotice.tsx';

function readTitle(r: LinkReadView): string {
  return titleFromLink(r.url) ?? r.url.replace(/^https:\/\//, '');
}

/** What a failed read's page did say: a start for typing it in, never a guess. */
function prefillFrom(r: LinkReadView): CompPrefill {
  const out: CompPrefill = { url: r.url };
  if (!r.extract) return out;
  try {
    const { record } = compRecordFromListing(r.extract, { as_of: r.asOf ?? new Date().toISOString().slice(0, 10), url: r.url });
    const street = record.identity.address.street;
    if (street) out.address = street;
    if (record.identity.unit.raw) out.unit = record.identity.unit.raw;
    if (record.status.listing_status) out.status = record.status.listing_status;
  } catch {
    // Nothing usable: the link is still a start.
  }
  return out;
}

export function Reads({ ws }: { ws: Workspace }) {
  const [typing, setTyping] = useState<{ readId: string; prefill: CompPrefill } | null>(null);
  const reads = ws.reads.filter((r) => r.purpose === 'comp');
  const pending = inFlight(reads);
  const failed = reads.filter((r) => r.status === 'failed');
  if (!pending.length && !failed.length) return null;
  return (
    <div className="so-reads panel">
      <ReadingNotice reads={pending} what="comps" />
      {pending.map((r) => (
        <div key={r.id} className="so-read" aria-busy="true">
          <span className="so-thumb" aria-hidden="true" />
          <strong>{readTitle(r)}</strong>
          {r.foundBy === 'hubert' && <span className="so-flag">Hubert’s find</span>}
          <span className="so-read-state">{r.status === 'queued' ? 'Waiting to read the page…' : 'Reading…'}</span>
        </div>
      ))}
      {failed.map((r) => (
        <div key={r.id} className="so-read-wrap">
          <div className="so-read failed">
            <span className="so-thumb" aria-hidden="true" />
            <strong>{readTitle(r)}</strong>
            <span className="so-read-state">{r.errorMessage ?? 'That page couldn’t be read.'}</span>
            {!ws.readOnly && (
              <span className="so-read-actions">
                <button type="button" className="link" onClick={() => setTyping({ readId: r.id, prefill: prefillFrom(r) })}>Type it in</button>
                <button
                  type="button"
                  className="link"
                  onClick={() => void ws.run('Clearing…', async () => ws.applyLinks(await linksApi.dismiss(ws.reportId, r.id)))}
                >
                  Clear
                </button>
              </span>
            )}
          </div>
          {typing?.readId === r.id && (
            <CompForm
              ws={ws}
              prefill={typing.prefill}
              onCancel={() => setTyping(null)}
              onDone={() => {
                setTyping(null);
                void linksApi.dismiss(ws.reportId, r.id).then(ws.applyLinks, () => undefined);
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
