// A comp's card, opened from its row (the handoff, screen 6): the photo area,
// the StreetEasy link, the facts, its features against the home's, its tags and
// the agent's note. ✎ Edit makes the features, tags and note editable, and a
// typed-in comp's facts too (an export's or a page's facts are its source's).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CompOut } from '../../../engine/index.ts';
import { workspaceApi, type CompEdit } from '../../api.ts';
import { compDistance } from '../../../workspace/distance.ts';
import { cleanFeatures, FEATURE_GROUPS, featuresFromRecord, sharedCount, TAGS, type Features } from '../../../workspace/features.ts';
import { psf } from '../../../workspace/format.ts';
import { readPrice } from '../comp/CompForm.tsx';
import { FeaturePicker } from '../comp/Pickers.tsx';
import { listingUrl } from '../workspace/comps.tsx';
import type { Workspace } from '../workspace/model.ts';
import { homeName } from '../workspace/screens.ts';
import { More } from './More.tsx';
import { countText, monthYear, PRICE_LABEL, shortPrice, sizeText, type Row } from './rows.ts';

/** The comp's features: the agent's, else what its source says (outdoor space, views, a doorman). */
export function compFeatures(row: Row): Features {
  const own = row.c.judgment?.features;
  return own && Object.keys(own).length ? cleanFeatures(own) : featuresFromRecord(row.c.record);
}

interface Draft {
  price: string;
  size: string;
  floor: string;
  date: string;
  note: string;
  tags: string[];
  features: Features;
}

const show = (n: number | null) => (n === null ? '' : n.toLocaleString('en-US'));

function readCount(text: string): number | null {
  const t = text.trim().replace(/[,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Metric({ label, value, input }: { label: string; value: string; input?: ReactNode }) {
  return (
    <div className="so-metric">
      <span className="so-metric-label">{label}</span>
      {input ?? <span className="so-metric-val">{value}</span>}
    </div>
  );
}

export function CompCard({ ws, row, out, id, onEditing }: {
  ws: Workspace;
  row: Row;
  out: CompOut | undefined;
  id: string;
  /** Told when the card goes into edit mode and out of it: the row stays open meanwhile. */
  onEditing?: (on: boolean) => void;
}) {
  const c = row.c;
  const j = c.judgment;
  const home = homeName(ws.intake, ws.report.title);
  const features = useMemo(() => compFeatures(row), [row]);
  const shared = sharedCount(ws.homeFeatures, features);
  const url = listingUrl(c);
  const canEdit = !ws.readOnly && Boolean(j) && row.group !== 'unsortable';
  // A typed-in comp's facts are the agent's; an export's or a page's are its source's.
  const manual = j?.source.kind === 'manual';
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = draft !== null;
  useEffect(() => {
    onEditing?.(editing);
  }, [editing, onEditing]);
  const homeId = ws.output?.subject.identity;
  const distance = useMemo(
    () => (homeId && row.group !== 'unsortable' ? compDistance(homeId, c.record.identity, out?.distance_miles ?? null, ws.locations, ws.geocodes) : null),
    [homeId, row.group, c.record.identity, out?.distance_miles, ws.locations, ws.geocodes],
  );

  // A 1st-tier comp the engine leaves out of both results says why, so it can be fixed.
  const counts = out ? out.per_result.on_facts.included || out.per_result.with_estimates.included : true;
  const why = row.tier === 'primary' && !c.unconfirmed && out && !counts
    ? [...new Set([...out.per_result.on_facts.not_included_because, ...out.per_result.with_estimates.not_included_because])].join('; ')
    : null;

  const initial = (): Draft => ({
    price: show(row.price),
    size: show(row.size),
    floor: row.floor === null ? '' : String(row.floor),
    date: row.date ?? '',
    note: row.note ?? '',
    tags: row.tags,
    features,
  });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function save() {
    if (!draft || !j) return;
    const start = initial();
    const edit: CompEdit = {};
    const note = draft.note.trim();
    if (note !== (row.note ?? '')) edit.note = note || null;
    if (!same(draft.tags, row.tags)) edit.tags = draft.tags;
    if (!same(cleanFeatures(draft.features), cleanFeatures(features))) edit.features = cleanFeatures(draft.features) as Record<string, string[]>;
    const factsChanged = manual && (['price', 'size', 'floor', 'date'] as const).some((k) => draft[k] !== start[k]);
    let fields: Record<string, unknown> | null = null;
    if (factsChanged) {
      const price = readPrice(draft.price);
      if (draft.price.trim() && price === null) return setError('The price reads as a number: $4,250,000 or 4.25M.');
      const size = readCount(draft.size);
      if (ws.sf && draft.size.trim() && !size) return setError('The size reads as square feet: 1,980.');
      const floor = readCount(draft.floor);
      if (draft.floor.trim() && floor === null) return setError('The floor reads as a number: 12.');
      fields = { ...(j.source.kind === 'manual' ? (j.source.fields as Record<string, unknown>) : {}) };
      for (const [k, v] of [['price', price], ['floor', floor], ['date', draft.date || null]] as const) {
        if (v === null || v === '') delete fields[k];
        else fields[k] = v;
      }
      if (ws.sf) {
        if (size) fields.area_sqft = size;
        else delete fields.area_sqft;
      }
    }
    setSaving(true);
    setError(null);
    try {
      if (fields) ws.applyServer(await workspaceApi.addManual(ws.reportId, fields));
      if (Object.keys(edit).length) await ws.editComp(j.reportCompId, edit);
      setDraft(null);
    } catch (e) {
      setError(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!j) return;
    setSaving(true);
    setError(null);
    try {
      await ws.editComp(j.reportCompId, { removed: true });
      ws.toast(`${row.address} is out of the report.`);
    } catch (e) {
      setError(`Not removed: ${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
    }
  }

  const factInput = (k: 'price' | 'size' | 'floor' | 'date', label: string) =>
    editing && manual ? (
      <input
        className="so-metric-input"
        aria-label={label}
        type={k === 'date' ? 'date' : 'text'}
        inputMode={k === 'price' ? 'decimal' : k === 'date' ? undefined : 'numeric'}
        max={k === 'date' ? ws.today : undefined}
        value={draft![k]}
        onChange={(e) => set(k, e.target.value)}
      />
    ) : undefined;

  const shownTags = editing ? draft!.tags : row.tags;

  return (
    <div className={`so-card${editing ? ' editing' : ''}`} id={id}>
      <div className="so-photo">
        {editing && <span className="so-photo-later">Photos aren’t in this version yet</span>}
      </div>
      <div className="so-card-main">
        <div className="so-card-top">
          <div className="so-util">
            {url && <a className="so-se" href={url} target="_blank" rel="noreferrer noopener">StreetEasy ↗</a>}
            {canEdit && !editing && (
              <button type="button" className="so-edit" onClick={() => { setError(null); setDraft(initial()); }}>
                <span className="so-pencil" aria-hidden="true">✎</span> Edit
              </button>
            )}
          </div>
          <div className="so-metrics">
            <Metric label={PRICE_LABEL[row.group]} value={shortPrice(row.price)} input={factInput('price', PRICE_LABEL[row.group])} />
            {ws.sf && <Metric label="$/SF" value={psf(row.ppsf)} />}
            {ws.sf && <Metric label="Size" value={sizeText(row)} input={factInput('size', 'Size')} />}
            <Metric label="Date" value={monthYear(row.date)} input={factInput('date', 'Date')} />
            <Metric label="Days on market" value={countText(row.dom)} />
            <Metric label="Floor" value={countText(row.floor)} input={factInput('floor', 'Floor')} />
            {distance?.kind === 'miles' && <Metric label="Distance" value={distance.label} />}
          </div>
          {editing && !manual && (
            <p className="so-fixed">Its facts are from {c.origin === 'export' ? 'StreetEasy’s export' : 'its StreetEasy page'}, so they stay as they are.</p>
          )}
        </div>

        <div className="so-features">
          <div className="so-features-head">
            <span className="so-features-title">Features</span>
            <span className="so-shared"><span className="so-shared-sq" aria-hidden="true" />{shared} shared with {home}</span>
          </div>
          {editing ? (
            <FeaturePicker value={draft!.features} onChange={(v) => set('features', v)} home={ws.homeFeatures} />
          ) : (
            FEATURE_GROUPS.map((g) => {
              const picked = features[g.key] ?? [];
              return (
                <div key={g.key} className="so-frow">
                  <span className="so-flabel">{g.label}</span>
                  <span className="so-fopts">
                    {picked.length
                      ? picked.map((o) => (
                        <span key={o} className={`so-fchip${ws.homeFeatures[g.key]?.includes(o) ? ' shared' : ''}`}>{o}</span>
                      ))
                      : <span className="so-fnone">—</span>}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {(shownTags.length > 0 || editing) && (
          <div className="so-tags" role={editing ? 'group' : undefined} aria-label={editing ? 'Tags' : undefined}>
            {shownTags.map((t) => (
              <span key={t} className="so-tag">
                {t}
                {editing && (
                  <button type="button" className="so-tag-x" aria-label={`Remove the tag ${t}`} onClick={() => set('tags', draft!.tags.filter((x) => x !== t))}>×</button>
                )}
              </span>
            ))}
            {editing && TAGS.filter((t) => !draft!.tags.includes(t)).map((t) => (
              <button key={t} type="button" className="so-tag-add" onClick={() => set('tags', [...draft!.tags, t])}>+ {t}</button>
            ))}
          </div>
        )}

        {editing ? (
          <textarea
            className="so-note-input"
            aria-label="Why it’s a comp"
            rows={3}
            maxLength={2000}
            value={draft!.note}
            placeholder={`What makes it comparable to ${home}, or not`}
            onChange={(e) => set('note', e.target.value)}
          />
        ) : (
          <p className={`so-note${row.note ? '' : ' empty'}`}>{row.note ?? (canEdit ? 'No note yet. Edit to say why it’s here.' : 'No note yet.')}</p>
        )}

        {why && <p className="so-why"><span className="so-why-sq" aria-hidden="true" />Doesn’t count yet: {why}.</p>}
        {error && <p className="so-error" role="alert">{error}</p>}
        {editing && (
          <div className="so-card-actions">
            <button type="button" className="link" onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
            <button type="button" className="link so-remove" onClick={() => void remove()} disabled={saving}>Remove from the report</button>
            <button type="button" className="btn primary so-save" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        )}

        <More ws={ws} c={c} out={out} distance={distance} />
      </div>
    </div>
  );
}
