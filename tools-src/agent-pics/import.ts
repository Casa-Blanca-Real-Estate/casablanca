// The roster's one-time import (Dispatch 12 §5.3). Run once, by hand, from a
// reviewed file. Where that file comes from — the email-signatures doc or a
// FileMaker export — is D-24, Kimani's call; this takes it either way.
//
//   node tools-src/agent-pics/import.ts roster.json
//       checks the file and prints what it would do; writes nothing
//   node tools-src/agent-pics/import.ts roster.json --site=https://<production>
//       the same, against what the store already holds (needs CB_PICS_TOKEN)
//   node tools-src/agent-pics/import.ts roster.json --site=https://<production> --write
//       does it (needs CB_CMS_TOKEN and CB_PICS_TOKEN)
//
// The file holds agents' emails and phones: keep it outside the repo, and
// never commit it (publish = "." serves the repo root).
//
// What --write does, per agent, and why it's safe to run twice:
//   - No record yet: creates one through the agent CMS's own `create`, as a
//     draft. Nothing is published, and no site goes up.
//   - A record already: leaves the CMS's details alone. The CMS is their home now.
//   - The photo side (original in Drive, generated on, placements) is written
//     only while nobody has recorded one by hand.
//
// A row:
//   { "name": "Rikki Tauber", "slug": "rikki-t", "title": "Licensed Real Estate Agent",
//     "email": "…", "phone": "…", "rawInDrive": true, "generatedAt": "2025-03-01",
//     "placements": { "gmailSig": "done", "businessCard": "na" },
//     "instagram": "@rikki.t", "formerNames": ["Rikki Smith"] }
// Only name is required. slug defaults to firstname-lastinitial. instagram is a
// handle or a profile link (FB-2); formerNames keeps an old name searchable (PP-10).
import { readFileSync } from 'node:fs';
import { PLACEMENT_STATES, PLACEMENTS, type PlacementKey, type PlacementState, type RosterRow } from './record.ts';

export interface ImportRow {
  slug: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  rawInDrive: boolean;
  generatedAt: string;
  placements: Partial<Record<PlacementKey, PlacementState>>;
  instagram: string;
  formerNames: string[];
}

const KEYS = ['slug', 'name', 'title', 'email', 'phone', 'rawInDrive', 'generatedAt', 'placements', 'instagram', 'formerNames'];
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IG_RE = /^(?:@?[A-Za-z0-9._]{1,30}|(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?)$/;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** firstname-lastinitial, as assets/agents/agents.json has it: "Rikki Tauber" → rikki-t. */
export function slugFor(name: string): string {
  const words = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '').split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] || '';
  return `${words[0]}-${words[words.length - 1]![0]}`;
}

/** Check the reviewed file. Errors stop an import; warnings are for the reviewer to look at. */
export function parseRows(data: unknown): { rows: ImportRow[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: ImportRow[] = [];
  if (!Array.isArray(data)) return { rows, errors: ['the file must be a JSON array of agents'], warnings };
  const seen = new Map<string, number>();

  data.forEach((raw, i) => {
    const at = `row ${i + 1}`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(`${at}: not an object`); return; }
    const r = raw as Record<string, unknown>;
    const extra = Object.keys(r).filter((k) => !KEYS.includes(k));
    if (extra.length) errors.push(`${at}: unknown field ${extra.join(', ')}`);

    const name = str(r.name);
    const label = name ? `${at} (${name})` : at;
    if (!name) errors.push(`${at}: name is required`);
    const slug = str(r.slug) || slugFor(name);
    if (!SLUG_RE.test(slug)) errors.push(`${label}: slug "${slug}" must be lowercase letters, digits and hyphens`);
    else if (seen.has(slug)) errors.push(`${label}: slug ${slug} is also row ${seen.get(slug)! + 1} — give one of them its own slug`);
    else seen.set(slug, i);
    if (!str(r.slug) && name) warnings.push(`${label}: slug ${slug}, made from the name`);

    const email = str(r.email);
    if (email && !EMAIL_RE.test(email)) errors.push(`${label}: "${email}" is not an email address`);
    const phone = str(r.phone);
    if (phone && phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length !== 10) warnings.push(`${label}: phone isn't 10 digits`);
    if (!email) warnings.push(`${label}: no email`);
    if (!phone) warnings.push(`${label}: no phone`);

    if (r.rawInDrive !== undefined && typeof r.rawInDrive !== 'boolean') errors.push(`${label}: rawInDrive must be true or false`);
    const generatedAt = str(r.generatedAt);
    if (generatedAt && (!DATE_RE.test(generatedAt) || !Number.isFinite(Date.parse(generatedAt)))) {
      errors.push(`${label}: generatedAt must be YYYY-MM-DD`);
    }

    const instagram = str(r.instagram);
    if (r.instagram !== undefined && typeof r.instagram !== 'string') errors.push(`${label}: instagram must be a handle or a link`);
    else if (instagram && !IG_RE.test(instagram)) errors.push(`${label}: "${instagram}" is not an Instagram handle or profile link`);
    let formerNames: string[] = [];
    if (r.formerNames !== undefined) {
      if (!Array.isArray(r.formerNames) || r.formerNames.some((n) => typeof n !== 'string')) errors.push(`${label}: formerNames must be a list of names`);
      else formerNames = r.formerNames.map(str).filter(Boolean);
    }

    const placements: Partial<Record<PlacementKey, PlacementState>> = {};
    if (r.placements !== undefined) {
      if (!r.placements || typeof r.placements !== 'object' || Array.isArray(r.placements)) {
        errors.push(`${label}: placements must be an object`);
      } else {
        for (const [k, v] of Object.entries(r.placements)) {
          if (!PLACEMENTS.includes(k as PlacementKey)) errors.push(`${label}: no placement called ${k}`);
          else if (!PLACEMENT_STATES.includes(v as PlacementState)) errors.push(`${label}: placements.${k} must be ${PLACEMENT_STATES.join(', ')}`);
          else placements[k as PlacementKey] = v as PlacementState;
        }
        if (Object.values(placements).includes('done') && !generatedAt) {
          errors.push(`${label}: a placement is done but there's no generatedAt — done with which photo?`);
        }
      }
    }

    rows.push({
      slug, name, title: str(r.title), email, phone,
      rawInDrive: r.rawInDrive === true, generatedAt, placements, instagram, formerNames,
    });
  });
  return { rows, errors, warnings };
}

/** What the store holds today, per slug: whether anyone has recorded a photo side. */
export type Existing = Map<string, { name: string; photoRecorded: boolean }>;

export interface Step {
  slug: string;
  name: string;
  /** Create the record, as a CMS draft. */
  create: boolean;
  /** Record the photo side. */
  photo: boolean;
  why: string;
}

export function plan(rows: ImportRow[], existing: Existing | null): Step[] {
  return rows.map((r) => {
    const have = existing?.get(r.slug);
    const hasPhoto = r.rawInDrive || Boolean(r.generatedAt) || Object.keys(r.placements).length > 0;
    if (!have) {
      return { slug: r.slug, name: r.name, create: true, photo: hasPhoto, why: existing ? 'new' : 'new, unless the store has it' };
    }
    const why = [`in the store as ${have.name}`];
    if (have.photoRecorded && hasPhoto) why.push('photo side already recorded, left as is');
    return { slug: r.slug, name: r.name, create: false, photo: hasPhoto && !have.photoRecorded, why: why.join('; ') };
  });
}

export interface RunOptions {
  site: string;
  cmsToken: string;
  picsToken: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

async function call(o: RunOptions, fn: 'agent-store' | 'agent-pics', token: string, body?: unknown) {
  const res = await o.fetch(`${o.site.replace(/\/+$/, '')}/.netlify/functions/${fn}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${fn} answered ${res.status}: ${String(data.message || data.error || '')}`);
  return data;
}

/** Anyone has written any photo fact for this agent: a hand-made record is never overwritten. */
const photoRecorded = (r: RosterRow) =>
  Boolean(r.updatedAt || r.rawInDrive || r.generatedAt || r.notes || r.raws) ||
  Object.values(r.placements).some((p) => p !== 'todo');

export async function readExisting(o: RunOptions): Promise<Existing> {
  const data = await call(o, 'agent-pics', o.picsToken);
  const roster = (data.roster || []) as RosterRow[];
  return new Map(roster.map((r) => [r.slug, { name: r.name, photoRecorded: photoRecorded(r) }]));
}

/** Carry out a plan. Each agent is two writes at most; a failure is reported and the rest go on. */
export async function execute(rows: ImportRow[], steps: Step[], o: RunOptions): Promise<{ created: number; photo: number; failed: number }> {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  let created = 0, photo = 0, failed = 0;
  for (const s of steps) {
    const r = bySlug.get(s.slug)!;
    try {
      if (s.create) {
        await call(o, 'agent-store', o.cmsToken, {
          action: 'create', slug: r.slug, by: 'roster import',
          draft: {
            identity: { name: r.name, title: r.title, formerNames: r.formerNames },
            contact: { email: r.email, phone: r.phone, instagram: r.instagram },
          },
        });
        created++;
      }
      if (s.photo) {
        const placements: Record<string, { state: PlacementState }> = {};
        for (const [k, v] of Object.entries(r.placements)) placements[k] = { state: v };
        await call(o, 'agent-pics', o.picsToken, {
          action: 'update', slug: r.slug, by: 'roster import',
          pic: { rawInDrive: r.rawInDrive, generatedAt: r.generatedAt }, placements,
        });
        photo++;
      }
      o.log(`  ok    ${r.slug}`);
    } catch (e) {
      failed++;
      o.log(`  FAIL  ${r.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { created, photo, failed };
}

/* ───────────────────────────── the command ───────────────────────────── */

async function main(argv: string[]) {
  const file = argv.find((a) => !a.startsWith('--'));
  const site = argv.find((a) => a.startsWith('--site='))?.slice(7) || '';
  const write = argv.includes('--write');
  if (!file) {
    console.error('usage: node tools-src/agent-pics/import.ts <reviewed.json> [--site=https://…] [--write]');
    process.exit(2);
  }
  const { rows, errors, warnings } = parseRows(JSON.parse(readFileSync(file, 'utf8')));
  for (const w of warnings) console.log(`!  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`✗  ${e}`);
    console.error(`\n${errors.length} problem(s) in ${file}. Nothing was written.`);
    process.exit(1);
  }

  const o: RunOptions = {
    site, cmsToken: process.env.CB_CMS_TOKEN || '', picsToken: process.env.CB_PICS_TOKEN || '',
    fetch, log: (l) => console.log(l),
  };
  if (site && !o.picsToken) { console.error('--site needs CB_PICS_TOKEN in the environment.'); process.exit(2); }
  if (write && (!site || !o.cmsToken)) { console.error('--write needs --site and CB_CMS_TOKEN as well.'); process.exit(2); }

  const existing = site ? await readExisting(o) : null;
  const steps = plan(rows, existing);
  const creates = steps.filter((s) => s.create).length;
  console.log(`\n${rows.length} agents in the file${existing ? `, ${existing.size} in the store` : ' (store not read: no --site)'}.`);
  for (const s of steps) console.log(`  ${s.create ? 'create' : 'keep  '} ${s.photo ? '+photo' : '      '}  ${s.slug.padEnd(22)} ${s.why}`);
  console.log(`\n${creates} to create as drafts (nothing is published), ${steps.filter((s) => s.photo).length} photo sides to record.`);
  if (!write) { console.log('Dry run: nothing was written. Add --write to do it.'); return; }

  const result = await execute(rows, steps, o);
  console.log(`\nCreated ${result.created}, recorded ${result.photo} photo sides, ${result.failed} failed.`);
  if (result.failed) { console.log('Fix what failed and run it again: what already went in is skipped.'); process.exit(1); }
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
