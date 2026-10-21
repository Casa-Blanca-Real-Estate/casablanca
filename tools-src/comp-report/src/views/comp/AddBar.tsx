// The handoff's paste bar (New report 3 of 3, and Sort's "+ Add comps"):
// paste StreetEasy links (each read in the background, its row filling in as
// the read finishes; a pasted link shows as the clean link, NW-004), or type an address (the comp's form opens with
// it), or "Type one in". Drop the StreetEasy export anywhere on the screen
// that holds it (useDropTarget). Screenshots aren't read in this version: the
// screen says so where they're dropped.
import { useState, type DragEvent, type ReactNode } from 'react';
import { parseExport } from '../../../engine/index.ts';
import { linksApi, workspaceApi } from '../../api.ts';
import { checkListingLink, MAX_LINKS_PER_REQUEST } from '../../../workspace/links.ts';
import { toBase64, type Workspace } from '../workspace/model.ts';
import { CompForm, type CompPrefill } from './CompForm.tsx';
import '../../styles/compform.css';

const MAX_EXPORT_BYTES = 2 * 1024 * 1024;
const LINKISH = /^(https?:\/\/|www\.|streeteasy)/i;

/** Pastes, links and the export: what the bar and a drop both do. */
async function addLinks(ws: Workspace, text: string): Promise<string | null> {
  const lines = text.split(/\s+/).map((l) => l.trim()).filter(Boolean);
  const checked = lines.map((l) => ({ raw: l, check: checkListingLink(/^https?:\/\//i.test(l) ? l : `https://${l}`) }));
  const good = [...new Set(checked.flatMap((c) => (c.check.ok ? [c.check.url] : [])))];
  const bad = checked.filter((c) => !c.check.ok);
  if (!good.length) return bad[0] && !bad[0].check.ok ? bad[0].check.reason : 'That isn’t a StreetEasy listing link.';
  if (good.length > MAX_LINKS_PER_REQUEST) return `Up to ${MAX_LINKS_PER_REQUEST} links at a time.`;
  let note: string | null = null;
  await ws.run(`Adding ${good.length} link${good.length === 1 ? '' : 's'}…`, async () => {
    const added = await linksApi.add(ws.reportId, good);
    ws.applyLinks(added);
    note = [
      added.already.length ? `${added.already.length} already here` : null,
      ...added.refused.map((r) => r.reason),
      ...bad.map((b) => (b.check.ok ? '' : b.check.reason)),
      added.limit.left <= 5 ? `${added.limit.left} of today’s ${added.limit.perDay} reads left` : null,
    ].filter(Boolean).join(' · ') || null;
  });
  return note;
}

async function addExport(ws: Workspace, file: File): Promise<string | null> {
  if (file.size > MAX_EXPORT_BYTES) return 'That file is larger than a StreetEasy export should be (2 MB).';
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (!parseExport(bytes, { as_of: ws.today, filename: file.name }).comps.length) return 'That export has no comps in it.';
  } catch (e) {
    return `That file couldn’t be read as a StreetEasy export: ${e instanceof Error ? e.message : String(e)}`;
  }
  await ws.run(`Adding ${file.name}…`, async () => {
    ws.applyServer(await workspaceApi.importFile(ws.reportId, { filename: file.name, contentBase64: toBase64(bytes), asOf: ws.today }));
  });
  return null;
}

/** Every word a StreetEasy link that checks out: the clean links, a space apart. Otherwise null. */
export function cleanLinks(text: string): string | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || !words.every((w) => LINKISH.test(w))) return null;
  const checked = words.map((w) => checkListingLink(/^https?:\/\//i.test(w) ? w : `https://${w}`));
  return checked.every((c) => c.ok) ? checked.map((c) => (c.ok ? c.url : '')).join(' ') : null;
}

export const SCREENSHOTS_LATER = 'Screenshots aren’t read yet: paste the listing’s link, or type it in for now.';

/**
 * Drop anywhere on the screen that holds the bar: the export (CSV or XLSX), a
 * link, or a screenshot (not read in this version: it says so). Spread
 * `handlers` on the container and render `veil` inside it (position: relative).
 */
export function useDropTarget(ws: Workspace, onNote: (note: string | null) => void) {
  const [dragging, setDragging] = useState(false);
  const handlers = {
    onDragOver: (e: DragEvent) => {
      if (ws.readOnly) return;
      e.preventDefault();
      if (!dragging) setDragging(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (ws.readOnly) return;
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        if (/^image\//.test(file.type)) onNote(SCREENSHOTS_LATER);
        else void addExport(ws, file).then(onNote);
        return;
      }
      const text = e.dataTransfer.getData('text');
      if (text.trim()) void addLinks(ws, text).then(onNote);
    },
  };
  const veil: ReactNode = dragging ? <div className="drop-veil" aria-hidden="true">Drop the export, a link or listing screenshots</div> : null;
  return { dragging, handlers, veil };
}

/**
 * The bar, its hint and the comp's form. `note` and `onNote` carry what a
 * paste or a drop said back (a refused link, an export that couldn't be read).
 */
export function AddBar({ ws, note, onNote }: { ws: Workspace; note: string | null; onNote: (note: string | null) => void }) {
  const [paste, setPaste] = useState('');
  // The form: closed, typed from the bar (its address is the bar's text), or "Type one in".
  const [form, setForm] = useState<null | { typed: boolean; prefill: CompPrefill | null; key: number }>(null);
  if (ws.readOnly) return null;
  const hasPaste = LINKISH.test(paste.trim());

  const onType = (v: string) => {
    setPaste(v);
    onNote(null);
    if (LINKISH.test(v.trim()) || v.trim().length < 3) {
      if (form?.typed) setForm(null);
      return;
    }
    if (!form) setForm({ typed: true, prefill: null, key: Date.now() });
  };
  const add = async () => {
    if (!paste.trim()) return;
    if (!hasPaste) {
      if (!form) setForm({ typed: true, prefill: null, key: Date.now() });
      return;
    }
    const said = await addLinks(ws, paste);
    onNote(said);
    setPaste('');
  };

  return (
    <div className="add-bar">
      <div className="paste-bar">
        <input
          aria-label="Paste StreetEasy links, or type an address"
          value={paste}
          placeholder="Paste StreetEasy links to fill them in, or type an address and fill it in yourself"
          onChange={(e) => onType(e.target.value)}
          // Links that check out show as the clean links the tool reads (NW-004).
          onPaste={(e) => {
            const el = e.currentTarget;
            const next = `${el.value.slice(0, el.selectionStart ?? el.value.length)}${e.clipboardData.getData('text')}${el.value.slice(el.selectionEnd ?? el.value.length)}`;
            const clean = cleanLinks(next);
            if (clean === null || clean === next) return;
            e.preventDefault();
            onType(clean);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void add();
            }
          }}
        />
        {hasPaste && <button type="button" className="btn primary paste-add" disabled={Boolean(ws.busy)} onClick={() => void add()}>Add</button>}
        <button type="button" className="link paste-type" onClick={() => setForm({ typed: false, prefill: null, key: Date.now() })}>Type one in</button>
      </div>
      <div className="paste-hint">Or drop the StreetEasy export or listing screenshots anywhere here</div>
      {note && <p className="paste-note" role="status">{note}</p>}
      {form && (
        <CompForm
          key={form.key}
          ws={ws}
          hideAddress={form.typed}
          prefill={form.typed ? { address: paste } : form.prefill}
          onCancel={() => setForm(null)}
          onDone={() => {
            if (form.typed) setPaste('');
            setForm(null);
          }}
        />
      )}
    </div>
  );
}
