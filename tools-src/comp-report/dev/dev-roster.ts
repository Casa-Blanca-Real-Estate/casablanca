// DEV ONLY — a roster in memory for the email's sign-off (server/agent-card.ts),
// from a small JSON file named by CR_DEV_ROSTER_FILE:
//
//   [{ "slug": "kimani-c", "name": "Kimani C.", "email": "you@casa-blanca.com",
//      "phone": "(212) 555-0101", "photo": "/path/to/headshot.jpg" }]
//
// Each becomes a record shaped as the agent CMS and the profile-pic roster write
// it, its photo stored as the SQ2_Clean output, in one part.
import { readFile } from 'node:fs/promises';
import type { AgentRoster } from '../server/agent-card.ts';
import type { FileBlobs } from '../../agent-pics/files.ts';

interface Row { slug: string; name: string; email: string; phone?: string; photo?: string }

export async function devRoster(file: string): Promise<AgentRoster> {
  const rows = JSON.parse(await readFile(file, 'utf8')) as Row[];
  const records = new Map<string, unknown>();
  const blobs = new Map<string, ArrayBuffer>();
  for (const r of rows) {
    const outputs = [];
    if (r.photo) {
      const data = new Uint8Array(await readFile(r.photo)).buffer;
      const key = 'a'.repeat(24);
      blobs.set(`f/${r.slug}/${key}/0000`, data);
      outputs.push({
        key, kind: 'output', filename: `${r.slug}_SQ2_Clean.jpg`, type: 'image/jpeg', bytes: data.byteLength, parts: 1,
        uploadedAt: '2026-10-01T00:00:00.000Z', capturedAt: '', width: 1080, height: 1080, variant: 'SQ2_Clean',
      });
    }
    records.set(r.slug, {
      slug: r.slug,
      status: 'draft',
      draft: { identity: { name: r.name }, contact: { email: r.email, phone: r.phone ?? '' } },
      live: null,
      pic: { outputs },
    });
  }
  const files = {
    get: async (key: string, opts: { type: string }) => (opts.type === 'arrayBuffer' ? blobs.get(key) ?? null : null),
    set: async () => undefined,
    delete: async () => undefined,
    list: async () => ({ blobs: [] }),
  } as unknown as FileBlobs;
  return { slugs: async () => [...records.keys()], record: async (slug) => records.get(slug) ?? null, files };
}
