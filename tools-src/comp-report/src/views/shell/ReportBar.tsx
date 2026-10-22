// What a report adds to the top bar (the handoff): the Sample badge when the report holds sample data,
// the Hubert toggle, and — for admins (a guest gets dev tools) — the switches in the account menu: dev tools (off by
// default) and viewing the Gate as a new agent.
import type { Workspace } from '../workspace/model.ts';
import { InBar } from './slots.tsx';

function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (next: boolean) => void; label: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="sh-menu-item sh-switch" onClick={() => onChange(!on)}>
      <span className="sh-switch-text">
        <span>{label}</span>
        <span className="sh-menu-hint">{hint}</span>
      </span>
      <span className={`sh-switch-box${on ? ' on' : ''}`} aria-hidden="true" />
    </button>
  );
}

export function ReportBar({ ws, setDevTools }: { ws: Workspace; setDevTools: (on: boolean) => void }) {
  return (
    <>
      <InBar where="pills">
        {ws.report.sampleData && (
          <span className="badge-sample sh-bar-sample" title="Sample data was used in this report. Nothing in it is for clients.">Sample</span>
        )}
        <button type="button" className="sh-pill" aria-pressed={ws.drawerOpen} onClick={() => ws.setDrawerOpen(!ws.drawerOpen)}>
          <span className="sh-spark" aria-hidden="true">✦</span>Hubert
        </button>
      </InBar>
      {(ws.isAdmin || ws.isGuest) && (
        <InBar where="menu">
          <Switch
            on={ws.devTools}
            onChange={setDevTools}
            label="Dev tools"
            hint="About this screen and build notes. Fill with sample shows either way."
          />
          {ws.isAdmin && <Switch
            on={ws.viewAsNewAgent}
            onChange={ws.setViewAsNewAgent}
            label="View the Gate as a new agent"
            hint="Low, high and a why of 100+ characters; no skip."
          />}
        </InBar>
      )}
    </>
  );
}
