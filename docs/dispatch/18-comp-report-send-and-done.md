# Dispatch 18 — Comp report: Send and Done (CR-7b)

**Dispatched by:** Casanova · 2026-10-15 · **To:** Mason
**Builds from:** `docs/comp-report/feedback/2026-10-15-noble/04-send-and-done.md` (the code map for NW-078 to
NW-087), NW-101 in `00-items.md`, and the follow-ups at the end of `docs/dispatch/14-comp-report-design-port.md`.
**Depends on:** Dispatch 15 merged (Mason's queue order; no shared files).
**Protocol:** `docs/dispatch/README.md`. Restating rules 3–5: **open a PR to `claude/main` when done; never
merge; sign "— Mason (CR-7b)"** in the PR, its comments and your commits. Ledger line: `casa-r13-4`. With 20,
22 and 24, it supersedes `casa-r12-1` (the port's leftovers).

## The goal

Noble copied the Designed email into Gmail and it arrived left-aligned, in italic, with the address as a blue
link, and he found no way on to Done. Make what an agent pastes look like what they saw, make the subject a
first-class field, and make the way to Done plain. No layout change: the tabs, the strip and the buttons stay
where they are.

## In scope

1. **NW-078.** Delete the "Hubert drafts the headline and the email…" paragraph (`SendStep.tsx:146`). Write it
   stays alone in the strip (NW-087).
2. **NW-079 a.** Tab order Designed, Full, Short, Text. Designed is the default when a report has no stored
   format; a stored format still wins (`src/views/send/copy.ts`).
3. **NW-080 · centred as pasted.** Wrap the 600px table in an outer full-width table with `align="center"`,
   `margin:0 auto` on the inner one, and `text-align:left` on every inner cell (`designed.ts:229`). Today the
   centring lives only in the app's CSS.
4. **NW-081 · no italic.** No italic is in our HTML, so it arises on paste or receipt. Fix both suspects: an
   email-safe font stack without Object Sans (`designed.ts:203`), and a cell style with `font-style:normal`,
   `font-weight:normal` and an explicit colour on every cell; bold instead of 800.
5. **NW-082 · no blue address.** Wrap the title, the home's sub line and URL-less comp names in an anchor with
   an inline dark colour and no underline, pointing at the StreetEasy page when known, so Gmail doesn't
   autolink them.
6. **NW-083 a · the subject.** Subject above Headline on Full, and shown on Short and Designed, with a Copy
   subject button (today the subject is never copied). Store it as `send.subject`, so editing it no longer
   freezes the body into a draft; leave it out of the draft fingerprint; fall back to `draft.subject` for old
   drafts.
7. **NW-083 b.** Label the headline field as also the email's first line (it syncs into the body by design).
8. **NW-084 a · formatting that survives an edit.** One renderer turns the plain text of Full and Short into
   the copied HTML (reuse `parseEmailText`): bold headline, status headings, bullets, inline fonts, comp names
   with a link labelled "StreetEasy" instead of a raw URL. It replaces `htmlFromText` (`workspace/email.ts:225`)
   and the template's separate html. Plain text, QA and the Text tab are unchanged. Say in the PR that
   D-27's "Full and Short are plain text" line now reads: the edit model stays plain text, and the copy is
   formatted. Casanova updates `docs/decisions.md`.
9. **NW-086 a, NW-101 a · the way on to Done.** After a copy, say "Copied. Sent it? Mark it as sent." and make
   Mark as sent the primary button, **on the right of Copy** in the same row. It is its own button, separate
   from Copy: copying never marks the report sent, and Mark as sent is the forward step. Allow Mark as sent
   without a copy (the recommendation for NW-086 a: a hand copy never sets `copiedAt`); the copy log still
   records only real copies. On a read-only report, say why the button isn't there.
10. **From Dispatch 14's follow-ups:**
    - keep one edited draft per length (Full and Short each), not one at a time;
    - Mark as sent records the tab last copied, not the tab that's open.

## Not in scope (Claude Design, phase B)

How an agent edits what they see in Designed (NW-079 b); how Full and Short look while editing (NW-084 b: a
rich editor would break the offset-based issue marks); where an example email lives (NW-085 b); Done's place in
the progress row and Mark as sent stacked or set apart, with the way on to Done greyed until it is marked
sent (NW-086 b, NW-101 b; Done isn't a control in the progress row today, so greying it is that layout call).
Also not here: the writer drafting subject options (NW-083 c, the writer's track after Dispatch 24; it is in
the plan's Phase C) and the example email itself (NW-085 a, Kimani's call).

## Data and constraints

- No migration. `send.subject` and the per-length drafts go in the workspace state (64 KB cap, full-replace
  PATCH; check the server's shape validation).
- `workspace/qa.ts` changes are additive; its tests still pass. Copy stays blocked on a hard compliance
  failure, and waits for a headline (D-21).
- Gmail strips `background-image`, so the photo blocks arrive flat grey until photos exist. Expected.

## Definition of done

- The copied HTML of Designed, Full and Short renders centred, upright, with a dark title and labelled links
  in a browser with no app CSS. Screenshots in the PR. A session can't paste into Gmail, so the PR gives
  Kimani a two-minute check: copy each, paste into Gmail and Apple Mail, send to himself.
- Edit Full, copy it: the copy keeps its headings and labelled links.
- An agent who copies by hand can still mark the report sent and reach Done.
- Every suite passes with nothing skipped: `test:engine`, `test:comp-report` on a local Postgres
  (`npm run db:local`), `test`, `test:dev-notebook`, `test:feedback`, `test:agent-pics`; and `typecheck`,
  `typecheck:engine`, `build`. `designed.test.ts` asserts the wrapper, the cell style and the anchors.
- A Playwright walk of Send and Done at 1440px, in buyer and seller.

— Casanova
