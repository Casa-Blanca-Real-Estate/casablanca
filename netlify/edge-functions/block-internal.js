// Refuses internal files however the path is cased or encoded.
//
// netlify.toml publishes the repo root (publish = "."). Netlify serves static
// files case-insensitively, but its redirect rules match case-sensitively — so
// the forced-404 rules in netlify.toml stop /docs/x and not /DOCS/x. Edge
// functions run before static files and redirects: this one decodes and
// lowercases the path, and refuses anything internal. The netlify.toml rules
// stay as a second layer.
//
// Keep INTERNAL in step with CLAUDE.md's rule on internal-only paths.

const PREFIXES = ['/docs/', '/netlify/', '/.github/', '/agents/data/', '/tools-src/'];

const FILES = new Set([
  '/claude.md', '/package.json', '/package-lock.json', '/netlify.toml',
  '/.gitignore', '/_redirects', '/_headers',
  '/vite.config.ts', '/vite.config.js', '/vitest.config.ts',
  '/agents/build.js', '/agents/site.json', '/agents/template.html',
  '/agents/directory.template.html',
]);

// Markdown is never a public page on this site; specs and tests are never public.
const PATTERNS = [/\.md$/, /\.(spec|test)\.[cm]?[jt]sx?$/, /^\/tsconfig[^/]*\.json$/];

export function isInternal(pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return true; // malformed percent-encoding: refuse rather than guess
  }
  p = p.toLowerCase().replace(/\/{2,}/g, '/');
  if (PREFIXES.some((x) => p === x.slice(0, -1) || p.startsWith(x))) return true;
  if (FILES.has(p)) return true;
  return PATTERNS.some((re) => re.test(p));
}

const BODY = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex">
<title>Not found — Casa Blanca</title><style>
html,body{margin:0;height:100%;background:#f4f3f0;color:#0f0f0f;font-family:'Helvetica Neue',Arial,sans-serif}
main{min-height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 24px;max-width:640px;margin:0 auto}
.l{font-size:10px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#888680}
h1{font-weight:800;font-size:clamp(40px,8vw,80px);line-height:.92;letter-spacing:-.05em;text-transform:uppercase;margin:.3em 0 .4em}
a{color:#0f0f0f;font-size:13px;text-decoration:none;border-bottom:1px solid #aaa3cf}
</style></head><body><main><div class="l">404</div><h1>Nothing<br>here.</h1>
<a href="/">Back to the Studio</a></main></body></html>`;

export default async (request, context) => {
  const { pathname } = new URL(request.url);
  if (!isInternal(pathname)) return context.next();
  return new Response(BODY, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex',
      'cache-control': 'no-store',
    },
  });
};

export const config = { path: '/*' };
