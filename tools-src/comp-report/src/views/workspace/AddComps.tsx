// Add comps (Dispatch 09; `02-screens.md`, New comp — 3): three ways in, one
// list. Paste StreetEasy links (each read in the background, its row filling in
// as the read finishes, then confirmed in one tap), drop StreetEasy's comps
// export, or type one in. The same bar sits at the top of Sort.
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { compRecordFromListing, parseExport, type CompOut, type ListingStatus, type ParseWarning } from '../../../engine/index.ts';
import { linksApi, workspaceApi, type LinkReadView } from '../../api.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { checkListingLink, MAX_LINKS_PER_REQUEST, titleFromLink } from '../../../workspace/links.ts';
import { CompFacts, compAddress, compStatus, Flags, listingUrl, ORIGIN_LABEL, STATUS_LABEL, STATUS_ORDER } from './comps.tsx';
import { toBase64, type Workspace } from './model.ts';
import { inFlight } from './reads.ts';

const MAX_EXPORT_BYTES = 2 * 1024 * 1024;

export const GUIDANCE = 'Same building first. Within a quarter mile. Sales from the last three to six months.';

type Way = 'links' | 'export' | 'manual';

/** What "type it in" starts from: a failed read's page, where it said anything. */
export interface ManualPrefill {
  address?: string;
  unit?: string;
  url?: string;
  status?: ListingStatus;
}

export function AddComps({ ws, open: initiallyOpen = 'links' }: { ws: Workspace; open?: Way }) {
  const [way, setWay] = useState<Way>(initiallyOpen);
  const [prefill, setPrefill] = useState<ManualPrefill | null>(null);
  if (ws.readOnly) return null;

  const typeItIn = (p: ManualPrefill) => {
    setPrefill(p);
    setWay('manual');
  };

  return (
    <div className="add-comps">
      <div className="segmented ways" role="tablist" aria-label="How to add comps">
        {([['links', 'Paste StreetEasy links'], ['export', 'Drop the export'], ['manual', 'Type one in']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={way === id} className={way === id ? 'on' : ''} onClick={() => setWay(id)}>
            {label}
          </button>
        ))}
      </div>
      {way === 'links' && <PasteLinks ws={ws} />}
      {way === 'export' && <DropExport ws={ws} />}
      {way === 'manual' && <TypeOneIn key={JSON.stringify(prefill)} ws={ws} prefill={prefill} onDone={() => setPrefill(null)} />}
      <ReadRows ws={ws} onTypeItIn={typeItIn} />
    </div>
  );
}

function PasteLinks({ ws }: { ws: Workspace }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ refused: { url: string; reason: string }[]; note: string | null } | null>(null);
  const lines = text.split(/\s+/).map((l) => l.trim()).filter(Boolean);
  const checked = lines.map((l) => ({ raw: l, check: checkListingLink(l) }));
  const good = [...new Set(checked.flatMap((c) => (c.check.ok ? [c.check.url] : [])))];
  const bad = checked.filter((c) => !c.check.ok);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!good.length) return;
    await ws.run(`Adding ${good.length} link${good.length === 1 ? '' : 's'}…`, async () => {
      const added = await linksApi.add(ws.reportId, good.slice(0, MAX_LINKS_PER_REQUEST));
      ws.applyLinks(added);
      const notes = [
        added.already.length ? `${added.already.length} already here` : null,
        added.limit.left <= 5 ? `${added.limit.left} of today’s ${added.limit.perDay} reads left` : null,
      ].filter(Boolean);
      setResult({ refused: [...bad.map((b) => ({ url: b.raw, reason: b.check.ok ? '' : b.check.reason })), ...added.refused], note: notes.join(' · ') || null });
      setText('');
    });
  }

  return (
    <form className="way" onSubmit={add}>
      <label className="field">
        <span className="field-label">StreetEasy links, one per line</span>
        <textarea
          aria-label="StreetEasy links, one per line"
          rows={4}
          value={text}
          placeholder={'https://streeteasy.com/building/200-chambers-street-new_york/10a\nhttps://streeteasy.com/building/5-franklin-place-new_york/14a'}
          onChange={(e) => setText(e.target.value)}
        />
        <span className="field-hint">
          Each link is read from its page in the background: its row fills in, and waits for you to check it and confirm.
        </span>
      </label>
      {bad.length > 0 && (
        <ul className="plain small refused">
          {bad.map((b, i) => <li key={i}><span className="muted">{b.raw}</span> — {b.check.ok ? '' : b.check.reason}</li>)}
        </ul>
      )}
      <div className="row wrap">
        <button className="btn primary" disabled={!good.length || Boolean(ws.busy) || good.length > MAX_LINKS_PER_REQUEST}>
          {good.length > 1 ? `Read ${good.length} links` : 'Read the link'}
        </button>
        {good.length > MAX_LINKS_PER_REQUEST && <span className="field-hint error">Up to {MAX_LINKS_PER_REQUEST} at a time.</span>}
      </div>
      {result && (result.refused.length > 0 || result.note) && (
        <div className="notice small" role="status">
          {result.note && <p className="muted">{result.note}</p>}
          {result.refused.length > 0 && (
            <ul className="plain">
              {result.refused.map((r, i) => <li key={i}><span className="muted">{r.url}</span> — {r.reason}</li>)}
            </ul>
          )}
        </div>
      )}
    </form>
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
    <details className="import-notes">
      <summary className="small">{warnings.length} note{warnings.length === 1 ? '' : 's'} from the import</summary>
      {unreadable.map((u, i) => <p key={i} className="notice error-notice small">This browser couldn’t read an export: {u}</p>)}
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

function DropExport({ ws }: { ws: Workspace }) {
  const [pulled, setPulled] = useState(ws.today);
  const [fileError, setFileError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setFileError(null);
    if (file.size > MAX_EXPORT_BYTES) {
      setFileError('That file is larger than a StreetEasy export should be (2 MB).');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const parsed = parseExport(bytes, { as_of: pulled, filename: file.name });
      if (!parsed.comps.length) {
        setFileError('That export has no comps in it.');
        return;
      }
    } catch (e) {
      setFileError(`That file couldn’t be read as a StreetEasy export: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    await ws.run(`Adding ${file.name}…`, async () => {
      ws.applyServer(await workspaceApi.importFile(ws.reportId, { filename: file.name, contentBase64: toBase64(bytes), asOf: pulled }));
    });
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="way">
      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
      >
        <label className="field">
          <span className="field-label">StreetEasy’s comps export (CSV or XLSX)</span>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={Boolean(ws.busy)}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <span className="field-hint">Or drop the file here.</span>
        </label>
        <label className="field">
          <span className="field-label">Pulled on</span>
          <input type="date" value={pulled} max={ws.today} onChange={(e) => setPulled(e.target.value || ws.today)} />
          <span className="field-hint">The day you downloaded it: what the export says is true as of then.</span>
        </label>
      </div>
      {fileError && <p className="notice error-notice" role="alert">{fileError}</p>}
    </div>
  );
}

const DATE_LABEL: Record<ListingStatus, string> = {
  sold: 'Sold on', in_contract: 'Went into contract on', active: 'Listed on', off_market: 'Came off the market on',
};

function TypeOneIn({ ws, prefill, onDone }: { ws: Workspace; prefill: ManualPrefill | null; onDone: () => void }) {
  const [f, setF] = useState({
    address: prefill?.address ?? '', unit: prefill?.unit ?? '', url: prefill?.url ?? '', status: (prefill?.status ?? 'sold') as ListingStatus,
    price: '', date: '', size: '', sizeEstimate: false, floor: '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function add(e: FormEvent) {
    e.preventDefault();
    const manual: Record<string, unknown> = { address: f.address.trim(), status: f.status };
    if (f.unit.trim()) manual.unit = f.unit.trim();
    if (f.url.trim()) manual.url = f.url.trim();
    if (f.price.trim()) manual.price = f.price.trim();
    if (f.date) manual.date = f.date;
    if (f.size.trim()) manual.area_sqft = f.sizeEstimate ? { value: f.size.trim(), estimate: true } : f.size.trim();
    if (f.floor.trim()) manual.floor = f.floor.trim();
    await ws.run('Adding the comp…', async () => {
      ws.applyServer(await workspaceApi.addManual(ws.reportId, manual));
      setF({ ...f, address: '', unit: '', url: '', price: '', date: '', size: '', sizeEstimate: false, floor: '' });
      onDone();
    });
  }

  return (
    <form className="way" onSubmit={add}>
      <div className="grid">
        <label className="field wide">
          <span className="field-label">Address</span>
          <input required value={f.address} onChange={set('address')} placeholder="e.g. 88 Greenwich Street, New York, NY" />
        </label>
        <label className="field">
          <span className="field-label">Unit</span>
          <input value={f.unit} onChange={set('unit')} placeholder="#602" />
        </label>
        <label className="field">
          <span className="field-label">Status</span>
          <select value={f.status} onChange={set('status')}>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{f.status === 'sold' ? 'Sale price' : 'Last asking price'}</span>
          <span className="input-wrap"><span className="input-prefix">$</span><input inputMode="numeric" value={f.price} onChange={set('price')} /></span>
        </label>
        <label className="field">
          <span className="field-label">{DATE_LABEL[f.status]}</span>
          <input type="date" value={f.date} max={ws.today} onChange={set('date')} />
        </label>
        <div className="field">
          <span className="field-label">Interior size (sq ft)</span>
          <input aria-label="Interior size in square feet" inputMode="numeric" value={f.size} onChange={set('size')} />
          <label className="check">
            <input type="checkbox" checked={f.sizeEstimate} disabled={!f.size.trim()} onChange={(e) => setF({ ...f, sizeEstimate: e.target.checked })} />
            My estimate
          </label>
        </div>
        <label className="field">
          <span className="field-label">Floor</span>
          <input inputMode="numeric" value={f.floor} onChange={set('floor')} />
        </label>
        <label className="field wide">
          <span className="field-label">Its StreetEasy link, if it has one</span>
          <input value={f.url} onChange={set('url')} placeholder="Optional" />
        </label>
      </div>
      <button className="btn primary" disabled={!f.address.trim() || Boolean(ws.busy)}>Add the comp</button>
    </form>
  );
}

/** "100 Barclay Street #17L", from the link, while its page is read. */
export function readTitle(r: LinkReadView): string {
  return titleFromLink(r.url) ?? r.url.replace(/^https:\/\//, '');
}

/** Rows for links still being read, and for reads that failed: why, and what to do next. */
export function ReadRows({ ws, onTypeItIn }: { ws: Workspace; onTypeItIn?: (p: ManualPrefill) => void }) {
  const reads = ws.reads.filter((r) => r.purpose === 'comp');
  const pending = inFlight(reads);
  const failed = reads.filter((r) => r.status === 'failed');
  if (!pending.length && !failed.length) return null;
  return (
    <div className="reads">
      {pending.length > 0 && (
        <ul className="list" aria-label="Links being read">
          {pending.map((r) => (
            <li key={r.id} className="comp-row reading" aria-busy="true">
              <span className="row-main">
                <strong>{readTitle(r)}</strong>
                <span className="muted small">{r.status === 'queued' ? 'Waiting to read the page…' : 'Reading the page…'}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {failed.length > 0 && (
        <ul className="list" aria-label="Links that couldn’t be read">
          {failed.map((r) => (
            <li key={r.id} className="comp-row failed">
              <span className="row-main">
                <strong>{readTitle(r)}</strong>
                <span className="small">{r.errorMessage ?? 'That page couldn’t be read.'}</span>
              </span>
              {!ws.readOnly && (
                <span className="row-actions">
                  {onTypeItIn && (
                    <button type="button" className="btn small-btn" onClick={() => onTypeItIn(prefillFrom(r))}>Type it in</button>
                  )}
                  <button
                    type="button"
                    className="link small"
                    onClick={() => void ws.run('Clearing…', async () => ws.applyLinks(await linksApi.dismiss(ws.reportId, r.id)))}
                  >
                    Clear
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What a failed read's page did say: a start for typing it in, never a guess. */
function prefillFrom(r: LinkReadView): ManualPrefill {
  const out: ManualPrefill = { url: r.url };
  if (!r.extract) return out;
  try {
    const { record } = compRecordFromListing(r.extract, { as_of: r.asOf ?? new Date().toISOString().slice(0, 10), url: r.url });
    const street = record.identity.address.street;
    if (street) out.address = [street, record.identity.address.city, record.identity.address.state].filter(Boolean).join(', ');
    if (record.identity.unit.raw) out.unit = record.identity.unit.raw;
    if (record.status.listing_status) out.status = record.status.listing_status;
  } catch {
    // Nothing usable: the link is still a start.
  }
  return out;
}

export function ConfirmButton({ ws, c }: { ws: Workspace; c: WorkspaceComp }) {
  if (!c.unconfirmed || !c.judgment) return null;
  const j = c.judgment;
  return (
    <button
      type="button"
      className="btn small-btn primary"
      title="Check the row against the listing, then confirm: until then it counts in neither result"
      disabled={ws.readOnly || Boolean(ws.busy)}
      onClick={() => void ws.run('Confirming…', async () => ws.applyServer(await workspaceApi.confirm(ws.reportId, j.reportCompId)))}
    >
      Confirm
    </button>
  );
}

/** One comp in the add-comps list: address, where it came from, price, size, $/sq ft; confirm if it was read from a page. */
export function CompRow({ ws, c, out }: { ws: Workspace; c: WorkspaceComp; out: CompOut | undefined }) {
  const url = listingUrl(c);
  return (
    <li className={`comp-row${c.unconfirmed ? ' unconfirmed' : ''}`}>
      <span className="row-main">
        <span className="row-title">
          {url ? <a href={url} target="_blank" rel="noreferrer noopener"><strong>{compAddress(c)}</strong> ↗</a> : <strong>{compAddress(c)}</strong>}
          <span className="tag">{ORIGIN_LABEL[c.origin]}</span>
          {c.unconfirmed && <span className="tag tag-estimate" title="Read from the page: confirm it to count it">To confirm</span>}
        </span>
        <CompFacts c={c} out={out} />
        <Flags c={c} out={out} />
        {c.unsortable && <span className="muted small">{c.unsortable}</span>}
      </span>
      <span className="row-actions"><ConfirmButton ws={ws} c={c} /></span>
    </li>
  );
}

/** The list, grouped by status, each group against Kara's "about three each". */
export function CompList({ ws }: { ws: Workspace }) {
  const outById = useMemo(() => new Map<string, CompOut>((ws.output?.comps ?? []).map((c) => [c.id, c])), [ws.output]);
  const byStatus = new Map<ListingStatus | 'unknown', WorkspaceComp[]>();
  for (const c of ws.comps) {
    const s = compStatus(c) ?? 'unknown';
    byStatus.set(s, [...(byStatus.get(s) ?? []), c]);
  }
  const unknown = byStatus.get('unknown') ?? [];
  const toConfirm = ws.comps.filter((c) => c.unconfirmed).length;
  return (
    <div className="comp-list">
      {toConfirm > 0 && <p className="small"><strong>{toConfirm} to confirm.</strong> Check each against its listing: a page can be misread.</p>}
      {STATUS_ORDER.map((s) => {
        const list = byStatus.get(s) ?? [];
        return (
          <section key={s} className="status-group" aria-label={STATUS_LABEL[s]}>
            <h4>
              {STATUS_LABEL[s]} <span className="muted">· {list.length}{list.length < 3 ? ' of about 3' : ''}</span>
            </h4>
            {list.length === 0
              ? <p className="muted small">None yet.</p>
              : <ul className="list">{list.map((c) => <CompRow key={c.id} ws={ws} c={c} out={outById.get(c.id)} />)}</ul>}
          </section>
        );
      })}
      {unknown.length > 0 && (
        <section className="status-group">
          <h4>Can’t be sorted <span className="muted">· {unknown.length}</span></h4>
          <ul className="list">{unknown.map((c) => <CompRow key={c.id} ws={ws} c={c} out={outById.get(c.id)} />)}</ul>
        </section>
      )}
      <ImportNotes ws={ws} />
    </div>
  );
}
