// The email's plain text, editable, with QA's issues marked in it (Dispatch 14,
// item 10): a mirror behind a transparent textarea, with the same font,
// padding and wrapping, paints each issue's span — the highlight, a red
// underline for what must be fixed, and its number. The textarea stays the
// thing the agent types in; the marks are only ever paint, so nothing copied
// carries them. The textarea grows with its text, so the two never scroll apart.
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';

export interface TextMark {
  start: number;
  end: number;
  /** The issue's key: Show finds its marks by it. */
  issue: string;
  n: number;
  /** Holds Copy: the red underline. */
  blocking: boolean;
}

function fit(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export function AnnotatedText({ id, label, value, onChange, marks, readOnly, placeholder, className, spellCheck = true }: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  marks: TextMark[];
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  spellCheck?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current) fit(ref.current);
  }, [value]);

  // A change of width (the drawer opening, the window) rewraps the text: fit it again, next frame.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let width = el.clientWidth;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fit(el));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  const painted = useMemo(() => {
    const out: ReactNode[] = [];
    let at = 0;
    for (const m of [...marks].sort((a, b) => a.start - b.start || a.end - b.end)) {
      if (m.start < at || m.end > value.length || m.end <= m.start) continue;
      if (m.start > at) out.push(value.slice(at, m.start));
      out.push(
        <mark
          key={`${m.issue}:${m.start}`}
          className={`se-mark${m.blocking ? ' fix' : ''}`}
          data-issue={m.issue}
          data-n={m.n}
          data-start={m.start}
          data-end={m.end}
        >
          {value.slice(m.start, m.end)}
        </mark>,
      );
      at = m.end;
    }
    // A zero-width space keeps a trailing newline's line in the mirror.
    out.push(`${value.slice(at)}​`);
    return out;
  }, [marks, value]);

  return (
    <div className={`se-annot${className ? ` ${className}` : ''}${readOnly ? ' read-only' : ''}`}>
      <div className="se-mirror" aria-hidden="true">{painted}</div>
      <textarea
        ref={ref}
        id={id}
        className="se-ta"
        aria-label={label}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        rows={1}
        spellCheck={spellCheck}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Scrolls to an issue's first mark, flashes it, and selects its text in the textarea under it. True when it found one. */
export function revealMark(issue: string): boolean {
  const mark = Array.from(document.querySelectorAll<HTMLElement>('mark.se-mark')).find((m) => m.dataset.issue === issue);
  if (!mark) return false;
  mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  for (const m of document.querySelectorAll<HTMLElement>('mark.se-mark')) {
    if (m.dataset.issue === issue) {
      m.classList.remove('flash');
      void m.offsetWidth; // restart the animation
      m.classList.add('flash');
    }
  }
  const ta = mark.closest('.se-annot')?.querySelector('textarea');
  if (ta && !ta.readOnly) {
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(Number(mark.dataset.start), Number(mark.dataset.end));
  }
  return true;
}
