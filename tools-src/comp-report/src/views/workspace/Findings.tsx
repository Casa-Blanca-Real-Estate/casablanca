// Findings (Dispatch 14, item 9; the handoff, screen 8). The Gate comes first:
// the range stays hidden until the agent gives a low and a high, or skips
// (D-1). Then the top card: the true estimate (a Findings label only, never in
// the email), the legend and the range bar on a fixed axis, the verdict, and
// How Hubert got there beside Your reasoning. Then the status tiles and the
// accordions: the price table (with a size only), the comps that count, the
// target (D-4), pricing details and how this was worked out. Every figure is
// the engine's; the sentences only word them (src/views/findings/findings.ts).
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { CompOut, EngineOutput, Figure, ListingStatus, PairOut, Result, ResultKind } from '../../../engine/index.ts';
import { clientPrice, countWord, pct, psf, sqft, usd } from '../../../workspace/format.ts';
import { answerResult, estimatesChangeTheAnswer } from '../../../workspace/reading.ts';
import { noteOf } from '../../../workspace/state.ts';
import { at, fixedAxis, span } from '../findings/axis.ts';
import { engineWhy, hubertTake, statusTiles, verdictLine } from '../findings/findings.ts';
import { compAddress, compPrice, compStatus, listingUrl, rowPsf, STATUS_LABEL, STATUS_ORDER } from './comps.tsx';
import { Gate } from './Gate.tsx';
import type { StepProps, Workspace } from './model.ts';
import { homeName } from './screens.ts';
import { PricingDetails, TargetSection, targetLabel } from './Terms.tsx';
import '../../styles/findings.css';

const KINDS: ResultKind[] = ['on_facts', 'with_estimates'];
const RESULT_WORDS: Record<ResultKind, string> = { on_facts: 'on the facts', with_estimates: 'with estimates' };
const OTHER: Record<ResultKind, ResultKind> = { on_facts: 'with_estimates', with_estimates: 'on_facts' };

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

/** "$4.22M – $4.91M". */
const rangeWords = (low: number, high: number) => `${clientPrice(low)} – ${clientPrice(high)}`;

export function Findings({ ws }: StepProps) {
  if (!ws.revealed) return <Gate ws={ws} />;
  if (ws.engineError) return <p className="notice error-notice">The engine couldn’t compute: {ws.engineError}</p>;
  const o = ws.output;
  if (!o) return null;
  return <FindingsBody ws={ws} o={o} />;
}

function FindingsBody({ ws, o }: { ws: Workspace; o: EngineOutput }) {
  const kind = answerResult(o);
  const both = estimatesChangeTheAnswer(o);
  const home = homeName(ws.intake, ws.report.title);
  const names = useMemo(() => new Map(ws.comps.map((c) => [c.id, compAddress(c)])), [ws.comps]);
  const take = useMemo(
    () => hubertTake({ output: o, kind, names, home, sf: ws.sf, side: ws.side, asking: ws.intake.askingPrice?.value ?? null }),
    [o, kind, names, home, ws.sf, ws.side, ws.intake.askingPrice?.value],
  );
  return (
    <div className="fi-root">
      <TopCard ws={ws} o={o} kind={kind} both={both} take={take} />
      <Tiles ws={ws} o={o} kind={kind} />
      <Accordions ws={ws} o={o} kind={kind} both={both} />
    </div>
  );
}

// ─── The top card ────────────────────────────────────────────────────────────

function TopCard({ ws, o, kind, both, take }: { ws: Workspace; o: EngineOutput; kind: ResultKind; both: boolean; take: string }) {
  const r = o.results[kind];
  const range = r.range;
  const facts = o.headline_facts[kind].facts;
  const lowRate = facts.find((f) => f.id === 'range.low_per_sqft')?.value;
  const highRate = facts.find((f) => f.id === 'range.high_per_sqft')?.value;
  const n = range?.comp_ids.length ?? 0;
  const unitRate = r.lead.indicator.startsWith('unit_rate');
  const call = ws.call!;
  const verdict = call.skipped ? 'You skipped your guess at the gate.' : verdictLine(o, kind);
  const why = call.note?.trim() || (call.skipped ? 'You skipped this at the gate.' : 'You didn’t write a why at the gate.');
  return (
    <section className="fi-card fi-top" aria-label="The true estimate">
      {range && (
        <div className="fi-a">
          <span className="fi-closest">{n === 1 ? 'The closest sale' : `The ${n} closest sales`}</span>
          {ws.sf && unitRate && <span className="fi-chip"><span className="fi-chip-dot" aria-hidden="true" />Uses your size</span>}
        </div>
      )}
      <div className="fi-est">
        <span className="fi-eyebrow">True estimate{both && <span className="fi-eyebrow-sub"> · {r.label}</span>}</span>
        {range
          ? <span className="fi-big" title={`${usd(range.low.value)} – ${usd(range.high.value)}`}>{rangeWords(range.low.value, range.high.value)}</span>
          : <span className="fi-big fi-big-none">No range yet</span>}
        {range && ws.sf && lowRate !== undefined && highRate !== undefined && <span className="fi-psf">{psf(lowRate)} – {psf(highRate)} / SF</span>}
        {!range && <p className="fi-why">The comps can’t make one yet: {engineWhy(r.range_unavailable_because ?? 'the analysis needs more to go on')}.</p>}
      </div>
      {both && <OtherResult o={o} kind={OTHER[kind]} />}
      {range && <Chart ws={ws} o={o} kind={kind} both={both} />}
      {verdict && <div className="fi-verdict">{verdict}</div>}
      <div className="fi-compare">
        <div className="fi-col">
          <span className="fi-label"><span className="fi-spark" aria-hidden="true">✦</span>How Hubert got there</span>
          <div className="fi-take">{take}</div>
        </div>
        <div className="fi-col fi-yours">
          <span className="fi-label">Your reasoning <span className="fi-from">(from the gate)</span></span>
          <div className="fi-reason">{why}</div>
          {!ws.readOnly && (
            <button type="button" className="link fi-change" onClick={() => ws.go('gate')}>
              {call.skipped ? 'Give your number after all' : 'Change your number'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** The other result, when the agent's estimates change the answer: both show, and it says so. */
function OtherResult({ o, kind }: { o: EngineOutput; kind: ResultKind }) {
  const r = o.results[kind];
  return (
    <div className="fi-other">
      <span className="fi-eyebrow fi-eyebrow-mid">{r.label}</span>
      <span className="fi-other-v">
        {r.range ? rangeWords(r.range.low.value, r.range.high.value) : <span className="fi-other-none">No range: {engineWhy(r.range_unavailable_because ?? 'the analysis needs more to go on')}</span>}
      </span>
      <p className="fi-other-note">Your estimates change the answer. {divergenceWords(o)}</p>
      {r.estimates_used.length > 0 && (
        <ul className="fi-plain">{r.estimates_used.map((e) => <li key={`${e.kind}:${e.id}:${e.target}:${e.what}`}>{e.note || e.what}</li>)}</ul>
      )}
    </div>
  );
}

/** How far the agent's estimates move the numbers (§6.4). */
function divergenceWords(o: EngineOutput): string {
  const d = o.divergence;
  if (d.base.on_facts === null && d.base.with_estimates !== null) return 'Only “with estimates” has a range: it uses your estimates where the facts are missing.';
  if (d.base.difference !== null) return `They move the base by ${usd(d.base.difference)}${d.base.difference_percent === null ? '' : ` (${pct(d.base.difference_percent)})`}.`;
  return 'Compare the two.';
}

/** The legend and the range bar on the fixed axis (the handoff, "Findings axis"). */
function Chart({ ws, o, kind, both }: { ws: Workspace; o: EngineOutput; kind: ResultKind; both: boolean }) {
  const range = o.results[kind].range!;
  const altKind = OTHER[kind];
  const alt = both ? o.results[altKind].range : null;
  const call = ws.call;
  const guess = call && !call.skipped && call.low !== undefined && call.high !== undefined ? { low: call.low, high: call.high } : null;
  const target = ws.target?.price.value ?? null;
  const ask = ws.intake.askingPrice?.value ?? null;
  const axis = fixedAxis([range.low.value, range.high.value, alt?.low.value, alt?.high.value, guess?.low, guess?.high, target, ask]);
  if (!axis) return null;
  const est = span(axis, range.low.value, range.high.value);
  const altBar = alt ? span(axis, alt.low.value, alt.high.value) : null;
  const guessBar = guess ? span(axis, guess.low, guess.high) : null;
  const pctStyle = (b: { left: number; width: number }) => ({ left: `${b.left}%`, width: `${b.width}%` });
  const summary = [
    `True estimate ${rangeWords(range.low.value, range.high.value)}`,
    alt && `${o.results[altKind].label} ${rangeWords(alt.low.value, alt.high.value)}`,
    guess && `your guess ${rangeWords(guess.low, guess.high)}`,
    target && `${targetLabel(ws).toLowerCase()} ${clientPrice(target)}`,
    ask && `asking ${clientPrice(ask)}`,
  ].filter(Boolean).join('; ');
  return (
    <div className="fi-chart">
      <div className="fi-legend">
        <span className="fi-key"><span className="fi-sw fi-sw-est" aria-hidden="true" />True estimate {rangeWords(range.low.value, range.high.value)}</span>
        {alt && <span className="fi-key fi-key-alt"><span className="fi-sw fi-sw-alt" aria-hidden="true" />{o.results[altKind].label} {rangeWords(alt.low.value, alt.high.value)}</span>}
        {guess && <span className="fi-key fi-key-guess"><span className="fi-sw fi-sw-guess" aria-hidden="true" />Your guess {rangeWords(guess.low, guess.high)}</span>}
        {target !== null && <span className="fi-key fi-key-target"><span className="fi-sw fi-sw-target" aria-hidden="true" />{targetLabel(ws)} {clientPrice(target)}</span>}
        {ask !== null && <span className="fi-key fi-key-ask"><span className="fi-sw fi-sw-ask" aria-hidden="true" />Asking {clientPrice(ask)}</span>}
      </div>
      <div className={`fi-track${altBar ? ' fi-track-alt' : ''}`} role="img" aria-label={`On a scale from ${clientPrice(axis.low)} to ${clientPrice(axis.high)}: ${summary}.`}>
        <div className="fi-band" />
        <div className="fi-bar fi-bar-est" style={pctStyle(est)} />
        {altBar && <div className="fi-bar fi-bar-alt" style={pctStyle(altBar)} />}
        {guessBar && <div className="fi-bar fi-bar-guess" style={pctStyle(guessBar)} />}
        {target !== null && <div className="fi-mark fi-mark-target" style={{ left: `${at(axis, target)}%` }} />}
        {ask !== null && <div className="fi-mark fi-mark-ask" style={{ left: `${at(axis, ask)}%` }} />}
        {axis.ticks.map((t) => (
          <Fragment key={t.value}>
            <div className="fi-tick" style={{ left: `${t.left}%` }} />
            <div className={`fi-tick-label fi-tl-${t.align}`} style={{ left: `${t.left}%` }}>{t.label}</div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── The status tiles ────────────────────────────────────────────────────────

function Tiles({ ws, o, kind }: { ws: Workspace; o: EngineOutput; kind: ResultKind }) {
  const r = o.results[kind];
  const tiles = statusTiles(r, ws.sf);
  const ceiling = r.asks_vs_sold.ceiling;
  const ceilingComp = ceiling ? ws.comps.find((c) => c.id === ceiling.comp_id) : undefined;
  const BAND = { below: 'below the sold band', within: 'inside the sold band', above: 'above the sold band' } as const;
  return (
    <>
      <section className="fi-tiles" aria-label="By status">
        {tiles.map((t) => (
          <div key={t.status} className="fi-tile">
            <div className="fi-tile-name"><span className={`fi-sq fi-sq-${t.status}`} aria-hidden="true" />{t.name} <span className="fi-n">{t.n}</span></div>
            <div className="fi-tile-v">{t.value}{t.unit && <span className="fi-unit">{t.unit}</span>}</div>
          </div>
        ))}
      </section>
      {ceiling && (
        <p className="fi-ceiling">
          The lowest ask that didn’t sell, {ws.sf ? `${psf(ceiling.lowest.value)}/sq ft` : fig(ceiling.lowest)}{ceilingComp ? ` at ${compAddress(ceilingComp)}` : ''}, sits {BAND[ceiling.position]}
          {' '}({pct(ceiling.versus_sold_median_percent.value)} against the sold median): a ceiling on what buyers would pay.
        </p>
      )}
    </>
  );
}

// ─── The accordions ──────────────────────────────────────────────────────────

interface Item {
  key: string;
  title: string;
  sub: string;
  body: ReactNode;
}

function Accordions({ ws, o, kind, both }: { ws: Workspace; o: EngineOutput; kind: ResultKind; both: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const outById = useMemo(() => new Map<string, CompOut>(o.comps.map((c) => [c.id, c])), [o]);
  const counted = ws.comps.filter((c) => outById.get(c.id)?.per_result[kind].included);
  const target = ws.target?.price.value ?? null;
  const area = ws.intake.areaSqft?.value ?? null;
  const ask = ws.intake.askingPrice?.value ?? null;
  const timing = ws.dealTerms?.template === 'seller_pricing' ? ws.dealTerms.timing?.value ?? '' : '';
  const items: Item[] = [
    ...(ws.sf ? [{ key: 'pt', title: 'Price table', sub: area ? sqft(area) : '', body: <PriceTable ws={ws} r={o.results[kind]} /> }] : []),
    { key: 'cc', title: 'Comps that count', sub: String(counted.length), body: <CountingComps ws={ws} outById={outById} kind={kind} counted={counted} /> },
    { key: 'tp', title: 'Target price', sub: target ? clientPrice(target) : '—', body: <TargetSection ws={ws} /> },
    { key: 'pd', title: 'Pricing details', sub: ws.side === 'buyer' ? (ask ? `Asking ${clientPrice(ask)}` : '') : timing, body: <PricingDetails ws={ws} kind={kind} /> },
    { key: 'hw', title: 'How this was worked out', sub: o.gaps.length ? `${o.gaps.length} still needed` : '', body: <WorkedOut ws={ws} output={o} both={both} kind={kind} /> },
  ];
  return (
    <section className="fi-acc" aria-label="The details">
      {items.map((item, i) => {
        const isOpen = Boolean(open[item.key]);
        const id = `fi-acc-${item.key}`;
        return (
          <div key={item.key} className="fi-acc-item">
            <button type="button" className="fi-acc-head" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen({ ...open, [item.key]: !isOpen })}>
              <span className="fi-acc-n">{String(i + 3).padStart(2, '0')}</span>
              {item.title}
              {item.sub && <span className="fi-acc-sub">{item.sub}</span>}
              <span className="fi-acc-sign" aria-hidden="true">{isOpen ? '–' : '+'}</span>
            </button>
            {isOpen && <div className="fi-acc-body" id={id}>{item.body}</div>}
          </div>
        );
      })}
    </section>
  );
}

/** The price table, as in Frankie's email: the home at each $/sq ft step across the range (§6.5). With a size only. */
function PriceTable({ ws, r }: { ws: Workspace; r: Result }) {
  const t = r.price_table;
  if (!t) return <p className="fi-quiet">No price table yet{r.price_table_unavailable_because ? `: ${engineWhy(r.price_table_unavailable_because)}` : ''}.</p>;
  const byId = new Map(ws.comps.map((c) => [c.id, c]));
  return (
    <>
      <div className="fi-pt">
        {t.rows.map((row) => {
          const who = row.kind === 'comp' ? row.comp_ids.map((id) => (byId.get(id) ? compAddress(byId.get(id)!) : id)).join(', ') : row.kind === 'range_end' ? 'An end of your range' : '';
          return (
            <div key={`${row.kind}:${row.per_sqft.value}`} className={`fi-pt-cell fi-pt-${row.kind}`} title={who || undefined}>
              <span className="fi-pt-rate">{psf(row.per_sqft.value)} / sq ft</span>
              <span className="fi-pt-price" title={usd(row.price.value)}>{clientPrice(row.price.value)}</span>
            </div>
          );
        })}
      </div>
      <p className="fi-quiet">{t.basis}</p>
    </>
  );
}

/** The comps that count, with their notes: the lists the email uses. */
function CountingComps({ ws, outById, kind, counted }: { ws: Workspace; outById: Map<string, CompOut>; kind: ResultKind; counted: Workspace['comps'] }) {
  if (!counted.length) return <p className="fi-quiet">No comp counts yet: tier the closest sales 1st on Sort.</p>;
  const ordered = STATUS_ORDER.flatMap((s: ListingStatus) => counted.filter((c) => compStatus(c) === s));
  return (
    <div className="fi-cc">
      {ordered.map((c) => {
        const status = compStatus(c);
        const url = listingUrl(c);
        const price = compPrice(c);
        const rate = ws.sf ? rowPsf(c, outById.get(c.id)) : null;
        const note = noteOf(c.judgment);
        return (
          <div key={c.id} className="fi-cc-row">
            <span className={`fi-sq fi-sq-${status ?? 'unknown'}`} title={status ? STATUS_LABEL[status] : undefined} aria-label={status ? STATUS_LABEL[status] : undefined} />
            <span className="fi-thumb" aria-hidden="true" />
            <span className="fi-cc-info">
              <span className="fi-cc-name">
                {c.judgment?.anchor && <span className="fi-star" title="The closest comp">★</span>}
                <button type="button" className="fi-cc-addr" onClick={() => ws.go('sort')}>{compAddress(c)}</button>
                {url && <a className="fi-cc-link" href={url} target="_blank" rel="noreferrer noopener" aria-label={`${compAddress(c)} on StreetEasy`}>StreetEasy ↗</a>}
              </span>
              <span className="fi-cc-note">{note ?? 'No note yet. Edit to say why it’s here.'}</span>
            </span>
            <span className="fi-cc-price">
              {price.value !== null ? clientPrice(price.value) : '—'}
              {status !== 'sold' && price.value !== null && <span className="fi-cc-sub">{price.label}</span>}
              {rate !== null && <span className="fi-cc-sub">{psf(rate)} / SF</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── How this was worked out ─────────────────────────────────────────────────

function Row({ k, children, flag }: { k: string; children: ReactNode; flag?: boolean }) {
  return (
    <div className="fi-row">
      <span className="fi-k">{k}</span>
      <span className={flag ? 'fi-flag' : undefined}>{flag && <span className="fi-flag-sq" aria-hidden="true" />}{children}</span>
    </div>
  );
}

function WorkedOut({ ws, output, both, kind }: { ws: Workspace; output: EngineOutput; both: boolean; kind: ResultKind }) {
  const kinds = both ? KINDS : [kind];
  const byId = new Map(ws.comps.map((c) => [c.id, c]));
  const r = output.results[kind];
  const n = r.range?.comp_ids.length ?? 0;
  const size = ws.intake.areaSqft;
  const call = ws.call;
  const crossed = ws.comps.filter((c) => c.judgment?.tier === 'excluded').length;
  const second = ws.comps.filter((c) => c.judgment?.tier === 'secondary').length;
  const leftOut = [crossed ? `${crossed} comp${crossed === 1 ? '' : 's'} marked ✕` : '', second ? `${second} in the 2nd tier` : ''].filter(Boolean).join(', ');
  return (
    <div className="fi-rows">
      <Row k="Range from">{r.range ? `The ${n === 1 ? 'closest sale' : `${n} closest sales`}, 1st tier only` : `No range yet: ${engineWhy(r.range_unavailable_because ?? 'the analysis needs more to go on')}`}</Row>
      {ws.sf && size && (
        <Row k="Size" flag={Boolean(size.estimate)}>
          {sqft(size.value)}{size.estimate ? ', your estimate. Confirm with the floor plan' : size.from === 'listing' ? ', from StreetEasy' : ''}
        </Row>
      )}
      <Row k="Why your number" flag={!call?.note?.trim()}>
        {call?.note?.trim() ? 'Written at the gate' : call?.skipped ? 'You skipped your number' : 'Not written yet'}
      </Row>
      <Row k="Left out">{leftOut ? leftOut.charAt(0).toUpperCase() + leftOut.slice(1) : 'Nothing'}</Row>
      {kinds.map((k) => {
        const res = output.results[k];
        const considered = res.bridge.lines.filter((l) => l.status === 'considered_not_calculated');
        return (
          <Fragment key={k}>
            <Row k={both ? `Method · ${res.label}` : 'Method'}>
              {engineWhy(res.lead.label)}.
              {res.base && <> The base is {usd(res.base.value)}.</>}
              {res.range && <> The range, {usd(res.range.low.value)} – {usd(res.range.high.value)}, runs from the lowest to the highest price its {countWord(res.range.comp_ids.length)} 1st-tier sales imply.</>}
            </Row>
            {considered.length > 0 && (
              <Row k="Considered, not calculated">{considered.map((l) => l.name).join(', ')}. Each is weighed in choosing and sorting the comps; none moves a number.</Row>
            )}
            {res.sale_to_ask && <Row k="Sale against last ask">Median {pct(res.sale_to_ask.median.value)}, from {pct(res.sale_to_ask.min.value)} to {pct(res.sale_to_ask.max.value)}, across {res.sale_to_ask.n} sales.</Row>}
            {(res.carry.subject || res.carry.comp_median) && (
              <Row k="Monthly carry">The home {fig(res.carry.subject)}, the comps’ median {fig(res.carry.comp_median)}{res.carry.subject_vs_median_percent ? ` (${pct(res.carry.subject_vs_median_percent.value)})` : ''}.</Row>
            )}
          </Fragment>
        );
      })}
      {output.prices.filter((p) => p.kind === 'call').length > 0 && (
        <Row k="Your number">
          {output.prices.filter((p) => p.kind === 'call').map((p) => {
            const v = p.per_result[kind].vs_range;
            const which = p.label.replace('Your call, ', '');
            return `${which.charAt(0).toUpperCase()}${which.slice(1)} ${usd(p.price)}: ${v ? { below: 'below the range', within: 'inside the range', above: 'above the range' }[v.position] : 'no range to compare with'}`;
          }).join(' · ')}
        </Row>
      )}
      {kinds.map((k) => <Pairs key={`pairs:${k}`} ws={ws} r={output.results[k]} label={both ? output.results[k].label : null} />)}
      <div className="fi-sub">
        <span className="fi-sub-k">What the tool still needs</span>
        {output.gaps.length === 0 ? <p className="fi-quiet">Nothing.</p> : (
          <ul className="fi-plain">
            {output.gaps.map((g, i) => (
              <li key={i}>
                {g.message}{g.results.length === 1 ? <span className="fi-quiet-inline"> ({RESULT_WORDS[g.results[0]!]})</span> : null}
                {g.target === 'subject' && !ws.readOnly && <> <button type="button" className="link" onClick={() => ws.openStart('details')}>Fill it in</button></>}
                {g.target && g.target !== 'subject' && byId.get(g.target) && <span className="fi-quiet-inline"> — {compAddress(byId.get(g.target)!)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {output.warnings.length > 0 && (
        <div className="fi-sub">
          <span className="fi-sub-k">Warnings</span>
          <ul className="fi-plain">
            {output.warnings.map((w, i) => (
              <li key={i}>{w.message}{w.comp_ids.length > 0 && <span className="fi-quiet-inline"> — {w.comp_ids.map((id) => (byId.get(id) ? compAddress(byId.get(id)!) : id)).join('; ')}</span>}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="fi-quiet">
        Analysis date {output.meta.as_of} · engine {output.meta.engine_version} · house method {output.meta.house_method.version}
        {output.meta.house_method.all_null ? ' (no adjustment values set: every factor is considered, not calculated)' : ''}.
      </p>
    </div>
  );
}

/** How the comps differ from each other (§6.6): what clean pairs show, then every pair. Evidence only: none moves a number. */
function Pairs({ ws, r, label }: { ws: Workspace; r: Result; label: string | null }) {
  const p = r.pairs;
  if (!p.pairs.length) return null;
  const byId = new Map(ws.comps.map((c) => [c.id, c]));
  const name = (id: string) => (byId.get(id) ? compAddress(byId.get(id)!) : id);
  const gaps = (x: PairOut) => {
    const parts: string[] = [];
    if (x.price_per_sqft_gap && ws.sf) parts.push(`${psf(x.price_per_sqft_gap.value)}/sq ft more`);
    const g = x.price_gap.value;
    parts.push(g === 0 ? 'the same price' : `${usd(Math.abs(g))} ${g > 0 ? 'more' : 'less'} in price`);
    if (x.months_apart) parts.push(`${x.months_apart} month${x.months_apart === 1 ? '' : 's'} apart`);
    return parts.join(', ');
  };
  return (
    <div className="fi-sub">
      <span className="fi-sub-k">How the comps differ from each other{label ? ` · ${label}` : ''}</span>
      {p.clean_pair_evidence.length > 0
        ? <ul className="fi-plain">{p.clean_pair_evidence.map((e) => <li key={`${e.evidence_class}:${e.key}`}>{e.summary}</li>)}</ul>
        : <p className="fi-quiet">No clean pairs yet: every pair differs in more than one factor, so none shows what one factor is worth here.</p>}
      <details className="fi-pairs">
        <summary>All {p.pairs.length} pair{p.pairs.length === 1 ? '' : 's'}</summary>
        <ul className="fi-plain">
          {p.pairs.map((x) => (
            <li key={`${x.evidence_class}:${x.higher}:${x.lower}`}>
              <strong>{name(x.higher)}</strong> over {name(x.lower)} <span className="fi-quiet-inline">({STATUS_LABEL[x.evidence_class]})</span>: {gaps(x)}.{' '}
              <span className="fi-quiet-inline">{x.clean && x.isolates ? `Clean: only ${x.isolates.name.toLowerCase()} differs.` : x.not_clean_because ? `${x.not_clean_because}.` : ''}</span>
            </li>
          ))}
        </ul>
        <p className="fi-quiet">{p.note}</p>
      </details>
    </div>
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
            {r.range ? rangeWords(r.range.low.value, r.range.high.value) : 'no range yet'}
          </span>
        );
      })}
      <button type="button" className="link small" onClick={() => ws.go('findings')}>Findings</button>
    </div>
  );
}
