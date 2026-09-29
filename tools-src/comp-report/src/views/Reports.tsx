import { useEffect, useState, type FormEvent } from 'react';
import { api, type Me, type Report } from '../api.ts';
import { Access } from './Access.tsx';
import { PreviewNote } from './Preview.tsx';

export function Reports({ me, onOpen }: { me: Me; onOpen: (id: string) => void }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = me.database === 'ready';

  useEffect(() => {
    if (!ready) return;
    api<{ reports: Report[] }>('/api/comp-report/reports').then(
      (r) => setReports(r.reports),
      (e) => setError(e.message),
    );
  }, [ready]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { report } = await api<{ report: Report }>('/api/comp-report/reports', { method: 'POST', body: { title } });
      setReports((prev) => [report, ...(prev ?? [])]);
      setTitle('');
      onOpen(report.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the report.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="card">
        <div className="label">Reports</div>
        <p className="card-title">Signed in as {me.user.email} ({me.user.role}).</p>
        <p className="muted">Saved reports need the database, which isn't set up for this site yet.</p>
      </div>
    );
  }

  return (
    <>
      <PreviewNote />
      <div className="label">New report</div>
      <form className="card row" onSubmit={create}>
        <input
          aria-label="Report title"
          placeholder="Subject property — e.g. 25 North Moore Street, #9C"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
        <button className="btn primary" disabled={busy || !title.trim()}>Create</button>
      </form>
      {error && <p className="notice">{error}</p>}

      <div className="label">Your reports</div>
      {reports === null && !error && <p className="muted">Loading…</p>}
      {reports?.length === 0 && <p className="muted">No reports yet.</p>}
      <ul className="list">
        {reports?.map((r) => (
          <li key={r.id}>
            <button type="button" className="list-item" onClick={() => onOpen(r.id)}>
              <span className="list-title">{r.title}</span>
              <span className="muted small">{r.propertyType} · updated {new Date(r.updatedAt).toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>

      {me.user.role === 'admin' && <Access me={me} />}
    </>
  );
}
