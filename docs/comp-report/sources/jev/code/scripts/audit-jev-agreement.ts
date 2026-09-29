/**
 * audit-jev-agreement.ts — how often Jev (watch mode) agrees with the platform, and how often it is
 * RIGHT when the two disagree. The recipe behind the card-mediator decision (KJ, 2026-09-23).
 *
 *   DATABASE_URL=… npx tsx scripts/audit-jev-agreement.ts --binder=N
 *   DATABASE_URL=… npx tsx scripts/audit-jev-agreement.ts --binder=N --json
 *
 * Reads jev_observations (migration 116), written only when JEV_SHADOW=true, by
 * server/lib/jev-shadow.ts, which acts on nothing. Per lane (kind · citation):
 *   §1 agreement — Jev's answer = the platform's decision
 *   §2 agreement by Jev's OWN probability band — the calibration question: does a 0.95 mean more than
 *      a 0.6? A mediator threshold is only honest if agreement rises with it
 *   §3 the disagreements, with ids + evidence, for a human to label (scripts/lib/jev-shadow-labels.ts)
 *   §4 on the labelled ones: how often Jev was RIGHT and the platform wrong, and the reverse
 *
 * PROVENANCE: OBSERVED — Jev's answers and the platform's decisions, both as recorded. "Right" exists
 * only where a human labelled it; until then §4 says UNMEASURED rather than inventing a rate.
 * Read-only: scripts/lib/live-read.ts.
 */
import { liveRead, describeEndpoint } from "./lib/live-read.js";
import { assertKnownFlags, formatBanner, readiness, mayConclude, scopeLabel } from "./lib/audit-verdict.js";
import { JEV_SHADOW_LABELS } from "./lib/jev-shadow-labels.js";

const KNOWN_FLAGS = ["binder", "json"] as const;
assertKnownFlags(KNOWN_FLAGS);
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const rawBinder = arg("binder");
const BINDER = rawBinder === undefined ? null : Number(rawBinder);
if (BINDER === null || !Number.isInteger(BINDER)) {
  console.error(`--binder=<id> is required (got ${JSON.stringify(rawBinder)}) — agreement is read per run's binder`);
  process.exit(2);
}
const AS_JSON = process.argv.includes("--json");

interface Row { id: string; lane: string; subject: string; incumbent: string | null; jev_answer: string | null;
  jev_probability: number | null; agrees: boolean | null; evidence: string | null; jev_model: string | null }

/** Jev's own probability bands — agreement should RISE with them if its confidence means anything. */
const BANDS: Array<[string, number, number]> = [["≥0.90", 0.9, 1.01], ["0.70–0.90", 0.7, 0.9], ["<0.70", 0, 0.7]];

async function main() {
  const q = liveRead();
  const endpoint = await describeEndpoint();
  const rows = (await q`SELECT id::text AS id, lane, subject, incumbent, jev_answer, jev_probability, agrees, evidence, jev_model
    FROM jev_observations WHERE binder_id = ${BINDER} ORDER BY id`) as unknown as Row[];
  const FLOOR = 30;
  const report: any = { binder: BINDER, endpoint: endpoint.label, lanes: {} };

  for (const lane of ["kind", "citation"]) {
    const L = rows.filter((r) => r.lane === lane && r.agrees !== null);
    const agree = L.filter((r) => r.agrees).length;
    const bands = BANDS.map(([label, lo, hi]) => {
      // For citation the "confidence" is how far P(true) sits from 0.5, either way.
      const conf = (r: Row) => lane === "citation" ? Math.max(r.jev_probability ?? 0, 1 - (r.jev_probability ?? 0)) : (r.jev_probability ?? 0);
      const b = L.filter((r) => conf(r) >= lo && conf(r) < hi);
      return { band: label, n: b.length, agreement: b.length ? b.filter((r) => r.agrees).length / b.length : null };
    });
    const disagreements = L.filter((r) => !r.agrees);
    const labelled = disagreements.filter((r) => JEV_SHADOW_LABELS[r.id]);
    const jevRight = labelled.filter((r) => JEV_SHADOW_LABELS[r.id].truth === r.jev_answer).length;
    const platformRight = labelled.filter((r) => JEV_SHADOW_LABELS[r.id].truth === r.incumbent).length;
    report.lanes[lane] = {
      n: L.length, agree, agreement: L.length ? agree / L.length : null, bands,
      disagreements: disagreements.length, labelled: labelled.length, jevRight, platformRight,
      specimens: disagreements.slice(0, 40).map((r) => ({ id: r.id, subject: r.subject, platform: r.incumbent, jev: r.jev_answer, p: r.jev_probability, evidence: (r.evidence ?? "").slice(0, 220) })),
      verdict: readiness({ carrying: L.length, population: L.length, floor: FLOOR }),
    };
  }
  // §0 COVERAGE (migration 117): how many of the questions the watch ASKED got an answer at all. Under
  // the Gateway's rate limit (2026-09-25 on) that is not a given, and an agreement figure measured on
  // whatever got through says nothing about the rest. A run that began before the drop ledger existed
  // has no drops recorded BY CONSTRUCTION, so it reads UNMEASURED, never 100%.
  let ledgerSince: string | null = null;
  let drops: Array<{ lane: string; questions: number; reason: string }> = [];
  try {
    const m = (await q`SELECT applied_at FROM schema_migrations WHERE filename = '117_add_jev_watch_drops.sql'`) as unknown as Array<{ applied_at: string }>;
    ledgerSince = m[0]?.applied_at ? new Date(m[0].applied_at).toISOString() : null;
    if (ledgerSince) drops = (await q`SELECT lane, questions, reason FROM jev_watch_drops WHERE binder_id = ${BINDER}`) as unknown as typeof drops;
  } catch { ledgerSince = null; }
  const firstObs = (await q`SELECT min(created_at) AS t FROM jev_observations WHERE binder_id = ${BINDER}`) as unknown as Array<{ t: string | null }>;
  const obsStart = firstObs[0]?.t ? new Date(firstObs[0].t).toISOString() : null;
  report.coverage = {};
  for (const lane of ["kind", "citation"]) {
    const answered = rows.filter((r) => r.lane === lane).length;
    const D = drops.filter((d) => d.lane === lane);
    const dropped = D.reduce((n, d) => n + Number(d.questions), 0);
    const byReason: Record<string, number> = {};
    for (const d of D) byReason[d.reason] = (byReason[d.reason] ?? 0) + Number(d.questions);
    const measured = !!ledgerSince && (!obsStart || obsStart >= ledgerSince);
    report.coverage[lane] = { answered, dropped, byReason, coverage: measured && answered + dropped ? answered / (answered + dropped) : null, measured };
  }
  report.ledgerSince = ledgerSince;
  report.models = [...new Set(rows.map((r) => r.jev_model).filter(Boolean))];
  if (AS_JSON) { console.log(JSON.stringify(report, null, 1)); return; }

  console.log(`audit-jev-agreement — ${scopeLabel(BINDER)} · ${endpoint.label}\n`);
  console.log(formatBanner({
    measuring: "Jev watch-mode answers against the platform's own decisions (kind of a new name; is a citation about its subject)",
    provenance: "observed", source: "jev_observations + jev_watch_drops (written only when JEV_SHADOW=true)",
    carrying: rows.length, population: rows.length, floor: FLOOR,
  }));
  console.log(`  served by: ${report.models.join(", ") || "—"}`);
  console.log(`\n── §0 coverage — questions asked vs answered (drop ledger since ${report.ledgerSince ?? "— not applied"}) ──`);
  for (const lane of ["kind", "citation"]) {
    const c = report.coverage[lane];
    if (!c.measured) { console.log(`  ${lane}: UNMEASURED — ${c.answered} answered; this binder's run began before the drop ledger (migration 117), so what was lost was never recorded`); continue; }
    const reasons = Object.entries(c.byReason).sort((a: any, b: any) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(" · ");
    console.log(`  ${lane}: ${c.answered} answered · ${c.dropped} dropped → ${c.coverage === null ? "—" : `${(100 * c.coverage).toFixed(1)}%`} coverage${reasons ? `  (${reasons})` : ""}`);
  }
  for (const lane of ["kind", "citation"]) {
    const L = report.lanes[lane];
    console.log(`\n── lane: ${lane} — ${L.n} observations ──`);
    if (!L.n) { console.log("  UNMEASURED — no observations (was JEV_SHADOW=true during the run, and was the Gateway key set?)"); continue; }
    console.log(`  §1 agreement: ${L.agree}/${L.n} (${(100 * L.agreement).toFixed(1)}%)${mayConclude(L.verdict) ? "" : `  — ${L.verdict}, below the floor of ${FLOOR}`}`);
    console.log(`  §2 by Jev's own confidence: ${L.bands.map((b: any) => `${b.band}: ${b.n ? `${(100 * b.agreement).toFixed(0)}% of ${b.n}` : "—"}`).join(" · ")}`);
    console.log(`  §3 disagreements: ${L.disagreements} (first ${Math.min(40, L.disagreements)} below — label them in scripts/lib/jev-shadow-labels.ts)`);
    for (const s of L.specimens) console.log(`     #${s.id}  ${s.subject}  platform=${s.platform}  jev=${s.jev} (p=${s.p?.toFixed(2)})  │ ${s.evidence.replace(/\s+/g, " ")}`);
    console.log(L.labelled
      ? `  §4 of ${L.labelled} labelled disagreements: Jev right ${L.jevRight} · platform right ${L.platformRight} · neither ${L.labelled - L.jevRight - L.platformRight}`
      : "  §4 UNMEASURED — no disagreement labelled yet; \"right\" needs a human, and this does not guess");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
