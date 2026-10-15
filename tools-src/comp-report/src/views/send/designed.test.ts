// The Designed email (Dispatch 14): the Full draft's plain text, read back and
// laid out as the branded email, with the engine's figures beside its words.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport } from '../../../engine/index.ts';
import { SAMPLE_EXPORT } from '../../../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../../../server/sample/barclay-17l.ts';
import { addressOf, buildEmail, countedComps, type EmailInput } from '../../../workspace/email.ts';
import { engineInput, workspaceComps } from '../../../workspace/engine-input.ts';
import { DISCLAIMER, HEADLINE_PLACEHOLDER, SAMPLE_BANNER } from '../../../workspace/frame.ts';
import { designedComps, designedHtml, parseEmailText, sameStreet, type DesignedInput } from './designed.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold', tier: t.tier, anchor: Boolean(t.anchor), reviewedAt: null,
  reasons: [{ tier: t.tier, reason: t.reason, reasonType: t.reasonType, actor: 'agent', at: '2026-09-29T00:00:00Z', by: 'k', sample: true }],
  source: { kind: 'export' as const, importId: 'i' },
})));
const output = compute(engineInput({ asOf: '2026-09-29', intake: SAMPLE_INTAKE, comps }));
const result = 'with_estimates' as const;
const HEADLINE = 'The closest sales support listing 17L between $4.23M and $4.92M.';
const base: EmailInput = {
  homeLine: '100 Barclay Street #17L', audience: 'seller', output, result, comps, agentName: 'Kimani', clientName: 'Jordan and Sam',
  headline: HEADLINE, chosen: 'I focused on full-service condos close in size and floor.', consider: 'Newer towers nearby trade higher.',
  nextStep: 'List in October near the top of what the sales support.', length: 'full', sample: false,
};
const rows = countedComps(output, result, comps);

test('the template’s Full email reads back into its parts', () => {
  const text = buildEmail(base).text;
  const p = parseEmailText(text, HEADLINE);
  assert.equal(p.greeting, 'Hi Jordan and Sam,');
  assert.equal(p.headline, HEADLINE);
  assert.deepEqual(p.intro, ['The home’s interior size is our estimate.', 'I focused on full-service condos close in size and floor.']);
  assert.equal(p.comps.length, rows.length);
  assert.ok(p.comps.every((c) => rows.some((r) => addressOf(r.comp) === c.name)), 'every comp line names a counted comp');
  assert.deepEqual(p.consider, ['Newer towers nearby trade higher.']);
  assert.equal(p.table.length, output.results[result].price_table!.rows.length);
  assert.deepEqual(p.outro, ['List in October near the top of what the sales support.']);
  assert.equal(p.signOff, 'Kimani');
  assert.equal(p.disclaimer, DISCLAIMER);
  assert.equal(p.sample, false);
});

test('the writer’s points, a sample banner, and an edited headline still read back', () => {
  const written = { chosen: 'Close in size.', comps: [], consider: ['First point.', 'Second point.'], nextStep: 'Next.' };
  const text = buildEmail({ ...base, sample: true, written }).text.replace(HEADLINE, 'My own headline, edited in the body.');
  const p = parseEmailText(text, HEADLINE);
  assert.equal(p.sample, true);
  assert.equal(p.headline, 'My own headline, edited in the body.', 'the paragraph after the greeting');
  assert.deepEqual(p.consider, ['First point.', 'Second point.']);
  assert.ok(!p.intro.includes(SAMPLE_BANNER));
});

test('the designed comps follow the edited text: the anchor first, a comp taken out stays out, a note as edited', () => {
  const text = buildEmail(base).text;
  const p = parseEmailText(text, HEADLINE);
  const anchorRow = rows.find((r) => r.comp.judgment?.anchor)!;
  const other = rows.find((r) => r !== anchorRow)!;
  const anchorName = addressOf(anchorRow.comp);
  const all = designedComps(rows, { parsed: p, homeStreet: '100 Barclay Street', sf: true });
  assert.equal(all.anchor?.name, anchorName);
  assert.equal(all.others.length, rows.length - 1);
  assert.match(all.anchor!.sub, /^Sold [A-Z][a-z]{2} \d{4}( · (Floor \d+|Same building))?( · [\d,]+ sq ft)?$/);
  assert.match(all.anchor!.price, /^\$\d(\.\d+)?M$/);

  // The agent takes one comp's line out and rewrites the anchor's note.
  const lines = text.split('\n');
  let dropping = false;
  const edited = lines
    .filter((l) => {
      if (l.startsWith(`- ${addressOf(other.comp)} —`)) return !(dropping = true);
      if (dropping && l.startsWith('  ')) return false;
      dropping = false;
      return true;
    })
    .map((l, i, arr) => (arr[i - 1]?.startsWith(`- ${anchorName} —`) && l.startsWith('  ') ? '  Closest in every way.' : l))
    .join('\n');
  const q = designedComps(rows, { parsed: parseEmailText(edited, HEADLINE), homeStreet: '100 Barclay Street', sf: false });
  assert.equal(q.others.length, rows.length - 2);
  assert.ok(!q.others.some((c) => c.name === addressOf(other.comp)));
  assert.equal(q.anchor?.note, 'Closest in every way.');
  assert.ok(!/sq ft/.test(q.anchor!.sub), 'no size without the home’s size');
});

test('one building, however the street is written', () => {
  assert.equal(sameStreet('100 Barclay Street', '100 Barclay St.'), true);
  assert.equal(sameStreet('100 Barclay Street, New York', '100 barclay st'), true);
  assert.equal(sameStreet('200 Chambers Street', '100 Barclay Street'), false);
  assert.equal(sameStreet(null, '100 Barclay Street'), false);
});

test('the HTML: the hosted wordmark, the range, the words, the comps, the disclaimer; escaped; no per-SF line without a size', () => {
  const p = parseEmailText(buildEmail(base).text, HEADLINE);
  const { anchor, others } = designedComps(rows, { parsed: p, homeStreet: '100 Barclay Street', sf: false });
  const input: DesignedInput = {
    origin: 'https://casa.example', preparedFor: 'Jordan & Sam', month: 'October 2026', title: '100 Barclay Street #17L',
    sub: '3 bd · 3 ba · Floor 17', eyebrow: 'What the sales support', range: '$4.23M – $4.92M', perSqft: null, email: p, anchor, others,
    agent: { name: 'Kimani', office: 'Casa Blanca · 10 Hubert St, Tribeca', email: 'kimani@casa-blanca.com' }, cta: 'Talk it through',
    subject: '100 Barclay Street #17L: what the comps say',
  };
  const html = designedHtml(input);
  assert.ok(html.includes('src="https://casa.example/assets/brand/casa-blanca-wordmark-white.png"'));
  assert.ok(html.includes('max-width:600px'));
  assert.ok(html.includes('Prepared for Jordan &amp; Sam · October 2026'));
  assert.ok(html.includes('$4.23M – $4.92M'));
  assert.ok(html.includes(HEADLINE));
  assert.ok(html.includes('The closest match') && html.includes('Other comps'));
  assert.ok(html.includes(anchor!.name));
  assert.ok(html.includes(DISCLAIMER));
  assert.ok(html.includes('href="mailto:kimani@casa-blanca.com?subject='));
  assert.ok(!html.includes('a square foot'), 'no per-SF line');
  assert.ok(!html.includes(HEADLINE_PLACEHOLDER));
  const withSf = designedHtml({ ...input, perSqft: '$2,112 – $2,457 a square foot' });
  assert.ok(withSf.includes('$2,112 – $2,457 a square foot'));
  const hostile = designedHtml({ ...input, email: { ...p, intro: ['<script>alert(1)</script>'] } });
  assert.ok(!hostile.includes('<script>') && hostile.includes('&lt;script&gt;'));
});
