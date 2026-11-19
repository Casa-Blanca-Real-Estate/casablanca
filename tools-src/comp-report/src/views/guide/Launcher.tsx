// Where the guide opens from (Kimani, 2026-11-10): the Guide button in the top bar, the ? key anywhere
// outside a text field, and ?guide= links. An agent's first visit to the reports list offers it once, in a
// small card at the bottom left that they can dismiss; it's never in the way of the page. Its first choice is
// the pointing tour (Tour.tsx). Presenter mode's marks and the tour's mount here too.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Me } from '../../api.ts';
import { InBar } from '../shell/slots.tsx';
import { Guide, PresenterMarks, guideFromUrl, type GuideView } from './Guide.tsx';
import { presenterOn } from './presenter.ts';
import { TourMarks } from './Tour.tsx';
import { startTour } from './tour.ts';

const OFFERED = 'cr.guide.offered';

function offered(): boolean {
  try {
    return localStorage.getItem(OFFERED) === '1';
  } catch {
    return true; // storage blocked: don't offer it on every visit
  }
}
function markOffered(): void {
  try {
    localStorage.setItem(OFFERED, '1');
  } catch {
    /* storage blocked */
  }
}

const BookIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M2 3.5c2-1 4-1 6 .5 2-1.5 4-1.5 6-.5v9c-2-1-4-1-6 .5-2-1.5-4-1.5-6-.5z" />
    <path d="M8 4v9" />
  </svg>
);

export function GuideLauncher({ me, onReports }: { me: Me; onReports: boolean }) {
  const [view, setView] = useState<GuideView | null>(guideFromUrl);
  const [offer, setOffer] = useState(() => me.user.role === 'agent' && !me.user.guest && !offered() && !presenterOn());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey || view) return;
      const t = e.target;
      if (t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      setView({ tab: 'steps', step: 1 });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [view]);

  const open = (v: GuideView) => {
    if (offer) {
      markOffered();
      setOffer(false);
    }
    setView(v);
  };

  return (
    <>
      <InBar where="pills">
        <button type="button" className="sh-pill gd-pill" aria-haspopup="dialog" aria-expanded={view !== null} title="Getting started and the glossary (?)" onClick={() => open({ tab: 'steps', step: 1 })}>
          <BookIcon />Guide
        </button>
      </InBar>
      {offer && onReports && !view && createPortal(
        <div className="gd-offer" role="region" aria-label="Getting started">
          <p className="gd-offer-k">New here?</p>
          <p className="gd-offer-t">Make your first report with a guide pointing at each thing to click. The steps and a glossary are always under Guide in the top bar.</p>
          <div className="gd-offer-row">
            <button type="button" className="btn primary small-btn" onClick={() => { markOffered(); setOffer(false); startTour(); }}>Walk me through it</button>
            <button type="button" className="gd-link" onClick={() => open({ tab: 'steps', step: 1 })}>Read the steps</button>
            <button type="button" className="gd-link" onClick={() => { markOffered(); setOffer(false); }}>No thanks</button>
          </div>
        </div>,
        document.body,
      )}
      {view && <Guide initial={view} onClose={() => setView(null)} />}
      <PresenterMarks onOpenStep={(n) => open({ tab: 'steps', step: n })} />
      {!view && <TourMarks />}
    </>
  );
}
