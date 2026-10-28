import { useEffect, useState } from 'react';
import { api, type AccessLine, type ActivityLine, type Person, type Report } from '../api.ts';

// The Access panel's logs and levels (Dispatch 22b): admins only, like the rest of the panel.
// Every value shown is a code from a closed list, an address, a time or a count, rendered as
// plain text. Labels come from the lists below; anything unknown shows as its code.

const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const REASONS: Record<string, string> = {
  not_authorised: 'not authorised',
  disabled: 'account turned off',
  unconfirmed: 'email not confirmed',
  address_unverified: 'password sign-in off (address unverified)',
  provider_not_allowed: 'sign-in method not allowed',
};
const ERRORS: Record<string, string> = {
  access_denied: 'cancelled or blocked at Google',
  admin_policy_enforced: 'blocked by Google Workspace policy',
  invalid_request: 'invalid request',
  server_error: 'Identity error',
  other: 'other error',
};
const ERROR_CODES: Record<string, string> = {
  gate_webhook: 'our gate refused it',
  signups_not_allowed: 'sign-up is invite-only',
  other: 'no known description',
};
const ACTIONS: Record<string, string> = {
  'import.read': 'Read an export',
  'comp.added': 'Added a comp',
  'comp.tiered': 'Tiered a comp',
  'comp.removed': 'Took a comp out',
  'comp.restored': 'Put a comp back',
  'call.given': 'Gave their call',
  'narrative.copied': 'Copied the email',
  'report.sent': 'Marked it sent',
};
const TIERS: Record<string, string> = { primary: '1st', secondary: '2nd', excluded: '✕' };

const who = (l: AccessLine) => l.email ?? (l.domain ? `someone at ${l.domain}` : 'someone not signed up');

function signInText(l: AccessLine): string {
  if (l.kind === 'gate') {
    const verdict = l.allowed ? `let in${l.via ? ` (${l.via})` : ''}` : 'refused';
    return `${who(l)} · ${l.event ?? 'other'} via ${l.provider ?? 'other'} · gate ${verdict}`;
  }
  if (l.kind === 'session_start') return `${who(l)} · started a session (${l.provider ?? 'other'})`;
  if (l.kind === 'refused') return `${who(l)} · refused: ${REASONS[l.reason ?? ''] ?? l.reason}`;
  if (l.kind === 'signin_error') {
    return `Sign-in came back with an error · ${ERRORS[l.error ?? 'other'] ?? l.error} · ${ERROR_CODES[l.errorCode ?? 'other'] ?? l.errorCode}`;
  }
  return l.kind;
}

function auditText(l: AccessLine): string {
  if (l.kind === 'viewed_list') return `${l.byEmail ?? 'someone'} loaded everyone’s reports${l.ownerEmail ? ` (${l.ownerEmail})` : ''}`;
  if (l.kind === 'capability_change') return `${l.byEmail ?? 'an admin'} set ${l.email ?? 'someone'} to ${l.capability}`;
  return l.kind;
}

function activityText(a: ActivityLine): string {
  if (a.kind === 'screen') return `On ${a.name.slice('screen.'.length).replace(/-/g, ' ')}`;
  if (a.kind === 'error') return `Hit an error (${a.name.slice('error.'.length).replace(/_/g, ' ')})`;
  const d = a.detail as Record<string, string | number | boolean | undefined>;
  const bits = [
    d.tier ? TIERS[String(d.tier)] ?? String(d.tier) : null,
    d.format ? String(d.format) : null,
    typeof d.comps === 'number' ? `${d.comps} comps` : null,
    d.length ? String(d.length) : null,
    d.via ? `by ${d.via}` : null,
    d.skipped === true ? 'skipped' : null,
    d.by === 'hubert' ? 'by Hubert' : null,
  ].filter(Boolean);
  return `${ACTIONS[a.name] ?? a.name}${bits.length ? ` · ${bits.join(', ')}` : ''}`;
}

function useLog<T>(path: string | null): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    setData(null);
    setError(null);
    api<T>(path).then(setData, (e) => setError(e instanceof Error ? e.message : 'Could not load it.'));
  }, [path, n]);
  return { data, error, reload: () => setN((x) => x + 1) };
}

export function SignInLog() {
  const [filter, setFilter] = useState('');
  const [applied, setApplied] = useState('');
  const { data, error, reload } = useLog<{ lines: AccessLine[] }>(
    `/api/comp-report/access-log?view=signin${applied ? `&user=${encodeURIComponent(applied)}` : ''}`,
  );
  return (
    <section className="sh-log">
      <h3 className="sh-log-title">Sign-ins</h3>
      <p className="sh-help">
        The last 100. Gate lines come from Identity’s calls, which nothing signs: they’re marked unverified.
        Sessions and refusals come from a verified sign-in. Someone who isn’t a user shows only by their domain.
      </p>
      <form className="sh-access-row" onSubmit={(e) => { e.preventDefault(); setApplied(filter.trim().toLowerCase()); }}>
        <input type="email" aria-label="Only this person" placeholder="Only this person (email)" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="btn">Filter</button>
        <button type="button" className="link" onClick={reload}>Refresh</button>
      </form>
      <LogLines error={error} lines={data?.lines.map((l) => ({ at: l.at, text: signInText(l), unverified: !l.verified, refused: l.kind === 'refused' || l.allowed === false }))} />
    </section>
  );
}

export function AuditLog() {
  const { data, error } = useLog<{ lines: AccessLine[] }>('/api/comp-report/access-log?view=audit');
  return (
    <section className="sh-log">
      <h3 className="sh-log-title">Everyone’s reports and levels</h3>
      <p className="sh-help">Who loaded every agent’s reports (once per half hour), and who changed an agent’s level.</p>
      <LogLines error={error} lines={data?.lines.map((l) => ({ at: l.at, text: auditText(l) }))} />
    </section>
  );
}

export function Timeline({ reports }: { reports: Report[] }) {
  const [report, setReport] = useState('');
  const { data, error } = useLog<{ lines: AccessLine[]; activity: ActivityLine[] }>(
    report ? `/api/comp-report/access-log?view=timeline&report=${report}` : null,
  );
  const lines = data
    ? [
      ...data.activity.map((a) => ({ at: a.at, text: `${a.userEmail} · ${activityText(a)}`, refused: a.kind === 'error' })),
      ...data.lines.map((l) => ({ at: l.at, text: `${l.byEmail ?? 'someone'} read it (${l.ownerEmail ?? 'the owner'}’s report)` })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100)
    : undefined;
  return (
    <section className="sh-log">
      <h3 className="sh-log-title">One report’s timeline</h3>
      <p className="sh-help">What was done in it, the screens it was on, and who else read it. Pick from the reports listed above (Everyone’s shows every agent’s).</p>
      <select aria-label="Report" value={report} onChange={(e) => setReport(e.target.value)}>
        <option value="">Choose a report…</option>
        {reports.map((r) => <option key={r.id} value={r.id}>{r.title} · {r.ownerEmail}</option>)}
      </select>
      {report && <LogLines error={error} lines={lines} />}
    </section>
  );
}

function LogLines({ lines, error }: { lines: { at: string; text: string; unverified?: boolean; refused?: boolean }[] | undefined; error: string | null }) {
  if (error) return <p className="sh-note error" role="alert">{error}</p>;
  if (!lines) return <p className="sh-help">Loading…</p>;
  if (!lines.length) return <p className="sh-help">Nothing yet.</p>;
  return (
    <ol className="sh-log-lines">
      {lines.map((l, i) => (
        <li key={i} className={l.refused ? 'refused' : undefined}>
          <time dateTime={l.at}>{when(l.at)}</time>
          <span>{l.text}</span>
          {l.unverified && <span className="sh-log-tag">unverified</span>}
        </li>
      ))}
    </ol>
  );
}

/** Agents' levels: practice (new: writes first, Hubert gives feedback) or full. */
export function Levels({ me }: { me: { user: { email: string } } }) {
  const { data, error, reload } = useLog<{ people: Person[] }>('/api/comp-report/capability');
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function set(email: string, capability: 'practice' | 'full') {
    setBusy(true);
    setFailed(null);
    try {
      await api('/api/comp-report/capability', { method: 'POST', body: { email, capability, ...(capability === 'full' && reason.trim() ? { reason: reason.trim() } : {}) } });
      setEditing(null);
      setReason('');
      reload();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not change that.');
    } finally {
      setBusy(false);
    }
  }

  const agents = data?.people.filter((p) => p.role === 'agent') ?? [];
  return (
    <section className="sh-log">
      <h3 className="sh-log-title">Levels</h3>
      <p className="sh-help">
        Practice agents write their own take on each comp first and get Hubert’s feedback; full agents approve his draft.
        Everyone starts on full. Changes apply on the agent’s next request.
      </p>
      {(error || failed) && <p className="sh-note error" role="alert">{error ?? failed}</p>}
      {!data && !error && <p className="sh-help">Loading…</p>}
      {data && !agents.length && <p className="sh-help">No agents have signed in yet.</p>}
      <ul className="sh-access-list">
        {agents.map((p) => (
          <li key={p.email} className="sh-access-entry">
            <div>
              <span className="sh-access-who">{p.name ?? p.email}</span> <span className="sh-help">· {p.capability === 'practice' ? 'Practice' : 'Full'}</span>
              <p className="sh-help">{p.name ? `${p.email} · ` : ''}{p.lastSeenAt ? `last here ${when(p.lastSeenAt)}` : 'not seen yet'}</p>
            </div>
            {p.email !== me.user.email && (p.capability === 'full' ? (
              <button type="button" className="link" disabled={busy} onClick={() => void set(p.email, 'practice')}>Set to practice</button>
            ) : editing === p.email ? (
              <span className="sh-access-confirm">
                <input aria-label="Why" placeholder="Why (optional)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
                <button type="button" className="btn" disabled={busy} onClick={() => void set(p.email, 'full')}>Unlock full</button>
                <button type="button" className="link" onClick={() => setEditing(null)}>Cancel</button>
              </span>
            ) : (
              <button type="button" className="link" onClick={() => { setEditing(p.email); setReason(''); }}>Unlock full…</button>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
