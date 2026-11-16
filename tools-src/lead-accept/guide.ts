// The "How it works" guide on the lead auto-accept page: written for Erez and the team, edited by
// Kimani on the page, kept in Netlify Blobs (store cb-lead-accept, key "guide"). This is the version
// the page shows until the first edit is saved.
//
// It lives here, behind the team sign-in, rather than in the page's HTML: the page is a public
// static file, and the guide names inboxes, Make scenarios and the service's address.
//
// Format. Plain text everywhere; the page adds the formatting:
//   - any email address is highlighted;
//   - any name listed in `links` (Make, Railway, the scenario names…) becomes a link, wherever it appears;
//   - **double asterisks** make bold;
//   - in a section's body, a blank line starts a new paragraph and a line starting "- " is a bullet.

export interface GuideStep { title: string; summary: string; details: string[] }
export interface GuideSection { title: string; body: string }
export interface GuideLink { name: string; url: string }
/** A Claude session or chat that worked on this tool. The first is the current one. */
export interface GuideSession { label: string; url: string }
export interface Guide {
  intro: string;
  steps: GuideStep[];
  sections: GuideSection[];
  links: GuideLink[];
  sessions?: GuideSession[];
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_GUIDE: Guide = {
  intro:
    'Casa\'s referral agents get StreetEasy leads that must be answered within about 30 minutes, or StreetEasy ' +
    'passes them to another agent. Derek used to open each one by hand. This automation answers them on its own, ' +
    'usually within a minute of the email arriving, and tells Derek only about the ones it couldn\'t do.',
  steps: [
    {
      title: 'A lead arrives',
      summary: 'StreetEasy emails the referral agent\'s address, and the email is copied to Make.',
      details: [
        'Each referral agent has an alias like j.doe@email.casa-blanca.com; all of them deliver to the shared referral inbox, blancacasa1002@gmail.com.',
        'A Gmail filter in that inbox (from: streeteasy.com → forward) copies every StreetEasy email to a Make mailhook. The inbox copy stays where it is, unread.',
        'Two kinds of StreetEasy email matter: the lead itself ("You have until … to respond to an Inquiry from <address>") and the sign-in code StreetEasy sends when the service logs in.',
        'Leads after about 6 PM can be answered until 9:30 the next morning; daytime leads have about 30 minutes.',
      ],
    },
    {
      title: 'Make passes it to the service',
      summary: 'The Make scenario StreetEasy Referral Lead → Auto-Accept sends the email to the service on Railway within seconds.',
      details: [
        'The mailhook triggers the scenario instantly; there\'s no polling delay.',
        'The scenario posts the email\'s sender, recipients, subject, text and HTML to the service, with a shared key so nothing else can.',
      ],
    },
    {
      title: 'The service sorts it',
      summary: 'It works out which agent the lead is for and how long is left, and ignores everything else.',
      details: [
        'The agent is matched by the address the email was sent to, or by StreetEasy\'s "This email was sent to …" footer.',
        'An agent the service hasn\'t seen before is added to the list automatically, and a notice goes out.',
        'The deadline is read from the subject line; a lead whose deadline has passed is skipped and logged as expired.',
        'A sign-in code email is handed to the login that\'s waiting for it.',
        'Leads are handled one at a time, in the order they arrive.',
      ],
    },
    {
      title: 'It opens the agent\'s StreetEasy account',
      summary: 'Using the agent\'s saved login, or logging in fresh when that has expired.',
      details: [
        'Every agent has their own saved login on the service, so one browser can work as any number of agents without logging anyone out.',
        'When a login is needed: StreetEasy\'s sign-up page → Log in → the agent\'s email → the shared password (or the agent\'s own, if one is set on their card).',
        'StreetEasy then asks for a code by text. The service picks "Try another method" → Email instead, because emailed codes reach the shared inbox and come back through Make.',
        'It ticks "Remember this device for 30 days", so that agent won\'t need a code again for a month.',
        'If a password is rejected, the service never retries it (to avoid locking the account) and signs in with a one-time email code instead.',
      ],
    },
    {
      title: 'It responds to the lead',
      summary: 'On the agent\'s Connections list it finds the lead and clicks Respond Now, then sends the pre-filled message.',
      details: [
        'The lead link opens Agent Tools → Experts → Connections, the agent\'s list of every lead.',
        'The right card is found by building number and unit from the email (e.g. 315 East 56th Street #2E).',
        'StreetEasy\'s cookie banner is dismissed first ("essentials only"), since it covers the button.',
        'It clicks Respond Now and then Send in the message pop-up.',
        'It reloads the page and checks the card no longer asks for a response. Only then does it count as accepted.',
        'If someone already answered it, it logs "already accepted" and does nothing.',
      ],
    },
    {
      title: 'It reports',
      summary: 'Every lead is logged on this page; alert emails go to the lists under "Alert emails".',
      details: [
        'Accepted: a short email to the Accepted list, with a link to the run on this page.',
        'Anything a person must do: an "ACTION NEEDED by <time>" email to the Needs a person list, with the property, the agent account, the StreetEasy link, the reason and a screenshot.',
        'Every run keeps a screenshot of each step for 14 days (viewable here).',
        'Observe mode (the switch at the top) does everything except click, and treats every lead as needing a person.',
      ],
    },
  ],
  sections: [
    {
      title: 'Where each piece lives',
      body:
        '- The service: Railway (project casablanca). Its code is in the GitHub repo se-autoaccept; a push to main redeploys it. Its disk holds the agent list, saved logins, the run log and screenshots.\n' +
        '- Make: StreetEasy Referral Lead → Auto-Accept (inbox to service) and StreetEasy Lead Alerts → Email (service to the alert lists, sent from creative@casa-blanca.com, copied to casacalliste@gmail.com).\n' +
        '- The shared referral inbox: blancacasa1002@gmail.com, with the streeteasy.com forwarding filter.\n' +
        '- This page: the Studio, on Netlify. It talks to the service through its own function, which holds the service\'s key.\n' +
        '- Full technical notes: docs/lead-accept/README.md in the Studio repo.',
    },
    {
      title: 'What needs a person, and when',
      body:
        '- Every Tuesday: the Make connection that sends alerts from creative@casa-blanca.com expires weekly. A reminder fires Tuesdays at 3:21 PM: Make → Connections → Creative Google Restricted connection → Reauthorize, then check StreetEasy Lead Alerts → Email is on. Until then, alerts queue up and nobody is told.\n' +
        '- An agent with a different password: Set own password on their card, or Add an agent before their first lead.\n' +
        '- The shared password changed: update it in Railway\'s variables.\n' +
        '- "No agent match": the lead email didn\'t name an agent the service recognised. The alert shows who it was sent to.\n' +
        '- Failures on the Respond step: StreetEasy may have changed its page. Switch to observe mode and send the run\'s screenshots to a Claude session.\n' +
        '- Bot checks: the service never tries to get past one. That lead goes to a person.',
    },
  ],
  sessions: [
    { label: 'Build session, Nov 3–12 (Claude Code)', url: 'https://claude.ai/code/session_01UYdn92KnUfkzoUGCHzGwes' },
    { label: 'The original Claude chat', url: 'https://claude.ai/chat/98a32a9f-8d79-408f-bc3a-397dede0318f?artifact=ee999b8a-f77b-4d13-9571-637f5449d250' },
  ],
  links: [
    { name: 'StreetEasy Referral Lead → Auto-Accept', url: 'https://us2.make.com/1942598/scenarios/6887314/edit' },
    { name: 'StreetEasy Lead Alerts → Email', url: 'https://us2.make.com/1942598/scenarios/6889011/edit' },
    { name: 'Creative Google Restricted connection', url: 'https://us2.make.com/1942598/connections' },
    { name: 'Make', url: 'https://us2.make.com/1942598/scenarios' },
    { name: 'Railway', url: 'https://railway.com/dashboard' },
    { name: 'se-autoaccept', url: 'https://github.com/Casa-Blanca-Real-Estate/se-autoaccept' },
    { name: 'Agent Tools', url: 'https://streeteasy.com/industry-tools/experts/connections' },
    { name: 'StreetEasy', url: 'https://streeteasy.com/industry-tools/experts/connections' },
    { name: 'Netlify', url: 'https://app.netlify.com/' },
  ],
};

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');

/** Cleans a guide sent from the page. Returns null when its shape is wrong. */
export function cleanGuide(v: unknown): Guide | null {
  if (!v || typeof v !== 'object') return null;
  const g = v as Record<string, unknown>;
  if (!Array.isArray(g.steps) || !Array.isArray(g.sections) || !Array.isArray(g.links)) return null;
  if (g.steps.length > 20 || g.sections.length > 12 || g.links.length > 40) return null;
  const steps = g.steps.map((x) => {
    const t = (x ?? {}) as Record<string, unknown>;
    const details = Array.isArray(t.details) ? t.details.slice(0, 30).map((d) => s(d, 1200)).filter(Boolean) : [];
    return { title: s(t.title, 120), summary: s(t.summary, 1200), details };
  }).filter((t) => t.title);
  const sections = g.sections.map((x) => {
    const t = (x ?? {}) as Record<string, unknown>;
    return { title: s(t.title, 120), body: s(t.body, 6000) };
  }).filter((t) => t.title);
  const links = g.links.map((x) => {
    const t = (x ?? {}) as Record<string, unknown>;
    return { name: s(t.name, 80), url: s(t.url, 500) };
  }).filter((l) => l.name && /^(https?:\/\/|mailto:)/i.test(l.url));
  // Sessions: Claude links only, so the list can't become a way to send people elsewhere.
  const sessions = (Array.isArray(g.sessions) ? g.sessions.slice(0, 12) : []).map((x) => {
    const t = (x ?? {}) as Record<string, unknown>;
    return { label: s(t.label, 120), url: s(t.url, 500) };
  }).filter((x) => x.label && /^https:\/\/claude\.ai\//.test(x.url));
  if (!steps.length) return null;
  return { intro: s(g.intro, 2000), steps, sections, links, sessions };
}
