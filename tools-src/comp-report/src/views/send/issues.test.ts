// Send's issues panel (Dispatch 14): QA's findings, numbered where the agent
// meets them, marked in the body and the headline, and fixed where QA knows how.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport } from '../../../engine/index.ts';
import { SAMPLE_EXPORT } from '../../../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../../../server/sample/barclay-17l.ts';
import { buildEmail } from '../../../workspace/email.ts';
import { engineInput, workspaceComps } from '../../../workspace/engine-input.ts';
import { DISCLAIMER, HEADLINE_PLACEHOLDER } from '../../../workspace/frame.ts';
import { draftChecks, ledgerFor, type Acknowledgment } from '../../../workspace/qa.ts';
import { applyFixes, fixLabel, issuesHeading, sendIssues } from './issues.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold', tier: t.tier, anchor: Boolean(t.anchor), reviewedAt: null,
  reasons: [{ tier: t.tier, reason: t.reason, reasonType: t.reasonType, actor: 'agent', at: '2026-09-29T00:00:00Z', by: 'k', sample: true }],
  source: { kind: 'export' as const, importId: 'i' },
})));
const output = compute(engineInput({ asOf: '2026-09-29', intake: SAMPLE_INTAKE, comps }));
const result = 'with_estimates' as const;
const ledger = ledgerFor({ output, result, comps, intake: SAMPLE_INTAKE });
const SUBJECT = '100 Barclay Street #17L: what the comps say';

function issuesFor(body: string, headline: string, acks: Acknowledgment[] = []) {
  const checks = draftChecks({ text: `${SUBJECT}\n${body}`, headline, ledger, result, output, sample: false, acks });
  return sendIssues({ checks, body, headline, ledger, output, result, acks });
}

// The handoff's two: the headline rounds the range's high differently, and the size estimate isn't disclosed.
const HEADLINE = 'The closest sales support listing 17L between $4.23M and $4.9M.';
const BODY = `Hi Jordan and Sam,\n\n${HEADLINE}\n\nI focused on full-service condos close in size and floor.\n\nKimani\n\n${DISCLAIMER}`;

test('the handoff’s two issues, numbered from the headline down, marked where they are', () => {
  const issues = issuesFor(BODY, HEADLINE);
  assert.deepEqual(issues.map((i) => [i.n, i.key, i.text]), [
    [1, 'rounding:$4.9M', 'Headline says $4.9M; the range is $4.92M. Round it the same way.'],
    [2, 'estimates', 'The email uses your size estimate and doesn’t say so.'],
  ]);
  const [rounding, estimates] = issues as [typeof issues[0], typeof issues[0]];
  assert.deepEqual(rounding.headline, [{ start: HEADLINE.indexOf('$4.9M'), end: HEADLINE.indexOf('$4.9M') + 5 }]);
  assert.deepEqual(rounding.body, [{ start: BODY.indexOf('$4.9M'), end: BODY.indexOf('$4.9M') + 5 }]);
  assert.equal(estimates.target, 'end');
  assert.equal(issuesHeading(issues), '2 to fix');
  assert.equal(fixLabel(issues), 'Fix both');
});

test('Fix both leaves nothing to fix, and only touches what was flagged', () => {
  const fixed = applyFixes({ body: BODY, headline: HEADLINE }, issuesFor(BODY, HEADLINE));
  assert.equal(fixed.headline, 'The closest sales support listing 17L between $4.23M and $4.92M.');
  assert.ok(fixed.body.includes(`${fixed.headline}\n\nThe home’s interior size is our estimate.\n\nI focused`));
  assert.deepEqual(issuesFor(fixed.body, fixed.headline), []);
  assert.equal(issuesHeading([]), 'Ready to send');
  assert.equal(fixLabel([]), null);
});

test('on the template’s whole email, a fix changes the headline’s figure and leaves the price table’s steps alone', () => {
  const email = buildEmail({
    homeLine: '100 Barclay Street #17L', audience: 'seller', output, result, comps, agentName: 'Kimani', clientName: 'Jordan and Sam',
    headline: HEADLINE, length: 'full', sample: false,
  });
  assert.ok(email.text.includes('$2,450 - $4.9M'), 'the table has a $4.9M step');
  const issues = issuesFor(email.text, HEADLINE);
  assert.deepEqual(issues.map((i) => i.key), ['rounding:$4.9M']);
  assert.equal(issues[0]!.body.length, 1, 'the headline’s copy in the body, not the table’s step');
  const fixed = applyFixes({ body: email.text, headline: HEADLINE }, issues);
  assert.ok(fixed.body.includes('$2,450 - $4.9M'));
  assert.ok(fixed.body.includes('between $4.23M and $4.92M.'));
  assert.deepEqual(issuesFor(fixed.body, fixed.headline), []);
});

test('a missing disclaimer and a left-behind placeholder are fixed; a stray figure far from the range is the agent’s', () => {
  const body = `Hi Sam,\n\n${HEADLINE_PLACEHOLDER}\n\nThe home’s interior size is our estimate. It could go for $6.1M.\n\nKimani`;
  const headline = 'The closest sales support listing 17L between $4.23M and $4.92M.';
  const issues = issuesFor(body, headline);
  assert.deepEqual(issues.map((i) => i.key), ['placeholder', 'number:$6.1M', 'disclaimer']);
  assert.deepEqual(issues.map((i) => Boolean(i.fix)), [true, false, true]);
  assert.deepEqual(issues[1]!.answers, ['attributed', 'acknowledged']);
  assert.equal(fixLabel(issues), 'Fix both', 'two of the three can be fixed');
  const fixed = applyFixes({ body, headline }, issues);
  assert.equal(fixed.body, `Hi Sam,\n\n${headline}\n\nThe home’s interior size is our estimate. It could go for $6.1M.\n\nKimani\n\n${DISCLAIMER}`);
  const left = issuesFor(fixed.body, headline);
  assert.deepEqual(left.map((i) => i.key), ['number:$6.1M']);
  // Answered for, it's gone, and nothing holds Copy.
  const acks: Acknowledgment[] = [{ key: 'number:$6.1M', how: 'attributed', text: '$6.1M', at: '2026-10-14T12:00:00Z' }];
  assert.deepEqual(issuesFor(fixed.body, headline, acks), []);
});

test('a figure just off the range is fixed to the range’s figure; a point value is a note, not a fix', () => {
  const headline = 'The closest sales support listing 17L between $4.23M and $4.92M.';
  const body = `Hi Sam,\n\n${headline}\n\nThe home’s interior size is our estimate. I think it’s worth $4.95M.\n\nKimani\n\n${DISCLAIMER}`;
  const issues = issuesFor(body, headline);
  assert.deepEqual(issues.map((i) => [i.key, i.blocking]), [['range:worth $4.95m', false], ['number:$4.95M', true]], 'in the order they’re met');
  assert.equal(issues[1]!.text, 'The email says $4.95M; the range’s high end is $4.92M. Use the range’s figure.');
  const fixed = applyFixes({ body, headline }, issues);
  assert.ok(fixed.body.includes('I think it’s worth $4.92M.'));
  assert.equal(issuesHeading(issuesFor(fixed.body, headline)), 'Ready, with a note');
});

test('no headline: the first issue, and it points at the headline field', () => {
  const body = `Hi Sam,\n\n${HEADLINE_PLACEHOLDER}\n\nThe home’s interior size is our estimate.\n\nKimani\n\n${DISCLAIMER}`;
  const issues = issuesFor(body, '');
  assert.equal(issues[0]!.key, 'headline');
  assert.equal(issues[0]!.target, 'headline');
  assert.equal(issues[0]!.fix, null);
  assert.deepEqual(issues[0]!.body, [{ start: body.indexOf(HEADLINE_PLACEHOLDER), end: body.indexOf(HEADLINE_PLACEHOLDER) + HEADLINE_PLACEHOLDER.length }]);
});

test('a hard fair-housing term is marked hard and can’t be answered away', () => {
  const headline = 'The closest sales support listing 17L between $4.23M and $4.92M.';
  const body = `Hi Sam,\n\n${headline}\n\nThe home’s interior size is our estimate. Adults only.\n\nKimani\n\n${DISCLAIMER}`;
  const [fh] = issuesFor(body, headline);
  assert.equal(fh!.key, 'fair_housing:adults only');
  assert.equal(fh!.hard, true);
  assert.deepEqual(fh!.answers, []);
  assert.deepEqual(fh!.body, [{ start: body.indexOf('Adults only'), end: body.indexOf('Adults only') + 'Adults only'.length }]);
});
