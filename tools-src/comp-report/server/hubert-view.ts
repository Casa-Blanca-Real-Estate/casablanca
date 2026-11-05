// get_view (hubert-plan.md "Tools next" 1; Dispatch 24 item 2): which screen
// the agent is on and which comp they have open, so "this one" and "the comp
// I'm looking at" mean something to Hubert.
//
// The browser sends the view with every turn request (api/turn.ts), as it is
// when the request goes: a tool call runs at the start of the next request,
// so get_view reads the view of the moment it runs. Nothing about it is
// stored but the tool's result. The open comp comes back as get_numbers'
// wider read gives it, so one call answers about it.
import { address } from '../workspace/summary.ts';
import type { Intake } from '../workspace/state.ts';
import type { Queryable } from './db.ts';
import { homeDetailsOf } from './hubert-home.ts';
import { neutralNumbers, newYorkToday, summaryOf } from './numbers.ts';

export const VIEW_SCREENS = ['new_report', 'sort', 'review', 'gate', 'findings', 'send', 'done'] as const;
export type ViewScreen = (typeof VIEW_SCREENS)[number];
const NEW_REPORT_STEPS = ['home', 'details', 'comps'] as const;

export interface HubertView {
  /** The screen; `review` is Sort's per-comp review (Dispatch 25), one comp at a time; `new_report` the New report window. */
  screen: ViewScreen;
  /** The report comp open on Sort, or under review. */
  compId: string | null;
  /** In the New report window: which of its three steps. */
  step?: (typeof NEW_REPORT_STEPS)[number];
  /** On Sort: the rows top to bottom as they show, so "comps 1 and 2" can be counted. */
  order?: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The view as the browser sent it, or null for none or a malformed one: Hubert then says he can't see the screen. */
export function readView(raw: unknown): HubertView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.screen !== 'string' || !(VIEW_SCREENS as readonly string[]).includes(v.screen)) return null;
  const compId = typeof v.compId === 'string' && UUID.test(v.compId) ? v.compId : null;
  const view: HubertView = { screen: v.screen as ViewScreen, compId };
  if (view.screen === 'new_report' && (NEW_REPORT_STEPS as readonly unknown[]).includes(v.step)) view.step = v.step as HubertView['step'];
  if (view.screen === 'sort' && Array.isArray(v.order)) {
    view.order = v.order.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 200);
  }
  return view;
}

const SCREEN_WORDS: Record<ViewScreen, string> = {
  new_report: 'The New report window: the home, its details, and adding comps. The agent types the details, or tells you them (set_home_fact, where you have it).',
  sort: 'Sort: the comps table, where the agent tiers each comp, writes why it’s a comp and tags it.',
  review: 'The per-comp review on Sort: one comp at a time, the agent’s note and tags first, then the tier.',
  gate: 'Your number: the agent gives their own number before the range shows. The number is theirs alone.',
  findings: 'Findings: both results, the evidence and the bridge.',
  send: 'Send: the client email. get_email reads it as the agent sees it.',
  done: 'Done: the report is finished.',
};

export async function viewFor(tx: Queryable, reportId: string, view: HubertView | null) {
  if (!view) return { screen: null, about: 'The screen didn’t come with this message. Ask the agent which comp they mean.' };
  const out: Record<string, unknown> = { screen: view.screen, about: SCREEN_WORDS[view.screen] };
  if (view.step) out.new_report_step = { home: 'the home: its StreetEasy link or address', details: 'the home’s details', comps: 'adding comps: the export and links' }[view.step];
  // The home's details as the agent has them (set_home_fact changes them): in the New report window, where they're filled.
  if (view.screen === 'new_report') {
    const intake = (await tx.query<{ intake: Intake | null }>(`select state -> 'intake' as intake from comp_report.reports where id = $1`, [reportId])).rows[0]?.intake ?? null;
    out.home_details = homeDetailsOf(intake);
  }
  const asOf = newYorkToday();
  const wantsComps = (view.screen === 'sort' && (view.compId || view.order?.length)) || (view.screen === 'review' && view.compId);
  if (!wantsComps) {
    out.open_comp = null;
    return out;
  }
  const n = await neutralNumbers(tx, reportId, asOf);
  // Sort's rows as numbered on screen, top to bottom: the agent's "comp 3" is the third.
  if (n && view.order?.length) {
    const byId = new Map(n.comps.map((c) => [c.judgment?.reportCompId, address(c)]));
    out.sort_rows_top_to_bottom = view.order.map((id) => byId.get(id)).filter(Boolean).map((name, k) => `${k + 1}. ${name}`);
  }
  if (!view.compId) {
    out.open_comp = null;
    if (view.screen === 'sort') out.note = 'No comp is open. If the agent says “this one”, ask which comp they mean.';
    return out;
  }
  const i = n ? n.comps.findIndex((c) => c.judgment?.reportCompId === view.compId) : -1;
  if (!n || i < 0) return { ...out, open_comp: null, note: 'The comp on screen isn’t in the report’s data any more. Ask the agent which comp they mean.' };
  const summary = await summaryOf(tx, reportId, n, { asOf, wide: true });
  out.open_comp = {
    how: view.screen === 'review' ? 'under review' : 'open on Sort (the row the agent opened last)',
    ...summary.comps[i],
    comp: address(n.comps[i]!),
  };
  return out;
}
