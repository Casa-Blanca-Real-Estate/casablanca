// Hubert, the comp report's assistant (Dispatch 14), named after Casa Blanca's
// office at 10 Hubert St, Tribeca: the drawer beside every workspace screen.
// He answers and suggests, and changes a comp or the email when the agent
// tells him what to change (the tiers, notes and tags are still the agent's
// call); each change shows in his chat with "Show" to it. On Sort he greets the agent and points back to sales from their
// export they took out (the only sales he may name: never one that isn't in
// the report's data); elsewhere he answers questions about that screen. He
// never sees the agent's number or the target (D-4): nothing here shows them.
//
// The shell places the drawer (fixed, 380px, on the right); this fills it.
import { useEffect, useRef, useState } from 'react';
import type { CompJudgment } from '../../workspace/state.ts';
import type { CompRecord, ListingStatus } from '../../engine/index.ts';
import { noteOf } from '../../workspace/state.ts';
import { homeUndoStands } from '../../workspace/home-edit.ts';
import { undoStands } from '../../workspace/trail-undo.ts';
import { linksApi, type CompEdit, type HubertHomeEdit } from '../api.ts';
import { Chat } from './Chat.tsx';
import { greeting, intro, NEW_REPORT_CHIPS, NEW_REPORT_HINT, said, SUGGESTIONS_LATER, type Chip } from './hubert/copy.ts';
import { reachedGuides, STEP_NOW } from './hubert/guides.ts';
import type { GuideStep } from '../../workspace/state.ts';
import { monthYear, shortPrice } from './sort/rows.ts';
import { STATUS_LABEL } from './workspace/comps.tsx';
import type { Workspace } from './workspace/model.ts';
import { homeName } from './workspace/screens.ts';
import { entry } from './workspace/bits.tsx';
import { missingDetails } from './newcomp/start-words.ts';
import { followUpState } from '../../workspace/next-steps.ts';
import '../styles/hubert.css';

function addressOf(record: CompRecord): string {
  const street = record.identity.address.street ?? 'No address';
  const unit = record.identity.unit.raw;
  return unit ? `${street} ${unit.startsWith('#') ? unit : `#${unit}`}` : street;
}

function statusOf(record: CompRecord, j: CompJudgment): ListingStatus {
  return record.status.listing_status ?? record.status.evidence_class ?? j.evidenceClass;
}

/** "Sold Jul 2026 · Floor 5 · $4.05M": only what the export says. */
function subOf(record: CompRecord, status: ListingStatus): string {
  const f = record.facts;
  const price = status === 'sold' ? f.sale_price?.value : f.list_price?.value;
  return [
    f.status_date ? `${STATUS_LABEL[status]} ${monthYear(f.status_date.value)}` : STATUS_LABEL[status],
    f.floor ? `Floor ${f.floor.value}` : null,
    price ? shortPrice(price) : null,
  ].filter(Boolean).join(' · ');
}

interface Item {
  id: string;
  address: string;
  sub: string;
  status: ListingStatus;
  note: string | null;
}

/**
 * "You might also look at": rows of the agent's own export they took out, each
 * with "+ Add" to put it back (it comes back as it was, and still needs the
 * agent's tier, note and tag). With none, the section doesn't show.
 */
function Suggestions({ ws }: { ws: Workspace }) {
  const [added, setAdded] = useState<(Item & { hadNote: boolean })[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const items: Item[] = ws.suggestions.map(({ judgment: j, record }) => {
    const status = statusOf(record, j);
    return { id: j.reportCompId, address: addressOf(record), sub: subOf(record, status), status, note: noteOf(j) };
  });
  const back = added.filter((a) => !items.some((i) => i.id === a.id));
  if (!items.length && !back.length) return null;

  async function add(item: Item) {
    setAdding(item.id);
    try {
      await ws.editComp(item.id, { removed: false });
      setAdded((prev) => [...prev, { ...item, hadNote: Boolean(item.note) }]);
    } catch (e) {
      ws.toast(`Not added: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="hb-sug">
      <div className="hb-sug-head">You might also look at</div>
      {items.map((it) => (
        <div key={it.id} className="hb-sug-item">
          <div className="hb-sug-title">
            <span className={`hb-sq ${it.status}`} aria-hidden="true" />
            <span className="hb-sug-addr">{it.address}</span>
            {!ws.readOnly && (
              <button type="button" className="hb-sug-cta" disabled={adding !== null} onClick={() => void add(it)}>
                {adding === it.id ? 'Adding…' : '+ Add'}
              </button>
            )}
          </div>
          <div className="hb-sug-sub">{it.sub}</div>
          {it.note && <div className="hb-sug-why">Your note: {it.note}</div>}
        </div>
      ))}
      {back.map((it) => (
        <div key={it.id} className="hb-sug-item">
          <div className="hb-sug-title">
            <span className={`hb-sq ${it.status}`} aria-hidden="true" />
            <span className="hb-sug-addr">{it.address}</span>
            <span className="hb-sug-cta done">{it.hadNote ? 'Added' : 'Added · needs your note'}</span>
          </div>
          <div className="hb-sug-sub">{it.sub}</div>
        </div>
      ))}
    </div>
  );
}

/** On Done: Hubert's follow-up reminder, from What's next's ticks (state.doneChecks). */
function FollowUpBubble({ ws }: { ws: Workspace }) {
  const f = followUpState(ws.send.sentAt, ws.doneChecks);
  if (!f) return null;
  const client = ws.brief.clientName?.value ?? ws.send.clientName?.value;
  if (f === 'done') {
    return <div className="hb-bubble">You’ve followed up{client ? ` with ${client}` : ''}. {ws.doneChecks['plan-offer'] ? 'And the offer’s planned.' : 'Next on the list: plan the offer together.'}</div>;
  }
  if (f === 'waiting') return <div className="hb-bubble">Sent. If you haven’t heard{client ? ` from ${client}` : ''} in two days, follow up: I’ll remind you on Reports then.</div>;
  return (
    <div className="hb-bubble">
      It’s been two days or more since you sent this. Have you heard{client ? ` from ${client}` : ''}? If not, follow up, then tick it under What’s next.
    </div>
  );
}

/**
 * Where the agent is (Kimani, 2026-11-06): the step's name, large, and the one thing to do there, at the
 * top of Hubert's panel. When the step changes it flashes once, so the move is noticed.
 */
function StepNow({ step }: { step: GuideStep }) {
  const now = STEP_NOW[step];
  const [flash, setFlash] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1600);
    return () => {
      window.clearTimeout(t);
    };
  }, [step]);
  return (
    <div className={`hb-now${flash ? ' flash' : ''}`} aria-live="polite">
      <span className="hb-now-label">You’re on</span>
      <span className="hb-now-name">{now.name}</span>
      <span className="hb-now-todo">{now.todo}</span>
    </div>
  );
}

const PRICE_WORDS = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : `$${Math.round(n / 1e3)}K`);

/**
 * Start with Hubert (DP-20): beside step 2, what he took from the agent's words and what's still to do.
 * Written here, never generated. The side he defaulted can be switched in the bubble.
 */
function StartNoteBubbles({ ws }: { ws: Workspace }) {
  const note = ws.startNote;
  if (!note || !ws.starting) return null;
  const said = note.said;
  const bits = [
    said.side ? `a ${said.side} report` : null,
    said.client ? `for ${said.client}` : null,
    said.type ? (said.type === 'condo' ? 'a condo' : 'a co-op') : null,
    said.price ? `${said.side === 'seller' ? 'the client’s target' : 'the client’s budget'} at ${PRICE_WORDS(said.price)}` : null,
  ].filter(Boolean);
  const home = ws.reads.filter((r) => r.purpose === 'subject').at(-1) ?? null;
  const reading = note.from === 'link' && (!home || home.status === 'queued' || home.status === 'running');
  const failed = note.from === 'link' && home?.status === 'failed';
  const missing = missingDetails(ws.intake);
  const them = missing?.includes(' and ') ? 'them' : 'it';
  const off = ws.readOnly;
  return (
    <>
      <div className="hb-bubble">
        {bits.length ? `I’ve started the report from what you wrote: ${bits.join(', ')}.` : 'I’ve started the report from the listing.'}
        {!said.side && (
          <span className="hb-start-side">
            {' '}You didn’t say buyer or seller, so it’s {ws.side === 'seller' ? 'a seller' : 'a buyer'} report for now:{' '}
            {(['buyer', 'seller'] as const).map((a) => (
              <button
                key={a}
                type="button"
                className={`hb-start-pick${ws.side === a ? ' on' : ''}`}
                aria-pressed={ws.side === a}
                disabled={off}
                onClick={() => ws.setBrief({ ...ws.brief, audience: entry(a, ws.today) })}
              >{a === 'buyer' ? 'Buyer' : 'Seller'}</button>
            ))}
          </span>
        )}
        {!said.client && ' No client name yet: add it with ← Back.'}
        {!said.type && (note.from === 'link' ? ' Co-op or Condo follows the listing once it’s read.' : ` It’s ${ws.propertyType === 'condo' ? 'a condo' : 'a co-op'} for now: change it with ← Back.`)}
      </div>
      <div className="hb-bubble" aria-live="polite">
        {reading
          ? 'I’m reading the listing now. The details fill in here as it lands, and you can carry on meanwhile.'
          : failed
            ? 'I couldn’t read the listing. Type the details in, or tell me them (“1,850 feet, 2 beds, floor 12”) and I’ll fill them in.'
            : missing
              ? `${note.from === 'link' ? 'The listing’s in. ' : ''}I don’t have ${missing} yet. Tell me (“it’s 1,850 feet, floor 12”) and I’ll fill ${them} in, or type ${them} in here.`
              : 'The listing’s in, with the size, the rooms and the floor. Check them against what you know, then Next.'}
      </div>
    </>
  );
}

export function Hubert({ ws }: { ws: Workspace }) {
  const home = homeName(ws.intake, ws.report.title);
  const sent = Boolean(ws.send.sentAt);
  const s = ws.starting ? { hint: NEW_REPORT_HINT, chips: NEW_REPORT_CHIPS } : said(ws.screen, ws.side, ws.comps, home, sent);

  // Done's "Reopen to edit": the sent mark comes off and Send opens, as Done's own Reopen does.
  function onAction(chip: Chip) {
    if (chip.kind !== 'reopen' || ws.readOnly) return;
    if (ws.send.sentAt) {
      const next = { ...ws.send };
      delete next.sentAt;
      ws.setSend(next);
    }
    ws.go('send');
  }

  // The New report window first: the workspace behind it is on Sort, but the agent is setting up the report.
  const opening = ws.starting ? (
    // A rough start (Kimani, 2026-10-29): Hubert beside the New report window, so the design pass has him to design against.
    <>
      <StartNoteBubbles ws={ws} />
      <p className="hb-hint">{NEW_REPORT_HINT}</p>
    </>
  ) : ws.screen === 'sort' ? (
    <>
      <div className="hb-bubble">{greeting(ws.agentFirstName)}</div>
      <div className="hb-bubble">{intro(ws.side)}</div>
      <Suggestions ws={ws} />
      <p className="hb-hint">{SUGGESTIONS_LATER}</p>
    </>
  ) : ws.screen === 'done' ? (
    <>
      <FollowUpBubble ws={ws} />
      <p className="hb-hint">{s.hint}</p>
    </>
  ) : <p className="hb-hint">{s.hint}</p>;

  return (
    <aside className="hb" aria-label="Hubert">
      <div className="hb-head">
        <span className="hb-mark" aria-hidden="true">✦</span>
        <span className="hb-name">Hubert</span>
        <button type="button" className="hb-close" aria-label="Close Hubert" title="Close" onClick={() => ws.setDrawerOpen(false)}>›</button>
      </div>
      {!ws.readOnly && <StepNow step={ws.guideStep} />}
      <Chat
        reportId={ws.reportId}
        readOnly={ws.readOnly}
        onCount={ws.setMessageCount}
        intro={opening}
        chips={s.chips}
        onAction={onAction}
        beforeAsk={ws.flush}
        onEmailEdit={ws.queueHubertEdit}
        onHomeEdit={(edit) => ws.applyHomeSet(edit.set)}
        onCompsChanged={ws.reloadComps}
        guides={reachedGuides(ws.stepsAt, ws.side)}
        view={ws.view}
        queued={ws.hubertQuestion}
        onQueuedTaken={() => ws.askHubert(null)}
        undo={{
          // The comps and the home as the screen has them: Undo shows while the field still reads as he left it.
          can: (entry) => entry.kind === 'home'
            ? homeUndoStands(entry, ws.intake)
            : undoStands(entry, ws.comps.find((c) => c.judgment?.reportCompId === entry.compId)?.judgment),
          // The agent's own edit: the intake's entries as they were, or through the same queue as their other comp edits.
          run: async (entry) => {
            if (entry.kind === 'home' && entry.undo) {
              ws.applyHomeSet(entry.undo.edit as HubertHomeEdit['set']);
              ws.toast(`${entry.label} put back.`);
              return;
            }
            if (!entry.compId || !entry.undo) return;
            await ws.editComp(entry.compId, entry.undo.edit as CompEdit);
            ws.toast(`${entry.label} on ${entry.target} put back.`);
          },
        }}
        finds={{
          added: (url) => ws.reads.some((r) => r.url === url),
          // The agent approved it on his card, having opened the link: read, it lands on Sort untiered.
          approve: async (url) => {
            const added = await linksApi.add(ws.reportId, [url], 'comp', 'hubert');
            ws.applyLinks(added);
            if (added.refused.length) throw new Error(added.refused[0]!.reason);
            ws.toast('Added to Sort, untiered. It counts once you tier it.');
          },
        }}
        onJump={(entry) => {
          if (entry.kind === 'email') {
            if (ws.screen !== 'send') ws.go('send');
          } else if (entry.kind === 'home') {
            // The details step of the New report window, where the agent types them.
            if (!ws.readOnly) ws.openStart('details');
          } else if (entry.compId) {
            // In the per-comp review, the review moves to that comp; otherwise Sort opens on its row.
            if (ws.reviewing) ws.openReview(entry.compId);
            else ws.showComp(entry.compId, entry.field);
          }
        }}
      />
    </aside>
  );
}
