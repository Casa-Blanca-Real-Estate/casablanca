// The house method (§6.6): production has every value null; the test-only
// config exercises the arithmetic and is refused outside tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  allLines, compute, HouseMethodError, INTERACTIONS, isTestRuntime, loadHouseMethod, magnitudeKeys,
  productionHouseMethod, TestConfigRefusedError,
} from '../index.ts';
import production from '../house-method/production.json' with { type: 'json' };
import testValues from './fixtures/house-method.test-only.json' with { type: 'json' };
import { input } from './helpers.ts';

const clone = <T>(x: T): T => structuredClone(x);

test('production: every magnitude, weight, bound and threshold is null', () => {
  const hm = productionHouseMethod();
  assert.equal(hm.kind, 'production');
  assert.equal(hm.all_null, true);
  assert.equal(hm.approval, null);
  const adjustable = allLines().filter((l) => l.factor.role === 'adjustment');
  assert.deepEqual(Object.keys(hm.lines).sort(), adjustable.map((l) => l.id).sort());
  for (const { id, line } of adjustable) {
    const entry = hm.lines[id]!;
    for (const key of magnitudeKeys(line.magnitude)) assert.equal(entry.values[key], null, `${id}.${key}`);
    assert.equal(entry.min_percent, null);
    assert.equal(entry.max_percent, null);
  }
  assert.deepEqual(Object.keys(hm.interactions).sort(), INTERACTIONS.map((i) => i.id).sort());
  assert.deepEqual(hm.decision_thresholds, { apply_at_or_above: null, ask_below: null });
  // Belt and braces: not one number anywhere in the file.
  const numbers = JSON.stringify(production).match(/:\s*-?\d/g);
  assert.equal(numbers, null);
});

test('compute uses production by default, and records it', () => {
  const out = compute(input());
  assert.deepEqual(out.meta.house_method, {
    id: 'casa-blanca-house-method', kind: 'production', version: productionHouseMethod().version,
    hash: productionHouseMethod().hash, all_null: true,
  });
});

test('the test runtime is detected, and a browser-like environment is not one', () => {
  assert.equal(isTestRuntime(), true);
  assert.equal(isTestRuntime(null), false); // a browser has no process
  assert.equal(isTestRuntime({}), false);
  assert.equal(isTestRuntime({ NODE_ENV: 'test' }), false); // too easy to set by accident
  assert.equal(isTestRuntime({ VITEST: 'true' }), true);
});

test('the test config loads under the test runner', () => {
  const hm = loadHouseMethod(testValues);
  assert.equal(hm.kind, 'test');
  assert.equal(hm.all_null, false);
  assert.equal(hm.lines['floor']!.values['per_unit'], 0.5);
});

test('the test config is refused outside tests — in this process', () => {
  const saved = process.env['NODE_TEST_CONTEXT'];
  const hm = loadHouseMethod(testValues);
  delete process.env['NODE_TEST_CONTEXT'];
  try {
    assert.throws(() => loadHouseMethod(testValues), TestConfigRefusedError);
    // …and compute refuses a test house method however it arrived.
    assert.throws(() => compute(input(), { houseMethod: hm }), TestConfigRefusedError);
    // Production still loads.
    assert.doesNotThrow(() => loadHouseMethod(production));
  } finally {
    process.env['NODE_TEST_CONTEXT'] = saved;
  }
});

test('the test config is refused outside tests — in a separate Node process, as the app or a function would run', () => {
  const engine = new URL('../index.ts', import.meta.url).href;
  const config = new URL('./fixtures/house-method.test-only.json', import.meta.url).href;
  const script = `
    import { loadHouseMethod, productionHouseMethod } from ${JSON.stringify(engine)};
    import values from ${JSON.stringify(config)} with { type: 'json' };
    productionHouseMethod();
    try { loadHouseMethod(values); console.log('LOADED'); }
    catch (e) { console.log(e.name); }
  `;
  const env = { ...process.env };
  delete env['NODE_TEST_CONTEXT'];
  delete env['VITEST'];
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8', cwd: fileURLToPath(new URL('.', import.meta.url)) });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), 'TestConfigRefusedError');
});

test('a production file with values needs Noble’s sign-off', () => {
  const withValue = clone(production) as Omit<typeof production, 'approval'> & { approval: unknown };
  (withValue.lines.floor as { per_unit: number | null }).per_unit = 0.5;
  assert.throws(() => loadHouseMethod(withValue), /sign-off/);
  withValue.approval = { by: 'Noble', at: '2026-10-01', note: 'first values' };
  const hm = loadHouseMethod(withValue);
  assert.equal(hm.all_null, false);
  assert.equal(hm.approval?.by, 'Noble');
  assert.notEqual(hm.hash, productionHouseMethod().hash);
});

test('the loader checks the file against the catalog', () => {
  const missing = clone(production) as Record<string, unknown> & { lines: Record<string, unknown> };
  delete missing.lines['floor'];
  assert.throws(() => loadHouseMethod(missing), /lines.floor is missing/);

  const extra = clone(production) as Record<string, unknown> & { lines: Record<string, unknown> };
  extra.lines['charm'] = { small: null };
  assert.throws(() => loadHouseMethod(extra), /lines.charm is not a factor/);

  const wrongShape = clone(production) as Record<string, unknown> & { lines: Record<string, Record<string, unknown>> };
  wrongShape.lines['floor']!['small'] = null;
  assert.throws(() => loadHouseMethod(wrongShape), /not a slot/);

  const negative = clone(testValues) as typeof testValues;
  (negative.lines.views as { small: number }).small = -2;
  assert.throws(() => loadHouseMethod(negative), /must not be negative/);

  const unordered = clone(testValues) as typeof testValues;
  (unordered.lines.views as { large: number }).large = 1;
  assert.throws(() => loadHouseMethod(unordered), /small ≤ moderate ≤ large/);

  const interaction = clone(production) as Record<string, unknown> & { interactions: Record<string, { magnitude: unknown }> };
  interaction.interactions['floor*views']!.magnitude = 5;
  assert.throws(() => loadHouseMethod(interaction), /CR-R2/);

  assert.throws(() => loadHouseMethod({ ...clone(production), kind: 'staging' }), HouseMethodError);
  assert.throws(() => loadHouseMethod('production'), HouseMethodError);
  // A falling market is allowed: the recency magnitude may be negative.
  const falling = clone(testValues) as typeof testValues;
  (falling.lines.recency_market as { per_unit: number }).per_unit = -0.3;
  assert.equal(loadHouseMethod(falling).lines['recency_market']!.values['per_unit'], -0.3);
});
