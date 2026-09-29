// The assistant (§8), as a panel: in a drawer reachable from every step of the
// walkthrough, and inline beside the numbers in step 5. CR-1's turn endpoint:
// one model call per request, the server owns the transcript (§8.3 rule 6).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, streamTurn, type ShownMessage } from '../api.ts';

interface Live {
  text: string;
  progress: string[];
  tools: string[];
  note: string | null;
}

const empty: Live = { text: '', progress: [], tools: [], note: null };

const SUGGESTIONS = ['Which report is this?', 'What do the numbers say so far?', 'Which comps need a closer look?'];

export function Chat({ reportId, readOnly = false, onCount, seed }: {
  reportId: string;
  readOnly?: boolean;
  /** How many messages the agent has sent, after each load: the step rail marks step 5 by it. */
  onCount?: (n: number) => void;
  /** A question to put in the composer, unsent (the sample fill for step 5). */
  seed?: { text: string; n: number } | null;
}) {
  const [messages, setMessages] = useState<ShownMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the last turn ended with (declined, stopped, failed), kept until the next message.
  const [notice, setNotice] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [loaded, setLoaded] = useState(false);
  // A reply still being written — sent from the other panel, or before a reload. The server
  // refuses a new message until it lands (server/api/turn.ts), so this waits for it.
  const [waiting, setWaiting] = useState(false);

  async function load() {
    const m = await api<{ messages: ShownMessage[] }>(`/api/comp-report/messages?report=${reportId}`);
    setMessages(m.messages);
    setLoaded(true);
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

  useEffect(() => {
    if (!seed || readOnly) return;
    setDraft(seed.text);
    input.current?.focus();
  }, [seed, readOnly]);

  // A block body, not an expression: an effect's return value is its cleanup, and newer Chrome
  // returns a Promise from scrollIntoView(). React then called that Promise on the next update and
  // the page crashed ("l is not a function", 2026-09-29). src/effects.test.ts keeps it that way.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, live]);

  // One model call per request (§8.3 rule 6): after a tool call, ask again.
  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || live || waiting) return;
    setDraft('');
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
        for await (const ev of streamTurn(reportId, message)) {
          if (ev.type === 'text') current = { ...current, text: current.text + ev.text };
          else if (ev.type === 'progress') current = { ...current, progress: [...current.progress, ev.text] };
          else if (ev.type === 'tool') current = { ...current, tools: [...current.tools, ev.name] };
          else if (ev.type === 'done') again = ev.stopReason === 'tool_use';
          else if (ev.type === 'refused') current = { ...current, note: 'The assistant declined that request.' };
          else if (ev.type === 'interrupted') current = { ...current, note: 'That reply ran past the time limit and was stopped. Ask for a shorter answer.' };
          else if (ev.type === 'error') current = { ...current, note: ev.code === 'rate_limited' ? 'The assistant is busy — try again in a minute.' : 'The assistant hit an error.' };
          setLive(current);
        }
        if (current.note) lastNote = current.note;
        message = undefined;
        if (!again) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not be reached.');
      // Refused before it started (another reply still being written): keep what they typed.
      if (err instanceof ApiError && err.code === 'turn_in_progress' && message !== undefined) setDraft(text);
    } finally {
      setLive(null);
      setNotice(lastNote);
      await load().catch(() => undefined);
    }
  }

  return (
    <div className="chat-panel">
      {error && <p className="notice">{error}</p>}

      {loaded && messages.length === 0 && !live && (
        <div className="chat-empty">
          <p className="muted small">It can read this report and its numbers. It never sees your call or your target.</p>
          {!readOnly && (
            <div className="row wrap">
              {SUGGESTIONS.map((text) => (
                <button key={text} type="button" className="btn" onClick={() => { setDraft(text); input.current?.focus(); }}>{text}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="chat">
        {messages.filter((m) => !m.toolResultsOnly).map((m) => (
          <div key={`${m.seq}-${m.createdAt}`} className={`msg ${m.role}${m.inContext ? '' : ' dim'}`}>
            {m.progress.map((p, i) => <p key={i} className="progress">{p}</p>)}
            {m.tools.length > 0 && <p className="progress">Looked up: {m.tools.join(', ')}</p>}
            {m.text && <p className="msg-text">{m.text}</p>}
            {!m.inContext && m.role === 'assistant' && (
              <p className="muted small">{m.stopReason === 'refusal' ? 'Declined — not part of the conversation.' : 'Stopped before it finished — not part of the conversation.'}</p>
            )}
          </div>
        ))}
        {live && (
          <div className="msg assistant">
            {live.progress.map((p, i) => <p key={i} className="progress">{p}</p>)}
            {live.tools.length > 0 && <p className="progress">Looking up: {live.tools.join(', ')}</p>}
            {live.text ? <p className="msg-text">{live.text}</p> : !live.note && <p className="muted">Thinking…</p>}
            {live.note && <p className="notice">{live.note}</p>}
          </div>
        )}
        {waiting && !live && <p className="muted small" aria-live="polite">Still answering the last message…</p>}
        {notice && <p className="notice">{notice}</p>}
        <div ref={end} />
      </div>

      {readOnly ? <p className="muted small">Only the report's owner can talk to the assistant here.</p> : (
      <form className="composer" onSubmit={send}>
        <textarea
          ref={input}
          aria-label="Message the assistant"
          placeholder="Ask about this report…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
          rows={2}
        />
        <button className="btn primary" disabled={!!live || waiting || !draft.trim()}>Send</button>
      </form>
      )}
    </div>
  );
}
