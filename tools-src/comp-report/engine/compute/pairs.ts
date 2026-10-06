// The differences between comps (§6.6): every included comp against every
// other of its status, sold with sold first. For each pair: the gap in price
// and in $/sqft, and the factors that differ — the comparison the engine runs
// comp against subject, run comp against comp. A clean pair, where only one
// factor or one A.5 overlap group differs, is evidence of what that factor adds
// here, and the clean pairs are summarised factor by factor. Evidence only:
// nothing here moves a number.
//
// Two rules keep "clean" honest:
// - Two comps in one building share its building and location factors by
//   definition — service, amenities, carrying costs … — so for them those lines
//   aren't differences, however the two listings' tags were typed.
// - Two sales months apart differ in the market too. Within the house method's
//   "old for a comp" months (Kara's six) the time between them is shown, not
//   counted; past it, it counts as a difference. An ask on the market now is
//   current evidence, so two active listings are never apart in time.
//
// Factors only a judgment compares — condition, layout, light and the rest —
// aren't compared between comps, since every judgment is of a comp against the
// home. A clean pair is clean on the facts the engine reads.

import { FACTOR_BY_ID, FACTORS, findLine, lineId } from '../catalog/factors.ts';
import { INTERACTIONS, memberCovers, type InteractionMember } from '../catalog/interactions.ts';
import type { CheckThresholds } from '../house-method/load.ts';
import { sameBuilding } from '../parser/property-key.ts';
import { addMonths } from '../util/dates.ts';
import { compareStrings, maxOf, median, minOf } from '../util/numbers.ts';
import { EVIDENCE_CLASSES, type Confidence, type EvidenceClass, type IsoDate, type ReportPropertyType } from '../types.ts';
import { compareComp } from './compare.ts';
import { weakest } from './facts.ts';
import { dollarsText, figure } from './figure.ts';
import { propertyLabel } from './labels.ts';
import { describeMarketDate, marketDate, wholeMonthsBetween } from './market-date.ts';
import type { CleanPairEvidence, FigureUnit, GapSummary, PairDifference, PairOut, PairsOut, ResultKind } from './output.ts';
import type { CompState } from './results.ts';

export interface PairContext {
  kind: ResultKind;
  mode: 'report' | 'what_if';
  asOf: IsoDate;
  reportType: ReportPropertyType;
  thresholds: CheckThresholds;
}

const SAME_BUILDING_GROUPS = new Set(['building', 'location']);

function memberName(m: InteractionMember): string {
  const found = findLine(m.factor, m.facet);
  return m.facet && found ? found.line.name : FACTOR_BY_ID.get(m.factor)?.name ?? m.factor;
}

function listed(names: string[]): string {
  const lower = names.map((n, i) => (i === 0 ? n : n.charAt(0).toLowerCase() + n.slice(1)));
  return lower.length <= 2 ? lower.join(' and ') : `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
}

/** Factor lines the engine can compare from facts; the rest take a judgment, and a judgment is always of a comp against the home. */
function comparableLines(ctx: PairContext): Set<string> {
  const probe = compareComp('probe', {}, {}, 'sold', [], { kind: ctx.kind, mode: ctx.mode, reportType: ctx.reportType, asOf: ctx.asOf });
  return new Set(probe.comparisons.map((c) => c.line));
}

function pairOf(hiState: CompState, loState: CompState, cls: EvidenceClass, ctx: PairContext): PairOut {
  const hiName = propertyLabel(hiState.input.record.identity, hiState.id);
  const loName = propertyLabel(loState.input.record.identity, loState.id);
  const hiPrice = hiState.price!;
  const loPrice = loState.price!;
  const basisWord = cls === 'sold' ? 'sale' : 'asking';
  const byRate = hiState.unit_rate !== null && loState.unit_rate !== null;
  const same = sameBuilding(hiState.input.record.identity, loState.input.record.identity);

  const differences: PairDifference[] = [];
  const alike: string[] = [];
  const unknown: PairOut['unknown'] = [];
  const compared = compareComp(`${hiState.id} over ${loState.id}`, hiState.facts, loState.facts, cls, [], {
    kind: ctx.kind, mode: ctx.mode, reportType: ctx.reportType, asOf: ctx.asOf, names: { subject: hiName, comp: loName },
  });
  for (const c of compared.comparisons) {
    if (c.line === 'recency_market') continue; // time between the two is measured below
    const group = FACTOR_BY_ID.get(c.factor)?.group ?? '';
    if (same && SAME_BUILDING_GROUPS.has(group)) { alike.push(c.line); continue; }
    if (c.status !== 'compared') { unknown.push({ line: c.line, name: c.name, missing: c.missing.map((m) => m.label) }); continue; }
    if (c.direction === 'similar' || c.direction === null) { alike.push(c.line); continue; }
    differences.push({
      line: c.line, factor: c.factor, facet: c.facet, name: c.name,
      // The comparison ran with the higher comp as "subject": a worse "comp" means the higher one is better.
      direction: c.direction === 'comp_inferior' ? 'higher_better' : c.direction === 'comp_superior' ? 'lower_better' : 'differs',
      // Units are subject minus comp — the higher comp's value less the lower's — except carry, which runs the other way.
      difference: c.units === null ? null : c.line === 'carrying_costs' ? -c.units : c.units,
      unit_label: c.unit_label, confidence: c.confidence, basis: c.basis,
    });
  }

  // Time between them: counted only past the house method's "old for a comp" months.
  let monthsApart: number | null = null;
  if (cls !== 'active') {
    const mh = marketDate(hiState.facts, cls);
    const ml = marketDate(loState.facts, cls);
    if (mh && ml) {
      monthsApart = wholeMonthsBetween(mh.date, ml.date);
      const [earlier, later] = mh.date <= ml.date ? [mh.date, ml.date] : [ml.date, mh.date];
      const old = ctx.thresholds.sale_age_months.old;
      if (later > addMonths(earlier, old)) {
        differences.push({
          line: 'recency_market', factor: 'recency_market', facet: null, name: 'Time between them',
          direction: 'differs', difference: mh.date >= ml.date ? monthsApart : -monthsApart, unit_label: 'months',
          confidence: weakest(mh.confidence, ml.confidence),
          basis: `${hiName} ${describeMarketDate(mh)}; ${loName} ${describeMarketDate(ml)} — over ${old} months apart, "old for a comp" (${ctx.thresholds.sale_age_months.basis})`,
        });
      } else alike.push('recency_market');
    } else {
      unknown.push({ line: 'recency_market', name: 'Time between them', missing: [...(mh ? [] : [`${hiName}'s date`]), ...(ml ? [] : [`${loName}'s date`])] });
    }
  }

  // Clean: one factor, or the members of one overlap group (a hub's with its hub among them).
  let isolates: PairOut['isolates'] = null;
  let notClean: string | null = null;
  const factors = [...new Set(differences.map((d) => d.factor))];
  if (differences.length === 0) {
    notClean = "nothing the engine compares differs — the gap lies in what it can't compare: condition, layout, light and the rest";
  } else if (factors.length === 1) {
    const f = FACTOR_BY_ID.get(factors[0]!);
    isolates = { kind: 'factor', key: factors[0]!, name: f?.name ?? 'Time between them' };
  } else {
    for (const def of INTERACTIONS) {
      if (def.relationship !== 'overlap') continue;
      const covered = differences.every((d) => def.members.some((m) => memberCovers(m, d.factor, d.facet)));
      const hubIn = def.pattern !== 'hub' || differences.some((d) => memberCovers(def.members[0]!, d.factor, d.facet));
      if (covered && hubIn) {
        isolates = { kind: 'overlap_group', key: def.id, name: listed(def.members.map(memberName)) };
        break;
      }
    }
    if (!isolates) {
      const names = factors.map((f) => FACTOR_BY_ID.get(f)?.name ?? 'Time between them');
      const all = listed(names);
      notClean = `${factors.length} factors differ: ${all.charAt(0).toLowerCase()}${all.slice(1)}`;
    }
  }

  return {
    evidence_class: cls,
    basis: cls === 'sold' ? 'sale' : 'ask',
    higher: hiState.id,
    lower: loState.id,
    ordered_by: byRate ? 'price_per_sqft' : 'price',
    price_gap: figure(hiPrice.value - loPrice.value, 'usd', weakest(hiPrice.confidence, loPrice.confidence), `${hiName}'s ${basisWord} price less ${loName}'s`, ctx.asOf),
    price_per_sqft_gap: byRate
      ? figure(hiState.unit_rate! - loState.unit_rate!, 'usd_per_sqft', weakest(hiState.unit_rate_confidence, loState.unit_rate_confidence), `${hiName}'s $/sqft (${basisWord} basis) less ${loName}'s`, ctx.asOf)
      : null,
    same_building: same,
    months_apart: monthsApart,
    differences,
    alike,
    unknown,
    clean: isolates !== null,
    isolates,
    not_clean_because: notClean,
  };
}

function gapSummary(values: { value: number; confidence: Confidence }[], unit: FigureUnit, what: string, asOf: IsoDate): GapSummary | null {
  if (values.length === 0) return null;
  const xs = values.map((v) => v.value);
  const conf = weakest(...values.map((v) => v.confidence));
  const n = values.length;
  const over = `over ${n} clean pair${n === 1 ? '' : 's'}`;
  return {
    n,
    median: figure(median(xs)!, unit, conf, `median ${what}, ${over}`, asOf),
    min: figure(minOf(xs)!, unit, conf, `lowest ${what}, ${over}`, asOf),
    max: figure(maxOf(xs)!, unit, conf, `highest ${what}, ${over}`, asOf),
  };
}

/** Every pair within each status, and what the clean ones say, factor by factor. */
export function buildPairs(states: readonly CompState[], ctx: PairContext): PairsOut {
  const pairs: PairOut[] = [];
  for (const cls of EVIDENCE_CLASSES) {
    // States come sorted by id, so every pair is met once, in a fixed order.
    const members = states.filter((s) => s.included && s.evidence_class === cls && s.price);
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i]!;
        const b = members[j]!;
        const aHigher = a.unit_rate !== null && b.unit_rate !== null ? a.unit_rate >= b.unit_rate : a.price!.value >= b.price!.value;
        pairs.push(aHigher ? pairOf(a, b, cls, ctx) : pairOf(b, a, cls, ctx));
      }
    }
  }

  // Clean-pair evidence per status and per what it isolates: the gap from the side with more or better of it.
  const groups = new Map<string, { cls: EvidenceClass; isolates: NonNullable<PairOut['isolates']>; pairs: PairOut[] }>();
  for (const p of pairs) {
    if (!p.isolates) continue;
    const key = `${EVIDENCE_CLASSES.indexOf(p.evidence_class)}|${p.isolates.key}`;
    const g = groups.get(key) ?? { cls: p.evidence_class, isolates: p.isolates, pairs: [] };
    g.pairs.push(p);
    groups.set(key, g);
  }
  const evidence: CleanPairEvidence[] = [];
  for (const key of [...groups.keys()].sort(compareStrings)) {
    const g = groups.get(key)!;
    const perSqft: { value: number; confidence: Confidence }[] = [];
    const price: { value: number; confidence: Confidence }[] = [];
    let undirected = 0;
    const time = g.isolates.key === 'recency_market';
    for (const p of g.pairs) {
      const directions = new Set(p.differences.map((d) => d.direction));
      // Time has no better side: its gap is the later less the earlier — the market's movement between them.
      const later = p.differences.find((d) => d.line === 'recency_market')?.difference ?? 0;
      const sign = time ? Math.sign(later)
        : directions.size === 1 && directions.has('higher_better') ? 1 : directions.size === 1 && directions.has('lower_better') ? -1 : 0;
      if (sign === 0) { undirected++; continue; }
      price.push({ value: sign * p.price_gap.value, confidence: p.price_gap.confidence });
      if (p.price_per_sqft_gap) perSqft.push({ value: sign * p.price_per_sqft_gap.value, confidence: p.price_per_sqft_gap.confidence });
    }
    const n = g.pairs.length;
    const from = `from ${n} clean pair${n === 1 ? '' : 's'}`;
    const asOf = g.pairs[0]!.price_gap.as_of;
    const sides = time ? ["the later one's", "the earlier's"] : ["the better side's", "the other's"];
    const perSqftGap = gapSummary(perSqft, 'usd_per_sqft', `${sides[0]} $/sqft less ${sides[1]}`, asOf);
    const priceGap = gapSummary(price, 'usd', `${sides[0]} price less ${sides[1]}`, asOf);
    const median = perSqftGap?.median.value ?? priceGap?.median.value ?? null;
    const amount = median === null ? null : `${dollarsText(time ? Math.abs(median) : median)}${perSqftGap ? '/sq ft' : ''}`;
    const about = amount === null ? null : time ? `the later one about ${amount} ${median! < 0 ? 'lower' : 'higher'}` : `about ${amount}`;
    const status = g.cls === 'sold' ? '' : ` (${g.cls === 'off_market' ? "didn't sell" : g.cls.replace('_', ' ')}, ask basis)`;
    const summary = about
      ? `${g.isolates.name}: ${about}, ${from}${undirected > 0 ? ` (${undirected} need a judgment of which side is better)` : ''}${status}`
      : `${g.isolates.name}: ${from}, but which side is better takes a judgment${status}`;
    evidence.push({
      evidence_class: g.cls,
      kind: g.isolates.kind,
      key: g.isolates.key,
      name: g.isolates.name,
      n,
      pairs: g.pairs.map((p) => ({ higher: p.higher, lower: p.lower })),
      per_sqft_gap: perSqftGap,
      price_gap: priceGap,
      undirected,
      summary,
    });
  }

  const comparable = comparableLines(ctx);
  const notCompared: string[] = [];
  for (const f of FACTORS) {
    if (f.role !== 'adjustment' || !f.property_types.includes(ctx.reportType)) continue;
    for (const l of f.lines) if (!comparable.has(lineId(f.id, l.facet))) notCompared.push(l.name);
  }
  return {
    pairs,
    clean_pair_evidence: evidence,
    not_compared: notCompared,
    note: `Every included comp against every other of its status: the gap in price and $/sqft, and the factors that differ. A clean pair differs in one factor, or in one overlap group (Appendix A.5). Two comps in one building share its building factors; sales within ${ctx.thresholds.sale_age_months.old} months of each other aren't counted apart in time. Only facts are compared — condition, layout, light and the other judgment factors aren't — so a clean pair is clean on the facts. Evidence, never applied: nothing here moves a number.`,
  };
}
