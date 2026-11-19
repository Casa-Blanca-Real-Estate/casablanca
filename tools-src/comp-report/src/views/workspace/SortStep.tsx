// Sort (the handoff, screen 6; Dispatch 14 item 6): the comps grouped by
// status, each taking the agent's tier (★, 1st, 2nd, ✕), note and tags.
// Findings stays locked until every comp has what it needs (a tier and comp
// tags, and a practice agent's note) and none waits for a confirm (the shell's
// button, from ws.readiness, repeated at the bottom); a row still missing any
// has a yellow edge and says what it needs, and "N to finish" filters to them.
// Removed comps fold at the bottom, each with Put back (Dispatch 15).
// Comps are added inline (the paste bar, "Type one in", or the export dropped
// anywhere on the screen). Hubert, beside it, never sorts: the agent does.
//
// The check (comps.md §4, 2026-11-18): a banner over the list says how many are checked, with CHECK THE NEXT →;
// each comp read from its page has a yellow edge and CHECK where its tier will go until it's checked, side by
// side with the target; the first unchecked opens by itself when Sort opens. Then its tier.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompOut } from '../../../engine/index.ts';
import { AddBar, useDropTarget } from '../comp/AddBar.tsx';
import { Reads } from '../sort/Reads.tsx';
import { groupRows, passes, sortRows, tagCounts, toRow, type SortState } from '../sort/rows.ts';
import { SortGroup } from '../sort/SortTable.tsx';
import { TAG_INFO } from '../sort/table.ts';
import { Info } from '../newcomp/Frame.tsx';
import { BuildNote, DecisionTag, StubTag } from './bits.tsx';
import type { StepProps, Workspace } from './model.ts';
import { TypeMismatch } from '../comp/TypeMismatch.tsx';
import { StepCta } from '../shell/WorkspaceHeader.tsx';
import { compAddress, compStatus, STATUS_LABEL } from './comps.tsx';
import '../../styles/sort.css';
import '../../styles/review.css';
import '../../styles/addcomps.css';

export function SortStep({ ws }: StepProps) {
  const outById = useMemo(() => new Map<string, CompOut>((ws.output?.comps ?? []).map((c) => [c.id, c])), [ws.output]);
  const rows = useMemo(() => ws.comps.map((c) => toRow(c, outById.get(c.id), ws.level)), [ws.comps, outById, ws.level]);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: null, dir: 1 });
  const drop = useDropTarget(ws, (n) => {
    setNote(n);
    if (n) setAdding(true);
  });

  const toFinish = rows.filter((r) => r.needs.length).length;
  const { sortFilter, setSortFilter } = ws;
  // "N to finish" turns itself off once nothing is left to finish.
  useEffect(() => {
    if (sortFilter.incomplete && toFinish === 0) setSortFilter({ ...sortFilter, incomplete: false });
  }, [sortFilter, setSortFilter, toFinish]);
  const filter = { incomplete: sortFilter.incomplete && toFinish > 0, tags: sortFilter.tags };
  const filtered = filter.incomplete || filter.tags.length > 0;
  const tags = useMemo(() => tagCounts(rows), [rows]);
  const shown = rows.filter((r) => passes(r, filter));
  const groups = groupRows(shown).map((g) => ({ ...g, rows: sortRows(g.rows, sort) }));
  // The rows top to bottom, for Hubert's get_view: "comps 1 and 2" counts as Sort shows them.
  const order = groups.flatMap((g) => g.rows.map((r) => r.rcId)).filter((x): x is string => Boolean(x)).join(',');
  // The comps still to check, top to bottom as Sort shows them (all of them, whatever the filter).
  const unchecked = groupRows(rows).flatMap((g) => g.rows).filter((r) => r.c.unconfirmed && r.group !== 'unsortable');
  const [checking, setChecking] = useState<string | null>(() => (ws.readOnly ? null : unchecked[0]?.c.id ?? null));
  const [jump, setJump] = useState(0);
  // Until the agent opens or closes one, the first unchecked comp as Sort shows them is the one open.
  const chosen = useRef(false);
  const firstUnchecked = unchecked[0]?.c.id ?? null;
  useEffect(() => {
    if (!chosen.current && !ws.readOnly) setChecking(firstUnchecked);
  }, [firstUnchecked]);
  const onCheck = (id: string | null, after?: 'next') => {
    chosen.current = true;
    if (after !== 'next') return setChecking(id);
    setJump((n) => n + 1);
    // Checked: the next one still to check after it opens, else the first left, else none.
    const at = unchecked.findIndex((r) => r.c.id === id);
    const next = unchecked.slice(at + 1).find((r) => r.c.id !== id) ?? unchecked.find((r) => r.c.id !== id);
    setChecking(next?.c.id ?? null);
  };
  useEffect(() => {
    ws.sortOrder(order ? order.split(',') : []);
  }, [order]);

  const addToggle = !ws.readOnly && (
    <button type="button" className={`so-addtoggle${adding ? ' on' : ''}`} aria-expanded={adding} onClick={() => setAdding(!adding)}>
      {adding ? 'Done adding' : '+ Add comps'}
    </button>
  );
  const addPanel = adding && !ws.readOnly && (
    <div className="so-addpanel panel">
      <AddBar ws={ws} note={note} onNote={setNote} />
    </div>
  );

  if (!ws.comps.length) {
    return (
      <div className="so" {...drop.handlers}>
        {drop.veil}
        {addPanel ? (
          <>
            <div className="so-toolbar">{addToggle}</div>
            {addPanel}
          </>
        ) : (
          <div className="so-empty panel">
            <span className="so-empty-sw" aria-hidden="true">
              <span className="so-sw sold" /><span className="so-sw in_contract" /><span className="so-sw active" /><span className="so-sw off_market" />
            </span>
            <p className="so-empty-title">No comps yet</p>
            {!ws.readOnly && <button type="button" className="btn primary" onClick={() => setAdding(true)}>+ Add comps</button>}
            <p className="so-empty-hint">Same building first · ¼ mile · last 3–6 months</p>
          </div>
        )}
        <Reads ws={ws} />
        <Removed ws={ws} />
      </div>
    );
  }

  const clear = () => setSortFilter({ incomplete: false, tags: [] });
  const total = rows.length;
  return (
    <div className="so" {...drop.handlers}>
      {drop.veil}
      <TypeMismatch ws={ws} />
      <div className="so-toolcol">
        <div className="so-toolbar">
          {addToggle}
          {toFinish > 0 && (
            <button
              type="button"
              className={`so-finish${filter.incomplete ? ' on' : ''}`}
              aria-pressed={filter.incomplete}
              onClick={() => setSortFilter({ incomplete: !filter.incomplete, tags: [] })}
            >
              <span className="so-need-sq" aria-hidden="true" />{toFinish} to finish
            </button>
          )}
          {/* Filter shows once some comp has a tag: before that it has nothing to offer (NW-028). */}
          {tags.length > 0 && (
            <span className="so-filter-wrap">
              <button type="button" className="so-filter" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>
                Filter by tags <span aria-hidden="true">{filterOpen ? '▴' : '▾'}</span>
              </button>
              <Info text={TAG_INFO} label="What a tag is" align="left" />
            </span>
          )}
          {filtered && <button type="button" className="link so-clear" onClick={clear}>Clear</button>}
          <span className="so-count" aria-live="polite">
            {filtered ? `Showing ${shown.length} of ${total}` : `${total} comp${total === 1 ? '' : 's'}`}
          </span>
        </div>
        {filterOpen && tags.length > 0 && (
          <div className="so-tagchips" role="group" aria-label="Filter by tags">
            {tags.map(({ tag, n }) => {
              const on = filter.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`so-tagchip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => setSortFilter({ incomplete: false, tags: on ? [] : [tag] })}
                >
                  {tag}<span className="so-tagchip-n">{n}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {addPanel}
      <CheckBanner ws={ws} total={rows.filter((r) => r.group !== 'unsortable').length} left={unchecked.length} onNext={() => {
        const next = unchecked.find((r) => r.c.id !== checking) ?? unchecked[0];
        if (next) {
          chosen.current = true;
          setChecking(next.c.id);
          setJump((n) => n + 1);
        }
      }} />
      <Reads ws={ws} />
      {groups.map((g) => <SortGroup key={g.id} ws={ws} id={g.id} rows={g.rows} outById={outById} sort={sort} onSort={setSort} checking={checking} onCheck={onCheck} jump={jump} />)}
      {shown.length === 0 && (
        <p className="so-nomatch">No comps match that filter. <button type="button" className="link" onClick={clear}>Clear it</button></p>
      )}
      <Removed ws={ws} />
      <StepCta ws={ws} className="sh-cta so-bottom-cta" />
      {ws.devTools && (
        <BuildNote>
          Findings unlocks on ws.readiness (every comp: a tier and tags, and a note at the practice level; none to confirm). Kara’s checks are the engine’s{' '}
          <code>comps[].checks</code> (§6.10), folded under each card. The range stays hidden until the Gate <DecisionTag id="D-1" />.{' '}
          <StubTag>Waits on D-12</StubTag> Jev’s tier suggestions (§7). <StubTag>Later</StubTag> Screenshots read into comps, Hubert’s
          suggestions from market data.
        </BuildNote>
      )}
    </div>
  );
}

/** "3 comps to check against its page, then a tier for each", n of n checked, CHECK THE NEXT → (comps.md §4). */
function CheckBanner({ ws, total, left, onNext }: { ws: Workspace; total: number; left: number; onNext: () => void }) {
  if (!total || ws.readOnly) return null;
  const done = total - left;
  return (
    <div className={`so-banner${left ? ' open' : ''}`} role="status">
      <span className="so-banner-text">
        <span className="so-banner-title">
          {left ? `${left} comp${left === 1 ? '' : 's'} to check against ${left === 1 ? 'its page' : 'their pages'}, then a tier for each.` : `All ${total} checked. Give each a tier, then Review comps.`}
        </span>
        <span className="so-banner-sub">
          {left ? 'Hubert read their pages; the facts he read carry a dot. Anything off: Fix a fact, or Remove.' : '★ is the closest comp, one per report. ✕ leaves a comp out of the numbers.'}
        </span>
      </span>
      <span className="so-banner-meter">
        <span className="so-banner-row"><span className="so-banner-k">Checked</span><strong>{done} of {total}</strong></span>
        <span className="so-banner-bar"><span style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
      </span>
      {left > 0 && <button type="button" className="so-banner-next" onClick={onNext}>CHECK THE NEXT →</button>}
    </div>
  );
}

/**
 * The comps taken out (NW-056, NW-057): folded at the bottom, each with Put
 * back. It comes back with its tier, note, tags and history. Removing isn't ✕:
 * a removed export row still feeds Hubert's "You might also look at".
 */
function Removed({ ws }: { ws: Workspace }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!ws.removed.length) return null;
  return (
    <details className="so-removed">
      <summary>Removed ({ws.removed.length})</summary>
      <ul className="so-removed-list">
        {ws.removed.map((c) => {
          const j = c.judgment!;
          const status = compStatus(c);
          return (
            <li key={j.reportCompId} className="so-removed-row">
              <span className="so-removed-addr">{compAddress(c)}</span>
              <span className="so-removed-mid">{status ? STATUS_LABEL[status] : ''}{j.removedAt ? ` · removed ${new Date(j.removedAt).toLocaleDateString()}` : ''}</span>
              {!ws.readOnly && (
                <button
                  type="button"
                  className="link so-putback"
                  disabled={busy === j.reportCompId}
                  onClick={() => {
                    setBusy(j.reportCompId);
                    ws.editComp(j.reportCompId, { removed: false })
                      .then(() => ws.toast(`${compAddress(c)} is back in the report.`))
                      .catch((e: unknown) => ws.toast(`Not put back: ${e instanceof Error ? e.message : String(e)}`))
                      .finally(() => setBusy(null));
                  }}
                >
                  Put back
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
