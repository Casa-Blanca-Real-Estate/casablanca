// Sort's table (the handoff, screen 6): a white card per status, its header
// sorting the columns, and a row per comp. A row takes the agent's tier (1st,
// 2nd, ✕) and the anchor (★, one per report: starring another moves it); a
// comp read from its page is confirmed or removed first. Opening a row shows
// the comp's card, and counts as reviewing it.
import { useCallback, useId, useState, type MouseEvent } from 'react';
import type { CompOut, Tier } from '../../../engine/index.ts';
import type { Workspace } from '../workspace/model.ts';
import { CompCard } from './CompCard.tsx';
import {
  GROUP_LABEL, monthYear, needText, nextSort, ppsfText, PRICE_LABEL, shortPrice, sizeText,
  type GroupId, type Row, type SortKey, type SortState,
} from './rows.ts';

const TIERS: { tier: Tier; label: string }[] = [
  { tier: 'primary', label: '1st' },
  { tier: 'secondary', label: '2nd' },
  { tier: 'excluded', label: '✕' },
];
const TIER_NAME: Record<Tier, string> = { primary: '1st tier', secondary: '2nd tier', excluded: 'Excluded' };

const stop = (e: MouseEvent) => e.stopPropagation();
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SortGroup({ ws, id, rows, outById, sort, onSort }: {
  ws: Workspace;
  id: GroupId;
  rows: Row[];
  outById: Map<string, CompOut>;
  sort: SortState;
  onSort: (next: SortState) => void;
}) {
  const cols: { key: SortKey; label: string }[] = [
    { key: 'price', label: PRICE_LABEL[id] },
    ...(ws.sf ? [{ key: 'ppsf' as const, label: '$/ft' }, { key: 'size' as const, label: 'Size' }] : []),
    { key: 'date', label: 'Date' },
    { key: 'tier', label: 'Tier' },
  ];
  return (
    <section className="so-group" aria-label={GROUP_LABEL[id]}>
      <div className={`so-ghead so-cols${ws.sf ? ' sf' : ''}`}>
        <span className={`so-sw ${id}`} aria-hidden="true" />
        <span className="so-gname">{GROUP_LABEL[id]} <span className="so-gn">{rows.length}</span></span>
        {cols.map((col) => {
          const on = sort.key === col.key;
          return (
            <button
              key={col.key}
              type="button"
              className={`so-colh${on ? ' on' : ''}`}
              aria-label={`Sort by ${col.label}${on ? (sort.dir === 1 ? ', ascending' : ', descending') : ''}`}
              onClick={() => onSort(nextSort(sort, col.key))}
            >
              {col.label} {on ? (sort.dir === 1 ? '↑' : '↓') : ''}
            </button>
          );
        })}
      </div>
      {rows.map((r) => <SortRow key={r.c.id} ws={ws} row={r} out={outById.get(r.c.id)} />)}
    </section>
  );
}

function SortRow({ ws, row, out }: { ws: Workspace; row: Row; out: CompOut | undefined }) {
  const cardId = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingTier, setPendingTier] = useState<Tier | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<boolean | null>(null);
  const [acting, setActing] = useState(false);
  const j = row.c.judgment;
  const rcId = row.rcId;
  const tier = pendingTier ?? row.tier;
  const anchor = pendingAnchor ?? row.anchor;
  const incomplete = row.needs.length > 0;
  const sortable = row.group !== 'unsortable' && rcId !== null;
  const onEditing = useCallback((on: boolean) => setEditing(on), []);

  function toggle() {
    if (editing) return; // the card's edits stay until saved or cancelled
    const next = !open;
    setOpen(next);
    // Opening a row is reviewing it. Nothing waits on the mark; a failed one is made again next time.
    if (next && j && rcId && !j.reviewedAt && !ws.readOnly) ws.editComp(rcId, { reviewed: true }).catch(() => undefined);
  }

  function pickTier(t: Tier) {
    if (!rcId || ws.readOnly || t === tier) return; // a tier can be changed, not cleared
    setPendingTier(t);
    ws.editComp(rcId, { tier: t })
      .catch((e: unknown) => ws.toast(`Not saved: ${message(e)}`))
      .finally(() => setPendingTier(null));
  }

  function star() {
    if (!rcId || ws.readOnly) return;
    setPendingAnchor(!anchor);
    ws.editComp(rcId, { anchor: !anchor })
      .catch((e: unknown) => ws.toast(`Not saved: ${message(e)}`))
      .finally(() => setPendingAnchor(null));
  }

  function act(edit: { confirmed: true } | { removed: true }, done: string) {
    if (!rcId || ws.readOnly) return;
    setActing(true);
    ws.editComp(rcId, edit)
      .then(() => ws.toast(done))
      .catch((e: unknown) => {
        ws.toast(`Not saved: ${message(e)}`);
        setActing(false);
      });
  }

  return (
    <div className={`so-row-wrap${incomplete ? ' incomplete' : ''}`}>
      <div className={`so-row so-cols${ws.sf ? ' sf' : ''}`} onClick={toggle}>
        <span className="so-caret" aria-hidden="true">{open ? '–' : '+'}</span>
        <div className="so-addr-cell">
          {!open && <span className="so-thumb" aria-hidden="true" />}
          <span className="so-addr-line">
            <button
              type="button"
              className="so-addr"
              aria-expanded={open}
              aria-controls={open ? cardId : undefined}
              onClick={(e) => {
                stop(e);
                toggle();
              }}
            >
              {row.address}
            </button>
            {row.tags.map((t) => <span key={t} className="so-flag">{t}</span>)}
            {incomplete && <span className="so-need"><span className="so-need-sq" aria-hidden="true" />{needText(row.needs)}</span>}
            {row.group === 'unsortable' && <span className="so-unsortable">{row.c.unsortable ?? 'This comp can’t be sorted.'}</span>}
          </span>
          {sortable && (ws.readOnly
            ? anchor && <span className="so-star on" title="Anchor comp" aria-label="Anchor comp">★</span>
            : (
              <button
                type="button"
                className={`so-star${anchor ? ' on' : ''}`}
                title="Anchor comp"
                aria-label="Anchor comp"
                aria-pressed={anchor}
                onClick={(e) => {
                  stop(e);
                  star();
                }}
              >
                {anchor ? '★' : '☆'}
              </button>
            ))}
        </div>
        {open ? (
          <>
            <span />
            {ws.sf && <><span /><span /></>}
            <span />
          </>
        ) : (
          <>
            <span className="so-price">{shortPrice(row.price)}</span>
            {ws.sf && <span>{ppsfText(row)}</span>}
            {ws.sf && (
              <span className="so-size">
                {sizeText(row)}
                {row.sizeEst && <span className="so-est" title="Approximate size" aria-label="approximate" />}
              </span>
            )}
            <span>{monthYear(row.date)}</span>
          </>
        )}
        {!sortable ? <span /> : row.c.unconfirmed ? (
          <span className="so-confirm" onClick={stop}>
            {ws.readOnly ? <span className="so-tier-ro">To confirm</span> : (
              <>
                <button type="button" className="so-confirm-btn" disabled={acting} title="Check it against the listing, then confirm: until then it counts in neither result" onClick={() => act({ confirmed: true }, 'Confirmed.')}>Confirm</button>
                <button type="button" className="link so-remove-link" disabled={acting} onClick={() => act({ removed: true }, `${row.address} is out of the report.`)}>Remove</button>
              </>
            )}
          </span>
        ) : (
          <span className="so-seg" role="group" aria-label={`Tier for ${row.address}`} onClick={stop}>
            {TIERS.map((t) => (
              <button
                key={t.tier}
                type="button"
                className={`${t.tier}${tier === t.tier ? ' on' : ''}`}
                aria-pressed={tier === t.tier}
                aria-label={TIER_NAME[t.tier]}
                disabled={ws.readOnly}
                onClick={() => pickTier(t.tier)}
              >
                {t.label}
              </button>
            ))}
          </span>
        )}
      </div>
      {open && <CompCard ws={ws} row={row} out={out} id={cardId} onEditing={onEditing} />}
    </div>
  );
}
