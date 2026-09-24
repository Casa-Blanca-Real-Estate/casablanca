// The engine is pure (§6): no DOM, no network, no clock — and no maths that a
// browser and a server could round differently. The type check already bars
// DOM and Node APIs (../tsconfig.json); this reads the source's syntax tree
// for what a type check can't see.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ENGINE = fileURLToPath(new URL('..', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' || name === 'node_modules' ? [] : sources(path);
    return name.endsWith('.ts') ? [path] : [];
  });
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

test('the engine source uses no clock, network, DOM, randomness or engine-dependent maths', () => {
  const problems: string[] = [];
  const files = sources(ENGINE);
  assert.ok(files.length > 15);
  for (const file of files) {
    const rel = relative(ENGINE, file).split('\\').join('/');
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const where = (node: ts.Node) => `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const spec = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
        if (spec && !spec.startsWith('./') && !spec.startsWith('../')) problems.push(`${where(node)} imports "${spec}" — the engine has no dependencies`);
      }
      if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.has(node.text) && !ALLOWED[rel]?.has(node.text)) {
        const parent = node.parent;
        const isPropertyName = (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) || ts.isPropertySignature(parent) ||
          (ts.isQualifiedName(parent) && parent.right === node);
        if (!isPropertyName) problems.push(`${where(node)} uses ${node.text}`);
      }
      if (ts.isPropertyAccessExpression(node)) {
        if (ts.isIdentifier(node.expression) && node.expression.text === 'Math' && !ALLOWED_MATH.has(node.name.text)) {
          problems.push(`${where(node)} uses Math.${node.name.text}`);
        }
        if (FORBIDDEN_METHODS.has(node.name.text)) problems.push(`${where(node)} uses .${node.name.text}`);
      }
      if (node.kind === ts.SyntaxKind.AsteriskAsteriskToken || node.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken) {
        problems.push(`${where(node)} uses ** — use powInt`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  assert.deepEqual(problems, []);
});

test('the scan would catch a violation', () => {
  const sf = ts.createSourceFile('x.ts', 'const t = Date.now(); const p = 2 ** 3; Math.pow(2, 3); "a".localeCompare("b");', ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.has(node.text)) found.push(node.text);
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Math' && !ALLOWED_MATH.has(node.name.text)) found.push('Math.pow');
    if (ts.isPropertyAccessExpression(node) && FORBIDDEN_METHODS.has(node.name.text)) found.push(node.name.text);
    if (node.kind === ts.SyntaxKind.AsteriskAsteriskToken) found.push('**');
    ts.forEachChild(node, visit);
  };
  visit(sf);
  assert.deepEqual(found.sort(), ['**', 'Date', 'Math.pow', 'localeCompare'].sort());
});
