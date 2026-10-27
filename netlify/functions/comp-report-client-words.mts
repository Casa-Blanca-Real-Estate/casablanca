// POST /api/comp-report/client-words — Hubert on the client's words, on Send's client step.
// See tools-src/comp-report/server/api/client-words.ts.
import { handleClientWords } from '../../tools-src/comp-report/server/api/client-words.ts';
import { productionAnthropic } from '../../tools-src/comp-report/server/api/turn.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleClientWords(req, { ...productionAuthDeps(req), anthropic: productionAnthropic, env: process.env });

export const config = { path: '/api/comp-report/client-words' };
