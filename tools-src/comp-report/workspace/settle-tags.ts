// When the data settles a comp's tags (NW-059, NB-9 C; Dispatch 20 applies
// Dispatch 16's derivedTags). For every comp the engine has read: a tag its
// facts contradict comes off, for every agent; a tag its data supports is
// pre-filled for a full agent, once, and offered as a "from the data" chip to a
// practice agent. "Once" is kept per comp in reports.state (`tagsOffered`): a
// tag the data already offered isn't put back after the agent removes it, but
// a new one (the home's size typed in later) still arrives. Plain data: the
// workspace runs it after each recompute and saves what changed.
import type { EngineOutput } from '../engine/index.ts';
import { derivedTags, withDerivedTags, type DerivedTag } from './derived-tags.ts';
import type { WorkspaceComp } from './engine-input.ts';
import { cleanFeatures } from './features.ts';

export interface SettledTags {
  /** The comps whose stored tags change, with their new tags. */
  edits: { reportCompId: string; tags: string[] }[];
  /** reports.state's `tagsOffered` after this: each comp's tags the data has offered, by report comp id. */
  offered: Record<string, string[]>;
  /** A practice agent's one-click chips, by report comp id (none for a full agent). */
  suggestions: Record<string, DerivedTag[]>;
  /** True when `offered` differs from what was given: save it. */
  offeredChanged: boolean;
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function settleTags(args: {
  comps: readonly WorkspaceComp[];
  output: EngineOutput;
  level: 'practice' | 'full';
  offered: Readonly<Record<string, string[]>> | undefined;
}): SettledTags {
  const outById = new Map(args.output.comps.map((o) => [o.id, o]));
  const offered: Record<string, string[]> = { ...(args.offered ?? {}) };
  const edits: SettledTags['edits'] = [];
  const suggestions: SettledTags['suggestions'] = {};
  let offeredChanged = false;
  for (const c of args.comps) {
    const j = c.judgment;
    const out = outById.get(c.id);
    // Only a comp the agent can work on, as the engine reads it: confirmed, sortable, in the report.
    if (!j || !out || c.unsortable || c.unconfirmed || j.removedAt) continue;
    const own = j.features && Object.keys(j.features).length ? cleanFeatures(j.features) : null;
    const derived = derivedTags({ comp: out, record: c.record, subject: args.output.subject, features: own });
    const before = offered[j.reportCompId] ?? [];
    const fresh = derived.supported.filter((d) => !before.includes(d.tag));
    const current = j.tags ?? [];
    const applied = withDerivedTags(current, { supported: args.level === 'full' ? fresh : [], contradicted: derived.contradicted }, 'full');
    if (!same(applied.tags, current)) edits.push({ reportCompId: j.reportCompId, tags: applied.tags });
    if (args.level === 'practice') {
      const chips = withDerivedTags(applied.tags, { supported: derived.supported, contradicted: derived.contradicted }, 'practice').suggested;
      if (chips.length) suggestions[j.reportCompId] = chips;
    }
    const next = [...new Set([...before, ...derived.supported.map((d) => d.tag)])];
    if (!same(next, before)) {
      offered[j.reportCompId] = next;
      offeredChanged = true;
    }
  }
  return { edits, offered, suggestions, offeredChanged };
}
