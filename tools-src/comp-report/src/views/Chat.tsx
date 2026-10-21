// Hubert's conversation (§8; the handoff's drawer): what he said before anyone
// asked, the messages, two preset questions and the input. CR-1's turn
// endpoint: one model call per request, the server owns the transcript (§8.3
// rule 6). The conversation is the report's, the same on every screen.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, streamTurn, type HubertEmailEdit, type ShownMessage } from '../api.ts';
import type { Chip } from './hubert/copy.ts';
import { HubertNote, HubertText } from './hubert/markdown.tsx';

interface Live {
  text: string;
  progress: string[];
  tools: string[];
  note: string | null;
}

const empty: Live = { text: '', progress: [], tools: [], note: null };

/** What Hubert looked at, in words: his tools read the report, its numbers and the email; one changes the email. */
const TOOL_WORDS: Record<string, string> = { get_numbers: 'the numbers', get_report: 'the report', get_email: 'the email' };
const looked = (tools: string[]) => [...new Set(tools.filter((t) => t !== 'edit_email').map((t) => TOOL_WORDS[t] ?? t))].join(' and ');

const MAX_INPUT_PX = 120;

export function Chat({ reportId, readOnly = false, onCount, intro, chips = [], onAction, beforeAsk, onEmailEdit }: {
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
        for await (const ev of streamTurn(reportId, message)) {
          if (ev.type === 'email_edit') onEmailEdit?.(ev.edit);
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

  const busy = Boolean(live) || waiting;

  return (
    <>
      <div className="hb-body" ref={body}>
        {intro}
        {error && <p className="hb-notice" role="alert">{error}</p>}
        {messages.filter((m) => !m.toolResultsOnly).map((m) => (
          <div key={`${m.seq}-${m.createdAt}`} className={`hb-msg ${m.role}${m.inContext ? '' : ' dim'}`}>
            {m.progress.map((p, i) => <HubertNote key={i} text={p} />)}
            {m.role === 'assistant' && looked(m.tools) && <p className="hb-progress">Checked {looked(m.tools)}.</p>}
            {m.role === 'assistant' && m.tools.includes('edit_email') && <p className="hb-progress">Changed the email on Send.</p>}
            {m.text && (m.role === 'assistant' ? <HubertText text={m.text} /> : <p className="hb-text">{m.text}</p>)}
            {!m.inContext && m.role === 'assistant' && (
              <p className="hb-progress">{m.stopReason === 'refusal' ? 'Declined: not part of the conversation.' : 'Stopped before it finished: not part of the conversation.'}</p>
            )}
          </div>
        ))}
        {live && (
          <div className="hb-msg assistant" aria-live="polite">
            {live.progress.map((p, i) => <HubertNote key={i} text={p} />)}
            {looked(live.tools) && <p className="hb-progress">Checking {looked(live.tools)}…</p>}
            {live.tools.includes('edit_email') && <p className="hb-progress">Changing the email…</p>}
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
