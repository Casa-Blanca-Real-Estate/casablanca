// New report, 2 of 3: the details (the handoff, screen 04), reused as Edit
// details from a workspace's ✎. The address and where it came from; Buyer or
// Seller, Co-op or Condo and the client on one line; General (the size, with
// Estimate, or "Not listed": a co-op with no size is the normal case, and then
// nothing in the report shows a per-SF figure; beds, baths, floor, the ask, the
// charges and taxes); About the home (the five pickers and Year built); Notes.
// The engine's other facts fold away under "More about the home", so nothing
// it reads is dropped. Everything saves as it's typed.
//
// Dispatch 20: with no read of the home, the size is a plain field (the
// Estimate toggle beside it); "Not listed" only after a read that gave none.
// The page's type, when it isn't the report's, with a one-tap switch (NW-011);
// rooms and the neighborhood; the pickers that apply to the home's kind.
import { useMemo, useState, type ReactNode } from 'react';
import { compRecordFromListing, type LaundryState, type PropertyType } from '../../../engine/index.ts';
import { typeFromListing, withHomeFeatures, type Features } from '../../../workspace/features.ts';
import type { Entry, Intake } from '../../../workspace/state.ts';
import { FeaturePicker } from '../comp/Pickers.tsx';
import { entry } from '../workspace/bits.tsx';
import type { Workspace } from '../workspace/model.ts';
import { Info } from './Frame.tsx';
import { TYPE_LABEL } from './Home.tsx';
import { NrNumber } from './inputs.tsx';

const LAUNDRY: { value: LaundryState; label: string }[] = [
  { value: 'installed', label: 'Washer/dryer in the unit' },
  { value: 'permitted', label: 'Allowed, none installed' },
  { value: 'prohibited', label: 'Not allowed' },
  { value: 'none_listed', label: 'None in the unit (not known if allowed)' },
];

type NumberKey = 'areaSqft' | 'beds' | 'baths' | 'rooms' | 'floor' | 'askingPrice' | 'commonCharges' | 'taxes' | 'outdoorSqft' | 'yearBuilt';

export const NOTES_TIP = 'What someone would notice walking through that the facts don’t say: light, views, layout, condition, noise, storage. Hubert reads it. Your client never sees it.';

/** The pickers' type for the home: its kind label where the read gave one (a house has no concierge), else the report's type. */
function pickerType(kind: string | undefined, reportType: 'condo' | 'coop'): PropertyType {
  if (!kind) return reportType;
  return kind === 'house' ? 'townhouse' : (kind as PropertyType);
}
type YesNoKey = 'dishwasher' | 'centralAir' | 'fireplace' | 'corner';

export function HomeDetails({ ws, notices }: { ws: Workspace; notices?: ReactNode }) {
  const { intake, today, readOnly: off } = ws;
  const [sizeOpen, setSizeOpen] = useState(false);
  const set = <K extends keyof Intake>(key: K, value: Intake[K] | undefined) => {
    const next = { ...ws.intake };
    if (value === undefined) delete next[key];
    else next[key] = value;
    ws.setIntake(next);
  };
  const num = (key: NumberKey) => (v: Entry<number> | undefined) => set(key, v);
  const coop = ws.propertyType === 'coop';
  const size = intake.areaSqft;
  const home = ws.reads.filter((r) => r.purpose === 'subject').at(-1) ?? null;
  // "Not listed" only when the home's page was read and gave no size (NW-006); typed in, the size is a plain field.
  const readGaveNoSize = home?.status === 'done' && !size;
  const showSize = Boolean(size) || sizeOpen || !readGaveNoSize;
  const fromPage = (Object.values(intake) as ({ from?: string } | undefined)[]).filter((v) => v?.from === 'listing').length;
  // The page's type (NW-011): never written over the report's, offered as a switch when it differs.
  const pageType = useMemo(() => {
    if (!home || home.status !== 'done' || !home.extract) return null;
    try {
      return typeFromListing(compRecordFromListing(home.extract, { as_of: home.asOf ?? today, url: home.url }).record);
    } catch {
      return null;
    }
  }, [home?.id, home?.status]);
  const switchTo = pageType?.asReportType && pageType.asReportType !== ws.propertyType ? pageType.asReportType : null;

  const setFeatures = (f: Features) => {
    const next = withHomeFeatures(ws.intake, f, today);
    // No outdoor space, no outdoor size.
    if (!next.outdoorKind || next.outdoorKind.value === 'none') delete next.outdoorSqft;
    ws.setIntake(next);
  };
  // With no size yet, the toggle marks the next value typed as an estimate.
  const [estimateNext, setEstimateNext] = useState(false);
  const toggleEstimate = () => {
    if (!size) return setEstimateNext((e) => !e);
    const { estimate, from: _from, ...rest } = size;
    set('areaSqft', estimate ? rest : { ...rest, estimate: true });
  };
  const setClient = (v: string) => {
    const next = { ...ws.brief };
    if (v.trim()) next.clientName = entry(v, today);
    else delete next.clientName;
    ws.setBrief(next);
  };

  const tile = (key: 'floor' | 'askingPrice' | 'commonCharges' | 'taxes', label: string, opts: { money?: boolean; monthly?: boolean } = {}) => (
    <label className="nr-tile">
      <span className="fh">{label}</span>
      <span className="nr-tile-line">
        <NrNumber
          label={label}
          value={intake[key]}
          onChange={num(key)}
          today={today}
          disabled={off}
          placeholder="—"
          plain={key === 'floor'}
          {...(opts.money ? { prefix: '$' } : {})}
          {...(opts.monthly ? { suffix: '/ mo' } : {})}
        />
        <span className="nr-pen" aria-hidden="true"><span>✎</span></span>
      </span>
    </label>
  );

  const moreFilled = (['laundry', 'dishwasher', 'centralAir', 'fireplace', 'corner', 'newDevelopment', 'outdoorSqft'] as const)
    .filter((k) => intake[k] !== undefined).length;
  const hasOutdoor = Boolean(intake.outdoorKind && intake.outdoorKind.value !== 'none');

  return (
    <>
      <div className="nr-titlebar">
        <h2 className="nr-h">{ws.report.title}</h2>
        {home && home.status !== 'failed' && (
          <span
            className="nr-source"
            title={fromPage ? `${fromPage} detail${fromPage === 1 ? '' : 's'} came from its StreetEasy page. Check them: anything you change is yours.` : 'Read from its StreetEasy page'}
          >
            <span className="nr-dot" aria-hidden="true" />StreetEasy
          </span>
        )}
      </div>
      {notices}
      {switchTo && (
        <div className="nr-note nr-type-note" role="status">
          <span>Its StreetEasy page says {pageType!.label ?? TYPE_LABEL[switchTo]}, and this report is a {TYPE_LABEL[ws.propertyType].toLowerCase()}.</span>
          {!off && <button type="button" className="btn" onClick={() => ws.setPropertyType(switchTo)}>Make it a {TYPE_LABEL[switchTo].toLowerCase()}</button>}
        </div>
      )}

      <div className="nr-compact">
        <div className="seg nr-seg small" role="group" aria-label="For a buyer or a seller">
          {(['buyer', 'seller'] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={ws.side === a}
              className={ws.side === a ? 'on' : ''}
              disabled={off}
              onClick={() => ws.setBrief({ ...ws.brief, audience: entry(a, today) })}
            >
              {a === 'buyer' ? 'Buyer' : 'Seller'}
            </button>
          ))}
        </div>
        <div className="seg nr-seg small" role="group" aria-label="Co-op or condo">
          {(['coop', 'condo'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={ws.propertyType === t} className={ws.propertyType === t ? 'on' : ''} disabled={off} onClick={() => ws.setPropertyType(t)}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <input
          className="u-input nr-client"
          aria-label="Client"
          value={ws.brief.clientName?.value ?? ''}
          disabled={off}
          maxLength={120}
          placeholder="Client · optional"
          onChange={(e) => setClient(e.target.value)}
        />
      </div>

      <section className="nr-sec" aria-label="General">
        <div className="nr-sec-h">General</div>
        <div className="nr-sizerow">
          <div className="nr-size">
            <span className="fh nr-label-line">
              Interior size
              {coop ? <span className="nr-sub">(co-ops are priced without per-SF figures)</span> : !ws.sf && <span className="nr-sub">(without it, no per-SF figures anywhere)</span>}
            </span>
            {showSize ? (
              <div className="nr-size-line">
                <NrNumber
                  className="nr-big"
                  label="Interior size in square feet"
                  value={size}
                  onChange={num('areaSqft')}
                  today={today}
                  disabled={off}
                  placeholder="0"
                  suffix="sq ft"
                  {...(size ? {} : { estimate: estimateNext || readGaveNoSize })}
                  autoFocus={sizeOpen && !size}
                  onFocus={() => setSizeOpen(true)}
                  onBlur={() => setSizeOpen(false)}
                />
              </div>
            ) : (
              <div className="nr-size-line empty">
                <span className="nr-notlisted">Not listed</span>
                {!off && <button type="button" className="link nr-add-est" onClick={() => setSizeOpen(true)}>+ Add an estimate</button>}
              </div>
            )}
          </div>
          {(size || !readGaveNoSize) && (
            <button
              type="button"
              className={`nr-est${(size ? size.estimate : estimateNext) ? ' on' : ''}`}
              aria-pressed={Boolean(size ? size.estimate : estimateNext)}
              disabled={off}
              title="Your estimate counts in “with estimates” only, and the email says so."
              onClick={toggleEstimate}
            >
              <span className="nr-est-dot" aria-hidden="true" />Estimate
            </button>
          )}
          <label className="nr-small">
            <span className="nr-small-label">Beds</span>
            <span className="nr-small-line"><NrNumber className="nr-big" label="Beds" value={intake.beds} onChange={num('beds')} today={today} disabled={off} placeholder="—" /></span>
          </label>
          <label className="nr-small">
            <span className="nr-small-label">Baths</span>
            <span className="nr-small-line"><NrNumber className="nr-big" label="Baths" value={intake.baths} onChange={num('baths')} today={today} disabled={off} integer={false} placeholder="—" /></span>
          </label>
          <label className="nr-small">
            <span className="nr-small-label">Rooms</span>
            <span className="nr-small-line"><NrNumber className="nr-big" label="Rooms" value={intake.rooms} onChange={num('rooms')} today={today} disabled={off} integer={false} placeholder="—" /></span>
          </label>
        </div>
        <div className="nr-fields4">
          {tile('floor', 'Floor')}
          {tile('askingPrice', 'Asking price', { money: true })}
          {tile('commonCharges', coop ? 'Maintenance' : 'Common charges', { money: true, monthly: true })}
          {tile('taxes', 'Taxes', { money: true, monthly: true })}
        </div>
      </section>

      <section className="nr-about" aria-label="About the home">
        <div className="nr-sec-h">About the home</div>
        <FeaturePicker value={ws.homeFeatures} onChange={setFeatures} disabled={off} type={pickerType(intake.kind?.value, ws.propertyType)} />
        <label className="nr-feat-row">
          <span className="fh">Year built</span>
          <span className="nr-tile-line nr-year-line">
            <NrNumber className="nr-year" label="Year built" value={intake.yearBuilt} onChange={num('yearBuilt')} today={today} disabled={off} placeholder="—" plain />
            <span className="nr-pen" aria-hidden="true"><span>✎</span></span>
          </span>
        </label>
        <label className="nr-feat-row">
          <span className="fh">Neighborhood</span>
          <span className="nr-tile-line nr-year-line">
            <input
              className="nr-text"
              aria-label="Neighborhood"
              value={intake.neighborhood?.value ?? ''}
              disabled={off}
              maxLength={80}
              placeholder="—"
              onChange={(e) => set('neighborhood', e.target.value.trim() ? entry(e.target.value, today) : undefined)}
            />
            <span className="nr-pen" aria-hidden="true"><span>✎</span></span>
          </span>
        </label>
      </section>

      <section className="nr-notes" aria-label="Notes">
        <div className="nr-label-line">
          <label className="nr-sec-h" htmlFor="nr-home-notes">Notes</label>
          <Info label="About the notes" text={NOTES_TIP} align="left" />
        </div>
        <textarea
          id="nr-home-notes"
          className="box"
          rows={3}
          value={intake.notes?.value ?? ''}
          disabled={off}
          maxLength={4000}
          placeholder="Light, views, condition, layout, storage"
          onChange={(e) => set('notes', e.target.value.trim() ? entry(e.target.value, today) : undefined)}
        />
      </section>

      <details className="nr-more">
        <summary>More about the home{moreFilled ? <span className="nr-sub"> ({moreFilled} filled)</span> : null}</summary>
        <div className="nr-more-body">
          <Choice label="Laundry" value={intake.laundry?.value} options={LAUNDRY} disabled={off} onChange={(v) => set('laundry', v ? entry(v, today) : undefined)} />
          {(['dishwasher', 'centralAir', 'fireplace', 'corner'] as YesNoKey[]).map((k) => (
            <YesNo
              key={k}
              label={{ dishwasher: 'Dishwasher', centralAir: 'Central air', fireplace: 'Working fireplace', corner: 'Corner unit' }[k]}
              value={intake[k]?.value}
              disabled={off}
              onChange={(v) => set(k, v === undefined ? undefined : entry(v, today))}
            />
          ))}
          <Choice
            label="New development"
            value={intake.newDevelopment === undefined ? undefined : intake.newDevelopment.value ? 'new' : 'resale'}
            options={[{ value: 'resale', label: 'Resale' }, { value: 'new', label: 'New development' }]}
            disabled={off}
            onChange={(v) => set('newDevelopment', v ? entry(v === 'new', today) : undefined)}
          />
          {hasOutdoor && (
            <label className="nr-feat-row">
              <span className="fh">Outdoor size</span>
              <span><NrNumber className="nr-year" label="Outdoor size in square feet" value={intake.outdoorSqft} onChange={num('outdoorSqft')} today={today} disabled={off} placeholder="—" suffix="sq ft" /></span>
            </label>
          )}
        </div>
      </details>
    </>
  );
}

/** One choice of a few, as chips; the chosen one again clears it (not known). */
function Choice<T extends string>({ label, value, options, onChange, disabled }: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (next: T | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div className="nr-feat-row" role="group" aria-label={label}>
      <span className="fh">{label}</span>
      <span className="chips small">
        {options.map((o) => (
          <button key={o.value} type="button" className={`chip${value === o.value ? ' on' : ''}`} aria-pressed={value === o.value} disabled={disabled} onClick={() => onChange(value === o.value ? undefined : o.value)}>
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

function YesNo({ label, value, onChange, disabled }: { label: string; value: boolean | undefined; onChange: (next: boolean | undefined) => void; disabled?: boolean }) {
  return (
    <Choice
      label={label}
      value={value === undefined ? undefined : value ? 'yes' : 'no'}
      options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
      disabled={disabled}
      onChange={(v) => onChange(v === undefined ? undefined : v === 'yes')}
    />
  );
}
