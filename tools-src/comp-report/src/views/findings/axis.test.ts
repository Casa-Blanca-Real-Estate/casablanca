// The fixed axis under Findings' chart (the handoff, "Findings axis").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { at, axisStep, fixedAxis, span, tickLabel } from './axis.ts';

test('the step goes by the midpoint’s price tier', () => {
  assert.equal(axisStep(500_000), 100_000);
  assert.equal(axisStep(749_999), 100_000);
  assert.equal(axisStep(750_000), 250_000);
  assert.equal(axisStep(1_499_999), 250_000);
  assert.equal(axisStep(1_500_000), 500_000);
  assert.equal(axisStep(3_999_999), 500_000);
  assert.equal(axisStep(4_000_000), 1_000_000);
  assert.equal(axisStep(9_999_999), 1_000_000);
  assert.equal(axisStep(10_000_000), 2_500_000);
  assert.equal(axisStep(40_000_000), 2_500_000);
});

test('the prototype’s case: a guess of $3.4M–$4.2M and an estimate of $4.22M–$4.91M run $2M to $6M by $1M', () => {
  const axis = fixedAxis([3_400_000, 4_200_000, 4_220_000, 4_910_000])!;
  assert.equal(axis.step, 1_000_000);
  assert.equal(axis.low, 2_000_000);
  assert.equal(axis.high, 6_000_000);
  assert.deepEqual(axis.ticks.map((t) => t.label), ['$2M', '$3M', '$4M', '$5M', '$6M']);
  assert.deepEqual(axis.ticks.map((t) => t.left), [0, 25, 50, 75, 100]);
  assert.deepEqual(axis.ticks.map((t) => t.align), ['start', 'center', 'center', 'center', 'end']);
});

test('half a step of room past each end, snapped to steps', () => {
  // Midpoint $2.25M → $500K steps. min − 250K = $1.75M → floor to $1.5M; max + 250K = $2.75M → ceil to $3M.
  const axis = fixedAxis([2_000_000, 2_500_000])!;
  assert.equal(axis.step, 500_000);
  assert.equal(axis.low, 1_500_000);
  assert.equal(axis.high, 3_000_000);
  assert.deepEqual(axis.ticks.map((t) => t.label), ['$1.5M', '$2M', '$2.5M', '$3M']);
});

test('every value drawn widens the axis: the target and the asking price as well as the two ranges', () => {
  const without = fixedAxis([4_220_000, 4_910_000])!;
  const withAsk = fixedAxis([4_220_000, 4_910_000, null, undefined, 5_950_000])!;
  assert.equal(without.high, 6_000_000);
  assert.equal(withAsk.high, 7_000_000);
});

test('small prices step by $100K and never go below zero', () => {
  const axis = fixedAxis([30_000, 120_000])!;
  assert.equal(axis.step, 100_000);
  assert.equal(axis.low, 0);
  assert.equal(axis.high, 200_000);
  assert.deepEqual(axis.ticks.map((t) => t.label), ['$0', '$100K', '$200K']);
});

test('a single value still gets an axis around it', () => {
  const axis = fixedAxis([1_000_000])!;
  assert.equal(axis.step, 250_000);
  assert.equal(axis.low, 750_000);
  assert.equal(axis.high, 1_250_000);
});

test('nothing to draw, no axis', () => {
  assert.equal(fixedAxis([]), null);
  assert.equal(fixedAxis([null, undefined, 0, Number.NaN]), null);
});

test('places values and bars in percent, held to the axis', () => {
  const axis = fixedAxis([3_400_000, 4_200_000, 4_220_000, 4_910_000])!;
  assert.equal(at(axis, 4_000_000), 50);
  assert.equal(at(axis, 9_000_000), 100);
  const bar = span(axis, 4_220_000, 4_910_000);
  assert.ok(Math.abs(bar.left - 55.5) < 1e-9);
  assert.ok(Math.abs(bar.width - 17.25) < 1e-9);
  assert.deepEqual(span(axis, 4_000_000, 3_000_000), { left: 25, width: 25 });
});

test('tick labels in the prototype’s short form', () => {
  assert.equal(tickLabel(2_000_000), '$2M');
  assert.equal(tickLabel(2_500_000), '$2.5M');
  assert.equal(tickLabel(12_500_000), '$12.5M');
  assert.equal(tickLabel(750_000), '$750K');
  assert.equal(tickLabel(0), '$0');
});
