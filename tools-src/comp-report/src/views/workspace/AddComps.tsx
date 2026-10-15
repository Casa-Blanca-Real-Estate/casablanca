// Add comps (Dispatch 09; the handoff's New report 3 of 3, Dispatch 14): the
// rows under the paste bar, grouped by status — Sold, In contract, Active,
// Didn't sell — each with its price, $/ft (only when the home has a size), ✓ or
// Confirm, and ✎ to open the comp's form. Links still being read show
// "Reading…"; a read that failed says why, with "Type it in" and Clear.
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { compRecordFromListing, type CompOut, type ParseWarning } from '../../../engine/index.ts';
import { linksApi, workspaceApi, type LinkReadView } from '../../api.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { psf } from '../../../workspace/format.ts';
import { titleFromLink } from '../../../workspace/links.ts';
import { AddBar, useDropTarget } from '../comp/AddBar.tsx';
import { CompForm, type CompPrefill } from '../comp/CompForm.tsx';
import { compAddress, compPrice, compStatus, rowPsf, STATUS_LABEL, STATUS_ORDER } from './comps.tsx';
import type { Workspace } from './model.ts';
import { inFlight } from './reads.ts';
import '../../styles/newreport.css';

export const GUIDANCE = 'Same building first. Within a quarter mile. Sales from the last three to six months.';

/** What "type it in" starts from: a failed read's page, where it said anything. */
export type ManualPrefill = CompPrefill;

/**
 * The paste bar, the drop target and the reads, in one block (Sort's "+ Add
 * comps" before the port). The new-report modal lays these out itself.
 */
export function AddComps({ ws }: { ws: Workspace; open?: 'links' | 'export' | 'manual' }) {
  const [note, setNote] = useState<string | null>(null);
  const drop = useDropTarget(ws, setNote);
  if (ws.readOnly) return null;
  return (
    <div className="nr-addcomps" {...drop.handlers}>
      {drop.veil}
      <AddBar ws={ws} note={note} onNote={setNote} />
      <ReadRows ws={ws} />
    </div>
  );
}

/** "100 Barclay Street #17L", from the link, while its page is read. */
export function readTitle(r: LinkReadView): string {
  return titleFromLink(r.url) ?? r.url.replace(/^https:\/\//, '');
}

/** What a failed read's page did say: a start for typing it in, never a guess. */
export function prefillFrom(r: LinkReadView): ManualPrefill {
  const out: ManualPrefill = { url: r.url };
  if (r.extract) {
    try {
      const { record } = compRecordFromListing(r.extract, { as_of: r.asOf ?? new Date().toISOString().slice(0, 10), url: r.url });
      const street = record.identity.address.street;
      if (street) out.address = [street, record.identity.address.city, record.identity.address.state].filter(Boolean).join(', ');
      if (record.identity.unit.raw) out.unit = record.identity.unit.raw;
      if (record.status.listing_status) out.status = record.status.listing_status;
    } catch {
      // Nothing usable: the link is still a start.
    }
  }
  // The link's own name for it, when the page gave none.
  if (!out.address) {
    const title = titleFromLink(r.url);
    if (title) out.address = title;
  }
  return out;
}

/** Confirms a comp read from its page: until then it counts in neither result. */
export function ConfirmButton({ ws, c, className = 'btn small-btn primary', children = 'Confirm' }: {
  ws: Workspace;
  c: WorkspaceComp;
  className?: string;
  children?: ReactNode;
}) {
  if (!c.unconfirmed || !c.judgment) return null;
  const j = c.judgment;
  return (
    <button
      type="button"
      className={className}
      title="Check the row against the listing, then confirm: until then it counts in neither result"
      aria-label={`Confirm ${compAddress(c)}`}
      disabled={ws.readOnly || Boolean(ws.busy)}
      onClick={() => void ws.run('Confirming…', async () => ws.applyServer(await workspaceApi.confirm(ws.reportId, j.reportCompId)))}
    >
      {children}
    </button>
  );
}

/** Links still being read: "Reading…" until each row fills in. */
export function ReadingRows({ ws }: { ws: Workspace }) {
  const pending = inFlight(ws.reads.filter((r) => r.purpose === 'comp'));
  if (!pending.length) return null;
  return (
    <div className="nr-group" aria-label="Links being read">
      {pending.map((r) => (
        <div key={r.id} className="nr-row nr-read muted" aria-busy="true">
          <span className="nr-thumb" aria-hidden="true" />
          <span className="nr-addr">{readTitle(r)}</span>
          <span className="nr-act">Reading…</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Reads that failed: why, then "Type it in" (the comp's form, started from
 * what the page did say) and Clear. With `onTypeItIn`, the caller opens the
 * form; without it, it opens under the row.
 */
export function FailedReadRows({ ws, onTypeItIn }: { ws: Workspace; onTypeItIn?: (p: ManualPrefill) => void }) {
  const [typing, setTyping] = useState<string | null>(null);
  const failed = ws.reads.filter((r) => r.purpose === 'comp' && r.status === 'failed');
  if (!failed.length) return null;
  const clear = (r: LinkReadView) => ws.run('Clearing…', async () => ws.applyLinks(await linksApi.dismiss(ws.reportId, r.id)));
  return (
    <div className="nr-group" aria-label="Links that couldn’t be read">
      {failed.map((r) => (
        <Fragment key={r.id}>
          <div className="nr-row nr-read">
            <span className="nr-thumb" aria-hidden="true" />
            <span className="nr-read-text">
              <strong>{readTitle(r)}</strong>
              <span className="nr-why"> · {r.errorMessage ?? 'That page couldn’t be read.'}</span>
            </span>
            {!ws.readOnly && (
              <>
                <button
                  type="button"
                  className="nr-act nr-act-link"
                  aria-expanded={typing === r.id}
                  onClick={() => (onTypeItIn ? onTypeItIn(prefillFrom(r)) : setTyping(typing === r.id ? null : r.id))}
                >
                  Type it in
                </button>
                <button type="button" className="nr-act nr-act-quiet" disabled={Boolean(ws.busy)} onClick={() => void clear(r)}>Clear</button>
              </>
            )}
          </div>
          {typing === r.id && !onTypeItIn && (
            <div className="nr-row-form">
              <CompForm
                ws={ws}
                prefill={prefillFrom(r)}
                onCancel={() => setTyping(null)}
                onDone={() => {
                  setTyping(null);
                  // It's in the list now: the failed read has done its job.
                  void clear(r);
                }}
              />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

/** Rows for links still being read, and for reads that failed: why, and what to do next. */
export function ReadRows({ ws, onTypeItIn }: { ws: Workspace; onTypeItIn?: (p: ManualPrefill) => void }) {
  return (
    <>
      <ReadingRows ws={ws} />
      <FailedReadRows ws={ws} {...(onTypeItIn ? { onTypeItIn } : {})} />
    </>
  );
}

/** "$4.45M sale", "$6.95M ask", "$850K ask": the handoff's row prices. */
function priceLine(c: WorkspaceComp): string {
  const p = compPrice(c).value;
  if (!p) return '—';
  const short = p >= 1e6 ? `$${(p / 1e6).toFixed(2)}M` : `$${Math.round(p / 1e3).toLocaleString('en-US')}K`;
  return `${short} ${compStatus(c) === 'sold' ? 'sale' : 'ask'}`;
}

function CompLine({ ws, c, out, editing, onEdit, why }: {
  ws: Workspace;
  c: WorkspaceComp;
  out: CompOut | undefined;
  editing: boolean;
  onEdit: () => void;
  why?: string | null;
}) {
  const rate = ws.sf ? rowPsf(c, out) : null;
  const address = compAddress(c);
  return (
    <div className={`nr-row${ws.sf ? '' : ' nosf'}`}>
      <span className="nr-thumb" aria-hidden="true" />
      <span className="nr-addr" title={address}>
        {address}
        {why && <span className="nr-why"> · {why}</span>}
      </span>
      <span className="nr-price">{priceLine(c)}</span>
      {ws.sf && <span className="nr-psf">{rate !== null ? `${psf(rate)}/ft` : '—'}</span>}
      <span className="nr-act-cell">
        {c.unconfirmed
          ? <ConfirmButton ws={ws} c={c} className="nr-act nr-act-btn" />
          : <span className="nr-tick" title="In the report: nothing to confirm" aria-label="Nothing to confirm">✓</span>}
      </span>
      {ws.readOnly ? <span /> : (
        <button type="button" className="nr-edit" aria-label={`Edit ${address}`} aria-expanded={editing} onClick={onEdit}>
          <span aria-hidden="true">✎</span>
        </button>
      )}
    </div>
  );
}

/** The comps in the report by status, in the handoff's order, then any the engine can't sort; reads first and last. */
export function AddList({ ws }: { ws: Workspace }) {
  const [editing, setEditing] = useState<string | null>(null);
  const outById = useMemo(() => new Map<string, CompOut>((ws.output?.comps ?? []).map((c) => [c.id, c])), [ws.output]);
  const groups = STATUS_ORDER.map((s) => ({ s, list: ws.comps.filter((c) => compStatus(c) === s) })).filter((g) => g.list.length);
  const unknown = ws.comps.filter((c) => !compStatus(c));
  const anyReads = ws.reads.some((r) => r.purpose === 'comp' && (r.status === 'failed' || r.status === 'queued' || r.status === 'running'));
  if (!groups.length && !unknown.length && !anyReads) return null;

  const rows = (list: WorkspaceComp[], why?: (c: WorkspaceComp) => string | null) => list.map((c) => (
    <Fragment key={c.id}>
      <CompLine ws={ws} c={c} out={outById.get(c.id)} editing={editing === c.id} onEdit={() => setEditing(editing === c.id ? null : c.id)} why={why?.(c) ?? null} />
      {editing === c.id && (
        <div className="nr-row-form">
          <CompForm key={c.id} ws={ws} comp={c} onCancel={() => setEditing(null)} onDone={() => setEditing(null)} />
        </div>
      )}
    </Fragment>
  ));

  return (
    <div className="nr-rows">
      <ReadingRows ws={ws} />
      {groups.map((g) => (
        <section key={g.s} className="nr-group" aria-label={STATUS_LABEL[g.s]}>
          <h3 className="nr-group-h"><span className={`sq ${g.s}`} aria-hidden="true" />{STATUS_LABEL[g.s]}</h3>
          {rows(g.list)}
        </section>
      ))}
      {unknown.length > 0 && (
        <section className="nr-group" aria-label="Can’t be sorted">
          <h3 className="nr-group-h">Can’t be sorted</h3>
          {rows(unknown, (c) => c.unsortable)}
        </section>
      )}
      <FailedReadRows ws={ws} />
    </div>
  );
}

const WARNING_LABEL: Partial<Record<ParseWarning['code'], string>> = {
  approx_area: 'Approximate sizes',
  closing_record: 'Public-record closings',
  missing_column: 'Missing columns',
  unknown_column: 'Columns the parser doesn’t know',
  unreadable_value: 'Values it couldn’t read',
  missing_address: 'Rows without an address',
  unrecognised_status: 'Statuses it doesn’t know',
  duplicate_property: 'The same property twice',
  zero_price: 'Zero prices',
};

/** The import's notes, as a count that opens (`02-screens.md`: folded). */
export function ImportNotes({ ws }: { ws: Workspace }) {
  const warnings = ws.parsed.flatMap((p) => p.parsed.warnings);
  const groups = useMemo(() => {
    const m = new Map<string, ParseWarning[]>();
    for (const w of warnings) m.set(w.code, [...(m.get(w.code) ?? []), w]);
    return [...m.entries()];
  }, [warnings]);
  const unreadable = Object.values(ws.unreadable);
  if (!warnings.length && !unreadable.length) return null;
  return (
    <details className="import-notes nr-import-notes">
      <summary>{warnings.length} note{warnings.length === 1 ? '' : 's'} from the import</summary>
      {unreadable.map((u, i) => <p key={i} className="nr-note bad">This browser couldn’t read an export: {u}</p>)}
      <ul className="warnings">
        {groups.map(([code, list]) => (
          <li key={code}>
            <strong>{WARNING_LABEL[code as ParseWarning['code']] ?? code.replace(/_/g, ' ')}</strong> ({list.length})
            <ul>{list.map((w, i) => <li key={i} className="small">{w.row ? `Row ${w.row}: ` : ''}{w.message}</li>)}</ul>
          </li>
        ))}
      </ul>
    </details>
  );
}
