// The Gate (Dispatch 14): "What do you think it's worth?" Low, High and Why,
// before Findings shows the numbers. A new (practice) agent gives all three,
// with a why of 100+ characters, and can't skip; a graduated (full) agent can.
// GROUNDWORK STUB: the Gate + Findings group builds it to the handoff.
import type { StepProps } from './model.ts';

export function Gate({ ws }: StepProps) {
  return (
    <div className="gate">
      <p className="muted">The Gate is being built.</p>
      <button type="button" className="btn" onClick={() => ws.go('findings')}>Findings</button>
    </div>
  );
}
