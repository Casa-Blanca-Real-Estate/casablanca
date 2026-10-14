/**
 * Tests for the agent-site build. Zero dependencies — node:test, built in.
 *
 *   node --test agents/
 *
 * Each case stands up a throwaway copy of agents/ in a temp dir, swaps in
 * fixture data, and runs the real build against it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const BASE_AGENT = {
  identity: {
    name: 'Test Agent',
    slug: 'test-agent',
    title: 'Licensed Real Estate Agent',
    licenseNumber: '10401379863',
  },
  contact: { phone: '212-555-0142', email: 'test@casa-blanca.com' },
  profile: {},
  delivery: { status: 'live' },
};

/** Deep merge that treats null as "delete this key". */
function merge(base, patch) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete out[k];
    else if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = merge(out[k], v);
    } else out[k] = v;
  }
  return out;
}

/**
 * Build in a sandbox. `agents` maps a data filename to its JSON object.
 * Returns { ok, stdout, stderr, root }.
 */
function build(agents, { photos = [], seed = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-agents-'));
  const dir = path.join(root, 'agents');
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'guides'), { recursive: true });

  for (const f of ['build.js', 'template.html', 'directory.template.html', 'site.json']) {
    fs.copyFileSync(path.join(HERE, f), path.join(dir, f));
  }
  for (const [name, data] of Object.entries(agents)) {
    fs.writeFileSync(path.join(dir, 'data', `${name}.json`), JSON.stringify(data, null, 2));
  }
  for (const name of photos) fs.writeFileSync(path.join(dir, 'photos', name), 'not-really-a-jpeg');
  for (const [rel, contents] of Object.entries(seed)) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), contents);
  }

  try {
    const stdout = execFileSync(process.execPath, [path.join(dir, 'build.js')], {
      encoding: 'utf8', env: { ...process.env, CB_SITE_ORIGIN: 'https://example.test' },
    });
    return { ok: true, stdout, stderr: '', root, dir };
  } catch (e) {
    return { ok: false, stdout: e.stdout ?? '', stderr: e.stderr ?? '', root, dir };
  }
}

const page = (dir, slug) => fs.readFileSync(path.join(dir, slug, 'index.html'), 'utf8');
const exists = (dir, ...parts) => fs.existsSync(path.join(dir, ...parts));

/* ─── Escaping — the bug this slice exists to kill ──────────────── */

test('an ampersand in a bio is escaped, not emitted raw', () => {
  const r = build({ 'test-agent': merge(BASE_AGENT, { profile: { bio: 'Kaufman & Broad, R&D and <all> of it' } }) });
  assert.ok(r.ok, r.stderr);
  const html = page(r.dir, 'test-agent');
  assert.match(html, /Kaufman &amp; Broad, R&amp;D and &lt;all&gt; of it/);
  assert.doesNotMatch(html, /Kaufman & Broad/);
});

test('markup in agent data cannot inject elements', () => {
  const r = build({
    'test-agent': merge(BASE_AGENT, {
      identity: { name: 'Eve <script>alert(1)</script>' },
      profile: { bio: '"><img src=x onerror=alert(1)>' },
    }),
  });
  assert.ok(r.ok, r.stderr);
  const html = page(r.dir, 'test-agent');
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('a quote in a name cannot break out of an attribute', () => {
  const r = build({
    'test-agent': merge(BASE_AGENT, {
      assets: { photo: 'p.jpg', photoAlt: 'A" onload="alert(1)' },
    }),
  }, { photos: ['p.jpg'] });
  assert.ok(r.ok, r.stderr);
  assert.doesNotMatch(page(r.dir, 'test-agent'), /onload="alert/);
});

test('initials skip punctuation — "Sarah & Leo W." is SL, not S&', () => {
  const r = build({
    'test-agent': merge(BASE_AGENT, {
      profile: { testimonials: [{ quote: 'Great.', author: 'Sarah & Leo W.', source: 'manual', date: '2026-04-02' }] },
    }),
  });
  assert.ok(r.ok, r.stderr);
  const html = page(r.dir, 'test-agent');
  assert.match(html, /testimonial-card__avatar" aria-hidden="true">SL</);
});

/* ─── Validation fails loudly ───────────────────────────────────── */

const rejects = (name, patch, needle, opts) => test(`rejects ${name}`, () => {
  const r = build({ 'test-agent': merge(BASE_AGENT, patch) }, opts);
  assert.equal(r.ok, false, 'build should have failed');
  assert.match(r.stderr, needle);
  assert.equal(exists(r.dir, 'test-agent'), false, 'a failed build must write nothing');
});

rejects('a missing licence number', { identity: { licenseNumber: undefined } }, /identity\.licenseNumber/);
rejects('a malformed licence number', { identity: { licenseNumber: 'NY-123' } }, /identity\.licenseNumber/);
rejects('a malformed email', { contact: { email: 'sam at casa-blanca' } }, /contact\.email/);
rejects('a phone that is not 10 digits', { contact: { phone: '555-0142' } }, /contact\.phone/);
rejects('an Instagram field pointing somewhere else', { contact: { instagram: 'https://example.com/sam' } }, /expected a instagram\.com URL/);
rejects('an unknown status', { delivery: { status: 'published' } }, /delivery\.status/);
rejects('a photo that is not on disk', { assets: { photo: 'nope.jpg', photoAlt: 'x' } }, /nope\.jpg/);
rejects('a photo with no alt text', { assets: { photo: 'p.jpg' } }, /photoAlt/, { photos: ['p.jpg'] });
rejects('a testimonial with no source', { profile: { testimonials: [{ quote: 'q', author: 'a', date: '2026-01-01' }] } }, /source/);
rejects('a testimonial with no date', { profile: { testimonials: [{ quote: 'q', author: 'a', source: 'manual' }] } }, /date/);
rejects('an impossible date', { profile: { testimonials: [{ quote: 'q', author: 'a', source: 'manual', date: '2026-02-30' }] } }, /not a real calendar date/);
rejects('a custom domain with a scheme', { delivery: { customDomain: 'https://samvalk.com' } }, /customDomain/);
rejects('a negative price', { deals: [{ address: '1 Main St', price: -5 }] }, /deals\[0\]\.price/);

test('rejects canonical "custom" before the custom domain exists', () => {
  const r = build({ 'test-agent': merge(BASE_AGENT, { delivery: { canonical: 'custom' } }) });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /never canonical at a domain that does not exist yet/);
});

test('rejects a slug that disagrees with its filename', () => {
  const r = build({ 'someone-else': merge(BASE_AGENT, {}) });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /they must match/);
});

test('reports every problem at once, not just the first', () => {
  const r = build({ 'test-agent': merge(BASE_AGENT, { contact: { email: 'bad', phone: 'bad' } }) });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /contact\.email/);
  assert.match(r.stderr, /contact\.phone/);
});

test('one bad agent blocks the whole build — no half-written directory', () => {
  const r = build({
    'test-agent': BASE_AGENT,
    'broken-agent': merge(BASE_AGENT, { identity: { slug: 'broken-agent' }, contact: { email: 'nope' } }),
  });
  assert.equal(r.ok, false);
  assert.equal(exists(r.dir, 'test-agent'), false);
});

/* ─── Status is honoured ────────────────────────────────────────── */

test('only live agents get a page and a directory card', () => {
  const r = build({
    'test-agent': BASE_AGENT,
    'draft-agent': merge(BASE_AGENT, { identity: { slug: 'draft-agent', name: 'Draft Agent' }, delivery: { status: 'draft' } }),
  });
  assert.ok(r.ok, r.stderr);
  assert.ok(exists(r.dir, 'test-agent', 'index.html'));
  assert.equal(exists(r.dir, 'draft-agent'), false);
  const directory = fs.readFileSync(path.join(r.dir, 'index.html'), 'utf8');
  assert.match(directory, /Test Agent/);
  assert.doesNotMatch(directory, /Draft Agent/);
});

test('a departed agent 301s to the directory, a suspended one 302s', () => {
  const r = build({
    'test-agent': BASE_AGENT,
    'gone-agent': merge(BASE_AGENT, { identity: { slug: 'gone-agent' }, delivery: { status: 'archived', archivedOn: '2026-09-01' } }),
    'paused-agent': merge(BASE_AGENT, { identity: { slug: 'paused-agent' }, delivery: { status: 'suspended' } }),
  });
  assert.ok(r.ok, r.stderr);
  const redirects = fs.readFileSync(path.join(r.root, '_redirects'), 'utf8');
  assert.match(redirects, /\/agents\/gone-agent\/\*\s+\/agents\/\s+301/);
  assert.match(redirects, /\/agents\/paused-agent\/\*\s+\/agents\/\s+302/);
  assert.doesNotMatch(redirects, /test-agent/);
});

test("an agent who leaves has their page swept, and only generated pages are swept", () => {
  const r = build(
    { 'gone-agent': merge(BASE_AGENT, { identity: { slug: 'gone-agent' }, delivery: { status: 'archived', archivedOn: '2026-09-01' } }) },
    {
      seed: {
        'gone-agent/index.html': '<!-- GENERATED BY agents/build.js -->\n<html></html>',
        'handwritten/index.html': '<html>not generated by the build</html>',
      },
    },
  );
  assert.ok(r.ok, r.stderr);
  assert.equal(exists(r.dir, 'gone-agent', 'index.html'), false, 'a departed page must come down');
  assert.ok(exists(r.dir, 'handwritten', 'index.html'), 'the sweep must never touch hand-written pages');
});

/* ─── Photos and the initials fallback ──────────────────────────── */

test('an agent with a photo gets the photo; one without gets initials', () => {
  const r = build({
    'test-agent': merge(BASE_AGENT, { assets: { photo: 'p.jpg', photoAlt: 'Test Agent' } }),
    'bare-agent': merge(BASE_AGENT, { identity: { slug: 'bare-agent', name: 'Bare Agent' } }),
  }, { photos: ['p.jpg'] });
  assert.ok(r.ok, r.stderr);
  assert.match(page(r.dir, 'test-agent'), /<img src="\.\.\/photos\/p\.jpg" alt="Test Agent"/);
  assert.match(page(r.dir, 'bare-agent'), /agent-hero__photo-initials" aria-hidden="true">BA</);
  const directory = fs.readFileSync(path.join(r.dir, 'index.html'), 'utf8');
  assert.match(directory, /<img src="photos\/p\.jpg"/, 'directory cards resolve photos from agents/');
});

/* ─── Delivery URLs ─────────────────────────────────────────────── */

test('a site is canonical at its Casa Blanca URL until the custom domain is chosen', () => {
  const r = build({
    'test-agent': merge(BASE_AGENT, { delivery: { customDomain: 'samvalk.com' } }),
  });
  assert.ok(r.ok, r.stderr);
  assert.match(page(r.dir, 'test-agent'), /<link rel="canonical" href="https:\/\/example\.test\/agents\/test-agent\/" \/>/);
});

test('flipping delivery.canonical moves the canonical to the custom domain', () => {
  const r = build({
    'test-agent': merge(BASE_AGENT, { delivery: { customDomain: 'samvalk.com', canonical: 'custom' } }),
  });
  assert.ok(r.ok, r.stderr);
  assert.match(page(r.dir, 'test-agent'), /<link rel="canonical" href="https:\/\/samvalk\.com\/" \/>/);
});

/* ─── Template contract ─────────────────────────────────────────── */

test('every page carries the licence number', () => {
  const r = build({ 'test-agent': BASE_AGENT });
  assert.ok(r.ok, r.stderr);
  assert.match(page(r.dir, 'test-agent'), /Lic\. #: 10401379863/);
});

test('no page ships with an unreplaced token or a Google Fonts link', () => {
  const r = build({ 'test-agent': BASE_AGENT });
  assert.ok(r.ok, r.stderr);
  for (const html of [page(r.dir, 'test-agent'), fs.readFileSync(path.join(r.dir, 'index.html'), 'utf8')]) {
    assert.doesNotMatch(html, /\{\{/);
    assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
    assert.match(html, /ObjectSans-Regular\.woff2/);
  }
});

test('a template token the build does not supply fails the build', () => {
  const r = build({ 'test-agent': BASE_AGENT }, { seed: { 'template.html': '<p>{{NOT_A_REAL_TOKEN}}</p>' } });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /NOT_A_REAL_TOKEN/);
});

test('rejects a canonicalUrl override that is not an https URL', () => {
  const r = build({ 'test-agent': merge(BASE_AGENT, { seo: { canonicalUrl: 'javascript:alert(1)' } }) });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /seo\.canonicalUrl/);
});

/* ─── The profile-pic roster never reaches a site (Dispatch 12) ─── */
// The roster keeps `pic` and `placements` in the agent store, beside the CMS's
// draft and live. The store's half — Publish never copies them into live — is
// tools-src/agent-pics/boundary.test.ts. This is the build's half.

rejects("the roster's pic group in site data", { pic: { notes: 'reshoot Friday' } }, /pic: belongs to the profile-pic roster/);
rejects("the roster's placements in site data", { placements: { streeteasy: { state: 'done' } } }, /placements: belongs to the profile-pic roster/);
rejects("the roster's raws in site data", { raws: [] }, /raws: belongs to the profile-pic roster/);

test('photo-side fields tucked inside a group are never rendered anywhere the build writes', () => {
  const MARK = 'PICSIDE-7f3a';
  const r = build({
    'test-agent': merge(BASE_AGENT, {
      identity: { pic: { notes: MARK } },
      profile: { placements: { streeteasy: { state: 'done', note: MARK } } },
      assets: { pic: { sigPhotoKey: MARK } },
      delivery: { placements: MARK },
    }),
  });
  assert.ok(r.ok, r.stderr);
  const written = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'data') walk(p); } else written.push(p);
    }
  };
  walk(r.dir);
  written.push(path.join(r.root, '_redirects'));
  assert.ok(written.some((f) => f.endsWith(path.join('test-agent', 'index.html'))), 'the page was built');
  for (const f of written) assert.ok(!fs.readFileSync(f, 'utf8').includes(MARK), `${path.relative(r.root, f)} carries a photo field`);
});

test('the build reads agents/data only: it has no path to the agent store', () => {
  // If the build ever reads the cb-agents store (docs/agent-cms/storage-decision.md §4),
  // replace this with a test that it renders `live` and nothing else.
  const src = fs.readFileSync(path.join(HERE, 'build.js'), 'utf8');
  assert.doesNotMatch(src, /@netlify\/blobs|cb-agents|agent-store|agent-pics/);
});
