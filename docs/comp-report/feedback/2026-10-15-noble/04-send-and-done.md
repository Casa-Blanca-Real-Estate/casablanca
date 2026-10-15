# Send and Done

**In short**
- Most of this ships now and changes no layout: the Designed email's markup (centred, explicit fonts, links that stay dark), Designed first, the subject as its own field with a Copy button, a formatted copy for Full and Short, and a clearer way on to Done.
- Done is not broken for an owner who copies with the button. The code path works. It looks broken because "Mark as sent" is a quiet second button that stays greyed unless the Copy button was used, and it is hidden on a read-only report. I can't see the italic from the code: it isn't in our HTML, and the fix hardens against both likely causes.
- Goes to Claude Design: how you edit from Designed, how Full and Short look on screen, where an example email lives, and whether Done is visible in the progress row. Two calls come first: which example email, and whether "Mark as sent" needs a copy.

| Id | Who | What | Class | Track | Phase |
|---|---|---|---|---|---|
| NW-078 | Kimani | Remove the "Hubert drafts the headline and the email…" line | FIX | Mason | A-now |
| NW-079 a | Both | Tab order Designed, Full, Short, Text; Designed is the default | BUILD | Mason | A-now |
| NW-079 b | Both | Designed has no fields: how an agent edits from it | DESIGN | Claude Design | B-after-design |
| NW-080 | Both | Designed pastes into Gmail left-aligned: centre it as pasted | FIX | Mason | A-now |
| NW-081 | Kimani | Designed arrives all italic: find out why, and stop it | FIX | Mason | A-now |
| NW-082 | Kimani | Address title arrives as a blue hyperlink | FIX | Mason | A-now |
| NW-083 a | Both | Subject first, its own field, shown on Designed too, with a Copy subject button | BUILD | Mason | A-now |
| NW-083 b | Both | Say that the headline is also the email's first line | FIX | Mason | A-now |
| NW-083 c | Both | Hubert drafts subject lines beside the headline drafts | BUILD | Mason (writer) | A-now, after 083 a |
| NW-084 a | Kimani | Formatted copy for Full and Short: bold headings, "StreetEasy" links, fonts | BUILD | Mason | A-now |
| NW-084 b | Kimani | How Full and Short look on screen (preview, labels instead of raw URLs) | DESIGN | Claude Design | B-after-design |
| NW-085 a | Kimani | An example of a good email: which one, who writes it | DECIDE | Kimani | A-now |
| NW-085 b | Kimani | Where the example lives, on Send and on other screens | DESIGN | Claude Design | B-after-design |
| NW-086 a | Kimani | No way on to Done after copying: make "Mark as sent" findable | FIX | Mason | A-now |
| NW-086 b | Kimani | Done in the progress row, so it can be seen and reached | DESIGN | Claude Design | B-after-design |
| NW-087 | Kimani | Keep Write it where it is | NOOP | Mason | A-now |

## NW-078 · the line above Write it

True today: `SendStep.tsx:146`, in the `.se-writer` strip, a `<p>` beside the button (`send.css:62`). It shows until Hubert has written once. No test quotes it. Delete the `<p>`. The strip then holds only the Write it button, pushed to the right by `flex: 1` on the empty gap. That is fine to ship; Design can re-seat it.

## NW-079 · Designed first

True today: `FORMATS` in `src/views/send/copy.ts:9` is Full, Designed, Short, Text, and `formatOf` (`copy.ts:21`) falls back to `'full'`. **a.** Reorder the array, and make the fallback `'designed'` when a report has no stored `format` (a stored one still wins, so nobody's open report jumps tabs). Designed reads the Full draft, so the writer and QA need no change. Done also calls `formatOf`, so its "Sent as…" line stays right.

**b.** The catch: Designed has no fields at all (`DesignedBody`, `SendStep.tsx:309`). An agent who lands on it sees the bold placeholder "[Your headline: one sentence…]" and can only fix it by clicking Show on issue 1, which flips to Full. That works today (`show()`, `SendStep.tsx:62`) but is a roundabout first minute. How an agent edits what they're looking at (edit in place, or a side form, or Full beside it) is Design's. Ship a. now; the Show route covers it until then.

## NW-080, 081, 082 · the Designed email in Gmail

Where it lives: `designedHtml()` in `src/views/send/designed.ts:225`, called by `designed()` in `useSendEmail.ts:176`. The Copy button writes it as `text/html` with the Full text as `text/plain` (`useSendEmail.ts:276-285`). The preview on Send is the same string in `.se-designed-card` (`send.css:139`), which is why the preview looks right: the app's own `.se-stage` centres it (`send.css:139`) and supplies the page font. **The pasted HTML has none of that.**

**NW-080, left-aligned.** The root is one `<table width="600" style="width:100%;max-width:600px">` with no `align`, no `margin:auto` and no wrapper (`designed.ts:229`). Gmail's compose box pastes a table at the left. The centring only ever existed in our page's CSS.

**NW-081, italic.** There is no italic, `font-style` or `<em>` anywhere in `designed.ts`, and the preview isn't italic. So it arises on paste or on receipt. Two candidates:
1. The font stack starts with `'Object Sans'` (`designed.ts:203`), and the weight is 800. No webfont ever loads in Gmail, so that name only matters on a machine with Object Sans installed. Kimani's may well have it, and a heavy request can resolve to a slanted cut of the family.
2. Gmail's compose box pastes elements with no explicit style into whatever formatting is active at the cursor. If the cursor sat in italic text (a quoted block, a signature), the whole paste inherits it. Our cells set no `font-style`.

I can't tell which from here. The fix covers both, so it doesn't matter.

**NW-082, blue title.** In our HTML the title is plain text in a `<div>` (`designed.ts:237`); it is not a link. Blue and underlined means Gmail (or the client reading it) recognised "100 Barclay Street #17L" as an address and linked it. Comp names that have a StreetEasy URL are `<a>` with an inline dark colour (`designed.ts:217`) and survive; **comp names with no URL are plain spans** (`designed.ts:218`), so they are exposed to the same thing, as is the "3 bd · 3 ba" line.

**The email-safe fix**, all in `designed.ts`, same look:

1. **Centred wrapper.** An outer `<table role="presentation" width="100%" align="center">` with one `<td align="center">` holding the 600px table: `width="600" align="center"`, `style="width:600px;max-width:100%;margin:0 auto"`. No background on the outer table. Because `align=center` cascades to text, every inner `<td>` gets `text-align:left` explicitly.
2. **One style string on every cell** (a `CELL` constant beside `FONT`): `font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-style:normal; font-weight:normal; color:#0f0f0f; text-align:left`. Drop `'Object Sans'` from the stack. It never loads in a mail client and is the likely italic trigger. The wordmark is already an image, so the brand stays in the header.
3. **Weights.** Use `bold` where it says `800`. Helvetica and Arial have no 800, and some clients render an unknown weight as regular.
4. **Links.** Every `<a>` carries its own `color:#0f0f0f;text-decoration:none` (Gmail overrides inherited link colour). Wrap the title, the home's sub line and URL-less comp names in an `<a>` too, pointing at the home's or comp's StreetEasy page when there is one. That also stops the autolinker, and the title becomes a useful link. Where there's no URL, leave it as text and test; there is no reliable Gmail-wide switch for address detection.
5. **Dark mode and fills.** Keep `bgcolor` beside every `background:` (already done). The hatch `background-image` gradients are stripped by Gmail, so the photo blocks arrive flat grey. That is expected until photos exist, but it means the first Designed email an agent sends has a big grey slab. Worth Kimani knowing.
6. Add checks to `designed.test.ts`: outer table is centred, no `font-style:italic`, every `<a>` has an inline colour.

Cannot be verified in this session. Kimani sends the result once to a Gmail address and once to an Apple Mail address, from compose, and looks.

## NW-083 · the subject

**Is there a subject today? Yes, but it's weak.**
- `buildEmail` makes `"<home>: what the comps say"`, with `[SAMPLE] ` in front on sample data (`workspace/email.ts:220`).
- It is an input only on Full and Short, under the headline and above the body (`Subject`, `SendStep.tsx:213`, rendered from `PlainBody` at `:265`). Designed and Text don't show it.
- **It is never copied.** `copy()` puts only the body on the clipboard (`useSendEmail.ts:268-285`). The agent has to select the field by hand. The designed email's CTA mailto uses it (`designed.ts:295`).
- **Editing it freezes the body.** `edit({subject})` (`useSendEmail.ts:205`) saves a whole `send.draft`, so changing one word of the subject marks the body "edited by you" and stops it picking up new numbers or a Redraft until "Back to the template".
- The writer drafts headlines and sections only (`WrittenSections`, `email.ts:55`). Nothing drafts a subject.

**Why the headline "appears in the body".** By design: the headline is the body's first paragraph, and `setHeadline` keeps the two in step (`useSendEmail.ts:211`, `syncHeadline` in `qa.ts:569`). It sits in its own field above the subject, so it reads as separate.

**To do.**
- **a. BUILD.** Put Subject above Headline on Full, and show it on Short and Designed as well. Give it a **Copy subject** button. Store it as its own `send.subject` (state is free-form JSON, `workspace.ts` saves any object under 64 KB, so no migration), so editing it doesn't create a body draft. Exclude it from the draft fingerprint (`fp`, `useSendEmail.ts:58`). QA keeps reading `subject + text`. Old drafts that carry a subject keep working: read `draft.subject` when `send.subject` is empty.
- **b. FIX.** Label the headline field "Headline · also the email's first line", with the same hint under it. That answers Noble's "why did it appear" without changing behaviour.
- **c. BUILD.** The writer also returns three subject options, shown as a drafts menu on the Subject field like the headline's (`HeadlineDrafts`). Edits in `server/writer.ts` and `house-voice.ts`, and the eval set. It needs the writer's real eval run to judge, which waits on keys (Dispatch 13).
- A Gmail compose link can carry a subject and a plain body, but not HTML, so it can't replace the paste. Not worth building.

## NW-084 · Full and Short with some formatting

True today: Full and Short are a plain-text textarea, the source of truth that QA reads and marks (decisions.md, D-27 list: "Send's Full and Short are plain text"). The clipboard gets one of two HTML forms. The untouched template gets `email.html` (bold headings, comp names as links, no fonts). Once the agent has edited, it gets `htmlFromText` (`email.ts:225`): bare `<p>` per paragraph, **raw StreetEasy URLs as link text**, no bold headings, no list. So an edited email loses its hierarchy and shows long URLs.

**a. BUILD.** Keep the plain text as the source of truth, and make one renderer that turns it into the copied HTML for both paths. Reuse what Designed already does: `parseEmailText` (`designed.ts:58`) finds the greeting, headline, status headings, comp lines, things to consider and sign-off. Output: bold headline, small-caps status headings, comp name plus facts plus a **"StreetEasy"** link, bullets for things to consider, the same inline font and link rules as the Designed fix. Short uses the same renderer. The Text tab and the `text/plain` half of the clipboard are unchanged, so QA and the log don't move. Delete `htmlFromText`'s raw-URL behaviour and the template's separate `html` string, so the two paths can't drift.

**b. DESIGN.** What the agent sees while editing: a formatted preview beside or instead of the textarea, and labels instead of raw URLs. A rich editor would break the issue marks (`AnnotatedText` works on text offsets), so a preview is the safe shape. This reverses the earlier plain-text call, as Kimani says; the D-27 line should be updated when it lands.

## NW-085 · an example of a good email

True today: nothing to show. The sample report (`server/sample/barclay-17l.ts`) produces an email, but with the sample banner and a placeholder headline. The structure source is Frankie's email (`docs/comp-report/sources/2026-07-29-frankie-delessio-comp-email-111-fulton-517.pdf`) and the house voice file (`server/house-voice.ts`).

**a. DECIDE: which example, and who writes it.**
- Option 1: the 100 Barclay sample, drafted by the writer, then edited by Noble until he'd send it. Uses engine numbers, so it stays true to the tool's own format. Needs the writer's real run.
- Option 2: Frankie's email as is. Real, but it's a real client email and its format differs from ours.
- Option 3: Kimani writes one by hand against the sample's numbers.
- **Recommend 1, approved by Noble,** and shown as a finished Designed email plus its Full text. It is fixed content in the repo, not generated live.

Once chosen, it is a small component that takes a title and a body, so the same one can serve Sort ("a good note") and the headline ("a good headline").

**b. DESIGN.** Where the link goes (card header, issues panel, Hubert's drawer) and how it opens. "On other screens too" makes this a pattern, not a Send fix.

## NW-086 · no way on to Done

**What's true in the code.** The route exists and works for the report's owner:
1. The Copy button (`copy()`, `useSendEmail.ts:268`) writes the clipboard, then stores `send.copiedAt` (`:295`).
2. That enables **Mark as sent** (`SendStep.tsx:116`, `disabled={!m.send.copiedAt}`).
3. `markSent` stores `sentAt` and calls `ws.go('done')` (`useSendEmail.ts:311`).
4. Done reads `sentAt` (`Done.tsx:64`). Without it, Done shows "This report isn't marked as sent yet" with a Go to Send button (`Done.tsx:74`).

I found no step that fails for an owner using the Copy button. So **it isn't a code bug as such**, but three things make it unreachable in practice:
- **Hidden on a read-only report.** `{!m.off && …}` (`SendStep.tsx:115`) removes the button when the report belongs to someone else (`readOnly` is "owner email isn't mine", `Workspace.tsx:272`). Copy still works there, but `copiedAt` is not stored (`useSendEmail.ts:294`). If Noble walked Kimani's report or a shared sample, this is exactly what he'd see. Worth confirming.
- **Copying by hand never counts.** Selecting the text and pressing Ctrl+C, or copying out of the Designed preview, sets nothing, so the button stays greyed with the tooltip "Copy it first". An agent who copies that way can never reach Done. The Designed preview is easy to copy by hand.
- **The hint disappears.** "Copy it, send it, then mark it as sent" shows only until `copiedAt` is set (`SendStep.tsx:113`). After a successful copy the footer says nothing, and Mark as sent is the plain outlined button beside a dark primary one. The next step is no longer pointed at.

**a. FIX (no layout change).**
- After a copy, the footer note becomes "Copied. Sent it? Mark it as sent." and **Mark as sent becomes the primary button** while Copy goes quiet.
- Let Mark as sent work before any copy (see question), with the tooltip dropped. The copy log still records only real copies.
- A copy done by the button on a read-only report: say so in the note ("This report is read-only, so it can't be marked as sent").

**b. DESIGN.** Done isn't a step in the progress row (Sort, Findings, Send); it hangs under Send (`screens.ts:16`). Whether it appears as a fourth step, or Send's footer holds a clearer "I sent it" moment, is a flow question.

## NW-087 · Write it stays

True today: the button is in the strip at `SendStep.tsx:145-150`, above the headline, and it is the primary action until the writer has run. After NW-078 it stands alone in that strip. Nothing to do.

## Questions for Kimani

1. **Noble's walk:** was it your report, or one that wasn't his own (a shared sample)? And did he copy with the Copy button or by selecting text? This decides whether NW-086 is the read-only case or the hierarchy.
2. **The italic (NW-081):** is it already italic in the Gmail compose box right after you paste, or only in the message you received? And is Object Sans installed on your machine? One answer picks the cause; the fix covers both either way.
3. **Mark as sent without a copy (NW-086):** may an agent mark it sent without using Copy? I recommend yes. A hand copy or a send from another route should still be able to finish the report.
4. **The example email (NW-085):** the 100 Barclay sample, written by Hubert and edited by Noble, or something else?
