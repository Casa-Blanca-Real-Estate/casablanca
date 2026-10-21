// Hubert's replies, as React elements (Dispatch 15, NW-023): the markdown he
// writes, a small part of it. Bold, italic, inline code, lists, headings (as
// bold lines) and http(s) links. Nothing else: no images, no raw HTML, which
// React prints as text. A marker that isn't closed yet stays as written, so a
// reply reads the same half-streamed as finished.
//
// Hubert reads third-party listing text, so a link can point anywhere: each
// opens in a new tab with rel="noopener noreferrer nofollow", a labelled one
// shows its host beside the label, and a URL with a user name or password in
// it (https://x@evil.example) is left as plain text.
//
// No JSX here, so the tests run it as it is (markdown.test.ts); the component
// is markdown.tsx.
import { createElement, Fragment, type ReactNode } from 'react';

/** What every link from Hubert carries. */
export const LINK_PROPS = { target: '_blank', rel: 'noopener noreferrer nofollow' } as const;

/** An http(s) URL with no user name or password, normalised; null for anything else. */
export function safeUrl(raw: string): URL | null {
  if (!/^https?:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url;
}

// ─── Inline ─────────────────────────────────────────────────────────────────

const BARE_URL = /^https?:\/\/[^\s<>()[\]"'`]+/i;
const MD_LINK = /^\[([^\]\n]+)\]\(([^()\s]+)\)/;
const isWord = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

function link(label: ReactNode[], labelText: string, url: URL, key: string): ReactNode {
  const shown = labelText.trim();
  const plain = shown === url.href || shown === url.href.replace(/\/$/, '') || shown.replace(/^https?:\/\//i, '') === url.href.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return createElement(
    Fragment,
    { key },
    createElement('a', { href: url.href, ...LINK_PROPS, className: 'hb-md-link' }, ...label),
    plain ? null : createElement('span', { className: 'hb-md-host' }, ` (${url.host})`),
  );
}

/** One line's inline markdown. Links aren't parsed inside a link's label. */
function inline(text: string, key: string, links = true): ReactNode[] {
  const out: ReactNode[] = [];
  let plain = '';
  let n = 0;
  const flush = () => {
    if (plain) out.push(plain);
    plain = '';
  };
  const push = (node: ReactNode) => {
    flush();
    out.push(node);
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const rest = text.slice(i);
    const k = `${key}.${n++}`;

    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        push(createElement('code', { key: k, className: 'hb-md-code' }, text.slice(i + 1, end)));
        i = end + 1;
        continue;
      }
    }

    if ((ch === '*' || ch === '_') && text[i + 1] === ch) {
      const marker = ch + ch;
      const end = text.indexOf(marker, i + 2);
      const inner = end > i + 2 ? text.slice(i + 2, end) : '';
      if (inner.trim() && !/^\s/.test(inner) && !/\s$/.test(inner) && (ch === '*' || !isWord(text[i - 1]))) {
        push(createElement('strong', { key: k }, ...inline(inner, k, links)));
        i = end + 2;
        continue;
      }
    } else if ((ch === '*' || ch === '_') && text[i - 1] !== ch) {
      // A single marker: italic, closed on the same line, not inside a word for "_" (snake_case stays as it is).
      let end = -1;
      for (let j = i + 1; j < text.length; j++) {
        if (text[j] === ch && text[j + 1] !== ch && text[j - 1] !== ch) {
          end = j;
          break;
        }
      }
      const inner = end > i + 1 ? text.slice(i + 1, end) : '';
      const wordy = ch === '_' && (isWord(text[i - 1]) || isWord(text[end + 1]));
      if (inner.trim() && !/^\s/.test(inner) && !/\s$/.test(inner) && !wordy) {
        push(createElement('em', { key: k }, ...inline(inner, k, links)));
        i = end + 1;
        continue;
      }
    }

    if (links && ch === '[') {
      const m = MD_LINK.exec(rest);
      if (m) {
        const url = safeUrl(m[2]!);
        if (url) {
          push(link(inline(m[1]!, k, false), m[1]!, url, k));
        } else {
          plain += m[0]; // not a link Hubert may give: as written
        }
        i += m[0].length;
        continue;
      }
    }

    if (links && (ch === 'h' || ch === 'H') && !isWord(text[i - 1])) {
      const m = BARE_URL.exec(rest);
      if (m) {
        // Sentence punctuation after a URL isn't part of it.
        const raw = m[0].replace(/[.,;:!?]+$/, '');
        const url = safeUrl(raw);
        if (url) push(link([raw], raw, url, k));
        else plain += raw;
        i += raw.length;
        continue;
      }
    }

    plain += ch;
    i++;
  }
  flush();
  return out;
}

// ─── Blocks ─────────────────────────────────────────────────────────────────

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;

/** Hubert's text as React elements: paragraphs, bold heading lines and lists. */
export function renderMarkdown(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;
  let n = 0;

  const endPara = () => {
    if (!para.length) return;
    const k = `p${n++}`;
    const children: ReactNode[] = [];
    para.forEach((line, i) => {
      if (i) children.push(createElement('br', { key: `${k}.br${i}` }));
      children.push(...inline(line, `${k}.${i}`));
    });
    out.push(createElement('p', { key: k, className: 'hb-md-p' }, ...children));
    para = [];
  };
  const endList = () => {
    if (!list) return;
    const k = `l${n++}`;
    const items = list.items.map((item, i) => createElement('li', { key: `${k}.${i}` }, ...inline(item, `${k}.${i}`)));
    out.push(list.ordered
      ? createElement('ol', { key: k, className: 'hb-md-list', ...(list.start !== 1 ? { start: list.start } : {}) }, ...items)
      : createElement('ul', { key: k, className: 'hb-md-list' }, ...items));
    list = null;
  };

  for (const line of lines) {
    if (!line.trim()) {
      endPara();
      endList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      endPara();
      endList();
      const k = `h${n++}`;
      out.push(createElement('p', { key: k, className: 'hb-md-p hb-md-h' }, createElement('strong', null, ...inline(heading[1]!, k))));
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      endPara();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) endList();
      if (!list) list = { ordered, start: numbered ? Number(numbered[1]) : 1, items: [] };
      list.items.push(bullet ? bullet[1]! : numbered![2]!);
      continue;
    }
    // A line under a list item carries on that item.
    if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    endList();
    para.push(line);
  }
  endPara();
  endList();
  return out;
}
