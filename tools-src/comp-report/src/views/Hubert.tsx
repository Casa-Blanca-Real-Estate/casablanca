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
import { useState } from 'react';
import type { CompJudgment } from '../../workspace/state.ts';
import type { CompRecord, ListingStatus } from '../../engine/index.ts';
import { noteOf } from '../../workspace/state.ts';
import { undoStands } from '../../workspace/trail-undo.ts';
import { linksApi, type CompEdit } from '../api.ts';
import { Chat } from './Chat.tsx';
import { greeting, intro, NEW_REPORT_CHIPS, NEW_REPORT_HINT, said, SUGGESTIONS_LATER, type Chip } from './hubert/copy.ts';
import { reachedGuides } from './hubert/guides.ts';
import { monthYear, shortPrice } from './sort/rows.ts';
import { STATUS_LABEL } from './workspace/comps.tsx';
import type { Workspace } from './workspace/model.ts';
import { homeName } from './workspace/screens.ts';
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

  const opening = ws.screen === 'sort' ? (
    <>
      <div className="hb-bubble">{greeting(ws.agentFirstName)}</div>
      <div className="hb-bubble">{intro(ws.side)}</div>
      <Suggestions ws={ws} />
      <p className="hb-hint">{SUGGESTIONS_LATER}</p>
    </>
  ) : ws.starting ? (
    // A rough start (Kimani, 2026-10-29): Hubert beside the New report window, so the design pass has him to design against.
    <p className="hb-hint">{NEW_REPORT_HINT}</p>
  ) : <p className="hb-hint">{s.hint}</p>;

  return (
    <aside className="hb" aria-label="Hubert">
      <div className="hb-head">
        <span className="hb-mark" aria-hidden="true">✦</span>
        <span className="hb-name">Hubert</span>
        <button type="button" className="hb-close" aria-label="Close Hubert" title="Close" onClick={() => ws.setDrawerOpen(false)}>›</button>
      </div>
      <Chat
        reportId={ws.reportId}
        readOnly={ws.readOnly}
        onCount={ws.setMessageCount}
        intro={opening}
        chips={s.chips}
        onAction={onAction}
        beforeAsk={ws.flush}
        onEmailEdit={ws.queueHubertEdit}
        onCompsChanged={ws.reloadComps}
        guides={reachedGuides(ws.stepsAt, ws.side)}
        view={ws.view}
        undo={{
          // The comps as the screen has them: Undo shows while the comp still reads as he left it.
          can: (entry) => undoStands(entry, ws.comps.find((c) => c.judgment?.reportCompId === entry.compId)?.judgment),
          // The agent's own edit, through the same queue as their other edits.
          run: async (entry) => {
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
