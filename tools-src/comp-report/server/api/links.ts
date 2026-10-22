// StreetEasy links, read in the background (§6.2, Dispatch 09).
//
//   /api/comp-report/links
//     GET   ?report=<uuid>                    the report's reads and comps, for polling
//                                             while reads are in flight
//     POST  {reportId, urls[], purpose}       queue reads: StreetEasy links only, at
//                                             most 20 at once, within the person's
//                                             daily limit. A link already read or
//                                             being read here isn't read again
//     PATCH {reportId, readId, dismissed?, confirmed?}
//                                             clear a failed read from the list, or
//                                             confirm the home's read (comps are
//                                             confirmed through /comps)
//
//   /.netlify/functions/comp-report-links-background
//     POST  {reportId, readId}                does one read: claims it, reads the
//                                             page with Firecrawl, turns the extract
//                                             into a comp record (the engine), and
//                                             records the property, what the page
//                                             said (an observation, §12) and, for a
//                                             comp, the report's comp — unconfirmed
//
// The browser starts each read right after queueing it, and again if it's
// still queued a while later: a read is claimed exactly once (queued →
// running in one statement), and a read stuck running is claimable again.
// Every request is signed in, and only the report's owner can queue or start
// a read. Nothing here is a background job anyone else can trigger: the
// background function checks the session like every other endpoint.
import {
  cleanListingExtract, compRecordFromListing, ParseError, PARSER_VERSION, type CompRecord, type ParseWarning,
} from '../../engine/index.ts';
import { withActor, type Queryable } from '../db.ts';
import type { DecideConfig } from '../decide/config.ts';
import { enqueueListingJudgments } from '../decide/enqueue.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { checkListingLink, MAX_LINKS_PER_REQUEST, newYorkToday, readLimit, TOO_LONG, type LinkPurpose, type PageReader } from '../links.ts';
import { requireUser, type AuthDeps, type SessionUser } from '../session.ts';
import { asUser, requirePool } from './reports.ts';
import { loadJudgments, loadReads, reportFor } from './workspace.ts';

/**
 * A read claimed while running this long is taken to have died, and can be
 * claimed again: the reader gives up by READ_BUDGET_MS (2½ minutes), so a read
 * still running after 4 never finished.
 */
const STALE_MINUTES = 4;
/** A read that died this many times isn't started again: it fails as too long. */
export const MAX_READ_ATTEMPTS = 2;

export function handleLinks(req: Request, deps: AuthDeps & { env?: Record<string, string | undefined> }): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'POST', 'PATCH');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);

    if (req.method === 'GET') {
      const reportId = new URL(req.url).searchParams.get('report') ?? '';
      if (!UUID.test(reportId)) throw new HttpError(400, 'bad_report', 'Which report?');
      return json(await withActor(pool, asUser(user), async (tx) => {
        await reportFor(tx, user, reportId, false);
        return { reads: await loadReads(tx, reportId), comps: await loadJudgments(tx, reportId) };
      }));
    }

    const body = await readJsonObject(req);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');

    if (req.method === 'PATCH') {
      const readId = typeof body.readId === 'string' && UUID.test(body.readId) ? body.readId : null;
      if (!readId) throw new HttpError(400, 'bad_read', 'Which read?');
      if (body.dismissed !== true && body.confirmed !== true) throw new HttpError(400, 'nothing_to_save', 'Nothing to save.');
      return json(await withActor(pool, asUser(user), async (tx) => {
        await reportFor(tx, user, reportId, true);
        const changed = body.dismissed === true
          ? await tx.query(
            `update comp_report.link_reads set dismissed_at = now()
              where id = $1 and report_id = $2 and status = 'failed' and dismissed_at is null`,
            [readId, reportId],
          )
          : await tx.query(
            `update comp_report.link_reads set confirmed_at = now(), confirmed_by = comp_report.actor()
              where id = $1 and report_id = $2 and purpose = 'subject' and status = 'done' and confirmed_at is null`,
            [readId, reportId],
          );
        if (!changed.rowCount) {
          throw new HttpError(409, 'nothing_to_change', body.dismissed === true ? 'Only a failed read can be cleared.' : 'That read isn’t waiting for a confirmation.');
        }
        return { reads: await loadReads(tx, reportId), comps: await loadJudgments(tx, reportId) };
      }));
    }

    if (body.purpose !== undefined && body.purpose !== 'comp' && body.purpose !== 'subject') {
      throw new HttpError(400, 'bad_purpose', 'A link is for a comp or for the home.');
    }
    const purpose: LinkPurpose = body.purpose === 'subject' ? 'subject' : 'comp';
    if (!Array.isArray(body.urls) || !body.urls.every((u) => typeof u === 'string')) {
      throw new HttpError(400, 'bad_urls', 'Send the links as a list.');
    }
    const pasted = (body.urls as string[]).map((u) => u.trim()).filter(Boolean);
    if (!pasted.length) throw new HttpError(400, 'no_links', 'Paste a StreetEasy listing link.');
    if (pasted.length > MAX_LINKS_PER_REQUEST) {
      throw new HttpError(400, 'too_many_links', `Paste up to ${MAX_LINKS_PER_REQUEST} links at a time.`);
    }
    if (purpose === 'subject' && pasted.length > 1) throw new HttpError(400, 'one_home', 'The home is one link.');

    const refused: { url: string; reason: string }[] = [];
    const wanted: string[] = [];
    for (const raw of pasted) {
      const check = checkListingLink(raw);
      if (!check.ok) refused.push({ url: raw, reason: check.reason });
      else if (!wanted.includes(check.url)) wanted.push(check.url);
    }

    const limit = readLimit(user.role, deps.env);
    return json(await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      // One person's reads are counted one request at a time, so two pastes at once can't both slip under the limit.
      await tx.query(`select pg_advisory_xact_lock(hashtext('comp_report.link_reads:' || $1))`, [user.email]);
      const used = Number((await tx.query<{ n: string }>(
        `select count(*) as n from comp_report.link_reads where created_by = $1 and created_at > now() - interval '24 hours'`,
        [user.email],
      )).rows[0]?.n ?? 0);
      const existing = (await tx.query<{ id: string; url: string }>(
        `select id, url from comp_report.link_reads
          where report_id = $1 and purpose = $2 and status <> 'failed' and url = any($3::text[])`,
        [reportId, purpose, wanted],
      )).rows;
      const queued: string[] = [];
      const already: string[] = [];
      let left = limit - used;
      for (const url of wanted) {
        const seen = existing.find((e) => e.url === url);
        if (seen) {
          already.push(seen.id);
          continue;
        }
        if (left <= 0) {
          refused.push({ url, reason: `You’ve reached today’s limit of ${limit} links read (each read costs credit). Type this one in, or try again tomorrow.` });
          continue;
        }
        const { rows } = await tx.query<{ id: string }>(
          `insert into comp_report.link_reads (report_id, purpose, url) values ($1, $2, $3) returning id`,
          [reportId, purpose, url],
        );
        queued.push(rows[0]!.id);
        left--;
      }
      return {
        queued, already, refused,
        limit: { perDay: limit, left: Math.max(left, 0) },
        reads: await loadReads(tx, reportId),
        comps: await loadJudgments(tx, reportId),
      };
    }), 201);
  });
}

// ─── The background read ────────────────────────────────────────────────────

export interface LinkReadDeps extends AuthDeps {
  reader: PageReader;
  /** The day the page is read, in New York. Tests pin it. */
  today?: () => string;
  /** The decision layer's switch and its kick (Dispatch 10). Tests pass their own; production reads CR_JEV_MODE. */
  decide?: { config?: DecideConfig; fetchImpl?: typeof fetch };
}

type Outcome =
  | { status: 'done'; asOf: string; extract: Record<string, unknown>; warnings: ParseWarning[]; record: CompRecord }
  | { status: 'failed'; error: string; message: string; asOf: string | null; extract: Record<string, unknown> | null; warnings: ParseWarning[] };

/** Why a page that was read still can't be used, from the engine's reading of it. */
function unusable(record: CompRecord, warnings: ParseWarning[], purpose: LinkPurpose): { error: string; message: string } | null {
  if (warnings.some((w) => w.code === 'rental_listing')) {
    return { error: 'rental', message: 'That page is a rental listing. Comps are sales.' };
  }
  if (!record.identity.key) {
    return { error: 'no_address', message: 'The page gave no street address, so it can’t be recorded. Type the comp in instead.' };
  }
  if (purpose === 'comp' && !record.status.listing_status) {
    return { error: 'no_status', message: 'The page doesn’t say whether it sold, is in contract, is for sale or came off the market. Type the comp in with its status.' };
  }
  return null;
}

async function markFailed(tx: Queryable, readId: string, error: string, message: string, extra: { asOf?: string | null; extract?: unknown; warnings?: unknown } = {}) {
  await tx.query(
    `update comp_report.link_reads
        set status = 'failed', finished_at = now(), error = $2, error_message = $3,
            as_of = coalesce($4::date, as_of), extract = coalesce($5::jsonb, extract), warnings = coalesce($6::jsonb, warnings),
            parser_version = $7
      where id = $1`,
    [readId, error, message.slice(0, 500), extra.asOf ?? null, extra.extract ? JSON.stringify(extra.extract) : null,
      extra.warnings ? JSON.stringify(extra.warnings) : null, PARSER_VERSION],
  );
}

/** One read, start to finish. Awaited in tests and in local dev; in production it runs in a background function. */
export async function runLinkRead(req: Request, deps: LinkReadDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST');
    const user: SessionUser = await requireUser(req, deps);
    const pool = requirePool(deps);
    const body = await readJsonObject(req);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    const readId = typeof body.readId === 'string' && UUID.test(body.readId) ? body.readId : null;
    if (!reportId || !readId) throw new HttpError(400, 'bad_read', 'Which read?');

    // Claim it: queued, or running so long it must have died. Exactly one caller wins.
    const claimed = await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      // Died too often: it fails, so the agent types it in rather than waits on a read that never lands.
      await tx.query(
        `update comp_report.link_reads
            set status = 'failed', finished_at = now(), error = 'timeout', error_message = $4
          where id = $1 and report_id = $2
            and status = 'running' and started_at < now() - make_interval(mins => $3) and attempts >= $5`,
        [readId, reportId, STALE_MINUTES, TOO_LONG, MAX_READ_ATTEMPTS],
      );
      const { rows } = await tx.query<{ url: string; purpose: LinkPurpose }>(
        `update comp_report.link_reads
            set status = 'running', attempts = attempts + 1, started_at = now(), error = null, error_message = null
          where id = $1 and report_id = $2
            and (status = 'queued' or (status = 'running' and started_at < now() - make_interval(mins => $3)))
          returning url, purpose`,
        [readId, reportId, STALE_MINUTES],
      );
      return rows[0] ?? null;
    });
    if (!claimed) return json({ read: readId, started: false }, 200);

    const asOf = (deps.today ?? newYorkToday)();
    const readStarted = Date.now();
    let outcome: Outcome;
    try {
      const page = await deps.reader.read(claimed.url);
      if (!page.ok) {
        outcome = { status: 'failed', error: page.code, message: page.message, asOf: null, extract: null, warnings: [] };
      } else {
        // Photo URLs are stored only as cleanPhotoUrls keeps them, whichever reader read the page.
        const extract = cleanListingExtract(page.extract);
        const { record, warnings } = compRecordFromListing(extract, { as_of: asOf, url: claimed.url });
        const why = unusable(record, warnings, claimed.purpose);
        outcome = why
          ? { status: 'failed', ...why, asOf, extract, warnings }
          : { status: 'done', asOf, extract, warnings, record };
      }
    } catch (error) {
      console.error('comp-report: link read failed', error);
      const message = error instanceof ParseError ? `The page couldn’t be read as a listing: ${error.message}` : 'Something went wrong reading that page. Try the link again.';
      outcome = { status: 'failed', error: 'unreadable', message, asOf: null, extract: null, warnings: [] };
    }

    const finished = outcome;
    // Each read's result and time, in the function's log: no address, no page text.
    console.log('comp-report: link read', { readId, purpose: claimed.purpose, status: finished.status, error: finished.status === 'failed' ? finished.error : null, ms: Date.now() - readStarted });
    const save = async (tx: Queryable): Promise<number | null> => {
      if (finished.status === 'failed') {
        await markFailed(tx, readId, finished.error, finished.message, finished);
        return null;
      }
      const { record } = finished;
      const key = record.identity.key!;
      const se = record.identity.streeteasy;
      await tx.query(
        `insert into comp_report.properties (property_key, address, unit, streeteasy_id)
         values ($1, $2, $3, $4) on conflict (property_key) do nothing`,
        [key, record.identity.address.street ?? key, record.identity.unit.raw, se?.listing_id ?? se?.closing_id ?? null],
      );
      const property = (await tx.query<{ id: string }>('select id from comp_report.properties where property_key = $1', [key])).rows[0]!;
      // What the page said about this property, as it said it: an observation (§12).
      const observation = (await tx.query<{ id: string }>(
        `insert into comp_report.property_observations (property_id, report_id, source, as_of, facts, links, raw, parser_version)
         values ($1, $2, 'listing', $3, $4::jsonb, $5, $6::jsonb, $7) returning id`,
        [property.id, reportId, finished.asOf, JSON.stringify(record.facts), [claimed.url], JSON.stringify(finished.extract), record.origin?.parser_version ?? PARSER_VERSION],
      )).rows[0]!;
      let reportCompId: string | null = null;
      if (claimed.purpose === 'comp') {
        // It joins the report unconfirmed and untiered; a property already here keeps its tier and takes the newest observation.
        reportCompId = (await tx.query<{ id: string }>(
          `insert into comp_report.report_comps (report_id, property_id, observation_id, evidence_class)
           values ($1, $2, $3, $4)
           on conflict (report_id, property_id)
           do update set observation_id = excluded.observation_id, evidence_class = excluded.evidence_class
           returning id`,
          [reportId, property.id, observation.id, record.status.listing_status],
        )).rows[0]!.id;
      }
      await tx.query(
        `update comp_report.link_reads
            set status = 'done', finished_at = now(), as_of = $2, extract = $3::jsonb, warnings = $4::jsonb,
                parser_version = $5, observation_id = $6, report_comp_id = $7, error = null, error_message = null
          where id = $1`,
        [readId, finished.asOf, JSON.stringify(finished.extract), JSON.stringify(finished.warnings),
          record.origin?.parser_version ?? PARSER_VERSION, observation.id, reportCompId],
      );
      return Number(observation.id);
    };
    let observationId: number | null;
    try {
      observationId = await withActor(pool, asUser(user), save);
    } catch (error) {
      // Recording failed after the read: say so on the row rather than leave it running.
      console.error('comp-report: recording a link read failed', error);
      await withActor(pool, asUser(user), (tx) => markFailed(tx, readId, 'internal', 'The page was read, but it couldn’t be saved. Try the link again.'));
      throw error;
    }
    // Committed: queue what the listing's text says for Jev (CR-D, Dispatch 10). With
    // CR_JEV_MODE off — the default — this returns at once and touches nothing. It never throws.
    if (finished.status === 'done' && observationId !== null) {
      await enqueueListingJudgments(
        { observationId, record: finished.record, userEmail: user.email },
        { pool, origin: new URL(req.url).origin, config: deps.decide?.config, fetchImpl: deps.decide?.fetchImpl },
      );
    }
    return json({ read: readId, started: true, status: finished.status }, 200);
  });
}
