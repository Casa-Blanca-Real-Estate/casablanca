// New comp (design pass, docs/comp-report/design-pass/new-comp.md, 2026-11-11): + NEW COMP on Reports
// grows a field and becomes START →; START makes the report here, and the New comp window (Window.tsx)
// opens on its own page, on Basics (?report=…&start=basics), with the home being read from its link, or
// every field empty for a typed address. What's entered saves as it's typed, and a reload lands back on the
// same step. Before this round, a three-step modal over the workspace did this (Dispatches 09, 14 and 20).
import { api, linksApi, workspaceApi } from '../../api.ts';
import { titleFromLink } from '../../../workspace/links.ts';
import type { Audience, Brief, Intake } from '../../../workspace/state.ts';
import { entry } from '../workspace/bits.tsx';
import { localToday } from '../workspace/model.ts';
import { markNewReport } from './Frame.tsx';
import { typeFromPageKey, type PropertyType } from './Home.tsx';
import type { Report } from '../../api.ts';

export type { StartScreen } from './steps.ts';

/**
 * Makes the report from what START was given, and queues the home's page for reading: the workspace
 * starts the read as it opens, and the fields fill in when it lands. If the link can't be read (today's
 * limit), the report is made anyway, and the window says why. Words with the link ("buyer, Jordan and
 * Sam") fill Basics too.
 */
export async function startReport(a: {
  home: { kind: 'link'; url: string } | { kind: 'typed'; address: string; unit: string | null; title: string } | null;
  side: Audience;
  client: string;
  type: PropertyType;
  /** The agent chose Co-op or Condo: the page doesn't change it. */
  typePicked: boolean;
  price: number | null;
}): Promise<string> {
  const url = a.home?.kind === 'link' ? a.home.url : null;
  const title = url ? (titleFromLink(url) ?? 'A StreetEasy listing') : a.home?.kind === 'typed' ? a.home.title : 'A StreetEasy listing';
  const { report } = await api<{ report: Report }>('/api/comp-report/reports', { method: 'POST', body: { title, propertyType: a.type } });
  const today = localToday();
  const brief: Brief = { audience: entry(a.side, today), ...(a.client.trim() ? { clientName: entry(a.client.trim(), today) } : {}) };
  const intake: Intake = a.home?.kind === 'typed'
    ? { address: entry(a.home.address, today), ...(a.home.unit ? { unit: entry(a.home.unit, today) } : {}) }
    : {};
  await workspaceApi.save(report.id, { brief, state: { intake }, ...(a.price ? { target: { price: entry(a.price, today) } } : {}) });
  if (url) {
    if (!a.typePicked) {
      try {
        sessionStorage.setItem(typeFromPageKey(report.id), '1');
      } catch {
        // Private mode: step 2 offers the switch instead.
      }
    }
    const added = await linksApi.add(report.id, [url], 'subject').catch(() => null);
    const refusal = added ? added.refused[0]?.reason : 'The home’s page couldn’t be queued for reading.';
    if (refusal) {
      try {
        sessionStorage.setItem(`cr-home-refused:${report.id}`, refusal);
      } catch {
        // Private mode: the details just don't say why.
      }
    }
  }
  markNewReport(report.id);
  return report.id;
}
