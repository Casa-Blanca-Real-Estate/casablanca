# Dispatch 07 — Comp report: the walkthrough scaffold (CR-3a)

**Dispatched by:** Casanova · 2026-09-29 · **To:** Mason
**Builds from:** `docs/comp-report/01-design.md` (v0.4) §2, §3, §6 (the engine's inputs and outputs),
§6.4, §6.7, §8.3 rule 6, §9 and §10 (stubbed), §12, §16
**Depends on:** nothing that blocks. The open decisions that shape the flow (D-1, D-4, D-10, D-12) get
their recommended defaults, labelled on screen, so Kimani's answers change a label or a flag, not the
structure.
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` when done, and at any phase
boundary you choose. Never merge — Casanova or Kimani merges. Sign PRs, PR comments and commits
"— Mason (CR-3a)".**

## Why this exists

Kimani will design the comp report's screens himself (Claude Design), and he needs to walk the whole
flow first, end to end, on the real site. Today a report is a title and a chat. This dispatch
scaffolds **every step of §3**, rough and annotated, with one-click sample data at each step, so he can
go from an empty report to a copied client email.

**Function over form.** No visual design pass: plain, legible, and consistent with the comp report's
existing styles. The design comes from Kimani afterwards, and CR-3 proper builds it on this structure.

## What "scaffolded" means

- **Every step exists** as a panel you can reach, fill and leave, in §3's order. The agent moves freely
  between steps: it isn't a locked wizard, and every step can be skipped.
- **It's real where the pieces exist.** Abacus's engine (`tools-src/comp-report/engine/`, CR-2 and
  CR-2.1) parses the export and computes both results in the browser, so tiers and facts recompute
  instantly. The assistant is CR-1's turn endpoint.
- **It's stubbed where they don't, and says so on screen:**
  - the writer (CR-5)
  - QA (CR-5)
  - the client report and PDF (CR-6)
  - Jev tagging (D-12)
  - undo, redo and versions
- **It's annotated.** Each step has an "About this step" note, open the first time and collapsible after.
  It says:
  - what the step is for, and which design section it implements
  - what's real and what's stubbed
  - any pending decision that shapes it, by ID

  A step rail across the top shows where you are and which steps have something in them.
- **It has sample prefill** at every step, for admins (below).

## The steps (§3)

1. **The home (intake).**
   - **The subject:**
     - address and unit (the report title can seed it)
     - property type: condo; co-op shown as "later"
     - interior size, with a "this is my estimate" toggle (input confidence, §6.1)
     - beds, baths and floor
     - common charges and taxes
     - the four systems CR-2.1 added: central air, dishwasher, fireplace and laundry
     - private outdoor space: its kind, and its size if known
     - views
   - **The brief:** the question, the audience (buyer or seller), and a short client note.
   - **A target price:** captured, and **kept out of the assistant's context** (D-4 recommendation A).
   - **Deal terms:** the two templates in D-10's recommendation (buyer, traditional purchase; seller,
     pricing). Skippable.
2. **The export (import).**
   - Upload a StreetEasy CSV or XLSX, run it through `parseExport()`, and show the comps table.
   - Show the parser's warnings plainly: approximate sizes, public-record closings, missing fields.
   - "Fill with sample" loads Hannah's 100 Barclay #17L export.
3. **Sort the comps (first-pass review).**
   - Each comp is primary, secondary or excluded, with a reason. Reasons are append-only, so record one
     per tier change.
   - Each comp links out to its listing and can be marked reviewed.
   - **The range stays hidden in this step.**
4. **The call, then the reveal.**
   - **The call:** the agent's own low–high view, before the range shows. D-1 recommendation C; skippable,
     labelled "order being decided".
   - **The reveal:** both results side by side (§6.4):
     - base and range
     - the bridge, with its "considered — value not yet determined" lines
     - evidence by status: sold, in contract and active, never mixed
     - sale-to-last-ask
     - the gaps: what the engine still needs
     - the call against the range
   - **From here the range moves live** as tiers and facts change. That's the loop.
5. **Work it through.**
   - The existing chat, in a panel or drawer beside the numbers, reachable from every step.
   - Give it one read-only tool that returns a summary of the current engine output (base, range, tiers,
     gaps), so it can discuss the numbers. **Only if it's small**; otherwise leave it for CR-4 and say so
     on screen.
   - The target stays out of its context.
6. **Send it (stubbed).**
   - A draft client email built from the engine output with a fixed template, labelled **"Placeholder —
     the writer comes in CR-5"**, with Copy.
   - A QA panel listing the checks that will run: every number traceable, the words "appraisal" and
     "appraised value", and fair housing. The appraisal-word check is a regex, so implement it; list the
     rest as coming.
   - A "Client report (PDF)" placeholder: "Kimani designs the template (CR-6)".

## Sample prefill

- **Admins only** (`role === 'admin'`), since the tool isn't in agents' hands yet.
- **One "Fill with sample" per step**, plus one "Fill the whole report with sample data" at the top, so
  Kimani can jump to any step.
- **The sample is 100 Barclay #17L:** Hannah's export for step 2, and subject facts consistent with it
  for step 1. Where a real fact isn't known (17L's size), use a plausible value **marked as a sample**.
  Never leave one unmarked.
- **Label sample values "Sample" wherever they show.** Flag a report filled with sample data as a sample
  report, and badge it in the reports list. No sample value reaches anything client-facing without the
  label. This is Kimani's "no placeholder numbers in the live product" rule, carved out for sample data
  only.
- **Serve the sample export; don't bundle it.** The build output under `/tools/comp-report/` is public,
  so Hannah's export must not go in it. Serve it from a signed-in, admin-only endpoint (the function
  bundle can carry the CSV), with StreetEasy's `?sst=` share tokens stripped.

## Persistence

**A reload must not lose the walkthrough.**
- Use what CR-1's schema already has: reports, properties and observations, report comps, reasons.
- Add what's missing in a **new** migration. The existing ones are frozen.
- A JSON state column per report, for intake, the call and deal terms, is fine for a scaffold. If you'd
  do it differently for CR-3 proper, say so in the PR.
- The engine's output isn't stored yet (versions are CR-3 proper): recompute it on load.

## Not in scope

The visual design (Kimani's, afterwards); Jev and the Haiku fallback; versions, undo and redo; the
writer, real QA and the PDF; co-ops beyond the property-type field; the training gate. Leave hooks,
not features.

## Also

- **The white-screen report.** After creating a report, Kimani saw the page "go white after a flash".
  - **What I found:** I ran the create flow against the production bundle, with the real API handlers
    on a local PostgreSQL and a faked Identity. It renders a title, an empty chat and a composer, with
    no error. Most likely he saw that near-empty page.
  - **What I added:** an error boundary (`src/ErrorBoundary.tsx`), so a real crash now shows a message.
    **Keep it.**
  - If you can reproduce a real blank page on production, fix that first and explain it in the PR.
- **Replace my preview orientation** (`src/views/Preview.tsx`: the "Preview build" note on the reports
  list and the steps panel on an empty report) with the scaffold's own annotations.
- **The dashboard** now has a team-only "Comp report" card (`index.html`). Nothing for you to do there.
- **Still yours from CR-1:** step 6's sign-in proof with Kimani, then CR-1.1 item 3, cutting the
  refused-sign-up log to the domain.
- **Use design v0.4's terms** on screen: input confidence, evidence status, sale-to-last-ask.

## Definition of done

In production, signed in as an admin, Kimani can:
- create a report
- fill each step by hand, or with one click of sample data
- import Hannah's export, from the sample button or by uploading the CSV
- tier the comps with reasons
- give a call
- watch both results, the bridge and the gaps update live as he changes tiers and facts
- talk to the assistant from any step
- reach a placeholder email he can copy
- reload at any point without losing anything

Also:
- Every step is annotated.
- Non-admins see no sample buttons.
- The existing tools still work, and internal paths still 404, including uppercase variants.
- The PR is open against `claude/main`, and signed.

— Casanova
