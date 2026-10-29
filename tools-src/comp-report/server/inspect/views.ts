// The inspection API's views (Dispatch 23 item 3, NW-090 a): what each named
// view returns, field by field. Redaction is an allowlist: every field a view
// returns is listed here with its kind, and anything not listed is dropped.
//
//   pass    ids, numbers, booleans, dates and timestamps; a string that isn't
//           one of those comes out [redacted]
//   enum    a server-set label from a closed list the code defines; a value
//           outside it comes out [redacted]
//   match   a server-set token checked against a closed pattern (a model id,
//           a parser version); anything else comes out [redacted]
//   text    any other value: [redacted] unless ?text=1. A text subtree keeps
//           its shape (keys that look like code, array lengths), never a value
//   email   a person's address: an 8-character hash, with or without text=1.
//           A value starting system: passes as is
//   never   not returned, with or without text=1
//
// The kind is set per path, not per JSON type: a number at a path listed as
// text is text. Every column of every comp_report table is classified in
// COLUMNS (db/inspect.test.ts fails on one that isn't), and a column or key
// that names an address (email, *_email, *_by, by) must be `email` or `never`.
//
// No view reads narratives, users, the allowlist, the decision tables or the
// sign-in buckets; the inspect actor has no policy on them either.
import { createHmac } from 'node:crypto';
import { CONFIDENCES, EVIDENCE_CLASSES, SOURCES } from '../../engine/index.ts';
import { GEOCODER } from '../geocode.ts';
import type { Queryable } from '../db.ts';
import { INSPECT_READER, loadWorkspace, reportFor } from '../api/workspace.ts';
import { ACTION_NAMES } from '../logs.ts';

export type Spec =
  | 'pass'
  | 'text'
  | 'email'
  | 'never'
  | { enum: readonly string[] }
  | { match: RegExp }
  | { obj: Record<string, Spec> }
  | { arr: Spec }
  | { map: Spec; keys: RegExp };

export const REDACTED = '[redacted]';

/** A column or jsonb key that holds a person's address. */
export const EMAIL_KEY = /^(email|by)$|_email$|_by$|[a-z]Email$|[a-z]By$/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;
const NUMBER_RE = /^-?\d{1,15}(\.\d{1,12})?$/;
/** Keys a text subtree keeps: code-shaped names and ids. Anything else is dropped. */
const CODE_KEY = /^[a-z][a-zA-Z0-9_]{0,40}$/;

// ── The closed lists ───────────────────────────────────────────────────────

const TIERS = ['primary', 'secondary', 'excluded'] as const;
const GUIDE_STEPS = ['home', 'details', 'comps', 'sort', 'review', 'gate', 'findings', 'send', 'done'] as const;
const STAGES = ['sort', 'findings', 'send', 'sent'] as const;
export const VIEWS = ['reports', 'workspace', 'comps', 'messages', 'usage', 'access', 'activity', 'health'] as const;
export type ViewName = (typeof VIEWS)[number];
/** The views that read one report, and the only ones that take text=1. */
export const REPORT_VIEWS: readonly ViewName[] = ['workspace', 'comps', 'messages'];

const PURPOSE = /^(assistant|writer|lines|comp_review|client_words|decide:[a-z_-]{1,30})$/;
const MODEL = /^(claude-(opus|sonnet|haiku|fable)-[0-9][0-9a-z.-]{0,30}|jev[a-z0-9.:-]{0,30}|jevons-model)$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,47}$/;
const TOKEN = /^[A-Za-z0-9_-]{1,100}$/;
const CODE = /^[a-z_]{1,40}$/;
const ACTIVITY_NAME = new RegExp(`^(screen\\.[a-z0-9-]{1,40}|error\\.[a-z0-9_]{1,40}|${ACTION_NAMES.map((n) => n.replace('.', '\\.')).join('|')})$`);
const ACCESS_KINDS = ['gate', 'session_start', 'refused', 'viewed_other', 'viewed_list', 'signin_error', 'capability_change',
  'inspect', 'inspect_text', 'inspect_copy'] as const;

// ── Comp facts ─────────────────────────────────────────────────────────────

/** A comp's facts that are numbers or dates: pass. Every other fact is text. */
export const NUMERIC_FACTS = [
  'area_sqft', 'beds', 'baths', 'rooms', 'floor', 'sale_price', 'list_price', 'original_list_price', 'status_date',
  'list_date', 'contract_date', 'days_on_market', 'common_charges_monthly', 'taxes_monthly', 'maintenance_monthly',
  'building_units', 'building_stories', 'year_built',
] as const;
const TEXT_FACTS = [
  'property_type', 'new_development', 'sponsor_unit', 'income_restricted', 'sale_kind', 'sale_kind_label', 'coordinates',
  'outdoor_private', 'outdoor_kinds', 'outdoor_area_sqft', 'outdoor_shared', 'views', 'parking', 'service', 'unit_type',
  'central_air', 'dishwasher', 'fireplace', 'laundry', 'finishes', 'amenities', 'policies', 'pets', 'smoke_free',
] as const;

const sourced = (value: Spec): Spec => ({
  obj: { value, source: { enum: SOURCES }, as_of: 'pass', confidence: { enum: CONFIDENCES }, note: 'text' },
});

export const FACTS: Spec = {
  obj: Object.fromEntries([
    ...NUMERIC_FACTS.map((k) => [k, sourced('pass')] as const),
    ...TEXT_FACTS.map((k) => [k, 'text'] as const),
  ]),
};

const FACT_OVERRIDE: Spec = { obj: { value: 'pass', by: 'email', at: 'pass' } };
const FACT_OVERRIDES: Spec = { obj: { price: FACT_OVERRIDE, size: FACT_OVERRIDE, date: FACT_OVERRIDE, floor: FACT_OVERRIDE } };

// ── reports.state ──────────────────────────────────────────────────────────

const DEAL_TERMS: Spec = {
  obj: {
    template: { enum: ['buyer_traditional', 'seller_pricing'] },
    ...Object.fromEntries(['price', 'depositPercent', 'downPaymentPercent', 'ratePercent', 'termYears', 'targetClosing',
      'sellerTarget', 'timing', 'flexibility', 'financing', 'preApproved', 'preApprovalAmount'].map((k) => [k, 'text' as Spec])),
  },
};

export const STATE: Spec = {
  obj: {
    intake: 'text',
    dealTerms: DEAL_TERMS,
    send: 'text',
    subjectRead: 'pass',
    reached: { enum: ['sort', 'findings', 'send'] },
    stepsAt: { map: 'pass', keys: new RegExp(`^(${GUIDE_STEPS.join('|')})$`) },
    outcomes: 'text',
    hubertSeen: 'pass',
    tagsOffered: 'text',
    reviews: 'text',
    clientRounds: 'text',
    reveal: 'text',
  },
};

// ── messages.content ───────────────────────────────────────────────────────

const CONTENT: Spec = {
  arr: {
    obj: {
      type: { enum: ['text', 'thinking', 'redacted_thinking', 'tool_use', 'tool_result', 'server_tool_use',
        'web_search_tool_result', 'web_fetch_tool_result', 'image', 'document'] },
      text: 'text',
      thinking: 'text',
      signature: 'never',
      data: 'never',
      id: { match: TOKEN },
      name: { match: CODE },
      input: 'text',
      tool_use_id: { match: TOKEN },
      content: 'text',
      is_error: 'pass',
      citations: 'text',
      source: 'never',
      cache_control: 'never',
    },
  },
};

// ── Every column of every table ────────────────────────────────────────────

const stamps = { created_at: 'pass', created_by: 'email' } as const;
const updates = { updated_at: 'pass', updated_by: 'email' } as const;

/** Tables no view reads: every column never. The test still wants them listed. */
const unread = (...columns: string[]) => Object.fromEntries(columns.map((c) => [c, 'never' as Spec]));

export const COLUMNS: Record<string, Record<string, Spec>> = {
  reports: {
    id: 'pass', owner_email: 'email', title: 'text', property_type: { enum: ['condo', 'coop'] },
    mode: { enum: ['practice', 'full'] }, status: { enum: ['active', 'archived', 'deleted'] },
    brief: 'text', agent_call: 'text', target: 'text', state: STATE, sample_data: 'pass', ...stamps, ...updates,
  },
  report_comps: {
    id: 'pass', report_id: 'pass', property_id: 'pass', observation_id: 'pass', evidence_class: { enum: EVIDENCE_CLASSES },
    tier: { enum: TIERS }, is_anchor: 'pass', reviewed_at: 'pass', reviewed_by: 'email', note: 'text', tags: 'text',
    features: 'text', removed_at: 'pass', removed_by: 'email', fact_overrides: FACT_OVERRIDES, client_line: 'text',
    ...stamps, ...updates,
  },
  reasons: {
    id: 'pass', report_comp_id: 'pass', report_id: 'pass', tier: { enum: TIERS }, reason: 'text',
    reason_type: { enum: ['property', 'client', 'method'] }, actor: { enum: ['agent', 'assistant', 'jev', 'system'] },
    sample: 'pass', ...stamps,
  },
  messages: {
    id: 'pass', report_id: 'pass', seq: 'pass', role: { enum: ['user', 'assistant'] }, content: CONTENT,
    model: { match: MODEL }, stop_reason: { match: CODE }, request_id: { match: TOKEN }, in_context: 'pass',
    prompt_version: { match: VERSION }, ...stamps,
  },
  usage: {
    id: 'pass', user_email: 'email', report_id: 'pass', provider: { enum: ['anthropic', 'jev'] }, model: { match: MODEL },
    purpose: { match: PURPOSE }, request_id: { match: TOKEN }, input_tokens: 'pass', output_tokens: 'pass',
    cache_read_tokens: 'pass', cache_write_tokens: 'pass', estimated_cost_usd: 'pass', detail: 'text', ...stamps,
  },
  properties: {
    id: 'pass', property_key: 'text', address: 'text', unit: 'text', streeteasy_id: 'text', ...stamps,
  },
  property_observations: {
    id: 'pass', property_id: 'pass', report_id: 'pass', import_id: 'pass', source: { enum: [...SOURCES] },
    as_of: 'pass', facts: FACTS, links: 'text', raw: 'text', parser_version: { match: VERSION }, ...stamps,
  },
  imports: {
    id: 'pass', report_id: 'pass', filename: 'text', format: { enum: ['csv', 'xlsx'] }, content: 'never',
    content_sha256: { match: /^[0-9a-f]{64}$/ }, as_of: 'pass', parser_version: { match: VERSION },
    export_schema: { match: VERSION }, comp_count: 'pass', warnings: 'text', sample: 'pass', ...stamps,
  },
  link_reads: {
    id: 'pass', seq: 'pass', report_id: 'pass', purpose: { enum: ['comp', 'subject'] }, url: 'text',
    status: { enum: ['queued', 'running', 'done', 'failed'] }, attempts: 'pass', started_at: 'pass', finished_at: 'pass',
    as_of: 'pass', extract: 'never', parser_version: { match: VERSION }, warnings: 'text', error: { match: CODE },
    error_message: 'text', observation_id: 'pass', report_comp_id: 'pass', confirmed_at: 'pass', confirmed_by: 'email',
    dismissed_at: 'pass', ...stamps, ...updates,
  },
  // Coordinates are addresses: the home's own building is geocoded here.
  geocodes: {
    building_key: 'text', street: 'text', borough: 'text', status: { enum: ['pending', 'matched', 'refused', 'failed'] },
    geocoder: { enum: [GEOCODER] }, lat: 'text', lng: 'text', matched: 'text', bin: 'text', reason: 'text',
    attempts: 'pass', looked_up_at: 'pass', created_at: 'text', created_by: 'email', updated_at: 'text', updated_by: 'email',
  },
  access_events: {
    id: 'pass', at: 'pass', kind: { enum: ACCESS_KINDS }, source: { enum: ['server', 'gate', 'public'] },
    event: { enum: ['validate', 'signup', 'login', 'other'] }, provider: { enum: ['google', 'email', 'other'] },
    allowed: 'pass', via: { enum: ['admin', 'allowlist', 'domain'] },
    reason: { enum: ['not_authorised', 'disabled', 'unconfirmed', 'address_unverified', 'provider_not_allowed'] },
    error: { enum: ['access_denied', 'admin_policy_enforced', 'invalid_request', 'server_error', 'other'] },
    error_code: { enum: ['gate_webhook', 'signups_not_allowed', 'other'] }, capability: { enum: ['practice', 'full'] },
    email: 'email', domain: 'text', by_email: 'email', report_id: 'pass', owner_email: 'email',
    // A hash of the address, the kind and the window: never, or it could be matched to a guess.
    dedupe_key: 'never', created_by: 'email',
    view: { enum: [...VIEWS, 'copy-to-test'] }, text_flag: 'pass', target_report_id: 'pass',
  },
  activity: {
    id: 'pass', at: 'pass', user_email: 'email', report_id: 'pass', session_id: 'pass',
    kind: { enum: ['screen', 'action', 'error'] }, name: { match: ACTIVITY_NAME },
    detail: {
      obj: {
        format: { enum: ['csv', 'xlsx', 'sample'] }, comps: 'pass', via: { enum: ['manual', 'link'] }, by: 'email',
        tier: { enum: TIERS }, starred: 'pass', skipped: 'pass', length: { enum: ['full', 'short', 'text'] },
      },
    },
    created_by: 'email',
  },
  users: unread('email', 'name', 'identity_provider', 'identity_id', 'role', 'status', 'capability', 'unlocked_by',
    'unlocked_reason', 'unlocked_at', 'last_seen_at', 'is_test', 'created_at', 'created_by', 'updated_at', 'updated_by'),
  allowlist: unread('email', 'role', 'note', 'revoked_at', 'revoked_by', 'created_at', 'created_by', 'updated_at', 'updated_by'),
  mentees: unread('mentor_email', 'agent_email', 'removed_at', 'created_at', 'created_by', 'updated_at', 'updated_by'),
  narratives: unread('id', 'report_id', 'parent_id', 'origin', 'status', 'length', 'result_kind', 'audience',
    'engine_version', 'house_method', 'inputs_hash', 'headline_facts', 'input', 'content', 'model', 'prompt_version',
    'request_id', 'stop_reason', 'progress', 'attempts', 'started_at', 'finished_at', 'error', 'error_message', 'qa',
    'acknowledgments', 'copied', 'created_at', 'created_by', 'updated_at', 'updated_by'),
  decide_requests: unread('id', 'lane', 'target_kind', 'observation_id', 'question_ids', 'wire_questions',
    'registry_version', 'state', 'state_hash', 'user_email', 'status', 'drop_reason', 'claimed_by', 'attempts',
    'requeues', 'last_status', 'not_before', 'enqueued_at', 'finished_at', 'provider', 'model', 'unanswered', 'detail',
    'created_at', 'created_by', 'updated_at', 'updated_by', 'fixture_id', 'second_judge', 'batch', 'source_url'),
  decide_runtime: unread('id', 'lease_holder', 'lease_until', 'next_start_at', 'cool_until', 'kick_hash', 'kick_until',
    'updated_at', 'updated_by'),
  judgments: unread('id', 'request_id', 'target_kind', 'observation_id', 'report_comp_id', 'lane', 'question_id',
    'question_version', 'question_type', 'registry_version', 'provider', 'model', 'answer', 'probability',
    'order_stable', 'probabilities', 'vendor_confidence', 'band', 'landed', 'bar', 'state_hash', 'option_order_hash',
    'created_at', 'created_by', 'fixture_id'),
  decide_probes: unread('id', 'ok', 'outcome', 'status', 'ms', 'provider', 'model', 'zdr', 'registry_version',
    'fixture_id', 'wire_ids', 'unanswered', 'raw', 'answers', 'created_at', 'created_by'),
  signin_error_buckets: unread('hour', 'scope', 'ip_hash', 'n'),
  signin_salt: unread('day', 'salt'),
};

const row = (table: string, extra: Record<string, Spec> = {}): Spec => ({ obj: { ...COLUMNS[table], ...extra } });

// ── What the views return ──────────────────────────────────────────────────

const REPORT_ROW = row('reports', {
  stage: { enum: STAGES }, comps: 'pass', unsorted: 'pass', primary: 'pass', secondary: 'pass', excluded: 'pass',
  removed: 'pass', messages: 'pass', imports: 'pass', reads: 'pass',
});

/** loadWorkspace's shape (api/workspace.ts), camelCase, with each comp's facts read from its observation. */
export const WORKSPACE: Spec = {
  obj: {
    report: {
      obj: {
        id: 'pass', title: 'text', propertyType: { enum: ['condo', 'coop'] }, ownerEmail: 'email', sampleData: 'pass',
        updatedAt: 'pass',
      },
    },
    brief: 'text',
    call: 'text',
    target: 'text',
    state: STATE,
    imports: {
      arr: {
        obj: {
          id: 'pass', filename: 'text', format: { enum: ['csv', 'xlsx'] }, asOf: 'pass', parserVersion: { match: VERSION },
          exportSchema: { match: VERSION }, compCount: 'pass', warnings: 'text', sample: 'pass', createdAt: 'pass',
          createdBy: 'email', contentBase64: 'never',
        },
      },
    },
    comps: {
      arr: {
        obj: {
          reportCompId: 'pass', propertyKey: 'text', evidenceClass: { enum: EVIDENCE_CLASSES }, tier: { enum: TIERS },
          anchor: 'pass', reviewedAt: 'pass',
          reasons: {
            arr: {
              obj: {
                tier: { enum: TIERS }, reason: 'text', reasonType: { enum: ['property', 'client', 'method'] },
                actor: { enum: ['agent', 'assistant', 'jev', 'system'] }, at: 'pass', by: 'email', sample: 'pass',
              },
            },
          },
          source: {
            obj: {
              kind: { enum: ['export', 'listing', 'manual'] }, importId: 'pass', extract: 'text', fields: 'text',
              asOf: 'pass', url: 'text', readId: 'pass', confirmedAt: 'pass',
            },
          },
          note: 'text', tags: 'text', features: 'text', removedAt: 'pass', factOverrides: FACT_OVERRIDES,
          photos: 'text', review: 'text', clientLine: 'text',
          facts: FACTS,
        },
      },
    },
    reads: {
      arr: {
        obj: {
          id: 'pass', purpose: { enum: ['comp', 'subject'] }, url: 'text', status: { enum: ['queued', 'running', 'done', 'failed'] },
          error: { match: CODE }, errorMessage: 'text', reportCompId: 'pass', asOf: 'pass', extract: 'never',
          warnings: 'text', confirmedAt: 'pass', createdAt: 'pass', startedAt: 'pass', finishedAt: 'pass',
        },
      },
    },
    geocodes: {
      arr: {
        obj: {
          buildingKey: 'text', status: { enum: ['pending', 'matched', 'refused', 'failed'] }, lat: 'text', lng: 'text',
          matched: 'text', reason: 'text', geocoder: { enum: [GEOCODER] }, lookedUpAt: 'pass', retry: 'pass',
        },
      },
    },
    messageCount: 'pass',
  },
};

const COMP_ROW = row('report_comps', {
  property: row('properties'),
  observation: row('property_observations'),
  reasons: { arr: row('reasons') },
});

const USAGE_TOTAL: Spec = {
  obj: { user_email: 'email', day: 'pass', calls: 'pass', input_tokens: 'pass', output_tokens: 'pass', estimated_cost_usd: 'pass' },
};

export const VIEW_SPECS: Record<Exclude<ViewName, 'health'>, Spec> = {
  reports: { obj: { reports: { arr: REPORT_ROW } } },
  workspace: { obj: { workspace: WORKSPACE } },
  comps: { obj: { comps: { arr: COMP_ROW } } },
  messages: { obj: { messages: { arr: row('messages') } } },
  usage: { obj: { totals: { arr: USAGE_TOTAL }, rows: { arr: row('usage') } } },
  access: { obj: { rows: { arr: row('access_events') } } },
  activity: { obj: { rows: { arr: row('activity') } } },
};

// ── Applying a spec ────────────────────────────────────────────────────────

export interface RedactOptions {
  /** ?text=1: text fields as stored (never fields still dropped, addresses still hashed). */
  text: boolean;
  /** The address hash: HMAC-SHA256 under CR_INSPECT_KEY, first 8 hex characters. */
  hash: (email: string) => string;
  /** Paths the spec didn't list, collected for the classification test. */
  dropped?: string[];
}

export function emailHasher(key: string): (email: string) => string {
  return (email) => createHmac('sha256', key).update(email, 'utf8').digest('hex').slice(0, 8);
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v);

function passValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'string' && (UUID_RE.test(v) || DATE_RE.test(v) || NUMBER_RE.test(v))) return v;
  return REDACTED;
}

function emailValue(v: unknown, opts: RedactOptions): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return REDACTED;
  return v.startsWith('system:') ? v : opts.hash(v);
}

/** A text subtree, redacted: its shape stays, its values don't; addresses are hashed. */
function textShape(v: unknown, opts: RedactOptions): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => textShape(x, opts));
  if (isPlain(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (!CODE_KEY.test(k) && !UUID_RE.test(k)) continue;
      out[k] = EMAIL_KEY.test(k) && (typeof x === 'string' || x === null) ? emailValue(x, opts) : textShape(x, opts);
    }
    return out;
  }
  return REDACTED;
}

/** A text subtree, as stored (text=1): every value, with addresses still hashed. */
function textAsStored(v: unknown, opts: RedactOptions): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return REDACTED;
  if (Array.isArray(v)) return v.map((x) => textAsStored(x, opts));
  if (isPlain(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      out[k] = EMAIL_KEY.test(k) && (typeof x === 'string' || x === null) ? emailValue(x, opts) : textAsStored(x, opts);
    }
    return out;
  }
  return v;
}

/** The value as the spec allows it out. `undefined` means: leave the key out. */
export function redact(spec: Spec, v: unknown, opts: RedactOptions, path = '$'): unknown {
  if (spec === 'never') return undefined;
  if (spec === 'pass') return passValue(v);
  if (spec === 'email') return emailValue(v, opts);
  if (spec === 'text') return opts.text ? textAsStored(v, opts) : textShape(v, opts);
  if (v === null || v === undefined) return null;
  if ('enum' in spec) return typeof v === 'string' && spec.enum.includes(v) ? v : REDACTED;
  if ('match' in spec) return typeof v === 'string' && spec.match.test(v) ? v : REDACTED;
  if ('arr' in spec) return Array.isArray(v) ? v.map((x, i) => redact(spec.arr, x, opts, `${path}[${i}]`)) : REDACTED;
  if (!isPlain(v)) return REDACTED;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    const child = 'obj' in spec ? spec.obj[k] : spec.keys.test(k) ? spec.map : undefined;
    if (child === undefined) {
      opts.dropped?.push(`${path}.${k}`);
      continue;
    }
    const r = redact(child, x, opts, `${path}.${k}`);
    if (r !== undefined) out[k] = r;
  }
  return out;
}

// ── The reads ──────────────────────────────────────────────────────────────

export interface ViewQuery {
  reportId: string | null;
  days: number;
}

const LIMIT = 500;

/** One view's rows, unredacted, read in the inspect actor's read-only transaction. */
export async function readView(tx: Queryable, view: Exclude<ViewName, 'health'>, q: ViewQuery): Promise<Record<string, unknown>> {
  const cols = (table: string, alias: string, leave: string[] = []) => Object.entries(COLUMNS[table]!)
    .filter(([c, spec]) => spec !== 'never' && !leave.includes(c))
    .map(([c]) => `${alias}.${c}`).join(', ');

  if (view === 'reports') {
    const { rows } = await tx.query(
      // The jsonb columns stay out of the list: the workspace view has them, one report at a time.
      `select ${cols('reports', 'r', ['brief', 'agent_call', 'target', 'state'])},
              case
                when r.state->'send'->>'sentAt' is not null then 'sent'
                when r.state->>'reached' = 'send' or r.state->'send'->'headline' is not null then 'send'
                when r.agent_call is not null then 'findings'
                else 'sort'
              end as stage,
              (select count(*) from comp_report.report_comps rc where rc.report_id = r.id and rc.removed_at is null)::int as comps,
              (select count(*) from comp_report.report_comps rc where rc.report_id = r.id and rc.removed_at is null and rc.tier is null)::int as unsorted,
              (select count(*) from comp_report.report_comps rc where rc.report_id = r.id and rc.removed_at is null and rc.tier = 'primary')::int as "primary",
              (select count(*) from comp_report.report_comps rc where rc.report_id = r.id and rc.removed_at is null and rc.tier = 'secondary')::int as secondary,
              (select count(*) from comp_report.report_comps rc where rc.report_id = r.id and rc.removed_at is null and rc.tier = 'excluded')::int as excluded,
              (select count(*) from comp_report.report_comps rc where rc.report_id = r.id and rc.removed_at is not null)::int as removed,
              (select count(*) from comp_report.messages m where m.report_id = r.id)::int as messages,
              (select count(*) from comp_report.imports i where i.report_id = r.id)::int as imports,
              (select count(*) from comp_report.link_reads l where l.report_id = r.id)::int as reads
         from comp_report.reports r
        where r.status <> 'deleted'
        order by r.updated_at desc limit 200`,
    );
    return { reports: rows };
  }

  if (view === 'workspace') {
    const workspace = await loadWorkspace(tx, INSPECT_READER, q.reportId!);
    const facts = new Map((await tx.query<{ id: string; facts: unknown }>(
      `select rc.id, o.facts
         from comp_report.report_comps rc
         left join comp_report.property_observations o on o.id = rc.observation_id
        where rc.report_id = $1`,
      [q.reportId],
    )).rows.map((r) => [r.id, r.facts]));
    return { workspace: { ...workspace, comps: workspace.comps.map((c) => ({ ...c, facts: facts.get(c.reportCompId) ?? null })) } };
  }

  if (view === 'comps') {
    await mustExist(tx, q.reportId!);
    const comps = (await tx.query<Record<string, unknown> & { id: string; property_id: string; observation_id: string | null }>(
      `select ${cols('report_comps', 'rc')} from comp_report.report_comps rc where rc.report_id = $1 order by rc.created_at, rc.id`,
      [q.reportId],
    )).rows;
    const properties = new Map((await tx.query<Record<string, unknown> & { id: string }>(
      `select ${cols('properties', 'p')} from comp_report.properties p
        where p.id in (select property_id from comp_report.report_comps where report_id = $1)`,
      [q.reportId],
    )).rows.map((r) => [r.id, r]));
    const observations = new Map((await tx.query<Record<string, unknown> & { id: string }>(
      `select ${cols('property_observations', 'o')} from comp_report.property_observations o
        where o.id in (select observation_id from comp_report.report_comps where report_id = $1)`,
      [q.reportId],
    )).rows.map((r) => [String(r.id), r]));
    const reasons = (await tx.query<Record<string, unknown> & { report_comp_id: string }>(
      `select ${cols('reasons', 'x')} from comp_report.reasons x where x.report_id = $1 order by x.id`,
      [q.reportId],
    )).rows;
    return {
      comps: comps.map((c) => ({
        ...c,
        property: properties.get(c.property_id) ?? null,
        observation: c.observation_id !== null ? observations.get(String(c.observation_id)) ?? null : null,
        reasons: reasons.filter((r) => r.report_comp_id === c.id),
      })),
    };
  }

  if (view === 'messages') {
    await mustExist(tx, q.reportId!);
    const { rows } = await tx.query(
      `select ${cols('messages', 'm')} from comp_report.messages m where m.report_id = $1 order by m.seq`,
      [q.reportId],
    );
    return { messages: rows };
  }

  if (view === 'usage') {
    const totals = (await tx.query(
      `select user_email, (created_at at time zone 'utc')::date::text as day, count(*)::int as calls,
              sum(input_tokens)::bigint as input_tokens, sum(output_tokens)::bigint as output_tokens,
              sum(estimated_cost_usd)::text as estimated_cost_usd
         from comp_report.usage
        where created_at > now() - make_interval(days => $1)
        group by 1, 2 order by 2 desc, 1`,
      [q.days],
    )).rows;
    const rows = (await tx.query(
      `select ${cols('usage', 'u')} from comp_report.usage u
        where u.created_at > now() - make_interval(days => $1) and ($2::uuid is null or u.report_id = $2)
        order by u.id desc limit ${LIMIT}`,
      [q.days, q.reportId],
    )).rows;
    return { totals, rows };
  }

  const table = view === 'access' ? 'access_events' : 'activity';
  const { rows } = await tx.query(
    `select ${cols(table, 't')} from comp_report.${table} t
      where t.at > now() - make_interval(days => $1) and ($2::uuid is null or t.report_id = $2)
      order by t.id desc limit ${LIMIT}`,
    [q.days, q.reportId],
  );
  return { rows };
}

async function mustExist(tx: Queryable, reportId: string): Promise<void> {
  await reportFor(tx, INSPECT_READER, reportId, false);
}
