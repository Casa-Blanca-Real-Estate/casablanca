// Version strings. Every stored version of a report records the engine
// version, the house method that produced it, and the parser version of each
// import, so any figure can be traced to the exact code that computed it.
//
// Bump ENGINE_VERSION whenever a change could alter any output for the same
// input; bump PARSER_VERSION whenever a change could alter any parsed record.

export const ENGINE_VERSION = '0.4.0';
export const PARSER_VERSION = '0.4.0';
/** The StreetEasy comp export schema the parser was built against (Hannah's export, 2026-09-23). */
export const EXPORT_SCHEMA = 'streeteasy-comp-export/2026-09';
