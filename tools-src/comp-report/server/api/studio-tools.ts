// /api/studio/tools — who each Studio tool is for, set by an admin from the Access panel
// (Kimani, 2026-11-06: "being able to toggle which tools are available to which access levels…
// especially with tools that are under construction/renovation"). No PR to hide or open a tool.
//   GET                   {tools: [{key, name, level, default, floor}]}: anyone, signed in or not;
//                         it says only which tools are open to whom, which the dashboard shows anyway
//   PUT {key, level}      an admin sets one tool's level; level null puts it back to its default
//
// The levels, widest first: everyone (signed out too, while the Studio is OPEN), mentor (the comp
// report's mentors, with the team and the admins; Kimani, 2026-11-06), team, admin.
// "admin" is how a tool under construction is hidden from everyone else. A tool's floor is the
// widest it may go: the CMS and the roster hand out their tokens to the team only, so they never
// open to everyone. The dashboard (index.html) and each tool page (assets/studio-auth.js,
// data-tool) read it; it's a door like the rest of the Studio's page gates, not a lock: the
// functions behind a tool keep their own checks.
import { allowMethods, HttpError, json, readJsonObject, respond } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';

export const LEVELS = ['everyone', 'mentor', 'team', 'admin'] as const;
export type Level = (typeof LEVELS)[number];
const rank = (l: Level) => LEVELS.indexOf(l);

export interface StudioTool { key: string; name: string; default: Level; floor: Level }

/** The dashboard's tools (TOOLS in index.html), with the level each has without a setting. */
export const STUDIO_TOOLS: readonly StudioTool[] = [
  { key: 'editorial', name: 'Editorial', default: 'everyone', floor: 'everyone' },
  { key: 'closed', name: 'Just closed', default: 'everyone', floor: 'everyone' },
  { key: 'forsale', name: 'For sale roundup', default: 'everyone', floor: 'everyone' },
  { key: 'incontract', name: 'In contract', default: 'everyone', floor: 'everyone' },
  { key: 'watermarker', name: 'Watermarker', default: 'everyone', floor: 'everyone' },
  { key: 'bizcard', name: 'Business card', default: 'everyone', floor: 'everyone' },
  { key: 'guide', name: 'Ordering guide', default: 'everyone', floor: 'everyone' },
  { key: 'propertysign', name: 'Property sign', default: 'team', floor: 'everyone' },
  { key: 'profilepic', name: 'Profile pic', default: 'team', floor: 'team' },
  { key: 'agentcms', name: 'Agent CMS', default: 'team', floor: 'team' },
  { key: 'agentsites', name: 'Agent sites', default: 'team', floor: 'everyone' },
];

export const TOOLS_STORE = 'cb-studio-tools';
const KEY = 'levels';

/** The part of a Blobs store this uses. */
export interface ToolBlobs {
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<unknown>;
}

export interface ToolDeps extends AuthDeps { toolStore: ToolBlobs }

interface Saved { levels: Record<string, Level>; by?: Record<string, { email: string; at: string }> }

async function readSaved(store: ToolBlobs): Promise<Saved> {
  const raw = (await store.get(KEY, { type: 'json' }).catch(() => null)) as Saved | null;
  return raw && typeof raw === 'object' && raw.levels && typeof raw.levels === 'object' ? raw : { levels: {} };
}

/** A saved level, held to the tool's floor; a stray value falls back to the default. */
export function levelOf(tool: StudioTool, saved: Record<string, unknown>): Level {
  const l = saved[tool.key];
  if (typeof l !== 'string' || !(LEVELS as readonly string[]).includes(l)) return tool.default;
  return rank(l as Level) < rank(tool.floor) ? tool.floor : (l as Level);
}

function listing(saved: Saved) {
  return STUDIO_TOOLS.map((t) => ({
    key: t.key, name: t.name, level: levelOf(t, saved.levels), default: t.default, floor: t.floor,
    changedBy: saved.by?.[t.key]?.email ?? null, changedAt: saved.by?.[t.key]?.at ?? null,
  }));
}

export function handleStudioTools(req: Request, deps: ToolDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'PUT');
    if (req.method === 'GET') {
      return json({ tools: listing(await readSaved(deps.toolStore)) });
    }
    const user = await requireUser(req, deps);
    if (user.role !== 'admin') throw new HttpError(403, 'admins_only', 'Only admins choose who sees each tool.');
    const body = await readJsonObject(req);
    const tool = STUDIO_TOOLS.find((t) => t.key === body.key);
    if (!tool) throw new HttpError(400, 'bad_tool', 'Which tool?');
    if (body.level !== null && !(LEVELS as readonly unknown[]).includes(body.level)) {
      throw new HttpError(400, 'bad_level', 'The level is everyone, mentor, team or admin.');
    }
    if (body.level !== null && rank(body.level as Level) < rank(tool.floor)) {
      throw new HttpError(400, 'below_floor', `${tool.name} can't open wider than ${tool.floor}: it needs the team's sign-in.`);
    }
    const saved = await readSaved(deps.toolStore);
    const levels = { ...saved.levels };
    if (body.level === null) delete levels[tool.key];
    else levels[tool.key] = body.level as Level;
    const by = { ...(saved.by ?? {}), [tool.key]: { email: user.email, at: new Date().toISOString() } };
    await deps.toolStore.setJSON(KEY, { levels, by });
    return json({ tools: listing({ levels, by }) });
  });
}
