// The activity log's browser half (Dispatch 22b): which screen someone is on, and which kind of
// failure they hit. Names come from closed lists only (SCREEN_IDS, ERROR_CODES), and the server
// refuses anything else. What they did — a comp tiered, a call given, a report sent — the server
// records itself; the browser can't send those. Fire and forget: a lost event costs nothing.
import type { ErrorCode } from './error-codes.ts';
import { session } from './session.ts';
import type { LoggedScreen } from './views/workspace/screens.ts';

/** One per page load, so a timeline can tell two sittings apart. */
const SESSION_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : null;

let last = '';

async function send(name: string, reportId: string | null): Promise<void> {
  if (!SESSION_ID) return;
  try {
    const token = await session.token();
    if (!token) return;
    await fetch('/api/comp-report/activity', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Studio-Token': token },
      body: JSON.stringify({ name, sessionId: SESSION_ID, ...(reportId ? { reportId } : {}) }),
    });
  } catch {
    /* the log is a record, never a reason to bother the agent */
  }
}

/** A screen shown. The same screen of the same report twice in a row is one event. */
export function trackScreen(screen: LoggedScreen, reportId: string | null = null): void {
  const key = `${screen}|${reportId ?? ''}`;
  if (key === last) return;
  last = key;
  void send(`screen.${screen}`, reportId);
}

export function trackError(code: ErrorCode, reportId: string | null = null): void {
  void send(`error.${code}`, reportId);
}
