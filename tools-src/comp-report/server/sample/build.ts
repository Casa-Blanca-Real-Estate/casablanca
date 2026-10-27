// A sample report built on the server in one transaction (Dispatch 23,
// NW-054): what the new-report screen used to stitch together in the browser.
// The home and its side, and the sample's export imported, unsorted: the start
// of a walk, with an empty Hubert. "Reset the sample" builds a fresh one and
// archives the old in the same transaction. A reset can't be done in place:
// reasons and messages are append-only, so Hubert would remember the last test.
import { withActor, type PoolLike, type Queryable } from '../db.ts';
import { HttpError } from '../http.ts';
import { mayUseSample, type SessionUser } from '../session.ts';
import { COLUMNS, asUser, summary, type ReportRow } from '../api/reports.ts';
import { parseOrRefuse, sampleFile, storeImport } from '../api/imports.ts';
import { SAMPLE_BRIEF, SAMPLE_SEND, sampleIntake, type SampleKind } from './barclay-17l.ts';

/** Makes a sample report of that kind, owned by the caller, in the caller's transaction. */
export async function buildSampleReport(
  tx: Queryable, user: SessionUser, kind: SampleKind, title: string, photos: Record<string, string[]>,
): Promise<ReportRow> {
  const brief = { audience: SAMPLE_BRIEF.audience!, ...(SAMPLE_SEND.clientName ? { clientName: SAMPLE_SEND.clientName } : {}) };
  const state = { intake: sampleIntake(kind) };
  const report = (await tx.query<ReportRow>(
    `insert into comp_report.reports (owner_email, title, property_type, sample_data, brief, state)
     values ($1, $2, $3, true, $4::jsonb, $5::jsonb) returning ${COLUMNS}`,
    [user.email, title, kind, JSON.stringify(brief), JSON.stringify(state)],
  )).rows[0]!;
  const file = sampleFile(kind);
  await storeImport(tx, report.id, file, parseOrRefuse(file), photos, true);
  return report;
}

/** Fill: a new sample report, titled from the body. */
export async function fillSample(pool: PoolLike, user: SessionUser, kind: SampleKind, title: string, photos: Record<string, string[]>) {
  if (!mayUseSample(user)) throw new HttpError(403, 'admins_only', 'Sample data is for admins and guests.');
  return withActor(pool, asUser(user), async (tx) => summary(await buildSampleReport(tx, user, kind, title, photos)));
}

/**
 * Reset: the caller's own active sample report, looked up here (never trusted
 * from the body), replaced by a fresh one with its title and kind; the old one
 * is archived. One transaction: a failure leaves the old one as it was.
 */
export async function resetSample(pool: PoolLike, user: SessionUser, reportId: string, photos: Record<string, string[]>) {
  if (!mayUseSample(user)) throw new HttpError(403, 'admins_only', 'Sample data is for admins and guests.');
  return withActor(pool, asUser(user), async (tx) => {
    // An admin may update any report under row-level security, so this `where` is the guard: kept in the update too.
    const old = (await tx.query<{ id: string; title: string; property_type: SampleKind }>(
      `select id, title, property_type from comp_report.reports
        where id = $1 and owner_email = $2 and sample_data and status = 'active' for update`,
      [reportId, user.email],
    )).rows[0];
    if (!old) throw new HttpError(404, 'not_found', 'No such sample report: it may have been reset already.');
    const fresh = await buildSampleReport(tx, user, old.property_type, old.title, photos);
    const archived = await tx.query(
      `update comp_report.reports set status = 'archived', updated_at = now()
        where id = $1 and owner_email = $2 and sample_data and status = 'active'`,
      [old.id, user.email],
    );
    if (archived.rowCount !== 1) throw new HttpError(409, 'not_archived', 'The old sample couldn’t be archived.');
    return { report: summary(fresh), archived: old.id };
  });
}
