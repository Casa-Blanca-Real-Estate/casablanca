// The workspace header on every screen (comps.md §2, 2026-11-18; before it the design pass of 2026-11-06): the
// masthead is the target property: "← Reports", the address large and heavy, ✎ Edit (the New comp window as
// Edit details) and All details ▾ (every fact, in a white panel under it), and the line under the address with
// the save status. Under it the step tabs (1 Add comps · 2 Sort · 3 Findings · 4 Send), with what's left and
// the next button at the right (Next: Sort →, Review comps →, Findings →, Send →, or Send's step button).
import { useState, type ReactNode } from 'react';
import { readinessLine } from '../workspace/screens.ts';
import type { Workspace } from '../workspace/model.ts';
import { inFlight } from '../workspace/reads.ts';
import { progressSteps, rowCta } from './progress.ts';
import { clientNameOf, homeSubLine } from './subline.ts';
import { stepDone } from '../../../workspace/review.ts';
import { KIND_LABEL } from '../../../workspace/features.ts';
import { TYPE_LABEL } from '../newcomp/Home.tsx';

export function WorkspaceHeader({ ws, onBack, saveLine, steps }: { ws: Workspace; onBack: () => void; saveLine: ReactNode; steps?: ReactNode }) {
  const [details, setDetails] = useState(false);
  const sub = mastheadLine(ws);
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
          <button type="button" className="sh-mini sh-edit" aria-label="Edit details" onClick={() => ws.openStart('details')}>
            <span aria-hidden="true">✎ Edit</span>
          </button>
          <button type="button" className="sh-mini sh-alldet" aria-expanded={details} onClick={() => setDetails(!details)}>
            All details {details ? '▴' : '▾'}
          </button>
        </div>
        <div className="sh-sub">
          <span>{sub}</span>
          {ws.readOnly && (
            <span className="sh-readonly" title={`${ws.report.ownerEmail}’s report. Admins and mentors can read it; only its owner can change it.`}>Read only</span>
          )}
          {saveLine}
        </div>
        {details && (
          <dl className="sh-details">
            {targetFacts(ws).map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        )}
      </div>
      {steps}
    </div>
  );
}

const money = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? null : `$${Math.round(n).toLocaleString('en-US')}`);
const LAUNDRY_WORDS: Record<string, string> = { installed: 'In the unit', permitted: 'Allowed, not installed', prohibited: 'Not allowed', none_listed: 'None in the unit' };
const BUILDING_LAUNDRY_WORDS: Record<string, string> = { floor: 'On the floor', building: 'In the building', none: 'None in the building' };
const OUTDOOR_WORDS: Record<string, string> = { balcony: 'Balcony', terrace: 'Terrace', roof_deck: 'Roof deck', garden: 'Garden', patio: 'Patio', outdoor_space: 'Outdoor space', none: 'None' };

/** "Buyer · Jordan and Sam · Condo · Tribeca · 2,000 sq ft · 3 bd · 3 ba · Fl 17 · Asking $3,995,000" (comps.md §2). */
export function mastheadLine(ws: Pick<Workspace, 'side' | 'brief' | 'send' | 'intake' | 'sf' | 'propertyType'>): string {
  const i = ws.intake;
  const kind = i.kind?.value ? KIND_LABEL[i.kind.value] : TYPE_LABEL[ws.propertyType];
  const base = homeSubLine({ side: ws.side, brief: ws.brief, send: ws.send, intake: i, sf: ws.sf }).split(' · ');
  // The type goes after the client, before the neighborhood.
  const at = clientNameOf(ws.brief, ws.send) ? 2 : 1;
  base.splice(at, 0, kind);
  const ask = money(i.askingPrice?.value);
  if (ask) base.push(`Asking ${ask}`);
  return base.join(' · ');
}

/** Every fact of the target, for All details: a missing one is a dash. */
export function targetFacts(ws: Pick<Workspace, 'intake' | 'propertyType' | 'sf'>): [string, string][] {
  const i = ws.intake;
  const dash = (v: string | null | undefined) => (v && v.trim() ? v : '—');
  const outdoor = [i.outdoorKind?.value ? OUTDOOR_WORDS[i.outdoorKind.value] : null, i.outdoorSqft ? `${i.outdoorSqft.value.toLocaleString('en-US')} sq ft` : null].filter(Boolean).join(', ');
  const laundry = [i.laundry?.value ? LAUNDRY_WORDS[i.laundry.value] : null, i.buildingLaundry?.value ? BUILDING_LAUNDRY_WORDS[i.buildingLaundry.value] : null].filter(Boolean).join(' · ');
  return [
    ['Type', i.kind?.value ? KIND_LABEL[i.kind.value] : TYPE_LABEL[ws.propertyType]],
    ['Size', i.areaSqft ? `${i.areaSqft.value.toLocaleString('en-US')} sq ft${i.areaSqft.estimate ? ' (est.)' : ''}` : '—'],
    ['Beds, baths', `${i.beds?.value ?? '—'} bd · ${i.baths?.value ?? '—'} ba`],
    ['Floor', dash(i.floor ? String(i.floor.value) : null)],
    ['Asking', dash(money(i.askingPrice?.value))],
    ['Charges', i.commonCharges ? `${money(i.commonCharges.value)} / mo` : '—'],
    ['Taxes', i.taxes ? `${money(i.taxes.value)} / mo` : '—'],
    ['Laundry', dash(laundry)],
    ['Outdoor', dash(outdoor)],
    ['Building', dash((i.building?.value ?? []).join(', '))],
    ['Area', dash(i.neighborhood?.value)],
  ];
}

/**
 * The row's CTA with its helper line: "3 comps need a tier, note or tags"
 * (a link that filters to them) beside a disabled "Findings →". Sort repeats
 * it at the bottom (NW-053), from the same rowCta and readinessLine.
 */
export function StepCta({ ws, className = 'sh-cta' }: { ws: Workspace; className?: string }) {
  const input = { screen: ws.screen, revealed: ws.revealed, ready: ws.readiness.ready, readOnly: ws.readOnly, comps: ws.comps.length };
  const cta = rowCta(input);
  if (!cta) return null;
  // Add comps (comps.md §2): what's still reading or how many are in, then NEXT: SORT →, live once a comp is in.
  if (ws.screen === 'comps') {
    const reading = inFlight(ws.reads.filter((r) => r.purpose === 'comp')).length;
    const status = reading ? `${reading} still reading` : ws.comps.length ? `${ws.comps.length} comp${ws.comps.length === 1 ? '' : 's'} in` : '';
    return (
      <span className={className}>
        {status && <span className="sh-left" aria-live="polite">{status}</span>}
        <button type="button" className="btn primary sh-next" disabled={cta.disabled} onClick={() => ws.go(cta.target)}>{cta.label}</button>
      </span>
    );
  }
  // Sort: each comp read from its page is checked once, side by side with the target (comps.md §4). Until then,
  // "n to check" and REVIEW COMPS → waits.
  const toCheck = ws.screen === 'sort' && !ws.readOnly ? ws.readiness.toConfirm.length : 0;
  if (toCheck > 0) {
    return (
      <span className={className}>
        <span className="sh-left" aria-live="polite">{toCheck} to check</span>
        <button type="button" className="btn primary sh-next" disabled title="Check each comp first: CHECK on its row">Review comps →</button>
      </span>
    );
  }
  const filterIncomplete = ws.readiness.incomplete.length > 0;
  const helper = ws.screen === 'sort' ? readinessLine(ws.readiness) : '';
  // Admins and guests can sort with the sample right where Findings is locked, to walk the report through.
  const sampleSort = ws.canSample && cta.disabled && ws.screen === 'sort';
  // Review comps leads Sort while any comp is still to review (Dispatch 25): the agent reasons about each before tiering it.
  const toReview = ws.screen === 'sort' && !ws.readOnly ? ws.comps.filter((c) => c.judgment && !c.unsortable && !stepDone(c, ws.level)).length : 0;
  return (
    <span className={className}>
      {ws.screen === 'sort' && !ws.readOnly && ws.comps.length > 0 && <span className="sh-left">All checked</span>}
      {sampleSort && (
        <button type="button" className="btn sh-sample-sort" disabled={Boolean(ws.busy)} onClick={() => void ws.fillSample('sort')}>
          Sort with sample
        </button>
      )}
      {helper && cta.disabled && (
        filterIncomplete
          ? <button type="button" className="link sh-helper" onClick={() => ws.setSortFilter({ incomplete: true, tags: [] })}>{helper}</button>
          : <span className="sh-helper plain">{helper}</span>
      )}
      {toReview > 0 && (
        <button type="button" className="btn primary sh-review" onClick={() => ws.openReview()}>Review comps ({toReview}) →</button>
      )}
      {/* While comps wait for review, Review comps is the forward action and Findings stays in reach as a quiet link. */}
      <button type="button" className={toReview > 0 ? 'link sh-cta-quiet' : 'btn primary'} disabled={cta.disabled} onClick={() => ws.go(cta.target)}>{cta.label}</button>
    </span>
  );
}

export function ProgressRow({ ws }: { ws: Workspace }) {
  const input = { screen: ws.screen, revealed: ws.revealed, ready: ws.readiness.ready, readOnly: ws.readOnly, comps: ws.comps.length };
  const steps = progressSteps(input);
  return (
    <nav className="sh-steps" aria-label="Progress">
      {steps.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`sh-step ${s.state}`}
          aria-current={s.state === 'current' ? 'step' : undefined}
          aria-disabled={s.locked ? true : undefined}
          title={s.locked ?? undefined}
          onClick={() => {
            if (!s.locked) ws.go(s.target);
          }}
        >
          <span className="sh-step-n">{s.n}</span>
          {s.label}
        </button>
      ))}
      <span className="sh-steps-gap" />
      <StepCta ws={ws} />
      {/* Send's step button lands here (workspace/SendStep.tsx): read, copy and open, mark as sent. */}
      {ws.screen === 'send' && <span id="sh-step-slot" className="sh-cta" />}
    </nav>
  );
}
