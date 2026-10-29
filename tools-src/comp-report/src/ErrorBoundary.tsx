// A render error anywhere below this used to unmount the whole app and leave a blank page. Now the
// page says what failed and how to get out. `resetKey` clears the error when the view changes
// (another report, back to the list), so one bad view doesn't strand the rest of the app.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { trackError } from './activity.ts';
import { errorCode } from './error-codes.ts';

// The fixed set of kinds the activity log takes as error.<code> (Dispatch 22b).
export { ERROR_CODES } from './error-codes.ts';

interface Props {
  resetKey: string;
  /** The report on screen, if any, for the activity log. */
  reportId?: string | null;
  onBack: () => void;
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('comp-report: a view failed to render', error, info.componentStack);
    trackError(errorCode(error), this.props.reportId ?? null);
  }

  override componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card">
        <p className="card-title">Something on this page failed to load.</p>
        <p className="muted">{this.state.error.message || String(this.state.error)}</p>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="btn primary" onClick={() => location.reload()}>Reload</button>
          <button type="button" className="btn" onClick={this.props.onBack}>All reports</button>
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>If it keeps happening, send the message above to Kimani.</p>
      </div>
    );
  }
}
