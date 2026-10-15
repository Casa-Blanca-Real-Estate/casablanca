// get_numbers (CR-3a): the assistant's one read-only look at the engine's
// output for the report as it stands, so it can discuss the numbers (§8).
//
// What it can't hold, by construction:
//   - the agent's call and any target (§8.4, D-4 recommendation A): the engine
//     input it's built from has no named prices and no deal terms (a seller's
//     target is a deal term), and it's told only whether the range is revealed
//   - the results before the reveal (§3.1): until the agent gives their call or
//     skips it, there's no base, range or statistic in it, and no warning that
//     quotes one
//
// Figures are as the walkthrough shows them — $/sqft truncated (§6.1) — so the
// assistant quotes what the agent sees and never computes one (§4.1).
import { EVIDENCE_CLASSES, type CompRecord, type EngineOutput, type Result, type ResultKind } from '../engine/index.ts';
import type { WorkspaceComp } from './engine-input.ts';
import { estimateWords } from './format.ts';
import { noteOf, type Intake } from './state.ts';

const KINDS: ResultKind[] = ['on_facts', 'with_estimates'];

/** Warnings about the comps' data. The rest quote a base, a range or an adjustment, so they wait for the reveal. */
const BEFORE_REVEAL_WARNINGS = new Set([
  'closing_record', 'approx_area', 'same_building_as_subject', 'same_unit_as_subject', 'property_type_mismatch',
  'unrecognised_status', 'anchor_not_sold', 'anchor_not_primary', 'contradiction', 'hypothetical_ignored',
]);

const trunc = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.trunc(v));
const whole = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v));
const pct1 = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

function address(c: WorkspaceComp): string {
  const street = c.record.identity.address.street ?? 'no address';
  const unit = c.record.identity.unit.raw;
  return unit ? `${street} ${unit.startsWith('#') ? unit : `#${unit}`}` : street;
}

function result(r: Result, byId: Map<string, string>) {
  const stat = (s: { median: { value: number }; min: { value: number }; max: { value: number }; n: number } | null, f: (v: number) => number | null) =>
    s ? { median: f(s.median.value), low: f(s.min.value), high: f(s.max.value), n: s.n } : null;
  return {
    label: r.label,
    base: whole(r.base?.value),
    lead_indicator: `${r.lead.label}${r.lead.chosen_by === 'default' ? ' (the default)' : ''}`,
    range: r.range ? { low: whole(r.range.low.value), high: whole(r.range.high.value), from: r.range.comp_ids.map((id) => byId.get(id) ?? id) } : null,
    no_range_because: r.range ? null : r.range_unavailable_because,
    evidence_by_status: Object.fromEntries(EVIDENCE_CLASSES.map((cls) => {
      const e = r.evidence[cls];
      return [cls, {
        price_basis: e.basis === 'sale' ? 'sale prices' : 'asking prices',
        in_the_numbers: e.counts.included,
        of: e.counts.total,
        price_per_sqft: stat(e.price_per_sqft, trunc),
        price: stat(e.price, whole),
      }];
    })),
    sale_to_last_ask_percent: stat(r.sale_to_ask, pct1),
    monthly_carry: {
      subject: whole(r.carry.subject?.value),
      comps_median: whole(r.carry.comp_median?.value),
      subject_vs_median_percent: pct1(r.carry.subject_vs_median_percent?.value),
    },
    bridge: {
      from: r.bridge.family === 'unit_rate' ? 'the median $/sqft of the primary sold comps' : 'the adjusted prices of the primary sold comps',
      lines: r.bridge.lines.filter((l) => l.client_visible).map((l) => ({
        factor: l.name,
        status: l.status === 'considered_not_calculated' ? 'considered — value not yet determined' : l.label,
        moves_base_by: whole(l.effect_on_base?.value),
      })),
      note: r.bridge.note,
    },
    agent_estimates_used: [...new Set(r.estimates_used.map(estimateWords))],
  };
}

/** An export row the agent took out: what it is, never a judgment of it. */
function removedRow(r: CompRecord) {
  const f = r.facts;
  const street = r.identity.address.street ?? 'No address';
  const unit = r.identity.unit.raw;
  const status = r.status.evidence_class ?? r.status.listing_status;
  return {
    comp: unit ? `${street} ${unit.startsWith('#') ? unit : `#${unit}`}` : street,
    evidence_status: status === 'off_market' ? 'didn’t sell' : status ?? `unknown (“${r.status.raw ?? ''}”)`,
    [status === 'sold' ? 'sale_price' : 'asking_price']: (status === 'sold' ? f.sale_price?.value : f.list_price?.value) ?? null,
    date: f.status_date?.value ?? null,
    area_sqft: f.area_sqft?.value ?? null,
    beds: f.beds?.value ?? null,
    baths: f.baths?.value ?? null,
    floor: f.floor?.value ?? null,
  };
}

export function numbersSummary(args: { output: EngineOutput; comps: WorkspaceComp[]; intake: Intake | undefined; revealed: boolean; removed?: CompRecord[] }) {
  const { output, comps, revealed } = args;
  const outById = new Map(output.comps.map((c) => [c.id, c]));
  const names = new Map(comps.map((c) => [c.id, address(c)]));
  const intake = args.intake ?? {};
  const { address: subjectAddress, unit, ...facts } = intake;

  return {
    analysis_date: output.meta.as_of,
    house_method: output.meta.house_method.all_null
      ? 'no values set yet: every adjustment is considered, not calculated'
      : output.meta.house_method.version,
    revealed,
    about: revealed
      ? 'Both results, as the agent sees them. "On the facts" uses only facts; "with estimates" also uses the agent\'s estimates, listed.'
      : 'The range is hidden: the agent hasn\'t given their own call yet (§3.1), so there are no results here. Don\'t suggest a value or a range; help them sort the comps.',
    subject: {
      address: subjectAddress?.value ?? null,
      unit: unit?.value ?? null,
      facts: Object.fromEntries(Object.entries(facts).map(([k, e]) => [k, e.estimate ? { value: e.value, agent_estimate: true } : e.value])),
    },
    comps: comps.map((c) => {
      const out = outById.get(c.id);
      const f = c.record.facts;
      const sold = c.record.status.evidence_class === 'sold';
      const price = sold ? f.sale_price?.value : f.list_price?.value;
      const pr = out?.per_result;
      const why = pr ? [...new Set([...pr.on_facts.not_included_because, ...pr.with_estimates.not_included_because])] : [];
      return {
        comp: names.get(c.id),
        evidence_status: c.record.status.evidence_class === 'off_market' || c.record.status.listing_status === 'off_market'
          ? 'didn’t sell (came off the market unsold; its last ask is a ceiling signal)'
          : c.record.status.evidence_class ?? `unknown (“${c.record.status.raw ?? ''}”)`,
        tier: c.unsortable ? 'can’t be sorted' : c.judgment?.tier ?? 'not sorted yet',
        reason: c.unsortable ?? noteOf(c.judgment),
        ...(c.judgment?.tags?.length ? { tags: c.judgment.tags } : {}),
        reviewed: Boolean(c.judgment?.reviewedAt),
        ...(c.judgment?.anchor ? { anchor: true } : {}),
        [sold ? 'sale_price' : c.record.status.evidence_class === 'in_contract' ? 'last_asking_price' : 'asking_price']: price ?? null,
        ...(sold && f.list_price ? { last_asking_price: f.list_price.value } : {}),
        area_sqft: f.area_sqft ? `${f.area_sqft.confidence === 'approx' || c.record.flags.approx_area ? '~' : ''}${f.area_sqft.value}` : null,
        price_per_sqft: trunc(pr?.on_facts.price_per_sqft?.value),
        date: f.status_date?.value ?? null,
        beds: f.beds?.value ?? null,
        baths: f.baths?.value ?? null,
        floor: f.floor?.value ?? null,
        ...(c.record.flags.closing_record ? { public_record_closing: true } : {}),
        ...(out?.checks.some((k) => k.status === 'flagged')
          ? { checks: out.checks.filter((k) => k.status === 'flagged').map((k) => `${k.message}${k.suggestion ? ` — suggests ${k.suggestion}` : ''}`) }
          : {}),
        in_the_numbers: Boolean(pr && (pr.on_facts.included || pr.with_estimates.included)),
        ...(why.length ? { not_in_the_numbers_because: why } : {}),
      };
    }),
    ...(revealed ? {
      results: Object.fromEntries(KINDS.map((k) => [k, result(output.results[k], names)])),
      estimates_move_the_numbers: !output.divergence.same,
    } : {}),
    ...(args.removed?.length ? {
      removed_from_report: {
        about: 'Sales from the agent’s StreetEasy export that the agent took out of the report. They count in nothing. They are the only other sales you may suggest looking at again; never name a listing that is not in this data.',
        comps: args.removed.map(removedRow),
      },
    } : {}),
    still_needed: output.gaps.map((g) => g.message),
    warnings: output.warnings.filter((w) => revealed || BEFORE_REVEAL_WARNINGS.has(w.code)).map((w) => w.message),
    waiting_for_confirmation: output.pending_confirmation.map((p) => `${p.what}: ${p.note}`),
  };
}
