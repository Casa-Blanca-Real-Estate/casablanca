# Agent headshot library

Drop individual agent headshot image files into this folder (GitHub → Add file →
Upload files works one-or-many at a time, no local clone needed).

**Naming:** `firstname-lastname.jpg` (lowercase, hyphens). Examples:
`ashley-epstein.jpg`, `sam-valk.jpg`. PNG/JPG/WebP all fine.

Two sets are coming:
- `accent/`  — the existing accent-color background headshots (closed + for-sale per-listing use the name as text, end slide uses these)
- `taupe/`   — the taupe-background set (editorial / for-sale end slide)

For now just drop files at the top level or under `accent/` — I'll generate the
`agents.json` manifest and wire the tools to read it (works on GitHub Pages, no backend).
