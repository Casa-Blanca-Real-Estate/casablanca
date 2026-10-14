// The decision layer's switches, read from the environment in one place.
//
//   CR_JEV_MODE           off (the default) | watch. Production ships off: no
//                         judgment is queued and nothing is sent. Anything but
//                         the literal "watch" is off.
//   AI_GATEWAY_API_KEY    Casa's own Vercel AI Gateway key (phase 2). Only ever
//                         tested for presence here; never logged or returned.
//   JEV_MIN_INTERVAL_MS   pacing between request starts; default 12,500
//   CR_DECIDE_FALLBACK    off (the default) | haiku — the Haiku 4.5 fallback's
//                         own switch. It also needs ANTHROPIC_API_KEY.
//   CR_JEV_ZDR            on (the default) | off — ask the Gateway for zero data
//                         retention. Needs a Vercel Pro team; off for Kimani's
//                         existing account. Only the literal "off" turns it off.
//                         With it off, only a lane whose text is public is sent.
//   CR_DECIDE_KEY         a secret that opens /api/comp-report/decide, and
//                         nothing else, to a Claude Code session (Arbiter) with
//                         no sign-in: the readout, the go/no-go call, the
//                         labelled batch and the drift check. Sent in the
//                         X-Decide-Key header. Unset, or under 32 characters,
//                         and no key is accepted. Never logged or returned.
//
// The database is db.ts's business: NETLIFY_DB_URL, or CR_LOCAL_DATABASE_URL
// locally. Nothing in the decision layer reads DATABASE_URL.

import { JEV_DEFAULT_MIN_INTERVAL_MS } from './jev.ts';

export type Env = Record<string, string | undefined>;
export type Mode = 'off' | 'watch';

export interface DecideConfig {
  mode: Mode;
  jevKey: string | null;
  minIntervalMs: number;
  fallback: 'off' | 'haiku';
  anthropicKey: string | null;
  /** Ask for zero data retention. On unless CR_JEV_ZDR is literally "off". */
  zdr: boolean;
  /** The session key for the decide endpoint, or null when none is set (or it's too short to trust). */
  decideKey: string | null;
}

/** A session key shorter than this is refused: it could be guessed. */
export const MIN_DECIDE_KEY_CHARS = 32;

export function decideConfig(env: Env = process.env): DecideConfig {
  const interval = (env.JEV_MIN_INTERVAL_MS ?? '').trim();
  const n = Number(interval);
  const key = (name: string) => {
    const v = (env[name] ?? '').trim();
    return v === '' ? null : v;
  };
  return {
    mode: (env.CR_JEV_MODE ?? '').trim().toLowerCase() === 'watch' ? 'watch' : 'off',
    jevKey: key('AI_GATEWAY_API_KEY'),
    minIntervalMs: interval !== '' && Number.isFinite(n) && n >= 0 ? n : JEV_DEFAULT_MIN_INTERVAL_MS,
    fallback: (env.CR_DECIDE_FALLBACK ?? '').trim().toLowerCase() === 'haiku' ? 'haiku' : 'off',
    anthropicKey: key('ANTHROPIC_API_KEY'),
    zdr: (env.CR_JEV_ZDR ?? '').trim().toLowerCase() !== 'off',
    decideKey: (() => {
      const k = key('CR_DECIDE_KEY');
      return k !== null && k.length >= MIN_DECIDE_KEY_CHARS ? k : null;
    })(),
  };
}

/** Whether the fallback can run at all. */
export function fallbackReady(c: DecideConfig): boolean {
  return c.fallback === 'haiku' && c.anthropicKey !== null;
}

/** What the readout may show about the setup: booleans, never a key. */
export function configSummary(c: DecideConfig) {
  return {
    mode: c.mode,
    jevKey: c.jevKey !== null,
    minIntervalMs: c.minIntervalMs,
    fallback: c.fallback,
    fallbackReady: fallbackReady(c),
    zdr: c.zdr,
    sessionKey: c.decideKey !== null,
  };
}
