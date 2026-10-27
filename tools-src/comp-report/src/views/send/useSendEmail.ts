// The email behind Send and Done (Dispatch 13's writer and QA, Dispatch 14's
// tabs, Dispatch 18's subject and drafts): the writer's drafts, polled while
// one is written; the email for each length, from the template or the
// writer's sections; the agent's edited plain text (send.drafts, the source of
// truth), one per length; the subject, its own field; QA's checks and the
// issues they make; the designed email and the formatted copy; and the
// actions — edit, fix, answer, write, copy (logged), mark as sent, reopen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ResultKind } from '../../../engine/index.ts';
import { cleanPhotoUrls } from '../../../engine/index.ts';
import { ApiError, clientWordsApi, narrativesApi, type EmailPhotos, type HubertEmailEdit, type NarrativeView } from '../../api.ts';
import { buildEmail, countedComps, hasHomeSize, headlineDrafts, type EmailDraft, type EmailLength, type WrittenSections } from '../../../workspace/email.ts';
import { clientPrice, psf } from '../../../workspace/format.ts';
import { draftChecks, ledgerFor, qaRecord, qaStatus, syncHeadline, type Acknowledgment } from '../../../workspace/qa.ts';
import { answerResult, estimatesChangeTheAnswer, fact, homeName } from '../../../workspace/reading.ts';
import { noteOf, type SendState } from '../../../workspace/state.ts';
import { writerInputFrom, writerInputKey } from '../../../workspace/writer-input.ts';
import { entry } from '../workspace/bits.tsx';
import type { Workspace } from '../workspace/model.ts';
import { designedCta, designedEyebrow, formatOf, homeSub, lengthOf, monthOf, OFFICE, type Format } from './copy.ts';
import { designedComps, designedHtml, emailHtml, parseEmailText } from './designed.ts';
import { afterCopy, bodyPrint, draftsOf, LENGTHS, sentState, setSubject, subjectOf, withDraft } from './drafts.ts';
import { applyFixes, sendIssues, type SendIssue } from './issues.ts';

type Written = { headlines: string[]; sections: WrittenSections };

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
  const basedOn = bodyPrint(email.text);

  // The agent's edits: a draft per length, each with the fingerprint of the email it was edited
  // from (the body; the subject is its own field). One whose email has changed since is out of date, and marked.
  const drafts = draftsOf(send, emailFor);
  const draftHere = drafts[length] ?? null;
  const stale = Boolean(draftHere && draftHere.basedOn !== basedOn);
  const subject = subjectOf(send, drafts, email.subject);
  const shown = { subject, text: draftHere ? draftHere.body : email.text };
  const parentId = draftHere ? draftHere.parentId ?? null : usesWriter ? done!.id : null;

  // QA (§9): every number against the facts, the comps, the table, and what the agent stated.
  const agentNumber = o.headline_facts[result].agent_number?.facts.map((f) => f.value) ?? [];
  const ledger = ledgerFor({
    output: o, result, comps: ws.comps, intake: ws.intake,
    agentText: [send.chosen?.value, send.consider?.value, send.nextStep?.value, signedAs, client, ...ws.comps.map((c) => noteOf(c.judgment)), ...ws.comps.map((c) => c.judgment?.clientLine?.text)],
    agentFigures: [...agentNumber, ws.target?.price.value, ws.dealTerms?.price?.value, ws.dealTerms?.sellerTarget?.value].filter((v): v is number => typeof v === 'number'),
  });
  const acks = send.acks ?? [];
  const headline = send.headline?.value ?? '';
  const checks = draftChecks({ text: `${shown.subject}\n${shown.text}`, headline: send.headline?.value, ledger, result, output: o, sample: ws.report.sampleData, acks });
  const issues = sendIssues({ checks, body: shown.text, headline, ledger, output: o, result, acks });
  const status = qaStatus(checks);
  const copyable = status.ready && issues.every((i) => !i.blocking);
  const headlinePicks = written ? written.headlines : codeDrafts;

  const outById = new Map(o.comps.map((c) => [c.id, c]));
  const homeRead = ws.reads.filter((r) => r.purpose === 'subject' && r.status === 'done').at(-1);
  const homePhoto = homeRead?.extract ? cleanPhotoUrls([homeRead.extract['heroImageUrl'], ...(Array.isArray(homeRead.extract['photos']) ? homeRead.extract['photos'] : [])])[0] ?? null : null;
  const shownRows = () => {
    const full = drafts.full ? drafts.full.body : emailFor('full').text;
    const parsed = parseEmailText(full, send.headline?.value);
    return { parsed, ...designedComps(countedComps(o, result, ws.comps), { parsed, homeStreet: ws.intake.address?.value ?? null, sf: ws.sf }) };
  };

  /**
   * The designed email: the Full draft's words (the agent's, when they edited the Full one), laid out with a box
   * per comp. On screen its photos are the listings' own; `copies` swaps in the ones Casa keeps (at copy time).
   */
  const designed = (copies?: EmailPhotos): string => {
    const full = { subject, text: drafts.full ? drafts.full.body : emailFor('full').text };
    const parsed = parseEmailText(full.text, send.headline?.value);
    const { anchor, others } = designedComps(countedComps(o, result, ws.comps), {
      parsed,
      homeStreet: ws.intake.address?.value ?? null,
      sf: ws.sf,
      rate: (c) => outById.get(c.id)?.per_result[result].price_per_sqft?.value ?? null,
      photo: (c) => {
        if (!copies) return c.judgment?.photos?.[0] ?? null;
        const id = c.judgment?.reportCompId;
        const kept = id ? copies.comps[id] : undefined;
        return kept ? `${location.origin}${kept}` : c.judgment?.photos?.[0] ?? null;
      },
    });
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
      homePhoto: copies ? (copies.home ? `${location.origin}${copies.home}` : homePhoto) : homePhoto,
    });
  };

  /**
   * The photos for a copy (Dispatch 26 item 4): each shown comp's hero photo, and the home's, copied into Casa's
   * store and served from this site. If the copy fails, the listings' own links stand in, as on screen.
   */
  const photoCopies = async (): Promise<EmailPhotos | undefined> => {
    const { anchor, others } = shownRows();
    const ids = [anchor, ...others].map((c) => c?.id).filter((id): id is string => Boolean(id));
    try {
      return await clientWordsApi.photos(ws.reportId, ids);
    } catch (e) {
      console.warn('comp report: the email’s photos weren’t copied; the listings’ own links stand in', e);
      return undefined;
    }
  };

  const now = () => new Date().toISOString();

  /** An edit to the shown body: it becomes (or stays) this length's draft. The others are kept. */
  const edit = (body: string) => {
    if (off) return;
    ws.setSend(withDraft(send, drafts, length, { body, basedOn: draftHere?.basedOn ?? basedOn, at: now(), parentId }));
  };

  /** The subject: its own field, so editing it freezes no body into a draft. */
  const editSubject = (value: string) => {
    if (off) return;
    ws.setSend(setSubject(send, value, ws.today));
  };

  /**
   * Hubert's edits (server/hubert-email.ts), applied as one change the way the
   * agent's own typing would be: the lines and subject set, the body's passages
   * replaced in this length's draft, the headline synced into each current
   * draft. Returns what couldn't be applied (the agent changed it meanwhile).
   */
  const applyHubert = (edits: HubertEmailEdit[]): { applied: number; missed: string[] } => {
    if (off) return { applied: 0, missed: ['This report is read-only.'] };
    let next: SendState = { ...send };
    let all = drafts;
    let applied = 0;
    const missed: string[] = [];
    let newHeadline: string | undefined;
    const LINE = { chosen: 'chosen', consider: 'consider', next_step: 'nextStep', signed: 'signOff' } as const;
    for (const e of edits) {
      for (const c of e.changes) {
        if (c.field === 'headline') newHeadline = c.text;
        else if (c.field === 'subject') next.subject = entry(c.text, ws.today);
        else if (c.text) next[LINE[c.field]] = entry(c.text, ws.today);
        else delete next[LINE[c.field]];
        applied++;
      }
      if (!e.bodyEdits.length) continue;
      if (e.length !== length) {
        const word = (l: EmailLength | null) => (l === 'text' ? 'text message' : `${l ?? 'other'} email`);
        missed.push(`Hubert edited the ${word(e.length)}, and the ${word(length)} is open now. Ask him again here.`);
        continue;
      }
      const mineNow = all[length];
      let body = mineNow ? mineNow.body : shown.text;
      for (const b of e.bodyEdits) {
        if (body.split(b.find).length !== 2) {
          missed.push(`“${b.find.slice(0, 48)}${b.find.length > 48 ? '…' : ''}” changed before Hubert’s edit reached it.`);
          continue;
        }
        body = body.replace(b.find, () => b.replace);
        applied++;
      }
      next = withDraft(next, all, length, { body, basedOn: mineNow?.basedOn ?? basedOn, at: now(), parentId: mineNow ? mineNow.parentId ?? null : parentId });
      all = next.drafts ?? {};
    }
    if (newHeadline !== undefined && newHeadline !== headline) {
      next.headline = entry(newHeadline, ws.today);
      for (const len of LENGTHS) {
        const d = all[len];
        if (!d || d.basedOn !== bodyPrint(emailFor(len).text)) continue;
        next = withDraft(next, all, len, { ...d, body: syncHeadline(d.body, send.headline?.value, newHeadline), basedOn: bodyPrint(emailFor(len, newHeadline).text) });
        all = next.drafts ?? {};
      }
    }
    if (applied) ws.setSend(next);
    return { applied, missed };
  };

  /** Back to the draft or the template, for this length only. */
  const discard = () => {
    if (off) return;
    ws.setSend(withDraft(send, drafts, length, undefined));
  };

  /** The headline; each edited body's copy of it changes with it, so the two agree (and a current draft stays current). */
  const setHeadline = (value: string) => {
    if (off) return;
    let next: SendState = { ...send };
    if (value) next.headline = entry(value, ws.today);
    else delete next.headline;
    let all = drafts;
    for (const len of LENGTHS) {
      const d = drafts[len];
      if (!d || d.basedOn !== bodyPrint(emailFor(len).text)) continue;
      next = withDraft(next, all, len, { ...d, body: syncHeadline(d.body, send.headline?.value, value), basedOn: bodyPrint(emailFor(len, value || undefined).text) });
      all = next.drafts ?? {};
    }
    ws.setSend(next);
  };

  /** QA's fixes (all of them, or one issue's): on the plain text, and on the headline where it's flagged. */
  const fix = (only?: SendIssue) => {
    if (off) return;
    const target = only ? [only] : issues.filter((i) => i.fix);
    if (!target.length) return;
    const fixed = applyFixes({ body: shown.text, headline }, target);
    let next: SendState = { ...send };
    const headlineChanged = fixed.headline !== headline;
    if (headlineChanged) next.headline = entry(fixed.headline, ws.today);
    const fresh = emailFor(length, headlineChanged ? fixed.headline : send.headline?.value);
    if (draftHere) next = withDraft(next, drafts, length, { ...draftHere, body: fixed.body, basedOn: stale ? draftHere.basedOn : bodyPrint(fresh.text), at: now() });
    else if (fixed.body !== fresh.text) next = withDraft(next, drafts, length, { body: fixed.body, basedOn: bodyPrint(fresh.text), at: now(), parentId });
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
      const mineNow = drafts[len];
      const keep = mineNow ? { parentId: mineNow.parentId ?? null, headline, subject, text: mineNow.body, acknowledgments: acks } : undefined;
      const { narrative } = await narrativesApi.write(ws.reportId, { length: len, result, ...(keep ? { keep } : {}) });
      ws.setSend({ ...withDraft(send, drafts, len, undefined), format: fmt, length: len, useTemplate: false });
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
    if (!off && len !== length && everWritten && !send.useTemplate && !has && !writing && !drafts[len]) void writeIt(len, f);
    else setSend({ format: f, length: len });
  }

  /**
   * What the Copy button puts on the clipboard: Designed (with Casa's copies of the photos) and the formatted
   * Full or Short as HTML, the plain text beside it; Text as plain. Designed's HTML is a promise: the photos are
   * copied first, and the clipboard item takes the promise so the copy keeps the click's permission.
   */
  const clipboard = (): { html: Promise<string> | string | null; text: string } => ({
    html: format === 'text' ? null : format === 'designed' ? photoCopies().then((copies) => designed(copies)) : emailHtml(shown.text, send.headline?.value),
    text: shown.text,
  });

  /** Copies the shown format (clipboard()). Logged. */
  async function copy(): Promise<boolean> {
    if (!copyable) return false;
    const { html, text } = clipboard();
    let ok = true;
    try {
      if (!html) {
        await navigator.clipboard.writeText(text);
      } else {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({
            'text/html': Promise.resolve(html).then((h) => new Blob([h], { type: 'text/html' })),
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
    ws.setSend(afterCopy(send, format, now()));
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

  /** The subject alone, as plain text. Not logged: the email's copy is. */
  async function copySubject(): Promise<boolean> {
    let ok = true;
    try {
      await navigator.clipboard.writeText(subject);
    } catch {
      ok = copyByHand(subject);
    }
    ws.toast(ok ? 'Subject copied.' : 'It didn’t copy. Select the subject and copy it yourself.');
    return ok;
  }

  /** Marked as sent, copied or not (NW-086 a): it records the tab last copied, and opens Done. */
  const markSent = () => {
    if (off) return;
    ws.setSend(sentState(send, format, now()));
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
    clipboard,
    edit,
    editSubject,
    discard,
    applyHubert,
    setSend,
    setHeadline,
    fix,
    answer,
    writeIt,
    pickFormat,
    copy,
    copySubject,
    markSent,
    reopen,
  };
}

export type SendModel = Extract<ReturnType<typeof useSendEmail>, { ready: true }>;
