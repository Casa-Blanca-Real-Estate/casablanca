// The card's photo carries no referrer and loads lazily; a tag holding markup renders as text (Dispatch 20).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { photoImg, tagChip } from './elements.ts';

test('a photo is a plain <img> with referrerpolicy="no-referrer" and loading="lazy"', () => {
  const html = renderToStaticMarkup(photoImg('https://photos.zillowstatic.com/fp/a-se_large_800_400.webp', '9 Photo Street, photo 1 of 3'));
  assert.match(html, /^<img /);
  assert.match(html, /referrerPolicy="no-referrer"/);
  assert.match(html, /loading="lazy"/);
});

test('a tag holding markup renders as text, never as markup', () => {
  const html = renderToStaticMarkup(tagChip('<script>alert(1)</script><b>x</b>'));
  assert.equal(html, '<span class="so-tag">&lt;script&gt;alert(1)&lt;/script&gt;&lt;b&gt;x&lt;/b&gt;</span>');
});
