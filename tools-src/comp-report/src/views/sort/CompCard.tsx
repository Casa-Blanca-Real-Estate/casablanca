// A comp's card, opened from its row (the handoff, screen 6): the photo area,
// the StreetEasy link, the facts, its features against the home's, its comp
// tags and the agent's note. ✎ Edit makes the features, tags and note
// editable, and a typed-in comp's facts too. An export's or a page's facts are
// its source's, each behind a lock: unlocking one corrects it (Dispatch 15,
// NW-044 a), and StreetEasy's value stays on record. The note can be written on
// its own, without Edit (NW-030); 🗑 takes the comp out, with Undo (NW-056).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CompOut } from '../../../engine/index.ts';
import { workspaceApi, type CompEdit } from '../../api.ts';
import { compDistance } from '../../../workspace/distance.ts';
import { cleanFeatures, FEATURE_GROUPS, featuresFromRecord, sharedCount, TAGS, type Features } from '../../../workspace/features.ts';
import { isoDay, psf } from '../../../workspace/format.ts';
import { OVERRIDE_KEYS, type OverrideKey } from '../../../workspace/state.ts';
import { readPrice } from '../comp/CompForm.tsx';
import { FeaturePicker } from '../comp/Pickers.tsx';
import { compPrice, listingUrl } from '../workspace/comps.tsx';
import type { Workspace } from '../workspace/model.ts';
import { homeName } from '../workspace/screens.ts';
import { More } from './More.tsx';
import { Info } from '../newcomp/Frame.tsx';
import { countText, monthYear, PRICE_LABEL, shortPrice, sizeText, TAG_INFO, type Row } from './rows.ts';

/** The comp's features: the agent's, else what its source says (outdoor space, views, a doorman). */
export function compFeatures(row: Row): Features {
  const own = row.c.judgment?.features;
  return own && Object.keys(own).length ? cleanFeatures(own) : featuresFromRecord(row.c.record);
}

/** Where the card opens to, from the row's "Needs …" links (NW-038). `n` changes on each ask. */
export interface CardStart {
  what: 'note' | 'tag';
  n: number;
}

interface Draft {
  price: string;
  size: string;
  floor: string;
  date: string;
  note: string;
  tags: string[];
  features: Features;
  /** An export's or a page's facts the agent unlocked to correct (a correction already saved starts unlocked). */
  unlocked: OverrideKey[];
}

const show = (n: number | null) => (n === null ? '' : n.toLocaleString('en-US'));

function readCount(text: string): number | null {
  const t = text.trim().replace(/[,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Metric({ label, value, input, mark }: { label: string; value: string; input?: ReactNode; mark?: ReactNode }) {
  return (
    <div className="so-metric">
      <span className="so-metric-label">{label}{mark}</span>
      {input ?? <span className="so-metric-val">{value}</span>}
    </div>
  );
}

export function CompCard({ ws, row, out, id, onEditing, start, collapseAsk = 0, onCollapse }: {
  ws: Workspace;
  row: Row;
  out: CompOut | undefined;
  id: string;
  /** Told when the card goes into edit mode (or the note editor opens) and out of it: the row stays open meanwhile. */
  onEditing?: (on: boolean) => void;
  /** Open at the note or the tags (the row's "Needs …" links). */
  start?: CardStart | null;
  /** Counts the row's collapse attempts while editing (NW-043): each one asks the card to leave edit mode. */
  collapseAsk?: number;
  /** The card is done editing and the row can close. */
  onCollapse?: () => void;
}) {
  const c = row.c;
  const j = c.judgment;
  const home = homeName(ws.intake, ws.report.title);
  const features = useMemo(() => compFeatures(row), [row]);
  const shared = sharedCount(ws.homeFeatures, features);
  const url = listingUrl(c);
  const canEdit = !ws.readOnly && Boolean(j) && row.group !== 'unsortable';
  // A typed-in comp's facts are the agent's; an export's or a page's are its source's, behind a lock.
  const manual = j?.source.kind === 'manual';
  const overrides = j?.factOverrides ?? {};
  const [draft, setDraft] = useState<Draft | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const editing = draft !== null;
  const busy = editing || noteDraft !== null;
  useEffect(() => {
    onEditing?.(busy);
  }, [busy, onEditing]);
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
    unlocked: OVERRIDE_KEYS.filter((k) => overrides[k]),
  });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const dirty = (draft !== null && !same(draft, initial())) || (noteDraft !== null && noteDraft.trim() !== (row.note ?? ''));

  // StreetEasy's value for a fact, before any correction: what a lock puts back.
  const source = c.original ?? c.record;
  const sourceText = (k: OverrideKey): string => {
    const f = source.facts;
    if (k === 'price') return show(compPrice({ ...c, record: source }).value);
    if (k === 'size') return show(f.area_sqft?.value ?? null);
    if (k === 'floor') return f.floor ? String(f.floor.value) : '';
    return f.status_date?.value ?? '';
  };
  const sourceShown = (k: OverrideKey): string => {
    const f = source.facts;
    if (k === 'price') return shortPrice(compPrice({ ...c, record: source }).value);
    if (k === 'size') return f.area_sqft ? Math.round(f.area_sqft.value).toLocaleString('en-US') : '—';
    if (k === 'floor') return countText(f.floor?.value ?? null);
    return monthYear(f.status_date?.value);
  };
  const fromWhere = c.origin === 'export'
    ? `From StreetEasy’s export${c.record.origin?.row ? `, row ${c.record.origin.row}` : ''}.`
    : `From its StreetEasy page${c.record.origin?.as_of ? `, read ${isoDay(c.record.origin.as_of)}` : ''}.`;

  // The row's "Needs note" and "Needs tags" open the card there.
  useEffect(() => {
    if (!start || !canEdit) return;
    if (start.what === 'note') {
      if (!draft) setNoteDraft((n) => n ?? row.note ?? '');
      requestAnimationFrame(() => {
        noteRef.current?.focus();
        noteRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    } else {
      if (!draft) {
        setNoteDraft(null);
        setError(null);
        setDraft(initial());
      }
      requestAnimationFrame(() => tagsRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }
    // Only a new ask moves the card, so the effect keys on its count alone.
  }, [start?.n]);

  // A collapse while editing (NW-043): with nothing changed, leave edit mode and close; otherwise ask.
  // The count the card opened with is an old ask.
  const askSeen = useRef(collapseAsk);
  useEffect(() => {
    if (collapseAsk === askSeen.current) return;
    askSeen.current = collapseAsk;
    if (!dirty) {
      setDraft(null);
      setNoteDraft(null);
      setAsking(false);
      onCollapse?.();
    } else {
      setAsking(true);
    }
  }, [collapseAsk]);

  /** The facts the agent corrected, as the server takes them; an error string when one doesn't read. */
  function corrections(d: Draft, start: Draft): CompEdit['factOverrides'] | string {
    const out: NonNullable<CompEdit['factOverrides']> = {};
    for (const k of OVERRIDE_KEYS) {
      const open = d.unlocked.includes(k);
      if (!open) {
        if (overrides[k]) out[k] = null; // locked again: StreetEasy's value comes back
        continue;
      }
      if (d[k] === start[k] && (overrides[k] || d[k] === sourceText(k))) continue;
      const text = d[k].trim();
      if (!text) {
        if (overrides[k]) out[k] = null;
        continue;
      }
      if (k === 'price') {
        const v = readPrice(text);
        if (v === null || v <= 0) return 'The price reads as a number: $4,250,000 or 4.25M.';
        out.price = v;
      } else if (k === 'size') {
        const v = readCount(text);
        if (!v || !Number.isInteger(v)) return 'The size reads as whole square feet: 1,980.';
        out.size = v;
      } else if (k === 'floor') {
        const v = Number(text);
        if (!Number.isInteger(v)) return 'The floor reads as a whole number: 12.';
        out.floor = v;
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text > ws.today) return 'The date is a day, and not in the future.';
        out.date = text;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }

  async function save(): Promise<boolean> {
    if (!draft || !j) return false;
    const start = initial();
    const edit: CompEdit = {};
    const note = draft.note.trim();
    if (note !== (row.note ?? '')) edit.note = note || null;
    if (!same(draft.tags, row.tags)) edit.tags = draft.tags;
    if (!same(cleanFeatures(draft.features), cleanFeatures(features))) edit.features = cleanFeatures(draft.features) as Record<string, string[]>;
    if (!manual) {
      const fixes = corrections(draft, start);
      if (typeof fixes === 'string') {
        setError(fixes);
        return false;
      }
      if (fixes) edit.factOverrides = fixes;
    }
    const factsChanged = manual && (['price', 'size', 'floor', 'date'] as const).some((k) => draft[k] !== start[k]);
    let fields: Record<string, unknown> | null = null;
    if (factsChanged) {
      const fail = (m: string) => {
        setError(m);
        return false;
      };
      const price = readPrice(draft.price);
      if (draft.price.trim() && price === null) return fail('The price reads as a number: $4,250,000 or 4.25M.');
      const size = readCount(draft.size);
      if (ws.sf && draft.size.trim() && !size) return fail('The size reads as square feet: 1,980.');
      const floor = readCount(draft.floor);
      if (draft.floor.trim() && floor === null) return fail('The floor reads as a number: 12.');
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
      return true;
    } catch (e) {
      setError(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveNote(): Promise<boolean> {
    if (noteDraft === null || !j) return false;
    const note = noteDraft.trim();
    if (note === (row.note ?? '')) {
      setNoteDraft(null);
      return true;
    }
    setSaving(true);
    setError(null);
    try {
      await ws.editComp(j.reportCompId, { note: note || null });
      setNoteDraft(null);
      return true;
    } catch (e) {
      setError(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Removing doesn't ask: the toast offers Undo, and the Removed fold puts it back later (NW-056).
  async function remove() {
    if (!j) return;
    const rcId = j.reportCompId;
    const wasAnchor = j.anchor;
    setSaving(true);
    setError(null);
    try {
      await ws.editComp(rcId, { removed: true });
      ws.toast(`${row.address} is out of the report.`, {
        label: 'Undo',
        run: () => {
          ws.editComp(rcId, { removed: false })
            .then(() => (wasAnchor ? ws.editComp(rcId, { anchor: true }) : undefined))
            .catch((e: unknown) => ws.toast(`Not put back: ${e instanceof Error ? e.message : String(e)}`));
        },
      });
    } catch (e) {
      setError(`Not removed: ${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
    }
  }

  const startEdit = () => {
    setError(null);
    setNoteDraft(null);
    setDraft(initial());
  };

  const factInput = (k: OverrideKey, label: string) => {
    if (!editing || (!manual && !draft!.unlocked.includes(k))) return undefined;
    return (
      <input
        className="so-metric-input"
        aria-label={label}
        type={k === 'date' ? 'date' : 'text'}
        inputMode={k === 'price' ? 'decimal' : k === 'date' ? undefined : 'numeric'}
        max={k === 'date' ? ws.today : undefined}
        value={draft![k]}
        onChange={(e) => set(k, e.target.value)}
      />
    );
  };

  /** The lock on a source fact in edit mode, or "changed" on a corrected one. */
  const factMark = (k: OverrideKey, label: string) => {
    if (manual) return null;
    if (editing) {
      const open = draft!.unlocked.includes(k);
      return (
        <button
          type="button"
          className={`so-lock${open ? ' open' : ''}`}
          aria-label={open ? `Lock ${label}: StreetEasy’s value comes back` : `Unlock ${label} to correct it`}
          aria-pressed={open}
          title={open
            ? `StreetEasy says ${sourceShown(k)}. Lock it to put that back.`
            : `${fromWhere} Unlock to correct it.`}
          onClick={() => setDraft((d) => {
            if (!d) return d;
            if (open) return { ...d, unlocked: d.unlocked.filter((x) => x !== k), [k]: sourceText(k) };
            return { ...d, unlocked: [...d.unlocked, k] };
          })}
        >
          {open ? '🔓' : '🔒'}
        </button>
      );
    }
    const o = overrides[k];
    return o ? (
      <span className="so-changed" title={`Changed by ${o.by}, ${isoDay(o.at.slice(0, 10))}. StreetEasy says ${sourceShown(k)}.`}>changed</span>
    ) : null;
  };

  const shownTags = editing ? draft!.tags : row.tags;
  const needs = new Set(row.needs);
  const sq = (on: boolean) => (on ? <span className="so-need-sq" aria-hidden="true" /> : null);

  return (
    <div className={`so-card${editing ? ' editing' : ''}`} id={id}>
      <div className="so-photo">
        {editing && <span className="so-photo-later">Photos aren’t in this version yet</span>}
      </div>
      <div className="so-card-main">
        {asking && (
          <div className="so-ask" role="alertdialog" aria-label="Save changes?">
            <span>Save changes?</span>
            <button
              type="button"
              className="link"
              disabled={saving}
              onClick={async () => {
                const ok = editing ? await save() : await saveNote();
                if (ok) {
                  setAsking(false);
                  onCollapse?.();
                }
              }}
            >
              Save
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              className="link"
              disabled={saving}
              onClick={() => {
                setDraft(null);
                setNoteDraft(null);
                setAsking(false);
                setError(null);
                onCollapse?.();
              }}
            >
              Discard
            </button>
          </div>
        )}
        <div className="so-card-top">
          <div className="so-util">
            {url && <a className="so-se" href={url} target="_blank" rel="noreferrer noopener">StreetEasy ↗</a>}
            {canEdit && !editing && (
              <button type="button" className="so-edit" onClick={startEdit}>
                <span className="so-pencil" aria-hidden="true">✎</span> Edit
              </button>
            )}
            {canEdit && (
              <button type="button" className="so-trash" aria-label="Remove from the report" title="Remove from the report" disabled={saving} onClick={() => void remove()}>
                🗑
              </button>
            )}
          </div>
          <div className="so-metrics">
            <Metric label={PRICE_LABEL[row.group]} value={shortPrice(row.price)} input={factInput('price', PRICE_LABEL[row.group])} mark={factMark('price', 'the price')} />
            {ws.sf && <Metric label="$/SF" value={psf(row.ppsf)} />}
            {ws.sf && <Metric label="Size" value={sizeText(row)} input={factInput('size', 'Size')} mark={factMark('size', 'the size')} />}
            <Metric label="Date" value={monthYear(row.date)} input={factInput('date', 'Date')} mark={factMark('date', 'the date')} />
            <Metric label="Days on market" value={countText(row.dom)} />
            <Metric label="Floor" value={countText(row.floor)} input={factInput('floor', 'Floor')} mark={factMark('floor', 'the floor')} />
            {distance?.kind === 'miles' && <Metric label="Distance" value={distance.label} />}
            {c.record.neighborhood && <Metric label="Neighborhood" value={c.record.neighborhood} />}
          </div>
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

        <div className="so-tagsec" ref={tagsRef}>
          <span className="so-features-title so-tagsec-title">{sq(needs.has('tag'))}Tags <Info text={TAG_INFO} label="What a tag is" align="left" /></span>
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
            {!editing && !shownTags.length && (canEdit
              ? <button type="button" className="link so-tag-start" onClick={startEdit}>+ Add tags</button>
              : <span className="so-fnone">None yet</span>)}
          </div>
        </div>

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
        ) : noteDraft !== null ? (
          <div className="so-note-edit">
            <textarea
              ref={noteRef}
              className="so-note-input"
              aria-label="Why it’s a comp"
              rows={3}
              maxLength={2000}
              value={noteDraft}
              placeholder={`What makes it comparable to ${home}, or not`}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <div className="so-card-actions">
              <button type="button" className="link" disabled={saving} onClick={() => { setNoteDraft(null); setAsking(false); setError(null); }}>Cancel</button>
              <button type="button" className="btn primary so-save" disabled={saving} onClick={() => void saveNote()}>{saving ? 'Saving…' : 'Save note'}</button>
            </div>
          </div>
        ) : row.note ? (
          <p className="so-note">
            {row.note}
            {canEdit && (
              <button type="button" className="so-note-pen" aria-label="Edit the note" title="Edit the note" onClick={() => { setError(null); setNoteDraft(row.note ?? ''); }}>
                <span className="so-pencil" aria-hidden="true">✎</span>
              </button>
            )}
          </p>
        ) : canEdit ? (
          <button type="button" className="so-note-add" onClick={() => { setError(null); setNoteDraft(''); }}>
            {sq(needs.has('note'))}+ Add a note
          </button>
        ) : (
          <p className="so-note empty">No note yet.</p>
        )}

        {why && <p className="so-why"><span className="so-why-sq" aria-hidden="true" />Doesn’t count yet: {why}.</p>}
        {error && <p className="so-error" role="alert">{error}</p>}
        {editing && (
          <div className="so-card-actions">
            <button type="button" className="link" onClick={() => { setDraft(null); setAsking(false); setError(null); }} disabled={saving}>Cancel</button>
            <button type="button" className="btn primary so-save" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        )}

        <More ws={ws} c={c} out={out} distance={distance} />
      </div>
    </div>
  );
}
