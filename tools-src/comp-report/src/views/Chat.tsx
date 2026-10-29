// Hubert's conversation (§8; the handoff's drawer): what he said before anyone
// asked, the messages, two preset questions and the input. CR-1's turn
// endpoint: one model call per request, the server owns the transcript (§8.3
// rule 6). The conversation is the report's, the same on every screen.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, streamTurn, type HubertEmailEdit, type HubertView, type ShownMessage, type TrailEntry, type TrailSource } from '../api.ts';
import type { Chip } from './hubert/copy.ts';
import type { Guide } from './hubert/guides.ts';
import { HubertNote, HubertText } from './hubert/markdown.tsx';

interface Live {
  text: string;
  progress: string[];
  tools: string[];
  /** What his last tools changed: they ran as this request started (server/api/turn.ts). */
  changes: TrailEntry[];
  note: string | null;
}

const empty: Live = { text: '', progress: [], tools: [], changes: [], note: null };

/** What Hubert looked at, in words: his tools read the report, its numbers, the screen, the email and the web; two change things. */
const TOOL_WORDS: Record<string, string> = {
  get_numbers: 'the numbers', get_view: 'your screen', get_report: 'the report', get_email: 'the email', web_search: 'the web', read_page: 'a web page',
};
const CHANGES = new Set(['edit_email', 'edit_comp', 'add_comp_link']);
const looked = (tools: string[]) => [...new Set(tools.filter((t) => !CHANGES.has(t)).map((t) => TOOL_WORDS[t] ?? t))].join(' and ');

/** Undo on a comp entry of the trail: whether it still applies, and doing it (the agent's own edit). */
export interface TrailUndo {
  can: (entry: TrailEntry) => boolean;
  run: (entry: TrailEntry) => Promise<void>;
}

/** One entry's Undo: offered while the comp reads as Hubert left it; "Undone" once the agent has used it here. */
function UndoButton({ entry, undo }: { entry: TrailEntry; undo: TrailUndo }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  if (state === 'done') return <span className="hb-trail-undone">Undone</span>;
  if (state === 'idle' && !undo.can(entry)) return null;
  return (
    <button
      type="button"
      className="hb-trail-go"
      disabled={state === 'busy'}
      title={state === 'failed' ? 'Not undone. Try again, or change it on Sort.' : `Put the ${entry.label.toLowerCase()} back`}
      onClick={() => {
        setState('busy');
        undo.run(entry).then(() => setState('done'), () => setState('failed'));
      }}
    >
      {state === 'busy' ? 'Undoing…' : state === 'failed' ? 'Retry undo' : 'Undo'}
    </button>
  );
}

/**
 * Hubert's trail (Kimani, 2026-10-28): each change he made, where he made it,
 * with "Show" to the field: a comp's row on Sort, or the email on Send; and,
 * on a comp's change, Undo while it still stands.
 */
function Trail({ changes, sources, onJump, undo }: { changes: TrailEntry[]; sources: TrailSource[]; onJump?: (entry: TrailEntry) => void; undo?: TrailUndo }) {
  if (!changes.length && !sources.length) return null;
  return (
    <>
      {changes.length > 0 && (
        <ul className="hb-trail" aria-label="What Hubert changed">
          {changes.map((c, i) => (
            <li key={i} className="hb-trail-item">
              <span className="hb-trail-mark" aria-hidden="true">✎</span>
              <span className="hb-trail-what">
                <span className="hb-trail-target">{c.target}</span>
                <span className="hb-trail-field">{c.label}</span>
                <span className="hb-trail-change">
                  {c.before !== null && <><s>{c.before}</s>{' → '}</>}
                  {c.kind === 'link' && c.url
                    ? <a className="hb-md-link" href={c.url} target="_blank" rel="noopener noreferrer nofollow">{c.url.replace(/^https:\/\//, '')}</a>
                    : c.after ?? <em>cleared</em>}
                </span>
              </span>
              <span className="hb-trail-acts">
                {onJump && <button type="button" className="hb-trail-go" onClick={() => onJump(c)}>Show</button>}
                {undo && c.undo && <UndoButton entry={c} undo={undo} />}
              </span>
            </li>
          ))}
        </ul>
      )}
      {sources.length > 0 && (
        <p className="hb-sources">
          From the web:{' '}
          {sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ' · '}
              <a className="hb-md-link" href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.title}</a>
            </span>
          ))}
        </p>
      )}
    </>
  );
}

const MAX_INPUT_PX = 120;

/** A step guide (hubert/guides.ts): a new section of the chat, with Hubert's preset note for the step. */
function GuideNote({ guide }: { guide: Guide }) {
  return (
    <div className="hb-guide" role="note">
      <div className="hb-guide-rule"><span>{guide.title}</span></div>
      <div className="hb-bubble hb-guide-text">{guide.text}</div>
    </div>
  );
}

export function Chat({ reportId, readOnly = false, onCount, intro, chips = [], onAction, beforeAsk, onEmailEdit, onCompsChanged, onJump, undo, view, guides = [] }: {
  reportId: string;
  readOnly?: boolean;
  /** How many messages the agent has sent, after each load. */
  onCount?: (n: number) => void;
  /** What Hubert says before anyone asks: above the conversation. */
  intro?: ReactNode;
  /** The screen's two preset questions (an action chip runs `onAction` instead of asking). */
  chips?: Chip[];
  onAction?: (chip: Chip) => void;
  /** Before each request: the screen's unsaved edits are saved, so Hubert reads what the agent sees. */
  beforeAsk?: () => Promise<void>;
  /** An edit Hubert made to the email: Send applies it. */
  onEmailEdit?: (edit: HubertEmailEdit) => void;
  /** Hubert changed a comp on the server: the screen reloads the comps. */
  onCompsChanged?: () => void;
  /** A trail entry's "Show": to the field he changed. */
  onJump?: (entry: TrailEntry) => void;
  /** Undo on his comp changes. Left out (a reader who isn't the owner), there's none. */
  undo?: TrailUndo;
  /** What the agent has on screen, sent with each request for get_view. */
  view?: () => HubertView;
  /** The step guides reached, oldest first: each sits among the messages at the time the agent reached its step. */
  guides?: (Guide & { at: string })[];
}) {
  const [messages, setMessages] = useState<ShownMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the last turn ended with (declined, stopped, failed), kept until the next message.
  const [notice, setNotice] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // A reply still being written — sent from another tab, or before a reload. The server
  // refuses a new message until it lands (server/api/turn.ts), so this waits for it.
  const [waiting, setWaiting] = useState(false);

  async function load() {
    const m = await api<{ messages: ShownMessage[] }>(`/api/comp-report/messages?report=${reportId}`);
    setMessages(m.messages);
    const last = m.messages.at(-1);
    setWaiting(Boolean(last && last.role === 'user' && Date.now() - Date.parse(last.createdAt) < 90_000));
    onCount?.(m.messages.filter((x) => x.role === 'user' && !x.toolResultsOnly).length);
  }

  useEffect(() => {
    if (!waiting || live) return;
    const t = setTimeout(() => void load().catch(() => undefined), 2000);
    return () => clearTimeout(t);
  }, [waiting, live, messages]);

  useEffect(() => {
    load().catch((e) => setError(String(e.message ?? e)));
  }, [reportId]);

  // A block body, not an expression: an effect's return value is its cleanup (src/effects.test.ts).
  // The drawer's own scroll, not scrollIntoView, so the page under it never moves.
  useEffect(() => {
    const el = body.current;
    if (el && (messages.length || live)) el.scrollTop = el.scrollHeight;
  }, [messages, live]);

  function fit(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, MAX_INPUT_PX)}px`;
  }

  // One model call per request (§8.3 rule 6): after a tool call, ask again.
  async function ask(raw: string) {
    const text = raw.trim();
    if (!text || live || waiting || readOnly) return;
    setDraft('');
    requestAnimationFrame(() => fit(input.current));
    setError(null);
    setNotice(null);
    setMessages((prev) => [...prev, { seq: -1, role: 'user', text, progress: [], tools: [], toolResultsOnly: false, stopReason: null, inContext: true, createdAt: new Date().toISOString() }]);
    let message: string | undefined = text;
    let lastNote: string | null = null;
    try {
      for (let round = 0; round < 6; round++) {
        let current: Live = { ...empty };
        setLive(current);
        let again = false;
        await beforeAsk?.().catch(() => undefined);
        for await (const ev of streamTurn(reportId, message, view?.())) {
          if (ev.type === 'email_edit') onEmailEdit?.(ev.edit);
          else if (ev.type === 'change') current = { ...current, changes: [...current.changes, ev.entry] };
          else if (ev.type === 'comps_changed') onCompsChanged?.();
          else if (ev.type === 'text') current = { ...current, text: current.text + ev.text };
          else if (ev.type === 'progress') current = { ...current, progress: [...current.progress, ev.text] };
          else if (ev.type === 'tool') current = { ...current, tools: [...current.tools, ev.name] };
          else if (ev.type === 'done') again = ev.stopReason === 'tool_use';
          else if (ev.type === 'refused') current = { ...current, note: 'Hubert declined that request.' };
          else if (ev.type === 'interrupted') current = { ...current, note: 'That reply ran past the time limit and was stopped. Ask for a shorter answer.' };
          else if (ev.type === 'error') current = { ...current, note: ev.code === 'rate_limited' ? 'Hubert is busy. Try again in a minute.' : 'Hubert hit an error.' };
          setLive(current);
        }
        if (current.note) lastNote = current.note;
        message = undefined;
        if (!again) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hubert couldn’t be reached.');
      // Refused before it started (another reply still being written): keep what they typed.
      if (err instanceof ApiError && err.code === 'turn_in_progress' && message !== undefined) setDraft(text);
    } finally {
      setLive(null);
      setNotice(lastNote);
      await load().catch(() => undefined);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void ask(draft);
  }

  // One message, as the chat shows it: Hubert's notes, what he checked and changed, and the text.
  const message = (m: ShownMessage) => (
    <div key={`${m.seq}-${m.createdAt}`} className={`hb-msg ${m.role}${m.inContext ? '' : ' dim'}`}>
      {m.progress.map((p, i) => <HubertNote key={i} text={p} />)}
      {m.role === 'assistant' && looked(m.tools) && <p className="hb-progress">Checked {looked(m.tools)}.</p>}
      {m.role === 'assistant' && m.tools.includes('edit_email') && !m.changes?.length && <p className="hb-progress">Changed the email on Send.</p>}
      {m.role === 'assistant' && <Trail changes={m.changes ?? []} sources={m.sources ?? []} onJump={onJump} undo={readOnly ? undefined : undo} />}
      {m.text && (m.role === 'assistant' ? <HubertText text={m.text} /> : <p className="hb-text">{m.text}</p>)}
      {!m.inContext && m.role === 'assistant' && (
        <p className="hb-progress">{m.stopReason === 'refusal' ? 'Declined: not part of the conversation.' : 'Stopped before it finished: not part of the conversation.'}</p>
      )}
    </div>
  );

  const busy = Boolean(live) || waiting;

  return (
    <>
      <div className="hb-body" ref={body}>
        {intro}
        {error && <p className="hb-notice" role="alert">{error}</p>}
        {(() => {
          // Each guide goes before the first message after it; the rest follow the conversation.
          const shown = messages.filter((m) => !m.toolResultsOnly);
          let g = 0;
          const out: ReactNode[] = [];
          const guide = () => {
            const it = guides[g++]!;
            out.push(<GuideNote key={`g-${it.step}`} guide={it} />);
          };
          for (const m of shown) {
            while (g < guides.length && guides[g]!.at <= m.createdAt) guide();
            out.push(message(m));
          }
          while (g < guides.length) guide();
          return out;
        })()}
        {live && (
          <div className="hb-msg assistant" aria-live="polite">
            {live.progress.map((p, i) => <HubertNote key={i} text={p} />)}
            {looked(live.tools) && <p className="hb-progress">Checking {looked(live.tools)}…</p>}
            {live.tools.includes('edit_email') && <p className="hb-progress">Changing the email…</p>}
            {live.tools.includes('edit_comp') && <p className="hb-progress">Changing the comp…</p>}
            {live.tools.includes('add_comp_link') && <p className="hb-progress">Adding the comp from StreetEasy…</p>}
            <Trail changes={live.changes} sources={[]} onJump={onJump} undo={readOnly ? undefined : undo} />
            {live.text ? <HubertText text={live.text} /> : !live.note && <p className="hb-progress">Thinking…</p>}
            {live.note && <p className="hb-text">{live.note}</p>}
          </div>
        )}
        {waiting && !live && <p className="hb-hint" aria-live="polite">Still answering the last message…</p>}
        {notice && <p className="hb-notice">{notice}</p>}
      </div>

      {!readOnly && chips.length > 0 && (
        <div className="hb-chips">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="hb-chip"
              disabled={chip.kind === 'ask' && busy}
              onClick={() => (chip.kind === 'ask' ? void ask(chip.label) : onAction?.(chip))}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
      {readOnly ? <p className="hb-readonly">Only the report’s owner can talk to Hubert here.</p> : (
        <form className="hb-input" onSubmit={submit}>
          <textarea
            ref={input}
            aria-label="Ask Hubert"
            placeholder="Ask Hubert about the listings…"
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              fit(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
          />
          <button type="submit" className="hb-send" aria-label="Send" disabled={busy || !draft.trim()}>→</button>
        </form>
      )}
    </>
  );
}
