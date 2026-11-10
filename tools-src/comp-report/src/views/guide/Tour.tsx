// The pointing tour's card (tour.ts): a ring around the thing to click and a card beside it, on a layer of
// its own over the page. It follows the screen the app says it's on (activity.ts's cr:screen), and finds its
// target on the page as the page draws it, so a target that turns up late (a row after a read, the modal's
// footer) still gets pointed at. A click on the target, or "Got it", moves it on. It hides while a window
// the target isn't in covers the page (the guide, Review comps, a dialog). Rough, for Kimani to design over.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { currentScreen } from './presenter.ts';
import { STEPS, stepForScreen } from './steps.ts';
import { endTour, nextTip, onTour, readTour, tipDone, tipsFor, type TourState, type TourTip } from './tour.ts';

/** Windows that cover the page: a target outside the topmost one can't be clicked, so the tour waits. */
const LAYERS = '.gd-veil, .sh-dlg-scrim, .so-lightbox, .rv-scrim, .nr-scrim';

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/** The tip's target on the page now, or null when it isn't there (or is covered). */
export function findTarget(tip: TourTip): HTMLElement | null {
  const layers = [...document.querySelectorAll(LAYERS)];
  const top = layers[layers.length - 1] ?? null;
  for (const sel of tip.targets) {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (top && !top.contains(el)) continue;
      if (visible(el)) return el;
    }
  }
  return null;
}

interface Place {
  ring: { top: number; left: number; width: number; height: number };
  card: { top: number; left: number };
  /** Which side of the target the card sits on, and where its arrow points along it. */
  side: 'below' | 'above';
  arrow: number;
}

const CARD_W = 330;
const GAP = 14;

function place(target: HTMLElement, cardH: number): Place {
  const r = target.getBoundingClientRect();
  const pad = 6;
  const ring = { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
  const below = r.bottom + pad + GAP + cardH <= innerHeight - 12 || r.top - pad - GAP - cardH < 12;
  const top = below ? r.bottom + pad + GAP : r.top - pad - GAP - cardH;
  const centre = r.left + Math.min(r.width, 420) / 2;
  // Clear of Hubert's drawer when it's open, so the card never sits over his chat.
  const drawer = document.querySelector('.hubert-drawer');
  const dr = drawer && visible(drawer) ? drawer.getBoundingClientRect() : null;
  const right = dr && dr.left > CARD_W + 24 ? dr.left : innerWidth;
  const left = Math.max(12, Math.min(right - CARD_W - 12, centre - CARD_W / 2));
  return { ring, card: { top: Math.max(12, top), left }, side: below ? 'below' : 'above', arrow: Math.max(18, Math.min(CARD_W - 18, centre - left)) };
}

export function TourMarks() {
  const [tour, setTour] = useState<TourState>(readTour);
  const [screen, setScreen] = useState<string | null>(currentScreen);
  const [, setTick] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const scrolled = useRef<string | null>(null);

  useEffect(() => {
    return onTour(setTour);
  }, []);
  useEffect(() => {
    const f = (e: Event) => setScreen((e as CustomEvent<string>).detail);
    addEventListener('cr:screen', f);
    return () => removeEventListener('cr:screen', f);
  }, []);
  // Targets come and go as the page draws (reads land, modals open): look again a few times a second, and on
  // every scroll or resize, while the tour is on.
  useEffect(() => {
    if (!tour.on) return;
    const bump = () => setTick((n) => n + 1);
    const id = setInterval(bump, 350);
    addEventListener('scroll', bump, true);
    addEventListener('resize', bump);
    return () => {
      clearInterval(id);
      removeEventListener('scroll', bump, true);
      removeEventListener('resize', bump);
    };
  }, [tour.on]);

  const tip = tour.on ? nextTip(screen, tour.done, (t) => findTarget(t) !== null) : null;
  const target = tip ? findTarget(tip) : null;

  // Clicking the thing it points at is the point: that moves the tour on (after the click has done its work).
  useEffect(() => {
    if (!tip || !target) return;
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Node && target.contains(e.target)) setTimeout(() => tipDone(tip), 0);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [tip, target]);

  // Bring a target that's off the screen into view, once per tip.
  useEffect(() => {
    if (!tip || !target || scrolled.current === tip.id) return;
    scrolled.current = tip.id;
    const r = target.getBoundingClientRect();
    if (r.top < 60 || r.bottom > innerHeight - 40) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [tip, target]);

  if (!tip || !target) return null;
  const step = stepForScreen(tip.screen);
  const onScreen = tipsFor(tip.screen);
  const at = place(target, card.current?.offsetHeight ?? 190);

  return createPortal(
    <>
      <div className="tr-ring" aria-hidden="true" style={at.ring} />
      <div
        ref={card}
        className={`tr-card ${at.side}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tr-title"
        style={{ top: at.card.top, left: at.card.left, width: CARD_W, ['--tr-arrow' as string]: `${at.arrow}px` }}
      >
        {step && <p className="tr-k">Step {step.n} of {STEPS.length} · {step.title}</p>}
        <p className="tr-title" id="tr-title" aria-live="polite">{tip.title}</p>
        <p className="tr-body">{tip.body}</p>
        <div className="tr-row">
          <button type="button" className="btn primary small-btn" onClick={() => tipDone(tip)}>{tip.last ? 'Finish' : 'Got it'}</button>
          {!tip.last && <button type="button" className="tr-link" onClick={endTour}>End the tour</button>}
          {onScreen.length > 1 && <span className="tr-count">{onScreen.indexOf(tip) + 1} of {onScreen.length} here</span>}
        </div>
      </div>
    </>,
    document.body,
  );
}
