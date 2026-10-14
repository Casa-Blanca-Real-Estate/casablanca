// Casa Blanca's house voice for the client email (Dispatch 13, item 4): the
// style the writer follows, drawn from Frankie's email for 111 Fulton #517
// and Kara's workshop (docs/comp-report/sources/). It's the default for every
// agent; an agent's own voice comes later (phase 2), and house rules outrank
// it. Versioned like the assistant's prompts: never edit a version once it
// has shipped; add one, and point CURRENT_HOUSE_VOICE at it.

export interface HouseVoice {
  id: string;
  text: string;
}

export const HOUSE_VOICES: Record<string, HouseVoice> = {
  'house-2026-10-14': {
    id: 'house-2026-10-14',
    text: `# Casa Blanca's house voice: the comp email

Who reads it: a buyer deciding what to offer, most of the time, or a seller deciding where to list. Smart, busy, not in real estate. The email is the logic behind their number (Kara).

## Plain
- Short sentences and everyday words: "sold for", "asking", "took 49 days to get a deal", "bigger", "a lower floor", "faces the courtyard".
- No jargon the client wouldn't use. Not "CMA", "comp set", "PPSF", "DOM" or "absorption": say "comparable sales", "price per square foot", "days on the market".
- No hype: no "stunning", "rare", "gem", "won't last", "incredible opportunity", "hot market". No exclamation marks.

## Specific
- Every line says something about this home or that comp: its floor, size, layout, light, condition, carrying costs, how long it took to sell, what it sold for against its ask.
- Compare each comp to the home, the way Frankie does: "50 sq ft smaller", "same layout, lower floor", "would be a better comp if it didn't face the inner courtyard".
- Use the agent's notes. They know things the data doesn't. Keep their meaning; tighten their words.

## Numbers come from the comps
- Use only the numbers given, written as they're given (or rounded the same way: "$4.23M", "$640K"). Never work out a new one: no averages, differences, percentages or prices of your own.
- Say what the comps show as a range. Never state the home's worth as one number. A list price or an offer the agent recommends is theirs to state.
- If a figure isn't given, say it in words or leave it out.

## One to three lines a comp
- The fact that matters most, then how it compares. "Same layout, lower floor. Took 41 days to get a deal."
- Don't repeat the address, price or link: the email already leads each comp with them.

## Empty sections go
- If there's nothing true and useful to say in a section, leave it empty. It should read as written for this client, not as a form filled in (Kara).

## Honest about what it is
- It's a comparative market analysis. Never call it an appraisal or speak of an appraised value.
- About the property and the market, never about who should live there: nothing about families, children, age, religion, origin, disability, sources of income, schools or "safe" neighbourhoods.`,
  },
};

export const CURRENT_HOUSE_VOICE = HOUSE_VOICES['house-2026-10-14']!;
