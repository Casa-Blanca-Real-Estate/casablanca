// The session keys (Dispatch 23 items 3–4): CR_DECIDE_KEY opens the decision
// layer's readout, CR_INSPECT_KEY the inspection API, CR_TEST_KEY the test
// user. One compare and one collision rule for all three, so one leaked key is
// never two.
import { createHash, timingSafeEqual } from 'node:crypto';

type Env = Record<string, string | undefined>;

/** A key shorter than this is no key: it could be guessed. */
export const MIN_KEY_CHARS = 32;

export const KEY_NAMES = ['CR_DECIDE_KEY', 'CR_INSPECT_KEY', 'CR_TEST_KEY'] as const;
export type KeyName = (typeof KEY_NAMES)[number];

/** Constant time, whatever the lengths: compare the digests. */
export function sameKey(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** The key as set, or null when it's unset or too short to count. */
export function usableKey(env: Env, name: KeyName): string | null {
  const v = (env[name] ?? '').trim();
  return v.length >= MIN_KEY_CHARS ? v : null;
}

/**
 * Whether this key is set to the same value as another of the three (each
 * counted only if it's usable). The caller asks only after the supplied key
 * has matched, so a wrong key is a 401 whatever the config.
 */
export function keyCollides(env: Env, name: KeyName): boolean {
  const mine = usableKey(env, name);
  if (mine === null) return false;
  return KEY_NAMES.some((other) => {
    if (other === name) return false;
    const theirs = usableKey(env, other);
    return theirs !== null && sameKey(mine, theirs);
  });
}
