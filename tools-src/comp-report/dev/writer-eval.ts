// DEV ONLY — the writer's eval (Dispatch 13, item 8): drafts for two reports,
// printed as Markdown for Kimani to read against Frankie's email.
//
//   1. The 100 Barclay #17L sample, with its own lines for the email.
//   2. Frankie's 111 Fulton #517 (sources/2026-07-29-frankie-…), rebuilt as a
//      report: his comps typed in, his lines on each as the agent's notes,
//      his first line as how he chose them, and his closing as the next step.
//      Where his email doesn't give a comp's size, it's worked back from his
//      own $/sq ft; dates his email doesn't give are approximate (it went out
//      on 2026-07-29). Sizes it can't support are left out.
//
// Each draft goes through the same QA as Send. With CR_EVAL_ANTHROPIC_API_KEY
// set it calls Claude (a few drafts, well under a dollar); without it, it runs
// on the fake Messages API and says so at the top — that proves the plumbing,
// not the voice. Its own variable, not ANTHROPIC_API_KEY: in a Claude Code
// cloud environment that one could be taken up by the session itself.
//
//   CR_EVAL_ANTHROPIC_API_KEY=… node tools-src/comp-report/dev/writer-eval.ts > eval.md
import Anthropic from '@comp-report/anthropic-sdk';
import { compute, parseExport, type EngineOutput, type ResultKind } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_SEND, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { callWriter, CURRENT_WRITER_PROMPT, WRITER } from '../server/writer.ts';
import { usageTotals } from '../server/assistant.ts';
import { buildEmail, type EmailLength } from '../workspace/email.ts';
import { engineInput, workspaceComps, type WorkspaceComp } from '../workspace/engine-input.ts';
import { draftChecks, ledgerFor, qaStatus } from '../workspace/qa.ts';
import type { Brief, CompJudgment, Intake, SendState } from '../workspace/state.ts';
import { writerInputFrom } from '../workspace/writer-input.ts';
import { startFakeAnthropic } from './fake-anthropic.ts';

const e = <T>(value: T, asOf = '2026-07-29') => ({ value, asOf });

interface Case {
  name: string;
  homeLine: string;
  asOf: string;
  output: EngineOutput;
  comps: WorkspaceComp[];
  intake: Intake;
  brief: Brief;
  send: SendState;
  agentName: string;
  runs: EmailLength[];
}

function barclay(): Case {
  const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
  const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
    reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold' as const, tier: t.tier, anchor: Boolean(t.anchor), reviewedAt: null,
    reasons: [{ tier: t.tier, reason: t.reason, reasonType: t.reasonType, actor: 'agent', at: '2026-09-29T00:00:00Z', by: 'k', sample: true }],
    source: { kind: 'export' as const, importId: 'i' },
  })));
  const asOf = '2026-09-29';
  return {
    name: '100 Barclay Street #17L (the sample)', homeLine: '100 Barclay Street #17L', asOf,
    output: compute(engineInput({ asOf, intake: SAMPLE_INTAKE, comps })), comps, intake: SAMPLE_INTAKE,
    brief: { audience: e('buyer' as const, asOf), clientName: e('Jordan', asOf) }, send: SAMPLE_SEND, agentName: 'Hannah', runs: ['full', 'text'],
  };
}

/** One of Frankie's comps, typed in, with his lines as the agent's note. */
function typed(id: string, tier: 'primary' | 'secondary', status: 'sold' | 'in_contract' | 'active' | 'off_market', fields: Record<string, string | number>, note: string): CompJudgment {
  return {
    reportCompId: id, propertyKey: id, evidenceClass: status, tier, anchor: false, reviewedAt: '2026-07-29T12:00:00Z',
    reasons: [{ tier, reason: note, reasonType: 'property', actor: 'agent', at: '2026-07-29T12:00:00Z', by: 'f.delessio@casa-blanca.com', sample: false }],
    source: { kind: 'manual', asOf: '2026-07-29', fields: { status, ...fields } },
  };
}

function fulton517(): Case {
  const asOf = '2026-07-29';
  const judgments: CompJudgment[] = [
    typed('j1', 'primary', 'sold', { address: '80 John Street, New York, NY', unit: '#2A', price: 695000, area_sqft: 674, floor: 2, date: '2026-06-15' }, '50 sq ft smaller, sold at $1,031 a sq ft'),
    typed('j2', 'primary', 'sold', { address: '20 Pine Street, New York, NY', unit: '#715', price: 660000, floor: 7, date: '2026-05-20' }, 'Took 175 days to get a deal. Bigger unit, may be interior facing with no light. Slightly higher carrying costs'),
    typed('j3', 'primary', 'sold', { address: '20 Pine Street, New York, NY', unit: '#712', price: 740000, area_sqft: 779, floor: 7, date: '2026-04-10' }, 'On the 7th floor, lasted 49 days on the market. Similar layout, bigger apartment, the building has similar amenities. Sold at $950 a sq ft'),
    typed('j4', 'primary', 'sold', { address: '88 Greenwich Street, New York, NY', unit: '#602', price: 740000, area_sqft: 735, floor: 6, date: '2025-11-05' }, 'Sold last year after 59 days, at $1,006 a sq ft. Similar size'),
    typed('j5', 'primary', 'in_contract', { address: '111 Fulton Street, New York, NY', unit: '#315', price: 715000, floor: 3, date: '2026-07-10' }, 'The best comps are in the building. Same layout, lower floor, took 41 days to get a deal. The deal could be at asking or slightly below'),
    typed('j6', 'primary', 'active', { address: '20 Pine Street, New York, NY', unit: '#617', price: 725000, floor: 6, date: '2026-05-04' }, 'Larger unit, similar amenities in the building. Been on the market for 86 days, higher carrying costs'),
    typed('j7', 'secondary', 'sold', { address: '56 Pine Street, New York, NY', unit: '#8B', price: 580000, floor: 8, date: '2026-03-12' }, 'Would be a better comp if it didn’t face the inner courtyard'),
    typed('j8', 'secondary', 'sold', { address: '88 Greenwich Street, New York, NY', unit: '#516', price: 707500, area_sqft: 615, floor: 5, date: '2026-02-18' }, 'Also on the 5th floor, $1,150 a sq ft. Over 100 sq ft smaller'),
    typed('j9', 'secondary', 'sold', { address: '88 Greenwich Street, New York, NY', unit: '#519', price: 510000, floor: 5, date: '2026-01-22' }, 'Over 200 sq ft smaller'),
    typed('j10', 'secondary', 'sold', { address: '99 John Street, New York, NY', unit: '#612', price: 620000, area_sqft: 581, floor: 6, date: '2026-05-28' }, '581 sq ft, lower carrying costs. Same layout'),
    typed('j11', 'primary', 'off_market', { address: '111 Fulton Street, New York, NY', unit: '#309', price: 625000, floor: 3, date: '2026-01-15' }, 'In the building, a similar size: on the market in 12/25 for $625K and never sold'),
    typed('j12', 'primary', 'off_market', { address: '111 Fulton Street, New York, NY', unit: '#716', price: 635000, floor: 7, date: '2026-03-01' }, 'In the building, a similar size: on the market for $635K and never sold either'),
  ];
  const comps = workspaceComps([], judgments);
  const intake: Intake = {
    address: e('111 Fulton Street, New York, NY'), unit: e('#517'), areaSqft: e(725), floor: e(5), beds: e(1), baths: e(1),
  };
  return {
    name: '111 Fulton Street #517 (Frankie’s, rebuilt)', homeLine: '111 Fulton Street #517', asOf,
    output: compute(engineInput({ asOf, intake, comps })), comps, intake,
    brief: { audience: e('buyer' as const), clientName: e('Leeann') },
    send: {
      chosen: e('I focused on units on lower floors (2nd through 8th), as anything significantly higher wouldn’t be a true comparable, and kept them close in size: units around 550 sq ft or over 800 sq ft wouldn’t be a fair comparison.'),
      consider: e('The Greenwich Club is a similar building that trades higher than 111 Fulton. 56 Pine trades lower than 111 Fulton. Lower carrying costs can motivate sellers to list higher, and higher carrying costs tend to result in lower asking prices.'),
      nextStep: e('Let me know if you have any questions. Feel free to share this with your father. If you put in an offer, I’d ask the seller to take care of the assessment.'),
    },
    agentName: 'Frankie', runs: ['full', 'short'],
  };
}

const key = process.env.CR_EVAL_ANTHROPIC_API_KEY;
const fake = key ? null : await startFakeAnthropic();
const client = new Anthropic({ apiKey: key ?? 'fake', ...(fake ? { baseURL: fake.url } : {}), maxRetries: 1 });
const out: string[] = [];
const say = (...lines: string[]) => out.push(...lines);

say(`# The writer's eval — ${new Date().toISOString().slice(0, 10)}`, '');
say(fake
  ? '> **FAKE RUN.** No `CR_EVAL_ANTHROPIC_API_KEY` here, so these drafts come from the fake Messages API: they prove the plumbing and QA, not the voice.'
  : `> Model \`${WRITER.model}\`, effort \`${WRITER.effort}\`, prompt \`${CURRENT_WRITER_PROMPT.id}\` (house voice \`${CURRENT_WRITER_PROMPT.voice}\`).`, '');

let spent = 0;
for (const c of [barclay(), fulton517()]) {
  const result: ResultKind = c.output.results.on_facts.range ? 'on_facts' : 'with_estimates';
  say(`## ${c.name}`, '', `Result: ${c.output.results[result].label}. Comps that count: ${c.output.comps.filter((x) => x.per_result[result].included).length}.`, '');
  for (const length of c.runs) {
    const input = writerInputFrom({ output: c.output, comps: c.comps, intake: c.intake, brief: c.brief, send: c.send, result, length });
    const started = Date.now();
    const got = await callWriter(client, input);
    say(`### ${length === 'text' ? 'Text message' : `${length[0]!.toUpperCase()}${length.slice(1)} email`}`, '');
    if (!got.ok) {
      say(`**The writer failed (${got.reason}):** ${got.message}`, '');
      continue;
    }
    const totals = got.usage ? usageTotals(got.model, got.usage as Parameters<typeof usageTotals>[1]) : null;
    spent += totals?.costUsd ?? 0;
    say('**Headlines**', '', ...got.draft.headlines.map((h) => `- ${h}`), '');
    const headline = got.draft.headlines[0]!;
    const email = buildEmail({
      homeLine: c.homeLine, audience: c.brief.audience?.value ?? null, output: c.output, result, comps: c.comps, agentName: c.agentName,
      clientName: c.brief.clientName?.value, headline, length, sample: false, written: got.draft.sections,
    });
    const ledger = ledgerFor({
      output: c.output, result, comps: c.comps, intake: c.intake,
      agentText: [c.send.chosen?.value, c.send.consider?.value, c.send.nextStep?.value, c.agentName, ...c.comps.map((x) => x.judgment?.reasons.at(-1)?.reason)],
    });
    const checks = draftChecks({ text: `${email.subject}\n${email.text}`, headline, ledger, result, output: c.output, sample: false });
    const status = qaStatus(checks);
    say(`**The email, with the first headline** — subject: ${email.subject}`, '', '```text', email.text, '```', '');
    say(`**QA:** ${status.line}`, '');
    for (const k of checks.filter((x) => x.state !== 'pass')) {
      say(`- ${k.message}${k.items ? ` — ${k.items.map((i) => `“${i.text}” (${i.context})`).join('; ')}` : ''}`);
    }
    say('', `<sub>${got.model} · ${Math.round((Date.now() - started) / 100) / 10}s${totals ? ` · ${totals.input} in / ${totals.output} out · ~$${totals.costUsd?.toFixed(3) ?? '?'}` : ''}</sub>`, '');
  }
}
say(`Spent about $${spent.toFixed(2)}.`);
console.log(out.join('\n'));
await fake?.close();
