// The buildings in a report, and where each stands (Dispatch 11, §6.10): the
// home's, from its address, and each comp's, from its property record. A
// building's location is looked up once and shared by every report and agent
// (comp_report.geocodes, looked up in api/geocode.ts); this reads it.
import { identify } from '../engine/index.ts';
import type { Queryable } from './db.ts';
import { boroughOf, type Borough } from './geocode.ts';

/** A failed lookup is tried again at most this many times in all… */
export const MAX_ATTEMPTS = 3;
/** …and no sooner than this after the last try. */
export const RETRY_AFTER_MINUTES = 15;

export interface GeocodeView {
  buildingKey: string;
  status: 'pending' | 'matched' | 'refused' | 'failed';
  lat: number | null;
  lng: number | null;
  /** The geocoder's address for its match, or the nearest it found when refused. */
  matched: string | null;
  reason: string | null;
  geocoder: string;
  lookedUpAt: string | null;
  /** A failure that will be tried again when the report next opens. */
  retry: boolean;
}

export interface Building {
  /** The engine's building key: the property key without its unit. */
  key: string;
  /** The street address alone: all the geocoder is sent. */
  street: string;
  /** Ours, from the address: what a match has to agree with. */
  borough: Borough | null;
  /** This report's properties in the building, which a lookup is recorded on. */
  propertyIds: string[];
  /** The home, when it has no property record yet: one is made with the lookup. */
  home: { propertyKey: string; unit: string | null } | null;
}

/** "pk1|ny|new york|200 chambers st|10A" → "pk1|ny|new york|200 chambers st". */
function buildingOf(propertyKey: string): string | null {
  return propertyKey.startsWith('pk1|') && propertyKey.split('|').length === 5 ? propertyKey.slice(0, propertyKey.lastIndexOf('|')) : null;
}

/** The report's buildings: the home's, from its address, and each comp's, from its property. */
export async function reportBuildings(tx: Queryable, reportId: string): Promise<Building[]> {
  const byKey = new Map<string, Building>();
  const add = (key: string, street: string, borough: Borough | null): Building => {
    // Past the table's limits it's no address a geocoder could match: never looked up, never in the way of the rest.
    if (key.length > 300 || street.trim().length > 200) return { key, street, borough, propertyIds: [], home: null };
    let b = byKey.get(key);
    if (!b) {
      b = { key, street, borough, propertyIds: [], home: null };
      byKey.set(key, b);
    }
    return b;
  };

  const intake = (await tx.query<{ intake: { address?: { value?: unknown }; unit?: { value?: unknown } } | null }>(
    `select state -> 'intake' as intake from comp_report.reports where id = $1`, [reportId],
  )).rows[0]?.intake;
  const address = typeof intake?.address?.value === 'string' ? intake.address.value : null;
  const unit = typeof intake?.unit?.value === 'string' ? intake.unit.value : null;
  if (address) {
    const home = identify({ address, unit });
    if (home.building_key && home.key && home.address.street) {
      const b = add(home.building_key, home.address.street, boroughOf(home.address.city, home.address.zip));
      const known = (await tx.query<{ id: string }>('select id from comp_report.properties where property_key = $1', [home.key])).rows[0];
      if (known) b.propertyIds.push(known.id);
      else b.home = { propertyKey: home.key, unit: home.unit.raw };
    }
  }

  const comps = (await tx.query<{ id: string; property_key: string; address: string }>(
    `select p.id, p.property_key, p.address
       from comp_report.report_comps rc join comp_report.properties p on p.id = rc.property_id
      where rc.report_id = $1 order by rc.created_at, rc.id`,
    [reportId],
  )).rows;
  for (const c of comps) {
    const key = buildingOf(c.property_key);
    // A comp with no street of its own has nothing to send.
    if (!key || !c.address || c.address === c.property_key) continue;
    const b = add(key, c.address, boroughOf(c.property_key.split('|')[2] ?? null));
    if (!b.propertyIds.includes(c.id)) b.propertyIds.push(c.id);
  }
  return [...byKey.values()];
}

interface Row {
  building_key: string; status: GeocodeView['status']; lat: number | null; lng: number | null; matched: string | null;
  reason: string | null; geocoder: string; attempts: number; looked_up_at: Date | null;
}

/** The buildings' locations, as the screens read them. */
export async function loadGeocodes(tx: Queryable, keys: string[]): Promise<GeocodeView[]> {
  if (!keys.length) return [];
  const rows = (await tx.query<Row>(
    `select building_key, status, lat, lng, matched, reason, geocoder, attempts, looked_up_at
       from comp_report.geocodes where building_key = any($1) order by building_key`,
    [keys],
  )).rows;
  return rows.map((r) => ({
    buildingKey: r.building_key, status: r.status, lat: r.lat, lng: r.lng, matched: r.matched, reason: r.reason,
    geocoder: r.geocoder, lookedUpAt: r.looked_up_at ? r.looked_up_at.toISOString() : null,
    retry: r.status === 'failed' && r.attempts < MAX_ATTEMPTS,
  }));
}
