// Done (Dispatch 14): sent, the headline, the estimate tiles, and How did it go?
// GROUNDWORK STUB: the Send + Done group builds it to the handoff.
import type { StepProps } from './model.ts';

export function Done({ ws }: StepProps) {
  return (
    <div className="done">
      <p className="muted">Sent{ws.send.sentAt ? ` ${new Date(ws.send.sentAt).toLocaleDateString()}` : ''}.</p>
    </div>
  );
}
