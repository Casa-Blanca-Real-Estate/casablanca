import { useEffect, useState, type FormEvent } from 'react';
import { api, type AllowlistEntry, type Me, type Role } from '../api.ts';

// Admins only (server/api/allowlist.ts): who beyond Casa's domain may use the
// comp report, and roles other than agent for Casa people.
const ROLES: { value: Role; label: string }[] = [
  { value: 'external', label: 'External' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'agent', label: 'Agent' },
  { value: 'admin', label: 'Admin' },
];
const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)?.label ?? role;

export function Access({ me }: { me: Me }) {
  const [entries, setEntries] = useState<AllowlistEntry[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('external');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api<{ entries: AllowlistEntry[] }>('/api/comp-report/allowlist');
    setEntries(r.entries);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Could not load the list.'));
  }, []);

  async function grant(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/comp-report/allowlist', { method: 'POST', body: { email, role, note } });
      setEmail('');
      setRole('external');
      setNote('');
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
    <section className="access">
      <div className="label">Access · admins only</div>
      <form className="card stack" onSubmit={grant}>
        <p className="muted">
          Anyone with a Casa Blanca address gets in as an agent. Add anyone else here, or give a Casa
          address another role. For someone new, then send the invitation from Netlify → Identity →
          Invite users. Changes apply on the person's next request.
        </p>
        <div className="row wrap">
          <input
            type="email"
            aria-label="Email address"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
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
        <div>
          <button className="btn primary" disabled={busy || !email.trim()}>Grant access</button>
        </div>
      </form>
      {error && <p className="notice">{error}</p>}

      {entries === null && !error && <p className="muted">Loading…</p>}
      {entries && current.length === 0 && <p className="muted">No one has been added yet.</p>}
      <ul className="list">
        {current.map((e) => (
          <li key={e.email} className="entry">
            <div>
              <span className="list-title">{e.email}</span> <span className="muted small">· {roleLabel(e.role)}</span>
              <p className="muted small">
                {e.note ? `${e.note} · ` : ''}added by {e.createdBy}, {new Date(e.createdAt).toLocaleDateString()}
              </p>
            </div>
            {e.email !== me.user.email && (confirming === e.email ? (
              <span className="row">
                <button type="button" className="btn" disabled={busy} onClick={() => remove(e.email)}>Remove</button>
                <button type="button" className="link" onClick={() => setConfirming(null)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="link small" onClick={() => setConfirming(e.email)}>Remove…</button>
            ))}
          </li>
        ))}
      </ul>
      {removed > 0 && <p className="muted small">{removed} removed. Granting again restores access.</p>}
    </section>
  );
}
