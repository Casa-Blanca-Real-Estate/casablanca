// /api/comp-report/comps — the comps in a report, and the agent's review of them (§3).
//   POST  {reportId, reportCompId, tier, reason, reasonType}
//         tier a comp. Reasons are append-only (§12): each tier change is a new
//         reason, and recording it is what sets the tier (a database trigger)
//   POST  {reportId, manual: {address, unit?, status, price?, date?, area_sqft?, floor?, …}}
//         a comp typed in, for one without a link (§6.2): the agent's record,
//         read by the engine (compRecordFromManual) and kept as an observation
//   POST  {reportId, sample: true}
//         admins: sort every comp the sample knows, with its sample reason,
//         mark them reviewed and set the sample's anchor (Dispatch 07)
//   PATCH {reportId, reportCompId, reviewed?, anchor?, confirmed?}
//         mark a comp reviewed, make it the anchor — the single most
//         comparable sold comp (§6.3), at most one per report — or confirm a
//         comp read from its StreetEasy page, in one tap: until then it counts
//         in neither result (§6.2)
// Each returns the whole workspace. Only the report's owner can change it.
import { compRecordFromManual, ParseError, PARSER_VERSION, type ManualCompFields } from '../../engine/index.ts';
import { withActor, type Queryable } from '../db.ts';
import { newYorkToday } from '../links.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { SAMPLE_TIERS } from '../sample/barclay-17l.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { asUser, requirePool } from './reports.ts';
import { loadWorkspace, reportFor } from './workspace.ts';

const TIERS = ['primary', 'secondary', 'excluded'];
const REASON_TYPES = ['property', 'client', 'method'];
const MAX_REASON = 1000;

async function recordReason(
  tx: Queryable, reportId: string, reportCompId: string, tier: string, reason: string, reasonType: string, sample: boolean,
) {
  await tx.query(
    `insert into comp_report.reasons (report_comp_id, report_id, tier, reason, reason_type, actor, sample)
     values ($1, $2, $3, $4, $5, 'agent', $6)`,
    [reportCompId, reportId, tier, reason, reasonType, sample],
  );
}

async function setAnchor(tx: Queryable, reportId: string, reportCompId: string, anchor: boolean) {
  if (anchor) {
    await tx.query(
      `update comp_report.report_comps set is_anchor = (id = $2) where report_id = $1 and (is_anchor or id = $2)`,
      [reportId, reportCompId],
    );
  } else {
    await tx.query(`update comp_report.report_comps set is_anchor = false where report_id = $1 and id = $2`, [reportId, reportCompId]);
  }
}

async function setReviewed(tx: Queryable, reportId: string, reportCompId: string, reviewed: boolean) {
  await tx.query(
    `update comp_report.report_comps
        set reviewed_at = case when $3 then now() end,
            reviewed_by = case when $3 then comp_report.actor() end
      where report_id = $1 and id = $2`,
    [reportId, reportCompId, reviewed],
  );
}

const MANUAL_FIELDS = [
  'address', 'unit', 'url', 'status', 'price', 'date', 'area_sqft', 'floor', 'beds', 'baths', 'property_type',
  'common_charges_monthly', 'taxes_monthly', 'maintenance_monthly',
] as const;

/** A comp typed in: read by the engine, recorded once as a property, kept as the agent's observation, and joined to the report. */
async function addManualComp(tx: Queryable, reportId: string, manual: unknown, asOf: string): Promise<void> {
  if (!manual || typeof manual !== 'object' || Array.isArray(manual)) throw new HttpError(400, 'bad_comp', 'Send the comp as an object.');
  if (JSON.stringify(manual).length > 4096) throw new HttpError(413, 'too_large', 'That comp is too large.');
  // Only the fields a typed-in comp has: nothing else is kept.
  const fields: Record<string, unknown> = {};
  for (const k of MANUAL_FIELDS) if ((manual as Record<string, unknown>)[k] !== undefined) fields[k] = (manual as Record<string, unknown>)[k];
  if (typeof fields.address !== 'string' || !fields.address.trim()) throw new HttpError(400, 'no_address', 'Give the comp’s address.');
  if (typeof fields.url === 'string' && fields.url.trim() && !/^https:\/\/(www\.)?streeteasy\.com\//.test(fields.url.trim())) {
    throw new HttpError(400, 'bad_url', 'A link, if you give one, is the comp’s StreetEasy listing.');
  }
  let read;
  try {
    read = compRecordFromManual(fields as unknown as ManualCompFields, { as_of: asOf });
  } catch (error) {
    throw new HttpError(400, 'bad_comp', error instanceof ParseError ? `That comp can’t be read: ${error.message}` : 'That comp can’t be read.');
  }
  const { record } = read;
  const key = record.identity.key;
  if (!key) throw new HttpError(400, 'no_address', 'Give the comp’s street address.');
  const se = record.identity.streeteasy;
  await tx.query(
    `insert into comp_report.properties (property_key, address, unit, streeteasy_id)
     values ($1, $2, $3, $4) on conflict (property_key) do nothing`,
    [key, record.identity.address.street ?? key, record.identity.unit.raw, se?.listing_id ?? se?.closing_id ?? null],
  );
  const property = (await tx.query<{ id: string }>('select id from comp_report.properties where property_key = $1', [key])).rows[0]!;
  const observation = (await tx.query<{ id: string }>(
    `insert into comp_report.property_observations (property_id, report_id, source, as_of, facts, links, raw, parser_version)
     values ($1, $2, 'agent', $3, $4::jsonb, $5, $6::jsonb, $7) returning id`,
    [property.id, reportId, asOf, JSON.stringify(record.facts), se?.url ? [se.url] : [], JSON.stringify(fields), record.origin?.parser_version ?? PARSER_VERSION],
  )).rows[0]!;
  await tx.query(
    `insert into comp_report.report_comps (report_id, property_id, observation_id, evidence_class)
     values ($1, $2, $3, $4)
     on conflict (report_id, property_id)
     do update set observation_id = excluded.observation_id, evidence_class = excluded.evidence_class`,
    [reportId, property.id, observation.id, record.status.listing_status],
  );
}

export function handleComps(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST', 'PATCH');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);
    const body = await readJsonObject(req);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');

    if (req.method === 'POST' && body.sample === true) {
      if (user.role !== 'admin') throw new HttpError(403, 'admins_only', 'Sample data is for admins.');
      return json(await withActor(pool, asUser(user), async (tx) => {
        await reportFor(tx, user, reportId, true);
        const comps = (await tx.query<{ id: string; property_key: string; tier: string | null }>(
          `select rc.id, p.property_key, rc.tier from comp_report.report_comps rc
             join comp_report.properties p on p.id = rc.property_id where rc.report_id = $1`,
          [reportId],
        )).rows;
        let matched = 0;
        for (const sample of SAMPLE_TIERS) {
          const comp = comps.find((c) => c.property_key === sample.propertyKey);
          if (!comp) continue;
          matched++;
          if (comp.tier !== sample.tier) await recordReason(tx, reportId, comp.id, sample.tier, sample.reason, sample.reasonType, true);
          await setReviewed(tx, reportId, comp.id, true);
          if (sample.anchor) await setAnchor(tx, reportId, comp.id, true);
        }
        if (!matched) throw new HttpError(409, 'no_sample_comps', 'Import the sample export first (step 2): the sample sorts its comps.');
        await tx.query('update comp_report.reports set sample_data = true where id = $1 and not sample_data', [reportId]);
        return loadWorkspace(tx, user, reportId);
      }));
    }

    if (req.method === 'POST' && body.manual !== undefined) {
      return json(await withActor(pool, asUser(user), async (tx) => {
        await reportFor(tx, user, reportId, true);
        await addManualComp(tx, reportId, body.manual, newYorkToday());
        return loadWorkspace(tx, user, reportId);
      }), 201);
    }

    const reportCompId = typeof body.reportCompId === 'string' && UUID.test(body.reportCompId) ? body.reportCompId : null;
    if (!reportCompId) throw new HttpError(400, 'bad_comp', 'Which comp?');

    if (req.method === 'POST') {
      const tier = typeof body.tier === 'string' && TIERS.includes(body.tier) ? body.tier : null;
      if (!tier) throw new HttpError(400, 'bad_tier', 'The tier is primary, secondary or excluded.');
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!reason) throw new HttpError(400, 'no_reason', 'Every tier needs a reason.');
      if (reason.length > MAX_REASON) throw new HttpError(400, 'bad_reason', `Keep the reason under ${MAX_REASON} characters.`);
      const reasonType = typeof body.reasonType === 'string' && REASON_TYPES.includes(body.reasonType) ? body.reasonType : null;
      if (!reasonType) throw new HttpError(400, 'bad_reason_type', 'The reason is about the property, the client or the method.');
      return json(await withActor(pool, asUser(user), async (tx) => {
        await reportFor(tx, user, reportId, true);
        await recordReason(tx, reportId, reportCompId, tier, reason, reasonType, false);
        return loadWorkspace(tx, user, reportId);
      }));
    }

    const reviewed = body.reviewed;
    const anchor = body.anchor;
    const confirmed = body.confirmed;
    if (reviewed !== undefined && typeof reviewed !== 'boolean') throw new HttpError(400, 'bad_reviewed', 'reviewed is true or false.');
    if (anchor !== undefined && typeof anchor !== 'boolean') throw new HttpError(400, 'bad_anchor', 'anchor is true or false.');
    if (confirmed !== undefined && confirmed !== true) throw new HttpError(400, 'bad_confirmed', 'A confirmation can only be given.');
    if (reviewed === undefined && anchor === undefined && confirmed === undefined) throw new HttpError(400, 'nothing_to_save', 'Nothing to save.');
    return json(await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      const exists = await tx.query('select 1 from comp_report.report_comps where report_id = $1 and id = $2', [reportId, reportCompId]);
      if (!exists.rowCount) throw new HttpError(404, 'not_found', 'No such comp in this report.');
      if (confirmed) {
        // The read behind the comp's current observation: what the agent is looking at.
        const done = await tx.query(
          `update comp_report.link_reads lr
              set confirmed_at = now(), confirmed_by = comp_report.actor()
             from comp_report.report_comps rc
            where rc.id = $2 and rc.report_id = $1
              and lr.report_id = rc.report_id and lr.observation_id = rc.observation_id
              and lr.status = 'done' and lr.confirmed_at is null`,
          [reportId, reportCompId],
        );
        if (!done.rowCount) throw new HttpError(409, 'nothing_to_confirm', 'That comp isn’t waiting for a confirmation.');
      }
      if (reviewed !== undefined) await setReviewed(tx, reportId, reportCompId, reviewed);
      if (anchor !== undefined) await setAnchor(tx, reportId, reportCompId, anchor);
      return loadWorkspace(tx, user, reportId);
    }));
  });
}
