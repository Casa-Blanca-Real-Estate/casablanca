# Agent headshot library

Static, in-repo agent library — read by the Closed and For Sale carousel builders'
"Agent Library" / search (and matched automatically on bulk-create by agent name).
Works on GitHub Pages with no backend.

## Layout
- `accent/` — accent-background headshots (the set used on deal slides). **In use.**
- `taupe/`  — taupe-background headshots (for editorial / end slides). *Empty for now.*
- `agents.json` — generated manifest: `[{ "name": "Frankie D.", "file": "accent/frankie-d.jpg" }, …]`

## Naming convention
`firstname-lastinitial.ext` (lowercase, hyphens), e.g. `frankie-d.jpg`, `julius-b.png`.
Display name is "First L." (period added for single-letter last initials).

## Adding / changing agents
Drop a file into `accent/` (or `taupe/`) following the convention, then regenerate
`agents.json` (ask Claude, or run the rename/manifest step). The tools read the
manifest on load, so new agents appear in search + bulk auto-match.

> Note: one duplicate was detected on import — two "Brittany F." photos, kept as
> `brittany-f.jpg` and `brittany-f-2.jpg`. Delete one if it's redundant and
> regenerate the manifest.
