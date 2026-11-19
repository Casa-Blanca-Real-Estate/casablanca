// Sort's check (design pass, comps.md §4, 2026-11-18): each comp read from its page is checked once, side by
// side with the target. Each fact as read (Sale, $/SF, Size, Date, Beds and baths, Floor, Distance, Days on
// market), a dot on its label when it came from the page, and the target's value under it ("17L · 2,000").
// Hubert's note when it doesn't fit the guidance. ✓ LOOKS RIGHT marks it checked and opens the next; FIX A FACT
// turns the facts StreetEasy can be corrected on (price, size, date, floor) into fields, saved with the check.
// "Checked" is today's `unconfirmed` flag, cleared here instead of in the window.
import { useState } from 'react';
import type { CompOut } from '../../../engine/index.ts';
import type { CompEdit } from '../../api.ts';
import { readPrice } from '../comp/CompForm.tsx';
import { guidanceFlags, whereOf } from '../workspace/check.ts';
import { compStatus, listingUrl } from '../workspace/comps.tsx';
import type { Workspace } from '../workspace/model.ts';
import { homeName } from '../workspace/screens.ts';
import { countText, monthYear, PRICE_LABEL, shortPrice, sizeText, type Row } from './rows.ts';
import seLogo from '../../assets/streeteasy-logo.svg';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type FixKey = 'price' | 'size' | 'date' | 'floor';

export function CheckCard({ ws, row, out, id, onChecked, onRemoved }: {
  ws: Workspace;
  row: Row;
  out: CompOut | undefined;
  id: string;
  /** Checked: the next unchecked comp opens. */
  onChecked: () => void;
  onRemoved: () => void;
}) {
  const c = row.c;
  const f = c.record.facts;
  const i = ws.intake;
  const rc = row.rcId;
  const home = homeName(i, ws.report.title);
  const where = whereOf(ws, c, out);
  const flags = guidanceFlags(c, i, where, home, ws.propertyType, ws.today);
  const fromPage = c.origin === 'listing';
  const [fixing, setFixing] = useState<Record<FixKey, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = compStatus(c);
  const priceLabel = row.group !== 'unsortable' ? PRICE_LABEL[row.group] : 'Price';
  const homePsf = i.askingPrice && i.areaSqft ? Math.trunc(i.askingPrice.value / i.areaSqft.value) : null;
  const money = (n: number | null | undefined) => (n ? `$${Math.round(n).toLocaleString('en-US')}` : '—');

  const facts: { key: string; label: string; value: string; target: string; fix?: FixKey; dot: boolean }[] = [
    { key: 'price', label: priceLabel, value: shortPrice(row.price), target: i.askingPrice ? `${shortPrice(i.askingPrice.value)} ask` : '—', fix: 'price', dot: fromPage },
    ...(ws.sf ? [{ key: 'ppsf', label: '$/SF', value: row.ppsf ? money(row.ppsf) : '—', target: homePsf ? `${money(homePsf)} ask` : '—', dot: fromPage }] : []),
    { key: 'size', label: 'Size', value: sizeText(row), target: i.areaSqft ? i.areaSqft.value.toLocaleString('en-US') : '—', fix: 'size', dot: fromPage && Boolean(f.area_sqft) },
    { key: 'date', label: 'Date', value: monthYear(row.date), target: 'Today', fix: 'date', dot: fromPage && Boolean(f.status_date) },
    { key: 'bb', label: 'Beds, baths', value: [f.beds ? `${f.beds.value} bd` : null, f.baths ? `${f.baths.value} ba` : null].filter(Boolean).join(' · ') || '—', target: `${i.beds?.value ?? '—'} bd · ${i.baths?.value ?? '—'} ba`, dot: fromPage && Boolean(f.beds) },
    { key: 'floor', label: 'Floor', value: countText(row.floor), target: i.floor ? String(i.floor.value) : '—', fix: 'floor', dot: fromPage && row.floor !== null },
    { key: 'dist', label: 'Distance', value: where.sameBuilding ? 'Same building' : where.miles !== null ? `${where.miles.toFixed(1)} mi` : '—', target: 'the home', dot: false },
    { key: 'dom', label: 'Days on market', value: countText(row.dom), target: '—', dot: fromPage && row.dom !== null },
  ];

  function startFix() {
    setError(null);
    setFixing({
      price: row.price ? String(row.price) : '',
      size: row.size ? String(Math.round(row.size)) : '',
      date: row.date ?? '',
      floor: row.floor !== null ? String(row.floor) : '',
    });
  }

  /** The facts the agent changed, as the server takes them; an error string when one doesn't read. */
  function corrections(d: Record<FixKey, string>): CompEdit['factOverrides'] | string {
    const o: NonNullable<CompEdit['factOverrides']> = {};
    const was = { price: row.price ? String(row.price) : '', size: row.size ? String(Math.round(row.size)) : '', date: row.date ?? '', floor: row.floor !== null ? String(row.floor) : '' };
    if (d.price.trim() !== was.price) {
      const v = readPrice(d.price);
      if (v === null || v <= 0) return 'The price reads as a number: $4,250,000 or 4.25M.';
      o.price = v;
    }
    if (d.size.trim() !== was.size) {
      const v = Number(d.size.replace(/[,\s]/g, ''));
      if (!Number.isInteger(v) || v <= 0) return 'The size reads as whole square feet: 1,980.';
      o.size = v;
    }
    if (d.floor.trim() !== was.floor) {
      const v = Number(d.floor.trim());
      if (!Number.isInteger(v)) return 'The floor reads as a whole number: 12.';
      o.floor = v;
    }
    if (d.date.trim() !== was.date) {
      const t = d.date.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || t > ws.today) return 'The date is a day (2026-09-14), and not in the future.';
      o.date = t;
    }
    return Object.keys(o).length ? o : undefined;
  }

  async function check() {
    if (!rc || ws.readOnly) return;
    let fixes: CompEdit['factOverrides'];
    if (fixing) {
      const got = corrections(fixing);
      if (typeof got === 'string') return setError(got);
      fixes = got;
    }
    setBusy(true);
    try {
      if (fixes) await ws.editComp(rc, { factOverrides: fixes });
      await ws.editComp(rc, { confirmed: true });
      setFixing(null);
      onChecked();
    } catch (e) {
      setError(`Not saved: ${message(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!rc || ws.readOnly) return;
    setBusy(true);
    ws.editComp(rc, { removed: true })
      .then(() => {
        onRemoved();
        ws.toast(`${row.address} is out of the report.`, {
          label: 'Undo',
          run: () => void ws.editComp(rc, { removed: false }).catch((e: unknown) => ws.toast(`Not put back: ${message(e)}`)),
        });
      })
      .catch((e: unknown) => {
        ws.toast(`Not saved: ${message(e)}`);
        setBusy(false);
      });
  }

  const url = listingUrl(c);
  return (
    <div className="ck-card" id={id}>
      <span className="ck-k">Side by side with the target, {home}</span>
      <div className="ck-facts">
        {facts.map((x) => (
          <label key={x.key} className="ck-fact">
            <span className="ck-label">{x.label}{x.dot && <span className="ck-dot" title="Read from its page" />}</span>
            {fixing && x.fix ? (
              <input
                className="ck-in"
                value={fixing[x.fix]}
                placeholder={x.fix === 'date' ? 'YYYY-MM-DD' : '—'}
                onChange={(e) => setFixing({ ...fixing, [x.fix!]: e.target.value })}
              />
            ) : <span className="ck-v">{x.value}</span>}
            <span className="ck-t">{home} · {x.target}</span>
          </label>
        ))}
      </div>
      {flags.length > 0 && (
        <div className="ck-note"><span aria-hidden="true" className="ck-spark">✦</span><span>{flags.map((x) => x.long).join(' ')}</span></div>
      )}
      {sourceIsHubert(ws, rc) && (
        <div className="ck-note"><span aria-hidden="true" className="ck-spark">✦</span><span>I found this one on the web, not from a page you gave me: check each fact against its StreetEasy page before you trust it.</span></div>
      )}
      {error && <p className="ck-err" role="alert">{error}</p>}
      {!ws.readOnly && (
        <div className="ck-actions">
          <button type="button" className="ck-bp" disabled={busy} onClick={() => void check()}>{fixing ? '✓ SAVE AND MARK CHECKED' : '✓ LOOKS RIGHT'}</button>
          <button type="button" className="ck-bo" disabled={busy} onClick={() => (fixing ? (setFixing(null), setError(null)) : startFix())}>{fixing ? 'CANCEL' : 'FIX A FACT'}</button>
          {url && (
            <a className="ck-se" href={url} target="_blank" rel="noopener noreferrer" aria-label="Open on StreetEasy">
              <img src={seLogo} alt="" aria-hidden="true" /> <span aria-hidden="true">↗</span>
            </a>
          )}
          <span className="ck-gap" />
          <button type="button" className="ck-lk" disabled={busy} onClick={remove}>Remove from the report</button>
        </div>
      )}
      {status === null && <p className="ck-err">This comp has no status: it can’t be sorted until it has one.</p>}
    </div>
  );
}

function sourceIsHubert(ws: Workspace, rc: string | null): boolean {
  return Boolean(rc && ws.reads.some((r) => r.reportCompId === rc && r.foundBy === 'hubert'));
}
