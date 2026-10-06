// /api/comp-report/geocode — where the home and every comp stand, for distance
// (Dispatch 11, §6.10).
//
//   POST {reportId}  looks up the report's buildings that have no location yet,
//                    the home's and every comp's: a few per call, one at a
//                    time. Returns every building's location, with `more` when
//                    there are still some to look up. The browser calls it after
//                    a save and whenever a report opens, so a lookup never holds
//                    up a row, the row updates when the location lands, and
//                    homes and comps saved before this are filled in (backfill).
//
// One lookup per building, shared by every report and agent: comp_report.geocodes,
// keyed by the engine's building key. A building is claimed before it's looked
// up (pending, in one statement), so two tabs never ask twice. A refusal is an
// answer and isn't asked again; a failure (a timeout, an error) is, at most
// MAX_ATTEMPTS times and no sooner than RETRY_AFTER_MINUTES apart, so there's
// no retry storm. Each lookup is recorded as an observation on the properties
// in this report it located (§12): the geocoder's name, what was sent, what it
// matched. Only the report's owner triggers lookups.
import type { IsoDate } from '../../engine/index.ts';
import { loadGeocodes, MAX_ATTEMPTS, reportBuildings, RETRY_AFTER_MINUTES, type Building } from '../buildings.ts';
import { withActor, type Queryable } from '../db.ts';
import { GEOCODER, GEOCODER_NAME, type Geocoded, type Geocoder } from '../geocode.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { newYorkToday } from '../links.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { asUser, requirePool } from './reports.ts';
import { reportFor } from './workspace.ts';

/**
 * At most this many lookups per call. Even if each one waits out the
 * geocoder's 4-second timeout, the call answers in about 13 seconds, well
 * inside the 30 a function may sit silent before Netlify ends it (measured in
 * CR-1). The browser calls again straight away while there are more.
 */
export const MAX_PER_CALL = 3;
/** A claim this old was dropped mid-lookup (the function died): it can be claimed again. */
const PENDING_STALE_SECONDS = 120;
/** A polite pause between lookups. */
const GAP_MS = 250;

export type GeocodeDeps = AuthDeps & { geocoder: Geocoder; gapMs?: number };

/**
 * The buildings to look up now — none yet, a failure due another try, or a
 * claim that was dropped — claimed in one statement each, so a building is
 * only ever asked about once at a time. At most MAX_PER_CALL; `more` when
 * others are due.
 */
async function claim(tx: Queryable, buildings: Building[]): Promise<{ claimed: Building[]; more: boolean }> {
  const rows = (await tx.query<{ building_key: string; due: boolean }>(
    `select building_key,
            (status = 'failed' and attempts < $2 and looked_up_at < now() - make_interval(mins => $3))
              or (status = 'pending' and updated_at < now() - make_interval(secs => $4)) as due
       from comp_report.geocodes where building_key = any($1)`,
    [buildings.map((b) => b.key), MAX_ATTEMPTS, RETRY_AFTER_MINUTES, PENDING_STALE_SECONDS],
  )).rows;
  const known = new Map(rows.map((r) => [r.building_key, r.due]));
  const due = buildings.filter((b) => known.get(b.key) ?? true);
  const claimed: Building[] = [];
  for (const b of due.slice(0, MAX_PER_CALL)) {
    const won = await tx.query(
      `insert into comp_report.geocodes as g (building_key, street, borough, status, geocoder, attempts)
       values ($1, $2, $3, 'pending', $4, 1)
       on conflict (building_key) do update
         set status = 'pending', attempts = g.attempts + 1, street = excluded.street, borough = excluded.borough
         where (g.status = 'failed' and g.attempts < $5 and g.looked_up_at < now() - make_interval(mins => $6))
            or (g.status = 'pending' and g.updated_at < now() - make_interval(secs => $7))
       returning building_key`,
      [b.key, b.street, b.borough, GEOCODER, MAX_ATTEMPTS, RETRY_AFTER_MINUTES, PENDING_STALE_SECONDS],
    );
    if (won.rowCount) claimed.push(b);
  }
  return { claimed, more: due.length > MAX_PER_CALL };
}

/** Within the table's 300 characters, whatever the geocoder answered. */
const clip = (text: string | null) => (text && text.length > 300 ? `${text.slice(0, 299)}…` : text);

/** A lookup's answer: on the building's row, and as an observation of each property it located (§12). */
async function record(tx: Queryable, reportId: string, b: Building, r: Geocoded, today: IsoDate) {
  const matched = r.status === 'matched' ? r : null;
  await tx.query(
    `update comp_report.geocodes
        set status = $2, lat = $3, lng = $4, matched = $5, bin = $6, reason = $7, looked_up_at = now()
      where building_key = $1`,
    [b.key, r.status, matched?.lat ?? null, matched?.lng ?? null, clip(r.status === 'failed' ? null : r.matched), matched?.bin ?? null,
      clip(r.status === 'matched' ? null : r.reason)],
  );
  const ids = [...b.propertyIds];
  if (b.home) {
    await tx.query(
      `insert into comp_report.properties (property_key, address, unit) values ($1, $2, $3) on conflict (property_key) do nothing`,
      [b.home.propertyKey, b.street, b.home.unit],
    );
    const home = (await tx.query<{ id: string }>('select id from comp_report.properties where property_key = $1', [b.home.propertyKey])).rows[0];
    if (home) ids.push(home.id);
  }
  const facts = matched
    ? {
      coordinates: {
        value: { lat: matched.lat, lng: matched.lng }, source: 'geocoder', as_of: today, confidence: 'approx',
        note: `the building’s mapped location (${GEOCODER_NAME}): ${matched.matched}`,
      },
    }
    : {};
  const raw = {
    geocoder: GEOCODER, sent: b.street, borough: b.borough, status: r.status,
    matched: r.status === 'failed' ? null : r.matched, bin: matched?.bin ?? null, reason: r.status === 'matched' ? null : r.reason,
  };
  for (const id of ids) {
    await tx.query(
      `insert into comp_report.property_observations (property_id, report_id, source, as_of, facts, links, raw)
       values ($1, $2, 'geocoder', $3, $4, '{}', $5)`,
      [id, reportId, today, JSON.stringify(facts), JSON.stringify(raw)],
    );
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function handleGeocode(req: Request, deps: GeocodeDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);
    const body = await readJsonObject(req);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');

    const { buildings, claimed, more } = await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      const buildings = await reportBuildings(tx, reportId);
      return { buildings, ...(await claim(tx, buildings)) };
    });

    // One at a time, outside any transaction: a slow geocoder holds no row or lock.
    const results = new Map<string, Geocoded>();
    for (const [i, b] of claimed.entries()) {
      if (i > 0) await pause(deps.gapMs ?? GAP_MS);
      const r = await deps.geocoder(b.street, b.borough).catch((): Geocoded => ({ status: 'failed', reason: 'the lookup failed' }));
      results.set(b.key, r);
    }

    const today = newYorkToday();
    const geocodes = await withActor(pool, asUser(user), async (tx) => {
      for (const b of claimed) await record(tx, reportId, b, results.get(b.key)!, today);
      return loadGeocodes(tx, buildings.map((b) => b.key));
    });
    return json({ geocodes, more });
  });
}
