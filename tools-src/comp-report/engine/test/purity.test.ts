// The engine is pure (§6): no DOM, no network, no clock — and no maths that a
// browser and a server could round differently. The type check already bars
// DOM and Node APIs (../tsconfig.json); this reads the source for what a type
// check can't see.
//
// Node strips the TypeScript types (leaving positions intact), and a small
// JavaScript lexer below separates code from comments, strings and regular
// expressions, so a comment that says "Date" isn't mistaken for a use of it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const ENGINE = fileURLToPath(new URL('..', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' || name === 'node_modules' ? [] : sources(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

interface Token {
  kind: 'ident' | 'punct' | 'string' | 'template' | 'regex' | 'number';
  text: string;
  pos: number;
}

const KEYWORDS_BEFORE_EXPRESSION = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

/** Tokens of plain JavaScript: comments dropped; strings, templates and regular expressions kept whole. */
function lexJs(src: string): Token[] {
  const out: Token[] = [];
  const templateDepths: number[] = [];
  let depth = 0;
  let i = 0;
  const last = () => out[out.length - 1];
  const regexAllowed = () => {
    const p = last();
    if (!p) return true;
    if (p.kind === 'ident') return KEYWORDS_BEFORE_EXPRESSION.has(p.text);
    if (p.kind !== 'punct') return false;
    return p.text !== ')' && p.text !== ']' && p.text !== '}';
  };
  const templateChunk = (start: number) => {
    // Reads template text up to the closing backtick or the next ${.
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '`') { i++; out.push({ kind: 'template', text: src.slice(start, i), pos: start }); return; }
      if (src[i] === '$' && src[i + 1] === '{') {
        out.push({ kind: 'template', text: src.slice(start, i), pos: start });
        i += 2;
        templateDepths.push(depth);
        depth++;
        out.push({ kind: 'punct', text: '${', pos: i - 2 });
        return;
      }
      i++;
    }
  };
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
    if (ch === '"' || ch === "'") {
      const start = i++;
      while (i < src.length && src[i] !== ch) i += src[i] === '\\' ? 2 : 1;
      i++;
      out.push({ kind: 'string', text: src.slice(start + 1, i - 1), pos: start });
      continue;
    }
    if (ch === '`') { const start = i++; templateChunk(start); continue; }
    if (ch === '}' && templateDepths.length > 0 && templateDepths[templateDepths.length - 1] === depth - 1) {
      templateDepths.pop();
      depth--;
      const start = i++;
      templateChunk(start);
      continue;
    }
    if (ch === '/' && regexAllowed()) {
      const start = i++;
      let inClass = false;
      while (i < src.length) {
        const c = src[i]!;
        if (c === '\\') { i += 2; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        i++;
      }
      i++;
      while (i < src.length && /[a-z]/i.test(src[i]!)) i++;
      out.push({ kind: 'regex', text: src.slice(start, i), pos: start });
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < src.length && /[\w$]/.test(src[i]!)) i++;
      out.push({ kind: 'ident', text: src.slice(start, i), pos: start });
      continue;
    }
    if (/\d/.test(ch)) {
      const start = i;
      while (i < src.length && /[\w.]/.test(src[i]!)) i++;
      out.push({ kind: 'number', text: src.slice(start, i), pos: start });
      continue;
    }
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    const text = ['**=', '...', '===', '!=='].includes(three) ? three : ['**', '?.', '=>', '==', '!=', '<=', '>=', '&&', '||', '??'].includes(two) ? two : ch;
    if (text === '{') depth++;
    if (text === '}') depth--;
    out.push({ kind: 'punct', text, pos: i });
    i += text.length;
  }
  return out;
}

const FORBIDDEN_GLOBALS = new Set([
  'Date', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'window', 'document', 'navigator', 'location',
  'localStorage', 'sessionStorage', 'indexedDB', 'performance', 'setTimeout', 'setInterval', 'setImmediate',
  'queueMicrotask', 'requestAnimationFrame', 'require', 'process', 'globalThis', 'crypto', 'Intl', 'eval',
  'Function', 'TextEncoder', 'TextDecoder', 'DecompressionStream', 'Buffer',
]);
/** Math members IEEE 754 pins exactly; the rest are implementation-approximated. */
const ALLOWED_MATH = new Set(['abs', 'ceil', 'floor', 'max', 'min', 'round', 'sign', 'trunc', 'sqrt']);
const FORBIDDEN_METHODS = new Set(['localeCompare', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'toLocaleUpperCase', 'toLocaleLowerCase']);
/** The one sanctioned ambient read: detecting a test runner, to refuse test values anywhere else. */
const ALLOWED: Record<string, Set<string>> = { 'house-method/runtime.ts': new Set(['globalThis']) };

/** Every impurity in one file's source, as "file:line what". */
function impurities(file: string, typescript: string): string[] {
  const js = stripTypeScriptTypes(typescript, { mode: 'strip' });
  const tokens = lexJs(js);
  const line = (pos: number) => js.slice(0, pos).split('\n').length;
  const problems: string[] = [];
  tokens.forEach((t, k) => {
    const prev = tokens[k - 1];
    const next = tokens[k + 1];
    const afterDot = prev?.kind === 'punct' && (prev.text === '.' || prev.text === '?.');
    const where = `${file}:${line(t.pos)}`;
    if (t.kind === 'ident') {
      const objectKey = next?.kind === 'punct' && next.text === ':' && prev?.kind === 'punct' && (prev.text === '{' || prev.text === ',');
      if (FORBIDDEN_GLOBALS.has(t.text) && !afterDot && !objectKey && !ALLOWED[file]?.has(t.text)) problems.push(`${where} uses ${t.text}`);
      if (t.text === 'Math' && !afterDot && next?.text === '.' && tokens[k + 2] && !ALLOWED_MATH.has(tokens[k + 2]!.text)) {
        problems.push(`${where} uses Math.${tokens[k + 2]!.text}`);
      }
      if (afterDot && FORBIDDEN_METHODS.has(t.text)) problems.push(`${where} uses .${t.text}`);
      if ((t.text === 'from' || t.text === 'import') && next) {
        const spec = next.kind === 'string' ? next : next.text === '(' && tokens[k + 2]?.kind === 'string' ? tokens[k + 2]! : null;
        if (spec && !spec.text.startsWith('./') && !spec.text.startsWith('../')) problems.push(`${where} imports "${spec.text}" — the engine has no dependencies`);
      }
    }
    if (t.kind === 'punct' && (t.text === '**' || t.text === '**=')) problems.push(`${where} uses ** — use powInt`);
  });
  return problems;
}

test('the engine source uses no clock, network, DOM, randomness, locale or engine-dependent maths, and no dependencies', () => {
  const files = sources(ENGINE);
  assert.ok(files.length > 15);
  const problems = files.flatMap((f) => impurities(relative(ENGINE, f).split('\\').join('/'), readFileSync(f, 'utf8')));
  assert.deepEqual(problems, []);
});

test('the scan catches violations, and only violations', () => {
  const source = [
    '// Date.now() in a comment is fine, as is "Math.pow" in a string',
    "const url = 'https://streeteasy.com/x'; const re = /^(https?):\\/\\/([^/?#]+)/i; const half = a / b / 2;",
    'const t = Date.now();',
    'const p = 2 ** 3;',
    'Math.pow(2, 3); Math.round(2.5);',
    '"a".localeCompare("b");',
    'const s = `now: ${new Date().getTime()} and ${`nested ${Math.random()}`}`;',
    "import x from 'left-pad';",
    'const o = { document: 1 }; o.process; const g = globalThis;',
  ].join('\n');
  assert.deepEqual(impurities('x.ts', source), [
    'x.ts:3 uses Date',
    'x.ts:4 uses ** — use powInt',
    'x.ts:5 uses Math.pow',
    'x.ts:6 uses .localeCompare',
    'x.ts:7 uses Date',
    'x.ts:7 uses Math.random',
    'x.ts:8 imports "left-pad" — the engine has no dependencies',
    'x.ts:9 uses globalThis',
  ]);
});
