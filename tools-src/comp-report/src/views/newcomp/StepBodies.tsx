// The New comp window's step bodies (design pass, new-comp.md §3, 2026-11-11): Basics, General, Own or
// shared, Home amenities, Building amenities, Client info and Add comps. Everything saves as it's typed, into
// the same intake, brief, target and deal terms as before, so nothing downstream changes. Nothing is picked
// by default: None is a choice the agent clicks, a blank means nobody said (Kimani, 2026-11-11). A lavender
// dot after a field's label marks what came from StreetEasy.
import { useEffect, useId, useState, type ReactNode } from 'react';
import type { LaundryState, PropertyType as EngineType } from '../../../engine/index.ts';
import { withBuyerFinance } from '../../../workspace/client.ts';
import { fairHousingFindings } from '../../../workspace/fair-housing.ts';
import { groupsFor, withHomeFeatures, type FeatureKey, type Features } from '../../../workspace/features.ts';
import { buildingLaundryOf, withBuildingLaundry, BUILDING_LAUNDRY_LABEL } from '../../../workspace/home-notes.ts';
import { BUILDING_LAUNDRY, type BuildingLaundry, type ClientFacts, type ClientPace, type Entry, type HomeKind, type Intake } from '../../../workspace/state.ts';
import { readPrice } from '../comp/CompForm.tsx';
import { AddBar } from '../comp/AddBar.tsx';
import { AddList, GUIDANCE, ImportNotes } from '../workspace/AddComps.tsx';
import { entry } from '../workspace/bits.tsx';
import type { Workspace } from '../workspace/model.ts';
import { ReadingNotice } from '../workspace/ReadingNotice.tsx';
import { inFlight } from '../workspace/reads.ts';
import { Info } from './Frame.tsx';
import { TARGET_TIP, targetText } from './Home.tsx';
import { NrNumber } from './inputs.tsx';

/** The lavender dot after a label: this came from its StreetEasy page. */
export function Dot({ on }: { on: boolean | undefined }) {
  return on ? <span className="nc-dot" title="From its StreetEasy page" aria-label="from its StreetEasy page" /> : null;
}

const fromPage = (e: { from?: string } | undefined | null) => e?.from === 'listing';

/** A row of chips: one choice (again clears it) or several. `none` clears the others, and any other clears it. */
function ChipRow({ label, hint, options, value, onChange, single, dot, disabled, extra }: {
  label: string;
  hint?: string;
  options: readonly { value: string; label: string }[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  single?: boolean;
  dot?: boolean;
  disabled?: boolean;
  extra?: ReactNode;
}) {
  const click = (v: string) => {
    const on = value.includes(v);
    if (single || v === 'none') return onChange(on ? [] : [v]);
    onChange(on ? value.filter((x) => x !== v) : [...value.filter((x) => x !== 'none'), v]);
  };
  return (
    <div className="nc-row" role="group" aria-label={label}>
      <span className="nc-row-k">
        <span className="nc-k">{label}<Dot on={dot} /></span>
        {hint && <span className="nc-row-hint">{hint}</span>}
      </span>
      <span className="nc-chips">
        {options.map((o) => (
          <button key={o.value} type="button" className={`nc-chip${value.includes(o.value) ? ' on' : ''}`} aria-pressed={value.includes(o.value)} disabled={disabled} onClick={() => click(o.value)}>
            {o.label}
          </button>
        ))}
        {extra}
      </span>
    </div>
  );
}

const opts = (labels: readonly string[]) => labels.map((l) => ({ value: l, label: l }));

/** The pickers' type for the home: its kind where it has one (a house has no concierge), else the report's. */
function pickerType(ws: Workspace): EngineType {
  const kind = ws.intake.kind?.value;
  if (!kind) return ws.propertyType;
  return kind === 'house' ? 'townhouse' : (kind as EngineType);
}

function useIntake(ws: Workspace) {
  const set = <K extends keyof Intake>(key: K, value: Intake[K] | undefined) => {
    const next = { ...ws.intake };
    if (value === undefined) delete next[key];
    else next[key] = value;
    ws.setIntake(next);
  };
  const setFeatures = (f: Features) => {
    const next = withHomeFeatures(ws.intake, f, ws.today);
    if (!next.outdoorKind || next.outdoorKind.value === 'none') delete next.outdoorSqft;
    ws.setIntake(next);
  };
  return { set, setFeatures };
}

/** A feature group as a chip row, if it applies to the home's kind. */
function FeatureRow({ ws, group, label, hint, without = [], none }: { ws: Workspace; group: FeatureKey; label?: string; hint?: string; without?: string[]; none?: { on: boolean; set: (on: boolean) => void } }) {
  const { setFeatures } = useIntake(ws);
  const g = groupsFor(pickerType(ws)).find((x) => x.key === group);
  if (!g) return null;
  const feats = ws.homeFeatures;
  const value = feats[group] ?? [];
  const shown = g.options.filter((o) => !without.includes(o));
  const options = [...(none ? [{ value: 'none', label: 'None' }] : []), ...opts(shown)];
  const buildingKey = group === 'building' || group === 'wellness' || group === 'shared_outdoor';
  return (
    <ChipRow
      label={label ?? g.label}
      hint={hint}
      options={options}
      value={none?.on ? ['none'] : value}
      single={g.single}
      dot={value.length > 0 && fromPage(buildingKey ? ws.intake.building : group === 'policies' ? ws.intake.policies : group === 'views' ? ws.intake.views : group === 'outdoor' ? ws.intake.outdoorKind : undefined)}
      disabled={ws.readOnly}
      onChange={(next) => {
        if (none) {
          const wantsNone = next.includes('none');
          if (wantsNone !== none.on) {
            if (wantsNone) {
              setFeatures({ ...feats, [group]: [] });
              none.set(true);
              return;
            }
            none.set(false);
          }
        }
        // Options this row doesn't show (the building's laundry, under its own step) stay as they were.
        const hidden = value.filter((o) => without.includes(o));
        setFeatures({ ...feats, [group]: [...next.filter((o) => o !== 'none'), ...hidden] });
      }}
    />
  );
}

function YesNoRow({ ws, k, label }: { ws: Workspace; k: 'dishwasher' | 'centralAir' | 'fireplace'; label: string }) {
  const { set } = useIntake(ws);
  const v = ws.intake[k];
  return (
    <ChipRow
      label={label}
      options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
      value={v === undefined ? [] : [v.value ? 'yes' : 'no']}
      single
      dot={fromPage(v)}
      disabled={ws.readOnly}
      onChange={(next) => set(k, next[0] ? entry(next[0] === 'yes', ws.today) : undefined)}
    />
  );
}

// ─── 1 · Basics ─────────────────────────────────────────────────────────────

const ALT_KINDS: { kind: HomeKind; label: string }[] = [
  { kind: 'condop', label: 'Condop' }, { kind: 'townhouse', label: 'Townhouse' }, { kind: 'house', label: 'House' }, { kind: 'multi_family', label: 'Multi-family' },
];

export function BasicsStep({ ws, typeFromPage }: { ws: Workspace; typeFromPage: boolean }) {
  const ids = useId();
  const { set } = useIntake(ws);
  const off = ws.readOnly;
  const kind = ws.intake.kind?.value;
  const alt = ALT_KINDS.some((a) => a.kind === kind);
  const buyer = ws.side === 'buyer';
  const [target, setTarget] = useState(() => targetText(ws.target?.price.value));
  useEffect(() => {
    if (readPrice(target) !== (ws.target?.price.value ?? null)) setTarget(targetText(ws.target?.price.value));
  }, [ws.target?.price.value]);
  const price = readPrice(target);
  const bad = target.trim() !== '' && price === null;
  const onTarget = (v: string) => {
    setTarget(v);
    if (!v.trim()) {
      if (ws.target) ws.setTarget(null);
      return;
    }
    const n = readPrice(v);
    if (n !== null && n !== ws.target?.price.value) ws.setTarget({ ...(ws.target ?? {}), price: entry(n, ws.today) });
  };
  const setClient = (v: string) => {
    const b = { ...ws.brief };
    if (v.trim()) b.clientName = entry(v, ws.today);
    else delete b.clientName;
    ws.setBrief(b);
  };
  return (
    <div className="nc-basics">
      <div className="nc-basics-top">
        <div className="nc-field">
          <span className="nc-k" id={`${ids}-side`}>Client type</span>
          <div className="nc-seg" role="group" aria-labelledby={`${ids}-side`}>
            {(['buyer', 'seller'] as const).map((a) => (
              <button key={a} type="button" aria-pressed={ws.side === a} className={ws.side === a ? 'on' : ''} disabled={off} onClick={() => ws.setBrief({ ...ws.brief, audience: entry(a, ws.today) })}>
                {a === 'buyer' ? 'Buyer' : 'Seller'}
              </button>
            ))}
          </div>
        </div>
        <div className="nc-field">
          <span className="nc-k" id={`${ids}-type`}>
            Property type<Dot on={typeFromPage} />
            {alt && <span className="nc-k-note"> · priced as a co-op or a condo?</span>}
          </span>
          <div className="nc-type">
            <div className="nc-seg" role="group" aria-label="Co-op or condo">
              {(['coop', 'condo'] as const).map((t) => (
                <button key={t} type="button" aria-pressed={ws.propertyType === t} className={ws.propertyType === t ? 'on' : ''} disabled={off} onClick={() => ws.setPropertyType(t)}>
                  {t === 'coop' ? 'Co-op' : 'Condo'}
                </button>
              ))}
            </div>
            {ALT_KINDS.map((a) => (
              <button
                key={a.kind}
                type="button"
                className={`nc-alt${kind === a.kind ? ' on' : ''}`}
                aria-pressed={kind === a.kind}
                disabled={off}
                title="A label for the home. Co-op or Condo stays the pricing basis."
                onClick={() => set('kind', kind === a.kind ? undefined : entry(a.kind, ws.today))}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="nc-grid2">
        <label className="nc-field">
          <span className="nc-k">Client name(s)</span>
          <input className="nc-input" value={ws.brief.clientName?.value ?? ''} disabled={off} maxLength={120} placeholder="Optional" onChange={(e) => setClient(e.target.value)} />
        </label>
        <div className="nc-field">
          <span className="nc-k nc-k-line">
            <label htmlFor={`${ids}-target`}>{buyer ? 'Their budget' : 'Their target price'}</label>
            <Info label={buyer ? 'About the budget' : 'About the target price'} text={TARGET_TIP} />
          </span>
          <input
            id={`${ids}-target`}
            className="nc-input"
            inputMode="decimal"
            value={target}
            disabled={off}
            placeholder={buyer ? '$ 4,000,000 · optional' : '$ 4,250,000 · optional'}
            aria-invalid={bad || undefined}
            onChange={(e) => onTarget(e.target.value)}
            onBlur={() => price && setTarget(targetText(price))}
          />
          {bad && <span className="nc-err" role="alert">The price reads as $4,250,000 or 4.25M.</span>}
        </div>
      </div>
    </div>
  );
}

// ─── 2 · General ────────────────────────────────────────────────────────────

export function GeneralStep({ ws }: { ws: Workspace }) {
  const { set } = useIntake(ws);
  const { intake, today, readOnly: off } = ws;
  const coop = ws.propertyType === 'coop';
  const size = intake.areaSqft;
  const home = ws.reads.filter((r) => r.purpose === 'subject').at(-1) ?? null;
  // The page was read and gave no size: what's typed is the agent's estimate, unless they say otherwise.
  const readGaveNoSize = home?.status === 'done' && !size;
  const [estimateNext, setEstimateNext] = useState(readGaveNoSize);
  const estimateOn = size ? Boolean(size.estimate) : estimateNext;
  const toggleEstimate = () => {
    if (!size) return setEstimateNext((e) => !e);
    const { estimate, from: _from, ...rest } = size;
    set('areaSqft', estimate ? rest : { ...rest, estimate: true });
  };
  const num = (key: keyof Intake) => (v: Entry<number> | undefined) => set(key, v as never);
  const small = (key: 'beds' | 'baths' | 'rooms' | 'floor', label: string, integer = true) => (
    <label className="nc-field" key={key}>
      <span className="nc-k">{label}<Dot on={fromPage(intake[key])} /></span>
      <NrNumber className="nc-big" label={label} value={intake[key]} onChange={num(key)} today={today} disabled={off} placeholder="—" integer={integer} plain={key === 'floor'} />
    </label>
  );
  const money = (key: 'askingPrice' | 'commonCharges' | 'taxes', label: string) => (
    <label className="nc-field" key={key}>
      <span className="nc-k">{label}<Dot on={fromPage(intake[key])} /></span>
      <NrNumber className="nc-mid" label={label} value={intake[key]} onChange={num(key)} today={today} disabled={off} placeholder="—" prefix="$" />
    </label>
  );
  return (
    <div className="nc-general">
      <div className="nc-field nc-size">
        <span className="nc-k">
          Interior size<Dot on={fromPage(size)} />
          <span className="nc-k-note"> {coop ? '(co-ops are priced without per-SF figures)' : size ? '' : '(without it, no per-SF figures)'}</span>
        </span>
        <span className="nc-size-line">
          <NrNumber className="nc-big" label="Interior size in square feet" value={size} onChange={num('areaSqft')} today={today} disabled={off} placeholder="0" {...(size ? {} : { estimate: estimateNext })} />
          <span className="nc-unit">sq ft</span>
          <button type="button" className={`nc-chip${estimateOn ? ' on' : ''}`} aria-pressed={estimateOn} disabled={off} title="Your estimate counts in “with estimates” only, and the email says so." onClick={toggleEstimate}>
            {estimateOn ? '✓ Estimate' : 'Estimate'}
          </button>
        </span>
      </div>
      <div className="nc-grid4">
        {small('beds', 'Beds')}
        {small('baths', 'Baths', false)}
        {small('rooms', 'Rooms', false)}
        {small('floor', 'Floor')}
      </div>
      <div className="nc-grid3">
        {money('askingPrice', 'Asking price')}
        {money('commonCharges', coop ? 'Maintenance / mo' : 'Common charges / mo')}
        {money('taxes', 'Taxes / mo')}
      </div>
    </div>
  );
}

// ─── 3 · Own or shared ──────────────────────────────────────────────────────

const HOME_LAUNDRY: { value: LaundryState; label: string }[] = [
  { value: 'installed', label: 'In the unit' },
  { value: 'permitted', label: 'Allowed, not installed' },
  // None in the unit, not known if allowed: "Not allowed" (prohibited), stored before, reads as None here.
  { value: 'none_listed', label: 'None' },
];

export function SharedStep({ ws }: { ws: Workspace }) {
  const { set } = useIntake(ws);
  const { intake, today, readOnly: off } = ws;
  const laundry = intake.laundry?.value;
  const bLaundry = buildingLaundryOf(intake);
  const apartment = groupsFor(pickerType(ws)).some((g) => g.key === 'shared_outdoor');
  const priv = ws.homeFeatures.outdoor?.[0];
  return (
    <div className="nc-rows">
      <span className="nc-row-head">Laundry</span>
      <ChipRow
        label="The home’s own"
        options={HOME_LAUNDRY}
        value={laundry ? [laundry === 'prohibited' ? 'none_listed' : laundry] : []}
        single
        dot={fromPage(intake.laundry)}
        disabled={off}
        onChange={(next) => set('laundry', next[0] ? entry(next[0] as LaundryState, today) : undefined)}
      />
      {apartment && (
        <ChipRow
          label="The building’s"
          options={BUILDING_LAUNDRY.map((v) => ({ value: v, label: BUILDING_LAUNDRY_LABEL[v] }))}
          value={bLaundry ? [bLaundry.value] : []}
          single
          dot={fromPage(bLaundry)}
          disabled={off}
          onChange={(next) => ws.setIntake(withBuildingLaundry(intake, next[0] as BuildingLaundry | undefined, today))}
        />
      )}
      <span className="nc-row-head">Outdoor space</span>
      <FeatureRow ws={ws} group="outdoor" label="The home’s own" />
      {priv && priv !== 'None' && (
        <div className="nc-row">
          <span className="nc-row-k"><span className="nc-k">Its size<Dot on={fromPage(intake.outdoorSqft)} /></span><span className="nc-row-hint">sq ft, if known</span></span>
          <span className="nc-chips">
            <NrNumber className="nc-mid" label="Outdoor size in square feet" value={intake.outdoorSqft} onChange={(v) => set('outdoorSqft', v)} today={today} disabled={off} placeholder="—" suffix="sq ft" />
          </span>
        </div>
      )}
      {apartment && (
        <FeatureRow
          ws={ws}
          group="shared_outdoor"
          label="The building’s"
          none={{ on: intake.noSharedOutdoor?.value === true, set: (on) => set('noSharedOutdoor', on ? entry(true, today) : undefined) }}
        />
      )}
    </div>
  );
}

// ─── 4 · Home amenities ─────────────────────────────────────────────────────

export function AmenitiesStep({ ws }: { ws: Workspace }) {
  return (
    <div className="nc-rows">
      <FeatureRow ws={ws} group="condition" label="Condition" />
      <FeatureRow ws={ws} group="views" />
      <FeatureRow ws={ws} group="exposure" />
      <FeatureRow ws={ws} group="corner" />
      <YesNoRow ws={ws} k="dishwasher" label="Dishwasher" />
      <YesNoRow ws={ws} k="centralAir" label="Central air" />
      <YesNoRow ws={ws} k="fireplace" label="Working fireplace" />
    </div>
  );
}

// ─── 5 · Building amenities ─────────────────────────────────────────────────

export function BuildingStep({ ws }: { ws: Workspace }) {
  const { set } = useIntake(ws);
  const { intake, today, readOnly: off } = ws;
  return (
    <div className="nc-rows">
      <label className="nc-row">
        <span className="nc-row-k"><span className="nc-k">Neighborhood<Dot on={fromPage(intake.neighborhood)} /></span></span>
        <span className="nc-chips">
          <input className="nc-input nc-input-short" value={intake.neighborhood?.value ?? ''} disabled={off} maxLength={80} placeholder="—" onChange={(e) => set('neighborhood', e.target.value.trim() ? entry(e.target.value, today) : undefined)} />
        </span>
      </label>
      <label className="nc-row">
        <span className="nc-row-k"><span className="nc-k">Year built<Dot on={fromPage(intake.yearBuilt)} /></span></span>
        <span className="nc-chips">
          <NrNumber className="nc-mid" label="Year built" value={intake.yearBuilt} onChange={(v) => set('yearBuilt', v)} today={today} disabled={off} placeholder="—" plain />
        </span>
      </label>
      <ChipRow
        label="New development"
        options={[{ value: 'resale', label: 'Resale' }, { value: 'new', label: 'New development' }]}
        value={intake.newDevelopment === undefined ? [] : [intake.newDevelopment.value ? 'new' : 'resale']}
        single
        dot={fromPage(intake.newDevelopment)}
        disabled={off}
        onChange={(next) => set('newDevelopment', next[0] ? entry(next[0] === 'new', today) : undefined)}
      />
      {/* The building's laundry is on Own or shared: it's kept here as it is. */}
      <FeatureRow ws={ws} group="building" without={['Laundry in building']} />
      <FeatureRow ws={ws} group="wellness" />
      <FeatureRow ws={ws} group="policies" />
    </div>
  );
}

// ─── 6 · Client info ────────────────────────────────────────────────────────

const PACE_WORDS: Record<'buyer' | 'seller', Record<ClientPace, string>> = {
  buyer: { asap: 'Ready to buy now', can_wait: 'Can wait for the right one' },
  seller: { asap: 'Needs to sell soon', can_wait: 'Can wait for the right price' },
};

export function ClientStep({ ws }: { ws: Workspace }) {
  const { today, readOnly: off, side } = ws;
  const client = ws.brief.client ?? {};
  const terms = ws.dealTerms;
  const setClient = (next: ClientFacts) => {
    const brief = { ...ws.brief };
    if (Object.keys(next).length) brief.client = next;
    else delete brief.client;
    ws.setBrief(brief);
  };
  const setPace = (pace: ClientPace | undefined) => {
    const { pace: _drop, ...urgency } = client.urgency ?? {};
    const nextUrgency = pace ? { ...urgency, pace: entry(pace, today) } : urgency;
    const { urgency: _u, ...rest } = client;
    setClient(Object.keys(nextUrgency).length ? { ...rest, urgency: nextUrgency } : rest);
  };
  const setMotivations = (v: Entry<string> | undefined) => {
    const { motivations: _m, ...rest } = client;
    setClient(v ? { ...rest, motivations: v } : rest);
  };
  const otherTemplate = side === 'buyer' && terms?.template === 'seller_pricing';
  const buyer = terms?.template === 'buyer_traditional' ? terms : null;
  const cash = buyer?.financing?.value === 'cash';
  const yes = buyer?.preApproved?.value === true;
  const finance = (change: Parameters<typeof withBuyerFinance>[1]) => ws.setDealTerms(withBuyerFinance(terms, change));
  return (
    <div className="nc-rows">
      {side === 'buyer' && !otherTemplate && (
        <>
          <ChipRow
            label="Financing"
            options={[{ value: 'mortgage', label: 'Mortgage' }, { value: 'cash', label: 'All cash' }]}
            value={buyer?.financing ? [buyer.financing.value] : []}
            single
            disabled={off}
            onChange={(next) => finance({ financing: next[0] ? entry(next[0] as 'cash' | 'mortgage', today) : undefined })}
          />
          {!cash && (
            <ChipRow
              label="Pre-approved"
              options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not yet' }]}
              value={buyer?.preApproved ? [buyer.preApproved.value ? 'yes' : 'no'] : []}
              single
              disabled={off}
              onChange={(next) => finance({ preApproved: next[0] ? entry(next[0] === 'yes', today) : undefined })}
              extra={yes ? (
                <span className="nc-inline">
                  <NrNumber className="nc-mid" label="Pre-approved for how much" value={buyer?.preApprovalAmount} onChange={(v) => finance({ preApprovalAmount: v })} today={today} disabled={off} placeholder="For how much? $" prefix="$" />
                </span>
              ) : null}
            />
          )}
        </>
      )}
      {otherTemplate && (
        <p className="nc-note">
          This buyer’s report holds a seller’s terms, so there’s no pre-approval to give yet.{' '}
          {!off && <button type="button" className="link" onClick={() => ws.setDealTerms({ template: 'buyer_traditional' })}>Use buyer’s terms</button>}
        </p>
      )}
      <ChipRow
        label="How soon"
        options={(['asap', 'can_wait'] as const).map((p) => ({ value: p, label: PACE_WORDS[side][p] }))}
        value={client.urgency?.pace ? [client.urgency.pace.value] : []}
        single
        disabled={off}
        onChange={(next) => setPace(next[0] as ClientPace | undefined)}
      />
      <ScreenedRow
        label="What’s moving them"
        value={client.motivations}
        onChange={setMotivations}
        today={today}
        disabled={off}
        placeholder={side === 'buyer' ? 'e.g. Lease ends in March' : 'e.g. Relocating for work'}
        max={500}
      />
    </div>
  );
}

/** A hard fair-housing term found in the text: it isn't saved, and the field says why (§8.6). */
export function hardTerm(text: string) {
  return fairHousingFindings(text).find((f) => f.level === 'hard') ?? null;
}

function ScreenedRow({ label, value, onChange, today, disabled, placeholder, max }: {
  label: string;
  value: Entry<string> | undefined;
  onChange: (next: Entry<string> | undefined) => void;
  today: string;
  disabled?: boolean;
  placeholder: string;
  max: number;
}) {
  const [text, setText] = useState(value?.value ?? '');
  useEffect(() => {
    if ((value?.value ?? '') !== text && !hardTerm(text)) setText(value?.value ?? '');
  }, [value?.value]);
  const hard = hardTerm(text);
  return (
    <label className="nc-row">
      <span className="nc-row-k"><span className="nc-k">{label}</span></span>
      <span className="nc-chips nc-col">
        <input
          className="nc-input"
          value={text}
          maxLength={max}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={hard ? true : undefined}
          onChange={(e) => {
            setText(e.target.value);
            if (!hardTerm(e.target.value)) onChange(e.target.value.trim() ? entry(e.target.value, today) : undefined);
          }}
        />
        {hard && <span className="nc-err" role="alert">“{hard.term}” can’t be saved: it reads as a preference on {hard.basis} (fair housing).</span>}
      </span>
    </label>
  );
}

// ─── 7 · Add comps (a stand-in: today's step, as it is) ─────────────────────

export function CompsStep({ ws, note, onNote }: { ws: Workspace; note: string | null; onNote: (n: string | null) => void }) {
  const readingNow = inFlight(ws.reads.filter((r) => r.purpose === 'comp'));
  return (
    <div className="nc-comps">
      <div className="nc-k-line nc-comps-guide">
        <span className="nc-row-hint">How to choose: {GUIDANCE}</span>
        <Info align="left" label="How to choose comps" text={`${GUIDANCE} About three of each status, where there are that many.`} />
      </div>
      {ws.readOnly ? <p className="nc-note">Read only: this is another agent’s report.</p> : <AddBar ws={ws} note={note} onNote={onNote} />}
      <ReadingNotice reads={readingNow} what="comps" />
      <AddList ws={ws} />
      <ImportNotes ws={ws} />
    </div>
  );
}

// ─── Notes, every step but Basics ───────────────────────────────────────────

export function StepNotes({ ws, where, hint, placeholder }: { ws: Workspace; where: keyof Intake | 'client'; hint: string; placeholder: string }) {
  const id = useId();
  const client = where === 'client';
  const current = client ? ws.brief.client?.notes : (ws.intake[where] as Entry<string> | undefined);
  const [text, setText] = useState(current?.value ?? '');
  useEffect(() => {
    if ((current?.value ?? '') !== text && !hardTerm(text)) setText(current?.value ?? '');
  }, [current?.value]);
  const hard = client ? hardTerm(text) : null;
  const save = (v: string) => {
    const e = v.trim() ? entry(v, ws.today) : undefined;
    if (client) {
      const next = { ...(ws.brief.client ?? {}) };
      if (e) next.notes = e;
      else delete next.notes;
      const brief = { ...ws.brief };
      if (Object.keys(next).length) brief.client = next;
      else delete brief.client;
      ws.setBrief(brief);
      return;
    }
    const next = { ...ws.intake };
    if (e) (next as Record<string, unknown>)[where] = e;
    else delete next[where];
    ws.setIntake(next);
  };
  return (
    <div className="nc-notes">
      <label className="nc-k" htmlFor={id}>Notes <span className="nc-k-note">· {hint}</span></label>
      <textarea
        id={id}
        rows={2}
        value={text}
        disabled={ws.readOnly}
        maxLength={client ? 2000 : 4000}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          if (!(client && hardTerm(e.target.value))) save(e.target.value);
        }}
      />
      {hard && <span className="nc-err" role="alert">“{hard.term}” can’t be saved: it reads as a preference on {hard.basis} (fair housing).</span>}
    </div>
  );
}

