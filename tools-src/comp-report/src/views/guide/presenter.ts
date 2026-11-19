// Presenter mode (Kimani, 2026-11-10): for Noble showing the tool over Zoom or Meet. Kept per browser, so
// it stays on across reloads for the person presenting and is off for everyone else. When on, it shows:
// - a large step badge at the bottom left ("Step 5 of 8 · Sort the comps"), following the screen the
//   presenter is on, so people watching can find the same place in their own copy;
// - a soft ring that follows the cursor, and a ripple on every click, so a click reads on a compressed
//   screen share.
// It never changes the app's own layout: for bigger type, the guide tells the presenter to use the
// browser's zoom (⌘ + / Ctrl +), which the app's layouts already take.
const KEY = 'cr.presenter';
const EVENT = 'cr:presenter';

export function presenterOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setPresenter(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: it lasts until the page reloads */
  }
  dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

/** Calls back with the new state whenever presenter mode is turned on or off (in this tab or another). */
export function onPresenter(cb: (on: boolean) => void): () => void {
  const local = (e: Event) => cb(Boolean((e as CustomEvent<boolean>).detail));
  const other = (e: StorageEvent) => {
    if (e.key === KEY) cb(e.newValue === '1');
  };
  addEventListener(EVENT, local);
  addEventListener('storage', other);
  return () => {
    removeEventListener(EVENT, local);
    removeEventListener('storage', other);
  };
}

/** The screen the app last showed, for the badge (activity.ts sends it as `cr:screen`). */
let lastScreen: string | null = null;
if (typeof addEventListener === 'function') addEventListener('cr:screen', (e) => {
  lastScreen = (e as CustomEvent<string>).detail;
});
export function currentScreen(): string | null {
  return lastScreen;
}

/**
 * The cursor ring and the click ripples, drawn on a layer of their own that never takes a click. Returns
 * the function that removes them.
 */
export function startPointerMarks(): () => void {
  const layer = document.createElement('div');
  layer.className = 'gd-marks';
  layer.setAttribute('aria-hidden', 'true');
  const ring = document.createElement('div');
  ring.className = 'gd-cursor';
  layer.appendChild(ring);
  document.body.appendChild(layer);

  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    ring.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    ring.style.opacity = '1';
  };
  const leave = () => {
    ring.style.opacity = '0';
  };
  const down = (e: PointerEvent) => {
    const r = document.createElement('div');
    r.className = 'gd-ripple';
    r.style.left = `${e.clientX}px`;
    r.style.top = `${e.clientY}px`;
    layer.appendChild(r);
    setTimeout(() => r.remove(), 700);
  };
  addEventListener('pointermove', move, { passive: true });
  addEventListener('pointerdown', down, { passive: true, capture: true });
  document.documentElement.addEventListener('pointerleave', leave);
  return () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerdown', down, { capture: true });
    document.documentElement.removeEventListener('pointerleave', leave);
    layer.remove();
  };
}
