// Small pieces of the shell: the centred frame for sign-in and the states, the loading line, the busy
// and error lines, the Hubert drawer's box and its tab, and the admin's dev strip.
import type { ReactNode } from 'react';
import type { Workspace } from '../workspace/model.ts';
import type { StepId } from '../workspace/About.tsx';
import { About } from '../workspace/About.tsx';
import { Hubert } from '../Hubert.tsx';

/** Centres a card in the space under the bar (sign-in, loading, errors). */
export function Center({ children }: { children: ReactNode }) {
  return <div className="sh-center">{children}</div>;
}

/** "Loading…": a line with a small pulsing square, said to screen readers too. */
export function StateLine({ children }: { children: ReactNode }) {
  return (
    <p className="sh-state" role="status">
      <span className="sh-pulse" aria-hidden="true" />
      {children}
    </p>
  );
}

/** The busy line and the error line while a server call runs or fails. */
export function Notes({ busy, error, onDismiss }: { busy: string | null; error: string | null; onDismiss: () => void }) {
  if (!busy && !error) return null;
  return (
    <>
      {busy && (
        <p className="sh-note" aria-live="polite">
          <span className="sh-pulse" aria-hidden="true" />
          {busy}
        </p>
      )}
      {error && (
        <p className="sh-note error" role="alert">
          <span>{error}</span>
          <button type="button" className="link" onClick={onDismiss}>Dismiss</button>
        </p>
      )}
    </>
  );
}

const FILLS: { which: 'sort' | 'findings' | 'send' | 'all'; label: string }[] = [
  { which: 'sort', label: 'Sort' },
  { which: 'findings', label: 'Findings' },
  { which: 'send', label: 'Send' },
  { which: 'all', label: 'All' },
];

/** The admin's strip under the header, with dev tools on: Fill with sample, and About this screen. */
export function DevStrip({ ws, step, fills }: { ws: Workspace; step: StepId; fills: Record<StepId, string> }) {
  return (
    <div className="sh-dev">
      <div className="sh-dev-row">
        <span className="eyebrow lav sh-dev-label">Dev tools</span>
        {ws.canSample && (
          <span className="sh-dev-fill">
            Fill with sample:
            {FILLS.map((f, i) => (
              <span key={f.which}>
                {i > 0 && <span className="sh-dev-dot" aria-hidden="true"> · </span>}
                <button
                  type="button"
                  className="link"
                  disabled={Boolean(ws.busy)}
                  title={f.which === 'all' ? 'Fills the whole report with 100 Barclay #17L: the home, the sorted comps, the call, the terms and the email’s lines.' : fills[f.which]}
                  onClick={() => void ws.fillSample(f.which)}
                >
                  {f.label}
                </button>
              </span>
            ))}
          </span>
        )}
      </div>
      <About key={step} step={step} />
    </div>
  );
}

/** The drawer's box: fixed under the bar at the right, 380px wide. Hubert fills it. */
export function HubertDrawer({ ws }: { ws: Workspace }) {
  return (
    <aside className="hubert-drawer">
      <Hubert ws={ws} />
    </aside>
  );
}

/**
 * The handoff's tab at the page's right edge, which opens and closes the drawer. The bar's Hubert
 * pill does the same for the keyboard and screen readers, so the tab stays out of both.
 */
export function HubertTab({ ws }: { ws: Workspace }) {
  return (
    <button type="button" className="sh-hubert-tab" aria-hidden="true" tabIndex={-1} onClick={() => ws.setDrawerOpen(!ws.drawerOpen)}>
      <span className="sh-spark">✦</span>
      <span className="sh-hubert-word">Hubert</span>
    </button>
  );
}
