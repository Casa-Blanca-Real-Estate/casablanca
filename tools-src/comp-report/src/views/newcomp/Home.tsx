// New report, 1 of 3: which home (the handoff, screen 03). The home's
// StreetEasy link (or its address, typed), the matched home, then For a
// (Buyer, the default, or Seller), the client, Co-op or Condo (Co-op, the
// default: the engine computes with it), and the target, optional.
//
// The target keeps D-4: Hubert doesn't see it until his own math is done, it's
// never in the email, and it stays editable on Findings.
import { useId, type ReactNode } from 'react';
import type { Audience } from '../../../workspace/state.ts';
import { checkListingLink, titleFromLink, type LinkCheck } from '../../../workspace/links.ts';
import { readPrice } from '../comp/CompForm.tsx';
import { splitTitle } from '../workspace/model.ts';
import { Info } from './Frame.tsx';

export type PropertyType = 'coop' | 'condo';

const LINKISH = /^(https?:\/\/|www\.|streeteasy)/i;

export const TYPE_LABEL: Record<PropertyType, string> = { coop: 'Co-op', condo: 'Condo' };

export const TARGET_TIP = 'Hidden from Hubert, the assistant, until the math is done, so it can’t steer the range. It’s never in the email, and you can change it on Findings.';

/** What's in the home's line: a StreetEasy link (checked), an address typed in, or nothing yet. */
export type HomeLineValue =
  | { kind: 'empty' }
  | { kind: 'link'; check: LinkCheck }
  | { kind: 'typed'; address: string; unit: string | null; title: string };

function unitLabel(unit: string): string {
  const u = unit.trim();
  return u.startsWith('#') ? u : `#${u}`;
}

export function readHomeLine(text: string): HomeLineValue {
  const t = text.trim();
  if (!t) return { kind: 'empty' };
  if (LINKISH.test(t)) return { kind: 'link', check: checkListingLink(t) };
  const split = splitTitle(t);
  const address = split?.address ?? t;
  const unit = split?.unit ?? null;
  return { kind: 'typed', address, unit, title: `${address.split(',')[0]!.trim()}${unit ? ` ${unitLabel(unit)}` : ''}` };
}

/** The line can make a report: a good link, or an address of a few letters. */
export function homeLineReady(v: HomeLineValue): boolean {
  return (v.kind === 'link' && v.check.ok) || (v.kind === 'typed' && v.address.trim().length >= 3);
}

/** The home's line as an input, with the matched home under it once there's something to match. */
export function HomeLineInput({ text, onText, type, disabled }: {
  text: string;
  onText: (v: string) => void;
  type: PropertyType;
  disabled?: boolean;
}) {
  const v = readHomeLine(text);
  return (
    <div className="nr-home">
      <input
        className="nr-line"
        aria-label="The home’s StreetEasy link, or its address"
        value={text}
        disabled={disabled}
        placeholder="Paste the home’s StreetEasy link, or type its address"
        onChange={(e) => onText(e.target.value)}
        autoFocus={!text}
      />
      {v.kind === 'link' && !v.check.ok && (
        <div className="nr-match bad" role="alert">{v.check.reason}</div>
      )}
      {v.kind === 'link' && v.check.ok && (
        <Matched
          name={titleFromLink(v.check.url) ?? 'The StreetEasy listing'}
          meta={`${TYPE_LABEL[type]} · its details are read from StreetEasy next`}
          onClear={disabled ? undefined : () => onText('')}
        />
      )}
      {v.kind === 'typed' && v.address.trim().length >= 3 && (
        <Matched typed name={v.title} meta={`${TYPE_LABEL[type]} · typed in: you fill in its details next`} onClear={disabled ? undefined : () => onText('')} />
      )}
    </div>
  );
}

/** The matched home: a lavender dot (sand when typed in), its name, what's known, and ✕ to start over. */
export function Matched({ name, meta, onClear, typed }: { name: string; meta: string; onClear?: (() => void) | undefined; typed?: boolean }) {
  return (
    <div className="nr-match">
      <span className={`nr-dot${typed ? ' typed' : ''}`} aria-hidden="true" />
      <span className="nr-match-name">{name}</span>
      <span className="nr-match-meta">{meta}</span>
      {onClear && <button type="button" className="nr-x small" aria-label="Clear the home" onClick={onClear}>✕</button>}
    </div>
  );
}

/** "$4,250,000", or what's typed while it doesn't read as a price. */
export function targetText(price: number | null | undefined): string {
  return price ? `$${price.toLocaleString('en-US')}` : '';
}

/** The fields under the home: For a, Client, Type and the target. */
export function HomeFields({ line, side, onSide, client, onClient, type, onType, target, onTarget, onTargetBlur, disabled }: {
  line: ReactNode;
  side: Audience;
  onSide: (a: Audience) => void;
  client: string;
  onClient: (v: string) => void;
  type: PropertyType;
  onType: (t: PropertyType) => void;
  target: string;
  onTarget: (v: string) => void;
  onTargetBlur: () => void;
  disabled?: boolean;
}) {
  const ids = useId();
  const buyer = side === 'buyer';
  const targetBad = target.trim() !== '' && readPrice(target) === null;
  return (
    <>
      <h2 className="nr-h">Which home?</h2>
      {line}
      <div className="nr-pair">
        <div className="nr-col">
          <span className="fh" id={`${ids}-side`}>For a</span>
          <div className="seg nr-seg" role="group" aria-labelledby={`${ids}-side`}>
            {(['buyer', 'seller'] as const).map((a) => (
              <button key={a} type="button" aria-pressed={side === a} className={side === a ? 'on' : ''} disabled={disabled} onClick={() => onSide(a)}>
                {a === 'buyer' ? 'Buyer' : 'Seller'}
              </button>
            ))}
          </div>
        </div>
        <div className="nr-col">
          <label className="fh" htmlFor={`${ids}-client`}>Client · optional</label>
          <input
            id={`${ids}-client`}
            className="u-input nr-client"
            value={client}
            disabled={disabled}
            maxLength={120}
            placeholder="Name, or leave blank"
            onChange={(e) => onClient(e.target.value)}
          />
        </div>
      </div>
      <div className="nr-pair">
        <div className="nr-col">
          <span className="fh" id={`${ids}-type`}>Type</span>
          <div className="seg nr-seg" role="group" aria-labelledby={`${ids}-type`}>
            {(['coop', 'condo'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={type === t} className={type === t ? 'on' : ''} disabled={disabled} onClick={() => onType(t)}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="nr-col">
          <div className="fh nr-label-line">
            <label htmlFor={`${ids}-target`}>{buyer ? 'Offer target · optional' : 'Target price · optional'}</label>
            <span className="nr-sub">{buyer ? '(what your client hopes to pay)' : '(what you or the client want to justify)'}</span>
            <Info label={buyer ? 'About the offer target' : 'About the target price'} text={TARGET_TIP} />
          </div>
          <input
            id={`${ids}-target`}
            className="u-input big nr-target"
            inputMode="decimal"
            value={target}
            disabled={disabled}
            placeholder="$0"
            aria-invalid={targetBad || undefined}
            onChange={(e) => onTarget(e.target.value)}
            onBlur={onTargetBlur}
          />
          {targetBad && <span className="nr-err" role="alert">The target reads as a price: $4,250,000 or 4.25M.</span>}
        </div>
      </div>
    </>
  );
}
