// A minimal XML reader for SpreadsheetML parts: elements, attributes, text,
// CDATA and the predefined and numeric entities. Namespace prefixes are kept
// on the name as written and stripped for matching. DTDs are refused rather
// than processed, so no entity-expansion tricks.

export interface XmlElement {
  /** Local name, prefix stripped: "row", "c", "t". */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

export class XmlError extends Error {
  constructor(message: string) {
    super(`xml: ${message}`);
    this.name = 'XmlError';
  }
}

function localName(qname: string): string {
  const colon = qname.indexOf(':');
  return colon < 0 ? qname : qname.slice(colon + 1);
}

function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
    }
    return body === 'lt' ? '<' : body === 'gt' ? '>' : body === 'amp' ? '&' : body === 'quot' ? '"' : "'";
  });
}

const ATTR = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function parseXml(text: string): XmlElement {
  const root: XmlElement = { name: '#document', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf('<', i);
    const textEnd = lt < 0 ? n : lt;
    if (textEnd > i) {
      const chunk = text.slice(i, textEnd);
      if (stack.length > 1) stack[stack.length - 1]!.children.push(decodeEntities(chunk));
    }
    if (lt < 0) break;
    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      if (end < 0) throw new XmlError('unterminated processing instruction');
      i = end + 2;
    } else if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end < 0) throw new XmlError('unterminated comment');
      i = end + 3;
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end < 0) throw new XmlError('unterminated CDATA section');
      stack[stack.length - 1]!.children.push(text.slice(lt + 9, end));
      i = end + 3;
    } else if (text.startsWith('<!', lt)) {
      throw new XmlError('DTDs and declarations are not supported');
    } else if (text[lt + 1] === '/') {
      const end = text.indexOf('>', lt + 2);
      if (end < 0) throw new XmlError('unterminated end tag');
      const name = localName(text.slice(lt + 2, end).trim());
      const open = stack.pop();
      if (!open || open === root || open.name !== name) throw new XmlError(`mismatched end tag </${name}>`);
      i = end + 1;
    } else {
      // Find the tag's end, skipping quoted attribute values.
      let j = lt + 1;
      let quote = '';
      for (; j < n; j++) {
        const ch = text[j]!;
        if (quote) { if (ch === quote) quote = ''; }
        else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
      }
      if (j >= n) throw new XmlError('unterminated start tag');
      let body = text.slice(lt + 1, j);
      const selfClosing = body.endsWith('/');
      if (selfClosing) body = body.slice(0, -1);
      const nameMatch = /^[^\s/>]+/.exec(body);
      if (!nameMatch) throw new XmlError('element without a name');
      const element: XmlElement = { name: localName(nameMatch[0]), attrs: {}, children: [] };
      ATTR.lastIndex = nameMatch[0].length;
      let m: RegExpExecArray | null;
      while ((m = ATTR.exec(body)) !== null) {
        element.attrs[m[1]!] = decodeEntities(m[3] ?? m[4] ?? '');
      }
      stack[stack.length - 1]!.children.push(element);
      if (!selfClosing) stack.push(element);
      i = j + 1;
    }
  }
  if (stack.length !== 1) throw new XmlError(`unclosed element <${stack[stack.length - 1]!.name}>`);
  const top = root.children.find((c): c is XmlElement => typeof c !== 'string');
  if (!top) throw new XmlError('no root element');
  return top;
}

export function childElements(el: XmlElement, name?: string): XmlElement[] {
  return el.children.filter((c): c is XmlElement => typeof c !== 'string' && (name === undefined || c.name === name));
}

export function firstChild(el: XmlElement, name: string): XmlElement | undefined {
  return childElements(el, name)[0];
}

/** All text beneath an element. */
export function textOf(el: XmlElement): string {
  let s = '';
  for (const c of el.children) s += typeof c === 'string' ? c : textOf(c);
  return s;
}

/** An attribute by its local name, whatever namespace prefix it was written with. */
export function attrLocal(el: XmlElement, name: string): string | undefined {
  if (name in el.attrs) return el.attrs[name];
  for (const [k, v] of Object.entries(el.attrs)) if (localName(k) === name) return v;
  return undefined;
}
