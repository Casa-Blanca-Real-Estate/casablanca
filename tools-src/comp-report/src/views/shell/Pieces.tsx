// Small pieces of the shell: the centred frame for sign-in and the states, the loading line, the busy
// and error lines, the Hubert drawer's box and its tab, and the admin's dev strip.
import { useEffect, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
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

/**
 * The strip under the header: Fill with sample for an admin or a guest at every step, whether dev tools
 * are on or not (Kimani couldn't walk the report through on production with them off); About this screen
 * with dev tools on.
 */
export function DevStrip({ ws, step, fills }: { ws: Workspace; step: StepId; fills: Record<StepId, string> }) {
  return (
    <div className="sh-dev">
      <div className="sh-dev-row">
        <span className="eyebrow lav sh-dev-label">{ws.devTools ? 'Dev tools' : 'Sample'}</span>
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
      {ws.devTools && <About key={step} step={step} />}
    </div>
  );
}

// The drawer's width: 380px (the handoff) until the agent drags its left edge. Kept per browser, and
// set on --sh-drawer-w, so the page's margin, the tab and the toast move with it.
const DRAWER_KEY = 'cr-hubert-width';
const DRAWER_DEFAULT = 380;
const DRAWER_MIN = 320;
// Up to 900px, and no wider than leaves the screen beside it 960px (the email preview overflows under
// that), but always at least the 380px it opens at.
const drawerMax = () => Math.max(DRAWER_DEFAULT, Math.min(900, window.innerWidth - 960));
const clampWidth = (w: number) => Math.round(Math.min(drawerMax(), Math.max(DRAWER_MIN, w)));

function savedWidth(): number {
  try {
    const n = Number(localStorage.getItem(DRAWER_KEY));
    return n > 0 ? clampWidth(n) : DRAWER_DEFAULT;
  } catch {
    return DRAWER_DEFAULT;
  }
}

/** The drawer's box: fixed under the bar at the right, 380px wide until resized. Hubert fills it. */
export function HubertDrawer({ ws }: { ws: Workspace }) {
  const [width, setWidth] = useState(savedWidth);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--sh-drawer-w', `${width}px`);
    try {
      if (width === DRAWER_DEFAULT) localStorage.removeItem(DRAWER_KEY);
      else localStorage.setItem(DRAWER_KEY, String(width));
    } catch {
      // Private mode: the width lasts as long as the page.
    }
  }, [width]);

  // A narrower window pulls a wide drawer back in.
  useEffect(() => {
    const fit = () => setWidth((w) => clampWidth(w));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  function start(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (dragging) setWidth(clampWidth(window.innerWidth - e.clientX));
  }
  function stop(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === 'ArrowLeft') setWidth((w) => clampWidth(w + step));
    else if (e.key === 'ArrowRight') setWidth((w) => clampWidth(w - step));
    else if (e.key === 'Home') setWidth(clampWidth(drawerMax()));
    else if (e.key === 'End') setWidth(DRAWER_MIN);
    else return;
    e.preventDefault();
  }

  return (
    <aside className={`hubert-drawer${dragging ? ' resizing' : ''}`}>
      <div
        className="hubert-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Hubert’s panel"
        aria-valuenow={width}
        aria-valuemin={DRAWER_MIN}
        aria-valuemax={drawerMax()}
        tabIndex={0}
        title="Drag to resize. Double-click to reset."
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onDoubleClick={() => setWidth(DRAWER_DEFAULT)}
        onKeyDown={key}
      />
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
