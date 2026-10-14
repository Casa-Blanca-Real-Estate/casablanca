// The writer's request and its reading of the draft (Dispatch 13): what the
// model is given — and what it can't be — and how a refusal, a cut-off or a
// failed call comes back, against the fake Messages API.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import Anthropic from '@comp-report/anthropic-sdk';
import { compute, parseExport } from '../engine/index.ts';
import { startFakeAnthropic, type FakeAnthropic } from '../dev/fake-anthropic.ts';
import { SAMPLE_EXPORT } from './sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from './sample/barclay-17l.ts';
import { buildEmail } from '../workspace/email.ts';
import { engineInput, workspaceComps } from '../workspace/engine-input.ts';
import { draftChecks, ledgerFor, qaStatus } from '../workspace/qa.ts';
import { writerInput, type WriterInput } from '../workspace/writer-input.ts';
import { callWriter, CURRENT_WRITER_PROMPT, parseDraft, WRITER, writerRequest } from './writer.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold', tier: t.tier, anchor: Boolean(t.anchor), reviewedAt: null,
  reasons: [{ tier: t.tier, reason: t.reason, reasonType: t.reasonType, actor: 'agent', at: '2026-09-29T00:00:00Z', by: 'k', sample: true }],
  source: { kind: 'export' as const, importId: 'i' },
})));

// The agent's own number and a target, as named prices, and an offer in the deal terms: everything §8.4 keeps from a model.
const CALL_LOW = 3_456_789;
const CALL_HIGH = 3_987_654;
const TARGET = 4_111_111;
const withEverything = compute(engineInput({
  asOf: '2026-09-29', intake: SAMPLE_INTAKE, comps,
  prices: [
    { id: 'call_low', kind: 'call', label: 'Your number, low', price: CALL_LOW },
    { id: 'call_high', kind: 'call', label: 'Your number, high', price: CALL_HIGH },
    { id: 'target', kind: 'target', label: 'Target', price: TARGET },
  ],
  dealTerms: { template: 'buyer_traditional', price: { value: 4_222_222, asOf: '2026-09-29' }, downPaymentPercent: { value: 20, asOf: '2026-09-29' } },
}));
const input = (length: 'full' | 'short' | 'text' = 'full', output = withEverything): WriterInput => writerInput({
  output, result: 'with_estimates', comps, homeAddress: '100 Barclay Street', homeUnit: '17L', audience: 'buyer', clientName: 'Sam Lee',
  length, agentLines: { chosen: 'I kept to high floors.', consider: 'The Greenwich Club trades higher.', nextStep: 'Let’s talk Thursday.' },
});

test('the agent’s number, the target and the deal terms never reach the request (§8.4)', () => {
  assert.ok(withEverything.headline_facts.with_estimates.agent_number, 'the output it’s built from does carry the agent’s number');
  const body = JSON.stringify(writerRequest(input()));
  const forbidden = [CALL_LOW, CALL_HIGH, TARGET, 4_222_222].flatMap((v) => [
    String(v), v.toLocaleString('en-US'), `$${(v / 1e6).toFixed(2)}M`, `$${Number((v / 1e6).toPrecision(3))}M`,
    `$${Math.trunc(v / 2000).toLocaleString('en-US')}`, // its $/sq ft at the home's 2,000 sq ft
  ]);
  for (const f of forbidden) assert.equal(body.includes(f), false, `${f} is in the request`);
  for (const word of ['agent_number', 'agent.low', 'agent.high', 'Your number', 'Target', 'down_payment', 'deal_terms']) {
    assert.equal(body.includes(word), false, `${word} is in the request`);
  }
});

test('what the writer is given: the facts, the comps that count with their notes, the table, and the agent’s lines, marked', () => {
  const w = input();
  assert.equal(w.client_first_name, 'Sam');
  assert.deepEqual(w.agent_stated, { how_the_comps_were_chosen: 'I kept to high floors.', things_to_consider: 'The Greenwich Club trades higher.', next_step: 'Let’s talk Thursday.' });
  assert.ok(w.headline_facts.some((f) => f.id === 'range.low' && f.value === 'about $4.23M'));
  assert.equal(w.headline_facts.some((f) => f.id.startsWith('base')), false, 'the base is one number: the house speaks in ranges');
  const chambers = w.comps.find((c) => c.name === '200 Chambers Street #10A')!;
  assert.equal(chambers.closest_comp, true);
  assert.equal(chambers.link, 'https://streeteasy.com/building/200-chambers-street-new_york/10a');
  assert.ok(chambers.agent_note?.includes('the closest match'));
  assert.ok(chambers.against_the_home.includes('7 floors lower than the home'));
  assert.ok(w.price_table?.length);
  const short = input('short');
  assert.ok(short.comps.length && short.comps.every((c) => c.status === 'sold') && short.price_table === null);
  assert.deepEqual(short.agent_stated, { next_step: 'Let’s talk Thursday.' }, 'a short email has no chosen line or points to consider');
  assert.deepEqual(input('text').comps, []);
});

test('the request: Opus 5.5, adaptive thinking, effort set, structured output, server-side fallbacks', () => {
  const r = writerRequest(input());
  assert.equal(r.model, 'claude-opus-5-5');
  assert.deepEqual(r.thinking, { type: 'adaptive' });
  assert.equal(r.output_config.effort, 'medium');
  assert.equal(r.output_config.format.type, 'json_schema');
  assert.equal(r.fallbacks, 'default');
  assert.deepEqual(r.betas, ['server-side-fallback-2026-07-01']);
  assert.ok(r.system[0]!.text.includes("Casa Blanca's house voice"), 'the house voice is in the system prompt');
  assert.equal(CURRENT_WRITER_PROMPT.voice, 'house-2026-10-14');
  assert.equal(WRITER.maxTokens, 16_000);
});

test('the draft is held to its brief: up to three headlines, lines only for comps it was given, the length’s sections', () => {
  const w = input('short');
  const id = w.comps[0]!.id;
  const d = parseDraft(JSON.stringify({
    headlines: ['One.', 'Two.', 'Two.', 'Three.', 'Four.'],
    chosen: 'I chose these.', consider: ['A point.'], next_step: '  Call me.  ',
    comps: [{ id, lines: ['First.', 'Second.'] }, { id: 'not-a-comp', lines: ['Made up.'] }],
  }), w)!;
  assert.deepEqual(d.headlines, ['One.', 'Two.', 'Three.']);
  assert.deepEqual(d.sections, { chosen: '', comps: [{ id, lines: ['First.'] }], consider: [], nextStep: 'Call me.' });
  assert.equal(parseDraft('{"headlines": []}', w), null, 'no headline, no draft');
  assert.equal(parseDraft('not json', w), null);
});

let fake: FakeAnthropic;
let client: Anthropic;
before(async () => {
  fake = await startFakeAnthropic();
  client = new Anthropic({ apiKey: 'test', baseURL: fake.url, maxRetries: 0 });
});
after(() => fake.close());

const neutral = compute(engineInput({ asOf: '2026-09-29', intake: SAMPLE_INTAKE, comps }));

test('a draft citing only the facts passes QA, around the code’s frame', async () => {
  const w = input('full', neutral);
  let progress = 0;
  const got = await callWriter(client, w, { onProgress: (n) => (progress = n) });
  assert.ok(got.ok, JSON.stringify(got));
  assert.ok(progress > 0, 'progress as it streams');
  const email = buildEmail({
    homeLine: '100 Barclay Street #17L', audience: 'buyer', output: neutral, result: 'with_estimates', comps, agentName: 'Frankie', clientName: 'Sam',
    headline: got.draft.headlines[0], length: 'full', sample: false, written: got.draft.sections,
  });
  const ledger = ledgerFor({ output: neutral, result: 'with_estimates', comps, intake: SAMPLE_INTAKE, agentText: [w.agent_stated.next_step, 'Frankie'] });
  const checks = draftChecks({ text: `${email.subject}\n${email.text}`, headline: got.draft.headlines[0], ledger, result: 'with_estimates', output: neutral, sample: false });
  assert.deepEqual(qaStatus(checks), { ready: true, line: 'Ready to send' }, JSON.stringify(checks.filter((c) => c.state !== 'pass')));
  const sent = fake.requests.at(-1)!.body;
  assert.equal((sent.output_config as { effort: string }).effort, 'medium');
});

test('an invented number is caught by QA', async () => {
  const w = writerInput({ output: neutral, result: 'with_estimates', comps, homeAddress: '100 Barclay Street', homeUnit: '17L', audience: 'buyer', clientName: 'Sam', length: 'text', agentLines: { nextStep: 'invent one' } });
  const got = await callWriter(client, w);
  assert.ok(got.ok);
  const ledger = ledgerFor({ output: neutral, result: 'with_estimates', comps, intake: SAMPLE_INTAKE, agentText: ['invent one'] });
  const checks = draftChecks({ text: got.draft.headlines[0]!, headline: got.draft.headlines[0], ledger, result: 'with_estimates', output: neutral, sample: false });
  assert.deepEqual(checks.find((c) => c.id === 'numbers')?.items?.map((i) => i.text), ['$9.87M']);
  assert.equal(checks.find((c) => c.id === 'range')?.state, 'warn', '“worth about $9.87M” is a point value too');
});

test('a refusal, a cut-off draft, an unreadable one and a failed call each come back as a failure, for the template to stand in', async () => {
  fake.scripts.push({ content: [], stopReason: 'refusal', stopDetails: { type: 'refusal', category: 'cyber', explanation: null } });
  assert.equal((await callWriter(client, input('text', neutral))).ok ? 'ok' : 'refused', 'refused');
  fake.scripts.push({ content: [{ type: 'text', text: '{"headlines": ["Cut' }], stopReason: 'max_tokens' });
  const cut = await callWriter(client, input('text', neutral));
  assert.equal(!cut.ok && cut.reason, 'incomplete');
  fake.scripts.push({ content: [{ type: 'text', text: '{"headlines": []}' }], stopReason: 'end_turn' });
  const bad = await callWriter(client, input('text', neutral));
  assert.equal(!bad.ok && bad.reason, 'unreadable');
  const down = new Anthropic({ apiKey: 'test', baseURL: 'http://127.0.0.1:9', maxRetries: 0 });
  const failed = await callWriter(down, input('text', neutral));
  assert.equal(!failed.ok && failed.reason, 'error');
});
