// The Gate (Dispatch 14, item 8; the handoff, screen 7): "What do you think
// it’s worth?" Low, High and Why, before Findings shows the numbers (D-1). A
// new (practice) agent gives all three, with a why of 100+ characters, and
// can't skip; a graduated (full) agent can skip, and the why is optional. The
// server holds the same rule (gate_required, gate_why), so this never sends a
// call it would refuse. A call already given shows here, ready to change, as
// Findings' "Change it" always allowed.
import { useState } from 'react';
import { MoneyInput } from '../findings/MoneyInput.tsx';
import type { StepProps } from './model.ts';
import '../../styles/findings.css';

/** The why a new agent writes, at least (server/api/workspace.ts, PRACTICE_WHY_MIN). */
export const WHY_MIN = 100;
/** The server's cap on the why. */
const WHY_MAX = 2000;

export function Gate({ ws }: StepProps) {
  const call = ws.call;
  const [low, setLow] = useState<number | null>(call && !call.skipped ? call.low ?? null : null);
  const [high, setHigh] = useState<number | null>(call && !call.skipped ? call.high ?? null : null);
  const [why, setWhy] = useState(call?.note ?? '');
  const practice = ws.level === 'practice';
  const whyLen = why.trim().length;
  const whyOk = !practice || whyLen >= WHY_MIN;
  const rangeOk = low !== null && high !== null && low <= high;
  const ok = rangeOk && whyOk;
  const off = ws.readOnly;

  const show = () => {
    if (!ok || off) return;
    const note = why.trim();
    const same = call && !call.skipped && call.low === low && call.high === high && (call.note ?? '') === note;
    if (!same) ws.setCall({ low: low!, high: high!, ...(note ? { note } : {}), at: new Date().toISOString() });
    ws.go('findings');
  };
  const skip = () => {
    if (practice || off) return;
    const note = why.trim();
    if (!call?.skipped || (call.note ?? '') !== note) ws.setCall({ skipped: true, ...(note ? { note } : {}), at: new Date().toISOString() });
    ws.go('findings');
  };

  if (off && !ws.revealed) {
    return (
      <div className="gt-root">
        <div className="gt-card">
          <h2 className="gt-title">What do you think it’s worth?</h2>
          <p className="gt-quiet">The agent hasn’t given their number yet, so the range stays hidden.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gt-root">
      <form className="gt-card" onSubmit={(e) => { e.preventDefault(); show(); }} noValidate>
        <h2 className="gt-title">What do you think it’s worth?</h2>
        {call?.skipped && !off && <p className="gt-quiet">You skipped this. Give your number now, or go on to the comps.</p>}
        <div className="gt-range">
          <label className="gt-field" htmlFor="gt-low">
            <span className="gt-label">Low</span>
            <MoneyInput id="gt-low" className="gt-money" value={low} onChange={setLow} placeholder="$" disabled={off} />
          </label>
          <span className="gt-dash" aria-hidden="true">–</span>
          <label className="gt-field" htmlFor="gt-high">
            <span className="gt-label">High</span>
            <MoneyInput id="gt-high" className="gt-money" value={high} onChange={setHigh} placeholder="$" disabled={off} />
          </label>
        </div>
        {low !== null && high !== null && low > high && <p className="gt-error" role="alert">The low is above the high.</p>}
        <div className="gt-why">
          <label className="gt-label" htmlFor="gt-why-text">{practice ? 'Why' : 'Why · optional'}</label>
          <textarea
            id="gt-why-text"
            className="gt-textarea"
            rows={2}
            maxLength={WHY_MAX}
            value={why}
            disabled={off}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="What in the home or the market puts it there?"
          />
          {practice && (
            <div className={`gt-count${whyLen >= WHY_MIN ? ' gt-count-done' : ''}`} aria-live="polite">
              <span className="gt-dot" aria-hidden="true" />
              {whyLen >= WHY_MIN ? `${whyLen} characters` : `${whyLen} / ${WHY_MIN} minimum`}
            </div>
          )}
        </div>
        <div className="gt-actions">
          {practice && <span className="gt-req">All three required until you graduate</span>}
          <div className="gt-go">
            {!practice && !off && <button type="button" className="gt-skip" onClick={skip}>Skip</button>}
            {off
              ? <button type="button" className="btn primary" onClick={() => ws.go('findings')}>Show the comps</button>
              : <button type="submit" className="btn primary" disabled={!ok}>Show the comps</button>}
          </div>
        </div>
      </form>
      {ws.isAdmin && !off && (
        <p className="gt-admin">
          {ws.viewAsNewAgent
            ? <>Viewing as a new agent: all three required, no skip. <button type="button" className="link" onClick={() => ws.setViewAsNewAgent(false)}>Switch back</button></>
            : <button type="button" className="link" onClick={() => ws.setViewAsNewAgent(true)}>View as a new agent</button>}
        </p>
      )}
    </div>
  );
}
