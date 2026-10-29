// The reports list (the handoff, screen 2): the hero, then a table of the agent's reports — a hatched
// block where a photo will go (photos are a follow-up), the address with the client and a Sample badge,
// the side, the stage with its square, and when it was updated. Headers sort; ten rows show, then
// "Show N more". Client, side and stage come with the list in one call. Each row can be archived (and a
// sample report deleted, Kimani's decision of 2026-10-22); the archived ones fold at the bottom, with Restore.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Me, type Report } from '../api.ts';
import { trackScreen } from '../activity.ts';
import { Access } from './Access.tsx';
import { MenteePicker, loadMentees, type MenteesState } from './Mentees.tsx';
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

type Action = 'archive' | 'restore' | 'delete';

const DELETE_ASK = 'Delete this sample report? It can’t be brought back.';

function changeStatus(r: Report, action: Action) {
  return api<{ report: Report }>('/api/comp-report/reports', { method: 'PATCH', body: { id: r.id, action } });
}

/** Delete, for a sample report only: a real one is archived (and can be restored). */
function DeleteButton({ r, busy, onAct }: { r: Report; busy: boolean; onAct: (r: Report, a: Action) => void }) {
  if (!r.sampleData) return null;
  return (
    <button type="button" className="link sh-act" disabled={busy} onClick={() => confirm(DELETE_ASK) && onAct(r, 'delete')}>
      Delete
    </button>
  );
}

/** The archived reports, folded under the list: fetched when it opens, each with Restore. */
function Archived({ refresh, busy, onAct }: { refresh: number; busy: boolean; onAct: (r: Report, a: Action) => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    api<{ reports: Report[] }>('/api/comp-report/reports?archived=1').then(
      (r) => setRows(r.reports),
      (e) => setError(e.message),
    );
  }, [open, refresh]);
  return (
    <details className="sh-access sh-archived" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Archived</summary>
      <div className="sh-access-body">
        {error && <p className="sh-note error" role="alert">{error}</p>}
        {rows === null && !error && <StateLine>Loading…</StateLine>}
        {rows?.length === 0 && <p className="sh-help">Nothing archived.</p>}
        {rows && rows.length > 0 && (
          <ul className="sh-access-list">
            {rows.map((r) => (
              <li key={r.id} className="sh-access-entry">
                <span>
                  <span className="sh-access-who">{r.title}</span>
                  {r.sampleData && <span className="sh-sample sh-archived-badge" title={SAMPLE_TITLE}>Sample</span>}
                  <p className="sh-help">{r.client ? `${r.client} · ` : ''}{stageLabel(r)} · archived {updatedLabel(r.updatedAt)}</p>
                </span>
                <span className="sh-access-confirm">
                  <DeleteButton r={r} busy={busy} onAct={onAct} />
                  <button type="button" className="btn" disabled={busy} onClick={() => onAct(r, 'restore')}>Restore</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
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
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const ready = me.database === 'ready';
  // Admins and mentors read everyone's reports (NW-088 a, NB-23 A) on a tab of their own; only the
  // owner changes one. A mentor's Everyone's opens on their mentees when they have any (Kimani, 2026-10-27).
  const reader = me.user.role === 'admin' || me.user.role === 'mentor';
  const mentor = me.user.role === 'mentor';
  const [tab, setTab] = useState<'mine' | 'everyone'>('mine');
  const [mentees, setMentees] = useState<MenteesState | null>(null);
  const [allAgents, setAllAgents] = useState(false);
  const [picking, setPicking] = useState(false);
  const mine = (r: Report) => r.ownerEmail.toLowerCase() === me.user.email.toLowerCase();
  const onEveryone = reader && tab === 'everyone';
  const byMentees = onEveryone && mentor && !allAgents && Boolean(mentees?.mentees.length);

  useEffect(() => {
    if (ready && mentor) loadMentees().then(setMentees, () => setMentees({ mentees: [], agents: [] }));
  }, [ready, mentor]);

  // A mentor's Everyone's waits for their mentees, so it doesn't flash every agent's reports first.
  const url = !onEveryone ? '/api/comp-report/reports'
    : mentor && !mentees ? null
      : `/api/comp-report/reports?scope=all${byMentees ? '&mentees=1' : ''}`;
  const load = useCallback(() => (url ? api<{ reports: Report[] }>(url).then(
    (r) => setReports(r.reports),
    (e) => setError(e.message),
  ) : Promise.resolve()), [url]);
  useEffect(() => {
    if (!ready) return;
    setReports(null);
    setError(null);
    setAll(false);
    void load();
  }, [ready, load]);

  // Archive, restore or delete, then both lists again.
  const act = useCallback(async (r: Report, action: Action) => {
    setBusy(true);
    setError(null);
    try {
      await changeStatus(r, action);
      await load();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [load]);

  const sorted = useMemo(() => sortReports(reports ?? [], sort), [reports, sort]);
  useEffect(() => {
    if (ready) trackScreen(starting ? 'new-report' : 'reports');
  }, [ready, starting]);

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
          {reader ? (
            <div className="sh-seg" role="tablist" aria-label="Reports">
              {(['mine', 'everyone'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                  {t === 'mine' ? 'Your reports' : 'Everyone’s'}
                </button>
              ))}
            </div>
          ) : <h2 className="sh-reports-title">Your reports</h2>}
          <span className="sh-reports-count">{reports && !empty ? reports.length : ''}</span>
          <span className="sh-reports-new">{!empty && !onEveryone && newComp}</span>
        </div>
        {onEveryone && mentor && mentees && (
          <div className="sh-filter">
            {mentees.mentees.length ? (
              <>
                <div className="sh-seg" role="group" aria-label="Whose reports">
                  <button type="button" aria-pressed={!allAgents} className={allAgents ? '' : 'on'} onClick={() => setAllAgents(false)}>
                    Your mentees ({mentees.mentees.length})
                  </button>
                  <button type="button" aria-pressed={allAgents} className={allAgents ? 'on' : ''} onClick={() => setAllAgents(true)}>All agents</button>
                </div>
                <button type="button" className="link" onClick={() => setPicking(true)}>Edit mentees</button>
              </>
            ) : (
              <>
                <span className="sh-help">Showing every agent’s reports. Pick your mentees to see just theirs.</span>
                <button type="button" className="link" onClick={() => setPicking(true)}>Pick your mentees</button>
              </>
            )}
          </div>
        )}
        {picking && mentees && (
          <MenteePicker
            state={mentees}
            onSaved={(list) => {
              setMentees({ ...mentees, mentees: list });
              setAllAgents(false);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}
        {starting && <NewCompStart me={me} onCreated={(id) => onOpen(id, 'details')} onClose={() => setStarting(false)} />}
        {error && <p className="sh-note error" role="alert">{error}</p>}
        {reports === null && !error && <StateLine>Loading…</StateLine>}

        {empty && onEveryone && (
          <div className="sh-empty">
            <p className="sh-empty-title">{byMentees ? 'Your mentees have no reports yet' : 'No reports yet'}</p>
          </div>
        )}

        {empty && !onEveryone && (
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
            <div className="sh-grid sh-thead with-acts">
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
                <li key={r.id} className="sh-li">
                  <a
                    className="sh-grid sh-row"
                    href={hrefFor(r)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // a new tab opens the link as it is
                      e.preventDefault();
                      onOpen(r.id, undefined, screenFor(r));
                    }}
                  >
                    <span className="sh-thumb" aria-hidden="true" title="Photos come later." />
                    <span className="sh-home">
                      <span className="sh-addr">
                        {r.title}
                        {r.sampleData && <span className="sh-sample" title={SAMPLE_TITLE}>Sample</span>}
                      </span>
                      <span className="sh-client">{mine(r) ? (r.client ?? '') : [r.ownerName ?? r.ownerEmail, r.client].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="sh-side">{r.side === 'seller' ? 'Seller' : r.side === 'buyer' ? 'Buyer' : ''}</span>
                    <span className="sh-stage">
                      <span className={`sq ${STAGE_SQUARE[stageOf(r)]}`} aria-hidden="true" />
                      {stageLabel(r)}
                    </span>
                    <span className="sh-updated">{updatedLabel(r.updatedAt)}</span>
                  </a>
                  <span className="sh-row-acts">
                    {mine(r) && (
                      <>
                        <button type="button" className="link sh-act" disabled={busy} title="Moves it to Archived, below. You can restore it." onClick={() => void act(r, 'archive')}>
                          Archive
                        </button>
                        <DeleteButton r={r} busy={busy} onAct={(x, a) => void act(x, a)} />
                      </>
                    )}
                  </span>
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

        {reports && !empty && (
          <p className="sh-help">{onEveryone
            ? 'You can open any agent’s report to read it. Only its owner can change it.'
            : 'Mentors and admins can read your reports. Only you can change them.'}</p>
        )}

        {!onEveryone && <Archived refresh={refresh} busy={busy} onAct={(x, a) => void act(x, a)} />}

        {me.user.role === 'admin' && (
          <details className="sh-access" onToggle={(e) => { if (e.currentTarget.open) trackScreen('access'); }}>
            <summary>Access · admins only</summary>
            <Access me={me} reports={sorted} />
          </details>
        )}
      </main>
    </>
  );
}
