// Preview-build orientation (Casanova, 2026-09-29). The comp report is built in stages (design
// §16); until the workspace (CR-3) exists, a report is a title and a chat, which reads as an empty
// page. This says what works today and what comes next. CR-3 replaces it.

type StepState = 'connected' | 'partly' | 'next' | 'later';

const STATE_LABEL: Record<StepState, string> = {
  connected: 'Connected',
  partly: 'Partly',
  next: 'Next',
  later: 'Later',
};

const STEPS: { name: string; state: StepState; note: string }[] = [
  { name: 'Start with the home', state: 'partly', note: 'A report has a title for now. The intake form comes with the workspace.' },
  { name: 'Drop in the StreetEasy export', state: 'next', note: 'The engine already reads exports. The screen to add one comes next.' },
  { name: 'Sort the comps', state: 'next', note: 'Primary, secondary or excluded, each with a reason.' },
  { name: 'Make the call, then see the range', state: 'next', note: 'The engine already calculates both results. Showing them comes with the workspace.' },
  { name: 'Work it through with the assistant', state: 'connected', note: 'It can read this report so far. It gets the analysis tools with the workspace.' },
  { name: 'Send it', state: 'later', note: 'The client email and the branded PDF.' },
];

export function PreviewNote() {
  return (
    <div className="preview-note">
      <span className="preview-tag">Preview build</span>
      <p>
        What works today: signing in, saving reports and talking to the assistant. The comp workflow
        comes next. Open a report to see what's built and what isn't.
      </p>
    </div>
  );
}

export function PreviewSteps({ onTry }: { onTry: (text: string) => void }) {
  return (
    <section className="preview" aria-labelledby="preview-title">
      <span className="preview-tag">Preview build</span>
      <h3 id="preview-title">This page becomes the workspace</h3>
      <p className="muted">The comp report is built in stages. Here's what works in a report today, and what comes next.</p>
      <ol className="preview-steps">
        {STEPS.map((s) => (
          <li key={s.name}>
            <span className="preview-step-name">{s.name}</span>
            <span className={`preview-state ${s.state}`}>{STATE_LABEL[s.state]}</span>
            <span className="preview-step-note">{s.note}</span>
          </li>
        ))}
      </ol>
      <div className="preview-try">
        <span className="muted small">Try the assistant now:</span>
        <button type="button" className="btn" onClick={() => onTry('Which report is this?')}>Which report is this?</button>
        <button type="button" className="btn" onClick={() => onTry('What can you do so far?')}>What can you do so far?</button>
      </div>
    </section>
  );
}
