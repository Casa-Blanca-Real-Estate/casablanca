// The new-report modal's frame (the handoff, screens 03–05; Dispatch 14): an
// 820px card on a dark scrim, a three-bar progress row with "N of 3" and ✕, or
// "Edit details" when it's opened from a workspace. Escape closes it (asking
// first while a comp is half-typed, useCloseGuard); the page
// behind it doesn't scroll while it's open.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import '../../styles/newreport.css';

export interface DropHandlers {
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

/** Something half-done inside the modal (a comp form with text in it) that Escape or ✕ would drop. */
const GuardContext = createContext<((id: string, on: boolean) => void) | null>(null);

/**
 * Inside the modal, `on` makes Escape and ✕ ask before closing (Dispatch 20,
 * from Dispatch 14's follow-ups): a half-filled comp isn't dropped by a stray
 * Escape. Outside the modal it does nothing.
 */
export function useCloseGuard(on: boolean): void {
  const register = useContext(GuardContext);
  const id = useId();
  useEffect(() => {
    register?.(id, on);
    return () => register?.(id, false);
  }, [register, id, on]);
}

export function Frame({ step, editing = false, title, onClose, children, footer, drop, veil }: {
  /** 1, 2 or 3: the bars filled and "N of 3". */
  step: 1 | 2 | 3;
  /** Edit details, from a workspace: no progress, "Edit details" instead. */
  editing?: boolean;
  /** The dialog's accessible name. */
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  /** The panel is the drop target on Add comps (useDropTarget). */
  drop?: DropHandlers;
  veil?: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const guards = useRef(new Set<string>());
  const [asking, setAsking] = useState(false);
  const register = useCallback((id: string, on: boolean) => {
    if (on) guards.current.add(id);
    else guards.current.delete(id);
    if (!guards.current.size) setAsking(false);
  }, []);
  // Escape and ✕ close, unless something half-done inside asks first; Escape again keeps editing.
  const attempt = () => {
    if (!guards.current.size) return onClose();
    setAsking((a) => !a);
  };
  const close = useRef(attempt);
  close.current = attempt;

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true });
    // The page behind stays put while the modal is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close.current();
    };
    addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="nr-scrim">
      <div
        className="nr-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={dialog}
        data-testid={editing ? 'edit-details' : `new-report-${step}`}
        {...(drop ?? {})}
      >
        {veil}
        <div className="nr-head">
          {editing ? (
            <div className="nr-edit-label">Edit details</div>
          ) : (
            <>
              <div className="nr-progress" role="img" aria-label={`Step ${step} of 3`}>
                {[1, 2, 3].map((n) => <span key={n} className={n <= step ? 'on' : ''} />)}
              </div>
              <span className="nr-count" aria-hidden="true">{step} of 3</span>
            </>
          )}
          <button type="button" className="nr-x" aria-label="Close" onClick={attempt}>✕</button>
        </div>
        <GuardContext.Provider value={register}>
          <div className="nr-body">{children}</div>
        </GuardContext.Provider>
        {asking && (
          <div className="nr-ask" role="alertdialog" aria-label="Close and lose the comp you’re typing?">
            <span>You’re partway through a comp. Close and lose it?</span>
            <button type="button" className="link" onClick={() => setAsking(false)} autoFocus>Keep editing</button>
            <span aria-hidden="true">·</span>
            <button type="button" className="link" onClick={() => { setAsking(false); onClose(); }}>Close anyway</button>
          </div>
        )}
        <div className="nr-foot">{footer}</div>
      </div>
    </div>
  );
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
// The first screen makes the report, then the workspace opens with the modal on
// 2 of 3. Edit details opens the same screen from a workspace's ✎. What tells
// them apart is this mark, set when the report is made and cleared when the flow
// ends (Open workspace, ✕, or leaving the report).

const NEW_KEY = (reportId: string) => `cr-new-report:${reportId}`;

export function markNewReport(reportId: string): void {
  try {
    sessionStorage.setItem(NEW_KEY(reportId), '1');
  } catch {
    // Private mode: the flow still runs; a reload opens 2 of 3 as Edit details.
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
