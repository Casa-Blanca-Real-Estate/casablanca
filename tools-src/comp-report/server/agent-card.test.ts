// The email's sign-off from Casa's roster (server/agent-card.ts): the agent
// matched by email, their phone, and their headshot copied once into the
// email's photo store.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { FileBlobs } from '../../agent-pics/files.ts';
import { agentCard, cardOf, findAgent, forgetAgentCards, type AgentRoster } from './agent-card.ts';
import { memoryEmailPhotoStore, PHOTO_ROUTE } from './email-photos.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5, 6, 7]);
const out = (variant: string, key: string, type = 'image/jpeg', bytes = 10, parts = 2) => ({
  key, kind: 'output', filename: `x_${variant}.jpg`, type, bytes, parts, uploadedAt: '2026-10-01T00:00:00.000Z',
  capturedAt: '', width: 1080, height: 1080, variant,
});
const KEY = 'b'.repeat(24);

function roster(records: Record<string, unknown>, blobs = new Map<string, ArrayBuffer>()): AgentRoster & { reads: string[] } {
  const reads: string[] = [];
  const files = {
    get: async (key: string) => {
      reads.push(key);
      return blobs.get(key) ?? null;
    },
  } as unknown as FileBlobs;
  return { reads, slugs: async () => Object.keys(records), record: async (s) => records[s] ?? null, files };
}

const sam = {
  slug: 'sam-v', status: 'published',
  draft: { identity: { name: 'Sam Valk' }, contact: { email: 'Sam@Casa-Blanca.com', phone: '(212) 555-0101' } },
  live: { identity: { name: 'Sam Valk (old)' }, contact: { email: 'sam@casa-blanca.com', phone: '' } },
  pic: { outputs: [out('R1_Logo', 'c'.repeat(24), 'image/png'), out('R4_Clean', 'd'.repeat(24)), out('SQ2_Clean', KEY)] },
};

beforeEach(() => forgetAgentCards());

test('matched by contact email, whatever its case; the draft first; a clean square JPEG first; archived agents never', () => {
  const hit = cardOf('sam-v', sam, 'sam@casa-blanca.com');
  assert.equal(hit?.name, 'Sam Valk');
  assert.equal(hit?.phone, '(212) 555-0101');
  assert.equal(hit?.headshot?.variant, 'SQ2_Clean');
  assert.equal(cardOf('sam-v', sam, 'other@casa-blanca.com'), null);
  assert.equal(cardOf('sam-v', { ...sam, status: 'archived' }, 'sam@casa-blanca.com'), null);
  const pngOnly = cardOf('sam-v', { ...sam, pic: { outputs: [out('R1_Logo', KEY, 'image/png')] } }, 'sam@casa-blanca.com');
  assert.equal(pngOnly?.headshot, null);
  const noPic = cardOf('sam-v', { ...sam, pic: undefined }, 'sam@casa-blanca.com');
  assert.equal(noPic?.headshot, null);
  assert.equal(cardOf('x', null, 'sam@casa-blanca.com'), null);
});

test('the scan finds the one record among many, and none when the roster doesn’t know the address', async () => {
  const records: Record<string, unknown> = {};
  for (let i = 0; i < 40; i++) records[`a-${i}`] = { slug: `a-${i}`, draft: { identity: { name: `A ${i}` }, contact: { email: `a${i}@casa-blanca.com` } } };
  records['sam-v'] = sam;
  assert.equal((await findAgent(roster(records), 'sam@casa-blanca.com'))?.slug, 'sam-v');
  assert.equal(await findAgent(roster(records), 'nobody@casa-blanca.com'), null);
});

test('the card: the headshot copied once from its parts and served on the public photo route; a missing part is no photo', async () => {
  const blobs = new Map<string, ArrayBuffer>([
    [`f/sam-v/${KEY}/0000`, JPEG.slice(0, 6).buffer],
    [`f/sam-v/${KEY}/0001`, JPEG.slice(6).buffer],
  ]);
  const photos = memoryEmailPhotoStore();
  const card = await agentCard(roster({ 'sam-v': sam }, blobs), photos, 'sam@casa-blanca.com');
  assert.equal(card?.name, 'Sam Valk');
  assert.ok(card?.photo?.startsWith(`${PHOTO_ROUTE}?k=`));
  const [stored] = [...photos.photos.values()];
  assert.deepEqual(new Uint8Array(stored!.data), JPEG);
  assert.equal(stored!.contentType, 'image/jpeg');

  // Asked again (a new instance, so no memory): the same copy, not a second one.
  forgetAgentCards();
  const again = await agentCard(roster({ 'sam-v': sam }, blobs), photos, 'sam@casa-blanca.com');
  assert.equal(again?.photo, card?.photo);
  assert.equal(photos.photos.size, 1);

  forgetAgentCards();
  const broken = new Map([[`f/sam-v/${KEY}/0000`, JPEG.slice(0, 6).buffer]]);
  const partial = await agentCard(roster({ 'sam-v': sam }, broken), memoryEmailPhotoStore(), 'sam@casa-blanca.com');
  assert.equal(partial?.photo, null);
  assert.equal(partial?.phone, '(212) 555-0101');
});

test('the card is remembered for a while, so the roster isn’t read on every report', async () => {
  let t = 0;
  const r = roster({ 'sam-v': { ...sam, pic: undefined } });
  let scans = 0;
  const counted: AgentRoster = { ...r, slugs: async () => (scans++, r.slugs()) };
  await agentCard(counted, null, 'sam@casa-blanca.com', () => t);
  await agentCard(counted, null, 'SAM@casa-blanca.com', () => t);
  assert.equal(scans, 1);
  t += 11 * 60_000;
  await agentCard(counted, null, 'sam@casa-blanca.com', () => t);
  assert.equal(scans, 2);
});
