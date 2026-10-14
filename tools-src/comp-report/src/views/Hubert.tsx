// Hubert, the comp report's assistant (Dispatch 14), named after Casa Blanca's
// office at 10 Hubert St, Tribeca: a 380px drawer on every workspace screen.
// A guide only: he answers and suggests; the tiers, notes and tags are the agent's.
// GROUNDWORK STUB: the Sort + Hubert group builds the drawer to the handoff.
import type { Workspace } from './workspace/model.ts';
import { Chat } from './Chat.tsx';

export function Hubert({ ws }: { ws: Workspace }) {
  return (
    <aside className="drawer" aria-label="Hubert">
      <div className="drawer-head">
        <span className="label">Hubert</span>
        <button type="button" className="link" onClick={() => ws.setDrawerOpen(false)}>Close</button>
      </div>
      <Chat reportId={ws.reportId} readOnly={ws.readOnly} onCount={ws.setMessageCount} />
    </aside>
  );
}
