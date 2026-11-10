// /api/comp-report/reports
//   GET              the signed-in user's own reports, newest first (200 at most)
//   GET  ?archived=1 the ones they archived
//   GET  ?id=<uuid>  one report: the owner's, or any for an admin or mentor (read-only)
//   GET  ?scope=all[&owner=<email>]  admins and mentors: everyone's (NW-088 a); ignored for anyone else
//   GET  ?scope=all&mentees=1        a mentor: only their mentees' (api/mentees.ts)
//   POST {title, propertyType?}  create a report
//   POST {duplicateOf, carryChat?}  copy the owner's own report: comps, tiers, details, reads; the chat only with carryChat (duplicate.ts)
//   PATCH {id, action: 'archive' | 'restore' | 'delete'}  the owner's own report only;
//                    delete is for sample reports (Kimani, 2026-10-22), and is final
//
// Every query names its owner explicitly as well as running under row-level
// security (§12: scoped both ways).
import { withActor, type PoolLike } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { normalizeEmail } from '../access.ts';
import { requireUser, type AuthDeps, type SessionUser } from '../session.ts';
import { logAccess, logViewed } from '../logs.ts';
import { readsEveryReport, reportFor } from './workspace.ts';
import { cleanPhotoUrls, compRecordFromListing, identify } from '../../engine/index.ts';
import type { Queryable } from '../db.ts';
import { neutralNumbers, newYorkToday } from '../numbers.ts';
import { samplePhotos, type SamplePhotoStore } from '../sample/photos.ts';
import { answerResult } from '../../workspace/reading.ts';
import { duplicateReport } from './duplicate.ts';

export interface ReportSummary {
  id: string;
  title: string;
  propertyType: 'condo' | 'coop';
  mode: 'practice' | 'full';
  status: 'active' | 'archived' | 'deleted';
  ownerEmail: string;
  /** The owner's name, on Everyone's reports (null when Identity gave none). */
  ownerName?: string | null;
  /** Filled with sample data at some point: badged as a sample report (Dispatch 07). */
  sampleData: boolean;
  createdAt: string;
  updatedAt: string;
  /** The reports list (Dispatch 14): the client's name, the side, and where the report has got to. */
  client?: string | null;
  side?: 'buyer' | 'seller' | null;
  stage?: ReportStage;
  /** Comps still without a tier, while the report is on Sort. */
  unsorted?: number;
  /** The reports list (the design pass, 2026-11-06): the comps on the report, not taken out. */
  comps?: number;
  /** The range as the report last showed it (state.range, written by the browser once revealed), else the reveal's pin. */
  rangeLow?: number | null;
  rangeHigh?: number | null;
  /** When it was marked as sent. */
  sentAt?: string | null;
  /** The home's photo, from its StreetEasy page (linked, never copied: NW-020 a). */
  photo?: string | null;
  /** Where the photo came from: the home's own read, the sample's stored photos, or another unit in the same building. */
  photoFrom?: 'read' | 'sample' | 'building' | null;
  /** The owner's level, on Everyone's reports: practice or full. */
  ownerLevel?: 'practice' | 'full' | null;
  /** Done's What's next items ticked (state.doneChecks), by key. */
  doneChecks?: string[];
  /** The latest change to the report or any of its comps (a comp's tier lives on its own row). */
  workedAt?: string;
}

export type ReportStage = 'sort' | 'findings' | 'send' | 'sent';

export interface ReportRow {
  id: string;
  title: string;
  property_type: 'condo' | 'coop';
  mode: 'practice' | 'full';
  status: 'active' | 'archived' | 'deleted';
  owner_email: string;
  sample_data: boolean;
  created_at: Date;
  updated_at: Date;
  client?: string | null;
  side?: 'buyer' | 'seller' | null;
  stage?: ReportStage;
  unsorted?: number | string;
  owner_name?: string | null;
  comps?: number | string;
  range_low?: number | string | null;
  range_high?: number | string | null;
  sent_at?: string | null;
  photo?: string | null;
  owner_level?: 'practice' | 'full' | null;
  revealed?: boolean;
  worked_at?: Date | null;
  done_checks?: string[] | null;
  intake_address?: string | null;
  intake_unit?: string | null;
  /** Filled in after the query: the photo's source (see photoFrom). */
  photo_from?: 'read' | 'sample' | 'building' | null;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const COLUMNS = 'id, title, property_type, mode, status, owner_email, sample_data, created_at, updated_at';

export function summary(r: ReportRow): ReportSummary {
  return {
    id: r.id,
    title: r.title,
    propertyType: r.property_type,
    mode: r.mode,
    status: r.status,
    ownerEmail: r.owner_email,
    sampleData: r.sample_data,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    ...(r.owner_name !== undefined ? { ownerName: r.owner_name } : {}),
    ...(r.stage ? { client: r.client ?? null, side: r.side ?? null, stage: r.stage, unsorted: Number(r.unsorted ?? 0) } : {}),
    ...(r.comps !== undefined ? {
      comps: Number(r.comps ?? 0),
      rangeLow: num(r.range_low),
      rangeHigh: num(r.range_high),
      sentAt: r.sent_at && !Number.isNaN(Date.parse(r.sent_at)) ? new Date(r.sent_at).toISOString() : null,
      photo: cleanPhotoUrls([r.photo])[0] ?? null,
      photoFrom: cleanPhotoUrls([r.photo])[0] ? (r.photo_from ?? 'read') : null,
      doneChecks: Array.isArray(r.done_checks) ? r.done_checks.filter((k) => typeof k === 'string') : [],
      ...(r.worked_at ? { workedAt: new Date(r.worked_at).toISOString() } : {}),
    } : {}),
    ...(r.owner_level !== undefined ? { ownerLevel: r.owner_level } : {}),
  };
}

export function requirePool(deps: AuthDeps): PoolLike {
  if (!deps.pool) {
    throw new HttpError(503, 'database_not_configured', 'Saved reports need the database, which isn\'t set up yet.');
  }
  return deps.pool;
}

export const asUser = (user: SessionUser) => ({ kind: 'user' as const, email: user.email, role: user.role });

export interface ReportsDeps extends AuthDeps {
  /** The sample's stored photos (server/sample/photos.ts): a sample report's thumbnail. */
  samplePhotos?: SamplePhotoStore | null;
}

/** At most this many ranges are worked out per list: the rest keep what their report last showed. */
export const RANGE_LIMIT = 60;

/**
 * The range each revealed report shows now, worked out here from what's stored (the wiring pass, 2026-11-06).
 * The browser writes state.range only when the owner opens the report, so a mentor or admin reading the list
 * saw the range as it stood then, and reports from before that saw the reveal's pin. The engine runs on the
 * server exactly as get_numbers does; the range doesn't depend on the call, the target or the deal terms.
 * A report the engine can't run on keeps the stored one.
 */
async function currentRanges(tx: Queryable, rows: ReportRow[], asOf: string): Promise<void> {
  for (const r of rows.filter((x) => x.revealed).slice(0, RANGE_LIMIT)) {
    await tx.query('savepoint cr_range');
    try {
      const n = await neutralNumbers(tx, r.id, asOf);
      await tx.query('release savepoint cr_range');
      if (!n) continue;
      const range = n.output.results[answerResult(n.output)].range;
      r.range_low = range ? Math.round(range.low.value) : null;
      r.range_high = range ? Math.round(range.high.value) : null;
    } catch {
      await tx.query('rollback to savepoint cr_range').catch(() => {});
    }
  }
}

/** The street a property key or an address is on, normalised ("100 barclay street"): the same building, near enough. */
const streetOfKey = (key: string | null | undefined) => (key ? key.split('|')[3] || null : null);

function homeStreet(r: ReportRow): string | null {
  const address = r.intake_address?.trim() || r.title.replace(/\s+#\S+$/, '');
  try {
    return identify({ address, unit: r.intake_unit ?? null }).address.normalized_street ?? null;
  } catch {
    return null;
  }
}

/**
 * A thumbnail for the rows without a read of their own (the wiring pass): a sample's from the sample's stored
 * photos (a comp in the same building, since 17L has no page of its own), and any other's from a comp read in
 * the same building on that report. Still none: the list sets the address in type.
 */
async function fallbackPhotos(tx: Queryable, rows: ReportRow[], store: SamplePhotoStore | null | undefined): Promise<void> {
  const bare = rows.filter((r) => !cleanPhotoUrls([r.photo])[0]);
  if (!bare.length) return;
  for (const r of rows) if (cleanPhotoUrls([r.photo])[0]) r.photo_from = 'read';

  const samples = bare.filter((r) => r.sample_data);
  if (samples.length && store) {
    const kept = await samplePhotos(store);
    const byStreet = new Map<string, string>();
    for (const [key, urls] of Object.entries(kept)) {
      const street = streetOfKey(key);
      if (street && urls[0] && !byStreet.has(street)) byStreet.set(street, urls[0]);
    }
    for (const r of samples) {
      const street = homeStreet(r);
      const photo = street ? byStreet.get(street) : undefined;
      if (photo) {
        r.photo = photo;
        r.photo_from = 'sample';
      }
    }
  }

  const still = bare.filter((r) => !r.photo);
  if (!still.length) return;
  const { rows: reads } = await tx.query<{ report_id: string; url: string; as_of: string | null; extract: Record<string, unknown> | null }>(
    `select report_id, url, as_of::text as as_of, extract from comp_report.link_reads
      where report_id = any($1::uuid[]) and purpose = 'comp' and status = 'done' and dismissed_at is null and extract is not null
      order by seq desc`,
    [still.map((r) => r.id)],
  );
  for (const r of still) {
    const street = homeStreet(r);
    if (!street) continue;
    for (const read of reads) {
      if (read.report_id !== r.id || !read.extract) continue;
      const photo = cleanPhotoUrls([read.extract['heroImageUrl'], ...(Array.isArray(read.extract['photos']) ? read.extract['photos'] : [])])[0];
      if (!photo) continue;
      let same = false;
      try {
        same = compRecordFromListing(read.extract, { as_of: read.as_of ?? newYorkToday(), url: read.url }).record.identity.address.normalized_street === street;
      } catch {
        same = false;
      }
      if (same) {
        r.photo = photo;
        r.photo_from = 'building';
        break;
      }
    }
  }
}

export function handleReports(req: Request, deps: ReportsDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'POST', 'PATCH');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);

    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id');
      if (id !== null) {
        if (!UUID.test(id)) throw new HttpError(400, 'bad_id');
        const { found, report } = await withActor(pool, asUser(user), async (tx) => {
          const found = await reportFor(tx, user, id, false);
          const { rows } = await tx.query<ReportRow>(`select ${COLUMNS} from comp_report.reports where id = $1`, [id]);
          return { found, report: rows[0] };
        });
        if (!report) throw new HttpError(404, 'not_found', 'No such report.');
        await logViewed(pool, user, found);
        return json({ report: summary(report) });
      }
      const params = new URL(req.url).searchParams;
      const status = params.get('archived') === '1' ? 'archived' : 'active';
      // Everyone's reports (NW-088 a, NB-23 A): admins and mentors only. From anyone else
      // scope=all is ignored and they get their own. The owner clause stays in the SQL.
      const everyone = params.get('scope') === 'all' && readsEveryReport(user);
      let owner: string | null = null;
      if (everyone && params.has('owner')) {
        owner = normalizeEmail(params.get('owner'));
        if (owner === null || owner !== params.get('owner')) throw new HttpError(400, 'bad_owner', 'Give the owner as a lower-case email address.');
      }
      const mentees = everyone && user.role === 'mentor' && params.get('mentees') === '1';
      const reports = await withActor(pool, asUser(user), async (tx) => {
        // Client, side and stage for every row in one query (Dispatch 14): the stage is how far the
        // report has got — sent, then on Send, then past the Gate, else still sorting.
        const { rows } = await tx.query<ReportRow>(
          `select ${COLUMNS.split(', ').map((c) => `r.${c}`).join(', ')},
                  nullif(btrim(coalesce(r.brief->'clientName'->>'value', r.state->'send'->'clientName'->>'value')), '') as client,
                  case when r.brief->'audience'->>'value' in ('buyer', 'seller') then r.brief->'audience'->>'value' end as side,
                  case
                    when r.state->'send'->>'sentAt' is not null then 'sent'
                    when r.state->>'reached' = 'send' or r.state->'send'->'headline' is not null then 'send'
                    when r.agent_call is not null then 'findings'
                    else 'sort'
                  end as stage,
                  (select nullif(btrim(u.name), '') from comp_report.users u where u.email = r.owner_email) as owner_name,
                  (select count(*) from comp_report.report_comps rc
                    where rc.report_id = r.id and rc.removed_at is null and rc.tier is null) as unsorted,
                  (select count(*) from comp_report.report_comps rc
                    where rc.report_id = r.id and rc.removed_at is null) as comps,
                  -- The range the report last showed, else the reveal's pin; never before the agent's call.
                  case when r.agent_call is not null then coalesce(r.state->'range'->>'low', r.state->'reveal'->>'low') end as range_low,
                  case when r.agent_call is not null then coalesce(r.state->'range'->>'high', r.state->'reveal'->>'high') end as range_high,
                  r.state->'send'->>'sentAt' as sent_at,
                  (select coalesce(lr.extract->>'heroImageUrl', lr.extract->'photos'->>0) from comp_report.link_reads lr
                    where lr.report_id = r.id and lr.purpose = 'subject' and lr.status = 'done'
                    order by lr.seq desc limit 1) as photo,
                  (select u.capability from comp_report.users u where u.email = r.owner_email) as owner_level,
                  r.agent_call is not null as revealed,
                  -- Last worked on: the report, or any of its comps (a tier or a note is saved on the comp's own row).
                  greatest(r.updated_at, (select max(rc.updated_at) from comp_report.report_comps rc where rc.report_id = r.id)) as worked_at,
                  -- Done's What's next, the items ticked.
                  (select coalesce(jsonb_agg(k.key order by k.key), '[]'::jsonb)
                     from jsonb_each(case when jsonb_typeof(r.state -> 'doneChecks') = 'object' then r.state -> 'doneChecks' else '{}'::jsonb end) k
                    where k.value = 'true'::jsonb) as done_checks,
                  r.state -> 'intake' -> 'address' ->> 'value' as intake_address,
                  r.state -> 'intake' -> 'unit' ->> 'value' as intake_unit
             from comp_report.reports r
            where ($3 or r.owner_email = $1) and ($4::text is null or r.owner_email = $4) and r.status = $2
              and (not $5 or r.owner_email in (select m.agent_email from comp_report.mentees m
                                                 where m.mentor_email = $1 and m.removed_at is null))
              -- The test user's reports are its own (Dispatch 23 item 4): never in everyone's.
              and (not $3 or r.owner_email not in (select tu.email from comp_report.users tu where tu.is_test))
            order by r.updated_at desc limit 200`,
          [user.email, status, everyone, owner, mentees],
        );
        await currentRanges(tx, rows, newYorkToday());
        await fallbackPhotos(tx, rows, deps.samplePhotos);
        return rows;
      });
      // An admin or mentor loading everyone's: one line per viewer and half hour (Dispatch 22b).
      if (everyone) await logAccess(pool, { kind: 'viewed_list', source: 'server', byEmail: user.email, ownerEmail: owner });
      return json({ reports: reports.map(summary) });
    }

    const body = await readJsonObject(req);
    if (req.method === 'PATCH') return json(await changeStatus(pool, user, body));
    if ('duplicateOf' in body) {
      const copy = await withActor(pool, asUser(user), async (tx) => {
        const id = await duplicateReport(tx, user, body.duplicateOf, body.carryChat === true);
        return (await tx.query<ReportRow>(`select ${COLUMNS} from comp_report.reports where id = $1`, [id])).rows[0];
      });
      if (!copy) throw new HttpError(500, 'not_created');
      return json({ report: summary(copy) }, 201);
    }
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 1 || title.length > 200) {
      throw new HttpError(400, 'bad_title', 'Give the report a title of up to 200 characters.');
    }
    const propertyType = body.propertyType ?? 'condo';
    if (propertyType !== 'condo' && propertyType !== 'coop') {
      throw new HttpError(400, 'bad_property_type', 'Property type is condo or coop.');
    }
    const created = await withActor(pool, asUser(user), async (tx) => {
      const { rows } = await tx.query<ReportRow>(
        `insert into comp_report.reports (owner_email, title, property_type)
         values ($1, $2, $3) returning ${COLUMNS}`,
        [user.email, title, propertyType],
      );
      return rows[0];
    });
    if (!created) throw new HttpError(500, 'not_created');
    return json({ report: summary(created) }, 201);
  });
}

const NEXT: Record<'archive' | 'restore', { from: ReportSummary['status']; to: ReportSummary['status'] }> = {
  archive: { from: 'active', to: 'archived' },
  restore: { from: 'archived', to: 'active' },
};

/** Archive, restore or delete the owner's own report: an admin reading someone else's can't. */
async function changeStatus(pool: PoolLike, user: SessionUser, body: Record<string, unknown>) {
  const id = body.id;
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, 'bad_id');
  const action = body.action;
  if (action !== 'archive' && action !== 'restore' && action !== 'delete') {
    throw new HttpError(400, 'bad_action', 'The action is archive, restore or delete.');
  }
  return withActor(pool, asUser(user), async (tx) => {
    const { rows } = await tx.query<ReportRow>(
      `select ${COLUMNS} from comp_report.reports where id = $1 and owner_email = $2 and status <> 'deleted' for update`,
      [id, user.email],
    );
    const report = rows[0];
    if (!report) throw new HttpError(404, 'not_found', 'No such report.');
    if (action === 'delete') {
      if (!report.sample_data) {
        throw new HttpError(409, 'not_sample', 'Only a sample report can be deleted. Archive this one instead.');
      }
    } else if (report.status !== NEXT[action].from) {
      throw new HttpError(409, 'bad_state', action === 'archive' ? 'This report is already archived.' : 'This report isn’t archived.');
    }
    const to = action === 'delete' ? 'deleted' : NEXT[action].to;
    const updated = await tx.query<ReportRow>(
      `update comp_report.reports set status = $2, updated_at = now() where id = $1 returning ${COLUMNS}`,
      [id, to],
    );
    return { report: summary(updated.rows[0]!) };
  });
}
