// Add comps, the workspace's first step (design pass, docs/comp-report/design-pass/comps.md §3, 2026-11-18; the
// canvas's "Add comps · round 1", Option A): it left the New comp window. Top to bottom: the paste block with
// the drop zone right under it; the tally against about three of each status; the comps grouped by status,
// what's still reading first (each with its own 0–100%), each row with how it compares with the target and
// Hubert's flag when it doesn't fit the guidance; a failed read in red with TRY AGAIN. No Confirm here: comps
// are taken in and read here, and checked once, on Sort (§4). The footer: ← BACK to Client info, what's
// still reading, NEXT: SORT →. Dropping the export anywhere on the screen still works.
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CompOut } from '../../../engine/index.ts';
import { linksApi, type LinkReadView } from '../../api.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { PasteBlock, useDropTarget } from '../comp/AddBar.tsx';
import { CompForm } from '../comp/CompForm.tsx';
import { StepNotes } from '../newcomp/StepBodies.tsx';
import { readPercent } from '../newcomp/Window.tsx';
import { RowThumb } from '../sort/RowThumb.tsx';
import { monthYear, shortPrice } from '../sort/rows.ts';
import { ImportNotes, prefillFrom, readTitle } from './AddComps.tsx';
import { guidanceFlags, sourceOf, TALLY_AIM, versusLine, whereOf } from './check.ts';
import { compAddress, compPrice, compStatus, STATUS_LABEL, STATUS_ORDER } from './comps.tsx';
import type { Workspace } from './model.ts';
import { mayRetry, retryRead } from './reads.ts';
import { homeName } from './screens.ts';
import '../../styles/addcomps.css';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A second's tick, for the reading rows' counters. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [on]);
  return now;
}

function CompRow({ ws, c, out }: { ws: Workspace; c: WorkspaceComp; out: CompOut | undefined }) {
  const [busy, setBusy] = useState(false);
  const f = c.record.facts;
  const home = homeName(ws.intake, ws.report.title);
  const where = whereOf(ws, c, out);
  const vs = versusLine(c, ws.intake, where);
  const flags = guidanceFlags(c, ws.intake, where, home, ws.propertyType, ws.today);
  const price = compPrice(c).value;
  const size = f.area_sqft ? `${f.area_sqft.value.toLocaleString('en-US')} sq ft` : null;
  const bb = [f.beds ? `${f.beds.value} bd` : null, f.baths ? `${f.baths.value} ba` : null].filter(Boolean).join(' · ');
  const line = [
    price ? `${shortPrice(price)} ${compStatus(c) === 'sold' ? 'sale' : 'ask'}` : null,
    ws.sf ? size : null,
    bb || null,
    f.status_date ? monthYear(f.status_date.value) : null,
    where.sameBuilding ? 'Same building' : where.miles !== null ? `${where.miles.toFixed(1)} mi` : null,
  ].filter(Boolean).join(' · ');
  const rc = c.judgment?.reportCompId ?? null;
  const address = compAddress(c);
  function remove() {
    if (!rc || ws.readOnly) return;
    setBusy(true);
    ws.editComp(rc, { removed: true })
      .then(() => ws.toast(`${address} is out of the report.`, {
        label: 'Undo',
        run: () => void ws.editComp(rc, { removed: false }).catch((e: unknown) => ws.toast(`Not put back: ${message(e)}`)),
      }))
      .catch((e: unknown) => {
        ws.toast(`Not saved: ${message(e)}`);
        setBusy(false);
      });
  }
  return (
    <div className="ac-row">
      <RowThumb photo={c.judgment?.photos?.[0]} className="ac-thumb" />
      <span className="ac-text">
        <span className="ac-addr" title={address}>{address}</span>
        {line && <span className="ac-line">{line}</span>}
        {vs && <span className="ac-vs">vs {home}: {vs}</span>}
        {flags[0] && <span className="ac-flag" title={flags.map((x) => x.short).join(' · ')}>{flags.map((x) => x.short).join(' · ')}</span>}
        {c.unsortable && <span className="ac-flag">{c.unsortable}</span>}
      </span>
      <span className="ac-end">
        <span className="ac-src">{sourceOf(ws, c)}</span>
        {!ws.readOnly && rc && <button type="button" className="ac-x" aria-label={`Remove ${address}`} disabled={busy} onClick={remove}>×</button>}
      </span>
    </div>
  );
}

function ReadingRow({ r, now }: { r: LinkReadView; now: number }) {
  const pct = readPercent(Math.max(0, now - (Date.parse(r.startedAt ?? r.createdAt) || now)));
  return (
    <div className="ac-row reading" aria-busy="true">
      <span className="ac-thumb reading" aria-hidden="true" />
      <span className="ac-text">
        <span className="ac-addr">{readTitle(r)}</span>
        <span className="ac-line">Reading its StreetEasy page…</span>
      </span>
      <span className="ac-end">
        <span className="ac-pct" aria-label={`Reading, ${pct}%`}>{pct}%</span>
        <span className="ac-src">From its link</span>
      </span>
    </div>
  );
}

function FailedRow({ ws, r }: { ws: Workspace; r: LinkReadView }) {
  const [typing, setTyping] = useState(false);
  const clear = () => ws.run('Clearing…', async () => ws.applyLinks(await linksApi.dismiss(ws.reportId, r.id)));
  return (
    <>
      <div className="ac-row bad">
        <span className="ac-thumb" aria-hidden="true" />
        <span className="ac-text">
          <span className="ac-addr">{readTitle(r)}</span>
          <span className="ac-err">StreetEasy didn’t let this page be read{r.errorMessage ? `: ${r.errorMessage}` : ''}</span>
          {!ws.readOnly && (
            <span className="ac-fix">
              {mayRetry(r) && (
                <button type="button" className="ac-bo small" disabled={Boolean(ws.busy)} onClick={() => void ws.run('Trying the link again…', () => retryRead(ws.reportId, r, ws.applyLinks))}>
                  TRY AGAIN
                </button>
              )}
              <button type="button" className="ac-lk" aria-expanded={typing} onClick={() => setTyping(!typing)}>Type it in</button>
            </span>
          )}
        </span>
        <span className="ac-end">
          <span className="ac-src">From its link</span>
          {!ws.readOnly && <button type="button" className="ac-x" aria-label="Clear" disabled={Boolean(ws.busy)} onClick={() => void clear()}>×</button>}
        </span>
      </div>
      {typing && (
        <div className="ac-row-form">
          <CompForm
            ws={ws}
            prefill={prefillFrom(r)}
            onCancel={() => setTyping(false)}
            onDone={() => {
              setTyping(false);
              void clear();
            }}
          />
        </div>
      )}
    </>
  );
}

export function AddCompsScreen({ ws }: { ws: Workspace }) {
  const [note, setNote] = useState<string | null>(null);
  const drop = useDropTarget(ws, setNote);
  const outById = useMemo(() => new Map<string, CompOut>((ws.output?.comps ?? []).map((c) => [c.id, c])), [ws.output]);
  const compReads = ws.reads.filter((r) => r.purpose === 'comp');
  const reading = compReads.filter((r) => r.status === 'queued' || r.status === 'running');
  const failed = compReads.filter((r) => r.status === 'failed');
  const now = useNow(reading.length > 0);
  const groups = STATUS_ORDER.map((s) => ({ s, list: ws.comps.filter((c) => compStatus(c) === s) }));
  const unknown = ws.comps.filter((c) => !compStatus(c));
  const any = ws.comps.length > 0 || reading.length > 0 || failed.length > 0;

  return (
    <div className="ac" {...drop.handlers}>
      {drop.veil}
      {ws.readOnly ? <p className="ac-note">Read only: this is another agent’s report.</p> : (
        <PasteBlock ws={ws} note={note} onNote={setNote} compact={ws.comps.length > 0} />
      )}

      <div className="ac-tally" aria-label="Comps by status">
        {groups.map((g) => (
          <div key={g.s}>
            <span className="ac-tally-top">
              <span className="ac-k">{STATUS_LABEL[g.s]}</span>
              <span className="ac-tally-n">{g.list.length}<span className="ac-tally-of"> / {TALLY_AIM}</span></span>
            </span>
            <b><i style={{ width: `${Math.min(100, (g.list.length / TALLY_AIM) * 100)}%` }} /></b>
          </div>
        ))}
      </div>

      {any && (
        <div className="ac-list">
          {reading.length > 0 && (
            <section className="ac-group" aria-label="Reading">
              <h3 className="ac-group-h">Reading <span>{reading.length}</span></h3>
              {reading.map((r) => <ReadingRow key={r.id} r={r} now={now} />)}
            </section>
          )}
          {failed.length > 0 && (
            <section className="ac-group" aria-label="Couldn’t read">
              <h3 className="ac-group-h">Couldn’t read <span>{failed.length}</span></h3>
              {failed.map((r) => <FailedRow key={r.id} ws={ws} r={r} />)}
            </section>
          )}
          {groups.filter((g) => g.list.length).map((g) => (
            <section key={g.s} className="ac-group" aria-label={STATUS_LABEL[g.s]}>
              <h3 className="ac-group-h">{STATUS_LABEL[g.s]} <span>{g.list.length}</span></h3>
              {g.list.map((c) => <Fragment key={c.id}><CompRow ws={ws} c={c} out={outById.get(c.id)} /></Fragment>)}
            </section>
          ))}
          {unknown.length > 0 && (
            <section className="ac-group" aria-label="Can’t be sorted">
              <h3 className="ac-group-h">Can’t be sorted <span>{unknown.length}</span></h3>
              {unknown.map((c) => <CompRow key={c.id} ws={ws} c={c} out={outById.get(c.id)} />)}
            </section>
          )}
        </div>
      )}
      <ImportNotes ws={ws} />
      <div className="ac-notes">
        <StepNotes ws={ws} where="notesComps" hint="about the comps you picked" placeholder="e.g. Found these on a Saturday tour" />
      </div>

      <div className="ac-foot">
        {!ws.readOnly && <button type="button" className="ac-bo" onClick={() => ws.openStart('client')}>← BACK</button>}
        <span className="ac-foot-gap" />
        <span className="ac-foot-status" aria-live="polite">
          {reading.length ? `${reading.length} still reading: they keep going and land on Sort` : ws.comps.length ? `${ws.comps.length} comp${ws.comps.length === 1 ? '' : 's'} in · ✓ Saved as you go` : '✓ Saved as you go'}
        </span>
        <button type="button" className="ac-bp ac-next" disabled={!ws.comps.length} onClick={() => ws.go('sort')}>NEXT: SORT →</button>
      </div>
    </div>
  );
}
