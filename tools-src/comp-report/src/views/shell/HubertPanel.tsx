// Hubert's panel on the left (design pass: new-comp.md §2, then comps.md §2, 2026-11-18): one panel, the same
// beside the New comp window and across the workspace. Open by default where the design says so, resizable
// from 300 to 640px by the seam on its right edge (drag, arrow keys, or double-click for 400px again), and
// closed to a black tab at the page's left edge. The width is kept per browser.
import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Hubert } from '../Hubert.tsx';
import type { Workspace } from '../workspace/model.ts';
import '../../styles/newcomp.css';

const HUB_KEY = 'cr-nc-hubert-w';
export const HUB_DEFAULT = 400;
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

/** The panel's width, kept in this browser (the window and the workspace share it). */
export function useHubWidth(): [number, (w: number) => void] {
  const [width, setWidth] = useState(savedHub);
  useEffect(() => {
    try {
      if (width === HUB_DEFAULT) localStorage.removeItem(HUB_KEY);
      else localStorage.setItem(HUB_KEY, String(width));
    } catch {
      // Private mode: the width lasts as long as the page.
    }
  }, [width]);
  return [width, setWidth];
}

export function HubertPanel({ ws, width, onWidth, className = '' }: { ws: Workspace; width: number; onWidth: (w: number) => void; className?: string }) {
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
    <aside className={`nc-hub${dragging ? ' resizing' : ''}${className ? ` ${className}` : ''}`} style={{ width }}>
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

/** Hubert closed: the black tab at the left edge that opens him again. */
export function HubertOpenTab({ ws, className = '' }: { ws: Workspace; className?: string }) {
  return (
    <button type="button" className={`nc-htab${className ? ` ${className}` : ''}`} aria-label="Open Hubert" onClick={() => ws.setDrawerOpen(true)}>
      <span aria-hidden="true" className="nc-htab-spark">✦</span><span className="nc-htab-word">HUBERT</span>
    </button>
  );
}
