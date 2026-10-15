// Findings' chart runs on a fixed price axis (the handoff, "Findings axis"):
// a round step chosen by price tier, ticks and labels at every step, and half
// a step of room past the lowest and highest values drawn. Pure: the chart
// only places what this returns.

export interface Tick {
  value: number;
  label: string;
  /** Percent from the axis's left edge. */
  left: number;
  /** How the label sits on its tick: the ends hug the edges, the rest are centred. */
  align: 'start' | 'center' | 'end';
}

export interface Axis {
  low: number;
  high: number;
  step: number;
  ticks: Tick[];
}

/**
 * The step, by the midpoint of what's drawn: under $750K → $100K; under $1.5M
 * → $250K; under $4M → $500K; under $10M → $1M; else $2.5M.
 */
export function axisStep(mid: number): number {
  if (mid < 750_000) return 100_000;
  if (mid < 1_500_000) return 250_000;
  if (mid < 4_000_000) return 500_000;
  if (mid < 10_000_000) return 1_000_000;
  return 2_500_000;
}

/** A tick's label: $2M, $2.5M, $750K (the prototype's short form). */
export function tickLabel(n: number): string {
  if (n === 0) return '$0';
  if (n >= 1_000_000) return `$${Number((n / 1_000_000).toFixed(2))}M`;
  return `$${Math.round(n / 1_000)}K`;
}

/**
 * The axis over every value drawn (the range, the agent's low and high, the
 * target, the asking price). Low is floor((min − step/2) / step) · step, never
 * below zero; high is ceil((max + step/2) / step) · step. Null when there's
 * nothing positive to draw.
 */
export function fixedAxis(values: readonly (number | null | undefined)[]): Axis | null {
  const drawn = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (!drawn.length) return null;
  const min = Math.min(...drawn);
  const max = Math.max(...drawn);
  const step = axisStep((min + max) / 2);
  const low = Math.max(0, Math.floor((min - step / 2) / step) * step);
  const high = Math.ceil((max + step / 2) / step) * step;
  const ticks: Tick[] = [];
  const count = Math.round((high - low) / step);
  for (let i = 0; i <= count; i++) {
    const value = low + i * step;
    ticks.push({ value, label: tickLabel(value), left: ((value - low) / (high - low)) * 100, align: i === 0 ? 'start' : i === count ? 'end' : 'center' });
  }
  return { low, high, step, ticks };
}

/** Where a value sits on the axis, in percent, held to the axis. */
export function at(axis: Axis, value: number): number {
  const p = ((value - axis.low) / (axis.high - axis.low)) * 100;
  return Math.min(100, Math.max(0, p));
}

/** A bar from one value to another: its left edge and width, in percent. */
export function span(axis: Axis, from: number, to: number): { left: number; width: number } {
  const a = at(axis, Math.min(from, to));
  const b = at(axis, Math.max(from, to));
  return { left: a, width: b - a };
}
