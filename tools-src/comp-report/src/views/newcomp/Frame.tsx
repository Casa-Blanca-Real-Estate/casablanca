// What the New comp window (Window.tsx) shares with the rest of the tool: the ⓘ, the close guard a
// half-typed comp sets, and the mark that tells a new report's window from Edit details across a reload.
// (Until 2026-11-11 this was also the modal's frame: an 820px card on a dark scrim, "N of 3".)
import { createContext, useContext, useEffect, useId, useState } from 'react';
import '../../styles/newreport.css';

/** Something half-done inside the window (a comp form with text in it) that Escape or ✕ would drop. */
export const GuardContext = createContext<((id: string, on: boolean) => void) | null>(null);

/**
 * Inside the window, `on` makes Escape and ✕ ask before closing (Dispatch 20,
 * from Dispatch 14's follow-ups): a half-filled comp isn't dropped by a stray
 * Escape. Outside the window it does nothing.
 */
export function useCloseGuard(on: boolean): void {
  const register = useContext(GuardContext);
  const id = useId();
  useEffect(() => {
    register?.(id, on);
    return () => register?.(id, false);
  }, [register, id, on]);
}

/**
 * The ⓘ: its text shows on hover, on focus and on a click (touch). The line it
 * sits in positions the tip (position: relative), so it never runs off the card.
 */
export function Info({ text, label, align = 'right' }: { text: string; label: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="nr-info"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
      >
        ⓘ
      </button>
      <span role="tooltip" id={id} className={`nr-tip ${align}`} hidden={!open}>{text}</span>
    </>
  );
}

// ─── A new report's flow, across a reload ───────────────────────────────────
// START on Reports makes the report, then the window opens on its own page. Edit
// details opens the same window from a workspace's ✎. What tells
// them apart is this mark, set when the report is made and cleared when the flow
// ends (Open workspace, ✕, or leaving the report).

const NEW_KEY = (reportId: string) => `cr-new-report:${reportId}`;

export function markNewReport(reportId: string): void {
  try {
    sessionStorage.setItem(NEW_KEY(reportId), '1');
  } catch {
    // Private mode: the window still runs; only an old ?start=details link opens as Edit details.
  }
}

export function isNewReport(reportId: string): boolean {
  try {
    return sessionStorage.getItem(NEW_KEY(reportId)) === '1';
  } catch {
    return false;
  }
}

export function endNewReport(reportId: string): void {
  try {
    sessionStorage.removeItem(NEW_KEY(reportId));
  } catch {
    // Nothing kept, nothing to clear.
  }
}
