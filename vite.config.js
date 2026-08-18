import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/* ─────────────────────────────────────────────────────────────────────────────
   Casa Blanca Creative Studio — build for the React tools ONLY.

   The studio is a static site: `publish = "."` in netlify.toml serves the repo
   as-is, and every hand-written tool under tools/ ships exactly as committed.
   This config does NOT touch any of them.

   Source for React tools lives in tools-src/<name>/. Vite compiles only what's
   listed in `pages` and writes each one to tools/<name>/, so a React tool is
   served from the same kind of URL as a hand-written one and can reach the
   shared /assets, /css and /.netlify/functions by absolute path exactly as its
   neighbours do. Build output is gitignored; Netlify runs the build on deploy.

   Add a React tool:  tools-src/<name>/{index.html,main.jsx} + a line in `pages`.
   Add a plain tool:   keep doing what we already do, and ignore this file.
   ───────────────────────────────────────────────────────────────────────────── */

const pages = ['react-demo'];

export default defineConfig({
  // Rooting at tools-src is what makes the output land at tools/<name>/ rather
  // than tools/tools-src/<name>/ — Rollup mirrors each input's path relative to
  // root, so the source folder name becomes the published folder name.
  root: resolve(here, 'tools-src'),

  // Output lands in tools/, so the hashed bundles are served from /tools/… .
  // Without this, Vite would emit /react-demo/app-<hash>.js and 404.
  base: '/tools/',

  // Shared brand assets are referenced by absolute site path (/assets/…), which
  // is what they resolve to in production anyway. Nothing to copy, and Vite has
  // no public/ directory to invent.
  publicDir: false,

  plugins: [react()],

  build: {
    outDir: resolve(here, 'tools'),
    emptyOutDir: false,            // tools/ holds the hand-written tools — never wipe it
    rollupOptions: {
      input: Object.fromEntries(
        pages.map(name => [name, resolve(here, 'tools-src', name, 'index.html')])
      ),
      output: {
        entryFileNames: '[name]/app-[hash].js',
        chunkFileNames: '_shared/[name]-[hash].js',
        assetFileNames: '_shared/[name]-[hash][extname]',
      },
    },
  },
});
