import { useEffect, useState, type FormEvent } from 'react';
import { api, type AllowlistEntry, type Me, type Report, type Role } from '../api.ts';
import { AuditLog, Levels, SignInLog, Timeline } from './AccessLog.tsx';

// Admins only (server/api/allowlist.ts): who beyond Casa's domain may use the
// comp report, and roles other than agent for Casa people. Admin isn't one of
// them: admins come from CR_ADMIN_EMAILS in Netlify, nowhere else. "Studio team" puts someone on the
// Studio's team (the CMS, the profile-pic roster, the team tools) without a PR (Kimani, 2026-11-06).
const ROLES: { value: Role; label: string }[] = [
  { value: 'external', label: 'External' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'agent', label: 'Agent' },
];
// A row written before CR-1.1 could say admin. The access rule ignores it.
const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)?.label ?? 'Admin — not applied';

export function Access({ me, reports = [] }: { me: Me; reports?: Report[] }) {
  const [entries, setEntries] = useState<AllowlistEntry[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('external');
  const [note, setNote] = useState('');
  const [team, setTeam] = useState(false);
  const [roleTouched, setRoleTouched] = useState(false);
  const [builtIn, setBuiltIn] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api<{ entries: AllowlistEntry[]; builtInTeam?: string[] }>('/api/comp-report/allowlist');
    setEntries(r.entries);
    setBuiltIn(r.builtInTeam ?? []);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Could not load the list.'));
  }, []);

  async function grant(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/comp-report/allowlist', { method: 'POST', body: { email, role, note, studioTeam: team } });
      setEmail('');
      setRole('external');
      setRoleTouched(false);
      setNote('');
      setTeam(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  async function setOnTeam(e: AllowlistEntry, on: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api('/api/comp-report/allowlist', { method: 'POST', body: { email: e.email, role: e.role, note: e.note, studioTeam: on } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(address: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/comp-report/allowlist?email=${encodeURIComponent(address)}`, { method: 'DELETE' });
      setConfirming(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that.');
    } finally {
      setBusy(false);
    }
  }

  const current = entries?.filter((e) => !e.revokedAt) ?? [];
  const removed = entries ? entries.length - current.length : 0;

  return (
    <section className="sh-access-body">
      <form className="sh-access-form" onSubmit={grant}>
        <p className="sh-help">
          Anyone with a Casa Blanca address gets in as an agent. Add anyone else here, or give a Casa
          address another role. For someone new, then send the invitation from Netlify → Identity →
          Invite users. Tick Studio team to give them the Studio's team tools too (the agent CMS,
          profile pics, the property sign's roster). Changes apply when the person next signs in or
          reloads. Admins are set in Netlify (CR_ADMIN_EMAILS), not here.
        </p>
        <div className="sh-access-row">
          <input
            type="email"
            aria-label="Email address"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              // A Casa address is an agent already; the usual grant for one is the team, not a role.
              if (!roleTouched) setRole(/@casa-blanca\.com\s*$/i.test(e.target.value) ? 'agent' : 'external');
            }}
            required
          />
          <select aria-label="Role" value={role} onChange={(e) => { setRole(e.target.value as Role); setRoleTouched(true); }}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <input
          aria-label="Note"
          placeholder="Who they are and why they need access (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
        <label className="sh-help">
          <input type="checkbox" checked={team} onChange={(e) => setTeam(e.target.checked)} /> Studio team: the
          CMS, profile pics and the team tools
        </label>
        <div>
          <button className="btn primary" disabled={busy || !email.trim()}>Grant access</button>
        </div>
      </form>
      {error && <p className="sh-note error" role="alert">{error}</p>}

      {entries === null && !error && <p className="sh-help">Loading…</p>}
      {entries && current.length === 0 && <p className="sh-help">No one has been added yet.</p>}
      <ul className="sh-access-list">
        {current.map((e) => (
          <li key={e.email} className="sh-access-entry">
            <div>
              <span className="sh-access-who">{e.email}</span> <span className="sh-help">· {roleLabel(e.role)}{e.studioTeam ? ' · Studio team' : ''}</span>
              <p className="sh-help">
                {e.note ? `${e.note} · ` : ''}added by {e.createdBy}, {new Date(e.createdAt).toLocaleDateString()}
              </p>
            </div>
            {e.email !== me.user.email && (
              <span className="sh-access-confirm">
                <button type="button" className="link" disabled={busy} onClick={() => setOnTeam(e, !e.studioTeam)}>
                  {e.studioTeam ? 'Take off the team' : 'Add to the team'}
                </button>
                {confirming === e.email ? (
                  <>
                    <button type="button" className="btn" disabled={busy} onClick={() => remove(e.email)}>Remove</button>
                    <button type="button" className="link" onClick={() => setConfirming(null)}>Keep</button>
                  </>
                ) : (
                  <button type="button" className="link" onClick={() => setConfirming(e.email)}>Remove…</button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {removed > 0 && <p className="sh-help">{removed} removed. Granting again restores access.</p>}
      {builtIn.length > 0 && (
        <p className="sh-help">
          Always on the Studio team, with the admins: {builtIn.join(', ')}. These are set in the code.
        </p>
      )}

      <Levels me={me} />
      <SignInLog />
      <Timeline reports={reports} />
      <AuditLog />
    </section>
  );
}
