// Build notes (Dispatch 09; `02-screens.md`, For admins while it's built): the
// scaffold's own annotations — "About this step" boxes, stub labels, decision
// IDs, per-value sample marks — sit behind one switch, for admins only and off
// by default. Agents never see them. The switch is per browser. A guest
// (guest mode) gets it too, on by default: a guest is there to walk it through.
import { createContext, useCallback, useContext, useState } from 'react';

export const BuildNotesContext = createContext(false);

/** True when this admin has build notes switched on. */
export function useBuildNotes(): boolean {
  return useContext(BuildNotesContext);
}

const KEY = 'cr-build-notes';

/** The switch: off unless an admin turned it on in this browser, or on unless a guest turned it off. */
export function useBuildNotesSwitch(isAdmin: boolean, byDefault = false): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      const stored = localStorage.getItem(KEY);
      return isAdmin && (stored === '1' || (stored === null && byDefault));
    } catch {
      return byDefault;
    }
  });
  const set = useCallback((next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // Private mode: the switch lasts for this page.
    }
  }, []);
  return [isAdmin && on, set];
}
