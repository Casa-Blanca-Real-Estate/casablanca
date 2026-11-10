// The guide (Kimani, 2026-11-10): a starter walk through the comp report's steps, and the glossary, in one
// window. Opened from the top bar's Guide button, the ? key, or a link (?guide=5 opens step 5,
// ?guide=glossary the glossary), so Noble can send people straight to a step. Large type throughout, for a
// Zoom or Meet screen share; ← and → move between steps. Presenter mode (presenter.ts) is switched on here.
// A rough version: Kimani designs over it in Claude Design.
import '../../styles/guide.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STEPS, stepForScreen, type GuideStep } from './steps.ts';
import { GLOSSARY, GROUPS, findTerm, searchGlossary } from './glossary.ts';
import { currentScreen, onPresenter, presenterOn, setPresenter, startPointerMarks } from './presenter.ts';

export type GuideView = { tab: 'steps'; step: number } | { tab: 'glossary'; q: string };

/** What ?guide= asks for, or null when it isn't there. */
export function guideFromUrl(): GuideView | null {
  const v = new URLSearchParams(location.search).get('guide');
  if (v === null) return null;
  if (v === 'glossary') return { tab: 'glossary', q: '' };
  const n = Number(v);
  return { tab: 'steps', step: Number.isInteger(n) && n >= 1 && n <= STEPS.length ? n : 1 };
}

function writeUrl(view: GuideView | null): void {
  const params = new URLSearchParams(location.search);
  if (view === null) params.delete('guide');
  else params.set('guide', view.tab === 'glossary' ? 'glossary' : String(view.step));
  const q = params.toString();
  history.replaceState(history.state, '', location.pathname + (q ? `?${q}` : '') + location.hash);
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`gd-switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <span className="gd-switch-track" aria-hidden="true"><span /></span>
      {label}
    </button>
  );
}

function StepPage({ step, onWord }: { step: GuideStep; onWord: (term: string) => void }) {
  return (
    <article className="gd-step" aria-labelledby={`gd-step-${step.n}`}>
      <div className="gd-step-meta">
        <span className="gd-step-count">Step {step.n} of {STEPS.length}</span>
        <span className="gd-where">In the tool: {step.where}</span>
      </div>
      <h2 id={`gd-step-${step.n}`} className="gd-step-title">{step.title}</h2>
      <p className="gd-todo">{step.todo}</p>
      {step.points.length > 0 && (
        <ul className="gd-points">
          {step.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {step.words.length > 0 && (
        <div className="gd-words">
          <span className="gd-words-k">Words on this step</span>
          {step.words.filter((w) => findTerm(w)).map((w) => (
            <button key={w} type="button" className="gd-word" onClick={() => onWord(w)}>{w}</button>
          ))}
        </div>
      )}
    </article>
  );
}

function Glossary({ q, setQ }: { q: string; setQ: (q: string) => void }) {
  const found = useMemo(() => searchGlossary(q), [q]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <div className="gd-glossary">
      <h2 className="gd-print-title">Comp report · Glossary</h2>
      <div className="gd-gl-head">
        <input
          ref={input}
          type="search"
          className="gd-search"
          placeholder="Find a word"
          aria-label="Find a word"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="gd-gl-count">{found.length === GLOSSARY.length ? `${GLOSSARY.length} words` : `${found.length} of ${GLOSSARY.length}`}</span>
        <button type="button" className="gd-link" onClick={() => print()}>Print</button>
      </div>
      {!found.length && <p className="gd-empty">Nothing matches “{q}”. Ask Hubert: he knows the rest.</p>}
      {GROUPS.map((g) => {
        const terms = found.filter((t) => t.group === g);
        if (!terms.length) return null;
        return (
          <section key={g} className="gd-group">
            <h3>{g}</h3>
            <dl>
              {terms.map((t) => (
                <div key={t.term} className="gd-term">
                  <dt>{t.term}{t.aka?.length ? <span className="gd-aka"> · also {t.aka.join(', ')}</span> : null}</dt>
                  <dd>
                    {t.means}
                    {t.notSame && <span className="gd-not">Not the same as {t.notSame}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

/** The guide window. */
export function Guide({ initial, onClose }: { initial: GuideView; onClose: () => void }) {
  const [view, setView] = useState<GuideView>(initial);
  const [presenting, setPresenting] = useState(presenterOn);
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);

  useEffect(() => onPresenter(setPresenting), []);
  useEffect(() => writeUrl(view), [view]);
  useEffect(() => {
    dialog.current?.focus();
    const back = opener.current;
    return () => {
      writeUrl(null);
      if (back instanceof HTMLElement) back.focus();
    };
  }, []);

  const step = view.tab === 'steps' ? STEPS[view.step - 1] : null;
  const go = (n: number) => setView({ tab: 'steps', step: Math.min(STEPS.length, Math.max(1, n)) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (typing || view.tab !== 'steps' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') go(view.step + 1);
      else if (e.key === 'ArrowLeft') go(view.step - 1);
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= STEPS.length) go(Number(e.key));
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  });

  return createPortal(
    <div className="gd-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gd-window" role="dialog" aria-modal="true" aria-label="Getting started" tabIndex={-1} ref={dialog} data-testid="guide">
        {/* Not a <header>: the studio chrome pads every first-of-type header (assets/studio-header.js). */}
        <div className="gd-head">
          <span className="gd-eyebrow">Comp report · Getting started</span>
          <div className="gd-tabs" role="tablist" aria-label="Guide">
            <button type="button" role="tab" aria-selected={view.tab === 'steps'} className="gd-tab" onClick={() => go(step?.n ?? 1)}>The steps</button>
            <button type="button" role="tab" aria-selected={view.tab === 'glossary'} className="gd-tab" onClick={() => setView({ tab: 'glossary', q: '' })}>Glossary</button>
          </div>
          <span className="gd-head-spacer" />
          <Switch on={presenting} onChange={setPresenter} label="Presenter mode" />
          <button type="button" className="gd-x" aria-label="Close the guide" onClick={onClose}>✕</button>
        </div>

        {view.tab === 'steps' && step && (
          <div className="gd-body">
            <nav className="gd-rail" aria-label="Steps">
              <ol>
                {STEPS.map((s) => (
                  <li key={s.n}>
                    <button type="button" className={`gd-rail-step${s.n === step.n ? ' on' : ''}${s.n < step.n ? ' past' : ''}`} aria-current={s.n === step.n ? 'step' : undefined} onClick={() => go(s.n)}>
                      <span className="gd-rail-n">{s.n}</span>
                      <span className="gd-rail-t">{s.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="gd-main">
              <StepPage step={step} onWord={(w) => setView({ tab: 'glossary', q: w })} />
              <div className="gd-foot">
                <button type="button" className="btn" disabled={step.n === 1} onClick={() => go(step.n - 1)}>← Back</button>
                <span className="gd-keys">← → to move · Esc to close</span>
                {step.n < STEPS.length
                  ? <button type="button" className="btn primary" onClick={() => go(step.n + 1)}>Next: {STEPS[step.n]?.title} →</button>
                  : <button type="button" className="btn primary" onClick={onClose}>Start using it</button>}
              </div>
            </div>
          </div>
        )}

        {view.tab === 'glossary' && (
          <div className="gd-body gd-body-gl">
            <Glossary q={view.q} setQ={(q) => setView({ tab: 'glossary', q })} />
          </div>
        )}

        {presenting && (
          <p className="gd-present-tip">
            Presenter mode is on: your step shows at the bottom left and your clicks show as rings. For bigger text on the
            share, zoom the browser to 125% (⌘ + on a Mac, Ctrl + on Windows).
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Presenter mode's marks: the step badge and the cursor ring. Mounted once by the app; shows only while on. */
export function PresenterMarks({ onOpenStep }: { onOpenStep: (n: number) => void }) {
  const [on, setOn] = useState(presenterOn);
  const [screen, setScreen] = useState<string | null>(currentScreen);
  useEffect(() => onPresenter(setOn), []);
  useEffect(() => {
    const f = (e: Event) => setScreen((e as CustomEvent<string>).detail);
    addEventListener('cr:screen', f);
    return () => removeEventListener('cr:screen', f);
  }, []);
  useEffect(() => (on ? startPointerMarks() : undefined), [on]);
  if (!on) return null;
  const step = screen ? stepForScreen(screen) : null;
  return createPortal(
    <div className="gd-badge" role="status">
      {step ? (
        <button type="button" className="gd-badge-step" onClick={() => onOpenStep(step.n)} title="Open this step in the guide">
          <span className="gd-badge-n">{step.n}</span>
          <span className="gd-badge-txt">
            <span className="gd-badge-k">Step {step.n} of {STEPS.length}</span>
            <span className="gd-badge-t">{step.title}</span>
          </span>
        </button>
      ) : (
        <span className="gd-badge-step"><span className="gd-badge-txt"><span className="gd-badge-k">Presenter mode</span></span></span>
      )}
      <button type="button" className="gd-badge-off" aria-label="Turn presenter mode off" title="Turn presenter mode off" onClick={() => setPresenter(false)}>✕</button>
    </div>,
    document.body,
  );
}
