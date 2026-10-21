// The listing read, Dispatch 16 (CR-2.3): the grey line's sale label, the
// photos (kept only through cleanPhotoUrls), and pets and smoke-free from the
// policy tags. Fixtures are hand-written in Firecrawl's shape: a co-op with
// photos, and a page with no grey line.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanListingExtract, cleanPhotoUrls, compRecordFromListing, confirmListingRecord, deriveFromPolicies, MAX_PHOTOS,
  PARSER_VERSION, PHOTO_HOSTS, readSaleKind, type ListingRead,
} from '../index.ts';
import { fixtureText } from './helpers.ts';

const READ_ON = '2026-10-21';
const page = (name: string, url: string | null = null): ListingRead =>
  compRecordFromListing(JSON.parse(fixtureText(`listings/${name}.json`)), { as_of: READ_ON, url });
const base = { address: '1 Test Street', city: 'New York', state: 'NY', status: 'For sale' };
const read = (extra: Record<string, unknown>) => compRecordFromListing({ ...base, ...extra }, { as_of: READ_ON, url: 'https://streeteasy.com/sale/1' });

const Z = 'https://photos.zillowstatic.com/fp';
const COOP_URL = 'https://streeteasy.com/building/301-east-79-street-new_york/12c';

test('the parser version moved for the new fields', () => {
  assert.equal(PARSER_VERSION, '0.5.0');
});

test('the grey line: "Resale" reads as not new development, and the label is kept as shown', () => {
  const { record, warnings } = page('active-coop-photos-301-east-79-12c', COOP_URL);
  assert.deepEqual(warnings, []);
  assert.equal(record.facts.property_type?.value, 'coop');
  assert.equal(record.facts.sale_kind?.value, 'resale');
  assert.equal(record.facts.sale_kind_label?.value, 'Resale');
  assert.equal(record.facts.new_development?.value, false, 'today it was unknown');
  assert.match(record.facts.new_development!.note!, /grey line says "Resale"/);
  assert.equal(record.facts.sponsor_unit, undefined, 'a resale says nothing about a sponsor');
  assert.deepEqual(record.listing?.grey_line, { type: 'Co-op', neighborhood: 'Upper East Side', sale_kind: 'Resale' });
  assert.equal(record.neighborhood, 'Upper East Side');
  assert.equal(record.facts.rooms?.value, 5);
  // Inferred until the agent confirms, like every value read from a page.
  assert.equal(record.facts.sale_kind?.confidence, 'inferred');
  assert.equal(confirmListingRecord(record).facts.sale_kind?.confidence, 'exact');
});

test('the grey line: each sale label maps, "Sponsor Unit" fills sponsor_unit, and an unknown label is kept, never refused', () => {
  const kinds: [string, string][] = [
    ['Resale', 'resale'], ['Sponsor Unit', 'sponsor'], ['New Development', 'new_development'], ['Foreclosure', 'foreclosure'],
    ['Auction Sale', 'auction'], ['Short Sale', 'short_sale'], ['Restricted Sale', 'restricted'], ['Estate sale', 'other'],
  ];
  for (const [label, kind] of kinds) assert.equal(readSaleKind(label), kind, label);
  assert.equal(readSaleKind(''), null);

  const sponsor = read({ sale_kind: 'Sponsor Unit' });
  assert.equal(sponsor.record.facts.sponsor_unit?.value, true);
  assert.equal(sponsor.record.facts.new_development, undefined, 'a sponsor unit may or may not be new development');

  const fresh = read({ sale_kind: 'New Development' });
  assert.equal(fresh.record.facts.new_development?.value, true);

  const odd = read({ sale_kind: 'Estate sale' });
  assert.deepEqual(odd.warnings.filter((w) => w.column === 'sale_kind'), []);
  assert.equal(odd.record.facts.sale_kind?.value, 'other');
  assert.equal(odd.record.facts.sale_kind_label?.value, 'Estate sale');
  assert.match(odd.record.facts.sale_kind!.note!, /kept as shown/);
});

test('the grey line: the page’s own flag stands where the label disagrees, and says so', () => {
  const { record, warnings } = read({ sale_kind: 'Resale', new_development: 'yes' });
  assert.equal(record.facts.new_development?.value, true);
  assert.ok(warnings.some((w) => w.column === 'sale_kind' && /flag stands/.test(w.message)));
});

test('a page with no grey line: no type, neighborhood or sale kind, and nothing guessed', () => {
  const { record } = page('sold-no-grey-line-40-bond-5');
  assert.equal(record.facts.property_type, undefined);
  assert.equal(record.facts.sale_kind, undefined);
  assert.equal(record.facts.new_development, undefined);
  assert.equal(record.neighborhood, null);
  assert.deepEqual(record.listing?.grey_line, { type: null, neighborhood: null, sale_kind: null });
  assert.deepEqual(record.listing?.photos, []);
  assert.equal(record.facts.pets, undefined, 'an empty policy list says nothing about pets');
});

test('photos: hero first, only StreetEasy’s image hosts, junk and other hosts dropped, each once', () => {
  const { record } = page('active-coop-photos-301-east-79-12c');
  assert.deepEqual(record.listing?.photos, [
    `${Z}/a1b2c3d4e5f60718293a4b5c6d7e8f90-se_extra_large_1500_800.webp`,
    `${Z}/0f1e2d3c4b5a69788796a5b4c3d2e1f0-se_extra_large_1500_800.webp`,
    `${Z}/99887766554433221100ffeeddccbbaa-se_extra_large_1500_800.webp`,
  ]);
});

test('cleanPhotoUrls keeps a URL only if it is https, has no userinfo or port, and is on PHOTO_HOSTS', () => {
  const ok = `${Z}/abc-se_large_800_400.webp`;
  assert.deepEqual(PHOTO_HOSTS, ['photos.zillowstatic.com', 'streeteasy.com']);
  assert.deepEqual(cleanPhotoUrls([ok]), [ok]);
  assert.deepEqual(cleanPhotoUrls(['https://cdn-img1.streeteasy.com/nyc/image/12/345.jpg']), ['https://cdn-img1.streeteasy.com/nyc/image/12/345.jpg'], 'a subdomain of a listed host');
  const refused = [
    'http://photos.zillowstatic.com/fp/abc.webp', // not https
    'data:image/png;base64,iVBORw0KGgo=',
    'javascript:alert(1)',
    'https://user@evil.example/x.jpg',
    'https://user@photos.zillowstatic.com/fp/x.jpg', // userinfo, even before a listed host
    'https://photos.zillowstatic.com@evil.example/x.jpg',
    'https://photos.zillowstatic.com:8443/fp/x.jpg', // a port
    'https://streeteasy.com.evil.example/x.jpg', // a lookalike
    'https://evilstreeteasy.com/x.jpg', // a suffix without the dot
    'https://images.example.com/x.jpg', // off the list
    'https://streeteasy.com\\@evil.example/x.jpg',
    'https://photos.zillowstatic.com/fp/x.jpg\nhttps://evil.example',
    `${Z}/streeteasy-logo.png`, // junk
    'https://streeteasy.com/static/icons/heart.svg',
    `${Z}/agent-headshot-1.jpg`,
    '', 42, null,
  ];
  for (const url of refused) assert.deepEqual(cleanPhotoUrls([url]), [], String(url));

  // Nine photos and a duplicate: each once, at most eight, in order.
  const nine = Array.from({ length: 9 }, (_, i) => `${Z}/p${i}-se_large_800_400.webp`);
  const kept = cleanPhotoUrls([nine[0], nine[0], ...nine.slice(1)]);
  assert.equal(MAX_PHOTOS, 8);
  assert.deepEqual(kept, nine.slice(0, 8));
  // A fragment is dropped; the host is lowercased.
  assert.deepEqual(cleanPhotoUrls(['https://Photos.ZillowStatic.com/fp/a.webp#x']), [`${Z}/a.webp`]);
});

test('cleanListingExtract: what the server stores — the hero only if it passes, the photos cleaned, nothing else touched', () => {
  const extract = {
    address: '1 Test Street',
    heroImageUrl: 'https://evil.example/hero.jpg',
    photos: [`${Z}/a.webp`, 'https://evil.example/b.jpg', `${Z}/a.webp`],
  };
  const clean = cleanListingExtract(extract);
  assert.deepEqual(clean, { address: '1 Test Street', photos: [`${Z}/a.webp`] });
  assert.equal(extract.photos.length, 3, 'the input is untouched');
  const hero = cleanListingExtract({ heroImageUrl: `${Z}/h.webp`, photos: [`${Z}/a.webp`, `${Z}/h.webp`] });
  assert.deepEqual(hero, { heroImageUrl: `${Z}/h.webp`, photos: [`${Z}/h.webp`, `${Z}/a.webp`] });
  assert.deepEqual(cleanListingExtract({ address: 'x' }), { address: 'x' }, 'a read without photos stays without');
});

test('pets and smoke-free from the policy tags: allowed or not listed, never "no pets" from a blank', () => {
  assert.deepEqual(deriveFromPolicies(['Pets allowed', 'Smoke-free']), { pets: 'allowed', smoke_free: true });
  assert.deepEqual(deriveFromPolicies(['Cats and dogs allowed']), { pets: 'allowed', smoke_free: false });
  assert.deepEqual(deriveFromPolicies(['No pets']), { pets: 'not_listed', smoke_free: false });
  assert.deepEqual(deriveFromPolicies(['Guarantors accepted']), { pets: 'not_listed', smoke_free: false });

  const coop = page('active-coop-photos-301-east-79-12c').record;
  assert.equal(coop.facts.pets?.value, 'allowed');
  assert.equal(coop.facts.smoke_free?.value, true);
  const quiet = read({ policies: ['Guarantors accepted'] }).record;
  assert.equal(quiet.facts.pets?.value, 'not_listed');
  assert.equal(confirmListingRecord(quiet).facts.pets?.confidence, 'approx', 'none listed is weak evidence');
  assert.equal(read({}).record.facts.pets, undefined);
});
