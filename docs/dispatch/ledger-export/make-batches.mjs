// Prints the ArtifactData batch writes that seed a new ledger from data/, in batches of 50 or fewer.
// Run from the repo root: node docs/dispatch/ledger-export/make-batches.mjs
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('docs/dispatch/ledger-export/data');
const writes = [];
for (const collection of ['rounds', 'tracks', 'dispatches']) {
  for (const f of readdirSync(join(root, collection)).filter((n) => n.endsWith('.json')).sort()) {
    writes.push({ op: 'set', collection, doc_id: f.slice(0, -5), file_path: join(root, collection, f) });
  }
}
for (let i = 0; i < writes.length; i += 50) {
  console.log(`# batch ${i / 50 + 1} (${Math.min(50, writes.length - i)} writes)`);
  console.log(JSON.stringify(writes.slice(i, i + 50)));
}
