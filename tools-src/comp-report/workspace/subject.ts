// The home from its StreetEasy page (Dispatch 09; `02-screens.md`, New comp —
// 1 and 2): the page is read like a comp's (the engine's compRecordFromListing),
// and what it gave fills the details the agent hasn't filled themselves. Each
// such value is marked "from StreetEasy" until the agent changes it. Nothing
// the page didn't give is guessed.
import { compRecordFromListing, confirmListingRecord, type Confidence, type IsoDate, type Sourced } from '../engine/index.ts';
import type { Entry, Intake, OutdoorChoice } from './state.ts';

export interface HomeFromListing {
  intake: Intake;
  /** The details it filled, in the intake's names. */
  filled: (keyof Intake)[];
  /** "100 Barclay Street #17L", when the page gave the address. */
  title: string | null;
}

/**
 * What the home's page gives the intake: every value the agent hasn't set.
 * The agent's own values always stand. The asking price comes only from a
 * listing that's on the market or in contract: an old listing's last ask isn't
 * what the home is asking now.
 */
export function homeFromListing(extract: unknown, opts: { asOf: IsoDate; url: string | null }, current: Intake): HomeFromListing {
  const { record } = compRecordFromListing(extract, { as_of: opts.asOf, url: opts.url });
  const facts = confirmListingRecord(record).facts;
  const next: Intake = { ...current };
  const filled: (keyof Intake)[] = [];
  const entry = <T>(value: T, confidence: Confidence): Entry<T> => ({
    value, asOf: opts.asOf, from: 'listing', ...(confidence === 'approx' ? { approx: true } : {}),
  });
  const fill = <K extends keyof Intake>(key: K, fact: Sourced<unknown> | undefined, value?: unknown) => {
    if (!fact || next[key] !== undefined) return;
    (next as Record<string, unknown>)[key] = entry(value ?? fact.value, fact.confidence);
    filled.push(key);
  };

  const id = record.identity;
  if (id.address.street && !next.address) {
    next.address = entry([id.address.street, id.address.city, id.address.state].filter(Boolean).join(', '), 'exact');
    filled.push('address');
  }
  if (id.unit.raw && !next.unit) {
    next.unit = entry(id.unit.raw, 'exact');
    filled.push('unit');
  }
  fill('areaSqft', facts.area_sqft);
  fill('beds', facts.beds);
  fill('baths', facts.baths);
  fill('floor', facts.floor);
  const status = record.status.listing_status;
  if (status === 'active' || status === 'in_contract') fill('askingPrice', facts.list_price);
  fill('commonCharges', facts.common_charges_monthly);
  fill('taxes', facts.taxes_monthly);
  fill('centralAir', facts.central_air);
  fill('dishwasher', facts.dishwasher);
  fill('fireplace', facts.fireplace);
  fill('laundry', facts.laundry);
  fill('views', facts.views);
  fill('yearBuilt', facts.year_built);
  fill('newDevelopment', facts.new_development);
  if (facts.outdoor_private && next.outdoorKind === undefined) {
    const kinds = facts.outdoor_kinds?.value ?? [];
    const kind: OutdoorChoice | undefined = facts.outdoor_private.value ? kinds[0] ?? 'outdoor_space' : 'none';
    fill('outdoorKind', facts.outdoor_private, kind);
    if (kind !== 'none') fill('outdoorSqft', facts.outdoor_area_sqft);
  }

  const unit = id.unit.raw ? ` ${id.unit.raw.startsWith('#') ? id.unit.raw : `#${id.unit.raw}`}` : '';
  return { intake: next, filled, title: id.address.street ? `${id.address.street}${unit}` : null };
}
