// What the deployed functions call: the gate, with the comp report's production wiring.
import { productionAuthDeps } from '../comp-report/server/deps.ts';
import { studioRefusal, type GateOptions } from './gate.ts';

export function requireStudio(req: Request, opts?: GateOptions): Promise<Response | null> {
  return studioRefusal(req, productionAuthDeps(req), opts);
}
