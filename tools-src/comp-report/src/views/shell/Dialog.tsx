// A small dialog on the dark scrim (Duplicate report, Settings; 2026-11-06): a title, ✕, the body and a
// footer. Escape and a click on the scrim close it; the page behind doesn't scroll while it's open.
import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({ title, onClose, children, footer, wide = false, testId }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
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
    <div className="sh-dlg-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sh-dlg${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={box} data-testid={testId}>
        <div className="sh-dlg-head">
          <h2 className="sh-dlg-title">{title}</h2>
          <button type="button" className="sh-dlg-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="sh-dlg-body">{children}</div>
        {footer && <div className="sh-dlg-foot">{footer}</div>}
      </div>
    </div>
  );
}
