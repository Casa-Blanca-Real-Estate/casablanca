# Brand logo files

The official Casa Blanca logos live in Google Drive →
**Brand Guidelines / Casa Blanca Logos**:

| Drive file | → repo filename | What it is |
|------------|-----------------|------------|
| `CB_A01-01 (Main)@2x.png`        | `casa-blanca-stacked-black.png`   | Building mark + "casa blanca" wordmark, stacked, black |
| `CB_A01-01 (Main)@2x WHITE.png`  | `casa-blanca-stacked-white.png`   | Same, white (dark backgrounds) |
| `cb_wordmark_black.png`          | `casa-blanca-wordmark-black.png`  | "casa blanca" wordmark only, black |
| `cb_wordmark_white_padded.png`   | `casa-blanca-wordmark-white.png`  | "casa blanca" wordmark only, white |
| `CB_A01-02 (Main)@2x.png`        | `casa-blanca-mark-black.png`      | Building icon only, black |

The Brand Assets page (`/tools/brand/` → Logos tab) looks for these exact filenames and
shows them automatically as built-in downloads. Until a file is present, its slot stays
hidden (no broken image).

## Getting the files in (two reliable routes)

1. **Upload in-platform (recommended).** Sign in as a dev, open Brand Assets → Logos, and
   upload each file. Because the platform is served from Netlify, uploads persist (Netlify
   Blobs) and propagate to every agent. No filename rules needed.
2. **Commit to the repo.** Add the files here under the repo filenames above and they become
   built-in, version-controlled downloads available on any host.

SVG/vector versions can be added the same way (adjust the extension).

## Brand basics (from the Brand Guidelines)

- Typeface: **Object Sans** (kerning -50, line spacing auto except titles, 100% height/width)
- Colors: Casa Lavender `#aaa3cf` · Casa Sand `#c0c2b5` · Casa Black `#0f0f0f` · Casa White `#cfcfcf`

The existing horizontal header logo is `assets/cb-logo-white.png`; the favicon is
`assets/favicon.svg`.
