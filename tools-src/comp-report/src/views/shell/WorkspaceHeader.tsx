// The workspace header on every screen (the handoff, screens 6–11): "← Reports", the address, the ✎ that
// opens the details, the sub line and the save status; then the 3-step progress row with its CTA.
import { Fragment, type ReactNode } from 'react';
import { readinessLine } from '../workspace/screens.ts';
import type { Workspace } from '../workspace/model.ts';
import { progressSteps, rowCta } from './progress.ts';
import { homeSubLine } from './subline.ts';

export function WorkspaceHeader({ ws, onBack, saveLine }: { ws: Workspace; onBack: () => void; saveLine: ReactNode }) {
  const sub = homeSubLine({ side: ws.side, brief: ws.brief, send: ws.send, intake: ws.intake, sf: ws.sf });
  return (
    <div className="sh-head">
      <div className="sh-head-main">
        <a
          className="sh-back"
          href={location.pathname}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onBack();
          }}
        >
          ← Reports
        </a>
        <div className="sh-title-row">
          <h1 className="sh-title">{ws.report.title}</h1>
          <button type="button" className="sh-edit" aria-label="Edit details" onClick={() => ws.openStart('details')}>
            <span className="sh-edit-icon" aria-hidden="true">✎</span>
            <span className="sh-edit-text" aria-hidden="true">Edit</span>
          </button>
        </div>
        <div className="sh-sub">{sub}</div>
      </div>
      <div className="sh-head-side">
        {ws.readOnly && (
          <span className="sh-readonly" title={`${ws.report.ownerEmail}’s report. Admins can read it; only its owner can change it.`}>Read only</span>
        )}
        {saveLine}
      </div>
    </div>
  );
}

/**
 * The row's CTA with its helper line: "3 comps need a tier, note or comp tags"
 * (a link that filters to them) beside a disabled "Findings →". Sort repeats
 * it at the bottom (NW-053), from the same rowCta and readinessLine.
 */
export function StepCta({ ws, className = 'sh-cta' }: { ws: Workspace; className?: string }) {
  const input = { screen: ws.screen, revealed: ws.revealed, ready: ws.readiness.ready, readOnly: ws.readOnly };
  const cta = rowCta(input);
  if (!cta) return null;
  const filterIncomplete = ws.readiness.incomplete.length > 0;
  const helper = ws.screen === 'sort' ? readinessLine(ws.readiness) : '';
  return (
    <span className={className}>
      {helper && cta.disabled && (
        filterIncomplete
          ? <button type="button" className="link sh-helper" onClick={() => ws.setSortFilter({ incomplete: true, tags: [] })}>{helper}</button>
          : <span className="sh-helper plain">{helper}</span>
      )}
      <button type="button" className="btn primary" disabled={cta.disabled} onClick={() => ws.go(cta.target)}>{cta.label}</button>
    </span>
  );
}

export function ProgressRow({ ws }: { ws: Workspace }) {
  const input = { screen: ws.screen, revealed: ws.revealed, ready: ws.readiness.ready, readOnly: ws.readOnly };
  const steps = progressSteps(input);
  return (
    <nav className="sh-steps" aria-label="Progress">
      {steps.map((s, i) => (
        <Fragment key={s.id}>
          {i > 0 && <span className={`sh-step-line${s.state !== 'todo' ? ' on' : ''}`} aria-hidden="true" />}
          <button
            type="button"
            className={`sh-step ${s.state}`}
            aria-current={s.state === 'current' ? 'step' : undefined}
            aria-disabled={s.locked ? true : undefined}
            title={s.locked ?? undefined}
            onClick={() => {
              if (!s.locked) ws.go(s.target);
            }}
          >
            <span className="sh-step-n">{s.state === 'done' ? '✓' : s.n}</span>
            {s.label}
          </button>
        </Fragment>
      ))}
      <StepCta ws={ws} />
    </nav>
  );
}
