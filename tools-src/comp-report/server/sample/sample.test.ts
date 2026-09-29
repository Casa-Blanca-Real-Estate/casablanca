// The sample can't drift from Hannah's export, carries no share token, and
// every value in it is marked as a sample.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseExport } from '../../engine/index.ts';
import { SAMPLE_EXPORT } from './barclay-17l-export.ts';
import { SAMPLE_BRIEF, SAMPLE_CALL, SAMPLE_DEAL_TERMS, SAMPLE_INTAKE, SAMPLE_SEND, SAMPLE_TARGET, SAMPLE_TIERS } from './barclay-17l.ts';

const SOURCE = readFileSync(new URL('../../../../docs/comp-report/sources/streeteasy-comp-export-100-barclay-17l-2026-09-23.csv', import.meta.url), 'utf8');

test('the sample export is Hannah’s, with StreetEasy’s share tokens stripped', () => {
  assert.ok(SOURCE.includes('?sst='), 'the source still has its tokens');
  assert.equal(SAMPLE_EXPORT.csv, SOURCE.replace(/\?sst=[0-9a-f]+/g, ''));
  assert.equal(SAMPLE_EXPORT.csv.includes('sst='), false);
});

test('every sample tier names a comp in the export, and the anchor is one primary sold comp', () => {
  const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
  const byKey = new Map(parsed.comps.map((c) => [c.identity.key, c]));
  assert.equal(SAMPLE_TIERS.length, parsed.comps.length);
  for (const t of SAMPLE_TIERS) assert.ok(byKey.has(t.propertyKey), t.propertyKey);
  const anchors = SAMPLE_TIERS.filter((t) => t.anchor);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0]!.tier, 'primary');
  assert.equal(byKey.get(anchors[0]!.propertyKey)!.status.evidence_class, 'sold');
});

test('every sample value is marked as a sample; the size is also marked as an estimate', () => {
  const entries = [
    ...Object.values(SAMPLE_INTAKE), ...Object.values(SAMPLE_BRIEF), SAMPLE_TARGET.price, SAMPLE_TARGET.note,
    ...Object.values(SAMPLE_DEAL_TERMS).filter((v) => typeof v === 'object'),
    SAMPLE_SEND.clientName,
  ];
  for (const e of entries) assert.equal((e as { sample?: boolean }).sample, true, JSON.stringify(e));
  assert.equal(SAMPLE_CALL.sample, true);
  assert.equal(SAMPLE_INTAKE.areaSqft!.estimate, true, 'the size is a plausible value, not a fact');
});
