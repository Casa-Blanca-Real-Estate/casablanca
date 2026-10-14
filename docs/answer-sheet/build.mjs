// Builds the Casa Answer Sheet page from questions.json and template.html.
//
//   node docs/answer-sheet/build.mjs <out.html>
//
// Then publish <out.html> to the sheet's URL with the Artifact tool (see README.md).
// questions.json is written by hand; this expands it into the shape the page reads.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) throw new Error('Usage: node docs/answer-sheet/build.mjs <out.html>');

const src = JSON.parse(readFileSync(join(here, 'questions.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const repo = src.repo.replace(/\/+$/, '');
// In the HTML fields, {repo}/path links a file on claude/main and #123 links a PR. Text already inside
// a link is left alone.
const linkText = (h) => h
  .replace(/\{repo\}\/([\w./-]*[\w/-])/g, (_, p) => `<a href="${repo}/blob/claude/main/${p}" target="_blank" rel="noopener"><code>${p}</code></a>`)
  .replace(/(^|[\s(])#(\d{2,4})\b/g, (_, pre, n) => `${pre}<a href="${repo}/pull/${n}" target="_blank" rel="noopener">#${n}</a>`);
const links = (h) => String(h ?? '').split(/(<a\b[^>]*>[\s\S]*?<\/a>)/).map((part, i) => (i % 2 ? part : linkText(part))).join('');

const ids = new Set();
const topics = src.topics.map((t) => ({
  num: t.num,
  title: t.title,
  prefix: t.prefix,
  url: t.url ? t.url.replace('{repo}', `${repo}/blob/claude/main`) : '',
  linkLabel: t.linkLabel || 'Open the source',
  introHtml: links(t.intro),
  settledHtml: t.settled?.length ? `<ul>${t.settled.map((s) => `<li>${links(s)}</li>`).join('')}</ul>` : '',
  extraSections: [],
  questions: t.questions.map((q) => {
    if (ids.has(q.id)) throw new Error(`Duplicate id ${q.id}`);
    if (!q.id.startsWith(`${t.prefix}-`)) throw new Error(`${q.id} isn't under ${t.prefix}`);
    ids.add(q.id);
    const options = (q.options ?? []).map(([key, label, desc = '', isDefault = false]) => ({
      key, label, labelHtml: esc(label), descHtml: links(desc), isDefault,
    }));
    const def = options.find((o) => o.isDefault);
    const defaultText = q.default ?? (def ? def.label : '');
    if (!q.needsYou && !defaultText) throw new Error(`${q.id} has no default and isn't marked needsYou`);
    return {
      id: q.id,
      topic: t.num,
      question: q.q,
      questionHtml: esc(q.q),
      short: q.short ?? q.q,
      quick: !!q.quick,
      defaultShort: defaultText,
      defaultShortHtml: esc(defaultText),
      defaultHtml: links(q.defaultLong ?? esc(defaultText || 'It stays open, and comes back next time.')),
      needsYou: !!q.needsYou,
      contextHtml: links(q.context),
      options,
      sourceHtml: links(q.source ?? ''),
      prefill: '',
      flag: q.flag ?? '',
    };
  }),
}));
for (const r of src.reading) for (const id of r.qids) if (!ids.has(id)) throw new Error(`Reading ${r.id} names unknown ${id}`);
for (const id of src.newIds ?? []) if (!ids.has(id)) throw new Error(`newIds names unknown ${id}`);

const data = {
  topics,
  reading: src.reading.map((r) => ({ id: r.id, date: r.date, qids: r.qids, settledIds: r.settledIds ?? [], html: links(r.html) })),
  prefixes: src.topics.map((t) => t.prefix),
  newIds: src.newIds ?? [],
  sinceHtml: links(src.since),
};
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const page = readFileSync(join(here, 'template.html'), 'utf8').replace('__QDATA__', () => json);
writeFileSync(out, page);
console.log(`${out}: ${ids.size} questions in ${topics.length} topics, ${data.reading.length} reading items, ${page.length} bytes`);
