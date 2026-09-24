// Input validation. A malformed input is a programming error in the caller,
// not a data gap: compute() throws EngineInputError listing every problem at
// once, rather than computing on something it can't trust. (Data that's merely
// missing — no area, no floor — is not an error; it's called out in the output.)

import { findLine, FACTOR_BY_ID, type MagnitudeShape } from '../catalog/factors.ts';
import { FACT_CHECKS, isObj, nonNegInt, posInt } from '../facts-schema.ts';
import { isIsoDate } from '../util/dates.ts';
import {
  CONFIDENCES, SOURCES, type AgentValue, type EngineInput, type FactField, type Sourced,
} from '../types.ts';

export { FACT_CHECKS } from '../facts-schema.ts';

export class EngineInputError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`invalid engine input:\n- ${issues.join('\n- ')}`);
    this.name = 'EngineInputError';
    this.issues = issues;
  }
}

function checkSourced(where: string, field: FactField, s: unknown, issues: string[]): void {
  if (!isObj(s)) { issues.push(`${where}: must be a sourced value { value, source, as_of, confidence }`); return; }
  const sv = s as unknown as Sourced<unknown>;
  if (!SOURCES.includes(sv.source)) issues.push(`${where}: source must be one of ${SOURCES.join(', ')}`);
  if (!CONFIDENCES.includes(sv.confidence)) issues.push(`${where}: confidence must be one of ${CONFIDENCES.join(', ')}`);
  if (!isIsoDate(sv.as_of)) issues.push(`${where}: as_of must be a YYYY-MM-DD date`);
  const spec = FACT_CHECKS[field];
  if (!spec.check(sv.value)) issues.push(`${where}: value must be ${spec.expects}, got ${JSON.stringify(sv.value)}`);
}

function checkFacts(where: string, facts: unknown, issues: string[]): void {
  if (!isObj(facts)) { issues.push(`${where}: facts must be an object`); return; }
  for (const [field, value] of Object.entries(facts)) {
    if (!(field in FACT_CHECKS)) { issues.push(`${where}.${field}: not a fact field`); continue; }
    if (value === undefined) continue;
    checkSourced(`${where}.${field}`, field as FactField, value, issues);
  }
}

function checkIdentity(where: string, identity: unknown, issues: string[]): void {
  if (!isObj(identity) || !isObj(identity['address']) || !isObj(identity['unit'])) {
    issues.push(`${where}: identity must come from identify() — { key, building_key, address, unit, streeteasy }`);
  }
}

/** Which agent value forms a line's magnitude shape accepts. */
function agentValueAllowed(value: AgentValue, shape: MagnitudeShape): boolean {
  if ('percent' in value || 'dollars' in value) return shape.shape !== 'none';
  if ('percent_per_unit' in value || 'dollars_per_unit' in value) return shape.shape === 'per_unit';
  if ('elasticity' in value) return shape.shape === 'size_elasticity';
  if ('multiplier' in value) return shape.shape === 'capitalized';
  if ('weights' in value) return shape.shape === 'effective_area';
  return false;
}

function agentValueNumbers(value: AgentValue): number[] {
  if ('weights' in value) return Object.values(value.weights).filter((v): v is number => v !== undefined);
  return Object.values(value) as number[];
}

export function validateInput(input: EngineInput): void {
  const issues: string[] = [];
  if (!isObj(input)) throw new EngineInputError(['input must be an object']);
  if (!isIsoDate(input.as_of)) issues.push('as_of must be a YYYY-MM-DD date — the engine has no clock');
  if (input.property_type !== 'condo' && input.property_type !== 'coop') issues.push('property_type must be "condo" or "coop"');

  if (!isObj(input.subject)) issues.push('subject is required');
  else {
    checkIdentity('subject.identity', input.subject.identity, issues);
    checkFacts('subject.facts', input.subject.facts, issues);
  }

  const compIds = new Set<string>();
  if (!Array.isArray(input.comps)) issues.push('comps must be an array');
  else {
    let anchors = 0;
    input.comps.forEach((c, i) => {
      const where = `comps[${i}]`;
      if (!isObj(c)) { issues.push(`${where} must be an object`); return; }
      if (typeof c.id !== 'string' || c.id === '') issues.push(`${where}.id must be a non-empty string`);
      else if (compIds.has(c.id)) issues.push(`${where}.id "${c.id}" is used twice`);
      else compIds.add(c.id);
      if (!['primary', 'secondary', 'excluded'].includes(c.tier)) issues.push(`${where}.tier must be primary, secondary or excluded`);
      if (c.anchor) anchors++;
      if (!isObj(c.record)) { issues.push(`${where}.record is required`); return; }
      checkIdentity(`${where}.record.identity`, c.record.identity, issues);
      if (!isObj(c.record.status)) issues.push(`${where}.record.status is required`);
      else if (c.record.status.evidence_class !== null && !['sold', 'in_contract', 'active'].includes(c.record.status.evidence_class)) {
        issues.push(`${where}.record.status.evidence_class must be sold, in_contract, active or null`);
      }
      checkFacts(`${where}.record.facts`, c.record.facts, issues);
      (c.record.suggestions ?? []).forEach((x, j) => {
        if (!isObj(x) || !(x.field in FACT_CHECKS)) issues.push(`${where}.record.suggestions[${j}] must be { field, value }`);
        else checkSourced(`${where}.record.suggestions[${j}]`, x.field, x.value, issues);
      });
      if (!isObj(c.record.flags)) issues.push(`${where}.record.flags is required`);
    });
    if (anchors > 1) issues.push('at most one comp can be the anchor');
  }

  const statementIds = new Set<string>();
  const uniqueId = (where: string, id: unknown) => {
    if (typeof id !== 'string' || id === '') issues.push(`${where}.id must be a non-empty string`);
    else if (statementIds.has(id)) issues.push(`${where}.id "${id}" is used twice`);
    else statementIds.add(id);
  };
  const compRef = (where: string, id: unknown) => {
    if (typeof id !== 'string' || !compIds.has(id)) issues.push(`${where}: no comp with id ${JSON.stringify(id)}`);
  };

  (input.stated_facts ?? []).forEach((s, i) => {
    const where = `stated_facts[${i}]`;
    uniqueId(where, s?.id);
    if (!isObj(s)) return;
    if (s.target !== 'subject') {
      if (!isObj(s.target)) issues.push(`${where}.target must be "subject" or { comp_id }`);
      else compRef(`${where}.target`, s.target.comp_id);
    }
    if (!(s.field in FACT_CHECKS)) issues.push(`${where}.field "${String(s.field)}" is not a fact field`);
    else checkSourced(`${where}.value`, s.field, s.value, issues);
  });

  (input.assessments ?? []).forEach((a, i) => {
    const where = `assessments[${i}]`;
    uniqueId(where, a?.id);
    if (!isObj(a)) return;
    compRef(where, a.comp_id);
    const found = findLine(a.factor, a.facet);
    if (!found || found.factor.role !== 'adjustment') issues.push(`${where}: ${a.factor}${a.facet ? '.' + a.facet : ''} is not an adjustable factor line`);
    if (!['comp_superior', 'comp_inferior', 'similar', 'differs'].includes(a.direction)) issues.push(`${where}.direction is invalid`);
    if (a.degree !== undefined && !['small', 'moderate', 'large'].includes(a.degree)) issues.push(`${where}.degree must be small, moderate or large`);
    if (!['jev', 'fallback', 'agent'].includes(a.source)) issues.push(`${where}.source must be jev, fallback or agent`);
    if (!CONFIDENCES.includes(a.confidence)) issues.push(`${where}.confidence is invalid`);
    if (a.probability !== undefined && !(typeof a.probability === 'number' && a.probability >= 0 && a.probability <= 1)) {
      issues.push(`${where}.probability must be between 0 and 1`);
    }
    if (!isIsoDate(a.as_of)) issues.push(`${where}.as_of must be a YYYY-MM-DD date`);
  });

  (input.agent_adjustments ?? []).forEach((a, i) => {
    const where = `agent_adjustments[${i}]`;
    uniqueId(where, a?.id);
    if (!isObj(a)) return;
    const found = findLine(a.factor, a.facet);
    if (!found || found.factor.role !== 'adjustment') {
      issues.push(`${where}: ${a.factor}${a.facet ? '.' + a.facet : ''} is not an adjustable factor line` +
        (FACTOR_BY_ID.get(a.factor)?.lines.length! > 1 && !a.facet ? ' — name a facet' : ''));
    } else if (!isObj(a.value) || Object.keys(a.value).length !== 1 || !agentValueAllowed(a.value, found.line.magnitude)) {
      issues.push(`${where}.value doesn't fit ${a.factor}'s ${found.line.magnitude.shape} shape`);
    } else {
      const numbers = agentValueNumbers(a.value);
      if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n))) issues.push(`${where}.value must hold finite numbers`);
      if (('percent' in a.value && Math.abs(a.value.percent) > 100) || ('percent_per_unit' in a.value && Math.abs(a.value.percent_per_unit) > 100)) {
        issues.push(`${where}.value: percentages are written as percent (5 means 5%), and must be within ±100`);
      }
      if ('dollars' in a.value && !Number.isSafeInteger(a.value.dollars)) issues.push(`${where}.value.dollars must be whole dollars`);
      // A value is a magnitude: the comparison supplies the direction. Only the market's movement can be negative.
      if (a.factor !== 'recency_market' && numbers.some((n) => n < 0)) {
        issues.push(`${where}.value must not be negative — the comparison says which way a comp moves; record a judgment (assessment) to say which side is better`);
      }
    }
    (a.comp_ids ?? []).forEach((id, j) => compRef(`${where}.comp_ids[${j}]`, id));
    if (!isIsoDate(a.as_of)) issues.push(`${where}.as_of must be a YYYY-MM-DD date`);
  });

  const m = input.method;
  if (m !== undefined) {
    if (typeof m !== 'object' || m === null || Array.isArray(m)) issues.push('method must be an object');
    else {
      if (m.lead && !['unit_rate.median', 'unit_rate.mean', 'unit_rate.anchor', 'adjusted_price.median', 'adjusted_price.mean', 'adjusted_price.anchor'].includes(m.lead.indicator)) {
        issues.push('method.lead.indicator is not an indicator');
      }
      if (m.recency) {
        if ('months' in m.recency) { if (!posInt(m.recency.months)) issues.push('method.recency.months must be a whole number above zero'); }
        else if (!isIsoDate((m.recency as { since?: unknown }).since)) issues.push('method.recency needs months or since (YYYY-MM-DD)');
      }
      if (m.narrowing) {
        const n = m.narrowing;
        if (n.low !== undefined && !posInt(n.low)) issues.push('method.narrowing.low must be whole dollars');
        if (n.high !== undefined && !posInt(n.high)) issues.push('method.narrowing.high must be whole dollars');
        if (n.low !== undefined && n.high !== undefined && n.low >= n.high) issues.push('method.narrowing.low must be below high');
        if (typeof n.reason !== 'string' || n.reason.trim() === '') issues.push('method.narrowing needs a reason');
        if (!isIsoDate(n.as_of)) issues.push('method.narrowing.as_of must be a YYYY-MM-DD date');
      }
    }
  }

  const priceIds = new Set<string>();
  (input.prices ?? []).forEach((p, i) => {
    const where = `prices[${i}]`;
    if (!isObj(p)) { issues.push(`${where} must be an object`); return; }
    if (typeof p.id !== 'string' || p.id === '' || priceIds.has(p.id)) issues.push(`${where}.id must be a unique non-empty string`);
    else priceIds.add(p.id);
    if (!posInt(p.price)) issues.push(`${where}.price must be whole dollars above zero`);
    if (!['list', 'offer', 'target', 'call', 'what_if', 'other'].includes(p.kind)) issues.push(`${where}.kind is invalid`);
  });

  const checkFinancing = (where: string, f: Record<string, unknown>) => {
    const dp = f['down_payment'];
    if (!isObj(dp) || !(('percent' in dp && typeof dp['percent'] === 'number' && dp['percent'] >= 0 && dp['percent'] <= 100) ||
      ('dollars' in dp && nonNegInt(dp['dollars'])))) {
      issues.push(`${where}.down_payment must be { percent: 0–100 } or { dollars }`);
    }
    const rate = f['annual_rate_percent'];
    if (typeof rate !== 'number' || rate < 0 || rate > 100) issues.push(`${where}.annual_rate_percent must be 0–100 (6.25 means 6.25%)`);
    const term = f['term_years'];
    if (!posInt(term) || (term as number) > 50) issues.push(`${where}.term_years must be a whole number of years, 1–50`);
    for (const k of ['insurance_monthly', 'other_ownership_costs_monthly']) {
      if (f[k] !== undefined && !nonNegInt(f[k])) issues.push(`${where}.${k} must be whole dollars`);
    }
  };
  if (input.financing !== undefined) {
    const f = input.financing as unknown;
    if (!isObj(f)) issues.push('financing must be an object');
    else {
      const price = f['price'];
      if (price !== 'base' && !(isObj(price) && typeof price['named_price_id'] === 'string' && priceIds.has(price['named_price_id']))) {
        issues.push('financing.price must be "base" or { named_price_id } of a named price');
      }
      checkFinancing('financing', f);
    }
  }

  if (input.deal_terms !== undefined) {
    const d = input.deal_terms as unknown;
    if (!isObj(d)) issues.push('deal_terms must be an object');
    else {
      if (!['buyer_traditional', 'buyer_rent_to_own', 'seller_pricing'].includes(d['template'] as string)) issues.push('deal_terms.template is invalid');
      for (const k of ['price', 'seller_target']) if (d[k] !== undefined && !posInt(d[k])) issues.push(`deal_terms.${k} must be whole dollars`);
      const dep = d['deposit'];
      if (dep !== undefined && !(isObj(dep) && (('percent' in dep && typeof dep['percent'] === 'number' && dep['percent'] >= 0 && dep['percent'] <= 100) || ('dollars' in dep && nonNegInt(dep['dollars']))))) {
        issues.push('deal_terms.deposit must be { percent } or { dollars }');
      }
      if (d['target_closing'] !== undefined && !isIsoDate(d['target_closing'])) issues.push('deal_terms.target_closing must be a YYYY-MM-DD date');
      if (d['financing'] !== undefined) {
        if (!isObj(d['financing'])) issues.push('deal_terms.financing must be an object');
        else checkFinancing('deal_terms.financing', d['financing']);
      }
      const rent = d['interim_rent'];
      if (rent !== undefined && !(isObj(rent) && nonNegInt(rent['monthly']))) issues.push('deal_terms.interim_rent.monthly must be whole dollars');
    }
  }

  if (issues.length) throw new EngineInputError(issues);
}
