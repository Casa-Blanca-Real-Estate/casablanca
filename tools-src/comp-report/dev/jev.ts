// Dispatch 10 phase 2, from a Claude Code session: the live steps against the
// production decide endpoint, with the session key (CR_DECIDE_KEY, sent as
// X-Decide-Key). It never prints the key. Nothing here runs on Netlify.
//
//   npm run -s jev -- readout [--json]          setup, coverage, cost, the latest probe, batches, drift
//   npm run -s jev -- probe [--fixture=<id>] [--wire=a,b] [--raw]
//                                               the go/no-go call (default: the first fixture, every question)
//   npm run -s jev -- probes --out=<dir>        the latest probes' raw bodies, one file each
//   npm run -s jev -- labelled [--batch=labels-v1] [--rerun] [--sheet=<csv>]
//                                               queue the sheet's listings: Jev, and Haiku as a second judge
//   npm run -s jev -- results [--batch=labels-v1] [--sheet=<csv>] [--json=<file>]
//                                               agreement with the labels, by band, and a proposed bar per question
//   npm run -s jev -- orders [--interval=13000] [--json=<file>]
//                                               both orders in one request against separate requests, on 20 questions
//   npm run -s jev -- drift                     this week's drift check, now
//   npm run -s jev -- batch --name=<batch>      one batch's requests, summarised
//
// CR_DECIDE_ORIGIN overrides the site (default: production).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { agreement, readLabelSheet, type BatchJudgment } from '../server/decide/agreement.ts';
import { FIXTURES } from '../server/decide/fixtures.ts';
import { QUESTIONS } from '../server/decide/registry.ts';

const PRODUCTION = 'https://casa-blanca-creative-studio.netlify.app';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_SHEET = join(repo, 'docs/comp-report/jev-labels.csv');

class CliError extends Error {}
const print = (s = '') => process.stdout.write(`${s}\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function settings() {
  const key = process.env.CR_DECIDE_KEY?.trim() ?? '';
  if (key.length < 32) {
    throw new CliError('No decide key. Kimani sets CR_DECIDE_KEY (32+ characters) in Netlify and in the Claude Code environment; a new session picks it up.');
  }
  const base = (process.env.CR_DECIDE_ORIGIN?.trim() || PRODUCTION).replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(base)) throw new CliError('CR_DECIDE_ORIGIN is a site origin, like https://example.netlify.app');
  return { key, base };
}

async function api<T>(method: 'GET' | 'POST', query: string, body?: unknown): Promise<{ status: number; body: T }> {
  const { key, base } = settings();
  let res: Response;
  try {
    res = await fetch(`${base}/api/comp-report/decide${query}`, {
      method,
      headers: { 'X-Decide-Key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    throw new CliError(`Couldn't reach ${base}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const out = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (res.status === 401) throw new CliError('The endpoint refused the key (401). It may not be set in Netlify yet, or the two copies differ.');
  if (res.status >= 400 && !(out && typeof out === 'object' && 'queued' in out)) {
    throw new CliError(`${out.message ?? `The endpoint answered ${res.status}.`}${out.error ? ` (${out.error})` : ''}`);
  }
  return { status: res.status, body: out };
}

function sheetUrls(path: string): string[] {
  const { rows, problems } = readLabelSheet(readFileSync(path, 'utf8'));
  if (problems.length) throw new CliError(`The labels sheet has problems:\n  ${problems.join('\n  ')}`);
  return rows.filter((r) => r.hasText !== 'no').map((r) => r.url);
}

interface BatchOut {
  requests: Array<{
    id: number; status: string; dropReason: string | null; url: string | null; fixture: string | null;
    judgments: Array<{ provider: string; question: string; answer: string | null; probability: number | null; orderStable: boolean }>;
  }>;
}

interface ProbeOut {
  sent: boolean; ok: boolean; outcome: string; status: number | null; ms: number | null; model: string | null; zdr: boolean;
  retryInMs?: number; unanswered: string[]; matches: Record<string, boolean>; raw: string | null; note?: string;
  answers: { wire?: Record<string, { choice?: string; probabilities?: Record<string, number>; probability?: number }> } & Record<string, unknown>;
}

/** One probe, waiting out a busy reply (the shared pacing) up to a few times. */
async function probeOnce(body: Record<string, unknown>): Promise<ProbeOut> {
  for (let tries = 0; tries < 6; tries++) {
    const { body: r } = await api<ProbeOut>('POST', '', { action: 'probe', ...body });
    if (r.outcome !== 'busy') return r;
    await sleep(Math.min(Math.max(r.retryInMs ?? 13_000, 1_000), 120_000) + 250);
  }
  throw new CliError('The endpoint stayed busy: a drainer is running, or the Gateway asked for a long wait. Try again later.');
}

const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(0)}%`);

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      json: { type: 'string' }, raw: { type: 'boolean' }, fixture: { type: 'string' }, wire: { type: 'string' },
      out: { type: 'string' }, batch: { type: 'string' }, rerun: { type: 'boolean' }, sheet: { type: 'string' },
      name: { type: 'string' }, interval: { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });
  const batch = values.batch ?? 'labels-v1';
  const sheet = values.sheet ? resolve(values.sheet) : DEFAULT_SHEET;

  switch (command) {
    case 'readout': {
      const { body } = await api<Record<string, any>>('GET', '');
      if (values.json !== undefined) { print(JSON.stringify(body, null, 2)); return 0; }
      print(`setup: ${JSON.stringify(body.setup)}`);
      print(`coverage: ${JSON.stringify(body.coverage?.questions)} dropped by reason ${JSON.stringify(body.coverage?.droppedQuestionsByReason)}`);
      print(`cost: $${body.cost?.totalUsd} total, ${body.cost?.perListingUsd ?? '—'} per listing`);
      print(`latency: ${JSON.stringify(body.latency)}`);
      print(`probe: ${JSON.stringify(body.probe)}`);
      print(`batches: ${JSON.stringify(body.batches)}`);
      print(`drift: ${body.drift?.moved ?? 0} moved of ${body.drift?.items?.length ?? 0}`);
      return 0;
    }
    case 'probe': {
      const r = await probeOnce({
        ...(values.fixture ? { fixture: values.fixture } : {}),
        ...(values.wire ? { wireIds: values.wire.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
      });
      print(`${r.ok ? 'GO' : 'NO-GO'}: ${r.outcome}, status ${r.status ?? '—'}, ${r.ms ?? '—'} ms, model ${r.model ?? '—'}, zero retention ${r.zdr ? 'on' : 'off'}`);
      if (r.unanswered.length) print(`unanswered: ${r.unanswered.join(', ')}`);
      if (Object.keys(r.matches).length) print(`matches the fixture: ${Object.entries(r.matches).map(([q, m]) => `${q} ${m ? 'yes' : 'NO'}`).join(', ')}`);
      if (r.note) print(`note: ${r.note}`);
      if (values.raw) print(r.raw ?? '(no body)');
      return r.ok ? 0 : 1;
    }
    case 'probes': {
      const { body } = await api<{ probes: Array<Record<string, unknown> & { id: number; raw: string | null }> }>('GET', '?view=probes');
      if (!values.out) {
        for (const p of body.probes) print(`#${p.id} ${String(p.created_at)} ${p.ok ? 'ok' : 'not ok'} ${String(p.outcome)} ${String(p.status)} ${String(p.ms)} ms`);
        return 0;
      }
      mkdirSync(values.out, { recursive: true });
      for (const p of body.probes) writeFileSync(join(values.out, `probe-${p.id}.json`), `${JSON.stringify(p, null, 2)}\n`);
      print(`Wrote ${body.probes.length} probe${body.probes.length === 1 ? '' : 's'} to ${values.out}`);
      return 0;
    }
    case 'labelled': {
      const urls = sheetUrls(sheet);
      const { status, body } = await api<Record<string, any>>('POST', '', { action: 'labelled', batch, urls, rerun: values.rerun === true });
      print(JSON.stringify(body, null, 2));
      return status === 200 ? 0 : 1;
    }
    case 'results': {
      const { rows, problems } = readLabelSheet(readFileSync(sheet, 'utf8'));
      if (problems.length) throw new CliError(`The labels sheet has problems:\n  ${problems.join('\n  ')}`);
      const { body } = await api<BatchOut>('GET', `?view=batch&batch=${encodeURIComponent(batch)}`);
      // The latest request per page: a rerun supersedes the run before it.
      const latest = new Map<string, BatchOut['requests'][number]>();
      for (const r of body.requests) if (r.url && (!latest.has(r.url) || latest.get(r.url)!.id < r.id)) latest.set(r.url, r);
      const judgments: BatchJudgment[] = [...latest.values()].flatMap((r) => r.judgments.map((j) => ({ url: r.url!, ...j })));
      const result = agreement(rows, judgments);
      const settled = [...latest.values()].filter((r) => r.status === 'answered' || r.status === 'dropped').length;
      print(`${latest.size} listings in ${batch}, ${settled} settled; ${rows.filter((r) => Object.keys(r.labels).length).length} labelled rows in the sheet.`);
      print('');
      print('| Question | Provider | Labelled | Answered | Agree | Order flips | <0.4 | 0.4–0.6 | 0.6–0.8 | 0.8–0.9 | 0.9–0.95 | ≥0.95 | Proposed bar |');
      print('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
      for (const q of result) {
        const b = (k: keyof typeof q.bands) => (q.bands[k].n ? `${q.bands[k].agree}/${q.bands[k].n}` : '—');
        const bar = q.bar.verdict === 'proposed' ? `high ≥ ${q.bar.high}${q.bar.middling !== null ? `, middling ≥ ${q.bar.middling}` : ''}` : 'not ready';
        print(`| ${q.question} | ${q.provider} | ${q.labelled} | ${q.answered} | ${pct(q.share)} | ${b('order-flip')} | ${b('<0.4')} | ${b('0.4–0.6')} | ${b('0.6–0.8')} | ${b('0.8–0.9')} | ${b('0.9–0.95')} | ${b('≥0.95')} | ${bar} |`);
      }
      if (values.json) { writeFileSync(values.json, `${JSON.stringify({ batch, result }, null, 2)}\n`); print(`\nWrote ${values.json}`); }
      return 0;
    }
    case 'orders': {
      // 20 questions: on each fixture, the three choices (each order alone) and the sponsor yes/no alone,
      // against the same fixture asked everything in one request.
      const interval = Math.max(12_500, Number(values.interval ?? 13_000) || 13_000);
      const choices = QUESTIONS.filter((q) => q.type === 'choice').map((q) => q.id);
      const rows: Array<Record<string, unknown>> = [];
      for (const f of FIXTURES) {
        const together = await probeOnce({ fixture: f.id });
        if (!together.ok) throw new CliError(`${f.id}: the combined request failed (${together.outcome}); stopping.`);
        await sleep(interval);
        const alone: Record<string, ProbeOut> = {};
        for (const wire of [...choices.flatMap((q) => [`${q}__fwd`, `${q}__rev`]), 'sponsor_unit']) {
          alone[wire] = await probeOnce({ fixture: f.id, wireIds: [wire] });
          await sleep(interval);
        }
        for (const wire of Object.keys(alone)) {
          const a = together.answers.wire?.[wire];
          const b = alone[wire]!.answers.wire?.[wire];
          const pa = a?.probabilities ?? (a?.probability !== undefined ? { true: a.probability } : {});
          const pb = b?.probabilities ?? (b?.probability !== undefined ? { true: b.probability } : {});
          const keys = [...new Set([...Object.keys(pa), ...Object.keys(pb)])];
          const maxDiff = keys.length ? Math.max(...keys.map((k) => Math.abs((pa[k] ?? 0) - (pb[k] ?? 0)))) : null;
          rows.push({ fixture: f.id, wire, together: a ?? null, alone: b ?? null, sameChoice: (a?.choice ?? null) === (b?.choice ?? null), maxDiff });
        }
        print(`${f.id}: done`);
      }
      const diffs = rows.map((r) => r.maxDiff).filter((d): d is number => typeof d === 'number').sort((a, b) => a - b);
      print(`\n${rows.length} wire questions. Same top option together and alone: ${rows.filter((r) => r.sameChoice).length}/${rows.length}.`);
      if (diffs.length) print(`Largest probability difference: median ${diffs[Math.floor(diffs.length / 2)]!.toFixed(3)}, max ${diffs[diffs.length - 1]!.toFixed(3)}.`);
      if (values.json) { writeFileSync(values.json, `${JSON.stringify(rows, null, 2)}\n`); print(`Wrote ${values.json}`); }
      return 0;
    }
    case 'drift': {
      const { status, body } = await api<Record<string, unknown>>('POST', '', { action: 'drift' });
      print(JSON.stringify(body, null, 2));
      return status === 200 ? 0 : 1;
    }
    case 'batch': {
      if (!values.name) throw new CliError('Name the batch: --name=labels-v1');
      const { body } = await api<BatchOut>('GET', `?view=batch&batch=${encodeURIComponent(values.name)}`);
      const by: Record<string, number> = {};
      for (const r of body.requests) {
        const k = r.dropReason ? `${r.status}:${r.dropReason}` : r.status;
        by[k] = (by[k] ?? 0) + 1;
      }
      print(`${body.requests.length} requests: ${JSON.stringify(by)}`);
      for (const r of body.requests) print(`#${r.id} ${r.status}${r.dropReason ? ` (${r.dropReason})` : ''} ${r.url ?? r.fixture} — ${r.judgments.length} judgments`);
      return 0;
    }
    default:
      print('Usage: npm run -s jev -- readout | probe | probes | labelled | results | orders | drift | batch (see dev/jev.ts)');
      return command ? 2 : 0;
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
  if (error instanceof CliError) { console.error(error.message); process.exit(2); }
  console.error(error);
  process.exit(1);
});
