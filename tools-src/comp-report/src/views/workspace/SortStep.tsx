// Sort the comps (§3): the first pass. Each comp primary, secondary or
// excluded, with a reason. Reasons are append-only (§12): every change records
// a new one, and the latest is the current reason. The range stays hidden until
// the agent's call (§3.1). Comps are added from the bar at the top, the same
// three ways as the new-comp modal (Dispatch 09); one read from its StreetEasy
// page waits for the agent's one-tap confirm.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { CompOut, ListingStatus, Tier } from '../../../engine/index.ts';
import { workspaceApi } from '../../api.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { TIER_LABEL } from '../../../workspace/format.ts';
import type { ReasonType } from '../../../workspace/state.ts';
import { AddComps, ConfirmButton, ReadRows } from './AddComps.tsx';
import { DecisionTag, SampleTag, StubTag } from './bits.tsx';
import { CompFacts, compAddress, compStatus, evidenceLabel, Flags, listingUrl, ORIGIN_LABEL, STATUS_LABEL, STATUS_ORDER } from './comps.tsx';
import type { StepProps, Workspace } from './model.ts';

const TIERS: Tier[] = ['primary', 'secondary', 'excluded'];
const REASON_TYPES: { value: ReasonType; label: string }[] = [
  { value: 'property', label: 'About the property' },
  { value: 'client', label: 'About the client' },
  { value: 'method', label: 'About the method' },
];
export function SortStep({ ws }: StepProps) {
  const outById = useMemo(() => new Map<string, CompOut>((ws.output?.comps ?? []).map((c) => [c.id, c])), [ws.output]);
  const sampleImports = new Set(ws.imports.filter((i) => i.sample).map((i) => i.id));
  // Open while there's nothing to sort; after that, only when the agent opens it.
  const [addingChoice, setAdding] = useState<boolean | null>(null);
  const adding = addingChoice ?? ws.comps.length === 0;
  const groups = useMemo(() => {
    const by = new Map<ListingStatus | 'unknown', WorkspaceComp[]>();
    for (const c of ws.comps) {
      const s = c.unsortable ? 'unknown' : compStatus(c) ?? 'unknown';
      by.set(s, [...(by.get(s) ?? []), c]);
    }
    return [...STATUS_ORDER, 'unknown' as const].map((s) => ({ status: s, comps: by.get(s) ?? [] })).filter((g) => g.comps.length);
  }, [ws.comps]);

  const addBar = !ws.readOnly && (
    <div className="sort-add">
      <button type="button" className="btn small-btn" aria-expanded={adding} onClick={() => setAdding(!adding)}>
        {adding ? 'Close adding comps' : 'Add comps'}
      </button>
      {adding ? <AddComps ws={ws} /> : <ReadRows ws={ws} />}
    </div>
  );

  if (!ws.comps.length) {
    return (
      <div className="sort">
        {addBar}
        <p className="muted">No comps yet. Paste StreetEasy links, drop StreetEasy’s export, or type one in.</p>
      </div>
    );
  }

  const count = (t: Tier | null) => ws.comps.filter((c) => !c.unsortable && (c.judgment?.tier ?? null) === t).length;
  const reviewed = ws.comps.filter((c) => c.judgment?.reviewedAt).length;
  const toConfirm = ws.comps.filter((c) => c.unconfirmed).length;

  return (
    <div className="sort">
      {addBar}
      <p className="summary-line">
        {ws.comps.length} comps: {count('primary')} primary, {count('secondary')} secondary, {count('excluded')} excluded,{' '}
        <strong>{count(null)} not sorted</strong> · {reviewed} reviewed
        {toConfirm > 0 && <> · <strong>{toConfirm} to confirm</strong></>}
      </p>
      {!ws.revealed ? (
        <p className="muted small">
          The range stays hidden while you sort, so sorting can’t chase the number (§3.1). It shows after your call.{' '}
          <DecisionTag id="D-1">order being decided</DecisionTag>
        </p>
      ) : (
        <p className="muted small">The range is revealed: it moves live above as you change tiers.</p>
      )}
      <p className="muted small">
        Only primary comps count toward the numbers. A comp you haven’t sorted counts toward nothing: the tool never sorts one for you.
      </p>
      {groups.map((g) => (
        <section key={g.status} className="status-group" aria-label={g.status === 'unknown' ? 'Can’t be sorted' : STATUS_LABEL[g.status]}>
          <h4>{g.status === 'unknown' ? 'Can’t be sorted' : STATUS_LABEL[g.status]} <span className="muted">· {g.comps.length}</span></h4>
          {g.status === 'off_market' && (
            <p className="muted small">Listings that came off the market unsold: a ceiling signal. They count in no statistic yet (CR-2.2 phase 2).</p>
          )}
          <ul className="list">
            {g.comps.map((c) => (
              <CompCard key={c.id} ws={ws} c={c} out={outById.get(c.id)} sample={c.importId !== null && sampleImports.has(c.importId)} />
            ))}
          </ul>
        </section>
      ))}
      <p className="muted small">
        <StubTag>Waits on D-12</StubTag> Jev’s tier suggestions (§7). <StubTag>CR-3</StubTag> Undo, redo and versions.
      </p>
    </div>
  );
}

function CompCard({ ws, c, out, sample }: { ws: Workspace; c: WorkspaceComp; out: CompOut | undefined; sample: boolean }) {
  const j = c.judgment;
  // No default: an unsorted comp has no tier until the agent picks one.
  const [tier, setTier] = useState<Tier | null>(j?.tier ?? null);
  useEffect(() => {
    if (j?.tier) setTier(j.tier);
  }, [j?.tier]);
  const [reason, setReason] = useState('');
  const [type, setType] = useState<ReasonType>('property');
  const url = listingUrl(c);
  const latest = j?.reasons.at(-1);
  const canAnchor = c.record.status.evidence_class === 'sold' && j?.tier === 'primary';
  const off = ws.readOnly || Boolean(ws.busy);

  async function record(e: FormEvent) {
    e.preventDefault();
    if (!j || !tier || !reason.trim()) return;
    await ws.run('Recording the reason…', async () => {
      ws.applyServer(await workspaceApi.tier(ws.reportId, j.reportCompId, tier, reason.trim(), type));
      setReason('');
    });
  }

  const mark = (change: { reviewed?: boolean; anchor?: boolean }) => j && ws.run('Saving…', async () => {
    ws.applyServer(await workspaceApi.mark(ws.reportId, j.reportCompId, change));
  });

  const result = out?.per_result;
  return (
    <li className={`comp-card tier-${j?.tier ?? 'none'}`}>
      <div className="comp-head">
        <strong>{compAddress(c)}</strong>
        <SampleTag show={sample} />
        <span className="pill">{evidenceLabel(c)}</span>
        <span className="tag">{ORIGIN_LABEL[c.origin]}</span>
        {c.unconfirmed && <span className="tag tag-estimate" title="Read from its StreetEasy page: confirm it to count it">To confirm</span>}
        <span className={`pill tier ${j?.tier ?? 'none'}`}>{j?.tier ? TIER_LABEL[j.tier] : 'Not sorted'}</span>
        {j?.anchor && canAnchor && <span className="pill anchor" title="The single most comparable sold comp (§6.3)">Anchor</span>}
        {j?.reviewedAt && <span className="pill reviewed">Reviewed</span>}
        {url && <a className="small" href={url} target="_blank" rel="noreferrer noopener">Listing on StreetEasy ↗</a>}
      </div>
      <CompFacts c={c} out={out} />
      <Flags c={c} out={out} />
      {c.unsortable && <p className="muted small">{c.unsortable}</p>}
      {c.unconfirmed && (
        <p className="row wrap small">
          <span>Read from its StreetEasy page. Check it against the listing, then confirm: until then it counts in neither result.</span>
          <ConfirmButton ws={ws} c={c} />
        </p>
      )}

      {latest && (
        <p className="reason">
          <span className="muted small">Reason ({latest.reasonType}):</span> {latest.reason}{' '}
          <SampleTag show={latest.sample} />
          <span className="muted small"> — {latest.by}, {new Date(latest.at).toLocaleString()}</span>
        </p>
      )}
      {ws.revealed && result && j?.tier && (
        <p className="muted small">
          {result.on_facts.included && result.with_estimates.included
            ? 'In both results.'
            : `Not in the numbers: ${[...new Set([...result.on_facts.not_included_because, ...result.with_estimates.not_included_because])].join('; ') || 'see the reveal'}.`}
        </p>
      )}

      {j && !ws.readOnly && (
        <form className="tier-form" onSubmit={record}>
          <div className="segmented" role="radiogroup" aria-label={`Tier for ${compAddress(c)}`}>
            {TIERS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tier === t}
                className={tier === t ? 'on' : ''}
                onClick={() => setTier(t)}
                disabled={off}
              >
                {TIER_LABEL[t]}
              </button>
            ))}
          </div>
          <input
            aria-label={`Reason for ${compAddress(c)}`}
            placeholder={!tier ? 'Pick a tier, then say why' : j.tier === tier ? 'A new reason for the same tier' : `Why ${TIER_LABEL[tier].toLowerCase()}?`}
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            disabled={off}
          />
          <select aria-label="The reason is" value={type} onChange={(e) => setType(e.target.value as ReasonType)} disabled={off}>
            {REASON_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button className="btn primary" disabled={off || !tier || !reason.trim()}>Record</button>
        </form>
      )}

      {j && !ws.readOnly && (
        <div className="row wrap small">
          <label className="check">
            <input type="checkbox" checked={Boolean(j.reviewedAt)} disabled={off} onChange={(e) => void mark({ reviewed: e.target.checked })} />
            Reviewed
          </label>
          {canAnchor && (
            <label className="check" title="The single most comparable sold comp. At most one; it must be primary (§6.3).">
              <input type="checkbox" checked={j.anchor} disabled={off} onChange={(e) => void mark({ anchor: e.target.checked })} />
              The anchor
            </label>
          )}
        </div>
      )}

      {j && j.reasons.length > 1 && (
        <details className="history">
          <summary className="small">Reason history ({j.reasons.length})</summary>
          <ol>
            {j.reasons.map((r, i) => (
              <li key={i} className="small">
                {TIER_LABEL[r.tier]} — {r.reason} <span className="muted">({r.reasonType}; {r.by}, {new Date(r.at).toLocaleString()})</span>{' '}
                <SampleTag show={r.sample} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}
