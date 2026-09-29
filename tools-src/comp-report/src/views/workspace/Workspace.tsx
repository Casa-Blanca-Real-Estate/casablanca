// The walkthrough (CR-3a, Dispatch 07): every step of §3, rough and annotated.
// It loads the report, keeps what the agent enters and saves it as they go,
// reads the stored exports with the engine's parser and recomputes both
// results in the browser whenever a fact, a tier or the call changes.
//
// Free movement: the step rail goes anywhere, every step can be skipped. The
// assistant is a drawer reachable from every step, and inline in step 5.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compute, EngineInputError, parseExport, type EngineOutput } from '../../../engine/index.ts';
import { ApiError, workspaceApi, type Me, type WorkspaceData, type WorkspacePatch } from '../../api.ts';
import { engineInput, namedPrices, workspaceComps, type ParsedImport } from '../../../workspace/engine-input.ts';
import {
  isRevealed, type Brief, type CallState, type DealTermsState, type Intake, type SendState, type TargetState, type WorkspaceState,
} from '../../../workspace/state.ts';
import { publishCaptureContext } from '../../capture-context.ts';
import { ErrorBoundary } from '../../ErrorBoundary.tsx';
import { Chat } from '../Chat.tsx';
import { About, STEPS, type StepId } from './About.tsx';
import { SampleTag, StubTag } from './bits.tsx';
import { ExportStep } from './ExportStep.tsx';
import { HomeStep } from './HomeStep.tsx';
import { fromBase64, hasAny, localToday, type Workspace as WorkspaceModel } from './model.ts';
import { LiveNumbers, RevealStep } from './RevealStep.tsx';
import { SendStep } from './SendStep.tsx';
import { SortStep } from './SortStep.tsx';

type Field = 'brief' | 'call' | 'target' | 'state' | 'sampleData';

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

/** What each step's "Fill with sample" fills — 100 Barclay #17L throughout. */
const SAMPLE_FILLS: Record<StepId, string> = {
  home: 'The subject, the brief, a target and seller deal terms for 100 Barclay #17L.',
  export: 'Hannah’s StreetEasy export for 100 Barclay #17L.',
  sort: 'A first-pass sort of the sample export’s comps, with reasons (imports the export first if it isn’t here).',
  reveal: 'Hannah’s own call from the briefing: $3.4M to $4.2M.',
  work: 'A question to start with, in the composer. Nothing is sent.',
  send: 'A made-up client name, and the result that has a range.',
};

function stepFromUrl(): StepId {
  const s = new URLSearchParams(location.search).get('step');
  return STEPS.some((x) => x.id === s) ? (s as StepId) : 'home';
}

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
  const [chatOpen, setChatOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [chatSeed, setChatSeed] = useState<{ text: string; n: number } | null>(null);
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
    const onPop = () => setStep(stepFromUrl());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: StepId) => {
    const params = new URLSearchParams(location.search);
    params.set('report', reportId);
    params.set('step', next);
    history.pushState(null, '', `?${params}`);
    setStep(next);
    if (next === 'work') setChatOpen(false);
    scrollTo({ top: 0 });
  }, [reportId]);

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
  const comps = useMemo(() => workspaceComps(parsed, data?.comps ?? []), [parsed, data?.comps]);
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
    applyServer: (d) => setData((prev) => (prev ? { ...prev, report: d.report, imports: d.imports, comps: d.comps } : d)),
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
    const home = own(intake) || own(brief) || own(target) || own(dealTerms);
    const reveal = Boolean(call && !call.sample);
    const sendOwn = own(send);
    if (which === 'home') return home;
    if (which === 'reveal') return reveal;
    if (which === 'send') return sendOwn;
    return which === 'all' && (home || reveal || sendOwn);
  };

  if (ws) {
    ws.fillSample = async (which) => {
      if (!canSample) return;
      if (ownValues(which) && !confirm('Replace what you’ve entered here with the sample (100 Barclay #17L)?')) return;
      const all = which === 'all';
      await ws.run(all ? 'Filling the whole report with sample data…' : 'Filling with sample…', async () => {
        const needsWalkthrough = all || which === 'home' || which === 'reveal' || which === 'send';
        const sample = needsWalkthrough ? await workspaceApi.sample() : null;
        let nextState = stateRef.current;
        if (sample && (all || which === 'home')) {
          nextState = { ...nextState, intake: sample.intake, dealTerms: sample.dealTerms };
          setBriefState(sample.brief);
          save.queue('brief', sample.brief);
          setTargetState(sample.target);
          save.queue('target', sample.target);
        }
        if (sample && (all || which === 'send')) nextState = { ...nextState, send: { ...nextState.send, ...sample.send } };
        if (nextState !== stateRef.current) setState(nextState);
        if (all || which === 'export' || which === 'sort') {
          // The sample sorts the sample export's comps, so the export comes first.
          let latest: WorkspaceData | null = null;
          if (!hasSampleImport) latest = await workspaceApi.importSample(reportId);
          if (all || which === 'sort') latest = await workspaceApi.sortSample(reportId);
          if (latest) ws.applyServer(latest);
        }
        if (sample && (all || which === 'reveal')) {
          const next: CallState = { ...sample.call, at: new Date().toISOString() };
          setCallState(next);
          save.queue('call', next);
        }
        if (which === 'work') {
          // Nothing to record: a question to start with, in the composer, unsent.
          setChatSeed((s) => ({ text: 'What do the numbers say so far, and which comps need a closer look?', n: (s?.n ?? 0) + 1 }));
          return;
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
    home: hasAny(intake) || hasAny(brief) || Boolean(target) || Boolean(dealTerms),
    export: data.imports.length > 0,
    sort: comps.some((c) => c.judgment?.tier),
    reveal: Boolean(call),
    work: messageCount > 0,
    send: Boolean(send.copiedAt || send.draft),
  };
  const current = STEPS.find((s) => s.id === step)!;

  return (
    <div className={`workspace${chatOpen && step !== 'work' ? ' with-drawer' : ''}`}>
      <div className="ws-head">
        <button type="button" className="link" onClick={onBack}>‹ All reports</button>
        <div className="ws-title-row">
          <h2 className="report-title">{data.report.title}</h2>
          {data.report.sampleData && <span className="tag tag-sample" title="Sample data was used in this report. Nothing in it is for clients.">Sample report</span>}
          {readOnly && <span className="tag tag-stub" title={`${data.report.ownerEmail}'s report. Admins can read it; only its owner can change it.`}>Read only</span>}
        </div>
        <div className="ws-tools">
          {!readOnly && <SaveLine status={save.status} onRetry={() => void save.flush()} />}
          {canSample && (
            <button type="button" className="btn small-btn" disabled={Boolean(busy)} onClick={() => void ws.fillSample('all')}>
              Fill the whole report with sample data
            </button>
          )}
          {step !== 'work' && (
            <button type="button" className="btn small-btn" aria-expanded={chatOpen} onClick={() => setChatOpen((o) => !o)}>
              {chatOpen ? 'Close the assistant' : 'Assistant'}
            </button>
          )}
        </div>
      </div>

      <nav className="rail" aria-label="Steps">
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

      {ws.revealed && step !== 'reveal' && step !== 'work' && <LiveNumbers ws={ws} />}

      <section className="step" aria-labelledby="step-title">
        <div className="step-head">
          <h3 id="step-title"><span className="muted">{current.n}.</span> {current.title}</h3>
          {canSample && (
            <button
              type="button"
              className="btn small-btn"
              disabled={Boolean(busy) || (step === 'export' && hasSampleImport)}
              title={step === 'export' && hasSampleImport ? 'The sample export is already in this report.' : SAMPLE_FILLS[step]}
              onClick={() => void ws.fillSample(step)}
            >
              Fill with sample
            </button>
          )}
        </div>
        <About key={step} step={step} />
        <ErrorBoundary resetKey={step} onBack={onBack}>
          {step === 'home' && <HomeStep ws={ws} />}
          {step === 'export' && <ExportStep ws={ws} />}
          {step === 'sort' && <SortStep ws={ws} />}
          {step === 'reveal' && <RevealStep ws={ws} />}
          {step === 'work' && (
            <div className="work">
              {ws.revealed ? <LiveNumbers ws={ws} /> : (
                <p className="muted small">The numbers show here after your call (step 4). The assistant can already read the comps and their tiers.</p>
              )}
              <p className="muted small">
                <StubTag>CR-4</StubTag> The assistant’s full tool set — tiering, what-ifs, the path to target — comes with CR-4.
              </p>
              <Chat reportId={reportId} readOnly={readOnly} onCount={setMessageCount} seed={chatSeed} />
            </div>
          )}
          {step === 'send' && <SendStep ws={ws} />}
        </ErrorBoundary>
        <div className="step-nav">
          {current.n > 1 && (
            <button type="button" className="btn" onClick={() => go(STEPS[current.n - 2]!.id)}>‹ {STEPS[current.n - 2]!.short}</button>
          )}
          {current.n < STEPS.length && (
            <button type="button" className="btn primary" onClick={() => go(STEPS[current.n]!.id)}>
              {has[step] ? 'Next' : 'Skip'}: {STEPS[current.n]!.short} ›
            </button>
          )}
        </div>
      </section>

      {chatOpen && step !== 'work' && (
        <aside className="drawer" aria-label="The assistant">
          <div className="drawer-head">
            <span className="label">Assistant</span>
            <SampleTag show={data.report.sampleData} />
            <button type="button" className="link" onClick={() => setChatOpen(false)}>Close</button>
          </div>
          <Chat reportId={reportId} readOnly={readOnly} onCount={setMessageCount} seed={chatSeed} />
        </aside>
      )}
    </div>
  );
}
