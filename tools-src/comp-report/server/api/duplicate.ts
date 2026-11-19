// Duplicate a report (Kimani, 2026-11-06): POST /api/comp-report/reports {duplicateOf, carryChat?}.
//
// The owner's own report only. The copy is a new report with everything the agent built: the
// home's details (brief), the call, the target and the walkthrough's state, every comp with its
// facts, notes, tags, overrides and tier (its reasons copied in order, so the tier trigger sets
// each tier the way it was set), the imports and the listing reads. Hubert's chat comes along
// only when the agent ticks "Carry over the chat" (off by default): a fresh Hubert otherwise.
//
// Not copied: the writer's drafts (narratives, which Send writes again), Jev's judgments, the
// activity log, and "marked as sent" (a copy hasn't been sent). A read still queued or running on
// the original isn't copied either: paste the link again on the copy.
//
// Comp ids are new, so wherever the report's own JSON (its state, brief, call, target) or the
// chat names an old one, it's swapped for the new one. Inside Hubert's chat only the plain
// blocks change: his thinking blocks are signed and stay as they were (they're never shown).
import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db.ts';
import { HttpError, UUID } from '../http.ts';
import type { SessionUser } from '../session.ts';

export const COPY_SUFFIX = ' (copy)';

/** The copy's title: the original's, marked, within the 200-character limit. */
export function copyTitle(title: string): string {
  return `${title.slice(0, 200 - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
}

/** Swap every old comp id for its new one in a JSON value (ids are UUIDs: no accidental matches). */
export function remapIds<T>(value: T, ids: Map<string, string>): T {
  if (value === null || value === undefined || ids.size === 0) return value;
  let text = JSON.stringify(value);
  for (const [from, to] of ids) text = text.split(from).join(to);
  return JSON.parse(text) as T;
}

const SIGNED = new Set(['thinking', 'redacted_thinking']);

/** A chat message's content with the comp ids swapped, its signed thinking blocks untouched. */
export function remapContent(content: unknown, ids: Map<string, string>): unknown {
  if (!Array.isArray(content)) return remapIds(content, ids);
  return content.map((b) => (b && typeof b === 'object' && SIGNED.has((b as { type?: string }).type ?? '') ? b : remapIds(b, ids)));
}

/** The state without "marked as sent": a copy starts unsent. */
export function unsent(state: Record<string, unknown> | null): Record<string, unknown> {
  const s = { ...(state ?? {}) };
  const send = s.send;
  if (send && typeof send === 'object' && !Array.isArray(send)) {
    const { sentAt: _sentAt, ...rest } = send as Record<string, unknown>;
    s.send = rest;
  }
  return s;
}

interface Source {
  id: string; title: string; property_type: string; mode: string; sample_data: boolean;
  brief: Record<string, unknown>; agent_call: Record<string, unknown> | null;
  target: Record<string, unknown> | null; state: Record<string, unknown>;
}

/** Copies the report inside the caller's transaction (as the owner); returns the new report's id. */
export async function duplicateReport(tx: Queryable, user: SessionUser, sourceId: unknown, carryChat: boolean): Promise<string> {
  if (typeof sourceId !== 'string' || !UUID.test(sourceId)) throw new HttpError(400, 'bad_id');
  const { rows: found } = await tx.query<Source>(
    `select id, title, property_type, mode, sample_data, brief, agent_call, target, state
       from comp_report.reports where id = $1 and owner_email = $2 and status <> 'deleted'`,
    [sourceId, user.email],
  );
  const src = found[0];
  if (!src) throw new HttpError(404, 'not_found', 'No such report of yours to duplicate.');

  const { rows: comps } = await tx.query<{ id: string }>(
    'select id from comp_report.report_comps where report_id = $1 order by created_at, id',
    [src.id],
  );
  const ids = new Map(comps.map((c) => [c.id, randomUUID()]));
  const olds = [...ids.keys()];
  const news = [...ids.values()];

  const { rows: created } = await tx.query<{ id: string }>(
    `insert into comp_report.reports (owner_email, title, property_type, mode, sample_data, brief, agent_call, target, state)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb) returning id`,
    [user.email, copyTitle(src.title), src.property_type, src.mode, src.sample_data,
      JSON.stringify(remapIds(src.brief ?? {}, ids)),
      src.agent_call === null ? null : JSON.stringify(remapIds(src.agent_call, ids)),
      src.target === null ? null : JSON.stringify(remapIds(src.target, ids)),
      JSON.stringify(remapIds(unsent(src.state), ids))],
  );
  const to = created[0]!.id;

  if (olds.length) {
    // Untiered on the way in (the guard trigger); the reasons below set each tier.
    await tx.query(
      `insert into comp_report.report_comps (id, report_id, property_id, observation_id, evidence_class, is_anchor,
              reviewed_at, reviewed_by, note, tags, features, removed_at, removed_by, fact_overrides, client_line)
       select m.new_id, $2, rc.property_id, rc.observation_id, rc.evidence_class, rc.is_anchor,
              rc.reviewed_at, rc.reviewed_by, rc.note, rc.tags, rc.features, rc.removed_at, rc.removed_by,
              rc.fact_overrides, rc.client_line
         from comp_report.report_comps rc
         join unnest($3::uuid[], $4::uuid[]) as m(old_id, new_id) on m.old_id = rc.id
        where rc.report_id = $1`,
      [src.id, to, olds, news],
    );
    // One at a time, oldest first, so each comp ends on the tier its latest reason gave it.
    const { rows: reasons } = await tx.query<{ report_comp_id: string; tier: string; reason: string; reason_type: string; actor: string; sample: boolean }>(
      `select report_comp_id, tier, reason, reason_type, actor, sample from comp_report.reasons
        where report_id = $1 order by id`,
      [src.id],
    );
    for (const r of reasons) {
      await tx.query(
        `insert into comp_report.reasons (report_comp_id, report_id, tier, reason, reason_type, actor, sample)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [ids.get(r.report_comp_id), to, r.tier, r.reason, r.reason_type, r.actor, r.sample],
      );
    }
  }

  await tx.query(
    `insert into comp_report.imports (report_id, filename, format, content, content_sha256, as_of, parser_version,
            export_schema, comp_count, warnings, sample)
     select $2, filename, format, content, content_sha256, as_of, parser_version, export_schema, comp_count, warnings, sample
       from comp_report.imports where report_id = $1 order by created_at`,
    [src.id, to],
  );

  // The finished reads, in the order they were pasted (seq is the copy's own). Each keeps a finish
  // time before the copy's own row, which is how the daily read limit knows it cost nothing (links.ts).
  await tx.query(
    `insert into comp_report.link_reads (report_id, purpose, url, status, attempts, started_at, finished_at, as_of, extract,
            parser_version, warnings, error, error_message, observation_id, report_comp_id, confirmed_at, confirmed_by,
            dismissed_at, found_by)
     select $2, lr.purpose, lr.url, lr.status, lr.attempts, lr.started_at, coalesce(lr.finished_at, lr.created_at), lr.as_of, lr.extract,
            lr.parser_version, lr.warnings, lr.error, lr.error_message, lr.observation_id, m.new_id, lr.confirmed_at,
            lr.confirmed_by, lr.dismissed_at, lr.found_by
       from comp_report.link_reads lr
       left join unnest($3::uuid[], $4::uuid[]) as m(old_id, new_id) on m.old_id = lr.report_comp_id
      where lr.report_id = $1 and lr.status in ('done', 'failed')
      order by lr.seq`,
    [src.id, to, olds, news],
  );

  if (carryChat) {
    const { rows: messages } = await tx.query<{ seq: number; role: string; content: unknown; model: string | null; stop_reason: string | null;
      request_id: string | null; in_context: boolean; prompt_version: string | null }>(
      `select seq, role, content, model, stop_reason, request_id, in_context, prompt_version
         from comp_report.messages where report_id = $1 order by seq`,
      [src.id],
    );
    for (const m of messages) {
      await tx.query(
        `insert into comp_report.messages (report_id, seq, role, content, model, stop_reason, request_id, in_context, prompt_version)
         values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
        [to, m.seq, m.role, JSON.stringify(remapContent(m.content, ids)), m.model, m.stop_reason, m.request_id, m.in_context, m.prompt_version],
      );
    }
  }
  return to;
}
