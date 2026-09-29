// The dev notebook, for Claude Code sessions: read Kimani's notes, pick one
// up, leave a note on it, mark it off. Talks to the live site's API with a
// key Kimani made on the notebook page (docs/dev-notebook/README.md), so it
// works from a cloud sandbox with no database access.
//
//   npm run notebook                                   open notes
//   npm run notebook -- --status=all                   or active, read, resolved…
//   npm run notebook -- --tag=bug --surface=comp-report --limit=20
//   npm run notebook -- --id=dn_…                      one note, everything about it
//   npm run notebook -- --id=dn_… --shots              …and download its screenshots
//                                                       (--shots-dir=<dir> to choose where)
//   npm run notebook -- --id=dn_… --set=read --by=Mason
//   npm run notebook -- --id=dn_… --note="Reproduced on Safari." --by=Mason
//   npm run notebook -- --id=dn_… --set=resolved --pr=57 --note="…" --by=Mason
//
// It has no delete, by design: deleting happens only on the notebook page.
// Use --set=wontfix or --set=duplicate with a --note instead.
//
// Environment: DEV_NOTEBOOK_KEY (required; never printed), DEV_NOTEBOOK_URL
// (defaults to production).
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const PRODUCTION = 'https://casa-blanca-creative-studio.netlify.app';

interface EventOut { at: string; by: string; via: string; status?: string; note?: string; pr?: number }
interface NoteOut {
  id: string; body: string; tags: string[]; author: string; createdAt: string; route: string | null; params: Record<string, string>;
  surface: string; title: string | null; context: Record<string, unknown>; viewport: string | null; userAgent: string | null;
  commit: string | null; deployId: string | null; status: string; statusAt: string; resolvedPr: number | null; events: number;
  log?: EventOut[]; shots?: { id: string; type: string; bytes: number }[];
}

class CliError extends Error {}

function usage(): string {
  return [
    'Usage: npm run notebook -- [--status=open|active|all|read|resolved|answered|deferred|wontfix|duplicate] [--tag=] [--surface=] [--limit=]',
    '       npm run notebook -- --id=dn_… [--shots] [--shots-dir=<dir>]',
    '       npm run notebook -- --id=dn_… [--set=<status>] [--note="…"] [--pr=<n>] --by=<your session name>',
  ].join('\n');
}

async function api<T>(base: string, key: string, method: 'GET' | 'PATCH', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/dev/notebook${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new CliError(`Couldn't reach ${base}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (res.status === 401) throw new CliError('The notebook refused the key: it may have been revoked. Ask Kimani for a new one (notebook page → Keys).');
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new CliError(`${err.message ?? `The notebook answered ${res.status}.`}${err.error ? ` (${err.error})` : ''}`);
  }
  return (await res.json()) as T;
}

const day = (iso: string) => iso.slice(0, 10);
const minute = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
const oneLine = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const statusWord = (n: NoteOut) => (n.status === 'resolved' && n.resolvedPr ? `resolved #${n.resolvedPr}` : n.status);

function line(n: NoteOut): string {
  const tags = n.tags.length ? `[${n.tags.join(',')}]` : '[]';
  const status = n.status === 'open' ? '' : `(${statusWord(n)})  `;
  return `${n.id}  ${day(n.createdAt)}  ${status}${tags}  ${n.surface}  ${n.route ?? '—'}  "${oneLine(n.body, 100)}"`;
}

function details(n: NoteOut): string {
  const out = [
    `${n.id}  ${statusWord(n)} since ${minute(n.statusAt)}`,
    `Tags:        ${n.tags.join(', ') || '—'}`,
    `Where:       ${n.route ?? '—'}  (${n.surface})${n.title ? `  — "${n.title}"` : ''}`,
    `Params:      ${Object.entries(n.params).map(([k, v]) => `${k}=${v}`).join('  ') || '—'}`,
  ];
  for (const [k, v] of Object.entries(n.context)) out.push(`Context:     ${k}: ${JSON.stringify(v)}`);
  out.push(
    `Viewport:    ${n.viewport ?? 'unknown'}`,
    `Build:       ${n.commit ?? 'unknown commit'}${n.deployId ? ` (deploy ${n.deployId})` : ''}`,
    `Browser:     ${n.userAgent ?? 'unknown'}`,
    `Written by:  ${n.author}, ${minute(n.createdAt)}`,
  );
  if (n.shots?.length) out.push(`Screenshots: ${n.shots.map((s) => `${s.id} (${s.type}, ${Math.round(s.bytes / 1024)} KB)`).join(', ')}`);
  out.push('', n.body, '', 'History:');
  for (const e of n.log ?? []) {
    out.push(`  ${minute(e.at)}  ${(e.status ?? 'comment').padEnd(9)} ${e.by} (${e.via})${e.pr ? `  PR #${e.pr}` : ''}${e.note ? `  ${e.note}` : ''}`);
  }
  return out.join('\n');
}

export async function main(argv: string[], env: Record<string, string | undefined>, print: (s: string) => void): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      status: { type: 'string' }, tag: { type: 'string' }, surface: { type: 'string' }, limit: { type: 'string' },
      id: { type: 'string' }, shots: { type: 'boolean' }, 'shots-dir': { type: 'string' }, set: { type: 'string' }, note: { type: 'string' },
      pr: { type: 'string' }, by: { type: 'string' }, help: { type: 'boolean' },
    },
    allowPositionals: false,
    strict: true,
  });
  if (values.help) {
    print(usage());
    return 0;
  }
  const key = env.DEV_NOTEBOOK_KEY?.trim() ?? '';
  if (!/^dnk_[0-9a-z]{12}\.[A-Za-z0-9_-]{43}$/.test(key)) {
    throw new CliError(
      'No notebook key. Kimani makes one on the notebook page (/tools/dev-notebook/ → Keys) and adds it to the Claude Code ' +
      'environment as DEV_NOTEBOOK_KEY; a new session picks it up.',
    );
  }
  const base = (env.DEV_NOTEBOOK_URL?.trim() || PRODUCTION).replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(base)) throw new CliError('DEV_NOTEBOOK_URL is a site origin, like https://example.netlify.app');

  const changing = values.set !== undefined || values.note !== undefined || values.pr !== undefined;
  if (changing) {
    if (!values.id) throw new CliError('Say which note: --id=dn_…');
    if (!values.by?.trim()) throw new CliError('Say who you are: --by=<your session name>, e.g. --by=Mason');
    const pr = values.pr === undefined ? undefined : Number(values.pr);
    const { note } = await api<{ note: NoteOut }>(base, key, 'PATCH', `/notes/${encodeURIComponent(values.id)}`, {
      ...(values.set ? { status: values.set } : {}),
      ...(values.note ? { note: values.note } : {}),
      ...(pr !== undefined ? { pr } : {}),
      by: values.by.trim(),
    });
    const last = note.log?.at(-1);
    print(`${note.id} is now ${statusWord(note)}${last?.note ? ` — ${last.note}` : ''}`);
    return 0;
  }

  if (values.id) {
    const { note } = await api<{ note: NoteOut }>(base, key, 'GET', `/notes/${encodeURIComponent(values.id)}`);
    print(details(note));
    if ((values.shots || values['shots-dir']) && note.shots?.length) {
      const dir = values['shots-dir'] || join(tmpdir(), 'dev-notebook', note.id);
      mkdirSync(dir, { recursive: true });
      for (const s of note.shots) {
        const res = await fetch(`${base}/api/dev/notebook/notes/${note.id}/shots/${s.id}`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new CliError(`Couldn't download ${s.id} (${res.status}).`);
        const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[s.type] ?? 'bin';
        const file = join(dir, `${s.id}.${ext}`);
        writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
        print(`Saved ${file}`);
      }
    }
    return 0;
  }

  const q = new URLSearchParams();
  for (const k of ['status', 'tag', 'surface', 'limit'] as const) if (values[k]) q.set(k, values[k]!);
  const list = await api<{ summary: string; notes: NoteOut[] }>(base, key, 'GET', `/notes${q.size ? `?${q}` : ''}`);
  print(list.summary);
  for (const n of list.notes) print(line(n));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2), process.env, (s) => console.log(s)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof CliError || (error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS') ? error.message : error);
      if (!(error instanceof CliError)) console.error(usage());
      process.exit(1);
    },
  );
}
