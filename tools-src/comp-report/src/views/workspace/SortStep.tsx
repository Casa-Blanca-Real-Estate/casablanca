// Sort (`02-screens.md`): one compact row per comp, grouped by status. A row is
// the comp at a glance, and takes the agent's two decisions: the tier, as three
// choices (D-20), and a note on how it differs from the home, which is also the
// tier's reason (§3). Reasons are append-only (§12): a tier or a changed note
// records a new one. Opening a row counts as reviewing it; it shows every fact
// with where it came from, the import's notes, the history, and the star for
// the closest comp (the anchor). Each row has its distance from the home, from
// each building's mapped location (Dispatch 11); the opened row says where it
// came from, or why there's none yet. The range stays hidden until the agent's
// number (D-1). Comps are added from the bar at the top, the same three ways as
// the new-comp modal.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { CompOut, ListingStatus, ParseWarning, Tier } from '../../../engine/index.ts';
import { workspaceApi, type WorkspaceData } from '../../api.ts';
import { compDistance, type Distance } from '../../../workspace/distance.ts';
import { MAPPED_BY, type WorkspaceComp } from '../../../workspace/engine-input.ts';
import { isoDay, TIER_LABEL } from '../../../workspace/format.ts';
import { addToNote, factLines, noteChips, usualSource } from '../../../workspace/sort.ts';
import { AddComps, ConfirmButton, ReadRows } from './AddComps.tsx';
import { BuildNote, DecisionTag, SampleTag, StubTag } from './bits.tsx';
import { CompFacts, compAddress, compStatus, Flags, listingUrl, STATUS_LABEL, STATUS_ORDER } from './comps.tsx';
import type { StepProps, Workspace } from './model.ts';

const TIERS: Tier[] = ['primary', 'secondary', 'excluded'];

/** A note typed before its comp has a tier: kept while the agent moves between screens. */
const unsaved = new Map<string, string>();

type Save = (work: () => Promise<WorkspaceData>) => Promise<void>;

/**
 * The rows' saves go one at a time, so the whole workspace each one returns
 * lands in the order the changes were made.
 */
function useSaveQueue(ws: Workspace): Save {
  const chain = useRef<Promise<void>>(Promise.resolve());
  const apply = useRef(ws.applyServer);
  apply.current = ws.applyServer;
  return (work) => {
    const next = chain.current.then(async () => {
      apply.current(await work());
    });
    chain.current = next.catch(() => undefined);
    return next;
  };
}

export function SortStep({ ws }: StepProps) {
  const outById = useMemo(() => new Map<string, CompOut>((ws.output?.comps ?? []).map((c) => [c.id, c])), [ws.output]);
  const save = useSaveQueue(ws);
  // Open while there's nothing to sort; after that, only when the agent opens it.
  const [addingChoice, setAdding] = useState<boolean | null>(null);
  const adding = addingChoice ?? ws.comps.length === 0;
  const groups = useMemo(() => {
    const by = new Map<ListingStatus | 'unknown', WorkspaceComp[]>();
    for (const c of ws.comps) {
      const s = c.unsortable ? 'unknown' : compStatus(c) ?? 'unknown';
      by.set(s, [...(by.get(s) ?? []), c]);
    }
    return [...STATUS_ORDER, 'unknown' as const].map((s) => ({ status: s, comps: by.get(s) ?? [] })).filter((g) => g.comps.length);
  }, [ws.comps]);

  const addBar = !ws.readOnly && (
    <div className="sort-add">
      <button type="button" className="btn small-btn" aria-expanded={adding} onClick={() => setAdding(!adding)}>
        {adding ? 'Close adding comps' : 'Add comps'}
      </button>
      {adding ? <AddComps ws={ws} /> : <ReadRows ws={ws} />}
    </div>
  );

  if (!ws.comps.length) {
    return (
      <div className="sort">
        {addBar}
        <p className="muted">No comps yet. Paste StreetEasy links, drop StreetEasy’s export, or type one in.</p>
      </div>
    );
  }

  const count = (t: Tier | null) => ws.comps.filter((c) => !c.unsortable && (c.judgment?.tier ?? null) === t).length;
  const notSorted = count(null);
  const toConfirm = ws.comps.filter((c) => c.unconfirmed).length;

  return (
    <div className="sort">
      {addBar}
      <p className="summary-line">
        {ws.comps.length} comps: {count('primary')} primary, {count('secondary')} secondary, {count('excluded')} excluded
        {notSorted > 0 && <>, <strong>{notSorted} not sorted</strong></>}
        {toConfirm > 0 && <> · <strong>{toConfirm} to confirm</strong></>}
      </p>
      <p className="muted small">
        {ws.revealed
          ? 'The range above moves as you change tiers.'
          : 'The range stays hidden while you sort, so the sorting can’t chase the number. It shows once you give your number on Findings.'}{' '}
        Only primary comps count, and the tool never sorts one for you. <DecisionTag id="D-1" />
      </p>
      {groups.map((g) => (
        <section key={g.status} className="status-group" aria-label={g.status === 'unknown' ? 'Can’t be sorted' : STATUS_LABEL[g.status]}>
          <h4>{g.status === 'unknown' ? 'Can’t be sorted' : STATUS_LABEL[g.status]} <span className="muted">· {g.comps.length}</span></h4>
          {g.status === 'off_market' && (
            <p className="muted small">Listings that came off the market unsold: their last asks are a ceiling on what buyers would pay.</p>
          )}
          <ul className="list">
            {g.comps.map((c) => <CompRow key={c.id} ws={ws} c={c} out={outById.get(c.id)} save={save} />)}
          </ul>
        </section>
      ))}
      <BuildNote>
        Kara’s checks are the engine’s <code>comps[].checks</code> (§6.10): flags with their suggested tier, whose labels lead the chips; the
        other chips word what else the engine compared. <StubTag>Waits on D-12</StubTag> Jev’s tier suggestions (§7). <StubTag>CR-3</StubTag> Undo,
        redo and versions.
      </BuildNote>
    </div>
  );
}

/** Keeps the focus in the note while a tier or a chip is clicked, so the note isn't saved twice. */
const keepFocus = (e: MouseEvent) => e.preventDefault();

function CompRow({ ws, c, out, save }: { ws: Workspace; c: WorkspaceComp; out: CompOut | undefined; save: Save }) {
  const j = c.judgment;
  const id = j?.reportCompId ?? c.id;
  const latest = j?.reasons.at(-1) ?? null;
  const address = compAddress(c);
  const url = listingUrl(c);
  const detailsId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraftState] = useState(() => unsaved.get(id) ?? latest?.reason ?? '');
  const draftRef = useRef(draft);
  // True while the note holds something the server doesn't have yet.
  const dirty = useRef(unsaved.has(id));
  // A tier picked with no note yet: it saves with the note.
  const [pending, setPending] = useState<Tier | null>(null);
  const [savingTier, setSavingTier] = useState<Tier | null>(null);
  const [status, setStatus] = useState<{ kind: 'saving' | 'error' | 'hint'; text: string } | null>(null);
  const lastSaved = useRef(latest ? `${latest.tier}\n${latest.reason}` : null);

  // The latest reason from the server (a save, the sample) shows unless the agent is mid-note.
  useEffect(() => {
    if (latest) lastSaved.current = `${latest.tier}\n${latest.reason}`;
    if (!dirty.current && latest) {
      draftRef.current = latest.reason;
      setDraftState(latest.reason);
    }
  }, [latest?.tier, latest?.reason]);

  // The note grows with what's in it, so a wrapped line never hides.
  useLayoutEffect(() => {
    const el = noteRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    }
  }, [draft]);

  const off = ws.readOnly || Boolean(ws.busy);
  const tierShown = savingTier ?? pending ?? j?.tier ?? null;
  const chips = useMemo(
    () => (out && ws.output ? noteChips(out, c.record, ws.output.subject, draft) : []),
    [out, ws.output, c.record, draft],
  );
  const home = ws.output?.subject.identity;
  const distance = useMemo(
    () => (home && !c.unsortable ? compDistance(home, c.record.identity, out?.distance_miles ?? null, ws.locations, ws.geocodes) : null),
    [home, c.unsortable, c.record.identity, out?.distance_miles, ws.locations, ws.geocodes],
  );

  function setDraft(v: string) {
    draftRef.current = v;
    dirty.current = true;
    setDraftState(v);
    if (!j?.tier) unsaved.set(id, v);
  }

  async function record(tier: Tier, note: string) {
    if (!j) return;
    const key = `${tier}\n${note}`;
    setPending(null);
    if (key === lastSaved.current) {
      if (draftRef.current.trim() === note) dirty.current = false;
      return;
    }
    lastSaved.current = key;
    setSavingTier(tier);
    setStatus({ kind: 'saving', text: 'Saving…' });
    try {
      await save(() => workspaceApi.tier(ws.reportId, j.reportCompId, tier, note, 'property'));
      if (draftRef.current.trim() === note) dirty.current = false;
      unsaved.delete(id);
      setStatus(null);
    } catch (e) {
      lastSaved.current = latest ? `${latest.tier}\n${latest.reason}` : null;
      setStatus({ kind: 'error', text: `Not saved: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSavingTier(null);
    }
  }

  function pickTier(tier: Tier) {
    if (!j || off) return;
    const note = draftRef.current.trim();
    if (note) {
      void record(tier, note);
      return;
    }
    setPending(tier);
    setStatus({ kind: 'hint', text: `Add a note to keep it ${TIER_LABEL[tier].toLowerCase()}: how does it differ from the home?` });
    noteRef.current?.focus();
  }

  function leaveNote() {
    if (!j || ws.readOnly) return;
    const note = draftRef.current.trim();
    if (!note) {
      if (latest) {
        draftRef.current = latest.reason;
        setDraftState(latest.reason);
        dirty.current = false;
        setStatus({ kind: 'hint', text: 'A sorted comp keeps a note, so its last one stays.' });
      } else if (pending) {
        setPending(null);
        setStatus({ kind: 'hint', text: 'Not sorted yet: a tier needs a note.' });
      }
      return;
    }
    const tier = pending ?? j.tier;
    if (tier) void record(tier, note);
    else setStatus({ kind: 'hint', text: 'Pick Primary, Secondary or Excluded to save the note.' });
  }

  // Enter saves the note; Shift+Enter starts a new line.
  function enterSaves(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }

  function takeChip(chip: string) {
    const next = addToNote(draftRef.current, chip);
    setDraft(next);
    const el = noteRef.current;
    if (el) {
      el.focus();
      requestAnimationFrame(() => el.setSelectionRange(next.length, next.length));
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    // Opening a row is reviewing it. Nothing waits on the mark, and a failed one is made again next time.
    if (next && j && !j.reviewedAt && !ws.readOnly) {
      save(() => workspaceApi.mark(ws.reportId, j.reportCompId, { reviewed: true })).catch(() => undefined);
    }
  }

  async function star() {
    if (!j) return;
    setStatus({ kind: 'saving', text: 'Saving…' });
    try {
      await save(() => workspaceApi.mark(ws.reportId, j.reportCompId, { anchor: !j.anchor }));
      setStatus(null);
    } catch (e) {
      setStatus({ kind: 'error', text: `Not saved: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  // A primary comp that counts in neither result says why, so it can be fixed.
  const counts = out ? out.per_result.on_facts.included || out.per_result.with_estimates.included : true;
  const why = j?.tier === 'primary' && !c.unconfirmed && out && !counts
    ? [...new Set([...out.per_result.on_facts.not_included_because, ...out.per_result.with_estimates.not_included_because])].join('; ')
    : null;
  const canAnchor = compStatus(c) === 'sold' && j?.tier === 'primary';

  return (
    <li className={`comp-card tier-${tierShown ?? 'none'}${open ? ' open' : ''}`}>
      <div className="comp-line">
        <button
          type="button"
          className="row-toggle"
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={`${open ? 'Close' : 'Open'} ${address}`}
          title={open ? 'Close' : 'Every fact and where it came from, the history, and the star for the closest comp'}
          onClick={toggle}
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        <div className="comp-main">
          <div className="comp-head">
            {url
              ? <a className="comp-address" href={url} target="_blank" rel="noreferrer noopener">{address} <span aria-hidden="true">↗</span></a>
              : <strong className="comp-address">{address}</strong>}
            <RowDistance d={distance} />
            {j?.anchor && <span className="star on" title="The closest comp (the anchor)">★ Closest</span>}
            {c.unconfirmed && <span className="tag tag-estimate" title="Read from its StreetEasy page: confirm it to count it">To confirm</span>}
            {ws.readOnly && <span className={`pill tier ${j?.tier ?? 'none'}`}>{j?.tier ? TIER_LABEL[j.tier] : 'Not sorted'}</span>}
          </div>
          <CompFacts c={c} out={out} />
          <Flags c={c} out={out} />
        </div>
      </div>

      {c.unsortable && <p className="muted small">{c.unsortable}</p>}
      {c.unconfirmed && (
        <p className="row wrap small">
          <span>Read from its StreetEasy page. Check it against the listing, then confirm: until then it counts in neither result.</span>
          <ConfirmButton ws={ws} c={c} />
        </p>
      )}
      {why && <p className="muted small">Doesn’t count yet: {why}.</p>}

      {j && !ws.readOnly && !c.unsortable && (
        <div className="sort-controls">
          <div className="segmented tiers" role="radiogroup" aria-label={`Tier for ${address}`}>
            {TIERS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tierShown === t}
                className={`${tierShown === t ? 'on' : ''}${pending === t ? ' pending' : ''}`}
                disabled={off || Boolean(savingTier)}
                onMouseDown={keepFocus}
                onClick={() => pickTier(t)}
              >
                {TIER_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="note">
            <textarea
              ref={noteRef}
              className="note-input"
              aria-label={`Notes on ${address}`}
              rows={1}
              maxLength={1000}
              value={draft}
              placeholder="How it differs from the home"
              readOnly={off}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={leaveNote}
              onKeyDown={enterSaves}
            />
            {chips.length > 0 && !off && (
              <div className="chips" role="group" aria-label={`Quick notes for ${address}`}>
                {chips.map((chip) => (
                  <button key={chip} type="button" className="chip" onMouseDown={keepFocus} onClick={() => takeChip(chip)}>
                    + {chip}
                  </button>
                ))}
              </div>
            )}
            {status && (
              <p className={`note-status small${status.kind === 'error' ? ' error' : ''}`} role={status.kind === 'error' ? 'alert' : 'status'}>
                {status.text}
              </p>
            )}
          </div>
        </div>
      )}
      {j && ws.readOnly && latest && <p className="reason">{latest.reason}</p>}

      {open && <CompDetails ws={ws} c={c} out={out} distance={distance} id={detailsId} canAnchor={canAnchor} off={off} onStar={() => void star()} />}
    </li>
  );
}

/**
 * Kara's checks on this comp (§6.10): each flag with the rule, what it saw and
 * the tier it suggests. A suggestion, never a decision: the agent sorts. A
 * check that can't be told yet says what it needs.
 */
function Checks({ out, distanceShown }: { out: CompOut | undefined; distanceShown: boolean }) {
  const checks = out?.checks ?? [];
  if (!checks.length) return null;
  const flagged = checks.filter((k) => k.status === 'flagged');
  // A distance that can't be checked yet: the distance line above says why, more exactly.
  const unknown = checks.filter((k) => k.status === 'unknown' && !(distanceShown && k.code === 'distance'));
  return (
    <div className="checks-list">
      <span className="about-label">Kara’s checks</span>
      <ul className="plain small">
        {flagged.map((k) => (
          <li key={k.code}>
            <strong>{k.label}</strong>: {k.message}.{k.suggestion && <> <span className="suggestion">Suggests {k.suggestion}.</span></>}
          </li>
        ))}
        {flagged.length === 0 && <li className="muted">None flagged.</li>}
        {unknown.map((k) => <li key={k.code} className="muted">{k.message}.</li>)}
      </ul>
    </div>
  );
}

/**
 * The row's distance: "0.3 mi". A comp in the home's building has its flag
 * ("Same building"), never "0.0 mi". A building that couldn't be mapped is a
 * dash, with why on hover and in the opened row; one still being looked up
 * shows nothing yet.
 */
function RowDistance({ d }: { d: Distance | null }) {
  if (d?.kind === 'miles') return <span className="distance" title="From each building’s mapped location">{d.label}</span>;
  if (d?.kind === 'unknown' && !d.waiting) return <span className="distance muted" title={d.why}>— mi</span>;
  return null;
}

/** The opened row's distance and where it came from, or why there's none yet (Dispatch 11). */
function DistanceLine({ d }: { d: Distance }) {
  return (
    <div className="distance-line small">
      <span className="about-label">Distance</span>
      {d.kind === 'same_building' && <p>Same building.</p>}
      {d.kind === 'miles' && (
        <>
          <p>{d.label}, from each building’s mapped location.</p>
          {d.home && d.comp && <p className="muted">Mapped by {MAPPED_BY}: the home as {d.home}; this comp as {d.comp}.</p>}
        </>
      )}
      {d.kind === 'unknown' && <p className="muted">{d.why}</p>}
    </div>
  );
}

/** Where the comp came from, in a line. */
function originLine(c: WorkspaceComp): string {
  const o = c.record.origin;
  const on = o ? isoDay(o.as_of) : null;
  if (c.origin === 'listing') return `Read from its StreetEasy page${on ? ` on ${on}` : ''}${c.unconfirmed ? '; not confirmed yet' : ''}.`;
  if (c.origin === 'manual') return `Typed in${on ? ` on ${on}` : ''}.`;
  return `From StreetEasy’s export${o?.row ? `, row ${o.row}` : ''}${on ? `, pulled ${on}` : ''}.`;
}

function CompDetails({ ws, c, out, distance, id, canAnchor, off, onStar }: {
  ws: Workspace; c: WorkspaceComp; out: CompOut | undefined; distance: Distance | null; id: string; canAnchor: boolean; off: boolean; onStar: () => void;
}) {
  const j = c.judgment;
  const facts = useMemo(() => factLines(c.record), [c.record]);
  const usual = usualSource(facts);
  // The import's notes on this comp: its export row's, or its page read's.
  const notes: ParseWarning[] = c.origin === 'export'
    ? (ws.parsed.find((p) => p.importId === c.importId)?.parsed.warnings ?? []).filter((w) => w.row !== undefined && w.row === c.record.origin?.row)
    : c.origin === 'listing'
      ? ws.reads.find((r) => r.id === c.readId)?.warnings ?? []
      : [];

  return (
    <div className="comp-details" id={id}>
      {j && !ws.readOnly && canAnchor && (
        <button type="button" className={`star-toggle${j.anchor ? ' on' : ''}`} aria-pressed={j.anchor} disabled={off} onClick={onStar}>
          <span aria-hidden="true">{j.anchor ? '★' : '☆'}</span> {j.anchor ? 'The closest comp' : 'Star it as the closest comp'}
        </button>
      )}
      {j && !ws.readOnly && !canAnchor && compStatus(c) === 'sold' && (
        <p className="muted small">A primary sale can be starred as the closest comp.</p>
      )}
      {distance && <DistanceLine d={distance} />}
      <Checks out={out} distanceShown={Boolean(distance)} />
      <p className="muted small">{originLine(c)}</p>
      <div className="table-wrap">
        <table className="facts">
          <tbody>
            {facts.map((f) => (
              <tr key={f.label}>
                <th scope="row">{f.label}</th>
                <td>{f.value}</td>
                <td className="muted small">{[f.from !== usual ? f.from : null, f.sureness || null].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && (
        <div>
          <span className="about-label">From the import</span>
          <ul className="warnings">{notes.map((w, i) => <li key={i} className="small">{w.message}</li>)}</ul>
        </div>
      )}
      {j && j.reasons.length > 0 && (
        <div className="history">
          <span className="about-label">History</span>
          <ol>
            {j.reasons.map((r, i) => (
              <li key={i} className="small">
                {TIER_LABEL[r.tier]} · {r.reason} <span className="muted">— {r.by}, {new Date(r.at).toLocaleString()}</span> <SampleTag show={r.sample} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
