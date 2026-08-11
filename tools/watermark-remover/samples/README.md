# Test fixtures — watermarked StreetEasy photos

Real listing photos as StreetEasy publicly serves them (`se_extra_large`, 1199×800 —
533×800 for the portrait). Kept in the repo so the remover can be checked against actual
marks rather than synthetic ones. Renamed from their CDN hashes; otherwise untouched.

| file | what it exercises |
|---|---|
| `bedroom.png`  | two marks — the usual one bottom-right, plus one **clipped by the bottom-left edge** |
| `dining.png`   | single mark over wood grain (fine texture, the hard case for the fill) |
| `living.png`   | two marks, the main one straddling a rug/floor boundary |
| `bathroom.png` | portrait crop, mark sized differently (37% of width vs the usual 25%) |

## What they told us

Measured with the remover's own fitting:

- The mark is the **same wordmark asset the Watermarker composites** —
  `assets/brand/casa-blanca-wordmark-black.png`, matched at NCC 0.64–0.89.
- Placement is machine-consistent on the landscape shots: **300px wide (25.0% of image
  width) at x=840, y=709**, i.e. flush to a fixed margin. The portrait one differs.
- Baked opacity is **~0.83–0.89**, and it is *not* identical across R/G/B — solving one
  shared opacity leaves coloured fringing on the letterforms, so the tool solves each
  channel separately.

That last number is the important one: at ~85% only ~15% of the original pixel values
survive under the mark, so un-blending alone amplifies JPEG quantisation noise about 7×.
Exact inversion recovers the correct colour and shading but not the fine detail — which
is why the tool fills the strokes from their surroundings afterwards.
