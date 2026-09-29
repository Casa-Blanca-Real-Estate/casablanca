// New comp (Dispatch 09; `02-screens.md`, New comp): the start, as one guided
// flow in a modal — the home, its details, then add comps — landing in the
// workspace on Sort with the comps already in. Everything past the home can be
// skipped. The target, deal terms and client note come later, when they matter.
//
// The first screen makes the report. From then on the modal sits over the
// workspace (?report=…&start=details|comps), so what's entered saves as it's
// typed and a reload lands back on the same screen.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, linksApi, workspaceApi, type Me, type Report } from '../../api.ts';
import { checkListingLink, titleFromLink } from '../../../workspace/links.ts';
import type { Audience, Brief, Intake } from '../../../workspace/state.ts';
import { AddComps, CompList, GUIDANCE } from '../workspace/AddComps.tsx';
import { entry } from '../workspace/bits.tsx';
import { localToday, type Workspace } from '../workspace/model.ts';
import { HomeDetails } from './Details.tsx';

export type StartScreen = 'home' | 'details' | 'comps';
const SCREENS: { id: StartScreen; n: number; title: string }[] = [
  { id: 'home', n: 1, title: 'The home' },
  { id: 'details', n: 2, title: 'The details' },
  { id: 'comps', n: 3, title: 'Add comps' },
];

function Frame({ screen, onScreen, onClose, children, footer }: {
  screen: StartScreen;
  onScreen?: (s: StartScreen) => void;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
    // The page behind stays put while the modal is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const current = SCREENS.find((s) => s.id === screen)!;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-comp-title" tabIndex={-1} ref={dialog}>
        <div className="modal-head">
          <ol className="modal-steps" aria-label="New comp">
            {SCREENS.map((s) => (
              <li key={s.id} aria-current={s.id === screen ? 'step' : undefined}>
                {onScreen && s.id !== screen
                  ? <button type="button" className="link" onClick={() => onScreen(s.id)}>{s.n} {s.title}</button>
                  : <span>{s.n} {s.title}</span>}
              </li>
            ))}
          </ol>
          <button type="button" className="link" onClick={onClose}>Close</button>
        </div>
        <h2 id="new-comp-title" className="modal-title">{current.title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

function unitLabel(unit: string): string {
  const u = unit.trim();
  return u.startsWith('#') ? u : `#${u}`;
}

/** The home's link, or its address: one is enough. Buyer or seller, and the client's name. */
function HomeFields({ link, setLink, address, setAddress, unit, setUnit, audience, setAudience, client, setClient, linkLocked }: {
  link: string; setLink: (v: string) => void;
  address: string; setAddress: (v: string) => void;
  unit: string; setUnit: (v: string) => void;
  audience: Audience; setAudience: (v: Audience) => void;
  client: string; setClient: (v: string) => void;
  linkLocked?: string | null;
}) {
  const check = link.trim() ? checkListingLink(link) : null;
  return (
    <div className="home-fields">
      <div className="grid">
        <label className="field wide">
          <span className="field-label">The home’s StreetEasy link</span>
          {linkLocked
            ? <span className="muted small">{linkLocked}</span>
            : <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://streeteasy.com/building/…" />}
          {check && !check.ok
            ? <span className="field-hint error">Paste a StreetEasy listing link, or type the address. {check.reason}</span>
            : !linkLocked && <span className="field-hint">Its details fill themselves in; you check them on the next screen. A home that’s off the market is fine.</span>}
        </label>
        <label className="field">
          <span className="field-label">Or its address</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 100 Barclay Street, New York, NY" />
        </label>
        <label className="field">
          <span className="field-label">Unit</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="#17L" />
        </label>
      </div>
      <div className="grid">
        <div className="field">
          <span className="field-label">It’s for</span>
          <div className="segmented" role="radiogroup" aria-label="Buyer or seller">
            {(['buyer', 'seller'] as const).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={audience === a} className={audience === a ? 'on' : ''} onClick={() => setAudience(a)}>
                {a === 'buyer' ? 'A buyer' : 'A seller'}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="field-label">The client’s name</span>
          <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Optional: used in the email’s greeting" maxLength={120} />
        </label>
        <label className="field">
          <span className="field-label">Property type</span>
          <select aria-label="Property type" value="condo" onChange={() => undefined}>
            <option value="condo">Condo</option>
            <option value="coop" disabled>Co-op (coming soon)</option>
          </select>
        </label>
      </div>
    </div>
  );
}

/** Screen 1, before the report exists: makes it, and hands over to the workspace. */
export function NewCompStart({ me, onCreated, onClose }: { me: Me; onCreated: (id: string) => void; onClose: () => void }) {
  const [link, setLink] = useState('');
  const [address, setAddress] = useState('');
  const [unit, setUnit] = useState('');
  const [audience, setAudience] = useState<Audience>('buyer');
  const [client, setClient] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const check = link.trim() ? checkListingLink(link) : null;
  const ready = Boolean((check?.ok || address.trim()) && !(check && !check.ok));

  async function create(e?: FormEvent) {
    e?.preventDefault();
    if (!ready) return;
    setBusy('Starting the report…');
    setError(null);
    try {
      const url = check?.ok ? check.url : null;
      const title = address.trim()
        ? `${address.trim().split(',')[0]}${unit.trim() ? ` ${unitLabel(unit)}` : ''}`
        : (url && titleFromLink(url)) ?? 'A StreetEasy listing';
      const { report } = await api<{ report: Report }>('/api/comp-report/reports', { method: 'POST', body: { title } });
      const today = localToday();
      const brief: Brief = { audience: entry(audience, today), ...(client.trim() ? { clientName: entry(client.trim(), today) } : {}) };
      const intake: Intake = {
        ...(address.trim() ? { address: entry(address.trim(), today) } : {}),
        ...(unit.trim() ? { unit: entry(unit.trim(), today) } : {}),
      };
      await workspaceApi.save(report.id, { brief, state: { intake } });
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
      onCreated(report.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function useSample() {
    setBusy('Filling in the 100 Barclay sample…');
    setError(null);
    try {
      const sample = await workspaceApi.sample();
      const { report } = await api<{ report: Report }>('/api/comp-report/reports', { method: 'POST', body: { title: '100 Barclay Street #17L' } });
      const brief: Brief = { audience: sample.brief.audience!, ...(sample.send.clientName ? { clientName: sample.send.clientName } : {}) };
      await workspaceApi.save(report.id, { brief, state: { intake: sample.intake }, sampleData: true });
      await workspaceApi.importSample(report.id);
      onCreated(report.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  return (
    <Frame
      screen="home"
      onClose={onClose}
      footer={(
        <>
          {me.user.role === 'admin' && (
            <button type="button" className="link small" disabled={Boolean(busy)} onClick={() => void useSample()}>
              Use the 100 Barclay sample
            </button>
          )}
          <button type="button" className="btn primary" disabled={!ready || Boolean(busy)} onClick={() => void create()}>Next: the details ›</button>
        </>
      )}
    >
      <form onSubmit={create}>
        <HomeFields
          link={link} setLink={setLink} address={address} setAddress={setAddress} unit={unit} setUnit={setUnit}
          audience={audience} setAudience={setAudience} client={client} setClient={setClient}
        />
      </form>
      {busy && <p className="notice" aria-live="polite">{busy}</p>}
      {error && <p className="notice error-notice" role="alert">{error}</p>}
    </Frame>
  );
}

/** Screens 1 to 3 for a report that exists, over the workspace. */
export function StartFlow({ ws, screen, onScreen, onDone }: {
  ws: Workspace;
  screen: StartScreen;
  onScreen: (s: StartScreen) => void;
  onDone: () => void;
}) {
  if (screen === 'home') return <HomeScreen ws={ws} onScreen={onScreen} onDone={onDone} />;
  if (screen === 'details') return <DetailsScreen ws={ws} onScreen={onScreen} onDone={onDone} />;
  return (
    <Frame
      screen="comps"
      onScreen={onScreen}
      onClose={onDone}
      footer={(
        <>
          <button type="button" className="btn" onClick={() => onScreen('details')}>‹ The details</button>
          <button type="button" className="btn primary" onClick={onDone}>Done: sort the comps ›</button>
        </>
      )}
    >
      <p className="guidance">{GUIDANCE} <span className="muted">(Kara)</span></p>
      <AddComps ws={ws} />
      <CompList ws={ws} />
    </Frame>
  );
}

function HomeScreen({ ws, onScreen, onDone }: { ws: Workspace; onScreen: (s: StartScreen) => void; onDone: () => void }) {
  const home = ws.reads.filter((r) => r.purpose === 'subject').at(-1) ?? null;
  const [link, setLink] = useState('');
  const today = ws.today;
  const set = (patch: Partial<Intake>) => {
    const next: Intake = { ...ws.intake };
    for (const [k, v] of Object.entries(patch) as [keyof Intake, Intake[keyof Intake]][]) {
      if (v === undefined) delete next[k];
      else (next as Record<string, unknown>)[k] = v;
    }
    ws.setIntake(next);
  };
  const check = link.trim() ? checkListingLink(link) : null;

  async function next() {
    if (check?.ok) {
      await ws.run('Reading the home’s page…', async () => {
        ws.applyLinks(await linksApi.add(ws.reportId, [check.url], 'subject'));
      });
    }
    onScreen('details');
  }

  return (
    <Frame
      screen="home"
      onScreen={onScreen}
      onClose={onDone}
      footer={<button type="button" className="btn primary" disabled={Boolean(check && !check.ok)} onClick={() => void next()}>Next: the details ›</button>}
    >
      <HomeFields
        link={link}
        setLink={setLink}
        linkLocked={home && home.status !== 'failed' ? `Read from ${home.url}` : null}
        address={ws.intake.address?.value ?? ''}
        setAddress={(v) => set({ address: v.trim() ? entry(v, today) : undefined })}
        unit={ws.intake.unit?.value ?? ''}
        setUnit={(v) => set({ unit: v.trim() ? entry(v, today) : undefined })}
        audience={ws.brief.audience?.value ?? 'buyer'}
        setAudience={(v) => ws.setBrief({ ...ws.brief, audience: entry(v, today) })}
        client={ws.brief.clientName?.value ?? ''}
        setClient={(v) => {
          const next = { ...ws.brief };
          if (v.trim()) next.clientName = entry(v, today);
          else delete next.clientName;
          ws.setBrief(next);
        }}
      />
    </Frame>
  );
}

function DetailsScreen({ ws, onScreen, onDone }: { ws: Workspace; onScreen: (s: StartScreen) => void; onDone: () => void }) {
  const home = ws.reads.filter((r) => r.purpose === 'subject').at(-1) ?? null;
  const filled = (Object.values(ws.intake) as { from?: string }[]).filter((v) => v?.from === 'listing').length;
  // Why the home's link wasn't read, when it wasn't (the first screen couldn't queue it).
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

  async function next() {
    // Moving on confirms what the page gave: the agent has seen it here.
    if (home && home.status === 'done' && !home.confirmedAt && !ws.readOnly) {
      await ws.run('Saving…', async () => {
        ws.applyLinks(await linksApi.confirmHome(ws.reportId, home.id));
      });
    }
    onScreen('comps');
  }

  return (
    <Frame
      screen="details"
      onScreen={onScreen}
      onClose={onDone}
      footer={(
        <>
          <button type="button" className="btn" onClick={() => onScreen('home')}>‹ The home</button>
          <button type="button" className="btn primary" onClick={() => void next()}>Next: add comps ›</button>
        </>
      )}
    >
      {home && (home.status === 'queued' || home.status === 'running') && (
        <p className="notice" aria-live="polite">Reading the home’s StreetEasy page… Its details fill in here when it’s read. Type anything you know meanwhile.</p>
      )}
      {home?.status === 'done' && filled > 0 && (
        <p className="notice" aria-live="polite">
          {filled} detail{filled === 1 ? '' : 's'} came from StreetEasy, marked below. Check them: anything you change is yours.
        </p>
      )}
      {refused && !home && <p className="notice error-notice" role="alert">The home’s page wasn’t read: {refused} Type the details in.</p>}
      {home?.status === 'failed' && (
        <p className="notice error-notice" role="alert">The home’s page couldn’t be read: {home.errorMessage} Type the details in.</p>
      )}
      <HomeDetails ws={ws} />
    </Frame>
  );
}
