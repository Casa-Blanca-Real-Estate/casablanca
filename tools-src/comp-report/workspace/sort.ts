// Sort's row (`02-screens.md`, Sort): the quick-pick note chips, and a comp's
// facts with where each came from. The chips start with Kara's checks — the
// engine's flags (§6.10), each label a chip — then add what else the engine
// compared. Presentation only: the engine decides every direction; the chips
// restate it in a few words the agent can take, change or ignore.
import type { CompOut, CompRecord, EngineOutput, PropertyFacts, ResultKind, Sourced } from '../engine/index.ts';
import { isoDay, sqft, usd } from './format.ts';

type Comparison = CompOut['per_result'][ResultKind]['comparisons'][number];

/** Within this share of the home's size, a comp reads "about the same size", whichever side the engine puts it. */
const SAME_SIZE = 0.03;
/** Monthly carry closer than this share of the home's reads as no difference worth a note. */
const SAME_CARRY = 0.1;
/** Buildings built closer together than this many years aren't worth a note. */
const SAME_ERA_YEARS = 10;
/** No more chips than this on a row: the first are the ones that matter most. */
const MAX_CHIPS = 8;

/** Each line the engine compared, from the facts where it could, else from the agent's estimates. */
function compared(comp: CompOut): Map<string, Comparison> {
  const out = new Map<string, Comparison>();
  for (const kind of ['on_facts', 'with_estimates'] as const) {
    for (const c of comp.per_result[kind].comparisons) {
      if (c.status === 'compared' && c.direction && !out.has(c.line)) out.set(c.line, c);
    }
  }
  return out;
}

function subjectFact<T>(subject: EngineOutput['subject'], field: keyof PropertyFacts): T | null {
  const f = (subject.facts.on_facts[field] ?? subject.facts.with_estimates[field]) as Sourced<T> | undefined;
  return f ? f.value : null;
}

/** "#17L" → "L"; "PHA" → null. The line of a unit, where its label is a floor then letters. */
function lineOf(unit: string | null | undefined): string | null {
  const m = /^#?\s*\d+\s*([a-z]+)$/i.exec((unit ?? '').trim());
  return m ? m[1]!.toUpperCase() : null;
}

const WORD: Record<string, [inferior: string, superior: string]> = {
  'beds_baths.bedrooms': ['Fewer bedrooms', 'More bedrooms'],
  'beds_baths.bathrooms': ['Fewer baths', 'More baths'],
  'finishes_systems.laundry': ['No washer/dryer', 'Washer/dryer in the unit'],
  'finishes_systems.central_air': ['No central air', 'Central air'],
  'finishes_systems.fireplace': ['No fireplace', 'A fireplace'],
  'finishes_systems.dishwasher': ['No dishwasher', 'A dishwasher'],
  'amenities.shared_outdoor': ['No shared outdoor space', 'Shared outdoor space'],
  'amenities.general': ['Fewer amenities', 'More amenities'],
  service_level: ['Less building service', 'More building service'],
  parking: ['No parking', 'Parking'],
};

/**
 * The note chips for one comp, most telling first. Kara's checks lead: each
 * flag's label is a chip ("Same building", "First floor", "6 floors lower").
 * Then a few words for each other way the engine found it differs from the
 * home — size, layout, floor, rooms, views, systems, monthlies — where no check
 * already said it. What the note already says isn't offered again.
 */
export function noteChips(comp: CompOut, record: CompRecord, subject: EngineOutput['subject'], note = ''): string[] {
  const lines = compared(comp);
  const chips: string[] = [];
  const add = (chip: string | null | undefined) => {
    if (chip && !chips.includes(chip)) chips.push(chip);
  };
  const cf = record.facts;
  const flagged = comp.checks.filter((k) => k.status === 'flagged');
  for (const k of flagged) add(k.label);
  const checked = new Set(flagged.map((k) => k.code));

  if (comp.flags.same_building_as_subject && !checked.has('same_building')) add('Same building');
  if (comp.flags.same_building_as_subject) {
    const line = lineOf(record.identity.unit.raw);
    if (line && line === lineOf(subject.identity.unit.raw)) add('Same line');
  }

  const floor = lines.get('floor');
  const homeFloor = subjectFact<number>(subject, 'floor');
  const firstFloor = checked.has('first_floor') || Boolean(floor && cf.floor?.value === 1 && homeFloor !== 1);
  if (firstFloor && !checked.has('first_floor')) add('First floor');

  const outdoor = lines.get('outdoor_space');
  if (!checked.has('private_outdoor_one_side')) {
    if (outdoor?.direction === 'comp_superior') add(outdoor.units === null ? 'Has outdoor space' : 'Bigger outdoor space');
    if (outdoor?.direction === 'comp_inferior') add(outdoor.units === null ? 'No outdoor space' : 'Smaller outdoor space');
  }

  const homeNew = subjectFact<boolean>(subject, 'new_development');
  if (!checked.has('new_development_vs_resale')) {
    if (cf.new_development?.value === true && homeNew === false) add('New development');
    if (cf.new_development?.value === false && homeNew === true) add('A resale');
  }
  const homeType = subjectFact<string>(subject, 'property_type');
  if (!checked.has('property_type_differs') && (comp.flags.property_type_mismatch || (cf.property_type && homeType && cf.property_type.value !== homeType))) {
    if (cf.property_type?.value === 'coop') add('A co-op');
    else if (cf.property_type?.value === 'condo') add('A condo');
    else if (cf.property_type?.value === 'condop') add('A condop');
  }
  if (cf.income_restricted?.value && !checked.has('income_restricted')) add('Income-restricted (HDFC)');
  if (cf.sponsor_unit?.value && !checked.has('sponsor_unit')) add('Sponsor sale');

  const size = lines.get('interior_size');
  const homeArea = subjectFact<number>(subject, 'area_sqft');
  const sameSize = Boolean(size && homeArea && size.units !== null && Math.abs(size.units) / homeArea < SAME_SIZE);
  const beds = lines.get('beds_baths.bedrooms');
  const baths = lines.get('beds_baths.bathrooms');
  if (!checked.has('size_far_off')) {
    if (size && !sameSize) add(size.direction === 'comp_inferior' ? 'Smaller' : size.direction === 'comp_superior' ? 'Bigger' : null);
    if (sameSize) add(beds?.direction === 'similar' && baths?.direction === 'similar' ? 'Same layout' : 'About the same size');
  }

  if (floor && !firstFloor && !checked.has('floor_far_off')) {
    add(floor.direction === 'comp_inferior' ? 'Lower floor' : floor.direction === 'comp_superior' ? 'Higher floor' : floor.direction === 'similar' ? 'Same floor' : null);
  }
  for (const line of ['beds_baths.bedrooms', 'beds_baths.bathrooms'] as const) {
    const c = lines.get(line);
    if (c?.direction === 'comp_inferior') add(WORD[line]![0]);
    if (c?.direction === 'comp_superior') add(WORD[line]![1]);
  }

  const views = lines.get('views');
  if (views?.direction === 'comp_inferior') add('No views listed');
  if (views?.direction === 'comp_superior') add('Has views');
  if (views?.direction === 'differs') add('Different views');

  const unitType = lines.get('unit_type');
  if (unitType && unitType.direction !== 'similar') {
    const tags = cf.unit_type?.value ?? [];
    add(tags.includes('penthouse') ? 'Penthouse' : tags[0] ? tags[0][0]!.toUpperCase() + tags[0].slice(1) : 'Standard unit');
  }

  for (const line of ['service_level', 'finishes_systems.laundry', 'finishes_systems.central_air', 'amenities.shared_outdoor', 'finishes_systems.fireplace', 'parking', 'finishes_systems.dishwasher', 'amenities.general']) {
    const c = lines.get(line);
    if (c?.direction === 'comp_inferior') add(WORD[line]![0]);
    if (c?.direction === 'comp_superior') add(WORD[line]![1]);
  }

  // The engine's carry difference is the comp's monthly minus the home's.
  const carry = lines.get('carrying_costs');
  const compCarry = comp.per_result.on_facts.monthly_carry?.value ?? comp.per_result.with_estimates.monthly_carry?.value ?? null;
  if (carry && carry.units !== null && compCarry !== null) {
    const homeCarry = compCarry - carry.units;
    if (homeCarry > 0 && Math.abs(carry.units) / homeCarry >= SAME_CARRY) add(carry.units > 0 ? 'Higher monthlies' : 'Lower monthlies');
  }

  const era = lines.get('building_era');
  if (era?.units !== null && era?.units !== undefined && Math.abs(era.units) >= SAME_ERA_YEARS) add(era.units < 0 ? 'Newer building' : 'Older building');

  return chips.filter((c) => !hasChip(note, c)).slice(0, MAX_CHIPS);
}

/** True when the note already says it. */
export function hasChip(note: string, chip: string): boolean {
  return note.toLowerCase().includes(chip.toLowerCase());
}

/** A chip added to the note: "Smaller" then "Lower floor" reads "Smaller, lower floor". */
export function addToNote(note: string, chip: string): string {
  const text = note.replace(/\s+$/, '');
  if (!text) return chip;
  if (/[.!?;:]$/.test(text) || /\n$/.test(note)) return `${text}${/\n$/.test(note) ? '\n' : ' '}${chip}`;
  // "Same building" joins as "same building"; "HDFC" and "A co-op" keep their capitals where they're names.
  const joined = /^[A-Z][a-z]/.test(chip) && !/^A /.test(chip) ? chip[0]!.toLowerCase() + chip.slice(1) : chip.replace(/^A /, 'a ');
  return `${text}, ${joined}`;
}

// ─── Facts, and where each came from ────────────────────────────────────────

const SOURCE_WORDS: Record<string, string> = {
  se_export: 'StreetEasy’s export',
  se_pdf: 'StreetEasy’s PDF',
  listing: 'its StreetEasy page',
  agent: 'you',
  hypothetical: 'a what-if',
  engine: 'worked out',
};
const CONFIDENCE_WORDS: Record<string, string> = {
  exact: '',
  approx: 'approximate',
  inferred: 'read, not yet confirmed',
  guesstimate: 'an estimate',
};
const LAUNDRY_WORDS: Record<string, string> = {
  installed: 'Washer/dryer installed', permitted: 'Washer/dryer permitted', prohibited: 'Washer/dryer prohibited', none_listed: 'None listed',
};
const DOORMAN_WORDS: Record<string, string> = {
  full_time: 'Full-time doorman', part_time: 'Part-time doorman', virtual: 'Virtual doorman', hours_unspecified: 'Doorman', none_listed: 'No doorman listed',
};
const TYPE_WORDS: Record<string, string> = {
  condo: 'Condo', coop: 'Co-op', condop: 'Condop', townhouse: 'Townhouse', multi_family: 'Multi-family', other: 'Other',
};

type Shown = (value: unknown) => string;
const money: Shown = (v) => usd(v as number);
const perMonth: Shown = (v) => `${usd(v as number)} a month`;
const day: Shown = (v) => isoDay(v as string);
const count: Shown = (v) => String(v);
const yes: Shown = (v) => (v ? 'Yes' : 'No');
const list: Shown = (v) => (v as string[]).join(', ') || 'None listed';

/** The facts a row opens to, in the order an agent reads a listing. */
const FACTS: [keyof PropertyFacts, string, Shown][] = [
  ['sale_price', 'Sale price', money],
  ['list_price', 'Ask', money],
  ['original_list_price', 'First ask', money],
  ['status_date', 'Date', day],
  ['list_date', 'Listed', day],
  ['contract_date', 'In contract', day],
  ['days_on_market', 'Days on market', count],
  ['area_sqft', 'Size', (v) => sqft(v as number)],
  ['beds', 'Bedrooms', count],
  ['baths', 'Bathrooms', count],
  ['rooms', 'Rooms', count],
  ['floor', 'Floor', count],
  ['property_type', 'Type', (v) => TYPE_WORDS[v as string] ?? String(v)],
  ['new_development', 'New development', yes],
  ['sponsor_unit', 'Sponsor unit', yes],
  ['income_restricted', 'Income-restricted', yes],
  ['unit_type', 'Unit type', list],
  ['outdoor_private', 'Private outdoor space', yes],
  ['outdoor_kinds', 'Outdoor space', list],
  ['outdoor_area_sqft', 'Outdoor size', (v) => sqft(v as number)],
  ['views', 'Views', list],
  ['laundry', 'Laundry', (v) => LAUNDRY_WORDS[v as string] ?? String(v)],
  ['central_air', 'Central air', yes],
  ['dishwasher', 'Dishwasher', yes],
  ['fireplace', 'Fireplace', yes],
  ['finishes', 'Features', list],
  ['common_charges_monthly', 'Common charges', perMonth],
  ['taxes_monthly', 'Taxes', perMonth],
  ['maintenance_monthly', 'Maintenance', perMonth],
  ['service', 'Service', (v) => {
    const s = v as { doorman: string; concierge: boolean };
    return [DOORMAN_WORDS[s.doorman] ?? s.doorman, s.concierge ? 'concierge' : null].filter(Boolean).join(', ');
  }],
  ['amenities', 'Amenities', list],
  ['outdoor_shared', 'Shared outdoor space', yes],
  ['parking', 'Parking', list],
  ['policies', 'Policies', list],
  ['building_stories', 'Stories', count],
  ['building_units', 'Units in the building', count],
  ['year_built', 'Built', count],
];

export interface FactLine {
  label: string;
  value: string;
  /** Where it came from, and when: "StreetEasy’s export, Sep 23, 2026". */
  from: string;
  /** How sure, when it isn't exact: "approximate", "an estimate", "read, not yet confirmed". */
  sureness: string;
}

/**
 * Every fact the comp's record has, with where it came from and how sure it is.
 * Nothing listed isn't a "no": a source that lists no fireplace reads "Not listed".
 */
export function factLines(record: CompRecord): FactLine[] {
  const status = record.status.listing_status ?? record.status.evidence_class;
  const dateLabel = status === 'sold' ? 'Closed' : status === 'in_contract' ? 'Went into contract' : status === 'active' ? 'Listed' : 'Date';
  const askLabel = status === 'active' ? 'Ask' : 'Last ask';
  const out: FactLine[] = [];
  for (const [field, label, shown] of FACTS) {
    const f = record.facts[field] as Sourced<unknown> | undefined;
    if (!f) continue;
    const unlisted = f.confidence === 'approx' && (f.value === false || (Array.isArray(f.value) && f.value.length === 0) || f.value === 'none_listed');
    out.push({
      label: field === 'status_date' ? dateLabel : field === 'list_price' ? askLabel : label,
      value: unlisted ? 'Not listed' : shown(f.value),
      from: `${SOURCE_WORDS[f.source] ?? f.source}, ${isoDay(f.as_of)}`,
      sureness: unlisted ? '' : CONFIDENCE_WORDS[f.confidence] ?? f.confidence,
    });
  }
  return out;
}

/** Where most of the facts came from: said once, so each fact names only a different source. */
export function usualSource(lines: FactLine[]): string | null {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l.from, (counts.get(l.from) ?? 0) + 1);
  let best: string | null = null;
  for (const [from, n] of counts) if (best === null || n > counts.get(best)!) best = from;
  return best;
}
