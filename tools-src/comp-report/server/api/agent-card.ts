// GET /api/comp-report/agent-card — the signed-in agent's name, phone and
// headshot from Casa's roster, for the email's sign-off (server/agent-card.ts).
//   → {card: {name, phone, photo} | null}
// Null when the roster doesn't know the agent's email, for a guest, or where
// there's no roster to read (local dev without one): the sign-off then falls
// back to the name Identity has.
import { agentCard, type AgentRoster } from '../agent-card.ts';
import type { EmailPhotoStore } from '../email-photos.ts';
import { allowMethods, json, respond } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';

export interface AgentCardDeps extends AuthDeps {
  roster?: AgentRoster | null;
  emailPhotos?: EmailPhotoStore | null;
}

export function handleAgentCard(req: Request, deps: AgentCardDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET');
    const user = await requireUser(req, deps);
    if (user.guest || !deps.roster) return json({ card: null });
    const card = await agentCard(deps.roster, deps.emailPhotos ?? null, user.email).catch((e: unknown) => {
      console.warn('comp report: the roster couldn’t be read for the sign-off', e);
      return null;
    });
    return json({ card: card && { name: card.name, phone: card.phone, photo: card.photo } });
  });
}
