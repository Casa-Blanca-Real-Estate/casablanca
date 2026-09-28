import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devApi } from './dev/api-plugin.ts';

/* ─────────────────────────────────────────────────────────────────────────────
   Comp report tool — the Vite build.

   Follows the wiring proven on claude/motion-graphic-stories-hlpirk
   (docs/react-in-the-studio.md on that branch): source in tools-src/, output in
   tools/, served from the same kind of URL as every hand-written tool, reaching
   the shared /assets and /.netlify/functions by absolute path.

   One difference from the spike: the spike roots Vite at tools-src/ so several
   React tools can share chunks in tools/_shared/. There is one React tool, so
   this roots at the tool itself and keeps every built file inside
   tools/comp-report/ — one gitignored folder, nothing else in tools/ touched.

   The hand-written tools in tools/ are never read or written by this build.
   ───────────────────────────────────────────────────────────────────────────── */

const here = dirname(fileURLToPath(import.meta.url)); // tools-src/comp-report
const repo = resolve(here, '../..');
const outDir = resolve(repo, 'tools', 'comp-report');

// emptyOutDir wipes outDir before each build. That is only safe while outDir is
// exactly tools/comp-report — pointed at tools/ it would delete every tool.
if (relative(repo, outDir).split(sep).join('/') !== 'tools/comp-report') {
  throw new Error(`comp-report build: refusing to empty ${outDir}`);
}

// Dev only: the page references the studio's shared files by absolute path
// (/assets/studio-header.js, /assets/fonts/…), exactly as they resolve in
// production. Serve those from the repo so `npm run dev:comp-report` matches.
const SHARED = ['/assets/', '/css/', '/js/'];
const TYPES: Record<string, string> = {
  '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.otf': 'font/otf', '.json': 'application/json',
};
function studioShared(): Plugin {
  return {
    name: 'cb-studio-shared',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0] ?? '';
        if (!SHARED.some((p) => path.startsWith(p))) return next();
        const file = resolve(repo, '.' + decodeURIComponent(path));
        if (!file.startsWith(repo + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

// /tools/comp-report/build.json — which commit is live and what built it.
// Netlify's deploy logs need a Netlify login; this answers "is my change
// deployed, and on what Node?" with a curl. Nothing secret goes in it.
function buildInfo(): Plugin {
  return {
    name: 'cb-build-info',
    apply: 'build',
    generateBundle() {
      const info = {
        commit: process.env.COMMIT_REF || null,
        branch: process.env.BRANCH || null,
        context: process.env.CONTEXT || 'local',
        node: process.version,
        builtAt: new Date().toISOString(),
      };
      this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify(info, null, 2) + '\n' });
    },
  };
}

export default defineConfig({
  root: here,
  // Built files are served from /tools/comp-report/…; without this Vite would
  // emit /assets/index-<hash>.js and collide with the studio's own /assets.
  base: '/tools/comp-report/',
  // No public/ directory: shared brand files are referenced by absolute path.
  publicDir: false,
  plugins: [react(), studioShared(), devApi(), buildInfo()],
  build: {
    outDir,
    emptyOutDir: true,
    // No source maps in the published output — publish = "." serves them too.
    sourcemap: false,
    rollupOptions: {
      input: resolve(here, 'index.html'),
    },
  },
});
