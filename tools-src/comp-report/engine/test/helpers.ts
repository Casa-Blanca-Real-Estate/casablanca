// Shared test fixtures and builders.

import { readFileSync } from 'node:fs';
import {
  compInputsFromExport, identify, parseExport, type CompInput, type EngineInput, type ParsedExport,
  type PropertyFacts, type Sourced, type Tier,
} from '../index.ts';

export const FIXTURES = new URL('./fixtures/', import.meta.url);

export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(name, FIXTURES)));
}

export function fixtureText(name: string): string {
  return readFileSync(new URL(name, FIXTURES), 'utf8');
}

/** Hannah's export for 100 Barclay St #17L, pulled 2026-09-23. */
export const HANNAH_CSV = 'hannah-100-barclay-17l-2026-09-23.csv';
export const EXPORT_DATE = '2026-09-23';
export const ANALYSIS_DATE = '2026-09-24';

export function hannah(): ParsedExport {
  return parseExport(fixtureBytes(HANNAH_CSV), { as_of: EXPORT_DATE });
}

/** Short names for Hannah's comps → their stable property keys. */
export const KEY = {
  chambers: 'pk1|ny|new york|200 chambers st|10A',
  laight: 'pk1|ny|new york|79 laight st|1A',
  hudson: 'pk1|ny|new york|181 hudson st|1A',
  franklin: 'pk1|ny|new york|5 franklin pl|14A',
  leonard66: 'pk1|ny|new york|66 leonard st|12A',
  leonard108: 'pk1|ny|new york|108 leonard st|7G',
  leonard101: 'pk1|ny|new york|101 leonard st|5B',
  moore: 'pk1|ny|new york|25 n moore st|9C',
  murray: 'pk1|ny|new york|111 murray st|35A',
  barclay11f: 'pk1|ny|new york|100 barclay st|11F',
  reade: 'pk1|ny|new york|77 reade st|PHA',
} as const;

export function comps(tiers: Partial<Record<keyof typeof KEY, Tier>> = {}, parsed = hannah()): CompInput[] {
  const byKey = new Map<string, keyof typeof KEY>(Object.entries(KEY).map(([name, key]) => [key, name as keyof typeof KEY]));
  return compInputsFromExport(parsed, { tier: 'primary' }).map((c) => {
    const name = byKey.get(c.id);
    return name && tiers[name] ? { ...c, tier: tiers[name]!, tier_reason: 'test' } : c;
  });
}

export function agentFact<T>(value: T, confidence: Sourced<T>['confidence'] = 'exact', source: Sourced<T>['source'] = 'agent'): Sourced<T> {
  return { value, source, as_of: ANALYSIS_DATE, confidence };
}

export const SUBJECT_IDENTITY = identify({ address: '100 Barclay Street, New York, NY', unit: '#17L' });

/** 100 Barclay #17L as the agent might describe it — invented facts for exercising the engine. */
export function subjectFacts(overrides: Partial<PropertyFacts> = {}): PropertyFacts {
  return {
    area_sqft: agentFact(2000),
    beds: agentFact(3),
    baths: agentFact(3.5),
    floor: agentFact(17),
    building_stories: agentFact(32),
    building_units: agentFact(156),
    ...overrides,
  };
}

export function input(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    as_of: ANALYSIS_DATE,
    property_type: 'condo',
    subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts() },
    comps: comps(),
    ...overrides,
  };
}

/** Whole-dollar display the way StreetEasy does it: truncated, not rounded. */
export function truncated(x: number): number {
  return Math.trunc(x);
}

/** Every number anywhere in a value, with its path. */
export function allNumbers(value: unknown, path = '$', out: { path: string; value: number }[] = []): { path: string; value: number }[] {
  if (typeof value === 'number') out.push({ path, value });
  else if (Array.isArray(value)) value.forEach((v, i) => allNumbers(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) allNumbers(v, `${path}.${k}`, out);
  return out;
}

/** Every object anywhere in a value that has both of two keys. */
export function allPairs(value: unknown, a: string, b: string, path = '$', out: { path: string; obj: Record<string, unknown> }[] = []) {
  if (Array.isArray(value)) value.forEach((v, i) => allPairs(v, a, b, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (a in obj && b in obj) out.push({ path, obj });
    for (const [k, v] of Object.entries(obj)) allPairs(v, a, b, `${path}.${k}`, out);
  }
  return out;
}
