// The comp report calculation engine — the public API.
//
// Code computes, the model explains: every figure in every comp report comes
// from here. Pure TypeScript with no DOM, no network and no clock, so the same
// module runs in the browser (instant recompute) and in Netlify functions
// (authoritative, stored versions). See README.md.

import { canonicalJson } from './util/canonical-json.ts';
import { sha256Tag } from './util/sha256.ts';
import type { EngineOutput } from './compute/output.ts';
import type { ParsedExport } from './parser/index.ts';
import type { CompInput, Tier } from './types.ts';

export { ENGINE_VERSION, PARSER_VERSION, EXPORT_SCHEMA } from './version.ts';
export * from './types.ts';
export type * from './compute/output.ts';
export { compute, EngineInputError, type ComputeOptions } from './compute/index.ts';
export {
  parseExport, parseCsvExport, parseXlsxExport, ParseError,
  type ParsedExport, type ParseOptions, type ParseWarning, type ParseWarningCode,
} from './parser/index.ts';
export {
  identify, sameBuilding, sameUnit, normalizeStreet, normalizeUnit, parseStreetEasyUrl, PROPERTY_KEY_VERSION, type IdentityInput,
} from './parser/property-key.ts';
/** Comps from a StreetEasy link (read by the server with Firecrawl) and comps typed in by the agent (§6.2). */
export {
  compRecordFromListing, confirmListingRecord, LISTING_EXTRACT_PROMPT, LISTING_EXTRACT_SCHEMA,
  type ListingExtract, type ListingRead, type ListingReadOptions,
} from './parser/listing.ts';
export { compRecordFromManual, type ManualCompFields, type ManualReadOptions, type ManualValue } from './parser/manual.ts';
export { FACTORS, FACTOR_BY_ID, allLines, lineId, magnitudeKeys, type FactorDefinition, type FactorLine, type MagnitudeShape } from './catalog/factors.ts';
export { INTERACTIONS, interactionPairs, type InteractionDefinition, type InteractionMember, type Relationship } from './catalog/interactions.ts';
export {
  loadHouseMethod, productionHouseMethod, HouseMethodError, TestConfigRefusedError, type HouseMethod, type LineMagnitudes,
} from './house-method/load.ts';
export { isTestRuntime } from './house-method/runtime.ts';
/** For building a subject's facts from listing tags exactly as the parser builds a comp's. */
export { deriveFromAmenities, deriveFromFeatures, normalizeTag, parkingKind, viewKind } from './parser/derive.ts';
export { FACT_CHECKS } from './facts-schema.ts';

/**
 * The engine's comp inputs for every comp in a parsed export, each keyed by its
 * stable property key. The tier is the caller's decision — the agent tiers each
 * comp in the first-pass review (§3).
 */
export function compInputsFromExport(parsed: ParsedExport, options: { tier: Tier }): CompInput[] {
  const used = new Set<string>();
  return parsed.comps.map((record) => {
    const row = record.origin?.row ?? 0;
    let id = record.identity.key ?? `row-${row}`;
    if (used.has(id)) id = `${id}#row${row}`;
    used.add(id);
    return { id, record, tier: options.tier };
  });
}

/** True when an output's hash matches its content — a stored version hasn't been altered. */
export function verifyOutputHash(output: EngineOutput): boolean {
  const copy = { ...output, meta: { ...output.meta, output_hash: '' } };
  return sha256Tag(canonicalJson(copy)) === output.meta.output_hash;
}
