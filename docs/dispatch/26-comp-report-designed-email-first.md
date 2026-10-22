# Dispatch 26 — Comp report: the Designed email is the report, with photos (CR-8b)

**Dispatched by:** the bosses' demo debrief thread, for Kimani · 2026-10-22 · **To:** a build thread in
Mason's lane
**Builds from:** `docs/comp-report/feedback/2026-10-22-bosses-demo/notes.md`, **its last section (Kimani's
decisions) first**; `src/views/send/designed.ts` and `SendStep.tsx` (today's Designed tab, rendered from the
Full draft); `engine/parser/photos.ts` (photos kept from the listing read, linked, never copied);
`docs/decisions.md` D-28 (NB-3 B: email photos copied into Blobs at copy time, served from a public,
unguessable route).
**Depends on:** Dispatch 25 merged (item 2 draws on its per-comp reasoning), and the live listing read working
(photos come from it). Items 1 and 6 don't wait on 25 and can open as their own PR first.
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` when done; never merge.**

## The goal

Erez: "I want every agent who completes this to send this to the client, branded, with the listings and a
little story in it." The Designed email becomes what Send leads with and what the agent sends: an overview on
top, then one box per comp with its photo and a paragraph written for the client. It stays a pasted email (Kimani: a hosted page or
PDF link come later). The Text stays as the follow-up message after it, and Full and Short stay as fallbacks
for an agent whose mail mangles the HTML.

## In scope

1. **Send leads with Designed.** Designed is the first tab and the primary Copy. Text sits beside it as "Then
   text them", the next thing to send. Full and Short move under a "Plain-text fallback" disclosure with one
   line on when to use them. Mark as sent records which one was copied, as today. QA keeps reading the Full
   plain text: it stays the source of truth underneath.
2. **Write it for the client: a separate step on Send** (Kimani: the client's words come from the whole
   process and are written for the client, not lifted from Sort). Before the email is shown, a short flow:
   the overview first, then one step per comp the email shows (`countedComps`, `workspace/email.ts`), each
   with the agent's Sort reasoning and Hubert's take from Dispatch 25 beside the box. The human drives, as on
   Sort:
   - **Practice agents** write the overview and each comp's paragraph, ask for feedback (what's unclear,
     unsupported or off-voice, through `fair-housing.ts` too), and may see the writer's version only after
     one round. They keep theirs, revise it, or take his.
   - **Full agents** get the writer's draft (the existing writer, `server/writer.ts`, which already writes a
     headline, the chosen lines and per-comp lines) and edit or approve it. They can type feedback and
     redraft.
   - The overview is today's "Your lines" (#89: lines first, Draft from notes, Tidy), moved into this flow. A
     comp's paragraph is stored as `clientLine?: { text: string; by: 'agent' | 'writer' | 'both'; at: string }`
     on `CompJudgment`. In `workspace/email.ts` it wins over the writer's per-comp lines and the Sort note, for
     every length. Without one, today's behaviour holds. The feedback call follows `server/lines.ts`, refuses
     a practice agent's reveal before a feedback round (a server test), and keeps the target out of the words
     unless D-4's reveal has happened.
3. **One box per comp.** In `designedHtml`: each comp in its own box with a thin border, the address large and
   bold on top (linked), the photo, then price, $/sq ft (where the type shows one) and the status line, then
   the comp's client paragraph from item 2 (or nothing). Every box is the same size, one after another, with
   the anchor first and marked. Built in tables and inline styles, as now, so Gmail keeps it.
4. **Photos, for real.** At copy time, the server copies each shown comp's hero photo (the first kept URL)
   into Blobs and returns a public, unguessable URL per photo (NB-3 B); the HTML uses those. The route is
   public by design, so it goes under `/api/comp-report/`, never under a blocked path, with a long random key
   and no listing in the URL. A comp without a photo keeps today's neutral block. Casa keeps the copies, for
   reference. The home's own photo fills the header block when it has one.
5. **The overview sits on top and the price table goes** (Hannah, Erez): item 2's overview under the range. The
   price-per-square-foot table leaves the Designed email (Erez: the figures belong per unit, which item 3
   does). It stays in Full and on Findings.
6. **"Budget" for the buyer.** The buyer's target label reads "Client's budget" (`targetLabel` in
   `src/views/newcomp/Home.tsx`, and wherever Findings names it). The seller's stays "Client's target price".
   Dispatch 21's owner labels build on this: tell 21's thread in the PR.
7. **The sample.** The 100 Barclay sample's photos (#88) reach its Designed email the same way, and the sample fill
   writes an overview and a client paragraph per sample comp, so a demo shows a finished email end to end.

## Not in scope

The Gmail draft button (NW-102, phase B: it needs Casa's Google client, NB-28). A hosted page or PDF.
Claude Design's restyle of the email. The per-comp reasoning on Sort (Dispatch 25).

## Definition of done

- On the sample and on a live report, practice and full, condo and co-op: the client step walks the overview
  and every shown comp, the practice reveal waits for feedback, Designed is first, its boxes show real photos from the
  Blobs route, the overview reads, there is no price table in it, and a comp without a paragraph or photo
  still lays out cleanly.
- Pasted into Gmail (web) and Apple Mail: the boxes, photos and links survive. Screenshots in the PR. This is
  Kimani's two-minute check after deploy, as Dispatch 18's was.
- A test that a photo URL off `PHOTO_HOSTS` is never copied, and that the route serves only a key it issued.
- Every suite and typecheck passes with nothing skipped.
