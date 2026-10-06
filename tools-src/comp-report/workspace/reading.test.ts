// Findings' sentences against the 100 Barclay #17L sample: the neutral reading
// and the agent's number against it, worded from the engine's figures only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport, type EngineOutput } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { engineInput, namedPrices, workspaceComps } from './engine-input.ts';
import { answerResult, estimatesChangeTheAnswer, homeName, neutralReading, numberAgainstIt } from './reading.ts';
import type { CallState, Intake } from './state.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold', tier: t.tier, anchor: Boolean(t.anchor), reviewedAt: null,
  reasons: [{ tier: t.tier, reason: t.reason, reasonType: t.reasonType, actor: 'agent', at: '2026-09-29T00:00:00Z', by: 'k', sample: true }],
  source: { kind: 'export' as const, importId: 'i' },
})));
const run = (intake: Intake, call: CallState | null): EngineOutput =>
  compute(engineInput({ asOf: '2026-09-29', intake, comps, prices: namedPrices(call, null) }));
const KNOWN_SIZE: Intake = { ...SAMPLE_INTAKE, areaSqft: { value: 2000, asOf: '2026-09-23' } };
const call = (low: number, high: number): CallState => ({ low, high, at: '2026-09-29T12:00:00Z' });

test('the neutral reading: how many sales, their $/sq ft, and the prices they imply', () => {
  const out = run(KNOWN_SIZE, null);
  assert.equal(neutralReading(out, 'on_facts', '17L'), 'The three closest sales put 17L at $2,112–$2,457 a sq ft — about $4.23M–$4.92M.');
});

test('one result when estimates don’t change the answer; both when they do, reading the one with a range', () => {
  const known = run(KNOWN_SIZE, null);
  assert.equal(estimatesChangeTheAnswer(known), false);
  assert.equal(answerResult(known), 'on_facts');
  const estimated = run(SAMPLE_INTAKE, null); // the size is the agent's estimate: no range on the facts
  assert.equal(estimatesChangeTheAnswer(estimated), true);
  assert.equal(answerResult(estimated), 'with_estimates');
  assert.match(neutralReading(estimated, 'on_facts', '17L'), /^The comps don’t give a range yet: /);
});

test('the agent’s number against the range, in words, from the engine’s agent_number', () => {
  assert.equal(numberAgainstIt(run(KNOWN_SIZE, call(3_400_000, 4_200_000)), 'on_facts'), 'Your $3.4M–$4.2M sits below what the sales support, by about $25.4K.');
  assert.equal(numberAgainstIt(run(KNOWN_SIZE, call(5_000_000, 5_200_000)), 'on_facts'), 'Your $5M–$5.2M sits above what the sales support, by about $84.1K.');
  assert.equal(numberAgainstIt(run(KNOWN_SIZE, call(4_300_000, 4_800_000)), 'on_facts'), 'Your $4.3M–$4.8M sits inside what the sales support.');
  assert.equal(numberAgainstIt(run(KNOWN_SIZE, call(4_000_000, 4_500_000)), 'on_facts'), 'Your $4M–$4.5M starts below what the sales support and ends inside it.');
  assert.equal(numberAgainstIt(run(KNOWN_SIZE, call(4_500_000, 5_200_000)), 'on_facts'), 'Your $4.5M–$5.2M starts inside what the sales support and runs above it.');
  assert.equal(numberAgainstIt(run(KNOWN_SIZE, call(3_900_000, 5_500_000)), 'on_facts'), 'Your $3.9M–$5.5M is wider than what the sales support, on both sides.');
  assert.equal(numberAgainstIt(run(KNOWN_SIZE, { skipped: true, at: 'x' }), 'on_facts'), null, 'a skipped number has no sentence');
});

test('the home is named by its unit, else its street', () => {
  assert.equal(homeName('#17L', '100 Barclay Street'), '17L');
  assert.equal(homeName(null, '100 Barclay Street'), '100 Barclay Street');
  assert.equal(homeName('', ''), 'the home');
});
