import { useEffect, useState, type FormEvent } from 'react';
import { api, type AllowlistEntry, type Me, type Report, type Role } from '../api.ts';
import { AuditLog, Levels, SignInLog, Timeline } from './AccessLog.tsx';

// Admins only (server/api/allowlist.ts): who beyond Casa's domain may use the
// comp report, and roles other than agent for Casa people. "Studio team" puts someone on the Studio's
// team (the CMS, the profile-pic roster, the team tools) and "Admin" makes them an admin, both without a
// PR (Kimani, 2026-11-06). CR_ADMIN_EMAILS in Netlify stays the root list, which the panel can't change.
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
  const [admin, setAdmin] = useState(false);
  const [rootAdmins, setRootAdmins] = useState<string[]>([]);
  const [roleTouched, setRoleTouched] = useState(false);
  const [builtIn, setBuiltIn] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api<{ entries: AllowlistEntry[]; builtInTeam?: string[]; rootAdmins?: string[] }>('/api/comp-report/allowlist');
    setEntries(r.entries);
    setBuiltIn(r.builtInTeam ?? []);
    setRootAdmins(r.rootAdmins ?? []);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Could not load the list.'));
  }, []);

  async function grant(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/comp-report/allowlist', { method: 'POST', body: { email, role, note, studioTeam: team, admin } });
      setEmail('');
      setRole('external');
      setRoleTouched(false);
      setNote('');
      setTeam(false);
      setAdmin(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  async function change(e: AllowlistEntry, to: { studioTeam?: boolean; admin?: boolean }) {
    if (to.admin === true && !window.confirm(`Make ${e.email} an admin? They can see everyone's reports and change who has access.`)) return;
    setBusy(true);
    setError(null);
    try {
      const body = { email: e.email, role: e.role, note: e.note, studioTeam: e.studioTeam, admin: e.admin, ...to };
      await api('/api/comp-report/allowlist', { method: 'POST', body });
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
          profile pics, the property sign's roster), or Admin for everything, this panel included.
          Changes apply when the person next signs in or reloads.
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
        <label className="sh-access-check">
          <input type="checkbox" checked={team} onChange={(e) => setTeam(e.target.checked)} /> Studio team: the
          CMS, profile pics and the team tools
        </label>
        <label className="sh-access-check">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Admin: everything,
          including everyone's reports and this panel
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
              <span className="sh-access-who">{e.email}</span> <span className="sh-help">· {e.admin ? 'Admin' : roleLabel(e.role)}{e.studioTeam && !e.admin ? ' · Studio team' : ''}</span>
              <p className="sh-help">
                {e.note ? `${e.note} · ` : ''}added by {e.createdBy}, {new Date(e.createdAt).toLocaleDateString()}
              </p>
            </div>
            {e.email !== me.user.email && (
              <span className="sh-access-confirm">
                {!e.admin && (
                  <button type="button" className="link" disabled={busy} onClick={() => change(e, { studioTeam: !e.studioTeam })}>
                    {e.studioTeam ? 'Take off the team' : 'Add to the team'}
                  </button>
                )}
                <button type="button" className="link" disabled={busy} onClick={() => change(e, { admin: !e.admin })}>
                  {e.admin ? 'Remove admin' : 'Make admin'}
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
      {rootAdmins.length > 0 && (
        <p className="sh-help">
          Always admins (CR_ADMIN_EMAILS in Netlify, so the panel can't remove them): {rootAdmins.join(', ')}.
        </p>
      )}

      <ToolLevels />
      <Levels me={me} />
      <SignInLog />
      <Timeline reports={reports} />
      <AuditLog />
    </section>
  );
}

// Who each Studio tool is for (server/api/studio-tools.ts): the dashboard and each tool page follow it.
// "Admins only" is how a tool under construction is kept from everyone else.
type ToolLevel = 'everyone' | 'mentor' | 'team' | 'admin';
interface ToolRow { key: string; name: string; level: ToolLevel; default: ToolLevel; floor: ToolLevel; changedBy: string | null }
const TOOL_LEVELS: { value: ToolLevel; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'mentor', label: 'Mentors' },
  { value: 'team', label: 'Studio team' },
  { value: 'admin', label: 'Admins only' },
];
const levelRank = (l: ToolLevel) => TOOL_LEVELS.findIndex((x) => x.value === l);

function ToolLevels() {
  const [tools, setTools] = useState<ToolRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<{ tools: ToolRow[] }>('/api/studio/tools')
      .then((r) => setTools(r.tools))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the tools.'));
  }, []);

  async function choose(t: ToolRow, level: ToolLevel) {
    setBusy(t.key);
    setError(null);
    try {
      const r = await api<{ tools: ToolRow[] }>('/api/studio/tools', {
        method: 'PUT',
        body: { key: t.key, level: level === t.default ? null : level },
      });
      setTools(r.tools);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="sh-log sh-access-tools">
      <h3 className="sh-log-title">Studio tools: who sees each</h3>
      <p className="sh-help">
        Each tool on the Studio dashboard, and who it's open to. Mentors includes the team and the admins. Set one to Admins only while it's
        being built or reworked. Changes apply on the next page load.
      </p>
      {error && <p className="sh-note error" role="alert">{error}</p>}
      {tools === null && !error && <p className="sh-help">Loading…</p>}
      <ul className="sh-access-list">
        {tools?.map((t) => (
          <li key={t.key} className="sh-access-entry">
            <div>
              <span className="sh-access-who">{t.name}</span>
              <p className="sh-help">
                {t.level === t.default ? 'As it ships' : `Changed${t.changedBy ? ` by ${t.changedBy}` : ''}`}
                {t.floor !== 'everyone' ? ' · needs the team\'s sign-in, so never everyone' : ''}
              </p>
            </div>
            <select
              aria-label={`Who sees ${t.name}`}
              value={t.level}
              disabled={busy === t.key}
              onChange={(e) => choose(t, e.target.value as ToolLevel)}
            >
              {TOOL_LEVELS.map((l) => (
                <option key={l.value} value={l.value} disabled={levelRank(l.value) < levelRank(t.floor)}>{l.label}</option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}
