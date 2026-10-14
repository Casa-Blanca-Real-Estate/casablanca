// Send (`02-screens.md`; §9, §10.2; Dispatch 13). The headline first: one
// sentence, the agent's, required before the email can be copied (D-21).
// "Write it" has Claude draft the headlines and the email's sections in the
// house voice, in Frankie's order (CR-5), in the background; the agent picks a
// headline or writes their own, then edits the email inline. The frame stays
// the code's. If the writer fails, the fixed template stands in, and says so.
// QA is one status line that opens to the checks: every number is checked,
// and a finding the agent keeps is answered for and logged when they copy.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResultKind } from '../../../engine/index.ts';
import { ApiError, narrativesApi, type NarrativeView } from '../../api.ts';
import { buildEmail, headlineDrafts, htmlFromText, type EmailLength, type WrittenSections } from '../../../workspace/email.ts';
import { draftChecks, ledgerFor, qaRecord, qaStatus, type Acknowledgment, type QaItem } from '../../../workspace/qa.ts';
import { answerResult, estimatesChangeTheAnswer } from '../../../workspace/reading.ts';
import type { Entry, SendState } from '../../../workspace/state.ts';
import { writerInputFrom, writerInputKey } from '../../../workspace/writer-input.ts';
import { BuildNote, entry, Field, StubTag, TextInput } from './bits.tsx';
import { fingerprint, type StepProps } from './model.ts';

const LENGTHS: { id: EmailLength; label: string }[] = [
  { id: 'full', label: 'Full' },
  { id: 'short', label: 'Short' },
  { id: 'text', label: 'Text message' },
];

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

export function SendStep({ ws }: StepProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [openChecks, setOpenChecks] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const o = ws.output;
  const send = ws.send;
  const off = ws.readOnly;
  const setSend = (patch: Partial<SendState>) => ws.setSend({ ...send, ...patch });
  const setText = (key: 'headline' | 'chosen' | 'consider' | 'nextStep') => (v: Entry<string> | undefined) => {
    const next = { ...send };
    if (v) next[key] = v;
    else delete next[key];
    ws.setSend(next);
  };
  const { narratives, setNarratives, reload, error: loadError, writing } = useNarratives(ws.reportId, ws.revealed);

  const both = o ? estimatesChangeTheAnswer(o) : false;
  const result: ResultKind = o ? (both ? send.result ?? answerResult(o) : answerResult(o)) : 'on_facts';
  const length = send.length ?? 'full';
  const codeDrafts = useMemo(() => (o && ws.revealed ? headlineDrafts(o.headline_facts[result]) : []), [o, ws.revealed, result]);
  const inputFor = useCallback(
    (len: EmailLength) => (o ? writerInputKey(writerInputFrom({ output: o, comps: ws.comps, intake: ws.intake, brief: ws.brief, send, result, length: len })) : ''),
    [o, ws.comps, ws.intake, ws.brief, send, result],
  );
  const currentInput = useMemo(() => inputFor(length), [inputFor, length]);

  if (!ws.revealed) {
    return (
      <div className="send">
        <p className="muted">The email quotes what the comps say, so it waits for your number on Findings.</p>
        <button type="button" className="btn" onClick={() => ws.go('findings')}>Go to Findings</button>
      </div>
    );
  }
  if (!o) return <p className="notice error-notice">The engine couldn’t compute{ws.engineError ? `: ${ws.engineError}` : '.'}</p>;

  // The writer's drafts for this length and result, newest first. The email uses the newest that finished.
  const mine = narratives.filter((n) => n.origin === 'writer' && n.length === length && n.result === result);
  const done = mine.find((n) => n.status === 'done');
  const lastTry = mine.find((n) => n.status === 'done' || n.status === 'failed');
  const failed = lastTry?.status === 'failed' ? lastTry : null;
  const usesWriter = Boolean(done) && !send.useTemplate;
  const written = usesWriter ? (done!.content as Written) : null;
  const draftOutOfDate = Boolean(usesWriter && done && done.inputKey !== currentInput);
  const everWritten = narratives.some((n) => n.origin === 'writer');

  const homeLine = [ws.intake.address?.value.split(',')[0], ws.intake.unit?.value].filter(Boolean).join(' ') || ws.report.title;
  const signedAs = send.signOff?.value ?? ws.agentName;
  const email = buildEmail({
    homeLine,
    audience: ws.brief.audience?.value ?? null,
    output: o,
    result,
    comps: ws.comps,
    agentName: signedAs,
    clientName: ws.brief.clientName?.value ?? send.clientName?.value,
    headline: send.headline?.value,
    chosen: send.chosen?.value,
    consider: send.consider?.value,
    nextStep: send.nextStep?.value,
    length,
    sample: ws.report.sampleData,
    written: written?.sections ?? null,
  });
  const basedOn = fingerprint(`${email.subject}\n${email.text}`);
  const draft = send.draft;
  const shown = draft ? { subject: draft.subject, text: draft.body } : email;
  const stale = Boolean(draft && draft.basedOn !== basedOn);
  const parentId = draft ? draft.parentId ?? null : usesWriter ? done!.id : null;

  // QA (§9): every number against the facts, the comps, the table, and what the agent stated.
  const agentNumber = o.headline_facts[result].agent_number?.facts.map((f) => f.value) ?? [];
  const ledger = ledgerFor({
    output: o, result, comps: ws.comps, intake: ws.intake,
    agentText: [send.chosen?.value, send.consider?.value, send.nextStep?.value, signedAs, ws.brief.clientName?.value, ...ws.comps.map((c) => c.judgment?.reasons.at(-1)?.reason)],
    agentFigures: [...agentNumber, ws.target?.price.value, ws.dealTerms?.price?.value, ws.dealTerms?.sellerTarget?.value].filter((v): v is number => typeof v === 'number'),
  });
  const acks = send.acks ?? [];
  const checks = draftChecks({ text: `${shown.subject}\n${shown.text}`, headline: send.headline?.value, ledger, result, output: o, sample: ws.report.sampleData, acks });
  const status = qaStatus(checks);

  const edit = (change: { subject?: string; body?: string }) =>
    setSend({ draft: { subject: shown.subject, body: shown.text, ...change, basedOn: draft?.basedOn ?? basedOn, at: new Date().toISOString(), parentId } });

  const answer = (item: QaItem, how: Acknowledgment['how']) =>
    setSend({ acks: [...acks.filter((a) => a.key !== item.key), { key: item.key, how, text: item.text, at: new Date().toISOString() }] });

  async function writeIt(len: EmailLength = length) {
    if (off) return;
    setWriteError(null);
    try {
      await ws.flush(); // the server reads the lines the agent sees
      const keep = draft ? { parentId, headline: send.headline?.value ?? '', subject: draft.subject, text: draft.body, acknowledgments: acks } : undefined;
      const { narrative } = await narrativesApi.write(ws.reportId, { length: len, result, ...(keep ? { keep } : {}) });
      ws.setSend({ ...send, length: len, draft: undefined, useTemplate: false });
      setNarratives((list) => [narrative, ...list.filter((n) => n.id !== narrative.id)]);
      void narrativesApi.start(ws.reportId, narrative.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'write_in_progress') await reload();
      setWriteError(e instanceof Error ? e.message : String(e));
    }
  }

  function pickLength(len: EmailLength) {
    if (len === length) return;
    // Length switches rewrite: once the writer is in use, a length without a current draft gets one.
    const has = narratives.some((n) => n.origin === 'writer' && n.length === len && n.result === result && n.status === 'done' && n.inputKey === inputFor(len));
    if (everWritten && !send.useTemplate && !has && !writing && !draft) void writeIt(len);
    else setSend({ length: len });
  }

  async function copy() {
    if (!status.ready) return;
    const text = shown.text;
    const html = draft ? htmlFromText(text) : email.html;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      bodyRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(new Date().toLocaleTimeString());
    if (off) return;
    setSend({ copiedAt: new Date().toISOString() });
    // The log: what went out, its checks and the agent's answers (§9.1). The same checks gate Copy here.
    const keys = new Set(checks.flatMap((c) => c.items ?? []).map((i) => i.key));
    try {
      await narrativesApi.copied(ws.reportId, { parentId, length, result, headline: send.headline?.value ?? '', subject: shown.subject, text },
        qaRecord(checks), acks.filter((a) => keys.has(a.key)));
    } catch (e) {
      setWriteError(`Copied, but the log didn’t save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const headlinePicks = written ? written.headlines : codeDrafts;

  return (
    <div className="send">
      <section className="headline" aria-label="The headline">
        <div className="label">The headline</div>
        <TextInput
          label="Your headline"
          multiline
          value={send.headline}
          onChange={setText('headline')}
          today={ws.today}
          disabled={off}
          placeholder="One sentence, yours: what the comps show"
        />
        {!off && headlinePicks.length > 0 && (
          <div className="drafts">
            <span className="muted small">{written ? 'Claude’s drafts' : 'Drafts from the numbers'} — pick one, then make it yours:</span>
            <ul className="plain">
              {headlinePicks.map((d) => (
                <li key={d}>
                  <button type="button" className="link small" onClick={() => setText('headline')(entry(d, ws.today))}>{d}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <BuildNote>
          Code drafts cite only <code>headline_facts</code> and its names. Claude’s drafts are written from the same facts and the comps that count,
          never the agent’s number or target (§8.4); QA checks every number in the email against them and what the agent stated (§9.1).
        </BuildNote>
      </section>

      <div className="card email">
        <div className="row wrap writer-bar">
          {!off && (
            <button type="button" className={`btn ${everWritten ? '' : 'primary'}`} disabled={Boolean(writing)} onClick={() => void writeIt()}>
              {writing ? 'Writing…' : usesWriter ? 'Write it again' : 'Write it'}
            </button>
          )}
          {writing && (
            <span className="muted small" role="status">
              Claude is drafting the {writing.length === 'text' ? 'text message' : `${writing.length} email`}
              {writing.progress ? ` (${writing.progress.toLocaleString('en-US')} characters so far)` : ''}…
            </span>
          )}
          {!off && done && !writing && (
            send.useTemplate
              ? <button type="button" className="link small" onClick={() => setSend({ useTemplate: false, draft: undefined })}>Use Claude’s draft</button>
              : <button type="button" className="link small" onClick={() => setSend({ useTemplate: true, draft: undefined })}>Use the template instead</button>
          )}
        </div>
        {!everWritten && !writing && <p className="muted small">Claude drafts the headlines and the email from the comps that count, in the house voice. Or edit the template below.</p>}
        {failed && !writing && (
          <p className="notice">
            {done && !send.useTemplate
              ? `The newest draft didn’t come through, so this is the one before it. ${failed.errorMessage ?? ''}`
              : `The writer couldn’t draft this one, so this is the template. ${failed.errorMessage ?? ''} Edit it, or write it again.`}
          </p>
        )}
        {(writeError || loadError) && <p className="notice error-notice">{writeError ?? loadError}</p>}
        {draftOutOfDate && !writing && (
          <p className="notice">The numbers or your lines changed since Claude drafted this. Write it again to pick them up.</p>
        )}

        <div className="grid">
          <Field label="How you chose the comps" wide>
            <TextInput label="How you chose the comps" value={send.chosen} onChange={setText('chosen')} today={ws.today} disabled={off} placeholder="e.g. I focused on lower floors and homes close in size." />
          </Field>
          <Field label="Things to consider" wide>
            <TextInput label="Things to consider" multiline value={send.consider} onChange={setText('consider')} today={ws.today} disabled={off} placeholder="Buildings that trade higher or lower, carrying costs, recent activity in the building" />
          </Field>
          <Field label="The next step" wide hint={usesWriter ? 'Claude keeps your next step’s meaning and numbers.' : undefined}>
            <TextInput
              label="The next step"
              multiline
              value={send.nextStep}
              onChange={setText('nextStep')}
              today={ws.today}
              disabled={off}
              placeholder={ws.brief.audience?.value === 'seller' ? 'Where you’d list it, and why' : 'What you’d offer, and on what terms'}
            />
          </Field>
          <Field label="Signed">
            <TextInput label="Signed" value={send.signOff} onChange={(v) => setSend({ signOff: v })} today={ws.today} disabled={off} placeholder={ws.agentName || 'Your name'} />
          </Field>
          <Field label="To">
            <TextInput
              label="Client name"
              value={ws.brief.clientName ?? send.clientName}
              onChange={(v) => {
                const brief = { ...ws.brief };
                if (v) brief.clientName = v;
                else delete brief.clientName;
                ws.setBrief(brief);
              }}
              today={ws.today}
              disabled={off}
              placeholder="Client name"
            />
          </Field>
          <Field label="About the client (for you)" wide hint="What matters to them. It isn’t quoted in the email, and Claude doesn’t see it.">
            <TextInput
              label="Client note"
              value={ws.brief.clientNote}
              onChange={(v) => {
                const brief = { ...ws.brief };
                if (v) brief.clientNote = v;
                else delete brief.clientNote;
                ws.setBrief(brief);
              }}
              today={ws.today}
              disabled={off}
            />
          </Field>
          <div className="field">
            <span className="field-label">Length</span>
            <div className="segmented" role="radiogroup" aria-label="Length">
              {LENGTHS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={length === l.id} className={length === l.id ? 'on' : ''} disabled={off || Boolean(writing)} onClick={() => pickLength(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          {both && (
            <Field label="Which result" hint={result === 'with_estimates' ? 'Uses your estimates — the email says so.' : 'On the facts: no estimate of yours in it.'}>
              <select aria-label="Which result the email uses" value={result} disabled={off} onChange={(e) => setSend({ result: e.target.value as ResultKind })}>
                <option value="on_facts" disabled={!o.results.on_facts.range}>On the facts{o.results.on_facts.range ? '' : ' (no range)'}</option>
                <option value="with_estimates">With your estimates</option>
              </select>
            </Field>
          )}
        </div>

        {stale && (
          <p className="notice">
            The numbers, your lines or the draft changed since you edited this email.{' '}
            <button type="button" className="link" onClick={() => setSend({ draft: undefined })}>Back to the {usesWriter ? 'draft' : 'template'}</button> to pick them up.
          </p>
        )}
        <label className="field">
          <span className="field-label">Subject</span>
          <input aria-label="Email subject" value={shown.subject} readOnly={off} onChange={(e) => edit({ subject: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Email{usesWriter ? ' — Claude’s draft, yours to edit' : ''}</span>
          <textarea ref={bodyRef} aria-label="Email body" className="email-body" value={shown.text} readOnly={off} rows={length === 'text' ? 8 : 22} onChange={(e) => edit({ body: e.target.value })} />
        </label>

        <div className="qa">
          <button type="button" className={`link qa-line ${status.ready ? 'ready' : 'fix'}`} aria-expanded={openChecks} onClick={() => setOpenChecks((x) => !x)}>
            {status.line}
          </button>
          {openChecks && (
            <ul className="plain checks">
              {checks.map((c) => (
                <li key={c.id} className={c.state}>
                  {c.message}
                  {c.items && c.items.length > 0 && (
                    <ul className="plain qa-items">
                      {c.items.map((i) => (
                        <li key={i.key}>
                          <strong>{i.text}</strong> <span className="muted small">{i.context}{i.note ? ` · ${i.note}` : ''}</span>
                          {c.needsAck && !off && (i.ack
                            ? <span className="muted small"> · {i.ack.how === 'attributed' ? 'yours, attributed' : 'kept, acknowledged'}</span>
                            : (
                              <span className="qa-answers">
                                {c.id === 'numbers' && <button type="button" className="link small" onClick={() => answer(i, 'attributed')}>It’s mine or the client’s</button>}
                                <button type="button" className="link small" onClick={() => answer(i, 'acknowledged')}>Keep it</button>
                              </span>
                            ))}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="row wrap">
          <button type="button" className="btn primary" disabled={!status.ready} onClick={() => void copy()} title={status.ready ? 'Copies it as rich text, with the comps as links' : 'Fix what QA found first'}>
            Copy the email
          </button>
          {draft && !off && <button type="button" className="btn" onClick={() => setSend({ draft: undefined })}>Back to the {usesWriter ? 'draft' : 'template'}</button>}
          {copied && <span className="muted small">Copied at {copied}.</span>}
        </div>
        <BuildNote>
          <StubTag>CR-5</StubTag> The writer runs in a background function; each draft is pinned to its numbers (<code>narratives</code>). Phase 2 adds the agent’s own voice and the client profile.{' '}
          <StubTag>CR-6</StubTag> The client report and its PDF come with Kimani’s template.
        </BuildNote>
      </div>
    </div>
  );
}
