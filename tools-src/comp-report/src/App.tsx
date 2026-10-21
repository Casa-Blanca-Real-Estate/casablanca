// The shared styles first, so every view's own stylesheet (src/styles/*.css) comes after them in the bundle.
import './styles.css';
import './styles/shell.css';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type Me } from './api.ts';
import { session, type SessionState } from './session.ts';
import { leaveGuestMode } from './guest-session.ts';
import { AcceptInvite, NotAuthorised, SetNewPassword, SignIn, Unavailable } from './views/SignIn.tsx';
import { Reports } from './views/Reports.tsx';
import { Workspace } from './views/workspace/Workspace.tsx';
import type { ScreenId } from './views/workspace/screens.ts';
import { Center, StateLine } from './views/shell/Pieces.tsx';
import { Shell } from './views/shell/TopBar.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';

function currentReportId(): string | null {
  return new URLSearchParams(location.search).get('report');
}

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
    api<Me>('/api/comp-report/me').then(setMe, (e) => {
      // A guest key the server won't take (production, or out of date): back to signing in.
      if (session.guest && e instanceof ApiError && e.status === 401) {
        leaveGuestMode();
        setState({ status: 'signed-out', notice: e.message });
        return;
      }
      setRefusal(e instanceof ApiError ? e : new ApiError(0, 'network', String(e)));
    });
  }, [state]);

  // The account menu's Sign out: the real Identity sign-out (the Studio chip only clears its own key).
  // The sign-in screen shows whether or not the call got through; a reload checks again.
  const signOut = useCallback(async () => {
    try {
      await session.signOut();
    } catch {
      /* fall through to the sign-in screen */
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
  else if (state.status === 'signed-out') body = <SignIn notice={state.notice} onSignedIn={setState} />;
  else if (refusal) body = <NotAuthorised email={state.email} error={refusal} onSignOut={signOut} />;
  else if (!me) body = <StateLine>Checking your access…</StateLine>;
  else if (reportId) {
    framed = false;
    body = <Workspace key={reportId} reportId={reportId} me={me} onBack={() => open(null)} />;
  } else {
    framed = false;
    body = <Reports me={me} onOpen={open} />;
  }

  const account = state.status === 'signed-in' ? { email: state.email, role: me?.user.role, dev: session.dev, guest: session.guest } : null;

  return (
    <Shell account={account} onSignOut={() => void signOut()}>
      <div className="sh-app">
        <ErrorBoundary resetKey={`${state.status}:${reportId ?? ''}`} onBack={() => open(null)}>
          {framed ? <Center>{body}</Center> : body}
        </ErrorBoundary>
      </div>
    </Shell>
  );
}
