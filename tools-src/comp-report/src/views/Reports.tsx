// The reports list (the handoff, screen 2): the hero, then a table of the agent's reports — a hatched
// block where a photo will go (photos are a follow-up), the address with the client and a Sample badge,
// the side, the stage with its square, and when it was updated. Headers sort; ten rows show, then
// "Show N more". Client, side and stage come with the list in one call.
import { useEffect, useMemo, useState } from 'react';
import { api, type Me, type Report } from '../api.ts';
import { Access } from './Access.tsx';
import { NewCompStart } from './newcomp/NewComp.tsx';
import { Center, StateLine } from './shell/Pieces.tsx';
import {
  COLUMNS, DEFAULT_SORT, PAGE_SIZE, STAGE_SQUARE, nextSort, screenFor, sortReports, stageLabel, stageOf, updatedLabel, type SortState,
} from './shell/reports-list.ts';
import type { ScreenId } from './workspace/screens.ts';

const SAMPLE_TITLE = 'Sample data was used in this report. Nothing in it is for clients.';

function Hero() {
  return (
    <section className="sh-hero">
      <h1>Comp<br />report</h1>
      <p>Bring the comps you found on StreetEasy, work through them, and leave with a defensible range and a client-ready email.</p>
    </section>
  );
}

function hrefFor(r: Report): string {
  const step = screenFor(r);
  return `?report=${r.id}${step ? `&step=${step}` : ''}`;
}

export function Reports({ me, onOpen }: { me: Me; onOpen: (id: string, start?: 'details', step?: ScreenId) => void }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [all, setAll] = useState(false);
  const ready = me.database === 'ready';

  useEffect(() => {
    if (!ready) return;
    api<{ reports: Report[] }>('/api/comp-report/reports').then(
      (r) => setReports(r.reports),
      (e) => setError(e.message),
    );
  }, [ready]);

  const sorted = useMemo(() => sortReports(reports ?? [], sort), [reports, sort]);

  if (!ready) {
    return (
      <>
        <Hero />
        <Center>
          <div className="sh-card">
            <p className="eyebrow mid">Reports</p>
            <h1 className="sh-card-title sm">Signed in as {me.user.email} ({me.user.role}).</h1>
            <p className="sh-help">Saved reports need the database, which isn’t set up for this site yet.</p>
          </div>
        </Center>
      </>
    );
  }

  const empty = reports?.length === 0;
  const shown = all ? sorted : sorted.slice(0, PAGE_SIZE);
  const hidden = sorted.length - PAGE_SIZE;
  const newComp = (
    <button type="button" className="btn primary" onClick={() => setStarting(true)}>+ New comp</button>
  );

  return (
    <>
      <Hero />
      <main className="sh-reports">
        <div className="sh-reports-head">
          <h2 className="sh-reports-title">Your reports</h2>
          <span className="sh-reports-count">{reports && !empty ? reports.length : ''}</span>
          <span className="sh-reports-new">{!empty && newComp}</span>
        </div>
        {starting && <NewCompStart me={me} onCreated={(id) => onOpen(id, 'details')} onClose={() => setStarting(false)} />}
        {error && <p className="sh-note error" role="alert">{error}</p>}
        {reports === null && !error && <StateLine>Loading…</StateLine>}

        {empty && (
          <div className="sh-empty">
            <div className="sh-empty-squares" aria-hidden="true">
              <span style={{ background: 'var(--cb-black)' }} />
              <span style={{ background: 'var(--cb-lavender)' }} />
              <span style={{ border: '1px solid var(--cb-black)' }} />
              <span style={{ background: 'var(--cb-sand)' }} />
            </div>
            <p className="sh-empty-title">No reports yet</p>
            {newComp}
            <p className="sh-help">The home, its details, then the comps</p>
          </div>
        )}

        {reports && !empty && (
          <div className="sh-table">
            <div className="sh-grid sh-thead">
              <span />
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    className={`sh-th${c.align === 'right' ? ' right' : ''}${active ? ' on' : ''}`}
                    aria-label={`Sort by ${c.label}${active ? (sort.dir === 1 ? ', ascending' : ', descending') : ''}`}
                    onClick={() => setSort(nextSort(sort, c.key))}
                  >
                    {c.label} {active ? (sort.dir === 1 ? '↑' : '↓') : ''}
                  </button>
                );
              })}
            </div>
            <ul className="sh-rows">
              {shown.map((r) => (
                <li key={r.id}>
                  <a
                    className="sh-grid sh-row"
                    href={hrefFor(r)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // a new tab opens the link as it is
                      e.preventDefault();
                      onOpen(r.id, undefined, screenFor(r));
                    }}
                  >
                    <span className="sh-thumb" aria-hidden="true" />
                    <span className="sh-home">
                      <span className="sh-addr">
                        {r.title}
                        {r.sampleData && <span className="sh-sample" title={SAMPLE_TITLE}>Sample</span>}
                      </span>
                      <span className="sh-client">{r.client ?? ''}</span>
                    </span>
                    <span className="sh-side">{r.side === 'seller' ? 'Seller' : r.side === 'buyer' ? 'Buyer' : ''}</span>
                    <span className="sh-stage">
                      <span className={`sq ${STAGE_SQUARE[stageOf(r)]}`} aria-hidden="true" />
                      {stageLabel(r)}
                    </span>
                    <span className="sh-updated">{updatedLabel(r.updatedAt)}</span>
                  </a>
                </li>
              ))}
            </ul>
            {hidden > 0 && (
              <button type="button" className="sh-more" aria-expanded={all} onClick={() => setAll(!all)}>
                {all ? 'Show fewer' : `Show ${hidden} more`}
              </button>
            )}
          </div>
        )}

        {me.user.role === 'admin' && (
          <details className="sh-access">
            <summary>Access · admins only</summary>
            <Access me={me} />
          </details>
        )}
      </main>
    </>
  );
}
