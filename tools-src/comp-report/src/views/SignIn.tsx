import { useState, type FormEvent } from 'react';
import type { ApiError } from '../api.ts';
import { session, type SessionState } from '../session.ts';

function message(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
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
    <div className="card narrow">
      <div className="label">Sign in</div>
      <p className="card-title">Use your Casa Blanca Google account.</p>
      {status && <p className="notice">{status}</p>}
      <button type="button" className="btn primary wide" onClick={() => session.signInWithGoogle()}>
        {import.meta.env.DEV && session.dev ? 'Dev sign-in (local only)' : 'Sign in with Google'}
      </button>

      {mode === 'choose' && (
        <p className="muted small">
          Not at Casa and invited by email?{' '}
          <button type="button" className="link" onClick={() => setMode('password')}>Sign in with your password</button>
        </p>
      )}

      {mode === 'password' && (
        <form onSubmit={passwordSignIn} className="stack">
          <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          <button className="btn" disabled={busy}>Sign in</button>
          <button type="button" className="link small" onClick={() => setMode('reset')}>Forgot your password?</button>
        </form>
      )}

      {mode === 'reset' && (
        <form onSubmit={reset} className="stack">
          <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <button className="btn" disabled={busy}>Send a reset link</button>
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
    <form className="card narrow stack" onSubmit={submit}>
      <div className="label">Invitation</div>
      <p className="card-title">Choose a password to finish setting up your account.</p>
      {status && <p className="notice">{status}</p>}
      <label>Password<input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
      <button className="btn primary">Accept invitation</button>
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
    <form className="card narrow stack" onSubmit={submit}>
      <div className="label">Reset password</div>
      <p className="card-title">Choose a new password.</p>
      {status && <p className="notice">{status}</p>}
      <label>New password<input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
      <button className="btn primary">Save password</button>
    </form>
  );
}

export function NotAuthorised({ email, error, onSignOut }: { email: string; error: ApiError; onSignOut: () => void }) {
  const refused = error.status === 403;
  return (
    <div className="card narrow">
      <div className="label">{refused ? 'Not authorised' : 'Something went wrong'}</div>
      <p className="card-title">{refused ? `${email} can't use the comp report.` : 'We couldn’t check your access.'}</p>
      <p className="muted">{error.message}</p>
      <button type="button" className="btn" onClick={onSignOut}>Sign out</button>
    </div>
  );
}

export function Unavailable() {
  return (
    <div className="card narrow">
      <div className="label">Not open yet</div>
      <p className="card-title">Sign-in isn't switched on for the comp report yet.</p>
      <p className="muted">It needs Netlify Identity turned on for this site. Nothing you need to do — check back soon.</p>
    </div>
  );
}
