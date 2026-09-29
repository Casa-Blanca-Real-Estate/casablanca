// An effect's return value is its cleanup, and React calls it. An expression-bodied effect —
// useEffect(() => el.scrollIntoView()) — hands React whatever the expression returns. Newer Chrome
// returns a Promise from scrollIntoView(), React called it on the next update, and the report page
// crashed in production ("l is not a function", 2026-09-29). Effects take a block body.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('.', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

test('every effect has a block body, so it returns a cleanup function or nothing', () => {
  const offenders = sources(SRC).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line, i) => ({ line: line.trim(), at: `${file.slice(SRC.length)}:${i + 1}` }))
      .filter(({ line }) => /use(Layout|Insertion)?Effect\(\s*(async\s*)?\(\)\s*=>\s*[^{\s]/.test(line)),
  );
  assert.deepEqual(offenders, [], 'give these effects a block body: useEffect(() => { … }, deps)');
});
