// /api/comp-report/comps — the comps in a report, and the agent's review of them (§3).
//   POST  {reportId, reportCompId, tier, reason, reasonType}
//         tier a comp. Reasons are append-only (§12): each tier change is a new
//         reason, and recording it is what sets the tier (a database trigger)
//   POST  {reportId, manual: {address, unit?, status, price?, date?, area_sqft?, floor?, …}}
//         a comp typed in, for one without a link (§6.2): the agent's record,
//         read by the engine (compRecordFromManual) and kept as an observation
//   POST  {reportId, sample: true}
//         admins: sort every comp the sample knows, with its sample reason,
//         mark them reviewed and set the sample's anchor (Dispatch 07), and
//         store Hubert's review of each, feedback and take (Dispatch 25), and
//         write each one's paragraph for the client where it has none (Dispatch 26)
//   PATCH {reportId, reportCompId, reviewed?, anchor?, confirmed?, tier?, note?, tags?, features?, removed?, clientLine?}
//         (tags: the list's, or the agent's own (DP-6, Dispatch 20): see cleanTags)
//         mark a comp reviewed; make it the anchor (★, one per report, any
//         status: starring another moves it); confirm a comp read from its
//         StreetEasy page (until then it counts in neither result, §6.2); and
//         (Dispatch 14) its tier, its note ("Why it's a comp"), its tags from
//         the handoff's list, its features, or take it out of the report or
//         put it back. A tier, or a changed note on a tiered comp, still
//         appends a reason (§12): before a note exists, its text is
//         "(no note yet)". (Dispatch 15) The ★ comp is 1st tier: starring a
//         comp makes it 1st, and giving the ★ comp 2nd or ✕ takes the star off.
//         factOverrides {price?, size?, date?, floor?}: the agent's corrections
//         to the source's facts, a value each, or null to put the source's back
//         clientLine {text, by} or null (Dispatch 26): the comp's paragraph for
//         the client, from Send's client step; `at` is stamped here
//   POST  {reportId, manual, note?, tags?, features?}: a typed-in comp saves its note, tags and features with it
//   PATCH {reportId, tagEdits: [{reportCompId, tags}]}: several comps' tags at once, for the tags the
//         data settles (NB-9 C, Dispatch 20)
// Each returns the whole workspace. Only the report's owner can change it.
import { compRecordFromManual, FACT_CHECKS, ParseError, PARSER_VERSION, type ManualCompFields } from '../../engine/index.ts';
import { withActor, type Queryable } from '../db.ts';
import { newYorkToday } from '../links.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { SAMPLE_CLIENT_LINES, SAMPLE_REVIEWS, sampleTiers } from '../sample/barclay-17l.ts';
import { appendReview } from '../reviews.ts';
import { samplePhotos } from '../sample/photos.ts';
import { mayUseSample, requireUser } from '../session.ts';
import { cleanFeatures, isTag } from '../../workspace/features.ts';
import { freeTagHardTerm, isFreeTag, MAX_FREE_TAG, MAX_TAGS, normalizeFreeTag } from '../../workspace/free-tags.ts';
import { MAX_CLIENT_LINE, type ClientLine } from '../../workspace/client-words.ts';
import { NO_NOTE_YET, OVERRIDE_KEYS, type FactOverride, type OverrideKey } from '../../workspace/state.ts';
import { asUser, requirePool } from './reports.ts';
import type { SamplePhotoDeps } from './sample-photos.ts';
import { loadWorkspace, reportFor } from './workspace.ts';

const TIERS = ['primary', 'secondary', 'excluded'];
const REASON_TYPES = ['property', 'client', 'method'];
const MAX_REASON = 1000;
const MAX_NOTE = 2000;
/** The most comps one tagEdits call sets: a report's comps, with room. */
const MAX_TAG_EDITS = 200;

/** Each correctable fact's rule: the one a typed-in comp's matching field gets (compRecordFromManual). */
const OVERRIDE_RULES: Record<OverrideKey, { ok: (v: unknown, today: string) => boolean; says: string }> = {
  price: { ok: (v) => typeof v === 'number' && FACT_CHECKS.sale_price.check(v), says: 'The price is whole dollars above zero.' },
  size: { ok: (v) => typeof v === 'number' && FACT_CHECKS.area_sqft.check(v), says: 'The size is whole square feet above zero.' },
  date: { ok: (v, today) => typeof v === 'string' && FACT_CHECKS.status_date.check(v) && v <= today, says: 'The date is YYYY-MM-DD, and not in the future.' },
  floor: { ok: (v) => typeof v === 'number' && FACT_CHECKS.floor.check(v), says: 'The floor is a whole number.' },
};

interface OverrideEdits {
  /** Each set from the closed list only: built by assignment per key, never from the body's own object. */
  set: Partial<Record<OverrideKey, FactOverride>>;
  clear: OverrideKey[];
}

/**
 * The agent's corrections to the source's facts (Dispatch 15, NW-044 a). Only
 * the four keys, each a value or { value } (anything else in it is dropped),
 * or null to clear. `by` and `at` come from the session and the clock.
 */
function overrideEdits(raw: unknown, by: string, now: Date): OverrideEdits {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'bad_fact', 'Send the corrections as an object.');
  const keys = Object.keys(raw);
  for (const k of keys) {
    if (!(OVERRIDE_KEYS as readonly string[]).includes(k)) throw new HttpError(400, 'bad_fact', 'Only the price, size, date and floor can be corrected.');
  }
  const out: OverrideEdits = { set: {}, clear: [] };
  const today = newYorkToday(now);
  const at = now.toISOString();
  for (const key of OVERRIDE_KEYS) {
    if (!Object.hasOwn(raw, key)) continue;
    const given = (raw as Record<OverrideKey, unknown>)[key];
    if (given === null) {
      out.clear.push(key);
      continue;
    }
    const value = given && typeof given === 'object' && !Array.isArray(given) && Object.hasOwn(given, 'value')
      ? (given as { value: unknown }).value
      : given;
    if (!OVERRIDE_RULES[key].ok(value, today)) throw new HttpError(400, 'bad_fact', OVERRIDE_RULES[key].says);
    out.set[key] = { value: value as number | string, by, at };
  }
  return out;
}

/**
 * A comp's tags as stored: each from the house list, or the agent's own
 * (DP-6), NFC-normalised, checked by isFreeTag and screened for a fair-housing
 * hard term (a client may read it in the email). Each once; at most 30.
 */
export function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new HttpError(400, 'bad_tags', 'Send the tags as a list.');
  const out: string[] = [];
  for (const given of raw) {
    if (typeof given !== 'string') throw new HttpError(400, 'bad_tags', 'A tag is text.');
    if (isTag(given)) {
      if (!out.includes(given)) out.push(given);
      continue;
    }
    const t = normalizeFreeTag(given);
    if (!isFreeTag(t)) {
      throw new HttpError(400, 'bad_tags', `A tag of your own is one line of up to ${MAX_FREE_TAG} letters, numbers, spaces and . , ' - & / ( ) + %, and not one on the list.`);
    }
    const hard = freeTagHardTerm(t);
    if (hard) throw new HttpError(400, 'fair_housing', `“${hard.term}” can’t be a tag: it reads as a preference on ${hard.basis}.`);
    if (!out.includes(t)) out.push(t);
  }
  if (out.length > MAX_TAGS) throw new HttpError(400, 'too_many_tags', `A comp can have up to ${MAX_TAGS} tags.`);
  return out;
}

/** The agent's edits to a comp, validated: undefined where not given. */
function compEdits(body: Record<string, unknown>, by = '', now = new Date()) {
  const out: { note?: string | null; tags?: string[]; features?: Record<string, string[]>; overrides?: OverrideEdits; clientLine?: ClientLine | null } = {};
  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== 'string') throw new HttpError(400, 'bad_note', 'The note is text.');
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > MAX_NOTE) throw new HttpError(400, 'bad_note', `Keep the note under ${MAX_NOTE} characters.`);
    out.note = note || null;
  }
  if (body.tags !== undefined) out.tags = cleanTags(body.tags);
  if (body.features !== undefined) {
    if (!body.features || typeof body.features !== 'object' || Array.isArray(body.features)) throw new HttpError(400, 'bad_features', 'Send the features as an object.');
    out.features = cleanFeatures(body.features) as Record<string, string[]>;
  }
  if (body.factOverrides !== undefined) out.overrides = overrideEdits(body.factOverrides, by, now);
  if (body.clientLine !== undefined) out.clientLine = clientLineEdit(body.clientLine, now);
  return out;
}

/** A comp's paragraph for the client (Dispatch 26): its text and who wrote it, stamped now; null or empty text clears it. */
function clientLineEdit(raw: unknown, now: Date): ClientLine | null {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'bad_client_line', 'Send the paragraph as {text, by}, or null.');
  const { text, by } = raw as Record<string, unknown>;
  if (typeof text !== 'string') throw new HttpError(400, 'bad_client_line', 'The paragraph is text.');
  const t = text.trim();
  if (t.length > MAX_CLIENT_LINE) throw new HttpError(400, 'bad_client_line', `Keep the paragraph under ${MAX_CLIENT_LINE.toLocaleString('en-US')} characters.`);
  if (by !== 'agent' && by !== 'writer' && by !== 'both') throw new HttpError(400, 'bad_client_line', 'Who wrote it: agent, writer or both.');
  return t ? { text: t, by, at: now.toISOString() } : null;
}

async function saveEdits(tx: Queryable, reportId: string, reportCompId: string, edits: ReturnType<typeof compEdits>) {
  const sets: string[] = [];
  const values: unknown[] = [reportId, reportCompId];
  if (edits.note !== undefined) { values.push(edits.note); sets.push(`note = $${values.length}`); }
  if (edits.tags !== undefined) { values.push(edits.tags); sets.push(`tags = $${values.length}::text[]`); }
  if (edits.features !== undefined) { values.push(JSON.stringify(edits.features)); sets.push(`features = $${values.length}::jsonb`); }
  if (edits.clientLine !== undefined) { values.push(edits.clientLine ? JSON.stringify(edits.clientLine) : null); sets.push(`client_line = $${values.length}::jsonb`); }
  if (edits.overrides) {
    values.push(JSON.stringify(edits.overrides.set), edits.overrides.clear);
    sets.push(`fact_overrides = (fact_overrides || $${values.length - 1}::jsonb) - $${values.length}::text[]`);
  }
  if (sets.length) await tx.query(`update comp_report.report_comps set ${sets.join(', ')} where report_id = $1 and id = $2`, values);
}

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

/** The tier and note of the comp a typed-in comp would replace (the same address in this report), if there is one. */
async function noteAndTier(tx: Queryable, reportId: string, manual: unknown): Promise<{ tier: string | null; note: string | null } | null> {
  if (!manual || typeof manual !== 'object' || Array.isArray(manual)) return null;
  let key: string | null = null;
  try {
    key = compRecordFromManual(manual as ManualCompFields, { as_of: newYorkToday() }).record.identity.key;
  } catch {
    return null; // addManualComp says what's wrong with it
  }
  if (!key) return null;
  return (await tx.query<{ tier: string | null; note: string | null }>(
    `select rc.tier, rc.note from comp_report.report_comps rc join comp_report.properties p on p.id = rc.property_id
      where rc.report_id = $1 and p.property_key = $2`,
    [reportId, key],
  )).rows[0] ?? null;
}

/** A comp typed in: read by the engine, recorded once as a property, kept as the agent's observation, and joined to the report. */
async function addManualComp(tx: Queryable, reportId: string, manual: unknown, asOf: string): Promise<string> {
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
  // Typed in again after it was taken out: it's back.
  return (await tx.query<{ id: string }>(
    `insert into comp_report.report_comps (report_id, property_id, observation_id, evidence_class)
     values ($1, $2, $3, $4)
     on conflict (report_id, property_id)
     do update set observation_id = excluded.observation_id, evidence_class = excluded.evidence_class, removed_at = null, removed_by = null
     returning id`,
    [reportId, property.id, observation.id, record.status.listing_status],
  )).rows[0]!.id;
}

/**
 * The sample's photos, once they've been read (sample/photos.ts), on the sample comps that came
 * from the export without them. Observations never change (§12), so each gets a fresh one of the
 * same export row that carries them, and the comp points to it.
 */
async function attachSamplePhotos(tx: Queryable, reportId: string, photos: Record<string, string[]>) {
  if (!Object.keys(photos).length) return;
  const rows = (await tx.query<{ id: string; property_key: string; property_id: string; import_id: string; as_of: string; facts: unknown; links: string[] | null; raw: { photos?: unknown } | null }>(
    `select rc.id, p.property_key, o.property_id, o.import_id, o.as_of::text as as_of, o.facts, o.links, o.raw
       from comp_report.report_comps rc
       join comp_report.properties p on p.id = rc.property_id
       join comp_report.property_observations o on o.id = rc.observation_id
       join comp_report.imports i on i.id = o.import_id
      where rc.report_id = $1 and o.source = 'se_export' and i.sample`,
    [reportId],
  )).rows;
  for (const r of rows) {
    const urls = photos[r.property_key];
    if (!urls || (Array.isArray(r.raw?.photos) && r.raw.photos.length)) continue;
    const observation = (await tx.query<{ id: string }>(
      `insert into comp_report.property_observations (property_id, report_id, import_id, source, as_of, facts, links, raw)
       values ($1, $2, $3, 'se_export', $4, $5::jsonb, $6, $7::jsonb) returning id`,
      [r.property_id, reportId, r.import_id, r.as_of, JSON.stringify(r.facts), r.links ?? [], JSON.stringify({ photos: urls })],
    )).rows[0]!;
    await tx.query('update comp_report.report_comps set observation_id = $1 where id = $2 and report_id = $3', [observation.id, r.id, reportId]);
  }
}

const PLACEHOLDER_NOTE = 'Sample sort: a placeholder so the walkthrough can move on.';

/**
 * A sample sort of the comps the sample doesn't know: a 2nd tier where there's none, a note and a tag
 * where they're missing, reviewed, and a link read confirmed. What the agent already gave stays.
 */
async function placeholderSort(tx: Queryable, reportId: string, skip: Set<string>) {
  const rest = (await tx.query<{ id: string; tier: string | null; note: string | null; tags: string[] | null }>(
    'select id, tier, note, tags from comp_report.report_comps where report_id = $1 and removed_at is null',
    [reportId],
  )).rows.filter((c) => !skip.has(c.id));
  for (const c of rest) {
    if (!c.tier) await recordReason(tx, reportId, c.id, 'secondary', PLACEHOLDER_NOTE, 'method', true);
    const edits: { note?: string; tags?: string[] } = {};
    if (!c.note?.trim()) edits.note = PLACEHOLDER_NOTE;
    if (!c.tags?.length) edits.tags = ['Same area'];
    if (edits.note !== undefined || edits.tags) await saveEdits(tx, reportId, c.id, edits);
    await setReviewed(tx, reportId, c.id, true);
    await tx.query(
      `update comp_report.link_reads lr
          set confirmed_at = now(), confirmed_by = comp_report.actor()
         from comp_report.report_comps rc
        where rc.id = $2 and rc.report_id = $1
          and lr.report_id = rc.report_id and lr.observation_id = rc.observation_id
          and lr.status = 'done' and lr.confirmed_at is null`,
      [reportId, c.id],
    );
  }
}

export function handleComps(req: Request, deps: SamplePhotoDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST', 'PATCH');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);
    const body = await readJsonObject(req);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');

    if (req.method === 'POST' && body.sample === true) {
      if (!mayUseSample(user)) throw new HttpError(403, 'admins_only', 'Sample data is for admins and guests.');
      const photos = await samplePhotos(deps.samplePhotos);
      return json(await withActor(pool, asUser(user), async (tx) => {
        await reportFor(tx, user, reportId, true);
        await attachSamplePhotos(tx, reportId, photos);
        const comps = (await tx.query<{ id: string; property_key: string; tier: string | null }>(
          `select rc.id, p.property_key, rc.tier from comp_report.report_comps rc
             join comp_report.properties p on p.id = rc.property_id where rc.report_id = $1`,
          [reportId],
        )).rows;
        // A co-op report's sort carries no size tags (Dispatch 23): its comps have no sizes.
        const kind = (await tx.query<{ property_type: 'condo' | 'coop' }>(
          'select property_type from comp_report.reports where id = $1', [reportId],
        )).rows[0]!.property_type;
        const matched = new Set<string>();
        for (const sample of sampleTiers(kind)) {
          const comp = comps.find((c) => c.property_key === sample.propertyKey);
          if (!comp) continue;
          matched.add(comp.id);
          if (comp.tier !== sample.tier) await recordReason(tx, reportId, comp.id, sample.tier, sample.reason, sample.reasonType, true);
          await saveEdits(tx, reportId, comp.id, { note: sample.reason, tags: sample.tags, ...(sample.features ? { features: sample.features } : {}) });
          await setReviewed(tx, reportId, comp.id, true);
          if (sample.anchor) await setAnchor(tx, reportId, comp.id, true);
          // Its paragraph for the client (Dispatch 26 item 7), where it has none: the Designed email reads end to end.
          const line = SAMPLE_CLIENT_LINES[sample.propertyKey];
          if (line) {
            await tx.query(
              `update comp_report.report_comps set client_line = $3::jsonb where report_id = $1 and id = $2 and client_line is null`,
              [reportId, comp.id, JSON.stringify({ text: line, by: 'agent', at: new Date().toISOString() })],
            );
          }
          // Hubert's review of it (Dispatch 25 item 7): feedback on the sample's note, then his take. Once per comp.
          const review = SAMPLE_REVIEWS[sample.propertyKey];
          if (review) {
            const at = new Date().toISOString();
            const weak = review.weak ? { reason: review.weak } : null;
            await appendReview(tx, reportId, comp.id, [
              { at, kind: 'feedback', text: review.feedback, weak, by: user.email, note: sample.reason, tags: sample.tags, sample: true },
              { at, kind: 'take', text: review.take, weak, by: user.email, tier: review.tier, tierWhy: review.tierWhy, sample: true },
            ], { ifEmpty: true });
          }
        }
        if (!comps.length) throw new HttpError(409, 'no_sample_comps', 'Import the sample export first (step 2): the sample sorts its comps.');
        // Every other comp in the report (a pasted link, one typed in) gets a placeholder sort, marked
        // sample, so a walkthrough can always move on to Findings.
        await placeholderSort(tx, reportId, matched);
        await tx.query('update comp_report.reports set sample_data = true where id = $1 and not sample_data', [reportId]);
        return loadWorkspace(tx, user, reportId);
      }));
    }

    if (req.method === 'POST' && body.manual !== undefined) {
      const edits = compEdits(body, user.email, new Date());
      return json(await withActor(pool, asUser(user), async (tx) => {
        await reportFor(tx, user, reportId, true);
        const before = await noteAndTier(tx, reportId, body.manual);
        const id = await addManualComp(tx, reportId, body.manual, newYorkToday());
        await saveEdits(tx, reportId, id, edits);
        // Typed in again with a changed note, on a comp already tiered: the reason history keeps it, as a PATCH does.
        if (before?.tier && edits.note !== undefined && (edits.note ?? null) !== (before.note ?? null)) {
          await recordReason(tx, reportId, id, before.tier, (edits.note ?? '').slice(0, MAX_REASON) || NO_NOTE_YET, 'property', false);
        }
        return loadWorkspace(tx, user, reportId);
      }), 201);
    }

    // The tags the data settles, set on several comps at once (NB-9 C, Dispatch 20): a full agent's are pre-filled,
    // and a tag a fact contradicts comes off. Tags only: each is checked as a single comp's would be.
    if (req.method === 'PATCH' && body.tagEdits !== undefined) {
      if (!Array.isArray(body.tagEdits) || !body.tagEdits.length || body.tagEdits.length > MAX_TAG_EDITS) {
        throw new HttpError(400, 'bad_tags', `Send up to ${MAX_TAG_EDITS} comps' tags at once.`);
      }
      const edits = body.tagEdits.map((e: unknown) => {
        const one = e && typeof e === 'object' && !Array.isArray(e) ? (e as Record<string, unknown>) : {};
        const id = typeof one.reportCompId === 'string' && UUID.test(one.reportCompId) ? one.reportCompId : null;
        if (!id) throw new HttpError(400, 'bad_comp', 'Which comp?');
        return { id, tags: cleanTags(one.tags) };
      });
      return json(await withActor(pool, asUser(user), async (tx) => {
        await reportFor(tx, user, reportId, true);
        for (const e of edits) {
          // A removed comp keeps its tags as they were.
          await tx.query(
            'update comp_report.report_comps set tags = $3::text[] where report_id = $1 and id = $2 and removed_at is null',
            [reportId, e.id, e.tags],
          );
        }
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
        if (tier !== 'primary') await setAnchor(tx, reportId, reportCompId, false); // the ★ comp is 1st tier
        return loadWorkspace(tx, user, reportId);
      }));
    }

    const reviewed = body.reviewed;
    const anchor = body.anchor;
    const confirmed = body.confirmed;
    const removed = body.removed;
    if (reviewed !== undefined && typeof reviewed !== 'boolean') throw new HttpError(400, 'bad_reviewed', 'reviewed is true or false.');
    if (anchor !== undefined && typeof anchor !== 'boolean') throw new HttpError(400, 'bad_anchor', 'anchor is true or false.');
    if (confirmed !== undefined && confirmed !== true) throw new HttpError(400, 'bad_confirmed', 'A confirmation can only be given.');
    if (removed !== undefined && typeof removed !== 'boolean') throw new HttpError(400, 'bad_removed', 'removed is true or false.');
    if (body.tier !== undefined && (typeof body.tier !== 'string' || !TIERS.includes(body.tier))) throw new HttpError(400, 'bad_tier', 'The tier is primary, secondary or excluded.');
    if (anchor === true && body.tier !== undefined && body.tier !== 'primary') throw new HttpError(400, 'bad_anchor', 'The ★ comp is 1st tier.');
    if (anchor === true && removed === true) throw new HttpError(400, 'bad_anchor', 'A removed comp can’t be the ★.');
    let tier = body.tier as string | undefined;
    const edits = compEdits(body, user.email, new Date());
    if (reviewed === undefined && anchor === undefined && confirmed === undefined && removed === undefined && tier === undefined
      && edits.note === undefined && edits.tags === undefined && edits.features === undefined && edits.overrides === undefined
      && edits.clientLine === undefined) {
      throw new HttpError(400, 'nothing_to_save', 'Nothing to save.');
    }
    return json(await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      const current = (await tx.query<{ tier: string | null; note: string | null; removed_at: Date | null }>(
        'select tier, note, removed_at from comp_report.report_comps where report_id = $1 and id = $2', [reportId, reportCompId],
      )).rows[0];
      if (!current) throw new HttpError(404, 'not_found', 'No such comp in this report.');
      // Starring a comp makes it 1st tier (NB-6): a tier change, so it appends a reason like any other.
      if (anchor === true) tier = 'primary';
      if (removed === true) {
        await tx.query(
          `update comp_report.report_comps set removed_at = now(), removed_by = comp_report.actor(), is_anchor = false
            where report_id = $1 and id = $2 and removed_at is null`,
          [reportId, reportCompId],
        );
      } else if (removed === false) {
        await tx.query('update comp_report.report_comps set removed_at = null, removed_by = null where report_id = $1 and id = $2', [reportId, reportCompId]);
      } else if (current.removed_at) {
        throw new HttpError(409, 'removed', 'That comp was taken out of the report. Add it back first.');
      }
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
      await saveEdits(tx, reportId, reportCompId, edits);
      // A tier, or a changed note on a tiered comp, appends a reason (§12): the history keeps every version.
      const note = edits.note !== undefined ? edits.note : current.note;
      const nextTier = tier ?? current.tier;
      const noteChanged = edits.note !== undefined && (edits.note ?? null) !== (current.note ?? null);
      if (nextTier && (nextTier !== current.tier || noteChanged)) {
        await recordReason(tx, reportId, reportCompId, nextTier, (note ?? '').slice(0, MAX_REASON) || NO_NOTE_YET, 'property', false);
      }
      if (reviewed !== undefined) await setReviewed(tx, reportId, reportCompId, reviewed);
      if (anchor !== undefined) await setAnchor(tx, reportId, reportCompId, anchor);
      // 2nd or ✕ takes the star off: the ★ comp is 1st tier.
      else if (tier !== undefined && tier !== 'primary') await setAnchor(tx, reportId, reportCompId, false);
      return loadWorkspace(tx, user, reportId);
    }));
  });
}
