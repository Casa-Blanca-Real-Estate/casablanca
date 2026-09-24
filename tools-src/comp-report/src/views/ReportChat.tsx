import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, streamTurn, type Report, type ShownMessage } from '../api.ts';

interface Live {
  text: string;
  progress: string[];
  tools: string[];
  note: string | null;
}

const empty: Live = { text: '', progress: [], tools: [], note: null };

export function ReportChat({ reportId, onBack }: { reportId: string; onBack: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [messages, setMessages] = useState<ShownMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  async function load() {
    const [r, m] = await Promise.all([
      api<{ report: Report }>(`/api/comp-report/reports?id=${reportId}`),
      api<{ messages: ShownMessage[] }>(`/api/comp-report/messages?report=${reportId}`),
    ]);
    setReport(r.report);
    setMessages(m.messages);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'No such report.' : String(e.message ?? e)));
  }, [reportId]);

  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [messages, live]);

  // One model call per request (§8.3 rule 6): after a tool call, ask again.
  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || live) return;
    setDraft('');
    setError(null);
    setMessages((prev) => [...prev, { seq: -1, role: 'user', text, progress: [], tools: [], toolResultsOnly: false, stopReason: null, inContext: true, createdAt: new Date().toISOString() }]);
    let message: string | undefined = text;
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
        message = undefined;
        if (!again) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not be reached.');
    } finally {
      setLive(null);
      await load().catch(() => undefined);
    }
  }

  return (
    <>
      <button type="button" className="link" onClick={onBack}>‹ All reports</button>
      <h2 className="report-title">{report?.title ?? '…'}</h2>
      {error && <p className="notice">{error}</p>}

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
        <div ref={end} />
      </div>

      <form className="composer" onSubmit={send}>
        <textarea
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
        <button className="btn primary" disabled={!!live || !draft.trim()}>Send</button>
      </form>
    </>
  );
}
