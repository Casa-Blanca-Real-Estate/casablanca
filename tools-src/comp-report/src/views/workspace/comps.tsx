// A comp as the walkthrough shows it, in the add-comps list and in Sort: its
// record, with the engine's own $/sqft (§6.2: the export's is never used), where
// it came from, and the flags a reviewer needs, Kara's checks first (§6.10).
import type { CompOut, Confidence, ListingStatus } from '../../../engine/index.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { isoDay, psf, sqft, usd } from '../../../workspace/format.ts';

/** The four groups the lists show, in order (`02-screens.md`, Add comps). */
export const STATUS_ORDER: ListingStatus[] = ['sold', 'in_contract', 'active', 'off_market'];
export const STATUS_LABEL: Record<ListingStatus, string> = { sold: 'Sold', in_contract: 'In contract', active: 'Active', off_market: 'Didn’t sell' };

export function compAddress(c: WorkspaceComp): string {
  const street = c.record.identity.address.street ?? 'No address';
  const unit = c.record.identity.unit.raw;
  return unit ? `${street} ${unit.startsWith('#') ? unit : `#${unit}`}` : street;
}

export function listingUrl(c: WorkspaceComp): string | null {
  const url = c.record.listing?.url ?? c.record.identity.streeteasy?.url;
  return url && /^https:\/\/(www\.)?streeteasy\.com\//.test(url) ? url : null;
}

/** Sold, in contract, active, or didn't sell: the page's or the export's status. */
export function compStatus(c: WorkspaceComp): ListingStatus | null {
  return c.record.status.listing_status ?? c.record.status.evidence_class ?? c.judgment?.evidenceClass ?? null;
}

/** The price its $/sqft divides: the sale for sold, the ask otherwise. */
export function compPrice(c: WorkspaceComp): { value: number | null; label: string } {
  const f = c.record.facts;
  const status = compStatus(c);
  if (status === 'sold') return { value: f.sale_price?.value ?? null, label: 'sold' };
  return { value: f.list_price?.value ?? null, label: status === 'active' ? 'ask' : 'last ask' };
}

/**
 * $/sq ft for the row. The engine's own once a comp counts; for a row still
 * waiting for the agent's confirm, the same arithmetic on what the page said
 * (price ÷ size, truncated as StreetEasy shows it), so the row reads in full.
 */
export function rowPsf(c: WorkspaceComp, out: CompOut | undefined): number | null {
  const engine = out?.per_result.on_facts.price_per_sqft?.value ?? out?.per_result.with_estimates.price_per_sqft?.value ?? null;
  if (engine !== null) return engine;
  const price = compPrice(c).value;
  const area = c.record.facts.area_sqft?.value;
  return price && area ? Math.trunc(price / area) : null;
}

const SURENESS: Partial<Record<Confidence, string>> = { inferred: 'inferred', guesstimate: 'on your estimate' };

/**
 * The flags a reviewer needs. Kara's checks first, the engine's (§6.10): each
 * a few words, with the rule, what it saw and its suggested tier on hover, and
 * marked when it rests on an inferred value or the agent's estimate. Then the
 * data's own flags: a public-record closing, an approximate or missing size, no
 * floor.
 */
export function Flags({ c, out }: { c: WorkspaceComp; out: CompOut | undefined }) {
  const f = c.record.facts;
  const data: string[] = [];
  if (c.record.flags.closing_record) data.push('Public-record closing');
  if (c.record.flags.approx_area) data.push('Approximate size');
  if (!f.area_sqft) data.push('No size');
  if (!f.floor) data.push('No floor');
  if (c.unsortable) data.push('Can’t be sorted');
  const checks = (out?.checks ?? []).filter((k) => k.status === 'flagged');
  if (!checks.length && !data.length) return null;
  return (
    <span className="flags">
      {checks.map((k) => {
        const sure = k.confidence ? SURENESS[k.confidence] : undefined;
        return (
          <span key={k.code} className={`flag check${k.suggested_tier ? ` suggests-${k.suggested_tier}` : ''}`} title={[k.message, k.suggestion].filter(Boolean).join('. ')}>
            {k.label}{sure && <em className="flag-sure"> · {sure}</em>}
          </span>
        );
      })}
      {data.map((x) => <span key={x} className="flag">{x}</span>)}
    </span>
  );
}

/** Price, size, $/sq ft, floor, date, days on market: a missing detail is a dash, never a guess. */
export function CompFacts({ c, out }: { c: WorkspaceComp; out: CompOut | undefined }) {
  const f = c.record.facts;
  const price = compPrice(c);
  const rate = rowPsf(c, out);
  const parts = [
    price.value !== null ? `${usd(price.value)} ${price.label}` : `— ${price.label}`,
    f.area_sqft ? sqft(f.area_sqft.value, c.record.flags.approx_area || f.area_sqft.confidence === 'approx') : '— sq ft',
    rate !== null ? `${psf(rate)}/sq ft` : '— /sq ft',
    f.beds ? `${f.beds.value} bd` : null,
    f.baths ? `${f.baths.value} ba` : null,
    f.floor ? `floor ${f.floor.value}` : 'floor —',
    f.status_date ? isoDay(f.status_date.value) : null,
    f.days_on_market ? `${f.days_on_market.value} days on market` : null,
  ].filter(Boolean);
  return <span className="comp-facts">{parts.join(' · ')}</span>;
}

export function evidenceLabel(c: WorkspaceComp): string {
  const s = compStatus(c);
  return s ? STATUS_LABEL[s] : `Unknown (“${c.record.status.raw ?? ''}”)`;
}

export const ORIGIN_LABEL = { export: 'Export', listing: 'Link', manual: 'Typed in' } as const;
