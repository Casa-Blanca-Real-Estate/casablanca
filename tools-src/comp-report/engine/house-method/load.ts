// Loading the house method — the one versioned file of magnitudes, weights,
// bounds and thresholds (§6.6).
//
// - Production loads production.json, where every value is null until Noble
//   sets it. A production file with any value must carry his sign-off
//   (approval.by and approval.at) or it won't load.
// - A file marked `kind: "test"` loads only under a test runner. Anywhere else
//   the loader throws TestConfigRefusedError — and so does compute(), should a
//   test house method reach it some other way.
// - Interaction magnitudes aren't implemented until CR-R2, so a non-null one
//   is refused rather than silently ignored.

import { FACTORS, magnitudeKeys, type MagnitudeShape } from '../catalog/factors.ts';
import { INTERACTIONS } from '../catalog/interactions.ts';
import { canonicalJson } from '../util/canonical-json.ts';
import { isIsoDate, type IsoDate } from '../util/dates.ts';
import { sha256Tag } from '../util/sha256.ts';
import { isTestRuntime } from './runtime.ts';
import production from './production.json' with { type: 'json' };

export interface LineMagnitudes {
  /** The shape's value slots — null means "not yet determined". */
  values: Record<string, number | null>;
  /** House limits on an adjustment, as a percentage of the comp's price. */
  min_percent: number | null;
  max_percent: number | null;
}

export interface HouseMethod {
  id: string;
  kind: 'production' | 'test';
  version: string;
  /** sha256 of the file's canonical JSON — two files with one version can't pass as the same. */
  hash: string;
  approval: { by: string; at: IsoDate; note?: string } | null;
  lines: Record<string, LineMagnitudes>;
  interactions: Record<string, { magnitude: null }>;
  /** Jev confidence thresholds (§7.1) — for the app; the engine doesn't use them. */
  decision_thresholds: { apply_at_or_above: number | null; ask_below: number | null };
  /** True when no value at all has been determined. */
  all_null: boolean;
}

export class HouseMethodError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length ? `${message}:\n- ${issues.join('\n- ')}` : message);
    this.name = 'HouseMethodError';
    this.issues = issues;
  }
}

export class TestConfigRefusedError extends HouseMethodError {
  constructor(id: string) {
    super(
      `refused to load house method "${id}": it is test-only (kind "test") and the engine is not running under a ` +
      'test runner. Test magnitudes are made up; production uses house-method/production.json.',
    );
    this.name = 'TestConfigRefusedError';
  }
}

/** Every line that takes a magnitude, with its shape. */
function adjustableLines(): Map<string, MagnitudeShape> {
  const out = new Map<string, MagnitudeShape>();
  for (const factor of FACTORS) {
    if (factor.role !== 'adjustment') continue;
    for (const line of factor.lines) out.set(line.facet ? `${factor.id}.${line.facet}` : factor.id, line.magnitude);
  }
  return out;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function checkSlot(lineId: string, key: string, value: unknown, shape: MagnitudeShape, issues: string[]): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(`${lineId}.${key} must be a number or null`);
    return null;
  }
  const signed = shape.shape === 'per_unit' && shape.per === 'month'; // the market can fall
  if (!signed && key !== 'min_percent' && key !== 'max_percent' && value < 0) {
    issues.push(`${lineId}.${key} must not be negative — the direction of a difference supplies the sign`);
  }
  if (key.startsWith('weight_') && value > 1) issues.push(`${lineId}.${key} is a share of interior $/sqft and must be between 0 and 1`);
  return value;
}

/** Validates a house-method file and returns it ready for the engine. */
export function loadHouseMethod(raw: unknown): HouseMethod {
  if (!isObject(raw)) throw new HouseMethodError('a house method must be a JSON object');
  const issues: string[] = [];
  const id = typeof raw['id'] === 'string' && raw['id'] !== '' ? raw['id'] : null;
  if (!id) issues.push('id must be a non-empty string');
  const kind = raw['kind'];
  if (kind !== 'production' && kind !== 'test') issues.push('kind must be "production" or "test"');
  const version = typeof raw['version'] === 'string' && raw['version'] !== '' ? raw['version'] : null;
  if (!version) issues.push('version must be a non-empty string');

  // Refuse test values before looking any further.
  if (kind === 'test' && !isTestRuntime()) throw new TestConfigRefusedError(id ?? '(no id)');

  let approval: HouseMethod['approval'] = null;
  if (raw['approval'] !== null && raw['approval'] !== undefined) {
    const a = raw['approval'];
    if (!isObject(a) || typeof a['by'] !== 'string' || a['by'] === '' || !isIsoDate(a['at'])) {
      issues.push('approval must be null or { by, at (YYYY-MM-DD), note? }');
    } else {
      approval = typeof a['note'] === 'string' ? { by: a['by'], at: a['at'], note: a['note'] } : { by: a['by'], at: a['at'] };
    }
  }

  const expected = adjustableLines();
  const lines: Record<string, LineMagnitudes> = {};
  let anyValue = false;
  if (!isObject(raw['lines'])) {
    issues.push('lines must be an object');
  } else {
    const given = raw['lines'];
    for (const key of Object.keys(given)) if (!expected.has(key)) issues.push(`lines.${key} is not a factor in the catalog`);
    for (const [lineId, shape] of expected) {
      const entry = given[lineId];
      if (!isObject(entry)) { issues.push(`lines.${lineId} is missing`); continue; }
      const slots = [...magnitudeKeys(shape), 'min_percent', 'max_percent'];
      for (const key of Object.keys(entry)) if (!slots.includes(key)) issues.push(`lines.${lineId}.${key} is not a slot of its ${shape.shape} shape`);
      const values: Record<string, number | null> = {};
      for (const key of magnitudeKeys(shape)) {
        if (!(key in entry)) { issues.push(`lines.${lineId}.${key} is missing`); continue; }
        values[key] = checkSlot(lineId, key, entry[key], shape, issues);
        if (values[key] !== null) anyValue = true;
      }
      const degrees = ['small', 'moderate', 'large'].map((k) => values[k]).filter((v): v is number => typeof v === 'number');
      if (degrees.some((v, i) => i > 0 && v < degrees[i - 1]!)) issues.push(`lines.${lineId}: small ≤ moderate ≤ large`);
      const min = checkSlot(lineId, 'min_percent', entry['min_percent'] ?? null, shape, issues);
      const max = checkSlot(lineId, 'max_percent', entry['max_percent'] ?? null, shape, issues);
      if (min !== null || max !== null) anyValue = true;
      if (min !== null && max !== null && min > max) issues.push(`lines.${lineId}: min_percent must not exceed max_percent`);
      lines[lineId] = { values, min_percent: min, max_percent: max };
    }
  }

  const interactions: Record<string, { magnitude: null }> = {};
  if (!isObject(raw['interactions'])) {
    issues.push('interactions must be an object');
  } else {
    const given = raw['interactions'];
    for (const key of Object.keys(given)) if (!INTERACTIONS.some((i) => i.id === key)) issues.push(`interactions.${key} is not in the interaction map`);
    for (const def of INTERACTIONS) {
      const entry = given[def.id];
      if (!isObject(entry) || !('magnitude' in entry)) { issues.push(`interactions.${def.id} is missing`); continue; }
      if (entry['magnitude'] !== null) {
        issues.push(`interactions.${def.id}.magnitude must be null — interaction magnitudes aren't implemented until CR-R2`);
      }
      interactions[def.id] = { magnitude: null };
    }
  }

  const thresholds = { apply_at_or_above: null as number | null, ask_below: null as number | null };
  const dt = raw['decision_thresholds'];
  if (!isObject(dt)) {
    issues.push('decision_thresholds must be an object');
  } else {
    for (const key of ['apply_at_or_above', 'ask_below'] as const) {
      const v = dt[key];
      if (v === null || v === undefined) continue;
      if (typeof v !== 'number' || v < 0 || v > 1) issues.push(`decision_thresholds.${key} must be null or between 0 and 1`);
      else { thresholds[key] = v; anyValue = true; }
    }
  }

  if (kind === 'production' && anyValue && !approval) {
    issues.push("a production house method with any value needs Noble's sign-off: approval.by and approval.at");
  }
  if (issues.length) throw new HouseMethodError(`house method "${id ?? '?'}" is invalid`, issues);

  return {
    id: id!,
    kind: kind as 'production' | 'test',
    version: version!,
    hash: sha256Tag(canonicalJson(raw)),
    approval,
    lines,
    interactions,
    decision_thresholds: thresholds,
    all_null: !anyValue,
  };
}

let productionCache: HouseMethod | null = null;

/** The production house method — what the app and the functions use. */
export function productionHouseMethod(): HouseMethod {
  productionCache ??= loadHouseMethod(production);
  return productionCache;
}

/** Called by compute(): a test house method can't be used outside a test runner, however it arrived. */
export function assertUsable(houseMethod: HouseMethod): void {
  if (houseMethod.kind === 'test' && !isTestRuntime()) throw new TestConfigRefusedError(houseMethod.id);
}
