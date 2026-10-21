// Sort's table (the handoff, screen 6): a white card per status, its header
// sorting the columns, and a row per comp. A row takes the agent's tier: ★ ·
// 1st · 2nd · ✕ (Dispatch 15, NW-026). ★ is the main comp, one per report:
// starring a comp makes it 1st (moving the star from another), and 2nd or ✕
// takes the star off. A comp read from its page is confirmed or removed first.
// Opening a row shows the comp's card, and counts as reviewing it. What a row
// still needs is a link to the spot that gives it (NW-038).
import { useCallback, useId, useRef, useState, type MouseEvent } from 'react';
import type { CompOut, Tier } from '../../../engine/index.ts';
import { Info } from '../newcomp/Frame.tsx';
import type { Workspace } from '../workspace/model.ts';
import { CompCard, type CardStart } from './CompCard.tsx';
import { RowThumb } from './RowThumb.tsx';
import {
  GROUP_LABEL, monthYear, NEED_WORD, needText, nextSort, ppsfText, PRICE_LABEL, shortPrice, sizeText,
  type GroupId, type Row, type RowNeed, type SortKey, type SortState,
} from './rows.ts';

const TIERS: { tier: Tier; label: string; hint: string }[] = [
  { tier: 'primary', label: '1st', hint: '1st tier: counts. Only 1st-tier comps set the range.' },
  { tier: 'secondary', label: '2nd', hint: '2nd tier: context, shown but not counted.' },
  { tier: 'excluded', label: '✕', hint: 'Excluded' },
];
const TIER_NAME: Record<Tier, string> = { primary: '1st tier', secondary: '2nd tier', excluded: 'Excluded' };
const STAR_HINT = 'The main comp you’re comparing to. The email leads with it.';
const TIER_INFO = '1st: counts. Only 1st-tier comps set the range. 2nd: context, shown but not counted. ✕: out of every figure. ★: the main comp; the email leads with it.';

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
          const button = (
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
          return col.key === 'tier' ? (
            <span key={col.key} className="so-colh-tier">
              {button}
              <Info text={TIER_INFO} label="What the tiers mean" />
            </span>
          ) : button;
        })}
      </div>
      {rows.map((r) => <SortRow key={r.c.id} ws={ws} row={r} out={outById.get(r.c.id)} />)}
    </section>
  );
}

function SortRow({ ws, row, out }: { ws: Workspace; row: Row; out: CompOut | undefined }) {
  const cardId = useId();
  // The ★ comp's card starts open, as the handoff draws it.
  const [open, setOpen] = useState(() => row.anchor);
  const [editing, setEditing] = useState(false);
  const [collapseAsk, setCollapseAsk] = useState(0);
  const [start, setStart] = useState<CardStart | null>(null);
  const tierRef = useRef<HTMLSpanElement>(null);
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
  const onCollapse = useCallback(() => {
    setOpen(false);
    setStart(null);
    // The card unmounts with the row closing, so it can't report leaving edit mode itself.
    setEditing(false);
  }, []);

  function reveal() {
    setOpen(true);
    // Opening a row is reviewing it. Nothing waits on the mark; a failed one is made again next time.
    if (j && rcId && !j.reviewedAt && !ws.readOnly) ws.editComp(rcId, { reviewed: true }).catch(() => undefined);
  }

  function toggle() {
    // Editing, the card decides: it closes with nothing changed, and asks to save otherwise (NW-043).
    if (editing) return setCollapseAsk((n) => n + 1);
    if (open) onCollapse();
    else reveal();
  }

  /** "Needs tier, note, tags": each word goes to its spot. */
  function goTo(need: RowNeed) {
    if (need === 'tier') {
      tierRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      tierRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (need === 'confirm') return;
    if (!open) reveal();
    setStart((s) => ({ what: need, n: (s?.n ?? 0) + 1 }));
  }

  function pickTier(t: Tier) {
    if (!rcId || ws.readOnly || t === tier) return; // a tier can be changed, not cleared
    setPendingTier(t);
    // 2nd or ✕ takes the star off (the server does the same).
    if (t !== 'primary' && anchor) setPendingAnchor(false);
    ws.editComp(rcId, { tier: t })
      .catch((e: unknown) => ws.toast(`Not saved: ${message(e)}`))
      .finally(() => {
        setPendingTier(null);
        setPendingAnchor(null);
      });
  }

  function star() {
    if (!rcId || ws.readOnly) return;
    setPendingAnchor(!anchor);
    // ★ makes it 1st (NB-6).
    if (!anchor) setPendingTier('primary');
    ws.editComp(rcId, { anchor: !anchor })
      .catch((e: unknown) => ws.toast(`Not saved: ${message(e)}`))
      .finally(() => {
        setPendingAnchor(null);
        setPendingTier(null);
      });
  }

  function confirm() {
    if (!rcId || ws.readOnly) return;
    setActing(true);
    ws.editComp(rcId, { confirmed: true })
      .then(() => ws.toast('Confirmed.'))
      .catch((e: unknown) => {
        ws.toast(`Not saved: ${message(e)}`);
        setActing(false);
      });
  }

  function remove() {
    if (!rcId || ws.readOnly) return;
    setActing(true);
    ws.editComp(rcId, { removed: true })
      .then(() => ws.toast(`${row.address} is out of the report.`, {
        label: 'Undo',
        run: () => void ws.editComp(rcId, { removed: false }).catch((e: unknown) => ws.toast(`Not put back: ${message(e)}`)),
      }))
      .catch((e: unknown) => {
        ws.toast(`Not saved: ${message(e)}`);
        setActing(false);
      });
  }

  const needLinks = row.needs.filter((n): n is Exclude<RowNeed, 'confirm'> => n !== 'confirm');

  return (
    <div className={`so-row-wrap${incomplete ? ' incomplete' : ''}`}>
      <div className={`so-row so-cols${ws.sf ? ' sf' : ''}`} onClick={toggle}>
        <span className="so-caret" aria-hidden="true">{open ? '–' : '+'}</span>
        <div className="so-addr-cell">
          {!open && <RowThumb photo={j?.photos?.[0]} />}
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
            {incomplete && (row.needs.includes('confirm') || ws.readOnly ? (
              <span className="so-need"><span className="so-need-sq" aria-hidden="true" />{needText(row.needs)}</span>
            ) : (
              <span className="so-need" onClick={stop}>
                <span className="so-need-sq" aria-hidden="true" />Needs{' '}
                {needLinks.map((n, i) => (
                  <span key={n}>
                    <button type="button" className="so-need-link" onClick={() => goTo(n)}>{NEED_WORD[n]}</button>
                    {i < needLinks.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </span>
            ))}
            {row.group === 'unsortable' && <span className="so-unsortable">{row.c.unsortable ?? 'This comp can’t be sorted.'}</span>}
          </span>
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
                <button type="button" className="so-confirm-btn" disabled={acting} title="Check it against the listing, then confirm: until then it counts in neither result" onClick={confirm}>Confirm</button>
                <button type="button" className="link so-remove-link" disabled={acting} onClick={remove}>Remove</button>
              </>
            )}
          </span>
        ) : (
          <span className="so-seg" role="group" aria-label={`Tier for ${row.address}`} onClick={stop} ref={tierRef}>
            {row.needs.includes('tier') && <span className="so-seg-need so-need-sq" aria-hidden="true" title="Needs a tier" />}
            <button
              type="button"
              className={`star${anchor ? ' on' : ''}`}
              aria-pressed={anchor}
              aria-label="Main comp"
              title={STAR_HINT}
              disabled={ws.readOnly}
              onClick={star}
            >
              ★
            </button>
            {TIERS.map((t) => (
              <button
                key={t.tier}
                type="button"
                className={`${t.tier}${tier === t.tier ? ' on' : ''}`}
                aria-pressed={tier === t.tier}
                aria-label={TIER_NAME[t.tier]}
                title={t.hint}
                disabled={ws.readOnly}
                onClick={() => pickTier(t.tier)}
              >
                {t.label}
              </button>
            ))}
          </span>
        )}
      </div>
      {open && <CompCard ws={ws} row={row} out={out} id={cardId} onEditing={onEditing} start={start} collapseAsk={collapseAsk} onCollapse={onCollapse} />}
    </div>
  );
}
