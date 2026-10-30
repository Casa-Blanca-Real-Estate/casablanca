// The shared styles first, so every view's own stylesheet (src/styles/*.css) comes after them in the bundle.
import './styles.css';
import './styles/shell.css';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, prefetch, type Me } from './api.ts';
import { session, type SessionState } from './session.ts';
import { leaveGuestMode } from './guest-session.ts';
import { AcceptInvite, NotAuthorised, SetNewPassword, SignIn, Unavailable } from './views/SignIn.tsx';
import { Reports } from './views/Reports.tsx';
import { Workspace } from './views/workspace/Workspace.tsx';
import type { ScreenId } from './views/workspace/screens.ts';
import { Center, StateLine } from './views/shell/Pieces.tsx';
import { Shell } from './views/shell/TopBar.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { STUDIO_SIGN_IN, studioSignInUrl } from './studio-sign-in.ts';

function currentReportId(): string | null {
  return new URLSearchParams(location.search).get('report');
}

// A Studio page sent a signed-out visit here to sign in (assets/studio-auth.js): ?next=<that page>. It's kept
// for this tab, since Google's sign-in comes back through the site root without it, and taken once the server
// says yes. Only a path on this site, never the sign-in page itself.
const NEXT_KEY = 'cb.studio.next';
function keepNext(): void {
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  if (next === null) return;
  params.delete('next');
  const rest = params.toString();
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
  try {
    if (/^\/(?![/\\])/.test(next) && !/^\/sign-in(\/|\?|$)/.test(next)) sessionStorage.setItem(NEXT_KEY, next);
  } catch {
    /* storage blocked: the visit stays here */
  }
}
function takeNext(): string | null {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    return next;
  } catch {
    return null;
  }
}
keepNext();

export function App() {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [me, setMe] = useState<Me | null>(null);
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const [reportId, setReportId] = useState<string | null>(currentReportId);

  useEffect(() => {
    session.start().then(setState, () => setState({ status: 'signed-out' }));
    const onPop = () => setReportId(currentReportId());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  // Signed in with Identity is not the same as allowed in: ask our API (§13).
  useEffect(() => {
    if (state.status !== 'signed-in') return;
    setMe(null);
    setRefusal(null);
    // The first screen's data, asked for alongside /me rather than after it (api.ts, prefetch).
    const id = currentReportId();
    prefetch(id ? `/api/comp-report/workspace?report=${id}` : '/api/comp-report/reports');
    api<Me>('/api/comp-report/me').then((m) => {
      const next = takeNext();
      if (next) location.replace(next);
      else if (STUDIO_SIGN_IN) location.replace('/'); // signed in at the Studio's sign-in page: on to the dashboard
      else setMe(m);
    }, (e) => {
      // A guest key the server won't take (production, or out of date): back to signing in.
      if (session.guest && e instanceof ApiError && e.status === 401) {
        leaveGuestMode();
        setState({ status: 'signed-out', notice: e.message });
        return;
      }
      setRefusal(e instanceof ApiError ? e : new ApiError(0, 'network', String(e)));
    });
  }, [state]);

  // Signed out at the comp report's own address: the Studio's sign-in page, coming back here after.
  // Not in local development, where Vite serves only the comp report.
  const away = state.status === 'signed-out' && !STUDIO_SIGN_IN && !import.meta.env.DEV;
  useEffect(() => {
    if (away) location.replace(studioSignInUrl());
  }, [away]);

  // The account menu's Sign out: the real Identity sign-out (the Studio chip only clears its own key).
  // The sign-in screen shows whether or not the call got through; a reload checks again.
  const signOut = useCallback(async () => {
    try {
      await session.signOut();
    } catch {
      /* fall through to the sign-in screen */
    }
    // The Studio's own marks (assets/studio-auth.js): who it was last told is signed in, and the team's tokens.
    try {
      for (const k of ['cb_auth', 'cb_cms_token', 'cb_pics_token']) localStorage.removeItem(k);
      sessionStorage.removeItem('cb.studio.me');
    } catch {
      /* storage blocked */
    }
    history.pushState(null, '', location.pathname);
    setReportId(null);
    setState({ status: 'signed-out' });
  }, []);

  // A new comp opens straight into its modal's next screen (?start=details); a report from the list
  // opens on the screen its stage reached (?step=send).
  const open = useCallback((id: string | null, start?: 'details', step?: ScreenId) => {
    const query = id ? `?report=${id}${start ? `&start=${start}` : ''}${step ? `&step=${step}` : ''}` : location.pathname;
    history.pushState(null, '', query);
    setReportId(id);
  }, []);

  // Sign-in and every state before a report are a card in the middle of the page; the list and a report lay out their own.
  let body: ReactNode;
  let framed = true;
  if (state.status === 'loading') body = <StateLine>Loading…</StateLine>;
  else if (state.status === 'unavailable') body = <Unavailable />;
  else if (state.status === 'invite') body = <AcceptInvite token={state.token} onDone={setState} />;
  else if (state.status === 'recovery') body = <SetNewPassword onDone={() => session.start().then(setState)} />;
  else if (away) body = <StateLine>Taking you to sign in…</StateLine>;
  else if (state.status === 'signed-out') body = <SignIn notice={state.notice} onSignedIn={setState} />;
  else if (refusal) body = <NotAuthorised email={state.email} error={refusal} onSignOut={signOut} onRetry={() => setState({ ...state })} />;
  else if (!me) body = <StateLine>Checking your access…</StateLine>;
  else if (reportId) {
    framed = false;
    body = <Workspace key={reportId} reportId={reportId} me={me} onBack={() => open(null)} onOpen={(id) => open(id)} />;
  } else {
    framed = false;
    body = <Reports me={me} onOpen={open} />;
  }

  const account = state.status === 'signed-in' ? { email: state.email, role: me?.user.role, dev: session.dev, guest: session.guest } : null;

  return (
    <Shell account={account} onSignOut={() => void signOut()}>
      <div className="sh-app">
        <ErrorBoundary resetKey={`${state.status}:${reportId ?? ''}`} reportId={reportId} onBack={() => open(null)}>
          {framed ? <Center>{body}</Center> : body}
        </ErrorBoundary>
      </div>
    </Shell>
  );
}
