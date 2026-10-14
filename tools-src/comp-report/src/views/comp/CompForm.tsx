// One comp's form (the handoff, "Type one in" / "Edit comp", Dispatch 14):
// address, photo, status, price, size, floor, date, why it's a comp, tags and
// features. Shared by New report 3 of 3 and Sort. Save waits for a note and a
// tag; size shows only when the home has a size (no per-SF figure otherwise).
//
// A typed-in comp's facts are the agent's, so editing one sends it again (the
// same address is the same comp). A comp from the export or a link keeps its
// source's facts: only its note, tags and features change here.
import { useState, type FormEvent } from 'react';
import type { ListingStatus } from '../../../engine/index.ts';
import { workspaceApi } from '../../api.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { cleanFeatures, type Features } from '../../../workspace/features.ts';
import { noteOf } from '../../../workspace/state.ts';
import { compAddress, compPrice, compStatus, STATUS_LABEL, STATUS_ORDER } from '../workspace/comps.tsx';
import type { Workspace } from '../workspace/model.ts';
import { homeName } from '../workspace/screens.ts';
import { FeaturePicker, TagPicker } from './Pickers.tsx';
import '../../styles/compform.css';

/** Where a new comp's form starts: a failed read's page, or the paste bar's text. */
export interface CompPrefill {
  address?: string;
  unit?: string;
  url?: string;
  status?: ListingStatus;
}

/** "$4,250,000", "4.25M", "4.25", "850K" → dollars. Under 100 reads as millions, as agents write it. */
export function readPrice(text: string): number | null {
  const t = text.trim().replace(/[$,\s]/g, '').toLowerCase();
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?)(m|mm|k)?$/.exec(t);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2] === 'k') n *= 1e3;
  else if (m[2] === 'm' || m[2] === 'mm' || n < 100) n *= 1e6;
  return Math.round(n);
}

function readCount(text: string): number | null {
  const t = text.trim().replace(/[,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const show = (n: number | undefined | null) => (n === undefined || n === null ? '' : n.toLocaleString('en-US'));

interface Draft {
  address: string;
  status: ListingStatus;
  price: string;
  size: string;
  floor: string;
  date: string;
  note: string;
  tags: string[];
  features: Features;
}

function draftFrom(c: WorkspaceComp | null, prefill: CompPrefill | null): Draft {
  if (!c) {
    const addr = [prefill?.address?.trim(), prefill?.unit?.trim() ? (prefill.unit.trim().startsWith('#') ? prefill.unit.trim() : `#${prefill.unit.trim()}`) : '']
      .filter(Boolean).join(' ');
    return { address: addr, status: prefill?.status ?? 'sold', price: '', size: '', floor: '', date: '', note: '', tags: [], features: {} };
  }
  const f = c.record.facts;
  return {
    address: compAddress(c),
    status: compStatus(c) ?? 'sold',
    price: show(compPrice(c).value),
    size: show(f.area_sqft?.value),
    floor: f.floor ? String(f.floor.value) : '',
    date: f.status_date?.value ?? '',
    note: noteOf(c.judgment) ?? '',
    tags: c.judgment?.tags ?? [],
    features: cleanFeatures(c.judgment?.features ?? {}),
  };
}

export function CompForm({ ws, comp = null, prefill = null, hideAddress = false, onDone, onCancel }: {
  ws: Workspace;
  /** The comp being edited; none for a new one. */
  comp?: WorkspaceComp | null;
  prefill?: CompPrefill | null;
  /** The paste bar already holds the address being typed (the handoff's "typed" form). */
  hideAddress?: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(() => draftFrom(comp, prefill));
  const [error, setError] = useState<string | null>(null);
  const home = homeName(ws.intake, ws.report.title);
  const editing = Boolean(comp?.judgment);
  // A comp from the export or a link keeps its source's facts.
  const factsFixed = editing && comp!.judgment!.source.kind !== 'manual';
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const address = hideAddress ? (prefill?.address ?? '') : d.address;
  const missing = [!d.note.trim() && 'note', !d.tags.length && 'tag'].filter(Boolean);
  const need = missing.length ? 'Add a note and a tag to save' : !factsFixed && !address.trim() ? 'Add the address to save' : '';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (need || ws.busy) return;
    setError(null);
    const extra = { note: d.note.trim(), tags: d.tags, features: d.features };
    if (factsFixed) {
      await ws.run('Saving the comp…', async () => {
        await ws.editComp(comp!.judgment!.reportCompId, extra);
        onDone();
      });
      return;
    }
    const price = readPrice(d.price);
    if (d.price.trim() && price === null) return setError('The price reads as a number: $4,250,000 or 4.25M.');
    const size = readCount(d.size);
    if (ws.sf && d.size.trim() && !size) return setError('The size reads as square feet: 1,980.');
    const floor = readCount(d.floor);
    if (d.floor.trim() && floor === null) return setError('The floor reads as a number: 12.');
    // Editing a typed-in comp: what it was typed with, then the changes.
    const before = editing && comp!.judgment!.source.kind === 'manual' ? (comp!.judgment!.source.fields as Record<string, unknown>) : {};
    const manual: Record<string, unknown> = { ...before, status: d.status };
    if (!editing) manual.address = address.trim();
    if (prefill?.url && !editing) manual.url = prefill.url;
    for (const [k, v] of [['price', price], ['floor', floor], ['date', d.date || null]] as const) {
      if (v === null || v === '') delete manual[k];
      else manual[k] = v;
    }
    if (ws.sf) {
      if (size) manual.area_sqft = size;
      else delete manual.area_sqft;
    }
    await ws.run(editing ? 'Saving the comp…' : 'Adding the comp…', async () => {
      ws.applyServer(await workspaceApi.addManual(ws.reportId, manual, extra));
      onDone();
    });
  }

  return (
    <form className="comp-form" onSubmit={save} aria-label={editing ? 'Edit comp' : 'Type one in'}>
      <div className="cf-title">{editing ? 'Edit comp' : 'Type one in'}</div>
      {editing ? (
        <div className="cf-fixed"><strong>{d.address}</strong>{factsFixed && <span className="cf-hint"> · its facts are from {comp!.origin === 'export' ? 'the export' : 'its listing'}</span>}</div>
      ) : !hideAddress && (
        <label className="cf-field">
          <span className="fh">Address</span>
          <input className="cf-input" value={d.address} onChange={(e) => set('address', e.target.value)} placeholder="e.g. 66 Leonard St #12A" autoFocus />
        </label>
      )}
      <div className="cf-row">
        <button
          type="button"
          className="cf-photo"
          title="Photos aren’t in this version yet"
          onClick={() => ws.toast('Photos aren’t in this version yet.')}
        >
          + Photo
        </button>
        <div className="cf-status">
          <span className="fh">Status</span>
          <div className="chips" role="radiogroup" aria-label="Status">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={d.status === s}
                className={`chip cf-status-chip${d.status === s ? ' on' : ''}`}
                disabled={factsFixed}
                onClick={() => set('status', s)}
              >
                <span className={`sq ${s}`} aria-hidden="true" />{STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="cf-grid">
        <label className="cf-field">
          <span className="fh">Price</span>
          <input className="cf-input" inputMode="decimal" value={d.price} disabled={factsFixed} onChange={(e) => set('price', e.target.value)} placeholder="$4,250,000" />
        </label>
        {ws.sf && (
          <label className="cf-field">
            <span className="fh">Size (sq ft)</span>
            <input className="cf-input" inputMode="numeric" value={d.size} disabled={factsFixed} onChange={(e) => set('size', e.target.value)} placeholder="1,980" />
          </label>
        )}
        <label className="cf-field">
          <span className="fh">Floor</span>
          <input className="cf-input" inputMode="numeric" value={d.floor} disabled={factsFixed} onChange={(e) => set('floor', e.target.value)} placeholder="12" />
        </label>
        <label className="cf-field">
          <span className="fh">Date</span>
          <input className="cf-input" type="date" max={ws.today} value={d.date} disabled={factsFixed} onChange={(e) => set('date', e.target.value)} />
        </label>
      </div>
      <label className="cf-block">
        <span className="fh">Why it’s a comp</span>
        <textarea className="box cf-note" rows={2} maxLength={2000} value={d.note} onChange={(e) => set('note', e.target.value)} placeholder={`What makes it comparable to ${home}, or not`} />
      </label>
      <div className="cf-block">
        <span className="fh">Tags <span className="opt">(pick at least one)</span></span>
        <TagPicker value={d.tags} onChange={(v) => set('tags', v)} />
      </div>
      <div className="cf-block">
        <span className="fh">Features <span className="opt">(lavender outline: {home} has it too)</span></span>
        <FeaturePicker value={d.features} onChange={(v) => set('features', v)} home={ws.homeFeatures} />
      </div>
      {error && <p className="cf-error" role="alert">{error}</p>}
      <div className="cf-foot">
        <button type="button" className="link cf-cancel" onClick={onCancel}>Cancel</button>
        <span className="cf-need">{need}</span>
        <button className="btn primary cf-cta" disabled={Boolean(need) || Boolean(ws.busy)}>{editing ? 'Save' : 'Add comp'}</button>
      </div>
    </form>
  );
}
