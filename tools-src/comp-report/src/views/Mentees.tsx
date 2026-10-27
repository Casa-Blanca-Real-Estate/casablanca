// A mentor's mentees (Kimani, 2026-10-27): picked by name from the agents, kept on the server, and
// the default filter on Everyone's reports. A filter, not a permission: mentors read every report.
import { useMemo, useState } from 'react';
import { api } from '../api.ts';

export interface MenteeAgent {
  email: string;
  name: string | null;
}

export interface MenteesState {
  mentees: string[];
  agents: MenteeAgent[];
}

export function loadMentees() {
  return api<MenteesState>('/api/comp-report/mentees');
}

export const agentLabel = (a: MenteeAgent) => a.name ?? a.email;

/** The picker: tick agents by name, search to narrow, Save replaces the list. */
export function MenteePicker({ state, onSaved, onClose }: {
  state: MenteesState;
  onSaved: (mentees: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState(() => new Set(state.mentees));
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? state.agents.filter((a) => `${a.name ?? ''} ${a.email}`.toLowerCase().includes(q)) : state.agents;
  }, [state.agents, query]);

  const toggle = (email: string) => setPicked((s) => {
    const next = new Set(s);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    return next;
  });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ mentees: string[] }>('/api/comp-report/mentees', { method: 'PUT', body: { emails: [...picked] } });
      onSaved(r.mentees);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="sh-access sh-mentees">
      <div className="sh-access-body">
        <p className="sh-access-who">Your mentees</p>
        <p className="sh-help">Tick the agents you mentor. Everyone’s reports shows theirs first; you can still see all agents.</p>
        <input type="search" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search agents by name" />
        {error && <p className="sh-note error" role="alert">{error}</p>}
        <ul className="sh-mentee-list">
          {shown.map((a) => (
            <li key={a.email}>
              <label>
                <input type="checkbox" checked={picked.has(a.email)} onChange={() => toggle(a.email)} />
                <span>{agentLabel(a)}</span>
                {a.name && <span className="sh-help">{a.email}</span>}
              </label>
            </li>
          ))}
          {!shown.length && <li className="sh-help">{state.agents.length ? 'No agent by that name.' : 'No agents have signed in yet.'}</li>}
        </ul>
        <div className="sh-access-row">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>Save · {picked.size} {picked.size === 1 ? 'mentee' : 'mentees'}</button>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
