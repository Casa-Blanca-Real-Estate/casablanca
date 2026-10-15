// The top bar belongs to the app, so it stays put from the sign-in to a report. What only a report knows
// (the Sample badge, the Hubert toggle, the admin's switches) reaches it through two slots the bar
// provides: a place among its pills, and a place inside the account menu.
import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type BarSlot = 'pills' | 'menu';
export interface BarSlots {
  pills: HTMLElement | null;
  menu: HTMLElement | null;
}

export const BarSlotsContext = createContext<BarSlots>({ pills: null, menu: null });

/** Renders its children into one of the bar's slots. Nothing shows while the slot isn't there (the menu is closed). */
export function InBar({ where, children }: { where: BarSlot; children: ReactNode }) {
  const slot = useContext(BarSlotsContext)[where];
  return slot ? createPortal(children, slot) : null;
}
