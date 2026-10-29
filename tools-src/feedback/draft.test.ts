// The Feedback tray keeps its draft (NW-098, Dispatch 22b): saved on input, restored on open as
// text, cleared on a successful send, and kept through a stray click outside the tray.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../assets/feedback.js'), 'utf8');

/** A page with the widget on it, and a fetch that answers `ok`. */
function page(opts: { ok?: boolean; storage?: Record<string, string> } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main id="tool">A tool</main></body></html>', {
    url: 'https://studio.test/tools/comp-report/',
    runScripts: 'outside-only',
  });
  const w = dom.window;
  for (const [k, v] of Object.entries(opts.storage ?? {})) w.localStorage.setItem(k, v);
  const posts: string[] = [];
  (w as unknown as { fetch: unknown }).fetch = async (_url: string, init: { body: string }) => {
    posts.push(init.body);
    return { ok: opts.ok ?? true };
  };
  w.eval(SOURCE);
  const $ = <T extends Element = HTMLElement>(sel: string) => w.document.querySelector(sel) as T | null;
  const open = () => ($('.cb-fb-btn') as HTMLButtonElement).click();
  const type = (sel: string, value: string) => {
    const el = $<HTMLInputElement>(sel)!;
    el.value = value;
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
  };
  const outside = () => $('#tool')!.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
  return { w, $, open, type, outside, posts, draft: () => JSON.parse(w.localStorage.getItem('cb_feedback_draft') ?? 'null') };
}

describe('the Feedback tray keeps its draft', () => {
  test('saved on input, and put back when the tray opens again', () => {
    const p = page();
    p.open();
    p.type('.cb-fb-name', 'Ana');
    p.type('.cb-fb-msg', 'The sort step is slow');
    assert.deepEqual(p.draft(), { name: 'Ana', email: '', message: 'The sort step is slow' });
    p.$<HTMLButtonElement>('.cb-fb-close')!.click();
    assert.equal(p.$('.cb-fb-tray'), null);
    p.open();
    assert.equal(p.$<HTMLInputElement>('.cb-fb-name')!.value, 'Ana');
    assert.equal(p.$<HTMLTextAreaElement>('.cb-fb-msg')!.value, 'The sort step is slow');
  });

  test('a draft with markup comes back as text, never as markup', () => {
    const evil = '<img src=x onerror="window.__pwned=1"><b>bold</b>';
    const p = page({ storage: { cb_feedback_draft: JSON.stringify({ name: evil, email: '', message: evil }) } });
    p.open();
    assert.equal(p.$<HTMLTextAreaElement>('.cb-fb-msg')!.value, evil);
    assert.equal(p.$<HTMLInputElement>('.cb-fb-name')!.value, evil);
    assert.equal(p.$('.cb-fb-tray img'), null);
    assert.equal(p.$('.cb-fb-tray b'), null);
    assert.equal((p.w as unknown as { __pwned?: number }).__pwned, undefined);
  });

  test('a stray click outside keeps the tray open while there is a message; an empty one closes', () => {
    const p = page();
    p.open();
    p.outside();
    assert.equal(p.$('.cb-fb-tray'), null, 'empty: closes as before');
    p.open();
    p.type('.cb-fb-msg', 'Half a thought');
    p.outside();
    assert.notEqual(p.$('.cb-fb-tray'), null, 'a message: stays open');
  });

  test('cleared once it is sent; kept when the send fails', async () => {
    const failing = page({ ok: false });
    failing.open();
    failing.type('.cb-fb-msg', 'Keep me');
    failing.$<HTMLButtonElement>('.cb-fb-send')!.click();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(failing.draft()?.message, 'Keep me');

    const p = page();
    p.open();
    p.type('.cb-fb-msg', 'Send me');
    p.$<HTMLButtonElement>('.cb-fb-send')!.click();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(p.posts.length, 1);
    assert.equal(JSON.parse(p.posts[0]!).message, 'Send me');
    assert.equal(p.draft(), null);
  });
});
