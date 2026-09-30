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
import { ApiError, workspaceApi, type LinkReadView, type LinksState, type Me, type WorkspaceData, type WorkspacePatch } from '../../api.ts';
import { engineInput, namedPrices, workspaceComps, type ParsedImport, type RecordCache } from '../../../workspace/engine-input.ts';
import { homeFromListing } from '../../../workspace/subject.ts';
import {
  isRevealed, type Brief, type CallState, type DealTermsState, type Intake, type SendState, type TargetState, type WorkspaceState,
} from '../../../workspace/state.ts';
import { publishCaptureContext } from '../../capture-context.ts';
import { ErrorBoundary } from '../../ErrorBoundary.tsx';
import { Chat } from '../Chat.tsx';
import { StartFlow, type StartScreen } from '../newcomp/NewComp.tsx';
import { About, STEPS, type StepId } from './About.tsx';
import { BuildNotesContext, useBuildNotesSwitch } from './buildNotes.tsx';
import { Findings, LiveNumbers } from './Findings.tsx';
import { fromBase64, localToday, type Workspace as WorkspaceModel } from './model.ts';
import { useLinkReads } from './reads.ts';
import { SendStep } from './SendStep.tsx';
import { SortStep } from './SortStep.tsx';

type Field = 'title' | 'brief' | 'call' | 'target' | 'state' | 'sampleData';

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
function useAutosave(reportId: string) {
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
      () => setStatus(Object.keys(queued.current).length ? { kind: 'pending' } : { kind: 'saved' }),
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
  findings: 'Hannah’s own number from the briefing ($3.4M to $4.2M), a target and seller terms.',
  send: 'The email’s own lines (how the comps were chosen, things to consider, the next step), a made-up client and the result that has a range. The headline stays yours.',
};

/** The assistant's starter question on each screen (`02-screens.md`, The assistant drawer). */
const STARTERS: Record<StepId, string> = {
  sort: 'Which of these are closest to the home?',
  findings: 'What’s the strongest case for where this should trade?',
  send: 'Tighten my headline.',
};

/** CR-3a's steps map onto the three screens: the reveal and "work it through" are Findings now. */
function stepFromUrl(): StepId {
  const s = new URLSearchParams(location.search).get('step');
  if (s === 'reveal' || s === 'work') return 'findings';
  return STEPS.some((x) => x.id === s) ? (s as StepId) : 'sort';
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
      <span className="save-line error">
        Not saved: {status.message}{' '}
        <button type="button" className="link" onClick={onRetry}>Try again</button>
      </span>
    );
  }
  const text = { idle: 'Saved', pending: 'Unsaved changes…', saving: 'Saving…', saved: 'Saved' }[status.kind];
  return <span className={`save-line ${status.kind}`} aria-live="polite">{text}</span>;
}

export function Workspace({ reportId, me, onBack }: { reportId: string; me: Me; onBack: () => void }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loadError, setLoadError] = useState<ApiError | Error | null>(null);
  const [brief, setBriefState] = useState<Brief>({});
  const [call, setCallState] = useState<CallState | null>(null);
  const [target, setTargetState] = useState<TargetState | null>(null);
  const [state, setStateState] = useState<WorkspaceState>({});
  const [step, setStep] = useState<StepId>(stepFromUrl);
  const [start, setStart] = useState<StartScreen | null>(startFromUrl);
  const [chatOpen, setChatOpen] = useState(() => new URLSearchParams(location.search).get('step') === 'work');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const today = useMemo(localToday, []);
  const save = useAutosave(reportId);

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
      setStep(stepFromUrl());
      setStart(startFromUrl());
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: StepId) => {
    const params = new URLSearchParams(location.search);
    params.set('report', reportId);
    params.set('step', next);
    params.delete('start');
    history.pushState(null, '', `?${params}`);
    setStep(next);
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

  // The engine, in the browser: instant, and the same code the functions run (§5).
  const { output, engineError } = useMemo((): { output: EngineOutput | null; engineError: string | null } => {
    try {
      return { output: compute(engineInput({ asOf: today, intake, dealTerms, comps, prices })), engineError: null };
    } catch (e) {
      const message = e instanceof EngineInputError ? e.issues.join('; ') : e instanceof Error ? e.message : String(e);
      return { output: null, engineError: message };
    }
  }, [today, intake, dealTerms, comps, prices]);

  const readOnly = Boolean(data && data.report.ownerEmail.toLowerCase() !== me.user.email.toLowerCase());

  // StreetEasy links being read: start each, and poll until every row has filled in.
  const applyLinks = useCallback((next: LinksState) => {
    setData((prev) => (prev ? { ...prev, reads: next.reads, comps: next.comps } : prev));
  }, []);
  useLinkReads(reportId, data?.reads ?? NO_READS, applyLinks, readOnly);

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
  const canSample = me.user.role === 'admin' && !readOnly;
  const [buildNotes, setBuildNotes] = useBuildNotesSwitch(me.user.role === 'admin');
  const hasSampleImport = (data?.imports ?? []).some((i) => i.sample);

  const markSample = useCallback(() => {
    setData((d) => (d ? { ...d, report: { ...d.report, sampleData: true } } : d));
    save.queue('sampleData', true);
  }, [save]);

  const setState = useCallback((next: WorkspaceState) => {
    setStateState(next);
    save.queue('state', next);
  }, [save]);

  // The latest state for the setters below, so each keeps the other parts as they are.
  const stateRef = useRef(state);
  stateRef.current = state;

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

  const ws: WorkspaceModel | null = data && {
    reportId,
    report: data.report,
    today,
    readOnly,
    canSample,
    agentName: me.user.name ?? '',
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
    imports: data.imports,
    parsed,
    unreadable,
    comps,
    applyServer: (d) => setData((prev) => (prev ? { ...prev, report: d.report, imports: d.imports, comps: d.comps, reads: d.reads } : d)),
    reads: data.reads,
    applyLinks,
    openStart,
    output,
    engineError,
    revealed: isRevealed(call),
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
    fillSample: async () => undefined, // set below: it needs the model itself
    go,
    messageCount,
    setMessageCount,
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
      if (!canSample) return;
      if (ownValues(which) && !confirm('Replace what you’ve entered here with the sample (100 Barclay #17L)?')) return;
      const all = which === 'all';
      await ws.run(all ? 'Filling the whole report with sample data…' : 'Filling with sample…', async () => {
        const needsWalkthrough = all || which === 'findings' || which === 'send';
        const sample = needsWalkthrough ? await workspaceApi.sample() : null;
        let nextState = stateRef.current;
        if (sample && all) {
          nextState = { ...nextState, intake: sample.intake };
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
          // The sample sorts the sample export's comps, so the export comes first.
          let latest: WorkspaceData | null = null;
          if (!hasSampleImport) latest = await workspaceApi.importSample(reportId);
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
      });
    };
  }

  if (loadError) {
    const missing = loadError instanceof ApiError && loadError.status === 404;
    return (
      <div className="card">
        <p className="card-title">{missing ? 'No such report.' : 'This report couldn’t be loaded.'}</p>
        <p className="muted">{missing ? 'It may belong to someone else, or the link is wrong.' : loadError.message}</p>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={onBack}>All reports</button>
        </div>
      </div>
    );
  }
  if (!ws || !data) return <p className="muted">Loading the report…</p>;

  const has: Record<StepId, boolean> = {
    sort: comps.some((c) => c.judgment?.tier),
    findings: Boolean(call),
    send: Boolean(send.copiedAt || send.draft || send.headline),
  };
  const current = STEPS.find((s) => s.id === step)!;

  return (
    <BuildNotesContext.Provider value={buildNotes}>
    <div className={`workspace${chatOpen ? ' with-drawer' : ''}`}>
      <div className="ws-head">
        <button type="button" className="link" onClick={onBack}>‹ All reports</button>
        <div className="ws-title-row">
          <h2 className="report-title">{data.report.title}</h2>
          {readOnly && <span className="tag" title={`${data.report.ownerEmail}'s report. Admins can read it; only its owner can change it.`}>Read only</span>}
        </div>
        <div className="ws-tools">
          {!readOnly && <SaveLine status={save.status} onRetry={() => void save.flush()} />}
          <button type="button" className="btn small-btn" onClick={() => openStart('details')}>The home</button>
          <button type="button" className="btn small-btn" aria-expanded={chatOpen} onClick={() => setChatOpen((o) => !o)}>
            {chatOpen ? 'Close the assistant' : 'Assistant'}
          </button>
          {me.user.role === 'admin' && (
            <label className="check small" title="The build’s own notes: what each screen implements, what’s stubbed, the decisions behind it. Admins only.">
              <input type="checkbox" checked={buildNotes} onChange={(e) => setBuildNotes(e.target.checked)} />
              Build notes
            </label>
          )}
          {canSample && buildNotes && (
            <button type="button" className="btn small-btn" disabled={Boolean(busy)} onClick={() => void ws.fillSample('all')}>
              Fill the whole report with sample data
            </button>
          )}
        </div>
      </div>

      {data.report.sampleData && (
        <p className="sample-banner" role="note">
          <strong>Sample report.</strong> It uses sample data (100 Barclay #17L) for trying the tool. Nothing in it is for clients.
        </p>
      )}

      <nav className="rail" aria-label="Screens">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`rail-step${s.id === step ? ' current' : ''}${has[s.id] ? ' has' : ''}`}
            aria-current={s.id === step ? 'step' : undefined}
            onClick={() => go(s.id)}
            title={has[s.id] ? `${s.title} — has something in it` : `${s.title} — empty`}
          >
            <span className="rail-n">{s.n}</span>
            <span className="rail-name">{s.short}</span>
            <span className="rail-dot" aria-label={has[s.id] ? 'has content' : 'empty'} />
          </button>
        ))}
      </nav>

      {busy && <p className="notice" aria-live="polite">{busy}</p>}
      {actionError && (
        <p className="notice error-notice" role="alert">
          {actionError} <button type="button" className="link" onClick={() => setActionError(null)}>Dismiss</button>
        </p>
      )}

      {ws.revealed && step !== 'findings' && <LiveNumbers ws={ws} />}

      <section className="step" aria-labelledby="step-title">
        <div className="step-head">
          <h3 id="step-title">{current.title}</h3>
          {canSample && buildNotes && (
            <button
              type="button"
              className="btn small-btn"
              disabled={Boolean(busy)}
              title={SAMPLE_FILLS[step]}
              onClick={() => void ws.fillSample(step)}
            >
              Fill with sample
            </button>
          )}
        </div>
        <About key={step} step={step} />
        <ErrorBoundary resetKey={step} onBack={onBack}>
          {step === 'sort' && <SortStep ws={ws} />}
          {step === 'findings' && <Findings ws={ws} />}
          {step === 'send' && <SendStep ws={ws} />}
        </ErrorBoundary>
        <div className="step-nav">
          {current.n > 1 && (
            <button type="button" className="btn" onClick={() => go(STEPS[current.n - 2]!.id)}>‹ {STEPS[current.n - 2]!.short}</button>
          )}
          {current.n < STEPS.length && (
            <button type="button" className="btn primary" onClick={() => go(STEPS[current.n]!.id)}>
              {STEPS[current.n]!.short} ›
            </button>
          )}
        </div>
      </section>

      {start && (
        <ErrorBoundary resetKey={`start:${start}`} onBack={closeStart}>
          <StartFlow ws={ws} screen={start} onScreen={openStart} onDone={closeStart} />
        </ErrorBoundary>
      )}

      {chatOpen && (
        <aside className="drawer" aria-label="The assistant">
          <div className="drawer-head">
            <span className="label">Assistant</span>
            <button type="button" className="link" onClick={() => setChatOpen(false)}>Close</button>
          </div>
          <Chat reportId={reportId} readOnly={readOnly} onCount={setMessageCount} starter={STARTERS[step]} />
        </aside>
      )}
    </div>
    </BuildNotesContext.Provider>
  );
}
