// The team's dev switches, per browser (Settings, from the name menu; Kimani, 2026-11-06: "toggle on and
// off my dev notebook at my leisure… toggle on and off all my dev tools"). Each is a localStorage key the
// page that uses it already reads; a change here tells this tab with a 'cb-dev-setting' event (the comp
// report's own switches and assets/dev-notebook.js listen), and other tabs see it through 'storage'.

/** The dev notebook's capture box (Ctrl+. / ⌘., the ✎): '1' turns it off. */
export const NOTEBOOK_OFF = 'cb.devNotebook.off';
/** The build marker on the Studio dashboard ("claude/main · abc1234"): '1' turns it off. */
export const BUILD_MARKER_OFF = 'cb.buildMarker.off';
/** The comp report's Dev tools: about-this-screen boxes and build notes (buildNotes.tsx). */
export const BUILD_NOTES = 'cr-build-notes';
/** Admins: the Gate as a new (practice) agent sees it (Workspace.tsx). */
export const VIEW_AS_NEW = 'cr-view-as-new-agent';

export const DEV_EVENT = 'cb-dev-setting';

/** Reads a switch: the notebook and the marker are on unless turned off; the rest are off unless turned on. */
export function readSwitch(key: string): boolean {
  try {
    const v = localStorage.getItem(key);
    if (key === NOTEBOOK_OFF || key === BUILD_MARKER_OFF) return v !== '1';
    return v === '1';
  } catch {
    return key === NOTEBOOK_OFF || key === BUILD_MARKER_OFF;
  }
}

export function writeSwitch(key: string, on: boolean): void {
  try {
    if (key === NOTEBOOK_OFF || key === BUILD_MARKER_OFF) {
      if (on) localStorage.removeItem(key);
      else localStorage.setItem(key, '1');
    } else localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* storage blocked: nothing to keep */
  }
  dispatchEvent(new CustomEvent(DEV_EVENT, { detail: { key, on } }));
}
