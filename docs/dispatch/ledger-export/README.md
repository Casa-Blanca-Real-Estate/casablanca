# The Dispatch Ledger, Casa Blanca's side (export, 2026-10-21)

The shared ledger (https://claude.ai/artifact/MeqkECtyVRXJxqjKBw1yuq) lives in Kimani's personal Claude account and holds MindBinder's
lines too. This folder is everything needed to stand up a Casa-only ledger in the Casa Blanca Claude account.

| Path | What |
|---|---|
| `ledger.html` | The ledger page, Casa-only: no project tabs, "Casanova" and "Kimani" in place of Big Kahuna and KJ. Same data shape, so every `casa-r…` id and rule 11 in `docs/dispatch/README.md` work unchanged |
| `data/dispatches/` | All 41 Casa lines (`casa-r1-1` … `casa-r13-10`), exactly as exported |
| `data/rounds/` | The 13 Casa round notes (`casa-r1` … `casa-r13`) |
| `data/tracks/` | The Casa roster for the page's "Who does what" (new; the shared ledger only had MindBinder's) |
| `make-batches.mjs` | Prints the `ArtifactData` batch writes that seed the new ledger (64 documents, two batches) |

Notes are empty on the Casa side, so none are exported. Lines Kimani marks on the old ledger after 2026-10-21
aren't in this export: re-export them (or mark them again) after the switch.

## Standing it up (Casanova, in the Casa account)

1. Publish `ledger.html` as a new artifact, with `capabilities: {"db": {}, "user": {}}` and icon `list`.
2. `node docs/dispatch/ledger-export/make-batches.mjs`, then run each printed batch with `ArtifactData`
   `batch` on the new artifact's URL.
3. Open it: the Open view shows round 13 (15–17 queued, the rest held); Landed shows 22 lines.
4. Point everything at the new URL: `CLAUDE.md`, `docs/dispatch/README.md` (rule 11 and the ledger link),
   `docs/dispatch/casanova.md`. The `#casa` hash isn't needed any more.
5. On the old shared ledger, drop nothing until the new one is confirmed. Then Kimani's personal-account
   Casanova (or Kimani) marks the Casa lines there `dropped` with a note pointing at the new ledger, or
   deletes them — MindBinder's lines stay untouched either way.

The page links PRs to `github.com/kjcamron/casablanca`. GitHub redirects after the repo transfer; to point it
at the new org directly, change `repo` in `PROJECTS` near the top of the script.
