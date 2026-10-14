// The top bar (the handoff, "Screens": a black bar with the Studio back button, the wordmark, the COMP
// REPORT eyebrow, then the account). The Studio back button and Feedback are injected by
// assets/studio-header.js, fixed at the bar's two ends: the bar leaves room for them and sits its own
// pills between. Its account chip, when it shows, only clears a localStorage key, so this bar's account
// menu — with the real Identity sign-out — takes its place.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Role } from '../../api.ts';
import '../../styles/shell.css';
import { BarSlotsContext } from './slots.tsx';

export interface Account {
  email: string;
  role?: Role;
  /** The local dev sign-in (never in a production build). */
  dev: boolean;
}

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', mentor: 'Mentor', agent: 'Agent', external: 'External' };

function AccountMenu({ account, onSignOut, menuRef }: { account: Account; onSignOut: () => void; menuRef: (el: HTMLDivElement | null) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      pill.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const who = [account.role ? ROLE_LABEL[account.role] : null, account.dev ? 'dev sign-in' : null].filter(Boolean).join(' · ');
  return (
    <div className="sh-account" ref={wrap}>
      <button ref={pill} type="button" className="sh-pill sh-acct" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sh-dot" aria-hidden="true" />
        <span className="sh-account-email">{account.email}</span>
      </button>
      {open && (
        <div className="sh-menu" role="group" aria-label="Account">
          <div className="sh-menu-head">
            <span className="sh-menu-email">{account.email}</span>
            {who && <span className="sh-menu-who">{who}</span>}
          </div>
          <div className="sh-menu-extra" ref={menuRef} />
          <button type="button" className="sh-menu-item" onClick={onSignOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ account, onSignOut, pillsRef, menuRef }: {
  account: Account | null;
  onSignOut: () => void;
  pillsRef: (el: HTMLSpanElement | null) => void;
  menuRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    // The studio chrome pads the page's first <header> to clear its Studio button, so this is the only <header>.
    <header className="bar sh-bar">
      <img src="/assets/brand/casa-blanca-wordmark-white.png" alt="Casa Blanca" />
      <span className="bar-label">Comp report</span>
      <span className="sh-bar-spacer" />
      <span className="sh-bar-pills" ref={pillsRef} />
      {account && <AccountMenu account={account} onSignOut={onSignOut} menuRef={menuRef} />}
    </header>
  );
}

/** The bar and its slots, around everything the app shows. */
export function Shell({ account, onSignOut, children }: { account: Account | null; onSignOut: () => void; children: ReactNode }) {
  const [pills, setPills] = useState<HTMLElement | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const slots = useMemo(() => ({ pills, menu }), [pills, menu]);
  return (
    <BarSlotsContext.Provider value={slots}>
      <TopBar account={account} onSignOut={onSignOut} pillsRef={setPills} menuRef={setMenu} />
      {children}
    </BarSlotsContext.Provider>
  );
}
