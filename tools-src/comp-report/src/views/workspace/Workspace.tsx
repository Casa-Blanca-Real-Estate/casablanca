// The workspace (CR-3a, Dispatch 07; the start reworked in CR-3b, Dispatch 09).
// It loads the report, keeps what the agent enters and saves it as they go,
// reads every comp from its source with the engine's parser — the stored
// exports, what each StreetEasy page said, what was typed — and recomputes
// both results in the browser whenever a fact, a tier or the call changes.
//
// The start is the new-comp modal (the home, its details, add comps), over the
// workspace; then three screens: Sort, Findings, Send (`02-screens.md`). Free
// movement: the rail goes anywhere. The assistant is a drawer on all three.
// Admins can switch on the build's own notes; agents never see them.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compute, EngineInputError, parseExport, type EngineOutput } from '../../../engine/index.ts';
import { agentCardApi, ApiError, clientWordsApi, geocodeApi, maySample, reviewApi, workspaceApi, type CompEdit, type HubertEmailEdit, type LinkReadView, type LinksState, type AgentCard, type Me, type WorkspaceData, type WorkspacePatch } from '../../api.ts';
import { engineInput, locationsFrom, namedPrices, removedComps, removedExportComps, workspaceComps, type ParsedImport, type RecordCache } from '../../../workspace/engine-input.ts';
import { cleanAllClientRounds } from '../../../workspace/client-words.ts';
import { homeFeatures } from '../../../workspace/features.ts';
import { settleTags } from '../../../workspace/settle-tags.ts';
import { homeFromListing } from '../../../workspace/subject.ts';
import {
  isRevealed, type Brief, type CallState, type DealTermsState, type GuideStep, type Intake, type Outcomes, type Reached, type RevealPin, type SendState, type TargetState, type WorkspaceState,
} from '../../../workspace/state.ts';
import { publishCaptureContext } from '../../capture-context.ts';
import { ErrorBoundary } from '../../ErrorBoundary.tsx';
import { StartFlow, type StartScreen } from '../newcomp/NewComp.tsx';
import type { StepId } from './About.tsx';
import { BuildNotesContext, useBuildNotesSwitch } from './buildNotes.tsx';
import { Done } from './Done.tsx';
import { Findings } from './Findings.tsx';
import { Gate } from './Gate.tsx';
import { fromBase64, localToday, type ToastAction, type Workspace as WorkspaceModel } from './model.ts';
import { useLinkReads } from './reads.ts';
import { SendStep } from './SendStep.tsx';
import { hasSF, isScreen, sortReadiness, type Level, type ScreenId } from './screens.ts';
import { SortFirst } from './SortFirst.tsx';
import { SortStep } from './SortStep.tsx';
import { ReviewFlow } from '../review/ReviewFlow.tsx';
import { Center, DevStrip, DRAWER_SLIDE_MS, HubertDrawer, HubertTab, Notes, StateLine } from '../shell/Pieces.tsx';
import { ReportBar } from '../shell/ReportBar.tsx';
import { trackScreen } from '../../activity.ts';
import { ProgressRow, WorkspaceHeader } from '../shell/WorkspaceHeader.tsx';

type Field = 'title' | 'brief' | 'call' | 'target' | 'state' | 'sampleData' | 'propertyType';

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

/**
 * Saves what the agent enters, half a second after they stop. Saves run one at
 * a time; a failed one keeps its fields queued for the next attempt. Leaving
 * the page with a save outstanding asks first.
 */
function useAutosave(reportId: string, onReveal: (reveal: RevealPin) => void) {
  // The server answers a call with the reveal it pinned (§8.4's backstop): the state takes it without saving it back.
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  const queued = useRef<Partial<Record<Field, unknown>>>({});
  const timer = useRef<number | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (inFlight.current) await inFlight.current;
    const patch = queued.current;
    queued.current = {};
    if (!Object.keys(patch).length) return;
    setStatus({ kind: 'saving' });
    const saving = workspaceApi.save(reportId, patch as WorkspacePatch).then(
      (res) => {
        if (res.reveal) revealRef.current(res.reveal);
        setStatus(Object.keys(queued.current).length ? { kind: 'pending' } : { kind: 'saved' });
      },
      (e: unknown) => {
        queued.current = { ...patch, ...queued.current };
        setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      },
    );
    inFlight.current = saving.finally(() => {
      inFlight.current = null;
    });
    await inFlight.current;
  }, [reportId]);

  const queue = useCallback((field: Field, value: unknown) => {
    queued.current[field] = value;
    setStatus({ kind: 'pending' });
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 500);
  }, [flush]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(queued.current).length || inFlight.current) e.preventDefault();
    };
    addEventListener('beforeunload', onBeforeUnload);
    return () => {
      removeEventListener('beforeunload', onBeforeUnload);
      void flush(); // back to the reports list: save what's outstanding
    };
  }, [flush]);

  return { status, queue, flush };
}

/** What each screen's "Fill with sample" fills (a build note) — 100 Barclay #17L throughout. */
const SAMPLE_FILLS: Record<StepId, string> = {
  sort: 'A first-pass sort of the sample export’s comps, with notes (imports the export first if it isn’t here).',
  findings: 'Hannah’s own number from the briefing ($3.4M to $4.2M), a target and the terms, for the report’s side (buyer or seller).',
  send: 'The email’s own lines (how the comps were chosen, things to consider, the next step), a made-up client and the result that has a range. The headline stays yours.',
};

/** CR-3a's steps map onto the screens: the reveal and "work it through" are Findings now. */
function screenFromUrl(): ScreenId {
  const s = new URLSearchParams(location.search).get('step');
  if (s === 'reveal' || s === 'work') return 'findings';
  return isScreen(s) ? s : 'sort';
}

const REACH: Record<ScreenId, Reached> = { sort: 'sort', gate: 'findings', findings: 'findings', send: 'send', done: 'send' };
const REACH_ORDER: Reached[] = ['sort', 'findings', 'send'];

/** An admin can view the Gate as a new (practice) agent, to show it (Dispatch 14). Per browser. */
const VIEW_AS_NEW_KEY = 'cr-view-as-new-agent';
function readViewAsNew(): boolean {
  try {
    return localStorage.getItem(VIEW_AS_NEW_KEY) === '1';
  } catch {
    return false;
  }
}

/** The new-comp modal's screen, from ?start= (and CR-3a's ?step=home and ?step=export, which it replaces). */
function startFromUrl(): StartScreen | null {
  const q = new URLSearchParams(location.search);
  const start = q.get('start');
  if (start === 'home' || start === 'details' || start === 'comps') return start;
  const step = q.get('step');
  return step === 'home' ? 'details' : step === 'export' ? 'comps' : null;
}

const NO_READS: LinkReadView[] = [];

function SaveLine({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status.kind === 'error') {
    return (
      <span className="sh-save error" role="alert">
        Not saved: {status.message}{' '}
        <button type="button" className="link" onClick={onRetry}>Try again</button>
      </span>
    );
  }
  const text = { idle: 'Saved', pending: 'Unsaved changes…', saving: 'Saving…', saved: 'Saved' }[status.kind];
  return <span className={`sh-save ${status.kind}`} aria-live="polite">{text}</span>;
}

export function Workspace({ reportId, me, onBack, onOpen }: { reportId: string; me: Me; onBack: () => void; onOpen: (id: string) => void }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loadError, setLoadError] = useState<ApiError | Error | null>(null);
  const [brief, setBriefState] = useState<Brief>({});
  const [call, setCallState] = useState<CallState | null>(null);
  const [target, setTargetState] = useState<TargetState | null>(null);
  const [state, setStateState] = useState<WorkspaceState>({});
  const [screen, setScreen] = useState<ScreenId>(screenFromUrl);
  const [start, setStart] = useState<StartScreen | null>(startFromUrl);
  // The activity log's screen line (Dispatch 22b): the new report's steps while its modal is open, else the screen.
  useEffect(() => {
    trackScreen(start === 'home' ? 'new-report' : start ? (`new-report-${start}` as const) : screen, reportId);
  }, [start, screen, reportId]);
  const [drawerOpen, setDrawerOpen] = useState(() => new URLSearchParams(location.search).get('step') === 'work');
  // The drawer stays mounted for its slide out (shell.css), then goes (Kimani's notebook, 2026-10-27).
  const [drawerShown, setDrawerShown] = useState(drawerOpen);
  useEffect(() => {
    if (drawerOpen) {
      setDrawerShown(true);
      return;
    }
    const t = window.setTimeout(() => setDrawerShown(false), DRAWER_SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [drawerOpen]);
  const [propertyType, setPropertyTypeState] = useState<'condo' | 'coop'>('condo');
  const [viewAsNewAgent, setViewAsNewAgentState] = useState(readViewAsNew);
  const [sortFilter, setSortFilter] = useState<{ incomplete: boolean; tags: string[] }>({ incomplete: false, tags: [] });
  const [toastText, setToastText] = useState<{ text: string; action?: ToastAction } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [hubertEdits, setHubertEdits] = useState<HubertEmailEdit[]>([]);
  const [reviewing, setReviewing] = useState<{ at: string | null } | null>(null);
  const [focus, setFocus] = useState<{ reportCompId: string; field: string; n: number; at: number } | null>(null);
  const today = useMemo(localToday, []);
  const save = useAutosave(reportId, (reveal) => {
    stateRef.current = { ...stateRef.current, reveal };
    setStateState(stateRef.current);
  });

  useEffect(() => {
    let live = true;
    workspaceApi.load(reportId).then(
      (d) => {
        if (!live) return;
        setData(d);
        setBriefState((d.brief ?? {}) as Brief);
        setCallState(d.call as CallState | null);
        setTargetState(d.target as TargetState | null);
        setStateState((d.state ?? {}) as WorkspaceState);
        setPropertyTypeState(d.report.propertyType);
        setMessageCount(d.messageCount);
      },
      (e: unknown) => live && setLoadError(e instanceof Error ? e : new Error(String(e))),
    );
    return () => {
      live = false;
    };
  }, [reportId]);

  useEffect(() => {
    const onPop = () => {
      setScreen(screenFromUrl());
      setStart(startFromUrl());
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: ScreenId) => {
    const params = new URLSearchParams(location.search);
    params.set('report', reportId);
    params.set('step', next);
    params.delete('start');
    history.pushState(null, '', `?${params}`);
    setScreen(next);
    setStart(null);
    scrollTo({ top: 0 });
  }, [reportId]);

  // The new-comp modal, over the workspace. Its screen is in the URL, so a reload lands back on it.
  const openStart = useCallback((screen: StartScreen) => {
    const params = new URLSearchParams(location.search);
    params.set('report', reportId);
    params.set('start', screen);
    if (params.get('step') === 'home' || params.get('step') === 'export') params.delete('step');
    history.replaceState(null, '', `?${params}`);
    setStart(screen);
  }, [reportId]);
  const closeStart = useCallback(() => go('sort'), [go]);

  // Each stored export, read with the engine's parser, once per import.
  const parseCache = useRef(new Map<string, ParsedImport | { error: string }>());
  const { parsed, unreadable } = useMemo(() => {
    const ok: ParsedImport[] = [];
    const bad: Record<string, string> = {};
    for (const imp of data?.imports ?? []) {
      let hit = parseCache.current.get(imp.id);
      if (!hit) {
        try {
          hit = {
            importId: imp.id,
            createdAt: imp.createdAt,
            parsed: parseExport(fromBase64(imp.contentBase64), { as_of: imp.asOf, ...(imp.filename ? { filename: imp.filename } : {}) }),
          };
        } catch (e) {
          hit = { error: e instanceof Error ? e.message : String(e) };
        }
        parseCache.current.set(imp.id, hit);
      }
      if ('error' in hit) bad[imp.id] = hit.error;
      else ok.push(hit);
    }
    return { parsed: ok, unreadable: bad };
  }, [data?.imports]);

  const intake = useMemo<Intake>(() => state.intake ?? {}, [state.intake]);
  const dealTerms = state.dealTerms ?? null;
  const send = useMemo<SendState>(() => state.send ?? {}, [state.send]);
  // Reading a link's or a typed-in comp is pure: each is read once per page.
  const recordCache = useRef<RecordCache>(new Map());
  const comps = useMemo(() => workspaceComps(parsed, data?.comps ?? [], recordCache.current), [parsed, data?.comps]);
  const prices = useMemo(() => namedPrices(call, target), [call, target]);
  // Each building's mapped location, for distance (Dispatch 11).
  const locations = useMemo(() => locationsFrom(data?.geocodes ?? []), [data?.geocodes]);

  // The engine, in the browser: instant, and the same code the functions run (§5).
  const { output, engineError } = useMemo((): { output: EngineOutput | null; engineError: string | null } => {
    try {
      return { output: compute(engineInput({ asOf: today, intake, dealTerms, comps, prices, locations, propertyType })), engineError: null };
    } catch (e) {
      const message = e instanceof EngineInputError ? e.issues.join('; ') : e instanceof Error ? e.message : String(e);
      return { output: null, engineError: message };
    }
  }, [today, intake, dealTerms, comps, prices, locations, propertyType]);
  const level: Level = me.user.role === 'admin' && viewAsNewAgent ? 'practice' : me.user.capability;
  const readiness = useMemo(() => sortReadiness(comps, level), [comps, level]);
  const removed = useMemo(() => removedComps(parsed, data?.comps ?? [], recordCache.current), [parsed, data?.comps]);
  const suggestions = useMemo(() => removedExportComps(parsed, data?.comps ?? []), [parsed, data?.comps]);
  const features = useMemo(() => homeFeatures(intake), [intake]);

  const readOnly = Boolean(data && data.report.ownerEmail.toLowerCase() !== me.user.email.toLowerCase());
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  // StreetEasy links being read: start each, and poll until every row has filled in.
  const applyLinks = useCallback((next: LinksState) => {
    setData((prev) => (prev ? { ...prev, reads: next.reads, comps: next.comps } : prev));
  }, []);
  useLinkReads(reportId, data?.reads ?? NO_READS, applyLinks, readOnly);

  // Locations for distance (Dispatch 11): the server looks each building up after a save, and
  // when a report opens for anything saved before. A lookup never holds up a row; the row
  // updates when the location lands. Asked again while some are still due (a few per call),
  // or a little later while another tab's lookup is under way.
  const buildingsSeen = useMemo(
    () => [intake.address?.value ?? '', intake.unit?.value ?? '', ...(data?.comps ?? []).map((c) => c.propertyKey).sort()].join('|'),
    [intake.address?.value, intake.unit?.value, data?.comps],
  );
  const loaded = Boolean(data);
  const flushSaves = save.flush;
  useEffect(() => {
    if (!loaded || readOnly) return undefined;
    let stopped = false;
    let timer = 0;
    const lookUp = async (round: number) => {
      // What's typed reaches the server first; a failed save says so itself, and the rest is still looked up.
      await flushSaves().catch(() => undefined);
      const r = await geocodeApi.run(reportId).catch(() => null);
      if (stopped || !r) return;
      setData((prev) => (prev ? { ...prev, geocodes: r.geocodes } : prev));
      const underWay = r.geocodes.some((g) => g.status === 'pending');
      if (r.more || (underWay && round < 3)) timer = window.setTimeout(() => void lookUp(round + 1), r.more ? 0 : 8000);
    };
    timer = window.setTimeout(() => void lookUp(0), 1000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [reportId, readOnly, loaded, buildingsSeen, flushSaves]);

  // What the dev notebook records with a note written here: the report, by name as well as id.
  const reportTitle = data?.report.title;
  const reportSample = data?.report.sampleData;
  useEffect(() => {
    if (!reportTitle) return;
    publishCaptureContext('report', { id: reportId, name: reportTitle, sample: Boolean(reportSample), readOnly });
    return () => {
      publishCaptureContext('report', null);
    };
  }, [reportId, reportTitle, reportSample, readOnly]);
  const canSample = maySample(me) && !readOnly;
  const [buildNotes, setBuildNotes] = useBuildNotesSwitch(maySample(me), Boolean(me.user.guest));
  const hasSampleImport = (data?.imports ?? []).some((i) => i.sample);

  const markSample = useCallback(() => {
    setData((d) => (d ? { ...d, report: { ...d.report, sampleData: true } } : d));
    save.queue('sampleData', true);
  }, [save]);

  const setState = useCallback((next: WorkspaceState) => {
    // Two setters in one event each build on the last: the ref moves now, not at the next render.
    stateRef.current = next;
    setStateState(next);
    save.queue('state', next);
  }, [save]);

  // The latest state for the setters below, so each keeps the other parts as they are.
  const stateRef = useRef(state);
  stateRef.current = state;

  // A comp's edits run one at a time, in order, so each returned workspace lands in turn (as Sort's did).
  const compChain = useRef<Promise<void>>(Promise.resolve());
  const editComp = useCallback((reportCompId: string, edit: CompEdit): Promise<void> => {
    const next = compChain.current.then(async () => {
      const d = await workspaceApi.editComp(reportId, reportCompId, edit);
      setData((prev) => (prev ? { ...prev, report: d.report, imports: d.imports, comps: d.comps, reads: d.reads, geocodes: d.geocodes } : d));
    });
    compChain.current = next.catch(() => undefined);
    return next;
  }, [reportId]);

  // Hubert changed a comp himself (edit_comp): the comps load again, after any edit of the agent's still saving.
  const reloadComps = useCallback(() => {
    const next = compChain.current.then(async () => {
      const d = await workspaceApi.load(reportId);
      setData((prev) => (prev ? { ...prev, report: d.report, imports: d.imports, comps: d.comps, reads: d.reads, geocodes: d.geocodes } : d));
    });
    compChain.current = next.catch(() => undefined);
  }, [reportId]);

  // Hubert on one comp (Dispatch 25): in the same chain, so feedback reads the note just saved.
  const askReview = useCallback((reportCompId: string, job: 'feedback' | 'take', asks?: string) => {
    const practice = level === 'practice' && me.user.capability !== 'practice';
    const next = compChain.current.then(async () => {
      const r = await reviewApi.ask(reportId, reportCompId, job, { ...(asks ? { asks } : {}), ...(practice ? { practice } : {}) });
      const d = r.workspace;
      setData((prev) => (prev ? { ...prev, report: d.report, imports: d.imports, comps: d.comps, reads: d.reads, geocodes: d.geocodes } : d));
      return r;
    });
    compChain.current = next.then(() => undefined, () => undefined);
    return next;
  }, [reportId, level, me.user.capability]);

  // Hubert on the client's words (Dispatch 26): what's typed is saved first, so he reads what the agent sees;
  // in the comps' chain, so a paragraph just saved is the one he reads. His rounds come back in the state, and
  // land there without a save (the server keeps its own, whatever a save sends).
  const askClientWords = useCallback(async (target: string, job: 'feedback' | 'draft', opts: { asks?: string; result?: 'on_facts' | 'with_estimates' } = {}) => {
    const practice = level === 'practice' && me.user.capability !== 'practice';
    await save.flush();
    const next = compChain.current.then(async () => {
      const r = await clientWordsApi.ask(reportId, target, job, { ...opts, ...(practice ? { practice } : {}) });
      const d = r.workspace;
      setData((prev) => (prev ? { ...prev, report: d.report, imports: d.imports, comps: d.comps, reads: d.reads, geocodes: d.geocodes } : d));
      const rounds = (d.state as WorkspaceState).clientRounds;
      stateRef.current = { ...stateRef.current, clientRounds: rounds ?? {} };
      setStateState(stateRef.current);
      return r;
    });
    compChain.current = next.then(() => undefined, () => undefined);
    return next;
  }, [reportId, level, me.user.capability, save.flush]);

  // The tags the data settles (NB-9 C): contradicted tags come off; a full agent's supported tags are
  // pre-filled once each, a practice agent sees them as chips. Saved in one call; one at a time.
  const settled = useMemo(
    () => (output && !readOnly ? settleTags({ comps, output, level, offered: state.tagsOffered }) : null),
    [output, comps, level, state.tagsOffered, readOnly],
  );
  const settling = useRef<string | null>(null);
  useEffect(() => {
    if (!settled) return;
    if (settled.offeredChanged) setState({ ...stateRef.current, tagsOffered: settled.offered });
    if (!settled.edits.length) return;
    const key = JSON.stringify(settled.edits);
    if (settling.current === key) return;
    settling.current = key;
    const next = compChain.current.then(async () => {
      const d = await workspaceApi.setTags(reportId, settled.edits);
      setData((prev) => (prev ? { ...prev, report: d.report, imports: d.imports, comps: d.comps, reads: d.reads, geocodes: d.geocodes } : d));
    });
    compChain.current = next.catch(() => {
      settling.current = null;
    });
  }, [settled, reportId, setState]);

  // The furthest screen reached, for the reports list's Stage.
  const reached: Reached = state.reached ?? 'sort';
  const goTo = useCallback((next: ScreenId) => {
    const r = REACH[next];
    if (!readOnlyRef.current && REACH_ORDER.indexOf(r) > REACH_ORDER.indexOf(stateRef.current.reached ?? 'sort')) {
      setState({ ...stateRef.current, reached: r });
    }
    go(next);
  }, [go, setState]);

  // Hubert's step guides (2026-10-28): the first time the agent reaches each step, it's noted, and his chat
  // shows that step's guide from then on. The owner's only: a mentor reading the report changes nothing.
  const guideStep: GuideStep = start ?? (reviewing && screen === 'sort' ? 'review' : screen);
  useEffect(() => {
    if (!data || readOnlyRef.current || stateRef.current.stepsAt?.[guideStep]) return;
    setState({ ...stateRef.current, stepsAt: { ...stateRef.current.stepsAt, [guideStep]: new Date().toISOString() } });
  }, [data, guideStep, setState]);

  // Hubert opens by default on the first Sort visit, once (the handoff).
  const loadedState = Boolean(data);
  useEffect(() => {
    if (!loadedState || readOnlyRef.current || screen !== 'sort' || stateRef.current.hubertSeen) return;
    setDrawerOpen(true);
    setState({ ...stateRef.current, hubertSeen: true });
  }, [loadedState, screen, setState]);

  const toastTimer = useRef(0);
  const toast = useCallback((message: string, action?: ToastAction) => {
    setToastText({ text: message, ...(action ? { action } : {}) });
    window.clearTimeout(toastTimer.current);
    // Long enough to reach an Undo.
    toastTimer.current = window.setTimeout(() => setToastText(null), action ? 7000 : 3200);
  }, []);

  // The home's page, once read, fills the details the agent hasn't filled: once per read.
  const homeRead = (data?.reads ?? NO_READS).filter((r) => r.purpose === 'subject').at(-1);
  const reportTitleNow = data?.report.title;
  useEffect(() => {
    if (!homeRead || homeRead.status !== 'done' || !homeRead.extract || readOnly) return;
    if (stateRef.current.subjectRead === homeRead.id) return;
    let filled;
    try {
      filled = homeFromListing(homeRead.extract, { asOf: homeRead.asOf ?? today, url: homeRead.url }, stateRef.current.intake ?? {});
    } catch {
      return; // a page the parser refuses fills nothing; the details screen says the read is done
    }
    setState({ ...stateRef.current, intake: filled.intake, subjectRead: homeRead.id });
    // A report started from a link without an address gets the page's address as its title.
    if (filled.title && reportTitleNow?.startsWith('A StreetEasy listing')) {
      const title = filled.title;
      setData((d) => (d ? { ...d, report: { ...d.report, title } } : d));
      save.queue('title', title);
    }
  }, [homeRead?.id, homeRead?.status, readOnly]);

  // The agent's profile from Casa's roster: the email's sign-off (name, title, phone, headshot) and Hubert's greeting.
  const [agentCard, setAgentCard] = useState<AgentCard | null>(null);
  useEffect(() => {
    let live = true;
    void agentCardApi.mine().then((card) => {
      if (live) setAgentCard(card);
    });
    return () => {
      live = false;
    };
  }, []);

  const ws: WorkspaceModel | null = data && {
    reportId,
    report: data.report,
    today,
    readOnly,
    canSample,
    agentName: agentCard?.name || me.user.name || '',
    agentFirstName: agentCard?.firstName || (me.user.guest ? '' : me.user.name?.trim().split(/\s+/)[0]) || '',
    agentCard,
    brief,
    setBrief: (next) => {
      setBriefState(next);
      save.queue('brief', next);
    },
    intake,
    setIntake: (next) => setState({ ...stateRef.current, intake: next }),
    target,
    setTarget: (next) => {
      setTargetState(next);
      save.queue('target', next);
    },
    dealTerms,
    setDealTerms: (next) => setState({ ...stateRef.current, dealTerms: next }),
    call,
    setCall: (next) => {
      setCallState(next);
      save.queue('call', next);
    },
    send,
    setSend: (next) => setState({ ...stateRef.current, send: next }),
    flush: save.flush,
    imports: data.imports,
    parsed,
    unreadable,
    comps,
    applyServer: (d) => setData((prev) => (prev ? { ...prev, report: d.report, imports: d.imports, comps: d.comps, reads: d.reads, geocodes: d.geocodes } : d)),
    reads: data.reads,
    geocodes: data.geocodes,
    locations,
    applyLinks,
    openStart,
    output,
    engineError,
    revealed: isRevealed(call),
    reveal: state.reveal ?? null,
    run: async (label, work) => {
      setBusy(label);
      setActionError(null);
      try {
        await work();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    busy,
    fillSample: async () => false, // set below: it needs the model itself
    resetSample: canSample && data.report.sampleData
      ? async () => {
        if (!confirm('Start this sample over? A fresh copy opens, with Hubert starting afresh, and this one is archived.')) return;
        let next = null as string | null;
        await ws!.run('Resetting the sample…', async () => {
          next = (await workspaceApi.resetSample(reportId)).report.id;
        });
        if (next) onOpen(next);
      }
      : null,
    messageCount,
    setMessageCount,
    screen,
    go: goTo,
    propertyType,
    setPropertyType: (next) => {
      setPropertyTypeState(next);
      setData((d) => (d ? { ...d, report: { ...d.report, propertyType: next } } : d));
      save.queue('propertyType', next);
    },
    side: brief.audience?.value === 'seller' ? 'seller' : 'buyer',
    sf: hasSF(intake, propertyType),
    homeFeatures: features,
    level,
    isAdmin: me.user.role === 'admin',
    isGuest: Boolean(me.user.guest),
    viewAsNewAgent,
    setViewAsNewAgent: (on) => {
      setViewAsNewAgentState(on);
      try {
        localStorage.setItem(VIEW_AS_NEW_KEY, on ? '1' : '0');
      } catch {
        /* per browser only */
      }
    },
    devTools: maySample(me) && buildNotes,
    readiness,
    sortFilter,
    setSortFilter,
    editComp,
    askReview,
    clientRounds: cleanAllClientRounds(state.clientRounds),
    askClientWords,
    reviewing,
    openReview: (reportCompId) => setReviewing({ at: reportCompId ?? null }),
    closeReview: () => setReviewing(null),
    tagSuggestions: settled?.suggestions ?? {},
    setTitle: (title) => {
      setData((d) => (d ? { ...d, report: { ...d.report, title } } : d));
      save.queue('title', title);
    },
    suggestions,
    removed,
    drawerOpen,
    setDrawerOpen,
    reloadComps,
    stepsAt: state.stepsAt ?? {},
    focus,
    showComp: (reportCompId, field) => {
      // The row shows whatever Sort's filter was, and Sort opens if another screen was showing.
      setSortFilter({ incomplete: false, tags: [] });
      if (screen !== 'sort') go('sort');
      setFocus((f) => ({ reportCompId, field, n: (f?.n ?? 0) + 1, at: Date.now() }));
    },
    hubertEdits,
    queueHubertEdit: (edit) => setHubertEdits((list) => [...list, edit]),
    takeHubertEdits: (n) => setHubertEdits((list) => list.slice(n)),
    outcomes: state.outcomes ?? {},
    setOutcomes: (next: Outcomes) => setState({ ...stateRef.current, outcomes: next }),
    reached,
    toast,
    back: onBack,
  };

  // Values the agent typed (not the sample's), which a sample fill of that step would replace.
  const ownValues = (which: StepId | 'all'): boolean => {
    const own = (o: object | null | undefined) =>
      Boolean(o) && Object.values(o as Record<string, unknown>).some((v) => typeof v === 'object' && v !== null && 'value' in v && !(v as { sample?: boolean }).sample);
    const home = own(intake) || own(brief);
    const findings = Boolean(call && !call.sample) || own(target) || own(dealTerms);
    const sendOwn = own(send);
    if (which === 'findings') return findings;
    if (which === 'send') return sendOwn;
    return which === 'all' && (home || findings || sendOwn);
  };

  if (ws) {
    ws.fillSample = async (which) => {
      if (!canSample) return false;
      if (ownValues(which) && !confirm('Replace what you’ve entered here with the sample (100 Barclay #17L)?')) return false;
      const all = which === 'all';
      // ws.run catches a failure for the error line, so this says whether the fill got to the end.
      let filled = false;
      await ws.run(all ? 'Filling the whole report with sample data…' : 'Filling with sample…', async () => {
        const needsWalkthrough = all || which === 'findings' || which === 'send';
        // The report's own kind: a co-op gets the co-op sample, with no size (Dispatch 23).
        // And the report's side: a buyer's report gets the buyer's lines, never a seller's (2026-10-29).
        const sample = needsWalkthrough ? await workspaceApi.sample(propertyType, brief.audience?.value ?? 'buyer') : null;
        let nextState = stateRef.current;
        if (sample && all) {
          nextState = { ...nextState, intake: sample.intake };
          // The whole report is 100 Barclay #17L now, so its name and type follow: a report started as
          // another home ("10 Hubert St 2") kept that name over the sample's home (Kimani's notebook).
          const { title, propertyType: sampleType } = sample;
          setData((d) => (d ? { ...d, report: { ...d.report, title } } : d));
          save.queue('title', title);
          if (propertyType !== sampleType) ws.setPropertyType(sampleType);
          const nextBrief = { ...sample.brief, ...(sample.send.clientName ? { clientName: sample.send.clientName } : {}) };
          setBriefState(nextBrief);
          save.queue('brief', nextBrief);
        }
        if (sample && (all || which === 'findings')) {
          nextState = { ...nextState, dealTerms: sample.dealTerms };
          setTargetState(sample.target);
          save.queue('target', sample.target);
        }
        if (sample && (all || which === 'send')) {
          const { clientName, ...lines } = sample.send;
          nextState = { ...nextState, send: { ...nextState.send, ...lines } };
          if (!all && clientName && !brief.clientName) {
            const nextBrief = { ...brief, clientName };
            setBriefState(nextBrief);
            save.queue('brief', nextBrief);
          }
        }
        if (nextState !== stateRef.current) setState(nextState);
        if (all || which === 'sort') {
          // The sample sorts the sample export's comps, so the export comes first. The sort also puts the
          // sample's photos on its comps, once the site has read them; this asks for that, once.
          void workspaceApi.captureSamplePhotos();
          let latest: WorkspaceData | null = null;
          // A report with comps of its own keeps them: the sample sort gives those a placeholder sort instead.
          const ownComps = (data?.comps ?? []).some((c) => !c.removedAt);
          if (!hasSampleImport && !ownComps) latest = await workspaceApi.importSample(reportId);
          if (all || which === 'sort') latest = await workspaceApi.sortSample(reportId);
          if (latest) ws.applyServer(latest);
        }
        if (sample && (all || which === 'findings')) {
          const next: CallState = { ...sample.call, at: new Date().toISOString() };
          setCallState(next);
          save.queue('call', next);
        }
        markSample();
        await save.flush();
        filled = true;
      });
      return filled;
    };
  }

  if (loadError) {
    const missing = loadError instanceof ApiError && loadError.status === 404;
    return (
      <Center>
        <div className="sh-card">
          <h1 className="sh-card-title">{missing ? 'No such report.' : 'This report couldn’t be loaded.'}</h1>
          <p className="sh-help">{missing ? 'It may belong to someone else, or the link is wrong.' : loadError.message}</p>
          <div>
            <button type="button" className="btn primary" onClick={onBack}>All reports</button>
          </div>
        </div>
      </Center>
    );
  }
  if (!ws || !data) return <Center><StateLine>Loading the report…</StateLine></Center>;

  // The shell (Dispatch 14): the bar's report pieces, the header and progress row, the screen, and
  // Hubert's drawer beside it. The screens and their routing are final.
  // Findings stays locked until every comp has a tier, a note and a tag (Dispatch 14): whatever the way in —
  // the Gate's button, a typed ?step=, the browser's Back — not only the progress row and its button.
  const sortLocked = !readOnly && !readiness.ready && (screen === 'gate' || screen === 'findings' || screen === 'send');
  const stepFor: Record<ScreenId, StepId> = { sort: 'sort', gate: 'findings', findings: 'findings', send: 'send', done: 'send' };
  const step = stepFor[screen];
  return (
    <BuildNotesContext.Provider value={buildNotes}>
      <ReportBar ws={ws} setDevTools={setBuildNotes} />
      <div className={`sh-page${drawerOpen ? ' with-drawer' : ''}`}>
        <HubertTab ws={ws} />
        <WorkspaceHeader
          ws={ws}
          onBack={onBack}
          saveLine={readOnly ? null : <SaveLine status={save.status} onRetry={() => void save.flush()} />}
        />
        <ProgressRow ws={ws} />

        {(busy || actionError || ws.canSample || ws.devTools) && (
          <div className="sh-aux">
            <Notes busy={busy} error={actionError} onDismiss={() => setActionError(null)} />
            {(ws.canSample || ws.devTools) && <DevStrip ws={ws} step={step} fills={SAMPLE_FILLS} />}
          </div>
        )}

        <section className="sh-screen">
          <ErrorBoundary resetKey={screen} onBack={onBack}>
            {screen === 'sort' && <SortStep ws={ws} />}
            {sortLocked ? <SortFirst ws={ws} /> : (
              <>
                {screen === 'gate' && <Gate ws={ws} />}
                {screen === 'findings' && <Findings ws={ws} />}
                {screen === 'send' && <SendStep ws={ws} />}
              </>
            )}
            {screen === 'done' && <Done ws={ws} />}
          </ErrorBoundary>
        </section>
      </div>

      {start && (
        <ErrorBoundary resetKey={`start:${start}`} onBack={closeStart}>
          <StartFlow ws={ws} screen={start} onScreen={openStart} onDone={closeStart} />
        </ErrorBoundary>
      )}
      {/* Over the modal, a save or a server call says what it's doing, and what went wrong, where it can be seen. */}
      {start && (busy || actionError) && (
        <div className="sh-modal-notes">
          <Notes busy={busy} error={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      {reviewing && screen === 'sort' && (
        <ErrorBoundary resetKey={`review:${reviewing.at ?? ''}`} onBack={() => setReviewing(null)}>
          <ReviewFlow ws={ws} startAt={reviewing.at} onClose={() => setReviewing(null)} />
        </ErrorBoundary>
      )}
      {drawerShown && <HubertDrawer ws={ws} closing={!drawerOpen} />}
      {toastText && (
        <div className={`toast sh-toast${drawerOpen ? ' with-drawer' : ''}`} role="status">
          {toastText.text}
          {toastText.action && (
            <button
              type="button"
              className="sh-toast-action"
              onClick={() => {
                const run = toastText.action!.run;
                setToastText(null);
                run();
              }}
            >
              {toastText.action.label}
            </button>
          )}
        </div>
      )}
    </BuildNotesContext.Provider>
  );
}
