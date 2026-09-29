// A comp as the walkthrough shows it, in the export table (step 2) and the
// first-pass review (step 3): the export's record, with the engine's own $/sqft
// (§6.2: the export's is never used) and the flags a reviewer needs.
import type { CompOut } from '../../../engine/index.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { EVIDENCE_LABEL, isoDay, psf, sqft, usd } from '../../../workspace/format.ts';

export function compAddress(c: WorkspaceComp): string {
  const street = c.record.identity.address.street ?? 'No address';
  const unit = c.record.identity.unit.raw;
  return unit ? `${street} ${unit.startsWith('#') ? unit : `#${unit}`}` : street;
}

export function listingUrl(c: WorkspaceComp): string | null {
  const url = c.record.identity.streeteasy?.url;
  return url && /^https:\/\/(www\.)?streeteasy\.com\//.test(url) ? url : null;
}

/** The price its $/sqft divides: the sale for sold, the ask otherwise. */
export function compPrice(c: WorkspaceComp): { value: number | null; label: string } {
  const f = c.record.facts;
  if (c.record.status.evidence_class === 'sold') return { value: f.sale_price?.value ?? null, label: 'sold' };
  return { value: f.list_price?.value ?? null, label: c.record.status.evidence_class === 'in_contract' ? 'last ask' : 'ask' };
}

export function Flags({ c, out }: { c: WorkspaceComp; out: CompOut | undefined }) {
  const f = c.record.facts;
  const flags: string[] = [];
  if (c.record.flags.closing_record) flags.push('Public-record closing');
  if (c.record.flags.approx_area) flags.push('Approximate size');
  if (!f.area_sqft) flags.push('No size');
  if (!f.floor) flags.push('No floor');
  if (out?.flags.same_building_as_subject) flags.push('Same building as the subject');
  if (out?.flags.same_unit_as_subject) flags.push('The subject itself');
  if (c.unsortable) flags.push('Can’t be sorted');
  if (!flags.length) return null;
  return (
    <span className="flags">
      {flags.map((x) => <span key={x} className="flag">{x}</span>)}
    </span>
  );
}

export function CompFacts({ c, out }: { c: WorkspaceComp; out: CompOut | undefined }) {
  const f = c.record.facts;
  const price = compPrice(c);
  const rate = out?.per_result.on_facts.price_per_sqft?.value ?? null;
  const parts = [
    `${usd(price.value)} ${price.label}`,
    sqft(f.area_sqft?.value, c.record.flags.approx_area || f.area_sqft?.confidence === 'approx'),
    rate !== null ? `${psf(rate)}/sq ft` : null,
    f.beds ? `${f.beds.value} bd` : null,
    f.baths ? `${f.baths.value} ba` : null,
    f.floor ? `floor ${f.floor.value}` : null,
    f.status_date ? isoDay(f.status_date.value) : null,
  ].filter(Boolean);
  return <span className="comp-facts">{parts.join(' · ')}</span>;
}

export function evidenceLabel(c: WorkspaceComp): string {
  const e = c.record.status.evidence_class;
  return e ? EVIDENCE_LABEL[e] : `Unknown (“${c.record.status.raw ?? ''}”)`;
}
