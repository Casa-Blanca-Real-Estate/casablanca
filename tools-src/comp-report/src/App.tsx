import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Me } from './api.ts';
import { session, type SessionState } from './session.ts';
import { AcceptInvite, NotAuthorised, SetNewPassword, SignIn, Unavailable } from './views/SignIn.tsx';
import { Reports } from './views/Reports.tsx';
import { Workspace } from './views/workspace/Workspace.tsx';
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
    api<Me>('/api/comp-report/me').then(setMe, (e) => setRefusal(e instanceof ApiError ? e : new ApiError(0, 'network', String(e))));
  }, [state]);

  const signOut = useCallback(async () => {
    await session.signOut();
    history.pushState(null, '', location.pathname);
    setReportId(null);
    setState({ status: 'signed-out' });
  }, []);

  // A new comp opens straight into its modal's next screen (?start=details).
  const open = useCallback((id: string | null, start?: 'details') => {
    history.pushState(null, '', id ? `?report=${id}${start ? `&start=${start}` : ''}` : location.pathname);
    setReportId(id);
  }, []);

  let body;
  if (state.status === 'loading') body = <p className="muted">Loading…</p>;
  else if (state.status === 'unavailable') body = <Unavailable />;
  else if (state.status === 'invite') body = <AcceptInvite token={state.token} onDone={setState} />;
  else if (state.status === 'recovery') body = <SetNewPassword onDone={() => session.start().then(setState)} />;
  else if (state.status === 'signed-out') body = <SignIn notice={state.notice} onSignedIn={setState} />;
  else if (refusal) body = <NotAuthorised email={state.email} error={refusal} onSignOut={signOut} />;
  else if (!me) body = <p className="muted">Checking your access…</p>;
  else if (reportId) body = <Workspace key={reportId} reportId={reportId} me={me} onBack={() => open(null)} />;
  else body = <Reports me={me} onOpen={open} />;

  return (
    <>
      <header className="bar">
        <img src="/assets/brand/casa-blanca-wordmark-white.png" alt="Casa Blanca" />
        <span className="bar-label">Comp Report</span>
      </header>

      {!reportId && (
        <section className="hero">
          <h1>Comp<br />report</h1>
          <p>Bring the comps you found on StreetEasy, work through them, and leave with a defensible
            range and a client-ready email.</p>
        </section>
      )}

      <main className={reportId ? 'page wide-page' : 'page'}>
        {/* The studio chrome owns the header's right edge (Feedback), so the account line lives here. */}
        {state.status === 'signed-in' && (
          <p className="account muted small">
            Signed in as {state.email}
            {session.dev && ' (dev)'} ·{' '}
            <button type="button" className="link" onClick={signOut}>Sign out</button>
          </p>
        )}
        <ErrorBoundary resetKey={`${state.status}:${reportId ?? ''}`} onBack={() => open(null)}>{body}</ErrorBoundary>
      </main>
    </>
  );
}
