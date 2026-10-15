// Sort (the handoff, screen 6; Dispatch 14 item 6): the comps grouped by
// status, each taking the agent's tier (1st, 2nd, ✕), note and tags. Findings
// stays locked until every comp has all three and none waits for a confirm
// (the shell's button, from ws.readiness); a row still missing any has a
// yellow edge and says what it needs, and "N to finish" filters to them.
// Comps are added inline (the paste bar, "Type one in", or the export dropped
// anywhere on the screen). Hubert, beside it, never sorts: the agent does.
import { useEffect, useMemo, useState } from 'react';
import type { CompOut } from '../../../engine/index.ts';
import { AddBar, useDropTarget } from '../comp/AddBar.tsx';
import { Reads } from '../sort/Reads.tsx';
import { groupRows, passes, sortRows, tagCounts, toRow, type SortState } from '../sort/rows.ts';
import { SortGroup } from '../sort/SortTable.tsx';
import { BuildNote, DecisionTag, StubTag } from './bits.tsx';
import type { StepProps } from './model.ts';
import { TypeMismatch } from '../comp/TypeMismatch.tsx';
import '../../styles/sort.css';

export function SortStep({ ws }: StepProps) {
  const outById = useMemo(() => new Map<string, CompOut>((ws.output?.comps ?? []).map((c) => [c.id, c])), [ws.output]);
  const rows = useMemo(() => ws.comps.map((c) => toRow(c, outById.get(c.id))), [ws.comps, outById]);
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
          <button type="button" className="so-filter" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>
            Filter <span aria-hidden="true">{filterOpen ? '▴' : '▾'}</span>
          </button>
          {filtered && <button type="button" className="link so-clear" onClick={clear}>Clear</button>}
          <span className="so-count" aria-live="polite">
            {filtered ? `Showing ${shown.length} of ${total}` : `${total} comp${total === 1 ? '' : 's'}`}
          </span>
        </div>
        {filterOpen && (
          <div className="so-tagchips" role="group" aria-label="Filter by tag">
            {tags.length === 0 && <span className="so-tagchips-none">No tags yet. Tags you give comps show here.</span>}
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
      <Reads ws={ws} />
      {groups.map((g) => <SortGroup key={g.id} ws={ws} id={g.id} rows={g.rows} outById={outById} sort={sort} onSort={setSort} />)}
      {shown.length === 0 && (
        <p className="so-nomatch">No comps match that filter. <button type="button" className="link" onClick={clear}>Clear it</button></p>
      )}
      {ws.devTools && (
        <BuildNote>
          Findings unlocks on ws.readiness (every comp: a tier, a note, a tag; none to confirm). Kara’s checks are the engine’s{' '}
          <code>comps[].checks</code> (§6.10), folded under each card. The range stays hidden until the Gate <DecisionTag id="D-1" />.{' '}
          <StubTag>Waits on D-12</StubTag> Jev’s tier suggestions (§7). <StubTag>Later</StubTag> Photos, screenshots read into comps, Hubert’s
          suggestions from market data.
        </BuildNote>
      )}
    </div>
  );
}
