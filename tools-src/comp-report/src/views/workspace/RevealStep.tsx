// The call, then the reveal (§3, §3.1). The agent gives their
// own low–high view before the range shows (D-1 recommendation C), or skips it.
// Then both results side by side (§6.4): base and range, the bridge, evidence by
// status (never mixed, §4.3), sale-to-last-ask, carry and the gaps, with the call
// against each range — the teaching moment (§8.4). From here the numbers are
// live: every tier, fact or call change recomputes them in the browser.
import { useState } from 'react';
import type { EngineOutput, Figure, PriceEvaluation, Result, ResultKind } from '../../../engine/index.ts';
import { estimateWords, EVIDENCE_LABEL, pct, psf, usd, usdRange } from '../../../workspace/format.ts';
import type { Entry } from '../../../workspace/state.ts';
import { DecisionTag, NumberInput, SampleTag, StubTag } from './bits.tsx';
import { compAddress } from './comps.tsx';
import type { StepProps, Workspace } from './model.ts';
import { TargetAndTerms } from './Terms.tsx';

const KINDS: ResultKind[] = ['on_facts', 'with_estimates'];
const CLASSES = ['sold', 'in_contract', 'active'] as const;

/** A figure in its own unit. */
export function fig(f: Figure | null | undefined): string {
  if (!f) return '—';
  switch (f.unit) {
    case 'usd': return usd(f.value);
    case 'usd_per_sqft': return `${psf(f.value)}/sq ft`;
    case 'percent': return pct(f.value);
    case 'days': return `${Math.round(f.value)} days`;
    case 'usd_per_month': return `${usd(f.value)}/mo`;
    case 'usd_per_sqft_per_month': return `$${f.value.toFixed(2)}/sq ft/mo`;
    case 'sqft': return `${Math.round(f.value).toLocaleString('en-US')} sq ft`;
  }
}

const POSITION = { below: 'below the range', within: 'within the range', above: 'above the range' } as const;

function Position({ p, kind }: { p: PriceEvaluation; kind: ResultKind }) {
  const r = p.per_result[kind];
  return (
    <li>
      <strong>{p.label}</strong> {usd(p.price)}:{' '}
      {r.vs_range ? POSITION[r.vs_range.position] : 'no range to compare with'}
      {r.vs_base && <span className="muted"> · {pct(r.vs_base.percent)} against the base</span>}
    </li>
  );
}

export function RevealStep({ ws }: StepProps) {
  return (
    <div className="reveal">
      <CallForm ws={ws} />
      {ws.revealed ? (
        <>
          <Reveal ws={ws} />
          <TargetAndTerms ws={ws} />
        </>
      ) : (
        <p className="muted">The range stays hidden until you give your call or skip it. Sorting the comps first gives you something to base it on.</p>
      )}
    </div>
  );
}

function CallForm({ ws }: StepProps) {
  const { call } = ws;
  const [editing, setEditing] = useState(false);
  const [low, setLow] = useState<Entry<number> | undefined>(undefined);
  const [high, setHigh] = useState<Entry<number> | undefined>(undefined);
  const valid = Boolean(low && high && low.value > 0 && high.value > 0 && low.value <= high.value);

  if (call && !editing) {
    return (
      <div className="card call">
        <div className="row wrap">
          <span className="label" style={{ margin: 0 }}>Your call</span>
          <DecisionTag id="D-1">order being decided</DecisionTag>
          <SampleTag show={call.sample} />
        </div>
        {call.skipped
          ? <p>You skipped the call, so the range showed without it. The teaching comparison doesn’t happen for this report.</p>
          : <p className="big-line">{usdRange(call.low, call.high)}</p>}
        <p className="muted small">Given {new Date(call.at).toLocaleString()}.</p>
        {!ws.readOnly && (
          <button type="button" className="link small" onClick={() => {
            setLow(call.low ? { value: call.low, asOf: ws.today } : undefined);
            setHigh(call.high ? { value: call.high, asOf: ws.today } : undefined);
            setEditing(true);
          }}>
            {call.skipped ? 'Give a call after all' : 'Change it'}
          </button>
        )}
      </div>
    );
  }

  if (ws.readOnly) return <p className="muted">No call given yet.</p>;
  return (
    <div className="card call">
      <div className="row wrap">
        <span className="label" style={{ margin: 0 }}>Your call, before the range</span>
        <DecisionTag id="D-1">order being decided</DecisionTag>
      </div>
      <p className="muted small">
        Where do you think it trades, low to high, from the comps you’ve sorted? The range shows as soon as you give it — or skip it.
        {editing && ' Changing it after the reveal replaces the one you gave; CR-3 keeps the history.'}
      </p>
      <div className="row wrap">
        <NumberInput label="Your call, low" prefix="$" value={low} onChange={setLow} today={ws.today} placeholder="Low" />
        <span className="muted">to</span>
        <NumberInput label="Your call, high" prefix="$" value={high} onChange={setHigh} today={ws.today} placeholder="High" />
      </div>
      {low && high && low.value > high.value && <p className="field-hint error">The low is above the high.</p>}
      <div className="row wrap" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            ws.setCall({ low: low!.value, high: high!.value, at: new Date().toISOString() });
            setEditing(false);
          }}
        >
          Give my call and show the range
        </button>
        {!editing && (
          <button type="button" className="btn" onClick={() => ws.setCall({ skipped: true, at: new Date().toISOString() })}>
            Skip the call — show the range
          </button>
        )}
        {editing && <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>}
      </div>
    </div>
  );
}

function Reveal({ ws }: StepProps) {
  const o = ws.output;
  if (ws.engineError) return <p className="notice error-notice">The engine couldn’t compute: {ws.engineError}</p>;
  if (!o) return null;
  const d = o.divergence;
  return (
    <div className="reveal-body">
      {ws.report.sampleData && (
        <p className="notice"><SampleTag show /> These numbers use sample data. Nothing here is for clients.</p>
      )}
      <p className="muted small">
        Analysis date {o.meta.as_of} · engine {o.meta.engine_version} · house method {o.meta.house_method.version}
        {o.meta.house_method.all_null && ' (no values set yet: every adjustment is considered, not calculated)'}
      </p>
      <p>{divergenceWords(o)}</p>
      <div className="results">
        {KINDS.map((k) => <ResultColumn key={k} ws={ws} output={o} r={o.results[k]} />)}
      </div>
      <Gaps ws={ws} output={o} />
      {o.deal_terms && <DealTermsOut output={o} />}
      <p className="muted small">
        <StubTag>CR-3</StubTag> Choosing the lead indicator, a recency window, narrowing the range, what-ifs and versions.{' '}
        <DecisionTag id="D-18">adjustment order</DecisionTag>
      </p>
    </div>
  );
}

/** How far the agent's estimates move the numbers: the gap between the two results (§6.4). */
function divergenceWords(o: EngineOutput): string {
  const d = o.divergence;
  if (d.same) return 'Your estimates move neither the base nor the range.';
  if (d.base.on_facts === null && d.base.with_estimates !== null) {
    return 'Only “with estimates” has a base: it uses your estimates where the facts are missing. The gaps below say what “on the facts” needs.';
  }
  if (d.base.difference !== null) {
    return `Your estimates move the base by ${usd(d.base.difference)}${d.base.difference_percent === null ? '' : ` (${pct(d.base.difference_percent)})`}.`;
  }
  return 'Your estimates change the numbers: compare the two results.';
}

function ResultColumn({ ws, output, r }: { ws: Workspace; output: EngineOutput; r: Result }) {
  const calls = output.prices.filter((p) => p.kind === 'call');
  const targets = output.prices.filter((p) => p.kind === 'target');
  const bridge = r.bridge;
  return (
    <section className="result" aria-label={r.label}>
      <h4>{r.label}</h4>
      <div className="figure-row">
        <span className="big-line">{r.base ? usd(r.base.value) : 'No base'}</span>
        <span className="muted small">base · {r.lead.label}{r.lead.chosen_by === 'default' ? ' (the default)' : ''}</span>
      </div>
      <div className="figure-row">
        {r.range
          ? <span className="range">{usdRange(r.range.low.value, r.range.high.value)}</span>
          : <span className="muted">No range: {r.range_unavailable_because}</span>}
        {r.range && <span className="muted small">range · {r.range.comp_ids.length} primary sold comps</span>}
      </div>

      {(calls.length > 0 || targets.length > 0) && (
        <div className="sub">
          <span className="about-label">Against this range</span>
          <ul className="plain">
            {calls.map((p) => <Position key={p.id} p={p} kind={r.kind} />)}
            {targets.map((p) => <Position key={p.id} p={p} kind={r.kind} />)}
          </ul>
          {targets.length > 0 && <p className="muted small">The target is shown to you, never to the assistant (§8.4).</p>}
        </div>
      )}

      <details className="sub" open>
        <summary><span className="about-label">The bridge</span> {fig(bridge.start)} → {fig(bridge.end)}</summary>
        <p className="muted small">{bridge.note}</p>
        {bridge.lines.length === 0 ? <p className="muted small">No factor differs for the primary sold comps.</p> : (
          <ul className="plain bridge">
            {bridge.lines.map((l) => (
              <li key={l.id}>
                {l.name}{' '}
                <span className={`line-status ${l.status}`}>
                  {l.status === 'considered_not_calculated' ? 'considered — value not yet determined' : l.label}
                </span>
                {l.effect_on_base && <span className="muted"> {fig(l.effect_on_base)}</span>}
                {!l.client_visible && <span className="tag tag-stub">analyst view only</span>}
              </li>
            ))}
          </ul>
        )}
      </details>

      <div className="sub">
        <span className="about-label">Evidence by status</span>
        <div className="table-wrap">
          <table className="evidence">
            <thead><tr><th>Status</th><th>In the numbers</th><th>Median $/sq ft</th><th>Median price</th></tr></thead>
            <tbody>
              {CLASSES.map((cls) => {
                const e = r.evidence[cls];
                const vsSold = cls === 'sold' ? null : r.asks_vs_sold.class_medians[cls];
                return (
                  <tr key={cls}>
                    <td>{EVIDENCE_LABEL[cls]}<div className="muted small">{e.basis === 'sale' ? 'sale prices' : 'asking prices'}</div></td>
                    <td>{e.counts.included} of {e.counts.total}</td>
                    <td>
                      {e.price_per_sqft ? `${psf(e.price_per_sqft.median.value)} (n ${e.price_per_sqft.n})` : '—'}
                      {vsSold && <div className="muted small">{pct(vsSold.versus_sold_median_percent.value)} vs sold</div>}
                    </td>
                    <td>{e.price ? usd(e.price.median.value) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">Only primary comps are in the numbers. Sold, in contract and active never share a statistic.</p>
      </div>

      <div className="sub">
        <span className="about-label">Sale-to-last-ask</span>
        {r.sale_to_ask
          ? <p>Median {pct(r.sale_to_ask.median.value)}, from {pct(r.sale_to_ask.min.value)} to {pct(r.sale_to_ask.max.value)} · {r.sale_to_ask.n} sold comps</p>
          : <p className="muted">No sold comp in the numbers has a last asking price.</p>}
        {r.days_on_market.sold && <p className="muted small">Sold comps’ median days on market: {Math.round(r.days_on_market.sold.median.value)}</p>}
      </div>

      <div className="sub">
        <span className="about-label">Monthly carry</span>
        <p>
          Subject {fig(r.carry.subject)} · comps’ median {fig(r.carry.comp_median)}
          {r.carry.subject_vs_median_percent && ` (${pct(r.carry.subject_vs_median_percent.value)})`}
        </p>
      </div>

      {r.kind === 'with_estimates' && (
        <div className="sub">
          <span className="about-label">Your estimates in this result</span>
          {r.estimates_used.length === 0 ? <p className="muted small">None.</p> : (
            <ul className="plain">{r.estimates_used.map((e) => <li key={`${e.kind}:${e.id}:${e.target}:${e.what}`}>{estimateWords(e)} <span className="muted small">({e.note})</span></li>)}</ul>
          )}
        </div>
      )}
      <ComparedComps ws={ws} output={output} kind={r.kind} />
    </section>
  );
}

function ComparedComps({ ws, output, kind }: { ws: Workspace; output: EngineOutput; kind: ResultKind }) {
  const byId = new Map(ws.comps.map((c) => [c.id, c]));
  const included = output.comps.filter((c) => c.per_result[kind].included);
  return (
    <details className="sub">
      <summary><span className="about-label">Comps in this result</span> {included.length}</summary>
      <ul className="plain">
        {included.map((c) => {
          const pr = c.per_result[kind];
          const comp = byId.get(c.id);
          return (
            <li key={c.id} className="small">
              {comp ? compAddress(comp) : c.id}{c.anchor ? ' (anchor)' : ''} — {c.evidence_class ? EVIDENCE_LABEL[c.evidence_class] : '?'},{' '}
              {pr.price_per_sqft ? `${psf(pr.price_per_sqft.value)}/sq ft` : pr.no_unit_rate_because ?? 'no $/sq ft'}
              {pr.implied_value && <span className="muted"> · implies {usd(pr.implied_value.value)}</span>}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

const RESULT_WORDS: Record<ResultKind, string> = { on_facts: 'on the facts', with_estimates: 'with estimates' };

function Gaps({ ws, output }: { ws: Workspace; output: EngineOutput }) {
  const byId = new Map(ws.comps.map((c) => [c.id, c]));
  const which = (results: ResultKind[]) => (results.length === 2 ? 'both results' : results.map((k) => RESULT_WORDS[k]).join(', '));
  return (
    <div className="gaps">
      <div className="label">What the engine still needs</div>
      {output.gaps.length === 0 ? <p className="muted small">Nothing: every input it needs is here.</p> : (
        <ul className="plain">
          {output.gaps.map((g, i) => (
            <li key={i}>
              {g.message} <span className="muted small">({which(g.results)})</span>
              {g.target === 'subject' && !ws.readOnly && (
                <> <button type="button" className="link small" onClick={() => ws.openStart('details')}>Fill it in (the home’s details)</button></>
              )}
              {g.target && g.target !== 'subject' && byId.get(g.target) && <span className="muted small"> — {compAddress(byId.get(g.target)!)}</span>}
            </li>
          ))}
        </ul>
      )}
      {output.warnings.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 14 }}>Warnings</div>
          <ul className="plain">
            {output.warnings.map((w, i) => (
              <li key={i} className="small">
                {w.message}
                {w.comp_ids.length > 0 && <span className="muted"> — {w.comp_ids.map((id) => (byId.get(id) ? compAddress(byId.get(id)!) : id)).join('; ')}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {output.pending_confirmation.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 14 }}>Waiting for your confirmation</div>
          <ul className="plain">{output.pending_confirmation.map((p, i) => <li key={i} className="small">{p.what} <span className="muted">— {p.note}</span></li>)}</ul>
        </>
      )}
    </div>
  );
}

function DealTermsOut({ output }: { output: EngineOutput }) {
  const t = output.deal_terms!;
  return (
    <div className="gaps">
      <div className="label">Deal terms</div>
      <p className="small">{t.template === 'seller_pricing' ? 'Seller — pricing' : t.template === 'buyer_traditional' ? 'Buyer — traditional purchase' : t.template}</p>
      {t.price_evaluations.length > 0 && (
        <ul className="plain">
          {t.price_evaluations.map((p) => (
            <li key={p.id} className="small">
              <strong>{p.label}</strong> {usd(p.price)}:{' '}
              {KINDS.map((k) => `${RESULT_WORDS[k]} ${p.per_result[k].vs_range ? POSITION[p.per_result[k].vs_range!.position] : 'no range'}`).join('; ')}
            </li>
          ))}
        </ul>
      )}
      {t.monthly_cost && KINDS.map((k) => {
        const m = t.monthly_cost![k];
        return m ? (
          <p key={k} className="small">
            Monthly cost, {RESULT_WORDS[k]}: {usd(m.mortgage_payment)} mortgage on {usd(m.price)}
            {m.housing_cash_outflow !== null && `, ${usd(m.housing_cash_outflow)} a month in all`}
            {m.gaps.length > 0 && <span className="muted"> ({m.gaps.join('; ')})</span>}
          </p>
        ) : null;
      })}
      {t.not_computed_in_v1.length > 0 && <p className="muted small">Captured, not calculated in v1: {t.not_computed_in_v1.join('; ')}</p>}
    </div>
  );
}

/** The numbers, one line, above every step after the reveal: the loop (§3 step 4). */
export function LiveNumbers({ ws }: StepProps) {
  const o = ws.output;
  if (ws.engineError) return <p className="notice error-notice">The engine couldn’t compute: {ws.engineError}</p>;
  if (!o) return null;
  const call = ws.call;
  return (
    <div className="live" aria-live="polite">
      <span className="about-label">Live</span>
      {KINDS.map((k) => {
        const r = o.results[k];
        return (
          <span key={k} className="live-result">
            <strong>{r.label}:</strong> {r.base ? usd(r.base.value) : 'no base'} ·{' '}
            {r.range ? usdRange(r.range.low.value, r.range.high.value) : 'no range'}
          </span>
        );
      })}
      {call && !call.skipped && <span className="live-result muted">Your call {usdRange(call.low, call.high)}</span>}
      <SampleTag show={ws.report.sampleData} />
      <button type="button" className="link small" onClick={() => ws.go('reveal')}>Details</button>
    </div>
  );
}
