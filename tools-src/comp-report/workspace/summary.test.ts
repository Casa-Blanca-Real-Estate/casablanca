// get_numbers' summary on the sample report, without a database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { engineInput, workspaceComps } from './engine-input.ts';
import { numbersSummary } from './summary.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold', tier: t.tier, anchor: Boolean(t.anchor), reviewedAt: null,
  reasons: [{ tier: t.tier, reason: t.reason, reasonType: t.reasonType, actor: 'agent', at: '2026-09-29T00:00:00Z', by: 'k', sample: true }],
  source: { kind: 'export' as const, importId: 'i' },
})));
const output = compute(engineInput({ asOf: '2026-09-29', intake: SAMPLE_INTAKE, comps }));

test('before the reveal it has the comps and the gaps, and no result or figure-quoting warning', () => {
  const s = numbersSummary({ output, comps, intake: SAMPLE_INTAKE, revealed: false });
  assert.equal(s.revealed, false);
  assert.equal('results' in s, false);
  assert.equal(s.comps.length, 11);
  const chambers = s.comps.find((c) => c.comp === '200 Chambers Street #10A')!;
  assert.deepEqual([chambers.tier, chambers.anchor, chambers.price_per_sqft, chambers.in_the_numbers], ['primary', true, 2112, true]);
  assert.equal(s.comps.find((c) => c.comp === '79 Laight Street #1A')!.public_record_closing, true);
  assert.ok(s.still_needed.some((g) => g.includes('only the agent\'s estimate')));
  assert.deepEqual(s.subject.facts.areaSqft, { value: 2000, agent_estimate: true });
  assert.equal(JSON.stringify(s).includes('base_outside_range'), false);
});

test('after the reveal it has both results, as the walkthrough shows them', () => {
  const s = numbersSummary({ output, comps, intake: SAMPLE_INTAKE, revealed: true });
  const w = output.results.with_estimates;
  const results = s.results as Record<string, { base: number | null; range: { low: number; high: number; from: string[] } | null; agent_estimates_used: string[] }>;
  assert.equal(results.with_estimates!.base, Math.round(w.base!.value));
  assert.deepEqual([results.with_estimates!.range!.low, results.with_estimates!.range!.high], [Math.round(w.range!.low.value), Math.round(w.range!.high.value)]);
  assert.ok(results.with_estimates!.range!.from.includes('200 Chambers Street #10A'));
  assert.deepEqual(results.with_estimates!.agent_estimates_used, ['The home’s interior size is our estimate.']);
  assert.equal(results.on_facts!.base, null);
  assert.equal(s.estimates_move_the_numbers, true);
});

test('export rows the agent took out reach Hubert as facts only, marked as out of the report', () => {
  const [first, ...rest] = comps;
  const s = numbersSummary({ output, comps: rest, intake: SAMPLE_INTAKE, revealed: false, removed: [first!.record] });
  const removed = s.removed_from_report!;
  assert.match(removed.about, /count in nothing/);
  assert.equal(removed.comps.length, 1);
  assert.equal(removed.comps[0]!.comp, address(first!));
  assert.ok(!('tier' in removed.comps[0]!) && !('reason' in removed.comps[0]!));
  // None removed: the section isn't there.
  assert.equal('removed_from_report' in numbersSummary({ output, comps, intake: SAMPLE_INTAKE, revealed: false }), false);
});

function address(c: (typeof comps)[number]): string {
  const unit = c.record.identity.unit.raw;
  return `${c.record.identity.address.street}${unit ? ` ${unit.startsWith('#') ? unit : `#${unit}`}` : ''}`;
}

test('no size for the home: Hubert gets no per-SF figure and no comp sizes to quote', () => {
  const { areaSqft: _size, ...noSize } = SAMPLE_INTAKE;
  const out = compute(engineInput({ asOf: '2026-09-29', intake: noSize, comps }));
  const s = numbersSummary({ output: out, comps, intake: noSize, revealed: true });
  const text = JSON.stringify(s);
  assert.equal(text.includes('"price_per_sqft"'), false);
  assert.equal(text.includes('"area_sqft"'), false);
  assert.ok(JSON.stringify(numbersSummary({ output, comps, intake: SAMPLE_INTAKE, revealed: true })).includes('"price_per_sqft"'), 'with a size, it has them');
});
