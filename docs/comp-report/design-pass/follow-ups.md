# Design pass: follow-ups to schedule

Things Kimani flagged on the design canvas (https://claude.ai/artifact/1zFam3mkm1orxhCrLmhx8W) that aren't part of
one screen's build. Each needs its own pass or decision, later.

1. **A repeated-component audit, across the Studio** (Kimani, 2026-11-06). Find every component that is hand-built
   more than once instead of being one repeating pattern (a shared component, a shared function or template, a
   loop over data), so that changing it means changing one thing. Start with the comp report
   (`tools-src/comp-report/src/views/`, and the email in `send/designed.ts`, where `compBox` already does this for the
   comp boxes), then the single-file tools. Where two copies differ on purpose, keep the difference as an option of
   the one pattern, not a second copy. Report what was found before changing anything.
2. **Helvetica and Object Sans, mixed** (Kimani, 2026-11-06: to work out over time, not one decision). Object Sans
   Heavy is a strong display face but dense for reading; the repo has only Regular and Heavy. Try Helvetica for body
   text, small labels and dense tables in the tool, with Object Sans kept for headers and the big display moments.
   The email already uses Helvetica (clients don't load web fonts).
3. **Real sample photos on the canvas.** The overlays (hero, closest match, also sold nearby) are judged on striped
   placeholders. Put the 17L sample's real photos (Casa's stored copies) on the canvas before the email's design is
   called final, to check the gradients against real images.
4. **Blocked images in the email.** When a recipient's client blocks images until they allow them (Outlook does by
   default; Gmail and Apple Mail load them), each photo cell shows its ink `bgcolor` and the white text stays legible:
   the canvas's Photos off tweak shows that state. The pasted email has no plain-text alternative, so the plain email
   isn't sent automatically in its place; it stays something the agent can choose to send. Worth checking in Outlook
   before 11-13.
