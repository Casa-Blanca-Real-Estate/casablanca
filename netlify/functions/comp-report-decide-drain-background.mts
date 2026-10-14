// The decision layer's drainer — a BACKGROUND function (the -background suffix:
// Netlify answers 202 at once and runs it for up to 15 minutes). Started with a
// one-use token by an import's enqueue, an admin's kick, or itself. See
// tools-src/comp-report/server/api/decide-drain.ts.
import Anthropic from '@comp-report/anthropic-sdk';
import { handleDecideDrain } from '../../tools-src/comp-report/server/api/decide-drain.ts';
import { databasePool } from '../../tools-src/comp-report/server/db.ts';
import { decideConfig, fallbackReady } from '../../tools-src/comp-report/server/decide/config.ts';
import type { HaikuClient } from '../../tools-src/comp-report/server/decide/haiku.ts';

export default (req: Request) => {
  const config = decideConfig();
  const client = (apiKey: string | null) => (apiKey ? new Anthropic({ apiKey, maxRetries: 2 }) as unknown as HaikuClient : null);
  return handleDecideDrain(req, {
    pool: databasePool(),
    config,
    haiku: () => (fallbackReady(config) ? client(config.anthropicKey) : null),
    // The labelled batch's second judge needs only the key, not the fallback's switch.
    secondJudge: () => client(config.anthropicKey),
  });
};
