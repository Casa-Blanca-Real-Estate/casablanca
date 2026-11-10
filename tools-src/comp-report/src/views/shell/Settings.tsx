// Settings (Kimani, 2026-11-06), from the gear in the name menu: who you're signed in as (your name, email,
// level and the roster's card the client email signs with), and for the Studio team the dev switches, each
// per browser: the dev notebook's box, the dashboard's build marker, and for admins the comp report's Dev
// tools and the Gate as a new agent. Profile details come from Casa's roster and the sign-in: they're read
// here, and changed in the CMS.
import { useEffect, useState } from 'react';
import { agentCardApi, maySample, type AgentCard, type Me } from '../../api.ts';
import { BUILD_MARKER_OFF, BUILD_NOTES, NOTEBOOK_OFF, VIEW_AS_NEW, readSwitch, writeSwitch } from '../../dev-settings.ts';
import { isStudioTeam, notebookBackOn, notebookSignedIn } from '../../dev-notebook.ts';
import { Dialog } from './Dialog.tsx';

const ROLE: Record<Me['user']['role'], string> = { admin: 'Admin', mentor: 'Mentor', agent: 'Agent', external: 'External' };

interface Row { key: string; label: string; hint: string }

function rowsFor(me: Me): Row[] {
  const rows: Row[] = [
    { key: NOTEBOOK_OFF, label: 'Dev notebook', hint: notebookSignedIn()
      ? 'The ✎ and Ctrl+. (⌘.) on every Studio page, for notes to Claude.'
      : 'The ✎ and Ctrl+. (⌘.). This browser isn’t signed in to the notebook: it signs in on its own here if you’re a dev, or at /tools/dev-notebook/.' },
    { key: BUILD_MARKER_OFF, label: 'Build marker', hint: 'Which branch and commit the site is, on the Studio dashboard.' },
  ];
  if (maySample(me)) {
    rows.push({ key: BUILD_NOTES, label: 'Dev tools in reports', hint: 'About this screen and build notes. Fill with sample stays on.' });
  }
  if (me.user.role === 'admin') {
    rows.push({ key: VIEW_AS_NEW, label: 'View the Gate as a new agent', hint: 'Low, high and a why of 100+ characters; no skip.' });
  }
  return rows;
}

export function Settings({ me, identityToken, onClose }: { me: Me; identityToken?: () => Promise<string | null>; onClose: () => void }) {
  const [card, setCard] = useState<AgentCard | null | undefined>(undefined);
  const team = isStudioTeam(me);
  const rows = team ? rowsFor(me) : [];
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.key, readSwitch(r.key)])));
  useEffect(() => {
    void agentCardApi.mine().then(setCard);
  }, []);

  const flip = (key: string, next: boolean) => {
    writeSwitch(key, next);
    setOn((o) => ({ ...o, [key]: next }));
    if (key === NOTEBOOK_OFF && next) notebookBackOn(me, identityToken);
  };
  const anyOn = rows.some((r) => on[r.key]);
  const all = (next: boolean) => rows.forEach((r) => { if (on[r.key] !== next) flip(r.key, next); });

  const name = card?.name ?? me.user.name;
  return (
    <Dialog title="Settings" onClose={onClose} testId="settings" footer={<button type="button" className="btn primary" onClick={onClose}>Done</button>}>
      <section className="sh-dlg-section" aria-label="You">
        <h3>You</h3>
        <div className="sh-profile">
          {card?.photo ? <img src={card.photo} alt="" /> : <span className="sh-profile-ph" aria-hidden="true" />}
          <dl>
            <dt>Name</dt><dd>{name || '—'}</dd>
            <dt>Email</dt><dd>{me.user.email}</dd>
            {card?.title && <><dt>Title</dt><dd>{card.title}</dd></>}
            {card?.phone && <><dt>Phone</dt><dd>{card.phone}</dd></>}
            <dt>Access</dt><dd>{[ROLE[me.user.role], me.user.capability === 'practice' ? 'practice reports' : 'full reports', team ? 'Studio team' : null, me.user.guest ? 'guest' : null].filter(Boolean).join(' · ')}</dd>
          </dl>
        </div>
        <p className="sh-help">{card === null
          ? 'Your name, photo and phone come from Casa’s roster, which doesn’t list this email yet. Ask Kimani to add you.'
          : 'Your name, title, photo and phone come from Casa’s roster: they sign your client emails. Kimani changes them in the CMS.'}</p>
      </section>
      {team && (
        <section className="sh-dlg-section" aria-label="Dev tools">
          <div className="sh-dlg-row">
            <h3>Dev tools · Studio team only</h3>
            <button type="button" className="link sh-act" onClick={() => all(!anyOn)}>{anyOn ? 'Turn all off' : 'Turn all on'}</button>
          </div>
          {rows.map((r) => (
            <label key={r.key} className="sh-switch-row">
              <input type="checkbox" role="switch" checked={on[r.key] ?? false} onChange={(e) => flip(r.key, e.target.checked)} />
              <span>
                <span className="sh-switch-label">{r.label}</span>
                <span className="sh-help">{r.hint}</span>
              </span>
            </label>
          ))}
          <p className="sh-help">These stay on this browser only.</p>
        </section>
      )}
    </Dialog>
  );
}
