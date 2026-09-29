// The interaction map — design Appendix A.5. Which factors change one
// another's value, and how. Structure only: no magnitudes (those are CR-R2).
//
// v1 behaviour (§6.6):
// - substitutes: pulling the same way, applied as the larger adjustment, never
//   the sum; pulling opposite ways, they net out;
// - overlapping and otherwise-related pairs: a double-counting warning when
//   both sides carry a value, from the house method or the agent;
// - complements: an interaction line whose value is not yet determined.
//
// The last five rows were added in design v0.4, from CR-R's evidence.

export type Relationship =
  | 'substitute'
  | 'conditional_substitute'
  | 'complement'
  | 'overlap'
  | 'offsetting'
  | 'correlated';

/** A factor, or one facet of it ("amenities.shared_outdoor"); a bare factor covers all its facets. */
export interface InteractionMember {
  factor: string;
  facet?: string;
}

export interface InteractionDefinition {
  id: string;
  /** For most rows, two members. A hub row pairs the first member with each of the others. */
  members: InteractionMember[];
  pattern: 'pair' | 'hub';
  relationship: Relationship;
  why: string;
  /** What must hold for a conditional substitute to substitute. */
  condition?: string;
  v1_behaviour: 'larger_not_sum' | 'warn_double_counting' | 'undetermined_interaction_line';
}

export const INTERACTIONS: readonly InteractionDefinition[] = [
  { id: 'outdoor_space~shared_outdoor', pattern: 'pair', relationship: 'substitute',
    members: [{ factor: 'outdoor_space' }, { factor: 'amenities', facet: 'shared_outdoor' }],
    why: 'A private terrace reduces what a building roof deck adds for that unit',
    v1_behaviour: 'larger_not_sum' },
  { id: 'parking~micro_location', pattern: 'pair', relationship: 'conditional_substitute',
    members: [{ factor: 'parking' }, { factor: 'micro_location' }],
    why: 'Where street parking is easy, a garage space adds less',
    condition: 'street parking is easy at this location — the engine cannot know that, so it warns rather than substitutes',
    v1_behaviour: 'warn_double_counting' },
  { id: 'outdoor_space*views', pattern: 'pair', relationship: 'complement',
    members: [{ factor: 'outdoor_space' }, { factor: 'views' }],
    why: 'A terrace with a skyline view is worth more than the two apart',
    v1_behaviour: 'undetermined_interaction_line' },
  { id: 'floor*views', pattern: 'pair', relationship: 'overlap',
    members: [{ factor: 'floor' }, { factor: 'views' }],
    why: 'A high floor often is the view; adjusting for both double counts',
    v1_behaviour: 'warn_double_counting' },
  { id: 'interior_size~beds_baths', pattern: 'pair', relationship: 'overlap',
    members: [{ factor: 'interior_size' }, { factor: 'beds_baths' }],
    why: 'Extra rooms usually arrive with extra area',
    v1_behaviour: 'warn_double_counting' },
  { id: 'unit_type~floor,outdoor_space,views', pattern: 'hub', relationship: 'overlap',
    members: [{ factor: 'unit_type' }, { factor: 'floor' }, { factor: 'outdoor_space' }, { factor: 'views' }],
    why: 'A penthouse premium bundles all three',
    v1_behaviour: 'warn_double_counting' },
  { id: 'amenities~carrying_costs', pattern: 'pair', relationship: 'offsetting',
    members: [{ factor: 'amenities' }, { factor: 'carrying_costs' }],
    why: 'Amenities raise common charges; buyers price the charges too',
    v1_behaviour: 'warn_double_counting' },
  { id: 'service_level~building_size', pattern: 'pair', relationship: 'correlated',
    members: [{ factor: 'service_level' }, { factor: 'building_size' }],
    why: 'Large buildings more often carry full service',
    v1_behaviour: 'warn_double_counting' },
  { id: 'condition~building_era', pattern: 'pair', relationship: 'correlated',
    members: [{ factor: 'condition' }, { factor: 'building_era' }],
    why: 'Prewar units vary more in condition',
    v1_behaviour: 'warn_double_counting' },
  { id: 'sponsor_sales~concessions_credits', pattern: 'pair', relationship: 'overlap',
    members: [{ factor: 'sponsor_sales' }, { factor: 'concessions_credits' }],
    why: 'Sponsor pricing and credits are often the same discount',
    v1_behaviour: 'warn_double_counting' },
  { id: 'tax_abatements~carrying_costs', pattern: 'pair', relationship: 'overlap',
    members: [{ factor: 'tax_abatements' }, { factor: 'carrying_costs' }],
    why: 'An exemption is lower taxes, already in the carry',
    v1_behaviour: 'warn_double_counting' },
  { id: 'carrying_costs~building_financials,ground_lease', pattern: 'hub', relationship: 'overlap',
    members: [{ factor: 'carrying_costs' }, { factor: 'building_financials' }, { factor: 'ground_lease' }],
    why: 'Both already sit inside maintenance or common charges',
    v1_behaviour: 'warn_double_counting' },
  { id: 'outdoor_space~interior_size', pattern: 'pair', relationship: 'overlap',
    members: [{ factor: 'outdoor_space' }, { factor: 'interior_size' }],
    why: 'When outdoor area is converted into square footage, adjusting size as well counts it twice',
    v1_behaviour: 'warn_double_counting' },
  { id: 'amenities~parking,private_storage', pattern: 'hub', relationship: 'overlap',
    members: [{ factor: 'amenities', facet: 'general' }, { factor: 'parking' }, { factor: 'private_storage' }],
    why: 'The export lists garage and storage as building amenities',
    v1_behaviour: 'warn_double_counting' },
  { id: 'finishes_systems~condition', pattern: 'pair', relationship: 'overlap',
    members: [{ factor: 'finishes_systems' }, { factor: 'condition' }],
    why: 'A renovation shows up in both',
    v1_behaviour: 'warn_double_counting' },
];

/** The pairs a row expands to: a pair row is itself; a hub row pairs its first member with each other. */
export function interactionPairs(def: InteractionDefinition): [InteractionMember, InteractionMember][] {
  const [first, ...rest] = def.members;
  if (!first) return [];
  if (def.pattern === 'pair') return rest[0] ? [[first, rest[0]]] : [];
  return rest.map((m) => [first, m] as [InteractionMember, InteractionMember]);
}

/** Does a bridge line ("amenities.general") belong to a member ("amenities" covers every facet)? */
export function memberCovers(member: InteractionMember, factor: string, facet: string | null): boolean {
  if (member.factor !== factor) return false;
  return member.facet === undefined || member.facet === facet;
}
