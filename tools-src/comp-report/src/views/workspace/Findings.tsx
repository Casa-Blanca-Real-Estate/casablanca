// Findings (`02-screens.md`; §3.1, §6.3–§6.5, §8.4). Your number first: the
// range stays hidden until the agent gives a low and a high, or skips (D-1).
// Then, top to bottom: what the comps say in one sentence, the range (both
// results side by side only when the agent's estimates change the answer), the
// agent's number against it, the evidence by status, the comps that count, and
// the target and offer details (D-4). How it was worked out is folded. Every
// figure is the engine's; the sentences only word them (workspace/reading.ts).
import { useMemo, useState } from 'react';
import type { CompOut, EngineOutput, Figure, ListingStatus, PriceEvaluation, Result, ResultKind } from '../../../engine/index.ts';
import { againstAsk, clientPrice, estimateWords, pct, psf, usd, usdRange } from '../../../workspace/format.ts';
import { answerResult, estimatesChangeTheAnswer, homeName, neutralReading, numberAgainstIt } from '../../../workspace/reading.ts';
import type { Entry } from '../../../workspace/state.ts';
import { BuildNote, DecisionTag, NumberInput, StubTag } from './bits.tsx';
import { compAddress, compPrice, compStatus, listingUrl, rowPsf, STATUS_LABEL, STATUS_ORDER } from './comps.tsx';
import type { StepProps, Workspace } from './model.ts';
import { OfferDetails, TargetSection } from './Terms.tsx';

const KINDS: ResultKind[] = ['on_facts', 'with_estimates'];
const RESULT_WORDS: Record<ResultKind, string> = { on_facts: 'on the facts', with_estimates: 'with estimates' };

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

export function Findings({ ws }: StepProps) {
  if (!ws.revealed) return <YourNumber ws={ws} />;
  if (ws.engineError) return <p className="notice error-notice">The engine couldn’t compute: {ws.engineError}</p>;
  const o = ws.output;
  if (!o) return null;
  const both = estimatesChangeTheAnswer(o);
  const kind = answerResult(o);
  const name = homeName(ws.intake.unit?.value, ws.intake.address?.value.split(',')[0]);
  const against = numberAgainstIt(o, kind);
  return (
    <div className="findings">
      <YourNumberLine ws={ws} />
      <p className="reading">{neutralReading(o, kind, name)}</p>
      <Ranges output={o} both={both} />
      {both && <p className="muted small">{divergenceWords(o)}</p>}
      {against && <p className="against">{against}</p>}
      <ByStatus ws={ws} output={o} kind={kind} />
      <BuildNote><StubTag>CR-2.2 phase 2</StubTag> The price table ($/sq ft steps and the price each implies) comes with Abacus’s price table.</BuildNote>
      <CountingComps ws={ws} output={o} kind={kind} />
      <TargetSection ws={ws} />
      <OfferDetails ws={ws} />
      <WorkedOut ws={ws} output={o} both={both} kind={kind} />
    </div>
  );
}

// ─── Your number: the gate ───────────────────────────────────────────────────

function YourNumber({ ws }: StepProps) {
  const [low, setLow] = useState<Entry<number> | undefined>(undefined);
  const [high, setHigh] = useState<Entry<number> | undefined>(undefined);
  const [note, setNote] = useState('');
  const valid = Boolean(low && high && low.value > 0 && high.value > 0 && low.value <= high.value);
  if (ws.readOnly) return <p className="muted">The agent hasn’t given their number yet, so the range stays hidden.</p>;
  const toConfirm = ws.comps.filter((c) => c.unconfirmed).length;
  const sorted = ws.comps.filter((c) => c.judgment?.tier).length;
  return (
    <div className="card call your-number">
      <p className="big-line">Before you see what the comps say: what do you think it’s worth?</p>
      <p className="muted small">
        A low and a high, from the comps you’ve sorted ({sorted} of {ws.comps.length}). The range shows as soon as you give it, or skip it.
        {toConfirm > 0 && ` ${toConfirm} comp${toConfirm === 1 ? '' : 's'} still wait${toConfirm === 1 ? 's' : ''} for your confirm on Sort.`}
        <DecisionTag id="D-1" />
      </p>
      <div className="row wrap">
        <NumberInput label="Your number, low" prefix="$" value={low} onChange={setLow} today={ws.today} placeholder="Low" />
        <span className="muted">to</span>
        <NumberInput label="Your number, high" prefix="$" value={high} onChange={setHigh} today={ws.today} placeholder="High" />
      </div>
      {low && high && low.value > high.value && <p className="field-hint error">The low is above the high.</p>}
      <label className="field" style={{ marginTop: 10 }}>
        <span className="field-label">Why, in a line (optional)</span>
        <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The building’s sales have been slow since spring" />
      </label>
      <div className="row wrap" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn primary"
          disabled={!valid}
          onClick={() => ws.setCall({ low: low!.value, high: high!.value, ...(note.trim() ? { note: note.trim() } : {}), at: new Date().toISOString() })}
        >
          Show me what the comps say
        </button>
        <button type="button" className="btn" onClick={() => ws.setCall({ skipped: true, at: new Date().toISOString() })}>Skip</button>
      </div>
    </div>
  );
}

function YourNumberLine({ ws }: StepProps) {
  const call = ws.call!;
  return (
    <p className="muted small your-number-line">
      {call.skipped ? 'You skipped your number.' : <>Your number: <strong>{usdRange(call.low, call.high, clientPrice)}</strong>{call.note ? ` — ${call.note}` : ''}.</>}{' '}
      {!ws.readOnly && (
        <button type="button" className="link small" onClick={() => ws.setCall(null)}>
          {call.skipped ? 'Give one after all' : 'Change it'}
        </button>
      )}
    </p>
  );
}

// ─── The range ───────────────────────────────────────────────────────────────

/** The range as a client hears it; the exact figures and the base are in "How this was worked out". */
function RangeLine({ r, label }: { r: Result; label?: string }) {
  return (
    <p className="range-line">
      {label && <span className="about-label">{label}</span>}
      {r.range
        ? <strong className="range" title={usdRange(r.range.low.value, r.range.high.value)}>{usdRange(r.range.low.value, r.range.high.value, clientPrice)}</strong>
        : <span className="muted">No range: {r.range_unavailable_because}</span>}
    </p>
  );
}

/** One range, or both side by side when the agent's estimates change the answer. */
function Ranges({ output, both }: { output: EngineOutput; both: boolean }) {
  if (!both) return <RangeLine r={output.results[answerResult(output)]} />;
  return (
    <div className="results">
      {KINDS.map((k) => (
        <div key={k} className="result">
          <RangeLine r={output.results[k]} label={output.results[k].label} />
          {k === 'with_estimates' && output.results[k].estimates_used.length > 0 && (
            <ul className="plain small">{output.results[k].estimates_used.map((e) => <li key={`${e.kind}:${e.id}:${e.target}:${e.what}`}>{estimateWords(e)}</li>)}</ul>
          )}
        </div>
      ))}
    </div>
  );
}

/** How far the agent's estimates move the numbers (§6.4). */
function divergenceWords(o: EngineOutput): string {
  const d = o.divergence;
  if (d.base.on_facts === null && d.base.with_estimates !== null) return 'Only “with estimates” has a range: it uses your estimates where the facts are missing.';
  if (d.base.difference !== null) return `Your estimates move the base by ${usd(d.base.difference)}${d.base.difference_percent === null ? '' : ` (${pct(d.base.difference_percent)})`}.`;
  return 'Your estimates change the numbers: compare the two.';
}

// ─── The evidence ────────────────────────────────────────────────────────────

/** By status: count, median $/sq ft, and sale against last ask for sales. Asks never mix with sales. */
function ByStatus({ ws, output, kind }: { ws: Workspace; output: EngineOutput; kind: ResultKind }) {
  const r = output.results[kind];
  const didntSell = ws.comps.filter((c) => compStatus(c) === 'off_market' && c.judgment?.tier === 'primary').length;
  // A status with nothing counted drops out: empty sections disappear.
  const rows = (['sold', 'in_contract', 'active'] as const).filter((cls) => r.evidence[cls].counts.included > 0);
  if (!rows.length && !didntSell) return null;
  return (
    <section className="by-status" aria-label="By status">
      <div className="table-wrap">
        <table className="evidence">
          <thead><tr><th>By status</th><th>Counted</th><th>Median $/sq ft</th><th /></tr></thead>
          <tbody>
            {rows.map((cls) => {
              const e = r.evidence[cls];
              const vsSold = cls === 'sold' ? null : r.asks_vs_sold.class_medians[cls];
              return (
                <tr key={cls}>
                  <td>{STATUS_LABEL[cls]}<div className="muted small">{e.basis === 'sale' ? 'sale prices' : 'asking prices'}</div></td>
                  <td>{e.counts.included}</td>
                  <td>{e.price_per_sqft ? psf(e.price_per_sqft.median.value) : '—'}</td>
                  <td className="small">
                    {cls === 'sold' && r.sale_to_ask ? `Median ${againstAsk(r.sale_to_ask.median.value, '')}` : null}
                    {vsSold ? `${pct(vsSold.versus_sold_median_percent.value)} against the sold median` : null}
                  </td>
                </tr>
              );
            })}
            {didntSell > 0 && (
              <tr>
                <td>{STATUS_LABEL.off_market}<div className="muted small">last asks</div></td>
                <td>{didntSell}</td>
                <td>—</td>
                <td className="small muted">A ceiling signal; no statistic yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The comps that count, with their notes: the lists the email uses. */
function CountingComps({ ws, output, kind }: { ws: Workspace; output: EngineOutput; kind: ResultKind }) {
  const outById = useMemo(() => new Map<string, CompOut>(output.comps.map((c) => [c.id, c])), [output]);
  const counted = ws.comps.filter((c) => outById.get(c.id)?.per_result[kind].included || (compStatus(c) === 'off_market' && c.judgment?.tier === 'primary'));
  if (!counted.length) return <p className="muted">No comp counts yet: tier the closest Primary on Sort.</p>;
  return (
    <section className="counting" aria-label="The comps that count">
      <div className="label">The comps that count</div>
      {STATUS_ORDER.map((s: ListingStatus) => {
        const list = counted.filter((c) => compStatus(c) === s);
        if (!list.length) return null;
        return (
          <div key={s} className="counting-group">
            <h4>{STATUS_LABEL[s]}</h4>
            <ul className="plain">
              {list.map((c) => {
                const url = listingUrl(c);
                const price = compPrice(c);
                const rate = rowPsf(c, outById.get(c.id));
                const note = c.judgment?.reasons.at(-1)?.reason;
                return (
                  <li key={c.id}>
                    {url ? <a href={url} target="_blank" rel="noreferrer noopener">{compAddress(c)}</a> : compAddress(c)}
                    {' — '}{price.label} {usd(price.value)}{rate !== null ? ` · ${psf(rate)}/sq ft` : ''}{c.judgment?.anchor ? ' · the closest comp' : ''}
                    {note && <div className="muted small">{note}</div>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

// ─── How this was worked out ─────────────────────────────────────────────────

const POSITION = { below: 'below the range', within: 'inside the range', above: 'above the range' } as const;

function Position({ p, kind }: { p: PriceEvaluation; kind: ResultKind }) {
  const r = p.per_result[kind];
  return <li>{p.label} {usd(p.price)}: {r.vs_range ? POSITION[r.vs_range.position] : 'no range to compare with'}</li>;
}

function WorkedOut({ ws, output, both, kind }: { ws: Workspace; output: EngineOutput; both: boolean; kind: ResultKind }) {
  const kinds = both ? KINDS : [kind];
  const byId = new Map(ws.comps.map((c) => [c.id, c]));
  return (
    <details className="worked-out">
      <summary>How this was worked out</summary>
      {kinds.map((k) => {
        const r = output.results[k];
        const considered = r.bridge.lines.filter((l) => l.status === 'considered_not_calculated');
        return (
          <div key={k} className="sub">
            {both && <div className="about-label">{r.label}</div>}
            <p>
              <strong>The method:</strong> {r.lead.label}{r.lead.chosen_by === 'default' ? ', the default until Noble picks one' : ''}.
              {r.base && <> The base is {usd(r.base.value)}.</>}
              {r.range && <> The range, {usdRange(r.range.low.value, r.range.high.value)}, runs from the lowest to the highest price its {r.range.comp_ids.length} primary sales imply.</>}
            </p>
            {output.prices.some((p) => p.kind === 'call') && <ul className="plain small">{output.prices.filter((p) => p.kind === 'call').map((p) => <Position key={p.id} p={p} kind={k} />)}</ul>}
            {considered.length > 0 && (
              <p className="small">
                <strong>Considered, not calculated:</strong> {considered.map((l) => l.name).join(', ')}. Each is weighed in choosing and sorting the comps; none moves a number.
              </p>
            )}
            {r.sale_to_ask && <p className="small">Sale against last ask: median {pct(r.sale_to_ask.median.value)}, from {pct(r.sale_to_ask.min.value)} to {pct(r.sale_to_ask.max.value)}, across {r.sale_to_ask.n} sales.</p>}
            <p className="small">Monthly carry: the home {fig(r.carry.subject)}, the comps’ median {fig(r.carry.comp_median)}{r.carry.subject_vs_median_percent ? ` (${pct(r.carry.subject_vs_median_percent.value)})` : ''}.</p>
          </div>
        );
      })}
      <BuildNote><StubTag>CR-2.2 phase 2</StubTag> How the comps differ from each other — the pairs and their price gaps (§6.6) — comes with Abacus’s pairs.</BuildNote>
      <div className="sub">
        <div className="about-label">What the tool still needs</div>
        {output.gaps.length === 0 ? <p className="muted small">Nothing.</p> : (
          <ul className="plain small">
            {output.gaps.map((g, i) => (
              <li key={i}>
                {g.message}{g.results.length === 1 ? <span className="muted"> ({RESULT_WORDS[g.results[0]!]})</span> : null}
                {g.target === 'subject' && !ws.readOnly && <> <button type="button" className="link small" onClick={() => ws.openStart('details')}>Fill it in</button></>}
                {g.target && g.target !== 'subject' && byId.get(g.target) && <span className="muted"> — {compAddress(byId.get(g.target)!)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {output.warnings.length > 0 && (
        <div className="sub">
          <div className="about-label">Warnings</div>
          <ul className="plain small">
            {output.warnings.map((w, i) => (
              <li key={i}>{w.message}{w.comp_ids.length > 0 && <span className="muted"> — {w.comp_ids.map((id) => (byId.get(id) ? compAddress(byId.get(id)!) : id)).join('; ')}</span>}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small">
        Analysis date {output.meta.as_of} · engine {output.meta.engine_version} · house method {output.meta.house_method.version}
        {output.meta.house_method.all_null ? ' (no adjustment values set: every factor is considered, not calculated)' : ''}.
      </p>
    </details>
  );
}

/** The numbers, one slim line, above Sort and Send after the reveal: the range moving as tiers change. */
export function LiveNumbers({ ws }: StepProps) {
  const o = ws.output;
  if (ws.engineError) return <p className="notice error-notice">The engine couldn’t compute: {ws.engineError}</p>;
  if (!o) return null;
  const both = estimatesChangeTheAnswer(o);
  const kinds = both ? KINDS : [answerResult(o)];
  return (
    <div className="live" aria-live="polite">
      {kinds.map((k) => {
        const r = o.results[k];
        return (
          <span key={k} className="live-result">
            {both && <strong>{r.label}: </strong>}
            {r.range ? usdRange(r.range.low.value, r.range.high.value, clientPrice) : 'no range yet'}
          </span>
        );
      })}
      <button type="button" className="link small" onClick={() => ws.go('findings')}>Findings</button>
    </div>
  );
}
