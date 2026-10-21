// POST /api/comp-report/lines — the agent's lines on Send, drafted or tidied.
// See tools-src/comp-report/server/api/lines.ts.
import { handleLines } from '../../tools-src/comp-report/server/api/lines.ts';
import { productionAnthropic } from '../../tools-src/comp-report/server/api/turn.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleLines(req, { ...productionAuthDeps(req), anthropic: productionAnthropic, env: process.env });

export const config = { path: '/api/comp-report/lines' };
