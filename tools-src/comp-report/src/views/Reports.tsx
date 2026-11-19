// The reports list (the design pass, "1 · Reports", 2026-11-06; first built from the handoff's screen 2).
// The hero: "Comp report", and at its right Pick up where you left off (the newest open report). Then the
// list's header row (the tabs or "Your reports", the numbers, search, + NEW COMP, which grows a field and
// becomes START →: new-comp.md §1, 2026-11-11) and the table: the home's photo, the
// address with the client and a Sample badge, the side, the range once Findings has one, the comps, and
// the stage with the date. Every header sorts (↑, ↓, then cleared); ten rows show, then "Show N more".
// Everything comes with the list in one call. A row's archive (and a sample's delete, Kimani's decision of
// 2026-10-22) sit in the page margin on hover; the archived ones fold at the bottom, with Restore.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Me, type Report } from '../api.ts';
import { clientPrice } from '../../workspace/format.ts';
import { trackScreen } from '../activity.ts';
import { Access } from './Access.tsx';
import { MenteePicker, loadMentees, type MenteesState } from './Mentees.tsx';
import { startReport } from './newcomp/NewComp.tsx';
import { readStartWords } from './newcomp/start-words.ts';
import type { StartScreen } from './newcomp/steps.ts';
import { Center, StateLine } from './shell/Pieces.tsx';
import {
  COLUMNS, DEFAULT_SORT, PAGE_SIZE, followUpDue, followUpIsDue, followUpLine, thumbWords, whenOf, workedAt, STAGE_SQUARE, compsLabel, listStats, matchesSearch, nextSort, pickUp, rangeLabel, screenFor, shortDate,
  sortReports, stageLabel, stageOf, updatedLabel, type SortState,
} from './shell/reports-list.ts';
import { Dialog } from './shell/Dialog.tsx';
import { InBar } from './shell/slots.tsx';
import { roleBadge } from './shell/TopBar.tsx';
import type { ScreenId } from './workspace/screens.ts';

const SAMPLE_TITLE = 'Sample data was used in this report. Nothing in it is for clients.';

function Hero({ pick, onPick, followUp = null }: {
  pick: Report | null;
  onPick: (r: Report) => void;
  /** Hubert's follow-up reminder: a sent report whose What's next follow-up is due and not ticked. */
  followUp?: { report: Report; line: string } | null;
}) {
  return (
    <section className="sh-hero">
      <div className="sh-hero-in">
        <div className="sh-hero-main">
          <h1>Comp<br />report</h1>
          <p>Bring the comps you found on StreetEasy, work through them, and leave with a defensible range and a client-ready email.</p>
        </div>
        {(pick || followUp) && (
          <div className="sh-hero-side">
            {followUp && (
              <a
                className="sh-pick sh-follow"
                href={hrefFor(followUp.report)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onPick(followUp.report);
                }}
              >
                <span className="sh-pick-eyebrow"><span aria-hidden="true">✦ </span>Hubert · time to follow up</span>
                <span className="sh-pick-addr">{followUp.report.title}</span>
                <span className="sh-pick-stage">{followUp.line}</span>
                <span className="sh-pick-go">Open Done →</span>
              </a>
            )}
            {pick && (
              <a
                className="sh-pick"
                href={hrefFor(pick)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onPick(pick);
                }}
              >
                <span className="sh-pick-eyebrow">Pick up where you left off</span>
                <span className="sh-pick-addr">{pick.title}</span>
                <span className="sh-pick-stage"><span className={`sq ${STAGE_SQUARE[stageOf(pick)]}`} aria-hidden="true" />{stageLabel(pick)}</span>
                <span className="sh-pick-go">Continue →</span>
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * + NEW COMP (new-comp.md §1, 2026-11-11): clicking it grows a field out to its left, and the button becomes
 * START →. A link or an address, then Enter or START, makes the report and opens the New comp window on Basics.
 * × or Escape folds it back. Words with the link ("buyer, Jordan and Sam") fill Basics too.
 */
function NewCompStart({ onStarted, open: initiallyOpen = false }: { onStarted: (id: string) => void; open?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const fold = () => {
    if (busy) return;
    setOpen(false);
    setText('');
    setError(null);
  };
  async function start() {
    if (!open) {
      setOpen(true);
      window.setTimeout(() => field.current?.focus(), 120);
      return;
    }
    if (busy) return;
    const w = readStartWords(text);
    if (!w.home || (w.home.kind === 'typed' && w.home.address.trim().length < 3)) {
      setError(text.trim() ? 'Paste its StreetEasy link, or type the full address.' : null);
      field.current?.focus();
      return;
    }
    if (w.home.kind === 'bad-link') {
      setError(w.home.reason);
      field.current?.focus();
      return;
    }
    setError(null);
    setBusy(w.home.kind === 'link' ? 'Starting the report and reading the listing…' : 'Starting the report…');
    try {
      const id = await startReport({
        home: w.home, side: w.side ?? 'buyer', client: w.client ?? '', type: w.type ?? 'coop', typePicked: Boolean(w.type), price: w.price,
      });
      onStarted(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }
  return (
    <span className={`sh-nc${open ? ' open' : ''}`}>
      <span className="sh-nc-field">
        <label htmlFor="sh-nc-line" className="sh-sr">A StreetEasy link, or the address</label>
        <input
          id="sh-nc-line"
          ref={field}
          className="sh-nc-input"
          tabIndex={open ? 0 : -1}
          aria-hidden={!open || undefined}
          placeholder="Paste a StreetEasy link, or type the address"
          value={text}
          disabled={Boolean(busy)}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void start(); }
            if (e.key === 'Escape') { e.preventDefault(); fold(); }
          }}
        />
        {(busy || error) && <span className={`sh-nc-msg${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>{error ?? busy}</span>}
      </span>
      <button type="button" className="btn primary sh-nc-go" disabled={Boolean(busy)} onClick={() => void start()}>
        {open ? 'Start →' : '+ New comp'}
      </button>
      <span className="sh-nc-x-wrap">
        <button type="button" className="sh-nc-x" aria-label="Cancel" tabIndex={open ? 0 : -1} onClick={fold}>×</button>
      </span>
    </span>
  );
}

/** The archive and trash icons in the row's margin (the design pass). */
const ArchiveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="3.5" /><path d="M2.5 6V13.5H13.5V6" /><path d="M6 9H10" /></svg>
);
const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2.5 4H13.5" /><path d="M6 4V2.5H10V4" /><path d="M3.5 4L4.5 13.5H11.5L12.5 4" /><path d="M6.5 6.5V11M9.5 6.5V11" /></svg>
);
const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" /><path d="M10.5 5.5V2.5H2.5V10.5H5.5" /></svg>
);
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
);

const PHOTO_FROM: Record<'sample' | 'building', string> = { sample: 'Sample photo', building: 'Same building' };

/**
 * The home's photo from its StreetEasy page, linked. A sample's comes from the sample's stored photos; a home
 * with no read of its own, from another unit in the same building, marked so. With none, or one that won't load,
 * the address set in type.
 */
function Thumb({ r }: { r: Report }) {
  const [broken, setBroken] = useState(false);
  if (!r.photo || broken) {
    const w = thumbWords(r.title);
    return (
      <span className="sh-thumb sh-thumb-type" aria-hidden="true">
        {w.number && <b>{w.number}</b>}
        <span>{w.street}</span>
      </span>
    );
  }
  const from = r.photoFrom === 'sample' || r.photoFrom === 'building' ? PHOTO_FROM[r.photoFrom] : null;
  const img = <img className="sh-thumb" src={r.photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return from ? <span className="sh-thumb-wrap" title={from === 'Same building' ? 'No photo of this home yet: this one is of another unit in its building.' : undefined}>{img}<span className="sh-thumb-from">{from}</span></span> : img;
}

type Action = 'archive' | 'restore' | 'delete';

const DELETE_ASK = 'Delete this sample report? It can’t be brought back.';

function changeStatus(r: Report, action: Action) {
  return api<{ report: Report }>('/api/comp-report/reports', { method: 'PATCH', body: { id: r.id, action } });
}

/** Delete, for a sample report only: a real one is archived (and can be restored). */
function DeleteButton({ r, busy, onAct, icon = false }: { r: Report; busy: boolean; onAct: (r: Report, a: Action) => void; icon?: boolean }) {
  if (!r.sampleData) return null;
  if (icon) {
    return (
      <button type="button" className="sh-ia del" aria-label={`Delete ${r.title} (a sample report)`} title="Delete (sample reports only)" disabled={busy} onClick={() => confirm(DELETE_ASK) && onAct(r, 'delete')}>
        <TrashIcon />
      </button>
    );
  }
  return (
    <button type="button" className="link sh-act" disabled={busy} onClick={() => confirm(DELETE_ASK) && onAct(r, 'delete')}>
      Delete
    </button>
  );
}

/**
 * Duplicate (Kimani, 2026-11-06): a new report with the same home, details, comps, tiers and reads, to work
 * on again without starting over. Hubert's chat comes along only when ticked (off by default).
 */
function DuplicateDialog({ r, onDone, onClose }: { r: Report; onDone: (id: string) => void; onClose: () => void }) {
  const [chat, setChat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const { report } = await api<{ report: Report }>('/api/comp-report/reports', { method: 'POST', body: { duplicateOf: r.id, carryChat: chat } });
      onDone(report.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Duplicate report"
      testId="duplicate-report"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="link" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void go()}>{busy ? 'Duplicating…' : 'Duplicate'}</button>
        </>
      )}
    >
      <p className="sh-dlg-lead">{r.title}</p>
      <p className="sh-help">A new report with the same home, details, comps and tiers, and the listings already read. This one stays as it is.</p>
      <label className="sh-switch-row">
        <input type="checkbox" role="switch" checked={chat} onChange={(e) => setChat(e.target.checked)} />
        <span>
          <span className="sh-switch-label">Carry over the chat with Hubert</span>
          <span className="sh-help">Off: Hubert starts fresh on the copy. On: he picks up the conversation where it left off.</span>
        </span>
      </label>
      {error && <p className="sh-note error" role="alert">{error}</p>}
    </Dialog>
  );
}

/** The archived reports, folded under the list: fetched when it opens, each with Restore. */
function Archived({ refresh, busy, onAct }: { refresh: number; busy: boolean; onAct: (r: Report, a: Action) => void }) {
  const [rows, setRows] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fetched with the page, so the fold can say how many: "Archived (2)".
  useEffect(() => {
    api<{ reports: Report[] }>('/api/comp-report/reports?archived=1').then(
      (r) => setRows(r.reports),
      (e) => setError(e.message),
    );
  }, [refresh]);
  return (
    <details className="sh-access sh-archived">
      <summary>Archived{rows ? ` (${rows.length})` : ''}</summary>
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

export function Reports({ me, onOpen }: { me: Me; onOpen: (id: string, start?: StartScreen, step?: ScreenId) => void }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [own, setOwn] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState<Report | null>(null);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const ready = me.database === 'ready';
  // Admins and mentors read other agents' reports (NW-088 a, NB-23 A) on a tab of their own, Mentee reports;
  // only the owner changes one. A mentor's opens on their mentees when they have any (Kimani, 2026-10-27).
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

  // A mentor's Mentee reports waits for their mentees, so it doesn't flash every agent's reports first.
  const url = !onEveryone ? '/api/comp-report/reports'
    : mentor && !mentees ? null
      : `/api/comp-report/reports?scope=all${byMentees ? '&mentees=1' : ''}`;
  const load = useCallback(() => (url ? api<{ reports: Report[] }>(url).then(
    (r) => {
      setReports(r.reports);
      if (url === '/api/comp-report/reports') setOwn(r.reports);
    },
    (e) => setError(e.message),
  ) : Promise.resolve()), [url]);
  useEffect(() => {
    if (!ready) return;
    setReports(null);
    setError(null);
    setAll(false);
    void load();
  }, [ready, load]);
  // Pick up where you left off is the agent's own, whichever tab is showing.
  useEffect(() => {
    if (ready && onEveryone && own === null) api<{ reports: Report[] }>('/api/comp-report/reports').then((r) => setOwn(r.reports), () => setOwn([]));
  }, [ready, onEveryone, own]);

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
  const found = useMemo(() => sorted.filter((r) => matchesSearch(r, q)), [sorted, q]);
  useEffect(() => {
    if (ready) trackScreen('reports');
  }, [ready]);

  const badge = roleBadge(me.user.role);
  const bar = badge ? <InBar where="pills"><span className="sh-role-badge">{badge}</span></InBar> : null;

  if (!ready) {
    return (
      <>
        <Hero pick={null} onPick={() => {}} />
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
  const shown = all || q.trim() ? found : found.slice(0, PAGE_SIZE);
  const hidden = q.trim() ? 0 : found.length - PAGE_SIZE;
  const newComp = <NewCompStart onStarted={(id) => onOpen(id, 'basics')} />;
  const stats = listStats(reports ?? []);
  const numbers: [number, string][] = onEveryone && mentor && byMentees
    ? [[stats.reports, 'Reports'], [mentees?.mentees.length ?? 0, 'Mentees'], [stats.sentThisMonth, 'Sent this month']]
    : [[stats.reports, 'Reports'], [stats.open, 'Open'], [stats.sentThisMonth, 'Sent this month']];
  const pick = own ? pickUp(own) : null;
  const due = own ? followUpDue(own) : null;
  const followUp = due ? { report: due, line: followUpLine(due) } : null;

  return (
    <>
      {bar}
      <Hero
        pick={pick}
        onPick={(r) => onOpen(r.id, undefined, screenFor(r))}
        followUp={followUp}
      />
      <main className="sh-reports">
        <div className="sh-reports-head">
          {reader ? (
            <div className="sh-seg" role="tablist" aria-label="Reports">
              {(['mine', 'everyone'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                  {t === 'mine' ? 'Your reports' : 'Mentee reports'}
                </button>
              ))}
            </div>
          ) : <h2 className="sh-reports-title">Your reports</h2>}
          {reports && !empty && (
            <div className="sh-stats">
              {numbers.map(([n, label]) => (
                <span key={label} className="sh-stat"><span className="sh-stat-n">{n}</span><span className="sh-stat-l">{label}</span></span>
              ))}
              {onEveryone && mentor && mentees && (
                <button type="button" className="link sh-stat-link" onClick={() => setPicking(true)}>
                  {mentees.mentees.length ? 'Edit mentees' : 'Pick your mentees'}
                </button>
              )}
            </div>
          )}
          <span className="sh-reports-new">
            {searching && (
              <>
                <label htmlFor="sh-find" className="sh-sr">Search reports</label>
                <input
                  id="sh-find"
                  className="sh-find"
                  placeholder="Search address, client, agent…"
                  value={q}
                  autoFocus
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setQ('');
                      setSearching(false);
                    }
                  }}
                />
              </>
            )}
            {reports && !empty && (
              <button
                type="button"
                className="sh-srch"
                aria-label={searching ? 'Close the search' : 'Search reports'}
                aria-pressed={searching}
                onClick={() => {
                  if (searching) setQ('');
                  setSearching(!searching);
                }}
              >
                <SearchIcon />
              </button>
            )}
            {!empty && !onEveryone && newComp}
          </span>
        </div>
        {onEveryone && mentor && mentees && mentees.mentees.length > 0 && (
          <div className="sh-filter">
            <div className="sh-seg" role="group" aria-label="Whose reports">
              <button type="button" aria-pressed={!allAgents} className={allAgents ? '' : 'on'} onClick={() => setAllAgents(false)}>
                Your mentees ({mentees.mentees.length})
              </button>
              <button type="button" aria-pressed={allAgents} className={allAgents ? 'on' : ''} onClick={() => setAllAgents(true)}>All agents</button>
            </div>
          </div>
        )}
        {onEveryone && mentor && mentees && mentees.mentees.length === 0 && (
          <p className="sh-help">Showing every agent’s reports. Pick your mentees to see just theirs.</p>
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
        {copying && <DuplicateDialog r={copying} onClose={() => setCopying(null)} onDone={(id) => { setCopying(null); const at = screenFor(copying); onOpen(id, undefined, at === 'done' ? 'send' : at); }} />}
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
            <div className="sh-grid sh-thead">
              <span />
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    className={`sh-th${c.wide ? ' sh-wide' : ''}${active ? ' on' : ''}`}
                    aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    aria-label={`Sort by ${c.label}${active ? (sort.dir === 1 ? ', ascending' : ', descending') : ''}`}
                    onClick={() => setSort(nextSort(sort, c.key))}
                  >
                    {c.label}<span className="sh-th-arrow" aria-hidden="true">{active ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
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
                    <Thumb r={r} />
                    <span className="sh-home">
                      <span className="sh-addr">
                        {r.title}
                        {r.sampleData && <span className="sh-sample" title={SAMPLE_TITLE}>Sample</span>}
                      </span>
                      <span className="sh-client">
                        <span>{mine(r) ? (r.client ?? '') : [r.ownerName ?? r.ownerEmail, r.client].filter(Boolean).join(' · ')}</span>
                        {!mine(r) && r.ownerLevel && <span className="sh-level">{r.ownerLevel === 'practice' ? 'Practice' : 'Full'}</span>}
                      </span>
                      {!mine(r) && <span className="sh-ro">Read only</span>}
                    </span>
                    <span className="sh-side sh-wide">{r.side === 'seller' ? 'Seller' : r.side === 'buyer' ? 'Buyer' : ''}</span>
                    <span className={`sh-range sh-wide${r.rangeLow == null ? ' none' : ''}`}>{rangeLabel(r, clientPrice)}</span>
                    <span className="sh-comps sh-wide">{compsLabel(r)}</span>
                    <span className="sh-when sh-wide">
                      <span className="sh-stage">
                        <span className={`sq ${STAGE_SQUARE[stageOf(r)]}`} aria-hidden="true" />
                        {stageLabel(r)}
                      </span>
                      <span className="sh-updated" title={`Last worked on ${updatedLabel(workedAt(r))}`}>{shortDate(whenOf(r))}</span>
                      {mine(r) && followUpIsDue(r) && <span className="sh-followup" title={followUpLine(r)}>Follow up</span>}
                    </span>
                  </a>
                  {mine(r) && (
                    <span className="sh-row-acts">
                      <button type="button" className="sh-ia" aria-label={`Duplicate ${r.title}`} title="Duplicate: a new report with the same home, comps and details" disabled={busy} onClick={() => setCopying(r)}>
                        <CopyIcon />
                      </button>
                      <button type="button" className="sh-ia" aria-label={`Archive ${r.title}`} title="Archive: moves it to Archived, below. You can restore it." disabled={busy} onClick={() => void act(r, 'archive')}>
                        <ArchiveIcon />
                      </button>
                      <DeleteButton r={r} busy={busy} icon onAct={(x, a) => void act(x, a)} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {q.trim() && found.length === 0 && <p className="sh-nomatch">No reports match “{q.trim()}”.</p>}
            {hidden > 0 && (
              <button type="button" className="sh-more" aria-expanded={all} onClick={() => setAll(!all)}>
                {all ? 'Show fewer' : `Show ${hidden} more`}
              </button>
            )}
          </div>
        )}

        {reports && !empty && (
          <p className="sh-help">{onEveryone
            ? 'Other agents’ reports open read-only. Only their owner changes them.'
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
