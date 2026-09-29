// From the walkthrough's stored state to the engine's input. The same code runs
// in the browser, where the numbers recompute the instant a tier or a fact
// changes, and in the functions, for the assistant's read-only summary (§5).
import {
  FACT_CHECKS, identify,
  type CompInput, type CompRecord, type DealTerms, type EngineInput, type FactField, type IsoDate,
  type NamedPrice, type OutdoorKind, type ParsedExport, type PropertyFacts, type Sourced,
} from '../engine/index.ts';
import type { CallState, CompJudgment, DealTermsState, Entry, Intake, TargetState } from './state.ts';

/** An import, parsed: the browser and the server parse the stored file with the same parser. */
export interface ParsedImport {
  importId: string;
  createdAt: string;
  parsed: ParsedExport;
}

/** A comp as the walkthrough shows it: the export's record and the agent's judgment of it. */
export interface WorkspaceComp {
  /** The engine's comp id: the stable property key, or a row id for a record without one. */
  id: string;
  record: CompRecord;
  importId: string;
  judgment: CompJudgment | null;
  /** Why the agent can't sort this comp, when they can't. */
  unsortable: string | null;
}

/**
 * Every comp across the report's imports, newest import first. A property that
 * appears in more than one import is shown once, from the newest.
 */
export function workspaceComps(imports: ParsedImport[], judgments: CompJudgment[]): WorkspaceComp[] {
  const byKey = new Map(judgments.map((j) => [j.propertyKey, j]));
  const newestFirst = [...imports].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const seen = new Set<string>();
  const out: WorkspaceComp[] = [];
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
      out.push({ id, record, importId: imp.importId, judgment: key ? byKey.get(key) ?? null : null, unsortable });
    }
  }
  return out;
}

function sourced<T>(entry: Entry<T> | undefined, field: FactField, value?: T): Sourced<T> | undefined {
  if (!entry) return undefined;
  const v = value ?? entry.value;
  if (!FACT_CHECKS[field].check(v)) return undefined; // never hand compute() a value it would refuse
  return {
    value: v,
    source: 'agent',
    as_of: entry.asOf,
    confidence: entry.estimate ? 'guesstimate' : 'exact',
    ...(entry.sample ? { note: 'sample value (walkthrough)' } : {}),
  };
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
      const how = {
        source: 'agent' as const,
        as_of: outdoor.asOf,
        confidence: outdoor.estimate ? ('guesstimate' as const) : ('exact' as const),
        ...(outdoor.sample ? { note: 'sample value (walkthrough)' } : {}),
      };
      facts.outdoor_private = { ...how, value: !none };
      facts.outdoor_kinds = { ...how, value: kinds };
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

/**
 * The engine's input. An unsorted comp counts toward nothing: the agent's
 * judgment is structural (§4.6), so the scaffold never tiers a comp for them.
 */
export function engineInput(args: {
  asOf: IsoDate;
  intake: Intake | undefined;
  dealTerms?: DealTermsState | null;
  comps: WorkspaceComp[];
  prices?: NamedPrice[];
}): EngineInput {
  const i = args.intake ?? {};
  const comps: CompInput[] = args.comps.map((c) => {
    const tier = c.judgment?.tier ?? 'excluded';
    const latest = c.judgment?.reasons.at(-1);
    const reason = c.unsortable ?? (c.judgment?.tier ? latest?.reason : 'Not sorted yet');
    return {
      id: c.id,
      record: c.record,
      tier,
      ...(reason ? { tier_reason: reason } : {}),
      ...(c.judgment?.anchor && tier === 'primary' ? { anchor: true } : {}),
    };
  });
  const deal = dealTermsInput(args.dealTerms);
  return {
    as_of: args.asOf,
    property_type: 'condo',
    subject: {
      identity: identify({ address: i.address?.value ?? null, unit: i.unit?.value ?? null }),
      facts: subjectFacts(args.intake, args.asOf),
    },
    comps,
    ...(args.prices && args.prices.length ? { prices: args.prices } : {}),
    ...(deal ? { deal_terms: deal } : {}),
  };
}
