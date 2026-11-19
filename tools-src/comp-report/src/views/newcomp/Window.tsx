// The New comp window (design pass, docs/comp-report/design-pass/new-comp.md, 2026-11-11; the canvas's
// "New comp · round 1"): the target property in seven steps, on its own page. Reports goes; behind the window
// is the page colour and the Studio's top bar. Hubert's panel is on the left, open by default and resizable
// (300–640px, the seam on its right edge); the window is centred in the space beside it.
//
// Top to bottom: TARGET PROPERTY (COMPS TO COMPARE on the last step) and ×; the home (its photo, address and
// what was read, the StreetEasy button, or the 0–100% counter while the page is read); the step rail; the
// step's title; its fields and notes; the footer. Between steps only the step's content moves.
//
// The same window is Edit details, from a workspace's ✎: headed EDIT TARGET PROPERTY, the six steps of the
// home, every one reachable, with today's Cancel and Save changes.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { cleanPhotoUrls, compRecordFromListing } from '../../../engine/index.ts';
import { typeFromListing } from '../../../workspace/features.ts';
import { checkListingLink } from '../../../workspace/links.ts';
import { onMarket, onMarketLine } from '../../../workspace/on-market.ts';
import { linksApi, type LinkReadView } from '../../api.ts';
import { useDropTarget } from '../comp/AddBar.tsx';
import { Hubert } from '../Hubert.tsx';
import type { Workspace } from '../workspace/model.ts';
import { useElapsed } from '../workspace/ReadingNotice.tsx';
import { inFlight } from '../workspace/reads.ts';
import { endNewReport, GuardContext, isNewReport } from './Frame.tsx';
import { TYPE_LABEL, typeFromPageKey } from './Home.tsx';
import { KIND_LABEL } from '../../../workspace/features.ts';
import { AmenitiesStep, BasicsStep, BuildingStep, ClientStep, CompsStep, GeneralStep, SharedStep, StepNotes } from './StepBodies.tsx';
import { EDIT_STEPS, STEPS, type StartScreen, type StepDef, type StepKey } from './steps.ts';
import '../../styles/newcomp.css';
import seLogo from '../../assets/streeteasy-logo.svg';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ─── Hubert's panel, on the left ────────────────────────────────────────────

const HUB_KEY = 'cr-nc-hubert-w';
const HUB_DEFAULT = 400;
const HUB_MIN = 300;
const HUB_MAX = 640;
const clampHub = (w: number) => Math.round(Math.min(HUB_MAX, Math.max(HUB_MIN, w)));

function savedHub(): number {
  try {
    const n = Number(localStorage.getItem(HUB_KEY));
    return n > 0 ? clampHub(n) : HUB_DEFAULT;
  } catch {
    return HUB_DEFAULT;
  }
}

function HubertPanel({ ws, width, onWidth }: { ws: Workspace; width: number; onWidth: (w: number) => void }) {
  const [dragging, setDragging] = useState(false);
  function start(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (dragging) onWidth(clampHub(e.clientX));
  }
  function stop(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 72 : 24;
    if (e.key === 'ArrowRight') onWidth(clampHub(width + step));
    else if (e.key === 'ArrowLeft') onWidth(clampHub(width - step));
    else if (e.key === 'Home') onWidth(HUB_MIN);
    else if (e.key === 'End') onWidth(HUB_MAX);
    else return;
    e.preventDefault();
  }
  return (
    <aside className={`nc-hub${dragging ? ' resizing' : ''}`} style={{ width }}>
      <div
        className="nc-seam"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Hubert"
        aria-valuenow={width}
        aria-valuemin={HUB_MIN}
        aria-valuemax={HUB_MAX}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onDoubleClick={() => onWidth(HUB_DEFAULT)}
        onKeyDown={key}
      />
      <Hubert ws={ws} side="left" />
    </aside>
  );
}

// ─── The home, at the top of the window ─────────────────────────────────────

/** The listing's first photo, from StreetEasy's image hosts only. */
function photoOf(read: LinkReadView | null): string | null {
  const ex = read?.status === 'done' ? read.extract : null;
  if (!ex) return null;
  return cleanPhotoUrls([ex['heroImageUrl'], ...(Array.isArray(ex['photos']) ? ex['photos'] : [])])[0] ?? null;
}

/** The read's page, when it's a StreetEasy https link: nothing else becomes a link. */
function streetEasyUrl(url: string | null | undefined): string | null {
  try {
    const u = new URL(url ?? '');
    return u.protocol === 'https:' && /(^|\.)streeteasy\.com$/.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

/** 0 to 99 while the page is read (a read takes one to two minutes), as the counter shows it. */
export function readPercent(elapsedMs: number): number {
  return Math.min(99, Math.max(1, Math.round(100 * (1 - Math.exp(-elapsedMs / 40_000)))));
}

// StreetEasy's own logo (dark blue), as Kimani gave it (2026-11-11).
const SE_LOGO = <img className="nc-se-logo" src={seLogo} alt="" aria-hidden="true" />;

function HomeRow({ ws, home, refused }: { ws: Workspace; home: LinkReadView | null; refused: string | null }) {
  const reading = Boolean(home && (home.status === 'queued' || home.status === 'running'));
  const elapsed = useElapsed(reading && home ? [home] : []);
  const photo = photoOf(home);
  const pageUrl = streetEasyUrl(home?.url);
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const i = ws.intake;
  const kind = i.kind?.value ? KIND_LABEL[i.kind.value] : TYPE_LABEL[ws.propertyType];
  const read = home?.status === 'done';
  const sub = reading
    ? 'Reading its StreetEasy page…'
    : home?.status === 'failed'
      ? `Its StreetEasy page couldn’t be read: ${home.errorMessage ?? 'try the link again'}. Fill the fields in yourself.`
      : !home && refused
        ? `Its StreetEasy page wasn’t read: ${refused} Fill the fields in yourself.`
        : home
          ? [kind, i.neighborhood?.value, i.beds && `${i.beds.value} bd`, i.baths && `${i.baths.value} ba`, i.floor && `Fl ${i.floor.value}`].filter(Boolean).join(' · ')
          : 'Typed address · no listing to read, so every field is yours to fill';
  // How long it's been listed and what its ask did, from its page (Kimani's notebook, 2026-10-27).
  const marketLine = useMemo(() => {
    if (!home || home.status !== 'done' || !home.extract) return null;
    try {
      return onMarketLine(onMarket(compRecordFromListing(home.extract, { as_of: home.asOf ?? ws.today, url: home.url }).record, ws.today));
    } catch {
      return null;
    }
  }, [home?.id, home?.status]);

  async function addLink() {
    const check = checkListingLink(link.trim());
    if (!check.ok) return setError(check.reason);
    setError(null);
    try {
      ws.applyLinks(await linksApi.add(ws.reportId, [check.url], 'subject'));
      setAdding(false);
      setLink('');
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div className="nc-home">
      <span className={`nc-thumb${photo ? '' : reading ? ' reading' : ' none'}`} style={photo ? { backgroundImage: `url("${photo.replace(/"/g, '%22')}")` } : undefined} aria-hidden="true" />
      <div className="nc-home-text">
        <span className="nc-home-name">{ws.report.title}</span>
        <span className="nc-home-sub">{sub}</span>
        {marketLine && <span className="nc-home-sub" title="From its StreetEasy page">{marketLine}</span>}
        {adding && (
          <span className="nc-addlink">
            <input
              className="nc-input"
              aria-label="Its StreetEasy link"
              placeholder="Paste its StreetEasy link"
              value={link}
              autoFocus
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addLink();
                if (e.key === 'Escape') { e.preventDefault(); setAdding(false); }
              }}
            />
            <button type="button" className="nc-bo small" onClick={() => void addLink()}>Read it</button>
            {error && <span className="nc-err" role="alert">{error}</span>}
          </span>
        )}
      </div>
      {reading && <span className="nc-pct" aria-live="polite" aria-label={`Reading the listing, ${readPercent(elapsed)}%`}>{readPercent(elapsed)}%</span>}
      {read && pageUrl && (
        <span className="nc-se-col">
          <a className="nc-se" href={pageUrl} target="_blank" rel="noopener noreferrer" aria-label="Open on StreetEasy">{SE_LOGO}<span aria-hidden="true">↗</span></a>
          <span className="nc-se-note"><span className="nc-dot" aria-hidden="true" />Filled from StreetEasy</span>
        </span>
      )}
      {!reading && !read && !ws.readOnly && !adding && (
        <button type="button" className="nc-se" onClick={() => setAdding(true)}>+ Add its {SE_LOGO} link</button>
      )}
    </div>
  );
}

// ─── The window ─────────────────────────────────────────────────────────────

const REACHED_KEY = (id: string) => `cr-nc-reached:${id}`;

function readReached(id: string): number {
  try {
    return Number(sessionStorage.getItem(REACHED_KEY(id))) || 0;
  } catch {
    return 0;
  }
}

/** What ✕ and Escape ask before dropping: a comp half typed (useCloseGuard). */
function useGuards(onClose: () => void) {
  const guards = useRef(new Set<string>());
  const [asking, setAsking] = useState(false);
  const register = useCallback((id: string, on: boolean) => {
    if (on) guards.current.add(id);
    else guards.current.delete(id);
    if (!guards.current.size) setAsking(false);
  }, []);
  const attempt = () => {
    if (!guards.current.size) return onClose();
    setAsking((a) => !a);
  };
  return { register, attempt, asking, setAsking };
}

/** The steps the listing fills: locked while its page is read. */
const LISTING_STEPS: ReadonlySet<string> = new Set(['general', 'shared', 'amenities', 'building']);

export function NewCompWindow({ ws, screen, onScreen, onDone, onReports }: {
  ws: Workspace;
  screen: StartScreen;
  /** A new report's step changes: the URL follows, so a reload lands back on it. */
  onScreen: (s: StartScreen) => void;
  /** Open workspace →: the workspace, on Sort. */
  onDone: () => void;
  /** ✕ and ← Back on Basics: Reports. */
  onReports: () => void;
}) {
  // A new report's window, or Edit details from a workspace's ✎ (?start=details on a report not just made).
  const [editing] = useState(() => screen === 'details' && !isNewReport(ws.reportId));
  const steps: readonly StepDef[] = editing ? EDIT_STEPS : STEPS;
  const [editStep, setEditStep] = useState<StepKey>('basics');
  const key: StepKey = editing ? editStep : screen === 'details' ? 'general' : screen;
  const index = Math.max(0, steps.findIndex((s) => s.key === key));
  const step = steps[index]!;
  const [reached, setReached] = useState(() => (editing ? steps.length - 1 : Math.max(readReached(ws.reportId), index)));
  const [dir, setDir] = useState<'f' | 'b'>('f');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(savedHub);
  const body = useRef<HTMLDivElement>(null);
  const home = ws.reads.filter((r) => r.purpose === 'subject').at(-1) ?? null;
  const reading = Boolean(home && (home.status === 'queued' || home.status === 'running')) && !ws.readOnly;
  const drop = useDropTarget(ws, setNote);

  // Hubert's get_view and his panel read the step from here.
  useEffect(() => { ws.setWindowStep(key); }, [key]);
  useEffect(() => { return () => ws.setWindowStep(null); }, []);
  useEffect(() => {
    try {
      if (width === HUB_DEFAULT) localStorage.removeItem(HUB_KEY);
      else localStorage.setItem(HUB_KEY, String(width));
    } catch {
      // Private mode: the width lasts as long as the page.
    }
  }, [width]);
  useEffect(() => {
    if (editing) return;
    try {
      sessionStorage.setItem(REACHED_KEY(ws.reportId), String(reached));
    } catch {
      // Private mode: the rail starts again from the step showing.
    }
  }, [reached, editing]);

  // Leaving the report ends the flow; a reload doesn't. The clear waits a tick, so StrictMode's mount-unmount-mount doesn't end it.
  const clearing = useRef(0);
  useEffect(() => {
    window.clearTimeout(clearing.current);
    const id = ws.reportId;
    return () => {
      clearing.current = window.setTimeout(() => endNewReport(id), 0);
    };
  }, [ws.reportId]);

  // Why the home's link wasn't read, when it wasn't (START couldn't queue it).
  const [refused] = useState(() => {
    try {
      const k = `cr-home-refused:${ws.reportId}`;
      const why = sessionStorage.getItem(k);
      sessionStorage.removeItem(k);
      return why;
    } catch {
      return null;
    }
  });

  // The page's type: left alone at START, Co-op or Condo follows it once read (Kimani's notebook, 2026-10-27).
  const pageType = useMemo(() => {
    if (!home || home.status !== 'done' || !home.extract) return null;
    try {
      return typeFromListing(compRecordFromListing(home.extract, { as_of: home.asOf ?? ws.today, url: home.url }).record);
    } catch {
      return null;
    }
  }, [home?.id, home?.status]);
  const [typeFromPage, setTypeFromPage] = useState(false);
  useEffect(() => {
    if (!pageType?.asReportType || ws.readOnly) return;
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(typeFromPageKey(ws.reportId)) === '1';
      sessionStorage.removeItem(typeFromPageKey(ws.reportId));
    } catch {
      // Private mode: the type stays as it is.
    }
    if (flagged) {
      if (pageType.asReportType !== ws.propertyType) ws.setPropertyType(pageType.asReportType);
      setTypeFromPage(true);
    }
  }, [pageType]);
  const typeMismatch = pageType?.asReportType && pageType.asReportType !== ws.propertyType ? pageType.asReportType : null;

  // Edit details: what Cancel puts back.
  const [before] = useState(() => ({ intake: ws.intake, brief: ws.brief, propertyType: ws.propertyType, dealTerms: ws.dealTerms, target: ws.target }));
  const cancel = () => {
    if (!ws.readOnly) {
      if (JSON.stringify(ws.intake) !== JSON.stringify(before.intake)) ws.setIntake(before.intake);
      if (JSON.stringify(ws.brief) !== JSON.stringify(before.brief)) ws.setBrief(before.brief);
      if (JSON.stringify(ws.dealTerms) !== JSON.stringify(before.dealTerms)) ws.setDealTerms(before.dealTerms);
      if (JSON.stringify(ws.target) !== JSON.stringify(before.target)) ws.setTarget(before.target);
      if (ws.propertyType !== before.propertyType) ws.setPropertyType(before.propertyType);
    }
    // A tick later, so the close doesn't undo the Cancel (it marks the screen reached from the state as rendered).
    window.setTimeout(() => ws.go(ws.screen), 0);
  };

  /** Moving on confirms what the page gave: the agent has seen it here. */
  async function confirmHome(): Promise<boolean> {
    if (!home || home.status !== 'done' || home.confirmedAt || ws.readOnly) return true;
    let ok = true;
    await ws.run('Saving…', async () => {
      try {
        ws.applyLinks(await linksApi.confirmHome(ws.reportId, home.id));
      } catch (e) {
        ok = false;
        setError(message(e));
      }
    });
    return ok;
  }

  const stillReading = () => {
    const comps = inFlight(ws.reads.filter((r) => r.purpose === 'comp')).length;
    if (ws.readOnly) return;
    if (reading) ws.toast('Still reading the home’s StreetEasy page. It keeps going, and the details fill in when it’s read.');
    else if (comps) ws.toast(`Still reading ${comps === 1 ? '1 comp’s page' : `${comps} comps’ pages`}. ${comps === 1 ? 'It keeps' : 'They keep'} going, and each comp lands on Sort when it’s read.`);
  };

  const move = (to: number) => {
    if (to < 0 || to >= steps.length || to === index) return;
    setError(null);
    setDir(to < index ? 'b' : 'f');
    setReached((r) => Math.max(r, to));
    body.current?.scrollTo({ top: 0 });
    const k = steps[to]!.key;
    if (editing) setEditStep(k);
    else onScreen(k);
  };
  const next = async () => {
    if (index >= 1 && !(await confirmHome())) return;
    move(index + 1);
  };
  const close = () => {
    stillReading();
    if (editing) return cancel();
    endNewReport(ws.reportId);
    onReports();
  };
  const open = async () => {
    if (!(await confirmHome())) return;
    stillReading();
    endNewReport(ws.reportId);
    onDone();
  };
  const guards = useGuards(close);
  const attemptRef = useRef(guards.attempt);
  attemptRef.current = guards.attempt;
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Escape in Hubert's box is his, not the window's.
      if ((e.target as HTMLElement | null)?.closest?.('.nc-hub')) return;
      attemptRef.current();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const last = index === steps.length - 1;
  const toConfirm = ws.comps.filter((c) => c.unconfirmed).length;
  const compsReading = inFlight(ws.reads.filter((r) => r.purpose === 'comp')).length;
  const count = toConfirm ? `${toConfirm} to confirm` : compsReading ? `${compsReading} reading` : ws.comps.length ? 'All confirmed' : '';
  const hubOpen = ws.drawerOpen;
  const head = editing ? 'EDIT TARGET PROPERTY' : key === 'comps' ? 'COMPS TO COMPARE' : 'TARGET PROPERTY';
  const saved = error ? null : ws.busy ? ws.busy : reading ? 'The report is made: anything you type is kept.' : ws.readOnly ? 'Read only' : '✓ Saved as you go';

  let content: ReactNode;
  // While the home's page is read (CR-17, Kimani 2026-11-11): Next waits, but the rail opens every step. What the
  // listing fills stays locked until it lands, so the read can't write over the agent; the notes, Basics, Client
  // info and the comps are the agent's own and stay open.
  const lockedByRead = reading && !editing && LISTING_STEPS.has(key);
  const filling = lockedByRead ? { ...ws, readOnly: true } : ws;
  if (key === 'basics') content = <BasicsStep ws={ws} typeFromPage={typeFromPage && !typeMismatch} />;
  else if (key === 'general') content = <GeneralStep ws={filling} />;
  else if (key === 'shared') content = <SharedStep ws={filling} />;
  else if (key === 'amenities') content = <AmenitiesStep ws={filling} />;
  else if (key === 'building') content = <BuildingStep ws={filling} />;
  else if (key === 'client') content = <ClientStep ws={ws} />;
  else content = <CompsStep ws={ws} note={note} onNote={setNote} />;

  return (
    <div className="nc-page" style={{ ['--nc-hub-w' as string]: hubOpen ? `${width}px` : '0px' }}>
      {hubOpen ? <HubertPanel ws={ws} width={width} onWidth={setWidth} /> : (
        <button type="button" className="nc-htab" aria-label="Open Hubert" onClick={() => ws.setDrawerOpen(true)}>
          <span aria-hidden="true" className="nc-htab-spark">✦</span><span className="nc-htab-word">HUBERT</span>
        </button>
      )}
      <div className="nc-stage">
        <div
          className={`nc-window${key === 'comps' ? ' comps' : ''}`}
          role="dialog"
          aria-label={editing ? 'Edit target property' : `New comp: ${step.title}`}
          data-testid={editing ? 'edit-details' : `new-comp-${key}`}
          ref={body}
          {...(key === 'comps' ? drop.handlers : {})}
        >
          {key === 'comps' && drop.veil}
          <div className="nc-head">
            <div className="nc-head-top">
              <span className="nc-k nc-label">{head}</span>
              <button type="button" className="nc-x" aria-label={editing ? 'Cancel' : 'Close'} onClick={guards.attempt}>×</button>
            </div>
            <HomeRow ws={ws} home={home} refused={refused} />
            <nav className="nc-rail" aria-label="Steps">
              {steps.map((s, n) => {
                const here = n === index;
                const reach = n <= reached;
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`${here ? 'here' : ''}${reach ? ' reached' : ''}`}
                    aria-current={here ? 'step' : undefined}
                    disabled={!reach && !(reading && !editing)}
                    onClick={() => void (n > index ? confirmHome().then((ok) => ok && move(n)) : move(n))}
                  >
                    <span className="nc-rb"><span /></span>
                    <span className="nc-rl">{n + 1} · {s.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <GuardContext.Provider value={guards.register}>
            <div className={`nc-pane ${dir === 'b' ? 'in-b' : 'in-f'}`} key={key}>
              <h2 className="nc-title">{step.title}</h2>
              {key === 'basics' && typeMismatch && (
                <p className="nc-note" role="status">
                  Its StreetEasy page says {pageType!.label ?? TYPE_LABEL[typeMismatch]}, and this report is a {TYPE_LABEL[ws.propertyType].toLowerCase()}.{' '}
                  {!ws.readOnly && <button type="button" className="link" onClick={() => ws.setPropertyType(typeMismatch)}>Make it a {TYPE_LABEL[typeMismatch].toLowerCase()}</button>}
                </p>
              )}
              {lockedByRead && (
                <p className="nc-note" role="status">Still reading its StreetEasy page: these fill in when it’s read, and open then. The notes are open now.</p>
              )}
              {content}
              {step.notes && <StepNotes ws={ws} where={step.notes} hint={step.notesHint} placeholder={step.notesPlaceholder} />}
            </div>
          </GuardContext.Provider>

          {guards.asking && (
            <div className="nr-ask nc-ask" role="alertdialog" aria-label="Close and lose the comp you’re typing?">
              <span>You’re partway through a comp. Close and lose it?</span>
              <button type="button" className="link" onClick={() => guards.setAsking(false)} autoFocus>Keep editing</button>
              <span aria-hidden="true">·</span>
              <button type="button" className="link" onClick={() => { guards.setAsking(false); close(); }}>Close anyway</button>
            </div>
          )}

          <div className="nc-foot">
            {editing ? (
              <button type="button" className="nc-bo" onClick={cancel}>Cancel</button>
            ) : (
              <button type="button" className="nc-bo" onClick={() => (index === 0 ? close() : move(index - 1))}>← BACK</button>
            )}
            {!editing && ws.canSample && (
              <button
                type="button"
                className="link nc-sample"
                disabled={Boolean(ws.busy)}
                title="Fills the whole report with 100 Barclay #17L: the home, the sorted comps, the call, the terms and the email’s lines."
                onClick={() => void ws.fillSample('all').then((ran) => ran && (endNewReport(ws.reportId), onDone()))}
              >
                Fill the rest with the sample
              </button>
            )}
            <span className="nc-foot-gap" />
            {error ? <span className="nc-err" role="alert">{error}</span> : <span className="nc-saved" aria-live="polite">{saved}</span>}
            {last && !editing && count && <span className="nc-count">{count}</span>}
            {editing ? (
              <button type="button" className="nc-bp" disabled={Boolean(ws.busy)} onClick={() => void confirmHome().then((ok) => ok && (stillReading(), ws.go(ws.screen)))}>
                {ws.readOnly ? 'CLOSE' : 'SAVE CHANGES'}
              </button>
            ) : last ? (
              <button type="button" className="nc-bp" disabled={Boolean(ws.busy)} onClick={() => void open()}>OPEN WORKSPACE →</button>
            ) : (
              <>
                {step.optional && !reading && <button type="button" className="link nc-skip" onClick={() => move(index + 1)}>Skip for now</button>}
                <button type="button" className="nc-bp" disabled={reading || Boolean(ws.busy)} onClick={() => void next()}>
                  NEXT: {steps[index + 1]!.label.toUpperCase()} →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

