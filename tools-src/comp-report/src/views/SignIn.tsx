// Sign-in and the states around it, on the handoff's card (screen 1): Google first, the email form
// behind a link. Every state keeps its logic: the invitation, the new password, a refusal, Identity not
// switched on, and the dev sign-in under the local dev server.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { ApiError } from '../api.ts';
import { session, type SessionState } from '../session.ts';

function message(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

/** A labelled underlined field, as the handoff draws the email form. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="sh-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SignIn({ notice, onSignedIn }: { notice?: string; onSignedIn: (s: SessionState) => void }) {
  const [mode, setMode] = useState<'choose' | 'password' | 'reset'>('choose');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);

  async function passwordSignIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      onSignedIn(await session.signInWithPassword(email, password));
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await session.sendPasswordReset(email);
      setStatus('If that address has an account, a reset link is on its way.');
      setMode('password');
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sh-card">
      <h1 className="sh-card-title">Sign in</h1>
      {status && <p className="sh-status" role="status">{status}</p>}
      <button type="button" className="sh-google" onClick={() => session.signInWithGoogle()}>
        <span className="sh-google-g" aria-hidden="true">G</span>
        {import.meta.env.DEV && session.dev ? 'Dev sign-in (local only)' : 'Continue with Google'}
      </button>
      <p className="sh-help center">Use your Casa Blanca Google account</p>

      {mode === 'choose' && (
        <button type="button" className="link sh-toggle" onClick={() => setMode('password')}>Sign in with email instead</button>
      )}
      {/* Inheriting the Studio's session is a follow-up (the Studio has no sign-in the server can verify). */}
      <p className="sh-help center sh-fine">Signing in to the Studio doesn’t sign you in here yet.</p>

      {mode === 'password' && (
        <form onSubmit={passwordSignIn} className="sh-form">
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Password">
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <button className="btn" disabled={busy}>Sign in</button>
          <button type="button" className="link sh-forgot" onClick={() => setMode('reset')}>Forgot password</button>
        </form>
      )}

      {mode === 'reset' && (
        <form onSubmit={reset} className="sh-form">
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <button className="btn" disabled={busy}>Send a reset link</button>
          <button type="button" className="link sh-forgot" onClick={() => setMode('password')}>Back to sign in</button>
        </form>
      )}
    </div>
  );
}

export function AcceptInvite({ token, onDone }: { token: string; onDone: (s: SessionState) => void }) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      onDone(await session.acceptInvite(token, password));
    } catch (err) {
      setStatus(message(err));
    }
  }
  return (
    <form className="sh-card" onSubmit={submit}>
      <p className="eyebrow mid">Invitation</p>
      <h1 className="sh-card-title sm">Choose a password to finish setting up your account.</h1>
      {status && <p className="sh-status" role="status">{status}</p>}
      <div className="sh-form flush">
        <Field label="Password">
          <input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <button className="btn primary">Accept invitation</button>
      </div>
    </form>
  );
}

export function SetNewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await session.setPassword(password);
      onDone();
    } catch (err) {
      setStatus(message(err));
    }
  }
  return (
    <form className="sh-card" onSubmit={submit}>
      <p className="eyebrow mid">Reset password</p>
      <h1 className="sh-card-title sm">Choose a new password.</h1>
      {status && <p className="sh-status" role="status">{status}</p>}
      <div className="sh-form flush">
        <Field label="New password">
          <input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <button className="btn primary">Save password</button>
      </div>
    </form>
  );
}

export function NotAuthorised({ email, error, onSignOut, onRetry }: { email: string; error: ApiError; onSignOut: () => void; onRetry: () => void }) {
  const refused = error.status === 403;
  const signedOut = error.status === 401;
  // A 401 says what was sent, so a refused first sign-in can be told from a stale session (NW-091 a).
  const [hadToken, setHadToken] = useState<boolean | null>(null);
  useEffect(() => {
    if (!signedOut) return;
    session.token().then((t) => setHadToken(Boolean(t)), () => setHadToken(false));
  }, [signedOut]);
  return (
    <div className="sh-card">
      <p className="eyebrow mid">{refused ? 'Not authorised' : 'Something went wrong'}</p>
      <h1 className="sh-card-title sm">{refused ? `${email} can’t use the comp report.` : 'We couldn’t check your access.'}</h1>
      <p className="sh-help">{error.message}</p>
      {signedOut && hadToken !== null && <p className="sh-help"><code>{error.code}, {hadToken ? 'token present' : 'no token'}</code></p>}
      <div>
        {signedOut && <button type="button" className="btn primary" onClick={onRetry}>Try again</button>}{' '}
        <button type="button" className="btn" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}

export function Unavailable() {
  return (
    <div className="sh-card">
      <p className="eyebrow mid">Not open yet</p>
      <h1 className="sh-card-title sm">Sign-in isn’t switched on for the comp report yet.</h1>
      <p className="sh-help">It needs Netlify Identity turned on for this site. Nothing you need to do — check back soon.</p>
    </div>
  );
}
