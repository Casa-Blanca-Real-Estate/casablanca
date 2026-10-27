// New report (Dispatch 09, ported to the handoff in Dispatch 14): one guided
// flow in a modal, three steps — which home, its details, add comps — landing
// in the workspace on Sort, where Hubert opens by himself the first time.
//
// The first step makes the report. From then on the modal sits over the
// workspace (?report=…&start=details|comps), so what's entered saves as it's
// typed and a reload lands back on the same step. The details step is also
// Edit details, opened from a workspace's ✎: same body, its own header and
// footer, and Cancel puts back what was there when it opened.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, linksApi, maySample, workspaceApi, type Me, type Report } from '../../api.ts';
import { titleFromLink } from '../../../workspace/links.ts';
import type { Audience, Brief, Intake } from '../../../workspace/state.ts';
import { AddBar, useDropTarget } from '../comp/AddBar.tsx';
import { readPrice } from '../comp/CompForm.tsx';
import { AddList, GUIDANCE, ImportNotes } from '../workspace/AddComps.tsx';
import { entry } from '../workspace/bits.tsx';
import { localToday, type Workspace } from '../workspace/model.ts';
import { ReadingNotice } from '../workspace/ReadingNotice.tsx';
import { inFlight } from '../workspace/reads.ts';
import { HomeDetails } from './Details.tsx';
import { endNewReport, Frame, Info, isNewReport, markNewReport } from './Frame.tsx';
import { HomeFields, HomeLineInput, homeLineReady, Matched, readHomeLine, targetText, TYPE_LABEL, type PropertyType } from './Home.tsx';

export type StartScreen = 'home' | 'details' | 'comps';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Step 1, before the report exists: makes it, and hands over to the workspace on step 2. */
export function NewCompStart({ me, onCreated, onClose }: { me: Me; onCreated: (id: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [side, setSide] = useState<Audience>('buyer');
  const [client, setClient] = useState('');
  const [type, setType] = useState<PropertyType>('coop');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const line = readHomeLine(text);
  const price = readPrice(target);
  const ready = homeLineReady(line) && !(target.trim() && price === null);

  async function create(e?: FormEvent) {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy('Starting the report…');
    setError(null);
    try {
      const url = line.kind === 'link' && line.check.ok ? line.check.url : null;
      const title = url ? (titleFromLink(url) ?? 'A StreetEasy listing') : line.kind === 'typed' ? line.title : 'A StreetEasy listing';
      const { report } = await api<{ report: Report }>('/api/comp-report/reports', { method: 'POST', body: { title, propertyType: type } });
      const today = localToday();
      const brief: Brief = { audience: entry(side, today), ...(client.trim() ? { clientName: entry(client.trim(), today) } : {}) };
      const intake: Intake = line.kind === 'typed'
        ? { address: entry(line.address, today), ...(line.unit ? { unit: entry(line.unit, today) } : {}) }
        : {};
      await workspaceApi.save(report.id, { brief, state: { intake }, ...(price ? { target: { price: entry(price, today) } } : {}) });
      // The workspace starts the read as it opens, and the details fill in when it lands.
      // If the link can't be read (today's limit), the report is made anyway, and the details say why.
      if (url) {
        const added = await linksApi.add(report.id, [url], 'subject').catch(() => null);
        const refusal = added ? added.refused[0]?.reason : 'The home’s page couldn’t be queued for reading.';
        if (refusal) {
          try {
            sessionStorage.setItem(`cr-home-refused:${report.id}`, refusal);
          } catch {
            // Private mode: the details just don't say why.
          }
        }
      }
      markNewReport(report.id);
      onCreated(report.id);
    } catch (err) {
      setError(message(err));
      setBusy(null);
    }
  }

  // The sample report is built on the server, in one go (Dispatch 23): the home, and its export imported.
  async function useSample(kind: PropertyType) {
    setBusy(`Filling in the 100 Barclay sample (${TYPE_LABEL[kind].toLowerCase()})…`);
    setError(null);
    try {
      const sample = await workspaceApi.sample(kind);
      const { report } = await workspaceApi.newSample(kind, sample.title);
      void workspaceApi.captureSamplePhotos();
      markNewReport(report.id);
      onCreated(report.id);
    } catch (err) {
      setError(message(err));
      setBusy(null);
    }
  }

  return (
    <Frame
      step={1}
      title="New report: which home?"
      onClose={onClose}
      footer={(
        <>
          {maySample(me) && (
            <span className="nr-back">
              Use the 100 Barclay sample:{' '}
              <button type="button" className="link" disabled={Boolean(busy)} onClick={() => void useSample('condo')}>Condo</button>
              <span aria-hidden="true"> · </span>
              <button type="button" className="link" disabled={Boolean(busy)} onClick={() => void useSample('coop')}>Co-op</button>
            </span>
          )}
          <span className="nr-foot-r">
            {busy && <span className="nr-busy" aria-live="polite">{busy}</span>}
            <button type="button" className="btn primary" disabled={!ready || Boolean(busy)} onClick={() => void create()}>Next →</button>
          </span>
        </>
      )}
    >
      <form className="nr-form" onSubmit={create}>
        <HomeFields
          line={<HomeLineInput text={text} onText={setText} type={type} disabled={Boolean(busy)} />}
          side={side}
          onSide={setSide}
          client={client}
          onClient={setClient}
          type={type}
          onType={setType}
          target={target}
          onTarget={setTarget}
          onTargetBlur={() => price && setTarget(targetText(price))}
          disabled={Boolean(busy)}
        />
        {/* Enter in a field makes the report, as Next does. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {error && <p className="nr-err" role="alert">{error}</p>}
    </Frame>
  );
}

/** Steps 1 to 3 for a report that exists, over the workspace; or Edit details. */
export function StartFlow({ ws, screen, onScreen, onDone }: {
  ws: Workspace;
  screen: StartScreen;
  onScreen: (s: StartScreen) => void;
  onDone: () => void;
}) {
  // A new report's flow, or Edit details from a workspace's ✎ (the details step on its own).
  const [isNew] = useState(() => screen !== 'details' || isNewReport(ws.reportId));
  // Leaving the report ends the flow; a reload doesn't (it lands back on the same step).
  // The clear waits a tick, so StrictMode's mount-unmount-mount doesn't end it.
  const clearing = useRef(0);
  useEffect(() => {
    window.clearTimeout(clearing.current);
    const id = ws.reportId;
    return () => {
      clearing.current = window.setTimeout(() => endNewReport(id), 0);
    };
  }, [ws.reportId]);

  // The flow ends in the workspace, on Sort.
  const finish = () => {
    endNewReport(ws.reportId);
    onDone();
  };
  // Edit details closes back to the screen it was opened from.
  const stay = () => ws.go(ws.screen);
  const close = isNew ? finish : stay;

  if (screen === 'home') return <HomeScreen ws={ws} onScreen={onScreen} onClose={close} />;
  if (screen === 'details') return <DetailsScreen ws={ws} editing={!isNew} onScreen={onScreen} onClose={close} />;
  return <CompsScreen ws={ws} onScreen={onScreen} onClose={close} onOpen={finish} />;
}

/** A server call from inside the modal: the busy line shows in its footer, and a failure says so here (the workspace's error line is behind the scrim). */
function useRunHere(ws: Workspace) {
  const [error, setError] = useState<string | null>(null);
  const run = async (label: string, work: () => Promise<void>): Promise<boolean> => {
    let failed: string | null = null;
    setError(null);
    await ws.run(label, async () => {
      try {
        await work();
      } catch (e) {
        failed = message(e);
      }
    });
    setError(failed);
    return failed === null;
  };
  return { run, error };
}

function FootRight({ ws, error, children }: { ws: Workspace; error?: string | null; children: ReactNode }) {
  return (
    <span className="nr-foot-r">
      {error && <span className="nr-err" role="alert">{error}</span>}
      {!error && ws.busy && <span className="nr-busy" aria-live="polite">{ws.busy}</span>}
      {children}
    </span>
  );
}

/** Steps 2 and 3, for an admin or a guest: the whole report filled with the sample, then the workspace. */
function SampleRest({ ws, onDone }: { ws: Workspace; onDone: () => void }) {
  if (!ws.canSample) return null;
  return (
    <button
      type="button"
      className="link nr-back"
      disabled={Boolean(ws.busy)}
      title="Fills the whole report with 100 Barclay #17L: the home, the sorted comps, the call, the terms and the email’s lines."
      onClick={() => void ws.fillSample('all').then((ran) => ran && onDone())}
    >
      Fill the rest with the sample
    </button>
  );
}

/** "100 Barclay Street #17L": what was typed for the home, to show it back. */
function typedHome(intake: Intake): string {
  const unit = intake.unit?.value.trim();
  return [intake.address?.value.trim(), unit ? (unit.startsWith('#') ? unit : `#${unit}`) : ''].filter(Boolean).join(' ');
}

/** Step 1 again, for the report made a moment ago: everything saves as it changes. */
function HomeScreen({ ws, onScreen, onClose }: { ws: Workspace; onScreen: (s: StartScreen) => void; onClose: () => void }) {
  const home = ws.reads.filter((r) => r.purpose === 'subject').at(-1) ?? null;
  const locked = Boolean(home && home.status !== 'failed');
  const [text, setText] = useState(() => (locked ? '' : typedHome(ws.intake)));
  const [target, setTarget] = useState(() => targetText(ws.target?.price.value));
  const { run, error } = useRunHere(ws);
  const today = ws.today;
  const off = ws.readOnly;
  const line = readHomeLine(text);
  const price = readPrice(target);

  const onText = (v: string) => {
    setText(v);
    const l = readHomeLine(v);
    const next: Intake = { ...ws.intake };
    if (l.kind === 'typed') {
      if (l.address.trim().length < 3) return;
      next.address = entry(l.address, today);
      if (l.unit) next.unit = entry(l.unit, today);
      else delete next.unit;
      // The report is called what's typed (Dispatch 14's follow-up): a changed address retitles it.
      if (l.title !== ws.report.title) ws.setTitle(l.title);
    } else {
      // A link (its page fills the address) or nothing: the typed address goes.
      if (!next.address && !next.unit) return;
      delete next.address;
      delete next.unit;
    }
    ws.setIntake(next);
  };
  const onTarget = (v: string) => {
    setTarget(v);
    if (!v.trim()) {
      if (ws.target) ws.setTarget(null);
      return;
    }
    const n = readPrice(v);
    if (n !== null && n !== ws.target?.price.value) ws.setTarget({ ...(ws.target ?? {}), price: entry(n, today) });
  };
  const ready = !(line.kind === 'link' && !line.check.ok) && !(target.trim() && price === null);

  async function next() {
    if (!ready) return;
    if (!off && line.kind === 'link' && line.check.ok) {
      const url = line.check.url;
      const ok = await run('Reading the home’s page…', async () => {
        ws.applyLinks(await linksApi.add(ws.reportId, [url], 'subject'));
      });
      if (!ok) return;
    }
    onScreen('details');
  }

  const i = ws.intake;
  const meta = home && (home.status === 'queued' || home.status === 'running')
    ? `${TYPE_LABEL[ws.propertyType]} · reading its StreetEasy page…`
    : [TYPE_LABEL[ws.propertyType], i.neighborhood?.value, i.beds && `${i.beds.value} bd`, i.baths && `${i.baths.value} ba`, i.floor && `Fl ${i.floor.value}`].filter(Boolean).join(' · ');

  return (
    <Frame
      step={1}
      title="New report: which home?"
      onClose={onClose}
      footer={(
        <>
          <SampleRest ws={ws} onDone={onClose} />
          <FootRight ws={ws} error={error}>
            <button type="button" className="btn primary" disabled={!ready || Boolean(ws.busy)} onClick={() => void next()}>Next →</button>
          </FootRight>
        </>
      )}
    >
      <HomeFields
        line={locked ? (
          <div className="nr-home">
            <div className="nr-line locked" title={home!.url}>{home!.url.replace(/^https:\/\/(www\.)?/, '')}</div>
            <Matched name={ws.report.title} meta={meta} />
          </div>
        ) : (
          <HomeLineInput text={text} onText={onText} type={ws.propertyType} disabled={off} />
        )}
        side={ws.side}
        onSide={(a) => ws.setBrief({ ...ws.brief, audience: entry(a, today) })}
        client={ws.brief.clientName?.value ?? ''}
        onClient={(v) => {
          const b = { ...ws.brief };
          if (v.trim()) b.clientName = entry(v, today);
          else delete b.clientName;
          ws.setBrief(b);
        }}
        type={ws.propertyType}
        onType={ws.setPropertyType}
        target={target}
        onTarget={onTarget}
        onTargetBlur={() => price && setTarget(targetText(price))}
        owner={ws.target?.owner}
        disabled={off}
      />
    </Frame>
  );
}

/** Step 2, or Edit details. */
function DetailsScreen({ ws, editing, onScreen, onClose }: { ws: Workspace; editing: boolean; onScreen: (s: StartScreen) => void; onClose: () => void }) {
  const home = ws.reads.filter((r) => r.purpose === 'subject').at(-1) ?? null;
  const { run, error } = useRunHere(ws);
  // Why the home's link wasn't read, when it wasn't (step 1 couldn't queue it).
  const [refused] = useState(() => {
    try {
      const key = `cr-home-refused:${ws.reportId}`;
      const why = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      return why;
    } catch {
      return null;
    }
  });
  // Edit details: what Cancel puts back.
  const [before] = useState(() => ({ intake: ws.intake, brief: ws.brief, propertyType: ws.propertyType }));

  /** Moving on confirms what the page gave: the agent has seen it here. */
  async function confirmHome(): Promise<boolean> {
    if (!home || home.status !== 'done' || home.confirmedAt || ws.readOnly) return true;
    return run('Saving…', async () => {
      ws.applyLinks(await linksApi.confirmHome(ws.reportId, home.id));
    });
  }
  // Leaving while the page is read: say it carries on (the 2026-10-22 demo).
  const stillReading = () => {
    if (home && inFlight([home]).length && !ws.readOnly) ws.toast('Still reading the home’s StreetEasy page. It keeps going, and the details fill in when it’s read.');
  };
  const cancel = () => {
    if (ws.readOnly) return onClose();
    if (JSON.stringify(ws.intake) !== JSON.stringify(before.intake)) ws.setIntake(before.intake);
    if (JSON.stringify(ws.brief) !== JSON.stringify(before.brief)) ws.setBrief(before.brief);
    if (ws.propertyType !== before.propertyType) ws.setPropertyType(before.propertyType);
    // Closing marks the screen reached, from the workspace state as it was rendered: a tick
    // later, that state has the details put back, so the close doesn't undo the Cancel.
    window.setTimeout(onClose, 0);
  };

  const notices = (
    <>
      {refused && !home && <p className="nr-note bad" role="alert">The home’s page wasn’t read: {refused} Type the details in.</p>}
      {home?.status === 'failed' && (
        <p className="nr-note bad" role="alert">The home’s page couldn’t be read: {home.errorMessage} Type the details in.</p>
      )}
    </>
  );

  return (
    <Frame
      step={2}
      editing={editing}
      title={editing ? 'Edit details' : 'New report: the details'}
      onClose={() => {
        stillReading();
        (editing ? cancel : onClose)();
      }}
      footer={editing ? (
        <>
          <button type="button" className="link nr-back" onClick={cancel}>Cancel</button>
          <FootRight ws={ws} error={error}>
            <button type="button" className="btn primary" disabled={Boolean(ws.busy)} onClick={() => void confirmHome().then((ok) => ok && (stillReading(), onClose()))}>
              {ws.readOnly ? 'Close' : 'Save changes'}
            </button>
          </FootRight>
        </>
      ) : (
        <>
          <button type="button" className="link nr-back" onClick={() => onScreen('home')}>← Back</button>
          <SampleRest ws={ws} onDone={onClose} />
          <FootRight ws={ws} error={error}>
            <button type="button" className="btn primary" disabled={Boolean(ws.busy)} onClick={() => void confirmHome().then((ok) => ok && (stillReading(), onScreen('comps')))}>Next →</button>
          </FootRight>
        </>
      )}
    >
      <HomeDetails ws={ws} notices={notices} />
    </Frame>
  );
}

/** Step 3: add comps. The paste bar and its form, the export dropped anywhere on the card, then the rows by status. */
function CompsScreen({ ws, onScreen, onClose, onOpen }: { ws: Workspace; onScreen: (s: StartScreen) => void; onClose: () => void; onOpen: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const drop = useDropTarget(ws, setNote);
  const toConfirm = ws.comps.filter((c) => c.unconfirmed).length;
  const readingNow = inFlight(ws.reads.filter((r) => r.purpose === 'comp'));
  const reading = readingNow.length;
  // Leaving while pages are read: say they carry on (the 2026-10-22 demo).
  const leave = (go: () => void) => () => {
    if (reading && !ws.readOnly) ws.toast(`Still reading ${reading === 1 ? '1 comp’s page' : `${reading} comps’ pages`}. ${reading === 1 ? 'It keeps' : 'They keep'} going, and each comp lands on Sort when it’s read.`);
    go();
  };
  const count = toConfirm ? `${toConfirm} to confirm` : reading ? `${reading} reading` : ws.comps.length ? 'All confirmed' : '';
  return (
    <Frame
      step={3}
      title="New report: add comps"
      onClose={leave(onClose)}
      drop={drop.handlers}
      veil={drop.veil}
      footer={(
        <>
          <button type="button" className="link nr-back" onClick={() => onScreen('details')}>← Back</button>
          <SampleRest ws={ws} onDone={onOpen} />
          <FootRight ws={ws}>
            <span className="nr-confirm-count">{count}</span>
            <button type="button" className="btn primary" onClick={leave(onOpen)}>Open workspace →</button>
          </FootRight>
        </>
      )}
    >
      <div className="nr-title-row">
        <h2 className="nr-h">Add comps</h2>
        <Info align="left" label="How to choose comps" text={`${GUIDANCE} About three of each status, where there are that many.`} />
      </div>
      {ws.readOnly ? <p className="nr-note">Read only: this is another agent’s report.</p> : <AddBar ws={ws} note={note} onNote={setNote} />}
      <ReadingNotice reads={readingNow} what="comps" />
      <AddList ws={ws} />
      <ImportNotes ws={ws} />
    </Frame>
  );
}
