// Hubert's feedback on the client's words (Dispatch 26), as Sort's review shows
// a round: "What works:", "What's unclear:" and the rest head their points.
// The latest round shows; the earlier ones fold, the trail a mentor can follow.
import type { ReactNode } from 'react';
import { latestRound, type ClientRound } from '../../../workspace/client-words.ts';
import '../../styles/review.css';

export function RoundText({ round, title, action }: { round: ClientRound; title: string; action?: ReactNode }) {
  const lines = round.text.split('\n');
  return (
    <div className={`rv-round ${round.kind === 'feedback' ? 'feedback' : 'take'}`}>
      <p className="rv-round-h" title={new Date(round.at).toLocaleString()}>
        {title}
        {round.sample && <span className="rv-sample">Sample</span>}
        {action && <span className="rv-round-act">{action}</span>}
      </p>
      {round.kind === 'draft' ? <p className="rv-round-text">{round.text}</p> : (
        <div className="rv-round-text">
          {lines.map((l, k) => (/^[-•]\s/.test(l)
            ? <p key={k} className="rv-point">{l.replace(/^[-•]\s*/, '')}</p>
            : <p key={k} className="rv-sub">{l.replace(/:$/, '')}</p>))}
        </div>
      )}
    </div>
  );
}

/** The feedback rounds: the latest open, the earlier ones folded with what the agent had written then. */
export function ClientRounds({ rounds }: { rounds: ClientRound[] }) {
  const feedback = rounds.filter((r) => r.kind === 'feedback');
  const last = latestRound(rounds, 'feedback');
  if (!last) return null;
  const earlier = feedback.filter((r) => r !== last).reverse();
  return (
    <div className="rv-hubert cw-rounds" aria-live="polite">
      <RoundText round={last} title="Hubert’s feedback" />
      {earlier.length > 0 && (
        <details className="rv-earlier">
          <summary>Earlier rounds ({earlier.length})</summary>
          {earlier.map((r) => (
            <div key={`${r.at}-${r.text.length}`}>
              {r.wrote && <p className="rv-was">You’d written: “{r.wrote}”</p>}
              <RoundText round={r} title="Feedback" />
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
