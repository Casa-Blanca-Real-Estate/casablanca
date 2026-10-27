// The per-comp review's shapes and rules (Dispatch 25): a stored round is
// checked key by key; a practice agent's take waits for feedback; the flow's
// order; what the model is given for one comp, and what it never is; and that
// a review never changes a tier or the engine's output.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_REVIEWS, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { engineInput, workspaceComps, type ParsedImport } from './engine-input.ts';
import { cleanReview, cleanReviewEntry, cleanReviews, reviewInput, reviewOrder, stepDone, takeUnlocked, weakFlag, type ReviewEntry } from './review.ts';
import type { CompJudgment } from './state.ts';

const AS_OF = '2026-09-29';
const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const imports: ParsedImport[] = [{ importId: 'imp-1', createdAt: '2026-09-29T10:00:00.000Z', parsed }];
const AT = '2026-10-22T12:00:00.000Z';
const feedback: ReviewEntry = { at: AT, kind: 'feedback', text: 'What holds up:\n- Close in size.', weak: null, by: 'a@casa-blanca.com', note: 'Close in size', tags: ['Similar size'] };
const take: ReviewEntry = { at: AT, kind: 'take', text: 'A good match.', weak: { reason: 'half a mile away' }, by: 'a@casa-blanca.com', tier: 'secondary', tierWhy: 'Far.' };

function judgments(review?: (i: number) => ReviewEntry[] | undefined): CompJudgment[] {
  return SAMPLE_TIERS.map((t, i) => ({
    reportCompId: `rc-${i}`,
    propertyKey: t.propertyKey,
    evidenceClass: parsed.comps.find((c) => c.identity.key === t.propertyKey)!.status.evidence_class!,
    tier: t.tier,
    anchor: Boolean(t.anchor),
    reviewedAt: AT,
    reasons: [],
    source: { kind: 'export' as const, importId: 'imp-1' },
    note: t.reason,
    tags: t.tags,
    ...(review?.(i) ? { review: review(i)! } : {}),
  }));
}

test('a stored round is checked key by key: the wrong shape is dropped, unknown keys never kept', () => {
  assert.deepEqual(cleanReviewEntry(take), take);
  assert.deepEqual(cleanReviewEntry({ ...feedback, extra: 'x', sample: true }), { ...feedback, sample: true });
  for (const bad of [
    null, [], { ...take, kind: 'chat' }, { ...take, at: 'yesterday' }, { ...take, text: '  ' }, { ...take, by: '' },
    { ...take, weak: { reason: '' } }, { ...take, weak: 'yes' }, { ...take, text: 'x'.repeat(4001) },
  ]) assert.equal(cleanReviewEntry(bad), null, JSON.stringify(bad)?.slice(0, 60));
  assert.equal(cleanReviewEntry({ ...take, tier: 'best' })!.tier, null, 'a tier off the list is no tier');
  assert.deepEqual(cleanReview([take, { kind: 'take' }, feedback]), [take, feedback]);
  assert.deepEqual(cleanReviews({ a: [take], b: 'nope', c: [] }), { a: [take] });
});

test('a practice agent’s take unlocks after a feedback round; a full agent’s from the start', () => {
  assert.equal(takeUnlocked([], 'practice'), false);
  assert.equal(takeUnlocked([take], 'practice'), false);
  assert.equal(takeUnlocked([feedback], 'practice'), true);
  assert.equal(takeUnlocked([], 'full'), true);
});

test('the weak flag: a practice agent’s take stays out of it until they open it', () => {
  assert.deepEqual(weakFlag([feedback, take], 'full'), { reason: 'half a mile away' });
  assert.equal(weakFlag([feedback, take], 'practice'), null);
  assert.deepEqual(weakFlag([feedback, take], 'practice', true), { reason: 'half a mile away' });
  assert.equal(weakFlag(undefined), null);
});

test('the flow walks untiered comps first, Sort’s order otherwise; done is a tier, and a practice agent’s feedback', () => {
  const rows = [{ id: 'a', tier: 'primary' as const }, { id: 'b', tier: null }, { id: 'c', tier: 'excluded' as const }, { id: 'd', tier: null }];
  assert.deepEqual(reviewOrder(rows).map((r) => r.id), ['b', 'd', 'a', 'c']);
  const [c] = workspaceComps(imports, judgments());
  assert.equal(stepDone(c!, 'full'), true);
  assert.equal(stepDone(c!, 'practice'), false);
  assert.equal(stepDone({ ...c!, judgment: { ...c!.judgment!, review: [feedback] } }, 'practice'), true);
  assert.equal(stepDone({ ...c!, judgment: { ...c!.judgment!, tier: null, review: [feedback] } }, 'practice'), false);
});

test('a review never changes a tier or the engine’s output', () => {
  const plain = workspaceComps(imports, judgments());
  const reviewed = workspaceComps(imports, judgments(() => [feedback, { ...take, tier: 'excluded' }]));
  assert.deepEqual(reviewed.map((c) => c.judgment!.tier), plain.map((c) => c.judgment!.tier));
  const run = (comps: typeof plain) => compute(engineInput({ asOf: AS_OF, intake: SAMPLE_INTAKE, comps }));
  assert.deepEqual(run(reviewed), run(plain));
});

test('what the model is given: the comp, the home and the engine’s measurements; feedback adds the agent’s note, a take never does', () => {
  const comps = workspaceComps(imports, judgments());
  const output = compute(engineInput({ asOf: AS_OF, intake: SAMPLE_INTAKE, comps }));
  const comp = comps.find((c) => c.judgment!.propertyKey === SAMPLE_TIERS[0]!.propertyKey)!;
  const fb = reviewInput({ output, comp, intake: SAMPLE_INTAKE, propertyType: 'condo', job: 'feedback' });
  assert.equal(fb.comp.name, '200 Chambers Street #10A');
  assert.equal(fb.comp.status, 'sold');
  assert.ok(fb.comp.facts.sale_price && fb.comp.facts.price_per_sqft && fb.home.facts.size);
  assert.deepEqual(fb.agent, { note: SAMPLE_TIERS[0]!.reason, tags: SAMPLE_TIERS[0]!.tags });
  const tk = reviewInput({ output, comp, intake: SAMPLE_INTAKE, propertyType: 'condo', job: 'take', asks: ' it was gut renovated ' });
  assert.equal(tk.agent, undefined, 'his take is his own');
  assert.equal(tk.agent_asks, 'it was gut renovated');
  const text = JSON.stringify([fb, tk]);
  for (const never of ['tier', 'primary', 'anchor', 'target', 'call', 'deal']) assert.ok(!text.includes(`"${never}"`), never);
  // A co-op, or a home with no size: no per-foot figure to lean on.
  assert.equal(reviewInput({ output, comp, intake: SAMPLE_INTAKE, propertyType: 'coop', job: 'take' }).comp.facts.price_per_sqft, undefined);
});

test('the sample has a review for every sample comp', () => {
  for (const t of SAMPLE_TIERS) assert.ok(SAMPLE_REVIEWS[t.propertyKey], t.propertyKey);
});
