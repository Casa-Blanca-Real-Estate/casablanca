// The email behind Send and Done (Dispatch 13's writer and QA, Dispatch 14's
// tabs): the writer's drafts, polled while one is written; the email for each
// length, from the template or the writer's sections; the agent's edited
// plain text (send.draft, the source of truth) and which length it was edited
// at; QA's checks and the issues they make; the designed email; and the
// actions — edit, fix, answer, write, copy (logged), mark as sent, reopen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ResultKind } from '../../../engine/index.ts';
import { ApiError, narrativesApi, type NarrativeView } from '../../api.ts';
import { buildEmail, countedComps, hasHomeSize, headlineDrafts, htmlFromText, type EmailDraft, type EmailLength, type WrittenSections } from '../../../workspace/email.ts';
import { clientPrice, psf } from '../../../workspace/format.ts';
import { draftChecks, ledgerFor, qaRecord, qaStatus, syncHeadline, type Acknowledgment } from '../../../workspace/qa.ts';
import { answerResult, estimatesChangeTheAnswer, fact, homeName } from '../../../workspace/reading.ts';
import { noteOf, type SendState } from '../../../workspace/state.ts';
import { writerInputFrom, writerInputKey } from '../../../workspace/writer-input.ts';
import { entry } from '../workspace/bits.tsx';
import { fingerprint, type Workspace } from '../workspace/model.ts';
import { designedCta, designedEyebrow, formatOf, homeSub, lengthOf, monthOf, OFFICE, type Format } from './copy.ts';
import { designedComps, designedHtml, parseEmailText } from './designed.ts';
import { applyFixes, sendIssues, type SendIssue } from './issues.ts';

type Written = { headlines: string[]; sections: WrittenSections };
const LENGTHS: EmailLength[] = ['full', 'short', 'text'];

const inFlight = (n: NarrativeView) => n.origin === 'writer' && (n.status === 'queued' || n.status === 'running');

/** The report's drafts, polled while one is written; a queued draft that didn't start is started again. */
function useNarratives(reportId: string, enabled: boolean) {
  const [narratives, setNarratives] = useState<NarrativeView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setNarratives((await narrativesApi.load(reportId)).narratives);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [reportId]);
  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);
  const writing = narratives.find(inFlight);
  const writingId = writing?.id;
  const queuedAt = writing?.status === 'queued' ? writing.createdAt : null;
  useEffect(() => {
    if (!writingId) return undefined;
    const poll = window.setInterval(() => void reload(), 1500);
    // Started right after it's queued; a start that never arrived is sent again.
    const kick = queuedAt ? window.setTimeout(() => void narrativesApi.start(reportId, writingId), 15_000) : 0;
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(kick);
    };
  }, [reportId, writingId, queuedAt, reload]);
  return { narratives, setNarratives, reload, error, writing };
}

const fp = (e: { subject: string; text: string }) => fingerprint(`${e.subject}\n${e.text}`);

/** Copies plain text the old way, for a browser without the clipboard API. */
function copyByHand(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** The ack's text is the finding as it read: the part of the key after its kind ("number:$5.1M" → "$5.1M"). */
const findingText = (key: string) => key.slice(key.indexOf(':') + 1) || key;

export function useSendEmail(ws: Workspace, opts: { format?: Format } = {}) {
  const send = ws.send;
  const o = ws.output;
  const format = opts.format ?? formatOf(send);
  const length = lengthOf(format);
  const { narratives, setNarratives, reload, error: loadError, writing } = useNarratives(ws.reportId, ws.revealed);
  const [writeError, setWriteError] = useState<string | null>(null);

  const both = o ? estimatesChangeTheAnswer(o) : false;
  const result: ResultKind = o ? (both ? send.result ?? answerResult(o) : answerResult(o)) : 'on_facts';
  const codeDrafts = useMemo(() => (o && ws.revealed ? headlineDrafts(o.headline_facts[result], hasHomeSize(o)) : []), [o, ws.revealed, result]);
  const inputFor = useCallback(
    (len: EmailLength) => (o ? writerInputKey(writerInputFrom({ output: o, comps: ws.comps, intake: ws.intake, brief: ws.brief, send, result, length: len })) : ''),
    [o, ws.comps, ws.intake, ws.brief, send, result],
  );
  const currentInput = useMemo(() => inputFor(length), [inputFor, length]);

  const off = ws.readOnly;
  const setSend = (patch: Partial<SendState>) => ws.setSend({ ...send, ...patch });

  if (!o || !ws.revealed) {
    return { ready: false as const, revealed: ws.revealed, o, writeError, loadError };
  }

  // The writer's drafts for a length and this result, newest first. The email uses the newest that finished.
  const mineFor = (len: EmailLength) => narratives.filter((n) => n.origin === 'writer' && n.length === len && n.result === result);
  const doneFor = (len: EmailLength) => mineFor(len).find((n) => n.status === 'done');
  const writtenFor = (len: EmailLength): Written | null => {
    const d = doneFor(len);
    return d && !send.useTemplate ? (d.content as Written) : null;
  };
  const mine = mineFor(length);
  const done = doneFor(length);
  const lastTry = mine.find((n) => n.status === 'done' || n.status === 'failed');
  const failed = lastTry?.status === 'failed' ? lastTry : null;
  const written = writtenFor(length);
  const usesWriter = Boolean(written);
  const draftOutOfDate = Boolean(usesWriter && done && done.inputKey !== currentInput);
  const everWritten = narratives.some((n) => n.origin === 'writer');

  const homeLine = [ws.intake.address?.value.split(',')[0], ws.intake.unit?.value].filter(Boolean).join(' ') || ws.report.title;
  const home = homeName(ws.intake.unit?.value, ws.intake.address?.value.split(',')[0]);
  const signedAs = send.signOff?.value ?? ws.agentName;
  const client = ws.brief.clientName?.value ?? send.clientName?.value;
  const emailFor = (len: EmailLength, headline: string | undefined = send.headline?.value): EmailDraft => buildEmail({
    homeLine,
    audience: ws.brief.audience?.value ?? null,
    output: o,
    result,
    comps: ws.comps,
    agentName: signedAs,
    clientName: client,
    headline,
    chosen: send.chosen?.value,
    consider: send.consider?.value,
    nextStep: send.nextStep?.value,
    length: len,
    sample: ws.report.sampleData,
    written: writtenFor(len)?.sections ?? null,
  });
  const email = emailFor(length);
  const basedOn = fp(email);

  // The agent's edits: one draft, at the length it was edited at. Its fingerprint says which;
  // one that matches no length's email any more is out of date, and shows where it is, marked.
  const draft = send.draft;
  let draftLength: EmailLength | null = null;
  if (draft) {
    if (draft.basedOn === basedOn) draftLength = length;
    else draftLength = LENGTHS.find((len) => len !== length && fp(emailFor(len)) === draft.basedOn) ?? null;
  }
  const draftHere = draft && (draftLength === null || draftLength === length) ? draft : null;
  /** The agent edited another length's email: this one shows as drafted, locked until they start it fresh. */
  const editedElsewhere = draft && draftLength && draftLength !== length ? draftLength : null;
  const shown = draftHere ? { subject: draftHere.subject, text: draftHere.body } : { subject: email.subject, text: email.text };
  const stale = Boolean(draftHere && draftLength === null);
  const parentId = draftHere ? draftHere.parentId ?? null : usesWriter ? done!.id : null;

  // QA (§9): every number against the facts, the comps, the table, and what the agent stated.
  const agentNumber = o.headline_facts[result].agent_number?.facts.map((f) => f.value) ?? [];
  const ledger = ledgerFor({
    output: o, result, comps: ws.comps, intake: ws.intake,
    agentText: [send.chosen?.value, send.consider?.value, send.nextStep?.value, signedAs, client, ...ws.comps.map((c) => noteOf(c.judgment))],
    agentFigures: [...agentNumber, ws.target?.price.value, ws.dealTerms?.price?.value, ws.dealTerms?.sellerTarget?.value].filter((v): v is number => typeof v === 'number'),
  });
  const acks = send.acks ?? [];
  const headline = send.headline?.value ?? '';
  const checks = draftChecks({ text: `${shown.subject}\n${shown.text}`, headline: send.headline?.value, ledger, result, output: o, sample: ws.report.sampleData, acks });
  const issues = sendIssues({ checks, body: shown.text, headline, ledger, output: o, result, acks });
  const status = qaStatus(checks);
  const copyable = status.ready && issues.every((i) => !i.blocking);
  const headlinePicks = written ? written.headlines : codeDrafts;

  /** The designed email: the Full draft (the agent's, when they edited the Full one), laid out. */
  const designed = (): string => {
    const full = draftLength === 'full' && draft ? { subject: draft.subject, text: draft.body } : length === 'full' ? shown : emailFor('full');
    const parsed = parseEmailText(full.text, send.headline?.value);
    const { anchor, others } = designedComps(countedComps(o, result, ws.comps), { parsed, homeStreet: ws.intake.address?.value ?? null, sf: ws.sf });
    const range = o.results[result].range;
    const h = o.headline_facts[result];
    const lowSf = fact(h, 'range.low_per_sqft');
    const highSf = fact(h, 'range.high_per_sqft');
    return designedHtml({
      origin: location.origin,
      preparedFor: client?.trim() || 'you',
      month: monthOf(ws.today),
      title: homeLine,
      sub: homeSub(ws.intake),
      eyebrow: designedEyebrow(ws.side, home),
      range: range ? `${clientPrice(range.low.value)} – ${clientPrice(range.high.value)}` : null,
      perSqft: ws.sf && lowSf && highSf ? `${psf(lowSf.value)} – ${psf(highSf.value)} a square foot` : null,
      email: parsed,
      anchor,
      others,
      agent: { name: signedAs, office: OFFICE, email: ws.report.ownerEmail || null },
      cta: designedCta(ws.side),
      subject: full.subject,
    });
  };

  const now = () => new Date().toISOString();

  /** An edit to the shown email: it becomes (or stays) the agent's draft. */
  const edit = (change: { subject?: string; body?: string }) => {
    if (off || editedElsewhere) return;
    setSend({ draft: { subject: shown.subject, body: shown.text, ...change, basedOn: draftHere?.basedOn ?? basedOn, at: now(), parentId } });
  };

  /** The headline; an edited body's copy of it changes with it, so the two agree (and the draft stays current). */
  const setHeadline = (value: string) => {
    if (off) return;
    const next: SendState = { ...send };
    if (value) next.headline = entry(value, ws.today);
    else delete next.headline;
    if (draft && draftLength) {
      next.draft = { ...draft, body: syncHeadline(draft.body, send.headline?.value, value), basedOn: fp(emailFor(draftLength, value || undefined)) };
    }
    ws.setSend(next);
  };

  /** QA's fixes (all of them, or one issue's): on the plain text, and on the headline where it's flagged. */
  const fix = (only?: SendIssue) => {
    if (off || editedElsewhere) return;
    const target = only ? [only] : issues.filter((i) => i.fix);
    if (!target.length) return;
    const fixed = applyFixes({ body: shown.text, headline }, target);
    const next: SendState = { ...send };
    const headlineChanged = fixed.headline !== headline;
    if (headlineChanged) next.headline = entry(fixed.headline, ws.today);
    const fresh = emailFor(length, headlineChanged ? fixed.headline : send.headline?.value);
    if (draftHere) next.draft = { ...draftHere, body: fixed.body, basedOn: stale ? draftHere.basedOn : fp(fresh), at: now() };
    else if (fixed.body !== fresh.text) next.draft = { subject: shown.subject, body: fixed.body, basedOn: fp(fresh), at: now(), parentId };
    ws.setSend(next);
  };

  const answer = (issue: SendIssue, how: Acknowledgment['how']) => {
    if (off) return;
    setSend({ acks: [...acks.filter((a) => a.key !== issue.key), { key: issue.key, how, text: findingText(issue.key), at: now() }] });
  };

  async function writeIt(len: EmailLength = length, fmt: Format = format) {
    if (off) return;
    setWriteError(null);
    try {
      await ws.flush(); // the server reads the lines the agent sees
      const keep = draftHere ? { parentId, headline, subject: draftHere.subject, text: draftHere.body, acknowledgments: acks } : undefined;
      const { narrative } = await narrativesApi.write(ws.reportId, { length: len, result, ...(keep ? { keep } : {}) });
      ws.setSend({ ...send, format: fmt, length: len, draft: undefined, useTemplate: false });
      setNarratives((list) => [narrative, ...list.filter((n) => n.id !== narrative.id)]);
      void narrativesApi.start(ws.reportId, narrative.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'write_in_progress') await reload();
      setWriteError(e instanceof Error ? e.message : String(e));
    }
  }

  /** A tab. Once the writer is in use, a length without a current draft of its own gets one (CR-5). */
  function pickFormat(f: Format) {
    if (f === format) return;
    const len = lengthOf(f);
    const has = narratives.some((n) => n.origin === 'writer' && n.length === len && n.result === result && n.status === 'done' && n.inputKey === inputFor(len));
    if (!off && len !== length && everWritten && !send.useTemplate && !has && !writing && !draft) void writeIt(len, f);
    else setSend({ format: f, length: len });
  }

  /** Copies the shown format: Designed as HTML (with plain text beside it), Full and Short as rich text, Text as plain. Logged. */
  async function copy(): Promise<boolean> {
    if (!copyable) return false;
    const text = shown.text;
    let ok = true;
    try {
      if (format === 'text') {
        await navigator.clipboard.writeText(text);
      } else {
        const html = format === 'designed' ? designed() : draftHere ? htmlFromText(text) : email.html;
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          })]);
        } else {
          await navigator.clipboard.writeText(text);
        }
      }
    } catch {
      ok = copyByHand(text);
    }
    if (!ok) {
      ws.toast('It didn’t copy. Select the text and copy it yourself.');
      return false;
    }
    ws.toast(format === 'text' ? 'Copied. Paste it into your text.' : 'Copied. Paste into Gmail.');
    if (off) return true;
    ws.setSend({ ...send, copiedAt: now() });
    // The log: what went out, its checks and the agent's answers (§9.1). The same checks gate Copy here.
    const keys = new Set([...checks.flatMap((c) => c.items ?? []).map((i) => i.key), ...acks.filter((a) => a.key.startsWith('rounding:')).map((a) => a.key)]);
    try {
      await narrativesApi.copied(
        ws.reportId,
        { parentId, length, result, headline, subject: shown.subject, text },
        { ...qaRecord(checks), send: { format, issues: issues.map((i) => ({ key: i.key, text: i.text, blocking: i.blocking })) } },
        acks.filter((a) => keys.has(a.key)),
      );
    } catch (e) {
      setWriteError(`Copied, but the log didn’t save: ${e instanceof Error ? e.message : String(e)}`);
    }
    return true;
  }

  const markSent = () => {
    if (off || !send.copiedAt) return;
    ws.setSend({ ...send, format, sentAt: now() });
    ws.go('done');
  };

  const reopen = () => {
    if (off) return;
    const { sentAt: _sent, ...rest } = send;
    ws.setSend(rest);
    ws.go('send');
  };

  return {
    ready: true as const,
    revealed: true,
    o,
    format,
    length,
    result,
    both,
    send,
    off,
    homeLine,
    home,
    client,
    signedAs,
    shown,
    draftHere,
    editedElsewhere,
    stale,
    usesWriter,
    written,
    writing,
    failed,
    done,
    everWritten,
    draftOutOfDate,
    headlinePicks,
    checks,
    issues,
    status,
    copyable,
    writeError,
    loadError,
    designed,
    edit,
    setSend,
    setHeadline,
    fix,
    answer,
    writeIt,
    pickFormat,
    copy,
    markSent,
    reopen,
  };
}

export type SendModel = Extract<ReturnType<typeof useSendEmail>, { ready: true }>;
