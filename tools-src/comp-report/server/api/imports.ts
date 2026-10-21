// POST /api/comp-report/imports — add a StreetEasy export to a report (§3 step 2).
//   {reportId, filename, contentBase64, asOf?}   an uploaded CSV or XLSX
//   {reportId, sample: true}                     Hannah's export, for admins (Dispatch 07)
//
// The engine's parser reads the file here, as it will in the browser, so an
// unreadable file is refused before anything is stored. Then, in one
// transaction:
//   - the file, its parser version and warnings go in `imports`
//   - each property is recorded once, by its stable key (§12)
//   - what this export said about it goes in `property_observations`
//   - it joins the report as a comp, untiered until the agent sorts it; a
//     property already in the report keeps its tier and points to the new
//     observation
// Returns the whole workspace, as GET /api/comp-report/workspace does.
import { createHash } from 'node:crypto';
import { EXPORT_SCHEMA, ParseError, parseExport, type ParsedExport } from '../../engine/index.ts';
import { withActor } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { SAMPLE_EXPORT } from '../sample/barclay-17l-export.ts';
import { samplePhotos } from '../sample/photos.ts';
import { mayUseSample, requireUser } from '../session.ts';
import { asUser, requirePool } from './reports.ts';
import type { SamplePhotoDeps } from './sample-photos.ts';
import { loadWorkspace, reportFor } from './workspace.ts';

/** StreetEasy exports are a few kilobytes; this leaves room while staying under Netlify's 6 MB request limit. */
export const MAX_EXPORT_BYTES = 2 * 1024 * 1024;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function handleImports(req: Request, deps: SamplePhotoDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);
    const body = await readJsonObject(req, Math.ceil(MAX_EXPORT_BYTES * 1.4) + 4096);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');

    let bytes: Uint8Array;
    let filename: string | null;
    let asOf: string;
    const sample = body.sample === true;
    if (sample) {
      if (!mayUseSample(user)) throw new HttpError(403, 'admins_only', 'Sample data is for admins and guests.');
      bytes = new TextEncoder().encode(SAMPLE_EXPORT.csv);
      filename = SAMPLE_EXPORT.filename;
      asOf = SAMPLE_EXPORT.asOf;
    } else {
      if (typeof body.contentBase64 !== 'string' || !body.contentBase64) {
        throw new HttpError(400, 'no_file', 'Choose a StreetEasy export (CSV or XLSX).');
      }
      bytes = new Uint8Array(Buffer.from(body.contentBase64, 'base64'));
      if (!bytes.length) throw new HttpError(400, 'no_file', 'That file is empty.');
      if (bytes.length > MAX_EXPORT_BYTES) throw new HttpError(413, 'too_large', 'That file is larger than a StreetEasy export should be (2 MB).');
      filename = typeof body.filename === 'string' && body.filename.trim() ? body.filename.trim().slice(0, 255) : null;
      asOf = typeof body.asOf === 'string' && ISO_DATE.test(body.asOf) ? body.asOf : today();
    }

    let parsed: ParsedExport;
    try {
      parsed = parseExport(bytes, { as_of: asOf, ...(filename ? { filename } : {}) });
    } catch (error) {
      const why = error instanceof ParseError || error instanceof Error ? error.message : String(error);
      throw new HttpError(400, 'unreadable_export', `That file couldn’t be read as a StreetEasy export: ${why}`);
    }
    if (!parsed.comps.length) throw new HttpError(400, 'no_comps', 'That export has no comps in it.');
    // The sample's comps carry the photos read from their pages, once that's been done (sample/photos.ts).
    const photos = sample ? await samplePhotos(deps.samplePhotos) : {};

    const workspace = await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      // A report that ever held sample data says so, in the list and on every figure (Dispatch 07).
      if (sample) await tx.query('update comp_report.reports set sample_data = true where id = $1 and not sample_data', [reportId]);
      const imported = (await tx.query<{ id: string }>(
        `insert into comp_report.imports
           (report_id, filename, format, content, content_sha256, as_of, parser_version, export_schema, comp_count, warnings, sample)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
         returning id`,
        [
          reportId, filename, parsed.format, Buffer.from(bytes), createHash('sha256').update(bytes).digest('hex'), asOf,
          parsed.parser.version, parsed.parser.schema ?? EXPORT_SCHEMA, parsed.comps.length, JSON.stringify(parsed.warnings), sample,
        ],
      )).rows[0]!;

      for (const record of parsed.comps) {
        const key = record.identity.key;
        const evidence = record.status.evidence_class;
        if (!key || !evidence) continue; // shown in the walkthrough as unsortable, never stored as a comp
        const se = record.identity.streeteasy;
        await tx.query(
          `insert into comp_report.properties (property_key, address, unit, streeteasy_id)
           values ($1, $2, $3, $4) on conflict (property_key) do nothing`,
          [key, record.identity.address.street ?? key, record.identity.unit.raw, se?.listing_id ?? se?.closing_id ?? null],
        );
        const property = (await tx.query<{ id: string }>('select id from comp_report.properties where property_key = $1', [key])).rows[0]!;
        const observation = (await tx.query<{ id: string }>(
          `insert into comp_report.property_observations (property_id, report_id, import_id, source, as_of, facts, links, raw)
           values ($1, $2, $3, 'se_export', $4, $5::jsonb, $6, $7::jsonb) returning id`,
          [property.id, reportId, imported.id, asOf, JSON.stringify(record.facts), se?.url ? [se.url] : [], photos[key] ? JSON.stringify({ photos: photos[key] }) : null],
        )).rows[0]!;
        await tx.query(
          `insert into comp_report.report_comps (report_id, property_id, observation_id, evidence_class)
           values ($1, $2, $3, $4)
           on conflict (report_id, property_id)
           do update set observation_id = excluded.observation_id, evidence_class = excluded.evidence_class`,
          [reportId, property.id, observation.id, evidence],
        );
      }
      return loadWorkspace(tx, user, reportId);
    });
    return json(workspace, 201);
  });
}
