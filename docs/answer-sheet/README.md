# The Casa Answer Sheet

**https://claude.ai/artifact/AMbuGGXf2FFfszUpZtARmA** — Kimani's one place to answer everything waiting on
him across the Casa tracks: open decisions, questions merged PRs left for him, team feedback to route, and
his to-dos. A clone of MindBinder's KJ Answer Sheet (same page and behavior), in Casa's palette. Made by
Casanova, 2026-10-14.

## How it works

- The questions live in the page itself, built from `questions.json` here. Kimani's answers save to the
  artifact's database, collection `answers`, one document per question id (`{choice, choiceLabel, note,
  updatedAt, …}`). Reading-list marks go to `reading`. Only the owner (admin level) can read or write.
- A question he leaves alone keeps its default. One with no default shows as **Needs you**.
- The ids are per topic: `CR` comp report, `PP` profile pics, `FB` team feedback, `AC` the account move
  (D-26), `TD` his to-dos, `QW` what comes back next. Decisions keep their `D-` numbers in
  `docs/decisions.md`; the sheet points at them.

## Casanova's loop, each block

1. **Read the answers:** `ArtifactData` `list` on collection `answers` (and `reading`) at the URL above.
2. **Record them:** fold each answer into `docs/decisions.md` (move answered decisions to **Resolved**, tick
   done to-dos), the dispatches and the ledger, as the answer asks.
3. **Refresh the sheet:** edit `questions.json`: drop what's recorded (or move it to the topic's `settled`
   list), add what's new, and list new ids in `newIds`. Add the update to the top of `changes` (newest first: `{date, label, items}`, one short bullet per change); the sheet shows it behind a "What's changed" button.
4. **Build and publish:**

   ```sh
   node docs/answer-sheet/build.mjs /tmp/…/casa-answers.html
   ```

   Then publish that file with the Artifact tool to the URL above (pass `url` from a new session; it reads
   first). Omit `capabilities` on a republish so the stored ones carry over.
5. **Clear stale answers:** after recording, delete their `answers` documents, so a re-asked question
   starts fresh.

## Moving it to the Casa Claude account (2026-10-21)

The sheet above lives in Kimani's personal account. Nothing needs carrying over but the page: on
2026-10-21 there were no saved answers or reading marks (both collections empty), so the questions in
`questions.json` are the whole state. In the Casa account, Casanova:

1. Builds it: `node docs/answer-sheet/build.mjs <scratchpad>/casa-answers.html`.
2. Publishes it as a **new** artifact (no `url`), icon `checklist`, with
   `capabilities: {"db": {"rules": [{"path": "", "read": "admin", "write": "admin"}]}, "user": {}}`
   so only the owner can read or write answers.
3. Replaces the URL at the top of this file and in `CLAUDE.md` with the new one (done 2026-10-21: the old sheet was `R57ZAZVbGDRP69o7gGG4Ry`). From then on the loop above
   runs against the new URL.
4. Kimani deletes the old sheet in his personal account once the new one opens (any answers made there in
   the meantime are read with `ArtifactData` and recorded first).

## Files

| File | What |
|---|---|
| `questions.json` | The content, by hand. HTML fields may use `{repo}/path` (a link to a file on `claude/main`) and `#123` (a PR link) |
| `build.mjs` | Expands it and splices it into the template; checks ids, prefixes and reading-list references |
| `template.html` | The page, with `__QDATA__` where the data goes |
| `design-pass.json` | The **Design pass** tab (2026-11-10): every page of the comp report and the Studio's new pages, each with what opens from it nested under it, marked `designed`, `light` or `not`. Kimani's ticks and notes save to the db, collection `design`, one doc per id (`{done, note, at}`); a page's tick counts everything under it as done. Edit by hand when a design round lands |
| `todo-groups.json` | The **To-do** tab (2026-11-10): every to-do under the job it belongs to ('Run the full flow with Noble', production checks, data, design, after Nov 13), in phases where it helps. An item is either `{q: "TD-…"}`, which moves that question card from the Questions tab (its answer still saves to `answers`; any topic's question can be grouped this way, e.g. CR-14), or a plain `{id, name, desc}` whose tick and note save to the db, collection `todo`. `done` on a plain item records that a thread saw it done. A new TD question not in a group shows under "Not grouped yet" until a thread files it; whoever adds a TD question to `questions.json` should add it to a group here |
