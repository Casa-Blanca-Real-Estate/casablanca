// From the walkthrough's stored state to the engine's input. The same code runs
// in the browser, where the numbers recompute the instant a tier or a fact
// changes, and in the functions, for the assistant's read-only summary (§5).
import {
  compRecordFromListing, compRecordFromManual, confirmListingRecord, FACT_CHECKS, identify,
  type CompInput, type CompRecord, type DealTerms, type EngineInput, type FactField, type IsoDate,
  type ManualCompFields, type NamedPrice, type OutdoorKind, type ParsedExport, type PropertyFacts, type Sourced,
} from '../engine/index.ts';
import type { CallState, CompJudgment, CompSource, DealTermsState, Entry, Intake, TargetState } from './state.ts';

/** An import, parsed: the browser and the server parse the stored file with the same parser. */
export interface ParsedImport {
  importId: string;
  createdAt: string;
  parsed: ParsedExport;
}

/** Where a comp came in: an export, a StreetEasy link, or typed in (§6.2). */
export type CompOrigin = 'export' | 'listing' | 'manual';

/** A comp as the walkthrough shows it: its record, where it came from, and the agent's judgment of it. */
export interface WorkspaceComp {
  /** The engine's comp id: the stable property key, or a row id for a record without one. */
  id: string;
  record: CompRecord;
  origin: CompOrigin;
  /** The export it was read from, for an export's comp. */
  importId: string | null;
  /** A link's comp: the read that made it. */
  readId: string | null;
  /** A link's comp waits for the agent's one-tap confirm; until then it counts in neither result (§6.2). */
  unconfirmed: boolean;
  judgment: CompJudgment | null;
  /** Why the agent can't sort this comp, when they can't. */
  unsortable: string | null;
}

/**
 * Reading a link's or a typed-in comp is pure, so it's cached by what was read:
 * the same extract, date and link always make the same record.
 */
export type RecordCache = Map<string, CompRecord | null>;

function sourceRecord(source: CompSource, cache?: RecordCache): CompRecord | null {
  if (source.kind === 'export') return null;
  const cacheKey = JSON.stringify(source.kind === 'listing' ? [source.kind, source.asOf, source.url, source.extract] : [source.kind, source.asOf, source.fields]);
  const hit = cache?.get(cacheKey);
  let record: CompRecord | null;
  if (hit !== undefined) {
    record = hit;
  } else {
    try {
      record = source.kind === 'listing'
        ? compRecordFromListing(source.extract, { as_of: source.asOf, url: source.url }).record
        : compRecordFromManual(source.fields as ManualCompFields, { as_of: source.asOf }).record;
    } catch {
      record = null; // a stored source the current parser refuses: shown as unreadable, never guessed
    }
    cache?.set(cacheKey, record);
  }
  if (record && source.kind === 'listing' && source.confirmedAt) return confirmListingRecord(record);
  return record;
}

/**
 * Every comp in the report, each from its newest observation: an export's from
 * the stored file (newest import first), a link's from what its page said, a
 * typed-in one from what was typed. Then the export rows that can't be sorted
 * (no address, a status the engine doesn't know), so the agent sees them too.
 */
export function workspaceComps(imports: ParsedImport[], judgments: CompJudgment[], cache?: RecordCache): WorkspaceComp[] {
  const newestFirst = [...imports].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const fromExport = (key: string, importId: string | null): { record: CompRecord; importId: string } | null => {
    const preferred = importId ? newestFirst.filter((i) => i.importId === importId) : [];
    for (const imp of [...preferred, ...newestFirst]) {
      const record = imp.parsed.comps.find((r) => r.identity.key === key);
      if (record) return { record, importId: imp.importId };
    }
    return null;
  };

  const out: WorkspaceComp[] = [];
  const seen = new Set<string>();
  for (const j of judgments) {
    if (j.source.kind === 'export') {
      const hit = fromExport(j.propertyKey, j.source.importId);
      if (!hit) continue; // its export couldn't be read here: the export says so
      out.push({ id: j.propertyKey, record: hit.record, origin: 'export', importId: hit.importId, readId: null, unconfirmed: false, judgment: j, unsortable: null });
    } else {
      const record = sourceRecord(j.source, cache);
      if (!record) continue;
      const listing = j.source.kind === 'listing' ? j.source : null;
      out.push({
        id: j.propertyKey,
        record,
        origin: j.source.kind,
        importId: null,
        readId: listing?.readId ?? null,
        unconfirmed: Boolean(listing && !listing.confirmedAt),
        judgment: j,
        unsortable: null,
      });
    }
    seen.add(j.propertyKey);
  }
  for (const imp of newestFirst) {
    for (const record of imp.parsed.comps) {
      const key = record.identity.key;
      const id = key ?? `row-${record.origin?.row ?? out.length}@${imp.importId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const unsortable = !key
        ? 'No address in the export, so it can’t be recorded or sorted.'
        : !record.status.evidence_class
          ? `StreetEasy’s status “${record.status.raw ?? ''}” isn’t one the engine knows, so it can’t be sorted.`
          : null;
      out.push({ id, record, origin: 'export', importId: imp.importId, readId: null, unconfirmed: false, judgment: null, unsortable });
    }
  }
  return out;
}

/** How an entry is sourced: the agent's, or read from the home's StreetEasy page (the agent confirmed it on the details screen). */
function how(entry: Entry<unknown>): Pick<Sourced<unknown>, 'source' | 'as_of' | 'confidence' | 'note'> {
  const listing = entry.from === 'listing';
  return {
    source: listing ? 'listing' : 'agent',
    as_of: entry.asOf,
    confidence: entry.estimate ? 'guesstimate' : entry.approx ? 'approx' : 'exact',
    ...(entry.sample ? { note: 'sample value (walkthrough)' } : listing ? { note: 'from the home’s StreetEasy page, confirmed by the agent' } : {}),
  };
}

function sourced<T>(entry: Entry<T> | undefined, field: FactField, value?: T): Sourced<T> | undefined {
  if (!entry) return undefined;
  const v = value ?? entry.value;
  if (!FACT_CHECKS[field].check(v)) return undefined; // never hand compute() a value it would refuse
  return { value: v, ...how(entry) } as Sourced<T>;
}

/** The subject's facts from the intake form, each attributed to the agent (§2). */
export function subjectFacts(intake: Intake | undefined, asOf: IsoDate): PropertyFacts {
  const i = intake ?? {};
  const facts: PropertyFacts = {
    property_type: { value: 'condo', source: 'agent', as_of: asOf, confidence: 'exact' },
  };
  const put = <K extends FactField>(field: K, value: PropertyFacts[K] | undefined) => {
    if (value !== undefined) facts[field] = value;
  };
  put('area_sqft', sourced(i.areaSqft, 'area_sqft'));
  put('beds', sourced(i.beds, 'beds'));
  put('baths', sourced(i.baths, 'baths'));
  put('floor', sourced(i.floor, 'floor'));
  put('list_price', sourced(i.askingPrice, 'list_price'));
  put('year_built', sourced(i.yearBuilt, 'year_built'));
  put('new_development', sourced(i.newDevelopment, 'new_development'));
  put('common_charges_monthly', sourced(i.commonCharges, 'common_charges_monthly'));
  put('taxes_monthly', sourced(i.taxes, 'taxes_monthly'));
  put('central_air', sourced(i.centralAir, 'central_air'));
  put('dishwasher', sourced(i.dishwasher, 'dishwasher'));
  put('fireplace', sourced(i.fireplace, 'fireplace'));
  put('laundry', sourced(i.laundry, 'laundry'));
  put('views', sourced(i.views, 'views'));
  const outdoor = i.outdoorKind;
  if (outdoor) {
    const none = outdoor.value === 'none';
    const kinds: OutdoorKind[] = none ? [] : [outdoor.value as OutdoorKind];
    if (FACT_CHECKS.outdoor_kinds.check(kinds)) {
      const sourcing = how(outdoor);
      facts.outdoor_private = { ...sourcing, value: !none } as Sourced<boolean>;
      facts.outdoor_kinds = { ...sourcing, value: kinds } as Sourced<OutdoorKind[]>;
      if (!none) put('outdoor_area_sqft', sourced(i.outdoorSqft, 'outdoor_area_sqft'));
    }
  }
  return facts;
}

/** The deal-terms module (§6.7), as the engine takes it. Financing only when it's complete. */
export function dealTermsInput(terms: DealTermsState | null | undefined): DealTerms | undefined {
  if (!terms) return undefined;
  const n = (e: Entry<number> | undefined) => (e && Number.isFinite(e.value) ? e.value : undefined);
  const money = (e: Entry<number> | undefined) => {
    const v = n(e);
    return v !== undefined && Number.isSafeInteger(v) && v > 0 ? v : undefined;
  };
  if (terms.template === 'seller_pricing') {
    return {
      template: 'seller_pricing',
      ...(money(terms.sellerTarget) !== undefined ? { seller_target: money(terms.sellerTarget) } : {}),
      ...(terms.timing?.value ? { timing: terms.timing.value } : {}),
      ...(terms.flexibility?.value ? { flexibility: terms.flexibility.value } : {}),
    };
  }
  const price = money(terms.price);
  const deposit = n(terms.depositPercent);
  const down = n(terms.downPaymentPercent);
  const rate = n(terms.ratePercent);
  const term = n(terms.termYears);
  const financing = down !== undefined && rate !== undefined && term !== undefined && down >= 0 && down <= 100 && rate >= 0 && term > 0
    ? { down_payment: { percent: down }, annual_rate_percent: rate, term_years: Math.round(term) }
    : undefined;
  return {
    template: 'buyer_traditional',
    ...(price !== undefined ? { price } : {}),
    ...(deposit !== undefined && deposit >= 0 && deposit <= 100 ? { deposit: { percent: deposit } } : {}),
    ...(financing ? { financing } : {}),
    ...(terms.targetClosing?.value ? { target_closing: terms.targetClosing.value } : {}),
  };
}

/**
 * The prices the reveal evaluates: the call's low and high, and the target.
 * Evaluated against the results, never an input to them. The browser adds
 * them; the assistant's summary never does (§8.4).
 */
export function namedPrices(call: CallState | null | undefined, target: TargetState | null | undefined): NamedPrice[] {
  const prices: NamedPrice[] = [];
  const ok = (v: number | undefined): v is number => v !== undefined && Number.isSafeInteger(v) && v > 0;
  if (call && !call.skipped && ok(call.low) && ok(call.high)) {
    prices.push({ id: 'call_low', label: 'Your call, low', kind: 'call', price: call.low });
    prices.push({ id: 'call_high', label: 'Your call, high', kind: 'call', price: call.high });
  }
  if (target && ok(target.price.value)) prices.push({ id: 'target', label: 'Target', kind: 'target', price: target.price.value });
  return prices;
}

/** Who maps the buildings (Dispatch 11). */
export const MAPPED_BY = 'NYC Planning GeoSearch';

/** A building's mapped location (Dispatch 11): the geocoder's point for its street address. */
export interface Location {
  lat: number;
  lng: number;
  /** The day it was looked up. */
  asOf: IsoDate;
  /** The geocoder's own address for it. */
  matched: string | null;
}

/** The located buildings, by building key, from the server's geocodes: only a match is a location. */
export function locationsFrom(geocodes: readonly { buildingKey: string; status: string; lat: number | null; lng: number | null; matched: string | null; lookedUpAt: string | null }[]): Map<string, Location> {
  const out = new Map<string, Location>();
  for (const g of geocodes) {
    if (g.status !== 'matched' || g.lat === null || g.lng === null || !g.lookedUpAt) continue;
    out.set(g.buildingKey, { lat: g.lat, lng: g.lng, asOf: g.lookedUpAt.slice(0, 10), matched: g.matched });
  }
  return out;
}

/** The coordinates fact: a building's point, not the unit's, so approximate. */
export function coordinatesFact(l: Location): Sourced<{ lat: number; lng: number }> {
  return {
    value: { lat: l.lat, lng: l.lng }, source: 'geocoder', as_of: l.asOf, confidence: 'approx',
    note: `the building’s mapped location (${MAPPED_BY})${l.matched ? `: ${l.matched}` : ''}`,
  };
}

/** A record with its building's location, where it has none of its own. A copy: records are cached. */
function located(record: CompRecord, locations: ReadonlyMap<string, Location> | undefined): CompRecord {
  const l = record.identity.building_key ? locations?.get(record.identity.building_key) : undefined;
  if (!l || record.facts.coordinates) return record;
  return { ...record, facts: { ...record.facts, coordinates: coordinatesFact(l) } };
}

/**
 * The engine's input. An unsorted comp counts toward nothing: the agent's
 * judgment is structural (§4.6), so the scaffold never tiers a comp for them.
 * `locations` are the buildings' mapped locations, for distance (§6.10).
 */
export function engineInput(args: {
  asOf: IsoDate;
  intake: Intake | undefined;
  dealTerms?: DealTermsState | null;
  comps: WorkspaceComp[];
  prices?: NamedPrice[];
  locations?: ReadonlyMap<string, Location>;
}): EngineInput {
  const i = args.intake ?? {};
  const comps: CompInput[] = args.comps.map((c) => {
    const tier = c.judgment?.tier ?? 'excluded';
    const latest = c.judgment?.reasons.at(-1);
    const reason = c.unsortable ?? (c.judgment?.tier ? latest?.reason : 'Not sorted yet');
    return {
      id: c.id,
      record: located(c.record, args.locations),
      tier,
      ...(reason ? { tier_reason: reason } : {}),
      ...(c.judgment?.anchor && tier === 'primary' ? { anchor: true } : {}),
    };
  });
  const deal = dealTermsInput(args.dealTerms);
  const identity = identify({ address: i.address?.value ?? null, unit: i.unit?.value ?? null });
  const facts = subjectFacts(args.intake, args.asOf);
  const home = identity.building_key ? args.locations?.get(identity.building_key) : undefined;
  if (home) facts.coordinates = coordinatesFact(home);
  return {
    as_of: args.asOf,
    property_type: 'condo',
    subject: { identity, facts },
    comps,
    ...(args.prices && args.prices.length ? { prices: args.prices } : {}),
    ...(deal ? { deal_terms: deal } : {}),
  };
}
