# Dispatch 26 — Comp report: the Designed email is the report, with photos (CR-8b)

**Dispatched by:** the bosses' demo debrief thread, for Kimani · 2026-10-22 · **To:** a build thread in
Mason's lane
**Builds from:** `docs/comp-report/feedback/2026-10-22-bosses-demo/notes.md`, **its last section (Kimani's
decisions) first**; `src/views/send/designed.ts` and `SendStep.tsx` (today's Designed tab, rendered from the
Full draft); `engine/parser/photos.ts` (photos kept from the listing read, linked, never copied);
`docs/decisions.md` D-28 (NB-3 B: email photos copied into Blobs at copy time, served from a public,
unguessable route).
**Depends on:** Dispatch 25 merged (the approved per-comp paragraph each box shows), and the live listing read
working (photos come from it). Items 1 and 5 don't wait on 25 and can open as their own PR first.
**Protocol:** `docs/dispatch/README.md`. **Open a PR to `claude/main` when done; never merge.**

## The goal

Erez: "I want every agent who completes this to send this to the client, branded, with the listings and a
little story in it." The Designed email becomes what Send leads with and what the agent sends: an overview on
top, then one box per comp with its photo and its paragraph. It stays a pasted email (Kimani: a hosted page or
PDF link come later). The Text stays as the follow-up message after it, and Full and Short stay as fallbacks
for an agent whose mail mangles the HTML.

## In scope

1. **Send leads with Designed.** Designed is the first tab and the primary Copy. Text sits beside it as "Then
   text them", the next thing to send. Full and Short move under a "Plain-text fallback" disclosure with one
   line on when to use them. Mark as sent records which one was copied, as today. QA keeps reading the Full
   plain text: it stays the source of truth underneath.
2. **One box per comp.** In `designedHtml`: each comp in its own box with a thin border, the address large and
   bold on top (linked), the photo, then price, $/sq ft (where the type shows one) and the status line, then
   the comp's approved paragraph from Dispatch 25 (or nothing). Same size for every box, one after another,
   the anchor first and marked. Built in tables and inline styles, as now, so Gmail keeps it.
3. **Photos, for real.** At copy time, the server copies each shown comp's hero photo (the first kept URL)
   into Blobs and returns a public, unguessable URL per photo (NB-3 B); the HTML uses those. The route is
   public by design, so it goes under `/api/comp-report/`, never under a blocked path, with a long random key
   and no listing in the URL. A comp without a photo keeps today's neutral block. Casa keeps the copies, for
   reference. The home's own photo fills the header block when it has one.
4. **An overview at the top** (Hannah): under the range, two or three short lines on what the comps show,
   from the writer's headline and chosen lines as today. The price-per-square-foot table leaves the Designed
   email (Erez: the figures belong per unit, which item 2 does). It stays in Full and on Findings.
5. **"Budget" for the buyer.** The buyer's target label reads "Client's budget" (`targetLabel` in
   `src/views/newcomp/Home.tsx`, and wherever Findings names it). The seller's stays "Client's target price".
   Dispatch 21's owner labels build on this: tell 21's thread in the PR.
6. **The sample.** The 100 Barclay sample's photos (#88) reach its Designed email the same way, so a demo
   shows a finished email end to end.

## Not in scope

The Gmail draft button (NW-102, phase B: it needs Casa's Google client, NB-28). A hosted page or PDF.
Claude Design's restyle of the email. The per-comp step itself (Dispatch 25).

## Definition of done

- On the sample and on a live report, condo and co-op: Designed is first, its boxes show real photos from the
  Blobs route, the overview reads, there is no price table in it, and a comp without a paragraph or photo
  still lays out cleanly.
- Pasted into Gmail (web) and Apple Mail: the boxes, photos and links survive. Screenshots in the PR. This is
  Kimani's two-minute check after deploy, as Dispatch 18's was.
- A test that a photo URL off `PHOTO_HOSTS` is never copied, and that the route serves only a key it issued.
- Every suite and typecheck passes with nothing skipped.
