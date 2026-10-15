// Send's issues panel (Dispatch 14, item 10; the handoff's screen 9): "N to
// fix", numbered as the body marks them, each with Show; the fixes QA can
// make, one at a time or all at once ("✦ Fix both"); and the answers QA
// accepts for the rest — it's the agent's own figure, or they keep it.
import type { Acknowledgment } from '../../../workspace/qa.ts';
import { fixLabel, issuesHeading, type SendIssue } from './issues.ts';

const ANSWER_LABEL: Record<Acknowledgment['how'], string> = {
  attributed: 'It’s mine or the client’s',
  acknowledged: 'Keep it',
};

export function IssuesPanel({ issues, canChange, onShow, onFix, onAnswer }: {
  issues: SendIssue[];
  /** Fixes and answers: not on someone else's report, nor on a tab that's locked. */
  canChange: boolean;
  onShow: (issue: SendIssue) => void;
  onFix: () => void;
  onAnswer: (issue: SendIssue, how: Acknowledgment['how']) => void;
}) {
  const blocking = issues.some((i) => i.blocking);
  const fixAll = canChange ? fixLabel(issues) : null;
  return (
    <section className="panel se-issues" aria-label="What QA found">
      <div className="se-issues-head" role="status">
        <span className={`se-badge ${blocking ? 'red' : 'ok'}`} aria-hidden="true">{blocking ? '!' : '✓'}</span>
        {issuesHeading(issues)}
      </div>
      {issues.length === 0 && (
        <p className="se-issues-clear">Every number matches the comps, the facts or what you wrote, and the disclaimer is in.</p>
      )}
      {issues.length > 0 && (
        <ol className="se-issue-list">
          {issues.map((i) => {
            const showable = i.body.length > 0 || i.headline.length > 0 || i.target !== null;
            return (
              <li key={i.key} className={`se-issue${i.blocking ? '' : ' se-issue-note'}`}>
                <span className={`se-badge ${i.blocking ? 'red' : 'se-note'}`} aria-label={`Issue ${i.n}`}>{i.n}</span>
                <span className="se-issue-body">
                  <span className="se-issue-text">{i.text}</span>
                  {canChange && i.answers.length > 0 && (
                    <span className="se-issue-actions">
                      {i.answers.map((how) => (
                        <button key={how} type="button" className="link" onClick={() => onAnswer(i, how)}>{ANSWER_LABEL[how]}</button>
                      ))}
                    </span>
                  )}
                </span>
                {showable && <button type="button" className="link se-show" onClick={() => onShow(i)}>Show</button>}
              </li>
            );
          })}
        </ol>
      )}
      {fixAll && (
        <button type="button" className="se-fix" onClick={() => onFix()}>
          <span className="se-star" aria-hidden="true">✦</span>{fixAll}
        </button>
      )}
    </section>
  );
}
