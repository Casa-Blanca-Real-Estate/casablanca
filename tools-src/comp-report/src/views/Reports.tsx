import { useEffect, useState } from 'react';
import { api, type Me, type Report } from '../api.ts';
import { Access } from './Access.tsx';
import { NewCompStart } from './newcomp/NewComp.tsx';

export function Reports({ me, onOpen }: { me: Me; onOpen: (id: string, start?: 'details') => void }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const ready = me.database === 'ready';

  useEffect(() => {
    if (!ready) return;
    api<{ reports: Report[] }>('/api/comp-report/reports').then(
      (r) => setReports(r.reports),
      (e) => setError(e.message),
    );
  }, [ready]);

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
      <div className="card new-comp">
        <div>
          <p className="card-title">A new comp</p>
          <p className="muted">The home — by its StreetEasy link or its address — then its details, then the comps: by link, by StreetEasy’s export, or typed in.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setStarting(true)}>New comp</button>
      </div>
      {starting && <NewCompStart me={me} onCreated={(id) => onOpen(id, 'details')} onClose={() => setStarting(false)} />}
      {error && <p className="notice">{error}</p>}

      <div className="label">Your reports</div>
      {reports === null && !error && <p className="muted">Loading…</p>}
      {reports?.length === 0 && <p className="muted">No reports yet.</p>}
      <ul className="list">
        {reports?.map((r) => (
          <li key={r.id}>
            <button type="button" className="list-item" onClick={() => onOpen(r.id)}>
              <span className="list-title">
                {r.title}{' '}
                {r.sampleData && <span className="tag tag-sample" title="Sample data was used in this report. Nothing in it is for clients.">Sample</span>}
              </span>
              <span className="muted small">{r.propertyType} · updated {new Date(r.updatedAt).toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>

      {me.user.role === 'admin' && <Access me={me} />}
    </>
  );
}
