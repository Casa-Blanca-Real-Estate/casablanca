// A fully populated report for the inspection API's tests (Dispatch 23 items
// 3–4): a unique sentinel in every text column and every jsonb path a client's
// words or figures can reach, and unique numbers at the numeric text paths.
// The redaction tests assert none of them leaves by default; the text=1 test
// asserts the text ones do, and the never ones still don't.
import { createHash } from 'node:crypto';
import { identify } from '../engine/index.ts';
import { withActor, type Actor, type PoolLike } from '../server/db.ts';

export const OWNER: Actor & { kind: 'user' } = { kind: 'user', email: 'zq.owner@casa-blanca.com', role: 'agent' };

/** Every sentinel string starts with this, so one search finds any of them. */
export const MARK = 'QXSENT';
let n = 0;
const kinds = ['Zebulon Quarrington', '917-555-0142', 'zq.client@example.org', '42 Wallaby Way'];
/** A unique sentinel: a client name, a phone number, an email or an address, in turn. */
export const s = (where: string) => `${MARK}-${where}-${++n} ${kinds[n % kinds.length]}`;
/** The never fields' sentinels: these must not leave even with text=1. */
export const NEVER = `${MARK}NEVER`;

/** Unique numbers at numeric text paths: none may appear by default. */
export const NUM = {
  askingPrice: 987650011, dealPrice: 987650012, target: 987650013, rate: 9.87650014, callLow: 987650015,
  callHigh: 987650016, revealLow: 987650017, revealBase: 987650018, revealHigh: 987650019, preApproval: 987650020,
  lat: 40.98765021, lng: -73.98765022, coordLat: 40.98765023, coordLng: -73.98765024, areaSqft: 98765025,
  outdoorSqft: 98765026,
} as const;

/** Comp facts that pass: they must appear. */
export const PASSES = { salePrice: 1234567, areaSqft: 1111, statusDate: '2026-06-15', listPrice: 1250001 } as const;

const entry = <T>(value: T) => ({ value, asOf: '2026-10-01' });
const sourced = <T>(value: T, source = 'se_export') => ({ value, source, as_of: '2026-10-01', confidence: 'exact' });

export interface Fixture {
  reportId: string;
  compIds: string[];
  importId: string;
  contentSha256: string;
  owner: string;
}

/** Builds it as the owner (and the system, for the log rows), through the database alone. */
export async function buildFixture(pool: PoolLike, owner = OWNER): Promise<Fixture> {
  const homeStreet = '42 Wallaby Way';
  const home = identify({ address: `${homeStreet}, New York, NY 10013`, unit: '9C' });

  await withActor(pool, { kind: 'system', does: 'sign-in' }, (tx) =>
    tx.query('insert into comp_report.users (email, role, name) values ($1, $2, $3) on conflict do nothing', [owner.email, owner.role, s('user-name')]));

  const state = {
    intake: {
      address: entry(`${homeStreet}, New York, NY 10013`), unit: entry('9C'), neighborhood: entry(s('neighborhood')),
      areaSqft: entry(NUM.areaSqft), askingPrice: entry(NUM.askingPrice), notes: entry(s('intake-notes')),
      views: entry([s('views')]), exposure: entry(s('exposure')), building: entry([s('building')]),
      outdoorSqft: entry(NUM.outdoorSqft), kind: entry('condo'),
    },
    dealTerms: {
      template: 'buyer_traditional', price: entry(NUM.dealPrice), ratePercent: entry(NUM.rate),
      preApprovalAmount: entry(NUM.preApproval), timing: entry(s('timing')), flexibility: entry(s('flexibility')),
      financing: entry('mortgage'), preApproved: entry(true),
    },
    send: {
      result: 'range', headline: entry(s('headline')), chosen: entry(s('chosen')), consider: entry(s('consider')),
      nextStep: entry(s('next-step')), clientName: entry(s('send-client-name')), signOff: entry(s('sign-off')),
      subject: entry(s('subject')), drafts: { full: { body: s('draft-body'), basedOn: 'abc', at: '2026-10-02T00:00:00Z' } },
      seen: { format: 'full', length: 'full', subject: s('seen-subject'), headline: s('seen-headline'), text: s('seen-text'), at: '2026-10-02T00:00:00Z' },
      sentAt: '2026-10-03T00:00:00Z',
    },
    reached: 'send',
    stepsAt: { sort: '2026-10-01T10:00:00Z', findings: '2026-10-01T11:00:00Z' },
    outcomes: { sold: entry(987650030) },
    hubertSeen: true,
    clientRounds: { overview: [{ at: '2026-10-02T00:00:00Z', text: s('client-round') }] },
    reveal: { at: '2026-10-01T12:00:00Z', low: NUM.revealLow, base: NUM.revealBase, high: NUM.revealHigh, engineVersion: 'e1' },
  };
  const brief = {
    audience: entry('buyer'), clientName: entry(s('client-name')), clientNote: entry(s('client-note')),
    client: { urgency: { text: entry(s('urgency')), by: entry('2026-12-01') }, paysMoreFor: entry(s('pays-more')), priorities: ['price'] },
  };
  const call = { low: NUM.callLow, high: NUM.callHigh, note: s('call-note'), at: '2026-10-01T12:00:00Z' };
  const target = { price: entry(NUM.target), note: entry(s('target-note')), owner: 'client' };

  const content = Buffer.from(`address,price\n${s('import-content')},1\n${NEVER}-import\n`, 'utf8');
  const contentSha256 = createHash('sha256').update(content).digest('hex');

  const built = await withActor(pool, owner, async (tx) => {
    const reportId = (await tx.query<{ id: string }>(
      `insert into comp_report.reports (owner_email, title, brief, agent_call, target, state)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [owner.email, s('title').slice(0, 190), brief, call, target, { ...state, tagsOffered: {} }],
    )).rows[0]!.id;
    const importId = (await tx.query<{ id: string }>(
      `insert into comp_report.imports (report_id, filename, format, content, content_sha256, as_of, parser_version, export_schema, comp_count, warnings)
       values ($1, $2, 'csv', $3, $4, '2026-10-01', '0.5.0', 'se-2026', 3, $5) returning id`,
      [reportId, s('filename').slice(0, 200), content, contentSha256, JSON.stringify([{ code: 'odd_row', message: s('warning') }])],
    )).rows[0]!.id;

    const facts = {
      sale_price: sourced(PASSES.salePrice), list_price: sourced(PASSES.listPrice), area_sqft: sourced(PASSES.areaSqft),
      status_date: sourced(PASSES.statusDate), beds: sourced(2), baths: sourced(2), floor: sourced(9),
      sale_kind_label: sourced(s('sale-kind-label')), views: sourced([s('fact-views')]),
      coordinates: sourced({ lat: NUM.coordLat, lng: NUM.coordLng }, 'geocoder'), finishes: sourced([s('finishes')]),
    };
    const compIds: string[] = [];
    const comps = [
      { key: `pk1|ny|new york|${s('comp-street-a').toLowerCase()}|1a`, source: 'se_export', raw: { photos: [`https://photos.zillowstatic.com/${MARK}-a.jpg`] } },
      { key: `pk1|ny|new york|${s('comp-street-b').toLowerCase()}|2b`, source: 'agent', raw: { address: s('typed-address'), price: 987650031, notes: s('typed-notes') } },
      { key: `pk1|ny|new york|${s('comp-street-c').toLowerCase()}|3c`, source: 'listing', raw: { url: 'https://streeteasy.com/x', description: s('listing-description'), photos: [] } },
    ];
    for (const [i, c] of comps.entries()) {
      const propertyId = (await tx.query<{ id: string }>(
        `insert into comp_report.properties (property_key, address, unit, streeteasy_id) values ($1, $2, $3, $4) returning id`,
        [c.key, s(`address-${i}`), s(`unit-${i}`).slice(0, 40), s(`se-id-${i}`)],
      )).rows[0]!.id;
      const observationId = (await tx.query<{ id: string }>(
        `insert into comp_report.property_observations (property_id, report_id, import_id, source, as_of, facts, links, raw, parser_version)
         values ($1, $2, $3, $4, '2026-10-01', $5, $6, $7, '0.5.0') returning id`,
        [propertyId, reportId, c.source === 'se_export' ? importId : null, c.source, JSON.stringify(facts),
          [`https://streeteasy.com/sale/${MARK}-${i}`], JSON.stringify(c.raw)],
      )).rows[0]!.id;
      const compId = (await tx.query<{ id: string }>(
        `insert into comp_report.report_comps (report_id, property_id, observation_id, evidence_class, note, tags, features, fact_overrides, client_line)
         values ($1, $2, $3, 'sold', $4, $5, $6, $7, $8) returning id`,
        [reportId, propertyId, observationId, s(`note-${i}`), [s(`tag-${i}`)], JSON.stringify({ building: [s(`feature-${i}`)] }),
          JSON.stringify({ price: { value: 1300000 + i, by: owner.email, at: '2026-10-02T00:00:00Z' } }),
          JSON.stringify({ text: s(`client-line-${i}`), at: '2026-10-02T00:00:00Z' })],
      )).rows[0]!.id;
      await tx.query(
        `insert into comp_report.reasons (report_comp_id, report_id, tier, reason, reason_type, actor) values ($1, $2, 'primary', $3, 'property', 'agent')`,
        [compId, reportId, s(`reason-${i}`)],
      );
      compIds.push(compId);
    }

    // Hubert's review rounds sit in state.reviews, keyed by comp.
    await tx.query(
      `update comp_report.reports set state = state || jsonb_build_object('reviews', $2::jsonb, 'tagsOffered', $3::jsonb) where id = $1`,
      [reportId, JSON.stringify({ [compIds[0]!]: [{ kind: 'feedback', text: s('review'), at: '2026-10-02T00:00:00Z' }] }),
        JSON.stringify({ [compIds[0]!]: [s('offered-tag')] })],
    );

    await tx.query(
      `insert into comp_report.link_reads (report_id, purpose, url, status, extract, error, error_message, as_of)
       values ($1, 'subject', $2, 'failed', $3, 'unreadable', $4, '2026-10-01')`,
      [reportId, `https://streeteasy.com/building/${MARK}-subject`, JSON.stringify({ description: `${NEVER}-extract`, price: 987650032 }), s('error-message')],
    );

    const messages = [
      { role: 'user', content: [{ type: 'text', text: s('user-message') }] },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: s('thinking'), signature: `${NEVER}-signature` },
          { type: 'text', text: s('assistant-text') },
          { type: 'tool_use', id: 'toolu_01', name: 'get_report', input: { query: s('tool-input') } },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: [{ type: 'text', text: s('tool-result') }] }] },
    ];
    for (const [i, m] of messages.entries()) {
      await tx.query(
        `insert into comp_report.messages (report_id, seq, role, content, model, stop_reason, request_id, prompt_version)
         values ($1, $2, $3, $4, $5, $6, 'req_011', 'hb-1')`,
        [reportId, i + 1, m.role, JSON.stringify(m.content), m.role === 'assistant' ? 'claude-opus-4-8' : null, m.role === 'assistant' ? 'end_turn' : null],
      );
    }
    await tx.query(
      `insert into comp_report.usage (user_email, report_id, provider, model, purpose, request_id, input_tokens, output_tokens, estimated_cost_usd, detail)
       values ($1, $2, 'anthropic', 'claude-opus-4-8', 'assistant', 'req_011', 100, 50, 0.25, $3)`,
      [owner.email, reportId, JSON.stringify({ note: s('usage-detail') })],
    );
    return { reportId, importId, compIds };
  });

  // The home's building, geocoded: a coordinate here is the client's address.
  await withActor(pool, owner, (tx) => tx.query(
      `insert into comp_report.geocodes (building_key, street, borough, status, geocoder, lat, lng, matched, bin, reason, attempts, looked_up_at)
       values ($1, $2, 'Manhattan', 'matched', 'nyc_geosearch', $3, $4, $5, $6, $7, 1, now())`,
      [home.building_key, s('geocode-street').slice(0, 190), NUM.lat, NUM.lng, s('geocode-matched'), '1098765', s('geocode-reason')],
  ));
  await withActor(pool, { kind: 'system', does: 'access-log' }, async (tx) => {
    await tx.query(
      `insert into comp_report.access_events (kind, source, email, by_email, report_id, owner_email) values ('viewed_other', 'server', null, $1, $2, $1)`,
      [owner.email, built.reportId],
    );
    await tx.query(`insert into comp_report.access_events (kind, source, email, provider) values ('session_start', 'server', $1, 'google')`, [owner.email]);
  });
  await withActor(pool, { kind: 'system', does: 'activity-log' }, (tx) => tx.query(
    `insert into comp_report.activity (user_email, report_id, kind, name, detail) values ($1, $2, 'action', 'comp.tiered', '{"tier": "primary", "by": "agent"}')`,
    [owner.email, built.reportId],
  ));
  return { ...built, contentSha256, owner: owner.email };
}

/** The sentinels and the unique numbers, as they'd show in a JSON body. */
export function leaks(body: string, extra: string[] = []): string[] {
  const found: string[] = [];
  if (body.includes(MARK)) found.push(body.slice(body.indexOf(MARK) - 40, body.indexOf(MARK) + 60));
  for (const [k, v] of Object.entries(NUM)) if (body.includes(String(v))) found.push(`number ${k}`);
  for (const e of [OWNER.email, 'zq.client@example.org', ...extra]) if (body.includes(e)) found.push(e);
  return found;
}
