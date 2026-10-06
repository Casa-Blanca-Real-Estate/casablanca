// The adjustment catalog — design Appendix A (v0.4), all 39 factors, as
// definitions.
//
// Each factor says what it captures, where its data can come from, what it
// applies to, how the engine compares a comp with the subject on it, and the
// *shape* its magnitude takes (a percentage per degree of difference, per
// floor, a dollar amount …). None has a number: magnitudes live in the house
// method, and in production every one of them is null (§6.6).
//
// Numbers and ids are identifiers: a new factor is appended (37–39), never
// renumbered, and a renamed factor keeps its id.

export type FactorGroup = 'unit' | 'building' | 'location' | 'transaction_market' | 'later';

/**
 * The shape of a factor's magnitude — what the house method must supply for
 * the engine to turn a comparison into dollars.
 *
 * - `by_degree` — an amount per degree of difference (small, moderate, large),
 *   as a percentage of the comp's price or in dollars. Needs a degree, from Jev
 *   or the agent.
 * - `per_unit` — an amount per unit of difference: per floor, per bedroom, per
 *   month since the sale.
 * - `size_elasticity` — the share of the comp's own $/sqft applied to the area
 *   difference (large units don't trade linearly with smaller ones).
 * - `effective_area` — outdoor space: outdoor area counted at a weight per
 *   kind of space, valued at the comp's $/sqft; per degree when sizes are unknown.
 * - `capitalized` — carrying costs: the monthly difference times a multiplier.
 * - `none` — not an adjustment.
 */
export type MagnitudeShape =
  | { shape: 'by_degree'; unit: 'percent' | 'dollars' }
  | { shape: 'per_unit'; unit: 'percent' | 'dollars'; per: 'floor' | 'bedroom' | 'bathroom' | 'month' }
  | { shape: 'size_elasticity' }
  | { shape: 'effective_area' }
  | { shape: 'capitalized' }
  | { shape: 'none' };

export const OUTDOOR_WEIGHT_KEYS = [
  'weight_balcony', 'weight_terrace', 'weight_roof_deck', 'weight_garden', 'weight_patio', 'weight_outdoor_space',
] as const;

/** The value slots the house method must provide for a shape. */
export function magnitudeKeys(m: MagnitudeShape): string[] {
  switch (m.shape) {
    case 'by_degree': return ['small', 'moderate', 'large'];
    case 'per_unit': return ['per_unit'];
    case 'size_elasticity': return ['elasticity'];
    case 'effective_area': return [...OUTDOOR_WEIGHT_KEYS, 'small', 'moderate', 'large'];
    case 'capitalized': return ['multiplier'];
    case 'none': return [];
  }
}

/** How a comp is compared with the subject on a factor in v1. */
export type ComparisonSource =
  /** The engine compares the facts it has (floors, tags, areas); Jev or the agent can refine it. */
  | 'engine'
  /** Only a judgment can say — Jev, its fallback, or the agent. */
  | 'assessment'
  /** Not compared. */
  | 'none';

export interface FactorLine {
  /** Null for a factor with a single line. */
  facet: string | null;
  name: string;
  magnitude: MagnitudeShape;
}

export interface FactorDefinition {
  id: string;
  /** Appendix A's number. */
  number: number;
  group: FactorGroup;
  name: string;
  captures: string;
  data_sources: string;
  applies_to: string;
  property_types: ('condo' | 'coop' | 'townhouse' | 'multi_family' | 'whole_building')[];
  /**
   * - `adjustment` — a line in the bridge
   * - `selection_rule` — decides which comps to use and how much they count; never moves a price
   * - `evidence_class` — structural: evidence statuses never share a statistic
   * - `later_module` — not in v1
   */
  role: 'adjustment' | 'selection_rule' | 'evidence_class' | 'later_module';
  comparison: ComparisonSource;
  lines: FactorLine[];
  /** False for school zone: analyst view only (§14). */
  client_visible: boolean;
  note?: string;
}

const single = (name: string, magnitude: MagnitudeShape): FactorLine[] => [{ facet: null, name, magnitude }];
const pct: MagnitudeShape = { shape: 'by_degree', unit: 'percent' };
const usd: MagnitudeShape = { shape: 'by_degree', unit: 'dollars' };
const both: FactorDefinition['property_types'] = ['condo', 'coop'];

export const FACTORS: readonly FactorDefinition[] = [
  // ── Unit ──
  { id: 'interior_size', number: 1, group: 'unit', name: 'Interior size',
    captures: "Area differences, including large units that don't trade linearly with smaller-unit $/sqft",
    data_sources: 'Export (may be approximate)', applies_to: 'Condo; co-op by rooms', property_types: ['condo'],
    role: 'adjustment', comparison: 'engine', lines: single('Interior size', { shape: 'size_elasticity' }), client_visible: true,
    note: 'Unit-rate indicators already scale by area, so this line applies to the adjusted-price indicators only.' },
  { id: 'beds_baths', number: 2, group: 'unit', name: 'Bedrooms and bathrooms',
    captures: 'Count differences — the primary driver for co-ops', data_sources: 'Export', applies_to: 'Both', property_types: both,
    role: 'adjustment', comparison: 'engine',
    lines: [
      { facet: 'bedrooms', name: 'Bedrooms', magnitude: { shape: 'per_unit', unit: 'dollars', per: 'bedroom' } },
      { facet: 'bathrooms', name: 'Bathrooms', magnitude: { shape: 'per_unit', unit: 'dollars', per: 'bathroom' } },
    ], client_visible: true },
  { id: 'layout_efficiency', number: 3, group: 'unit', name: 'Layout and efficiency',
    captures: 'Split bedrooms, wasted space, room proportions, flex room', data_sources: 'Floor plan (listing), agent',
    applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'assessment',
    lines: single('Layout and efficiency', pct), client_visible: true },
  { id: 'floor', number: 4, group: 'unit', name: 'Floor',
    captures: "Height in the building and against neighbouring buildings. The effect isn't steady with height, and height relative to the surroundings matters more than height within the building",
    data_sources: 'Export; neighbouring heights from the agent', applies_to: 'Both', property_types: both,
    role: 'adjustment', comparison: 'engine',
    lines: [
      { facet: null, name: 'Floor', magnitude: { shape: 'per_unit', unit: 'percent', per: 'floor' } },
      { facet: 'neighbours', name: 'Height against neighbouring buildings', magnitude: pct },
    ], client_visible: true,
    note: "The first line keeps the id \"floor\". Neighbouring heights aren't in the export, so the second line takes a judgment — clearing the next building's roofline, say." },
  { id: 'exposure_light', number: 5, group: 'unit', name: 'Exposure and light',
    captures: 'Orientation, corner units, open or blocked light', data_sources: 'Listing text, agent',
    applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'assessment',
    lines: single('Exposure and light', pct), client_visible: true },
  { id: 'views', number: 6, group: 'unit', name: 'Views',
    captures: 'City, skyline, park, water, landmark; open or obstructed; protected', data_sources: 'Export tags, listing, agent',
    applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'engine',
    lines: single('Views', pct), client_visible: true },
  { id: 'outdoor_space', number: 7, group: 'unit', name: 'Outdoor space',
    captures: 'Balcony, terrace, private roof, garden; size; private or shared access',
    data_sources: 'Export (presence only), listing, agent', applies_to: 'Both', property_types: both,
    role: 'adjustment', comparison: 'engine', lines: single('Outdoor space', { shape: 'effective_area' }), client_visible: true,
    note: 'Private outdoor space. Shared outdoor space is an amenity (15). The export has presence only, never size.' },
  { id: 'condition', number: 8, group: 'unit', name: 'Condition',
    captures: 'Mint, renovated, good, original, needs work', data_sources: 'Listing text and photos; the agent judges',
    applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'assessment',
    lines: single('Condition', pct), client_visible: true },
  { id: 'finishes_systems', number: 9, group: 'unit', name: 'Finishes and systems',
    captures: 'Kitchen and bath quality, central air, dishwasher, en-suite bathrooms, fireplace; laundry as installed, permitted or prohibited (co-ops need all three)',
    data_sources: 'Export tags, listing', applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'engine',
    lines: [
      { facet: 'quality', name: 'Kitchen and bath quality', magnitude: pct },
      { facet: 'central_air', name: 'Central air', magnitude: pct },
      { facet: 'dishwasher', name: 'Dishwasher', magnitude: pct },
      { facet: 'en_suite', name: 'En-suite bathrooms', magnitude: pct },
      { facet: 'fireplace', name: 'Fireplace', magnitude: pct },
      { facet: 'laundry', name: 'In-unit laundry', magnitude: pct },
    ], client_visible: true,
    note: 'Quality is a grade, so it takes a judgment. Central air, dishwasher, fireplace and a washer/dryer are yes-or-no tags the engine compares. En-suite bathrooms are never tagged, so they take a judgment. Laundry has three states: the export shows only installed; permitted or prohibited comes from the agent.' },
  { id: 'ceiling_height', number: 10, group: 'unit', name: 'Ceiling height and volume',
    captures: 'Loft volume, double height', data_sources: 'Listing, agent', applies_to: 'Both', property_types: both,
    role: 'adjustment', comparison: 'assessment', lines: single('Ceiling height and volume', pct), client_visible: true },
  { id: 'unit_type', number: 11, group: 'unit', name: 'Unit type',
    captures: 'Penthouse, duplex, garden unit, loft conversion', data_sources: 'Unit label, export tags, listing',
    applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'engine',
    lines: single('Unit type', pct), client_visible: true },
  { id: 'noise_street_position', number: 12, group: 'unit', name: 'Noise and street position',
    captures: 'Avenue or side street, elevated train, front or rear', data_sources: 'Agent, listing',
    applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'assessment',
    lines: single('Noise and street position', pct), client_visible: true },
  { id: 'private_storage', number: 13, group: 'unit', name: 'Private storage and extras',
    captures: 'Deeded storage, private elevator landing', data_sources: 'Listing, agent', applies_to: 'Both',
    property_types: both, role: 'adjustment', comparison: 'assessment',
    lines: single('Private storage and extras', usd), client_visible: true },

  // ── Building ──
  { id: 'service_level', number: 14, group: 'building', name: 'Service level',
    captures: 'Full-time doorman, concierge, part-time, virtual, none', data_sources: 'Export amenities',
    applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'engine',
    lines: single('Service level', pct), client_visible: true },
  { id: 'amenities', number: 15, group: 'building', name: 'Amenities',
    captures: 'Gym, pool, roof deck, playroom and the rest', data_sources: 'Export amenities',
    applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'engine',
    lines: [
      { facet: 'general', name: 'Amenities', magnitude: pct },
      { facet: 'shared_outdoor', name: 'Shared outdoor space', magnitude: pct },
    ], client_visible: true,
    note: 'Shared outdoor space is its own line because it substitutes for private outdoor space (A.5).' },
  { id: 'building_era', number: 16, group: 'building', name: 'Building era and type',
    captures: 'Prewar, postwar, new development, conversion, landmark',
    data_sources: 'Year built: StreetEasy PDF or listing (not in the CSV)', applies_to: 'Both', property_types: both,
    role: 'adjustment', comparison: 'engine', lines: single('Building era and type', pct), client_visible: true },
  { id: 'building_size', number: 17, group: 'building', name: 'Building size',
    captures: 'Boutique against large, by units and stories', data_sources: 'Export', applies_to: 'Both',
    property_types: both, role: 'adjustment', comparison: 'engine', lines: single('Building size', pct), client_visible: true },
  { id: 'sponsor_sales', number: 18, group: 'building', name: 'Sponsor and new-development sales',
    captures: 'Sponsor pricing, concessions, sponsor-paid transfer taxes', data_sources: 'Listing, agent',
    applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'assessment',
    lines: single('Sponsor and new-development sales', pct), client_visible: true },
  { id: 'carrying_costs', number: 19, group: 'building', name: 'Carrying costs',
    captures: 'Common charges and taxes, or maintenance, as capitalised into price', data_sources: 'Export',
    applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'engine',
    lines: single('Carrying costs', { shape: 'capitalized' }), client_visible: true },
  { id: 'tax_abatements', number: 20, group: 'building', name: 'Tax exemptions and abatements',
    captures: "421-a and its successors 421-a(16) and 485-x (exemptions); J-51 (condos and co-ops); Battery Park City's payments in lieu of taxes; when each steps up or expires",
    data_sources: 'Listing, agent, city records', applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'assessment',
    lines: single('Tax exemptions and abatements', pct), client_visible: true,
    note: 'Renamed in v0.4; the id stays tax_abatements. A co-op\'s benefit reaches owners through maintenance.' },
  { id: 'building_financials', number: 21, group: 'building', name: 'Building financials',
    captures: 'Reserves, assessments, underlying mortgage, litigation', data_sources: 'Agent, offering documents',
    applies_to: 'Both; critical for co-ops', property_types: both, role: 'adjustment', comparison: 'assessment',
    lines: single('Building financials', pct), client_visible: true },
  { id: 'policies', number: 22, group: 'building', name: 'Policies',
    captures: 'Pets, sublets, pied-à-terre, guarantors, financing limits, flip tax',
    data_sources: 'Export (partial), listing, agent', applies_to: 'Both; financing limits critical for co-ops',
    property_types: both, role: 'adjustment', comparison: 'engine', lines: single('Policies', pct), client_visible: true },
  { id: 'parking', number: 23, group: 'building', name: 'Parking',
    captures: 'Deeded space, garage in building, valet, none', data_sources: "Export amenities (can't tell deeded from not)",
    applies_to: 'Both', property_types: both, role: 'adjustment', comparison: 'engine', lines: single('Parking', usd), client_visible: true },
  { id: 'ground_lease', number: 24, group: 'building', name: 'Ground lease',
    captures: 'Leasehold against fee ownership', data_sources: 'Listing, agent', applies_to: 'Both; large where present',
    property_types: both, role: 'adjustment', comparison: 'assessment', lines: single('Ground lease', pct), client_visible: true },

  // ── Location ──
  { id: 'micro_location', number: 25, group: 'location', name: 'Micro-location',
    captures: 'Block, side of the avenue, transit, parks, waterfront — "Canal Street isn\'t really Tribeca"',
    data_sources: 'Address, agent; geocoding later', applies_to: 'Both', property_types: both,
    role: 'adjustment', comparison: 'assessment', lines: single('Micro-location', pct), client_visible: true },
  { id: 'distance', number: 26, group: 'location', name: 'Distance from subject',
    captures: 'A selection rule, not an adjustment: nearer comps are preferred and weighted, not adjusted (CR-R found no evidence for it as an adjustment)',
    data_sources: 'Needs coordinates (not in the export)', applies_to: 'Both', property_types: both,
    role: 'selection_rule', comparison: 'none', lines: single('Distance from subject', { shape: 'none' }), client_visible: true,
    note: 'Location differences belong in micro-location (25); adjusting for distance as well would count them twice. The agent tiers comps; v1 weights nothing.' },
  { id: 'school_zone', number: 27, group: 'location', name: 'School zone',
    captures: 'A real price driver — analyst view only (§14)', data_sources: 'Agent, public data', applies_to: 'Both',
    property_types: both, role: 'adjustment', comparison: 'assessment', lines: single('School zone', pct), client_visible: false,
    note: 'A recognised steering signal: analyst view only, never in client copy unless Hannah approves wording.' },

  // ── Transaction and market ──
  { id: 'recency_market', number: 28, group: 'transaction_market', name: 'Recency and market movement',
    captures: "Time since the sale, and how the market moved since — measured from the contract date where a listing's history gives one, else from closing (§6.5)",
    data_sources: "Export dates; a listing's history", applies_to: 'Both',
    property_types: both, role: 'adjustment', comparison: 'engine',
    lines: single('Recency and market movement', { shape: 'per_unit', unit: 'percent', per: 'month' }), client_visible: true,
    note: 'Its magnitude is the market’s movement per month — positive in a rising market, which moves older sales up. The export gives a sold comp only its closing date, so an export sale reads fresher than it was by the contract-to-close lag; a listing\'s history supplies the contract date (CR-2.2).' },
  { id: 'sale_conditions', number: 29, group: 'transaction_market', name: 'Sale conditions',
    captures: "Estate, distressed, related-party, off-market, bulk, non-arm's-length",
    data_sources: 'Agent, listing; closing-only records flagged', applies_to: 'Both', property_types: both,
    role: 'adjustment', comparison: 'assessment', lines: single('Sale conditions', pct), client_visible: true },
  { id: 'concessions_credits', number: 30, group: 'transaction_market', name: 'Concessions and credits',
    captures: 'Seller credits, closing-cost credits', data_sources: 'Listing, agent', applies_to: 'Both', property_types: both,
    role: 'adjustment', comparison: 'assessment', lines: single('Concessions and credits', pct), client_visible: true },
  { id: 'combination_units', number: 31, group: 'transaction_market', name: 'Combination units',
    captures: 'Combined apartments, against the sum of their parts', data_sources: 'Agent', applies_to: 'Both',
    property_types: both, role: 'adjustment', comparison: 'assessment', lines: single('Combination units', pct), client_visible: true },
  { id: 'evidence_status', number: 32, group: 'transaction_market', name: 'Evidence status',
    captures: "Sold, in contract, active and didn't sell — not an adjustment; kept apart in every statistic (§6.3)", data_sources: "Export; a listing's status or history",
    applies_to: 'Both', property_types: both, role: 'evidence_class', comparison: 'none',
    lines: single('Evidence status', { shape: 'none' }), client_visible: true },
  // 37–39 were added in v0.4 (CR-R) and sit with their group, as in Appendix A.
  { id: 'financing_terms', number: 37, group: 'transaction_market', name: 'Financing terms',
    captures: 'Cash against mortgaged purchases; seller or sponsor financing. Mortgaged buyers pay about 11% more than cash buyers nationally, and Manhattan was 64.7% cash in Q4 2025 (CR-R)',
    data_sources: 'Agent, listing', applies_to: 'Both', property_types: both,
    role: 'adjustment', comparison: 'assessment', lines: single('Financing terms', pct), client_visible: true },
  { id: 'tenant_in_place', number: 38, group: 'transaction_market', name: 'Tenant in place',
    captures: 'A sale subject to an existing lease', data_sources: 'Listing, agent', applies_to: 'Both', property_types: both,
    role: 'adjustment', comparison: 'assessment', lines: single('Tenant in place', pct), client_visible: true },
  { id: 'non_realty_items', number: 39, group: 'transaction_market', name: 'Non-realty items',
    captures: 'Furniture and other personal property included in the price', data_sources: 'Listing, agent', applies_to: 'Both',
    property_types: both, role: 'adjustment', comparison: 'assessment', lines: single('Non-realty items', usd), client_visible: true },

  // ── Later property types and modules ──
  { id: 'air_development_rights', number: 33, group: 'later', name: 'Air and development rights',
    captures: 'Unused buildable area', data_sources: 'Not in v1', applies_to: 'Townhouses, whole buildings',
    property_types: ['townhouse', 'whole_building'], role: 'later_module', comparison: 'none',
    lines: single('Air and development rights', { shape: 'none' }), client_visible: true },
  { id: 'lot_size_frontage', number: 34, group: 'later', name: 'Lot size, width and frontage',
    captures: 'Land characteristics', data_sources: 'Not in v1', applies_to: 'Townhouses',
    property_types: ['townhouse'], role: 'later_module', comparison: 'none',
    lines: single('Lot size, width and frontage', { shape: 'none' }), client_visible: true },
  { id: 'legal_use', number: 35, group: 'later', name: 'Legal use and certificate of occupancy',
    captures: 'Legal unit count and use', data_sources: 'Not in v1', applies_to: 'Townhouses, multi-family',
    property_types: ['townhouse', 'multi_family'], role: 'later_module', comparison: 'none',
    lines: single('Legal use and certificate of occupancy', { shape: 'none' }), client_visible: true },
  { id: 'rental_income_yield', number: 36, group: 'later', name: 'Rental income and yield',
    captures: "Achievable rent and gross yield — needs rent comps the export doesn't carry", data_sources: 'Not in v1',
    applies_to: 'Investor audience; the offer module', property_types: ['condo', 'coop', 'townhouse', 'multi_family'],
    role: 'later_module', comparison: 'none', lines: single('Rental income and yield', { shape: 'none' }), client_visible: true,
    note: 'No rent data exists in the export, so no yield can be computed — by construction.' },
];

export const FACTOR_BY_ID: ReadonlyMap<string, FactorDefinition> = new Map(FACTORS.map((f) => [f.id, f]));

export function lineId(factor: string, facet: string | null | undefined): string {
  return facet ? `${factor}.${facet}` : factor;
}

/** Every line — "floor", "floor.neighbours", "beds_baths.bedrooms", "amenities.shared_outdoor" … */
export function allLines(): { id: string; factor: FactorDefinition; line: FactorLine }[] {
  const out: { id: string; factor: FactorDefinition; line: FactorLine }[] = [];
  for (const factor of FACTORS) {
    for (const line of factor.lines) out.push({ id: lineId(factor.id, line.facet), factor, line });
  }
  return out;
}

export function findLine(factorId: string, facet: string | null | undefined): { factor: FactorDefinition; line: FactorLine } | null {
  const factor = FACTOR_BY_ID.get(factorId);
  if (!factor) return null;
  const line = factor.lines.find((l) => l.facet === (facet ?? null)) ??
    (facet === undefined || facet === null ? (factor.lines.length === 1 ? factor.lines[0] : undefined) : undefined);
  return line ? { factor, line } : null;
}
