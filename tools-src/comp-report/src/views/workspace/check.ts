// How a comp compares with the target, and what doesn't fit the guidance (comps.md §3–4, 2026-11-18): the
// "vs 17L: +201 sq ft · 7 floors lower · same bedrooms" line on Add comps, and the flags Hubert puts on a comp
// as it lands (a yellow square and a few words on the row; the longer note on Sort's check). Plain arithmetic
// on what the comp's source and the home's details say, written here, never generated: no price, no estimate.
import type { CompOut } from '../../../engine/index.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { compDistance } from '../../../workspace/distance.ts';
import type { Workspace } from './model.ts';
import type { Intake } from '../../../workspace/state.ts';

/** The guidance (GUIDANCE in AddComps.tsx): a quarter mile, three to six months, three floors either way. */
export const MAX_MILES = 0.25;
export const MAX_MONTHS = 6;
export const FLOOR_BAND = 3;

export interface Where {
  /** The comp is in the home's building. */
  sameBuilding: boolean;
  /** Miles from the home, when worked out. */
  miles: number | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n: number) => WORDS[n] ?? String(n);

function sizeEstimated(c: WorkspaceComp): boolean {
  const a = c.record.facts.area_sqft;
  return Boolean(a && (c.record.flags.approx_area || a.confidence === 'approx' || a.confidence === 'guesstimate'));
}

/** "+201 sq ft · 7 floors lower · same bedrooms": the comp against the home, what both sides give. */
export function versusLine(c: WorkspaceComp, intake: Intake, where: Where): string {
  const f = c.record.facts;
  const parts: string[] = [];
  if (where.sameBuilding) parts.push('same building');
  const home = intake.areaSqft?.value;
  const size = f.area_sqft?.value;
  if (home && size) {
    const d = Math.round(size - home);
    const est = sizeEstimated(c) ? '~' : '';
    parts.push(Math.abs(d) <= 25 ? 'same size' : d > 0 ? `${est}+${d.toLocaleString('en-US')} sq ft` : `${est}${(-d).toLocaleString('en-US')} sq ft smaller`);
  }
  const hf = intake.floor?.value;
  const cf = f.floor?.value;
  if (hf !== undefined && cf !== undefined && cf !== null) {
    const d = cf - hf;
    parts.push(d === 0 ? 'same floor' : `${plural(Math.abs(d), 'floor')} ${d > 0 ? 'higher' : 'lower'}`);
  }
  const hb = intake.beds?.value;
  const cb = f.beds?.value;
  if (hb !== undefined && cb !== undefined && cb !== null) {
    const d = cb - hb;
    parts.push(d === 0 ? 'same bedrooms' : `${plural(Math.abs(d), 'bedroom')} ${d > 0 ? 'more' : 'fewer'}`);
  }
  return parts.join(' · ');
}

export interface Flag {
  /** On the row: "Floor 10, seven below 17L". */
  short: string;
  /** On Sort's check, in Hubert's note: why, and what he'd do. */
  long: string;
}

function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

/**
 * What doesn't fit the guidance, first the strongest: distance, age, a floor outside the band, an estimated size,
 * a different type. `home` is the home's short name (17L); `type` the report's pricing basis.
 */
export function guidanceFlags(c: WorkspaceComp, intake: Intake, where: Where, home: string, type: 'condo' | 'coop', today: string): Flag[] {
  const f = c.record.facts;
  const out: Flag[] = [];
  if (!where.sameBuilding && where.miles !== null && where.miles > MAX_MILES) {
    const away = `${where.miles.toFixed(1)} mi`;
    out.push({
      short: `${away} away`,
      long: `It’s ${away} from ${home}: outside the quarter mile the guidance asks for. Keep it only if the client asked about that area, and say so in its note.`,
    });
  }
  const date = f.status_date?.value;
  if (date) {
    const m = monthsBetween(date, today);
    if (m > MAX_MONTHS) {
      const sold = (c.record.status.listing_status ?? c.record.status.evidence_class ?? c.judgment?.evidenceClass) === 'sold';
      out.push({
        short: `${sold ? 'Sold' : 'Dated'} ${m} months ago`,
        long: `${sold ? 'Sold' : 'Its date is'} ${m} months ago: past the three to six months the guidance asks for. Prices may have moved since; it can stay as context.`,
      });
    }
  }
  const hf = intake.floor?.value;
  const cf = f.floor?.value;
  if (hf !== undefined && cf !== undefined && cf !== null && Math.abs(cf - hf) > FLOOR_BAND) {
    const d = Math.abs(cf - hf);
    const side = cf > hf ? 'above' : 'below';
    out.push({
      short: `Floor ${cf}, ${word(d)} ${side} ${home}`,
      long: `Floor ${cf} is ${word(d)} floors ${side} ${home}: beyond its band of three either way. Floor changes what a home sells for, so this one may read ${cf > hf ? 'high' : 'low'}. Keep it, and say so in its note.`,
    });
  }
  if (sizeEstimated(c)) {
    out.push({
      short: 'Size is the listing’s estimate',
      long: 'The listing gives its size as an estimate, so its $/ft counts only in the result with estimates.',
    });
  }
  const t = f.property_type?.value;
  if (t && (t === 'condo' || t === 'coop') && t !== type) {
    out.push({
      short: `A ${t === 'coop' ? 'co-op' : 'condo'}, not a ${type === 'coop' ? 'co-op' : 'condo'}`,
      long: `It’s a ${t === 'coop' ? 'co-op' : 'condo'}, and this report prices a ${type === 'coop' ? 'co-op' : 'condo'}. The two sell differently: keep it as context, or take it out.`,
    });
  }
  return out;
}

/** The tally against the guidance: about three of each status, where there are that many. */
export const TALLY_AIM = 3;

/** Where a comp stands from the home: the same building, or its miles once worked out. */
export function whereOf(ws: Workspace, c: WorkspaceComp, out: CompOut | undefined): Where {
  const home = ws.output?.subject.identity;
  if (!home) return { sameBuilding: false, miles: out?.distance_miles ?? null };
  const d = compDistance(home, c.record.identity, out?.distance_miles ?? null, ws.locations, ws.geocodes);
  return { sameBuilding: d.kind === 'same_building', miles: d.kind === 'miles' ? d.miles : null };
}

/** "From its link", "From the export", "Typed in", "Hubert’s find". */
export function sourceOf(ws: Workspace, c: WorkspaceComp): string {
  const rc = c.judgment?.reportCompId;
  if (rc && ws.reads.some((r) => r.reportCompId === rc && r.foundBy === 'hubert')) return 'Hubert’s find';
  return c.origin === 'export' ? 'From the export' : c.origin === 'listing' ? 'From its link' : 'Typed in';
}

