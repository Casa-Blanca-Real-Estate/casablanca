// Fair-housing screening for client copy (§9.3, §14): a fixed list, and
// nothing else. A term on the hard list states a preference, limitation or
// steer on a protected basis: it's a hard stop, and the draft can't be copied
// until it's out. A word on the near list is often innocent ("the building's
// family room") and sometimes a signal: it warns, and the agent acknowledges
// it before copying. Jev screening is a separate lane, waiting for zero
// retention (Dispatch 13, not in scope).
//
// Drafted by Mason (CR-5, 2026-10-14) from HUD's advertising guidance (the 1995
// Achtenberg memo and the 1989 word list it narrowed), the Fair Housing Act's
// classes, and New York City's Human Rights Law, which adds lawful source of
// income, immigration status, age, marital status and more. School zones
// follow design §14: a recognised steering signal, kept out of client copy
// until Hannah approves wording. **The list is pending review**
// (docs/decisions.md): change it only by adding a new version.

export const FAIR_HOUSING_LIST_VERSION = 'fh-2026-10-14';

export interface FairHousingTerm {
  /** Matched case-insensitively, on word boundaries. */
  pattern: RegExp;
  /** The protected basis, for the check to say why. */
  basis: string;
}

const w = (source: string) => new RegExp(String.raw`\b(?:${source})\b`, 'gi');

/** A hard stop: these state a preference or limitation, or steer. */
export const HARD_TERMS: FairHousingTerm[] = [
  // Familial status and age
  { pattern: w(String.raw`no (?:kids|children|families)|adults? only|adult (?:building|community)|not (?:suitable|ideal|good) for (?:kids|children|families)`), basis: 'familial status' },
  { pattern: w(String.raw`perfect for (?:singles|a single person|couples|a couple|empty[- ]nesters|young professionals|retirees)|ideal for (?:singles|couples|empty[- ]nesters|young professionals|retirees)`), basis: 'familial status or age' },
  { pattern: w(String.raw`(?:singles|couples|seniors|retirees|empty[- ]nesters) only|young professionals?|empty[- ]nesters?|bachelor pad|mature (?:person|persons|individual|individuals|couple|couples|buyer|buyers)`), basis: 'familial status or age' },
  // Marital status (NYC)
  { pattern: w(String.raw`married couples? only|must be married|no unmarried couples`), basis: 'marital status' },
  // Religion
  { pattern: w(String.raw`(?:christian|catholic|protestant|jewish|muslim|hindu|buddhist) (?:home|homes|family|families|buyers?|neighbou?rhood|community|area|block|building)`), basis: 'religion' },
  // Race, colour, national origin, immigration status, citizenship
  { pattern: w(String.raw`(?:white|black|hispanic|latino|latina|asian|caucasian|african[- ]american) (?:neighbou?rhood|community|area|block|building|family|families|buyers?)`), basis: 'race or national origin' },
  { pattern: w(String.raw`english[- ]speaking only|no immigrants|citizens only|must be an? (?:u\.?s\.? )?citizen|green card required|no foreigners`), basis: 'national origin, immigration or citizenship status' },
  // Sex and gender
  { pattern: w(String.raw`(?:men|women|males?|females?|gentlemen|ladies) only|no (?:men|women)`), basis: 'sex or gender' },
  // Disability
  { pattern: w(String.raw`no (?:wheelchairs|disabled|handicapped)|not (?:suitable|ideal) for (?:wheelchairs|the disabled|the handicapped|disabled|handicapped)|able[- ]bodied|mentally ill`), basis: 'disability' },
  // Lawful source of income (NYC)
  { pattern: w(String.raw`no (?:section 8|vouchers|programs|housing assistance|cityfheps|subsidies)|section 8 not accepted|vouchers not accepted|employed (?:buyers )?only|must be employed`), basis: 'lawful source of income' },
  // School zones: steering, kept out of client copy until Hannah approves wording (§14)
  { pattern: w(String.raw`school (?:zone|zones|district|districts)|zoned for (?:p\.?\s?s\.?|i\.?\s?s\.?|m\.?\s?s\.?)\s?\d+|zoned for (?:the |a )?(?:\w+ )?schools?|(?:great|good|best|top) schools`), basis: 'steering: school zone (design §14)' },
  // Code words for the character of a neighbourhood's people
  { pattern: w(String.raw`safe (?:neighbou?rhood|area|block|street|community)|crime[- ]free|exclusive (?:neighbou?rhood|community|area|enclave)|restricted (?:neighbou?rhood|community)|integrated (?:neighbou?rhood|building)`), basis: 'steering' },
];

/** A warning to acknowledge: often innocent, sometimes a signal. */
export const NEAR_TERMS: FairHousingTerm[] = [
  { pattern: w(String.raw`family|families|kids|children|child`), basis: 'familial status' },
  { pattern: w(String.raw`seniors?|elderly|retirees?|mature|young|bachelor`), basis: 'age or familial status' },
  { pattern: w(String.raw`church|churches|synagogue|synagogues|mosque|mosques|temple|temples|religious`), basis: 'religion' },
  { pattern: w(String.raw`ethnic|immigrants?|foreign(?:ers)?|citizens?|citizenship`), basis: 'national origin or immigration status' },
  { pattern: w(String.raw`handicap(?:ped)?|disabled|wheelchair|disability`), basis: 'disability' },
  { pattern: w(String.raw`schools?|students?`), basis: 'steering' },
  { pattern: w(String.raw`safe|safety|crime|exclusive|private community`), basis: 'steering' },
  { pattern: w(String.raw`section 8|vouchers?|subsidi(?:y|es|zed)|income[- ]restricted`), basis: 'lawful source of income' },
];

/** Phrases that read as near terms but aren't about people: never flagged. */
const NOT_ABOUT_PEOPLE = w(String.raw`exclusive (?:listing|agent|agency|right|agreement|broker)|family room|single[- ]family|tax[- ]abatement|(?:co-?op|condo) board|safe deposit`);

export interface FairHousingFinding {
  term: string;
  index: number;
  basis: string;
  level: 'hard' | 'near';
}

function blankOut(text: string, re: RegExp): string {
  return text.replace(re, (m) => ' '.repeat(m.length));
}

/** The list's terms in a text. A near hit inside a hard one is reported once, as hard. */
export function fairHousingFindings(text: string): FairHousingFinding[] {
  const out: FairHousingFinding[] = [];
  const hardSpans: Array<[number, number]> = [];
  for (const t of HARD_TERMS) {
    for (const m of text.matchAll(t.pattern)) {
      const term = m[0].trim();
      if (!term) continue;
      const index = m.index ?? 0;
      const end = index + m[0].length;
      // "young professionals" inside "perfect for young professionals" is one finding.
      if (hardSpans.some(([a, b]) => index >= a && end <= b)) continue;
      hardSpans.push([index, end]);
      out.push({ term, index, basis: t.basis, level: 'hard' });
    }
  }
  const scan = blankOut(text, NOT_ABOUT_PEOPLE);
  for (const t of NEAR_TERMS) {
    for (const m of scan.matchAll(t.pattern)) {
      const index = m.index ?? 0;
      if (hardSpans.some(([a, b]) => index >= a && index < b)) continue;
      out.push({ term: m[0], index, basis: t.basis, level: 'near' });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}
