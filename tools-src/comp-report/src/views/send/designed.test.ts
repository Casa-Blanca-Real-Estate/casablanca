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
import { designedComps, designedHtml, emailHtml, parseEmailText, sameStreet, type DesignedInput } from './designed.ts';

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
  // A name that ends in a period ("Kimani C.", from the roster) is the sign-off when it's the signer's, not a last sentence.
  const initial = buildEmail({ ...base, agentName: 'Kimani C.' }).text;
  assert.equal(parseEmailText(initial, HEADLINE, 'Kimani C.').signOff, 'Kimani C.');
  assert.equal(parseEmailText(initial, HEADLINE).signOff, null);
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

test('the designed comps follow the edited text: the anchor first, a comp taken out stays out, no paragraph without the client’s', () => {
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
  assert.equal(q.anchor?.paragraph, null, 'an edited Full note isn’t the client’s paragraph (Dispatch 26)');
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

const designedInput = (over: Partial<DesignedInput> = {}): DesignedInput => {
  const p = parseEmailText(buildEmail(base).text, HEADLINE);
  const { anchor, others } = designedComps(rows, { parsed: p, homeStreet: '100 Barclay Street', sf: false });
  return {
    origin: 'https://casa.example', preparedFor: 'Jordan and Sam', month: 'October 2026', title: '100 Barclay Street #17L',
    sub: '3 bd · 3 ba · Floor 17', eyebrow: 'What the sales support', range: '$4.23M – $4.92M', perSqft: null, email: p, anchor, others,
    agent: { name: 'Kimani', office: 'Casa Blanca · 10 Hubert St, Tribeca', email: 'kimani@casa-blanca.com' }, cta: 'Talk it through',
    subject: '100 Barclay Street #17L: what the comps say', ...over,
  };
};

test('Designed pastes centred, upright and dark: the wrapper, every cell’s style, the quiet anchors (NW-080, 081, 082)', () => {
  const html = designedHtml(designedInput({ titleUrl: 'https://streeteasy.com/building/100-barclay/17l' }));
  // Centred by its own markup: an outer full-width table, the email centred in it.
  assert.match(html, /^<table role="presentation" width="100%"[^>]*><tr><td align="center"/);
  assert.match(html, /<table role="presentation" align="center" width="600"[^>]*style="[^"]*max-width:600px;margin:0 auto;/);
  assert.ok(html.trimEnd().endsWith('</table>\n</td></tr></table>'));
  // Every cell carries the cell style: upright, regular, a colour, set left (or right, where it's a price).
  const cells = [...html.matchAll(/<td\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(cells.length > 10);
  for (const td of cells) {
    assert.match(td, /style="[^"]*font-style:normal;font-weight:normal;color:#0f0f0f;text-align:left;/, td);
  }
  assert.ok(!html.includes('Object Sans'), 'an email-safe font stack');
  assert.ok(!/font-weight:800/.test(html), 'bold, not 800');
  assert.ok(!/italic|<em\b|<i\b/.test(html));
  // The title and the sub line in dark anchors to the home's page; a comp without a page in an anchor with no href.
  assert.ok(html.includes('<a href="https://streeteasy.com/building/100-barclay/17l" style="font-size:30px;font-weight:bold;color:#0f0f0f;text-decoration:none;">100 Barclay Street #17L</a>'));
  assert.ok(html.includes('color:#888680;color:#0f0f0f;text-decoration:none;">3 bd · 3 ba · Floor 17</a>') || html.includes('>3 bd · 3 ba · Floor 17</a>'));
  const noPages = designedInput();
  const bare = designedHtml({ ...noPages, others: noPages.others.map((c) => ({ ...c, url: null })) });
  assert.ok(bare.includes(`<a style="font-size:22px;font-weight:bold;color:#0f0f0f;text-decoration:none;">${noPages.others[0]!.name}</a>`), 'no page: an anchor with no href');
  assert.ok(bare.includes('<a style="font-size:30px;font-weight:bold;color:#0f0f0f;text-decoration:none;">100 Barclay Street #17L</a>'));
});

/** The text a browser shows for some HTML: tags out, entities back. */
const shownText = (html: string) => html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('an edited Full copies formatted: the headline bold, the status headings, bullets, “StreetEasy” links, no raw URL (NW-084 a)', () => {
  const text = buildEmail(base).text;
  const edited = text.replace('I focused on full-service condos close in size and floor.', 'I focused on full-service condos close in size. See https://streeteasy.com/building/x/1.')
    .replace('Newer towers nearby trade higher.', 'Newer towers nearby trade higher.\n- And carrying costs are lower here.');
  const before = edited;
  const html = emailHtml(edited, HEADLINE);
  assert.equal(edited, before, 'the plain text, which QA reads, is untouched');
  assert.match(html, new RegExp(`<p style="[^"]*font-size:17px;font-weight:bold;[^"]*">${HEADLINE.replace(/[.$]/g, '\\$&')}</p>`), 'the headline bold');
  assert.match(html, /<p style="[^"]*font-weight:bold;[^"]*">SOLD<\/p>/, 'a status heading bold');
  assert.match(html, /<p style="[^"]*font-weight:bold;[^"]*">THINGS TO CONSIDER<\/p>/);
  assert.match(html, /<ul style="[^"]*"><li style="[^"]*"><strong[^>]*>200 Chambers Street #10A<\/strong> — sold for/, 'comps as bullets, names bold');
  assert.ok(html.includes('>StreetEasy</a>'), 'links labelled StreetEasy');
  assert.ok(html.includes('<a href="https://streeteasy.com/building/x/1"'), 'a link in the prose too, without its full stop');
  assert.ok(!/>https?:\/\//.test(html), 'no raw URL as link text');
  assert.ok(html.includes('<li style="font-family:\'Helvetica Neue\', Helvetica, Arial, sans-serif;font-style:normal;font-weight:normal;color:#0f0f0f;margin:0 0 6px;">And carrying costs are lower here.</li>'), 'an added bullet');
  assert.ok(html.includes('Closest') || html.includes('closest'), 'notes kept');
  assert.ok(!/italic|Object Sans|font-weight:800/.test(html));
  // Everything the agent wrote is still there, as words.
  const words = shownText(html);
  for (const line of edited.split('\n').map((l) => l.trim().replace(/^- /, '')).filter(Boolean)) {
    for (const part of line.split(/ — https:\/\/\S+| ?https:\/\/\S+?(?=\.?$)/)) {
      if (part.trim()) assert.ok(words.includes(part.trim().split(' — ')[0]!), `kept: ${part}`);
    }
  }
});

test('an edited Short copies formatted too', () => {
  const text = buildEmail({ ...base, length: 'short' }).text.replace(HEADLINE, 'My own headline, edited.');
  const html = emailHtml(text, HEADLINE);
  assert.match(html, /font-size:17px;font-weight:bold;[^"]*">My own headline, edited\.<\/p>/, 'the first paragraph after the greeting is the headline');
  assert.match(html, />SOLD<\/p>/);
  assert.ok(html.includes('<ul') && html.includes('>StreetEasy</a>'));
  assert.ok(!/>https?:\/\//.test(html));
});

test('escaping: markup typed anywhere arrives as text in Designed, Full and Short, and only https links become anchors', () => {
  const evil = ['<img src=x onerror=1>', '"><script>alert(1)</script>', 'Tom &amp; Jerry', 'javascript:alert(1)'];
  const all = evil.join(' ');
  const hostileComps = comps.map((c, i) => (i === 0 ? {
    ...c,
    record: { ...c.record, identity: { ...c.record.identity, address: { ...c.record.identity.address, street: `${evil[0]} Street` } } },
    judgment: c.judgment ? { ...c.judgment, note: `Note ${all}`, tags: [`tag ${evil[1]}`] } : c.judgment,
  } : c)) as typeof comps;
  const evilRow = countedComps(output, result, hostileComps).find((r) => r.comp.id === hostileComps[0]!.id);
  assert.ok(evilRow, 'the planted comp is one the email lists');
  const input: EmailInput = { ...base, comps: hostileComps, homeLine: `100 Barclay ${evil[0]}`, clientName: `Jordan ${evil[1]}`, chosen: `Chosen ${all}`, nextStep: `Next javascript:alert(1) http://streeteasy.com/plain ${evil[2]}` };
  const checkText = (html: string, label: string) => {
    assert.ok(!/<img src=x|<script|onerror=1>/.test(html.replace(/&lt;img src=x onerror=1&gt;/g, '')), `${label}: no tag`);
    assert.ok(html.includes('&lt;img src=x onerror=1&gt;'), `${label}: the img as text`);
    assert.ok(html.includes('&quot;&gt;&lt;script&gt;'), `${label}: the script as text`);
    assert.ok(html.includes('Tom &amp;amp; Jerry'), `${label}: an &amp; as typed`);
    for (const m of html.matchAll(/href="([^"]*)"/g)) assert.match(m[1]!, /^(https:|mailto:)/, `${label}: ${m[1]}`);
    assert.ok(!html.includes('href="http://') && !html.includes('href="javascript'), `${label}: no non-https link`);
  };
  for (const length of ['full', 'short'] as const) {
    const { text } = buildEmail({ ...input, length });
    const html = emailHtml(`${text}\n\n- ${evil[1]} — a line — javascript:alert(1)\n- Tags: tag ${evil[1]}`, HEADLINE);
    checkText(html, length);
    if (evilRow!.status === 'sold' || length === 'full') assert.ok(html.includes('&lt;img src=x onerror=1&gt; Street'), `${length}: the comp's name as text`);
    if (length === 'full') assert.ok(html.includes('Note &lt;img src=x onerror=1&gt;'), 'full: the note as text');
  }
  const full = buildEmail(input);
  const parsedFull = parseEmailText(full.text, HEADLINE);
  const shown = designedComps(countedComps(output, result, hostileComps), { parsed: parsedFull, homeStreet: '100 Barclay Street', sf: false });
  const html = designedHtml({
    ...designedInput(), title: input.homeLine, preparedFor: input.clientName!, email: parsedFull, ...shown,
    subject: `Subject ${all}`, titleUrl: 'javascript:alert(1)',
    others: shown.others.map((c, i) => (i === 0 ? { ...c, url: 'http://streeteasy.com/x', name: `${evil[1]} ${c.name}` } : c)),
  });
  checkText(html.replace(/href="mailto:[^"]*"/, ''), 'designed');
  assert.ok(html.includes('&lt;img src=x onerror=1&gt; Street'), 'designed: the comp’s name as text');
  assert.ok(html.includes('Prepared for Jordan &quot;&gt;&lt;script&gt;'), 'designed: the client’s name as text');
  assert.ok(html.includes('subject=Subject%20%3Cimg'), 'the subject, encoded in the mailto');
  assert.ok(!html.includes('<a href="javascript') && !html.includes('href="http://streeteasy.com/x"'), 'a non-https page links nowhere');
});

// ─── Dispatch 26: a box per comp, with photos and the client's paragraph ─────

const PHOTO = 'https://photos.zillowstatic.com/fp/abc-se_large_800_400.jpg';
const withLines = comps.map((c, i) => (c.judgment ? {
  ...c,
  judgment: {
    ...c.judgment,
    photos: i % 2 ? [] : [PHOTO],
    ...(i === 0 ? { clientLine: { text: 'Written for Jordan and Sam.', by: 'agent' as const, at: '2026-10-27T00:00:00Z' } } : {}),
  },
} : c)) as typeof comps;
const lineRows = countedComps(output, result, withLines);

test('one box per comp: the anchor first and marked, the address large, the photo or a neutral block, the paragraph or nothing', () => {
  const p = parseEmailText(buildEmail({ ...base, comps: withLines }).text, HEADLINE);
  const shown = designedComps(lineRows, { parsed: p, homeStreet: '100 Barclay Street', sf: true, rate: () => 2112 });
  const html = designedHtml({ ...designedInput(), email: p, ...shown });
  const boxes = html.match(/<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border:/g) ?? [];
  assert.equal(boxes.length, lineRows.length, 'a box for every comp the email lists');
  assert.ok(html.indexOf('The closest match') < html.indexOf(shown.others[0]!.name), 'the anchor’s box first');
  assert.match(html, /border:2px solid #0f0f0f;[^"]*"><tr><td[^>]*><table[^>]*><tr><td[^>]*>The closest match<\/td><td align="right"[^>]*font-size:34px[^>]*>★<\/td>/, 'the anchor marked, its star large in the top right');
  assert.ok(html.includes(`<img src="${PHOTO}"`) && html.includes('width="494" height="330"'), 'the photo, one size for every box');
  const withPhoto = [shown.anchor, ...shown.others].filter((c) => c?.photo).length;
  const hatched = (html.match(/<div style="height:330px;background-color:#eeece7/g) ?? []).length;
  assert.equal(withPhoto + hatched, lineRows.length, 'a comp without a photo keeps the neutral block, the same size');
  assert.ok(html.includes('$2,112 a sq ft'), '$/sq ft where the type shows one');
  const anchorRow = lineRows.find((r) => r.comp.judgment?.anchor)!;
  const own = anchorRow.comp.judgment?.clientLine ? 'Written for Jordan and Sam.' : null;
  if (own) assert.ok(html.includes(own), 'the client’s paragraph');
  const paragraphs = [shown.anchor, ...shown.others].filter((c) => c?.paragraph).length;
  assert.equal(paragraphs, withLines.filter((c) => c.judgment?.clientLine && lineRows.some((r) => r.comp.id === c.id)).length, 'only comps with one have a paragraph');
  assert.ok(!html.includes('Price per square foot'), 'no price table in the Designed email');
  for (const c of shown.others) assert.ok(c.name && html.includes(c.name));
});

test('no $/sq ft on a co-op or a home without a size; the home’s photo fills the header; an off-site photo is never written', () => {
  const p = parseEmailText(buildEmail({ ...base, comps: withLines }).text, HEADLINE);
  const noSf = designedComps(lineRows, { parsed: p, homeStreet: '100 Barclay Street', sf: false, rate: () => 2112 });
  assert.ok([noSf.anchor, ...noSf.others].every((c) => c?.perSqft === null));
  const html = designedHtml({ ...designedInput(), email: p, ...noSf, homePhoto: PHOTO });
  assert.ok(!html.includes('a sq ft'));
  assert.match(html, new RegExp(`<img src="${PHOTO.replace(/[.?]/g, '\\$&')}" alt="100 Barclay Street #17L" width="600" height="240"`));
  const off = designedComps(lineRows, { parsed: p, homeStreet: null, sf: false, photo: () => 'http://evil.example/x.jpg' });
  assert.ok([off.anchor, ...off.others].every((c) => c?.photo === null), 'only an https photo is written');
  const copied = designedComps(lineRows, { parsed: p, homeStreet: null, sf: false, photo: () => 'https://casa.example/api/comp-report/email-photo?k=abc' });
  assert.ok([copied.anchor, ...copied.others].every((c) => c?.photo?.startsWith('https://casa.example/api/comp-report/email-photo')), 'the copies, when given');
});

test('the client’s paragraph wins over the writer’s lines and the Sort note, in Full and Short (Dispatch 26)', () => {
  const anchorRow = lineRows.find((r) => r.comp.judgment?.clientLine)!;
  const written = { chosen: '', comps: lineRows.map((r) => ({ id: r.comp.id, lines: ['The writer’s line.'] })), consider: [], nextStep: '' };
  const full = buildEmail({ ...base, comps: withLines, written }).text;
  const short = buildEmail({ ...base, comps: withLines, written, length: 'short' }).text;
  assert.ok(full.includes('  Written for Jordan and Sam.'));
  if (anchorRow.status === 'sold') assert.ok(short.includes('  Written for Jordan and Sam.'));
  const others = lineRows.filter((r) => r !== anchorRow).length;
  assert.equal(full.split('The writer’s line.').length - 1, others, 'the rest keep the writer’s');
  const noWriter = buildEmail({ ...base, comps: withLines }).text;
  assert.ok(noWriter.includes('  Written for Jordan and Sam.') && !noWriter.includes(`  ${anchorRow.comp.judgment!.reasons.at(-1)!.reason}`), 'over the Sort note too');
});

test('the sign-off: the roster’s headshot (absolute, on this site) and phone, linked to call; the hatched circle without them', () => {
  const html = designedHtml(designedInput({ agent: {
    name: 'Kimani', title: 'Creative Associate', office: 'Casa Blanca · 10 Hubert St, Tribeca', email: 'kimani@casa-blanca.com',
    phone: '(212) 555-0101', photo: '/api/comp-report/email-photo?k=abc',
  } }));
  assert.ok(html.includes('>Creative Associate</div>'), 'the roster’s title under the name');
  assert.ok(html.includes('<img src="https://casa.example/api/comp-report/email-photo?k=abc" alt="Kimani" width="56" height="56"'));
  assert.ok(html.includes('href="tel:+12125550101"') && html.includes('(212) 555-0101'));
  const bare = designedHtml(designedInput());
  assert.ok(!bare.includes('tel:') && !bare.includes('email-photo?k=') && !bare.includes('Creative Associate'));
  assert.match(bare, /width:56px;height:56px;border-radius:50%;background-color:#eeece7/);
  // A phone that isn't a US number shows as typed, linked nowhere; a photo that isn't https or this site isn't loaded.
  const odd = designedHtml(designedInput({ agent: { name: 'K', office: 'o', email: null, phone: 'ext. 12', photo: 'javascript:alert(1)' } }));
  assert.ok(odd.includes('ext. 12') && !odd.includes('tel:') && !odd.includes('javascript:'));
});
