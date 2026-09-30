// Build notes (Dispatch 09; `02-screens.md`, For admins while it's built): the
// scaffold's own annotations — "About this step" boxes, stub labels, decision
// IDs, per-value sample marks — sit behind one switch, for admins only and off
// by default. Agents never see them. The switch is per browser.
import { createContext, useCallback, useContext, useState } from 'react';

export const BuildNotesContext = createContext(false);

/** True when this admin has build notes switched on. */
export function useBuildNotes(): boolean {
  return useContext(BuildNotesContext);
}

const KEY = 'cr-build-notes';

/** The switch: off unless an admin turned it on in this browser. */
export function useBuildNotesSwitch(isAdmin: boolean): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return isAdmin && localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = useCallback((next: boolean) => {
    setOn(next);
    try {
      if (next) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch {
      // Private mode: the switch lasts for this page.
    }
  }, []);
  return [isAdmin && on, set];
}
