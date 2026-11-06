// The top bar (the handoff, "Screens": a black bar with the Studio back button, the wordmark, the COMP
// REPORT eyebrow, then the account). The Studio back button and Feedback are injected by
// assets/studio-header.js, fixed at the bar's two ends: the bar leaves room for them and sits its own
// pills between. Its account chip, when it shows, only clears a localStorage key, so this bar's account
// menu — with the real Identity sign-out — takes its place.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Me, Role } from '../../api.ts';
import { Settings } from './Settings.tsx';
import '../../styles/shell.css';
import { BarSlotsContext } from './slots.tsx';
import { STUDIO_SIGN_IN } from '../../studio-sign-in.ts';

export interface Account {
  email: string;
  role?: Role;
  /** The local dev sign-in (never in a production build). */
  dev: boolean;
  /** Guest mode: no Identity, a preview's guest key. */
  guest?: boolean;
  /** Who /me says this is: Settings shows it (absent until /me answers). */
  me?: Me | null;
  /** The Identity token, for Settings to renew the dev notebook's session when it turns the box back on. */
  identityToken?: () => Promise<string | null>;
}

const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
  </svg>
);

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', mentor: 'Mentor', agent: 'Agent', external: 'External' };

function AccountMenu({ account, onSignOut, menuRef }: { account: Account; onSignOut: () => void; menuRef: (el: HTMLDivElement | null) => void }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
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

  const who = [account.role ? ROLE_LABEL[account.role] : null, account.dev ? 'dev sign-in' : null, account.guest ? 'guest mode, sample data only' : null].filter(Boolean).join(' · ');
  return (
    <div className="sh-account" ref={wrap}>
      <button ref={pill} type="button" className="sh-pill sh-acct" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sh-dot" aria-hidden="true" />
        <span className="sh-account-email">{account.email}</span>
        <span className="sh-account-initial" aria-hidden="true">{account.email.charAt(0).toUpperCase()}</span>
      </button>
      {open && (
        <div className="sh-menu" role="group" aria-label="Account">
          <div className="sh-menu-head">
            <span className="sh-menu-email">{account.email}</span>
            {who && <span className="sh-menu-who">{who}</span>}
          </div>
          {account.me && (
            <button type="button" className="sh-menu-item sh-menu-gear" onClick={() => { setOpen(false); setSettings(true); }}>
              <GearIcon />Settings
            </button>
          )}
          <div className="sh-menu-extra" ref={menuRef} />
          <button type="button" className="sh-menu-item" onClick={onSignOut}>Sign out</button>
        </div>
      )}
      {settings && account.me && <Settings me={account.me} identityToken={account.identityToken} onClose={() => setSettings(false)} />}
    </div>
  );
}

/** The Studio's home: the dashboard at the site's root. */
const STUDIO_HOME = '/';

/**
 * The studio chrome's right dock (assets/studio-header.js, with Feedback from feedback.js) moves into the bar,
 * at its right end (the design pass, "Component · Top bar"): Feedback sits last, after the account. The dock is
 * made by a deferred script, so this waits for it. Its own "signed in" chip stays hidden: the account menu here
 * has the real sign-out.
 */
function useStudioDock(slot: HTMLSpanElement | null) {
  useEffect(() => {
    if (!slot) return undefined;
    const adopt = () => {
      const dock = document.getElementById('cb-chrome-r');
      if (!dock) return false;
      if (dock.parentElement !== slot) slot.appendChild(dock);
      dock.classList.add('sh-dock');
      return true;
    };
    if (adopt()) return undefined;
    const watch = new MutationObserver(() => {
      if (adopt()) watch.disconnect();
    });
    watch.observe(document.body, { childList: true });
    return () => watch.disconnect();
  }, [slot]);
}

export function TopBar({ account, onSignOut, pillsRef, menuRef }: {
  account: Account | null;
  onSignOut: () => void;
  pillsRef: (el: HTMLSpanElement | null) => void;
  menuRef: (el: HTMLDivElement | null) => void;
}) {
  const [dock, setDock] = useState<HTMLSpanElement | null>(null);
  useStudioDock(dock);
  return (
    // The studio chrome pads the page's first <header> to clear its Studio button, so this is the only <header>;
    // the bar draws its own Studio link (the chrome's fixed one is hidden on this page, shell.css).
    <header className="bar sh-bar">
      <img src="/assets/brand/casa-blanca-wordmark-white.png" alt="Casa Blanca" />
      <a className="sh-studio" href={STUDIO_HOME}>‹ Studio</a>
      {/* Reports leaves the label out: its hero already says it (shell.css). */}
      <span className="sh-bar-tool">
        <span className="sh-bar-dot" aria-hidden="true" />
        <span className="bar-label">{STUDIO_SIGN_IN ? 'Studio' : 'Comp report'}</span>
      </span>
      <span className="sh-bar-spacer" />
      <span className="sh-bar-pills" ref={pillsRef} />
      {account && <AccountMenu account={account} onSignOut={onSignOut} menuRef={menuRef} />}
      <span className="sh-bar-dock" ref={setDock} />
    </header>
  );
}

/** A team view's badge in the bar ("Mentor view", "Admin view"): shown where the person reads as a mentor or an admin. */
export function roleBadge(role: Role | undefined): string | null {
  return role === 'admin' ? 'Admin view' : role === 'mentor' ? 'Mentor view' : null;
}

/** The bar and its slots, around everything the app shows. */
export function Shell({ account, onSignOut, children }: { account: Account | null; onSignOut: () => void; children: ReactNode }) {
  const [pills, setPills] = useState<HTMLElement | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const slots = useMemo(() => ({ pills, menu }), [pills, menu]);
  return (
    <BarSlotsContext.Provider value={slots}>
      <TopBar account={account} onSignOut={onSignOut} pillsRef={setPills} menuRef={setMenu} />
      {/* Narrow windows are a follow-up; this says so where it shows (a media query turns it on). */}
      <p className="sh-narrow">Narrow windows aren’t laid out yet. Use a wider window for now.</p>
      {children}
    </BarSlotsContext.Provider>
  );
}
