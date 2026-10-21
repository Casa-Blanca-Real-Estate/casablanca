// Hubert's markdown (Dispatch 15, NW-023): what renders, and what a listing's
// text can't turn into a working link or markup.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown, safeUrl } from './markdown.ts';

const html = (text: string) => renderToStaticMarkup(createElement(Fragment, null, ...renderMarkdown(text)));

test('bold, italic, code, headings as bold lines, and lists', () => {
  assert.equal(html('**Bold** and *italic* and `code`'), '<p class="hb-md-p"><strong>Bold</strong> and <em>italic</em> and <code class="hb-md-code">code</code></p>');
  assert.equal(html('## What I found'), '<p class="hb-md-p hb-md-h"><strong>What I found</strong></p>');
  assert.equal(
    html('Three to look at:\n- **200 Chambers** sold\n- 5 Franklin\n\n1. First\n2. Second'),
    '<p class="hb-md-p">Three to look at:</p><ul class="hb-md-list"><li><strong>200 Chambers</strong> sold</li><li>5 Franklin</li></ul>'
      + '<ol class="hb-md-list"><li>First</li><li>Second</li></ol>',
  );
  assert.equal(html('line one\nline two'), '<p class="hb-md-p">line one<br/>line two</p>');
  assert.equal(html('a_snake_case_name stays'), '<p class="hb-md-p">a_snake_case_name stays</p>');
});

test('a script tag and raw HTML print as text', () => {
  const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)>');
  assert.ok(!out.includes('<script'), out);
  assert.ok(!out.includes('<img'), out);
  assert.ok(out.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), out);
});

test('a javascript: link and a userinfo link stay plain text', () => {
  assert.equal(html('[click](javascript:alert(1))'), '<p class="hb-md-p">[click](javascript:alert(1))</p>');
  assert.equal(html('[click](javascript:alert)'), '<p class="hb-md-p">[click](javascript:alert)</p>');
  assert.equal(html('[the listing](https://streeteasy.com@evil.example/x)'), '<p class="hb-md-p">[the listing](https://streeteasy.com@evil.example/x)</p>');
  assert.equal(html('see https://x:y@evil.example/a'), '<p class="hb-md-p">see https://x:y@evil.example/a</p>');
  assert.equal(safeUrl('https://x@evil.example'), null);
  assert.equal(safeUrl('data:text/html,hi'), null);
  assert.equal(safeUrl('HTTPS://streeteasy.com/x')?.href, 'https://streeteasy.com/x');
});

test('a good link opens in a new tab, rel noopener noreferrer nofollow; a labelled one shows its host', () => {
  assert.equal(
    html('[the listing](https://streeteasy.com/building/x)'),
    '<p class="hb-md-p"><a href="https://streeteasy.com/building/x" target="_blank" rel="noopener noreferrer nofollow" class="hb-md-link">the listing</a>'
      + '<span class="hb-md-host"> (streeteasy.com)</span></p>',
  );
  // A bare URL is its own label: no host beside it, and the full stop after it isn't part of it.
  assert.equal(
    html('See https://streeteasy.com/a.'),
    '<p class="hb-md-p">See <a href="https://streeteasy.com/a" target="_blank" rel="noopener noreferrer nofollow" class="hb-md-link">https://streeteasy.com/a</a>.</p>',
  );
});

test('half-streamed text keeps an unclosed marker as written', () => {
  assert.equal(html('It sold for **$4.2'), '<p class="hb-md-p">It sold for **$4.2</p>');
  assert.equal(html('It sold for **$4.2M*'), '<p class="hb-md-p">It sold for **$4.2M*</p>');
  assert.equal(html('a *note'), '<p class="hb-md-p">a *note</p>');
  assert.equal(html('`code'), '<p class="hb-md-p">`code</p>');
  assert.equal(html('[the listing](https://streeteasy.co'), '<p class="hb-md-p">[the listing](<a href="https://streeteasy.co/" target="_blank" rel="noopener noreferrer nofollow" class="hb-md-link">https://streeteasy.co</a></p>');
});
