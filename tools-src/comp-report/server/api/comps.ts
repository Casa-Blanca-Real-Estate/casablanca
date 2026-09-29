// /api/comp-report/comps — the agent's first-pass review of the comps (§3 step 3).
//   POST  {reportId, reportCompId, tier, reason, reasonType}
//         tier a comp. Reasons are append-only (§12): each tier change is a new
//         reason, and recording it is what sets the tier (a database trigger)
//   POST  {reportId, sample: true}
//         admins: sort every comp the sample knows, with its sample reason,
//         mark them reviewed and set the sample's anchor (Dispatch 07)
//   PATCH {reportId, reportCompId, reviewed?, anchor?}
//         mark a comp reviewed, or make it the anchor — the single most
//         comparable sold comp (§6.3); at most one per report
// Each returns the whole workspace. Only the report's owner can change it.
import { withActor, type Queryable } from '../db.ts';
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
    if (reviewed !== undefined && typeof reviewed !== 'boolean') throw new HttpError(400, 'bad_reviewed', 'reviewed is true or false.');
    if (anchor !== undefined && typeof anchor !== 'boolean') throw new HttpError(400, 'bad_anchor', 'anchor is true or false.');
    if (reviewed === undefined && anchor === undefined) throw new HttpError(400, 'nothing_to_save', 'Nothing to save.');
    return json(await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      const exists = await tx.query('select 1 from comp_report.report_comps where report_id = $1 and id = $2', [reportId, reportCompId]);
      if (!exists.rowCount) throw new HttpError(404, 'not_found', 'No such comp in this report.');
      if (reviewed !== undefined) await setReviewed(tx, reportId, reportCompId, reviewed);
      if (anchor !== undefined) await setAnchor(tx, reportId, reportCompId, anchor);
      return loadWorkspace(tx, user, reportId);
    }));
  });
}
