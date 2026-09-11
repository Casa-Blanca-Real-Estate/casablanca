/* cb-extend.js — extend a cut-out subject downward with exemplar-based fill.
 *
 * The case this exists for: a chest-cropped headshot that has to fill a frame taller
 * than the body in the photo. Rebuilding that in Photoshop (marquee + content-aware
 * fill) or Canva (generative fill) is the round trip this is meant to end.
 *
 * Plain script, no build step. Needs cb-inpaint.js loaded first.
 *   <script src="../../js/cb-inpaint.js"></script>
 *   <script src="../../js/cb-extend.js"></script>
 *
 *   const region = CBExtend.autoRegion(cutCanvas, rows);        // Uint8 alpha, w x rows
 *   const out    = CBExtend.extend(cutCanvas, region, rows, {}); // { canvas, ok, … }
 *
 * What makes this different from pointing PatchMatch at a hole and hoping:
 *
 *   SOURCE IS RESTRICTED TO THE BODY. Without a source mask the solver will happily
 *   rebuild a torso out of the sitter's jaw, or out of the transparent background
 *   around them. It gets told to copy from opaque pixels in the bottom band only.
 *
 *   THE SHAPE IS NOT GUESSED. The silhouette is whatever the caller hands over. The
 *   default is a straight extrusion of the hem — deliberately not a shoulder taper,
 *   which is unreliable across the range of photos agents send — and the tool lets
 *   the operator redraw it.
 *
 *   IT REPORTS WHEN IT IS OUT OF ITS DEPTH. A fill that had to fall back to diffusion,
 *   or an extension longer than the body it is copying from, comes back flagged rather
 *   than quietly mushy.
 */
(function (global) {
'use strict';

const CB_EXTEND_DEFAULTS = {
  hemRows:       6,     // rows at the bottom of the cutout that define the hem shape
  hemAlpha:      0.25,  // hem coverage below this doesn't extrude
  minRunFrac:    0.08,  // ignore hem runs narrower than this much of the frame — a
                        // fragmented hem (crossed legs, a gap under an arm) otherwise
                        // extrudes into comb teeth
  maxSourceFrac: 0.45,  // source band: the bottom this-much of the photo. Bigger and it
                        // reaches the face or a hat, which the solver will happily use
                        // in preference to the clothing; smaller and there isn't enough
                        // texture to copy.
  minSourceRows: 96,
  sourceAlpha:   230,   // a pixel is body (and so copyable) at or above this alpha
  blendRows:     3,     // real rows folded into the hole so the seam is rebuilt too
  featherPx:     0,     // 0 = auto: soften the silhouette's outer edge so a drawn
                        // rectangle doesn't land as a hard-cut block on flat colour
  workWidth:     384,   // the solver runs at this width; cloth is low-frequency and
                        // the strip is downscaled again on the way into the 1080 frame
  patch:         13,
  iters:         4,
  outer:         2,
  vote_sharpness: 0.3,  // passed through to CBInpaint — see its note on one-sided holes
  minTextureRatio: 0.45,// the fill's high-frequency energy against the fabric it copied
                        // from. Below this it is a smear, and the tool should say so
                        // rather than hand over a plausible-looking blur.
  maxExtendFrac: 0.6,   // beyond this much of the body, say so rather than pretend
};

function ctxOf(cv) { return cv.getContext('2d', { willReadFrequently: true }); }

/** Straight extrusion of the hem silhouette, edge softness carried through. */
function autoRegion(cut, rows, userOpts) {
  const o = Object.assign({}, CB_EXTEND_DEFAULTS, userOpts || {});
  const w = cut.width, h = cut.height;
  const hemH = Math.min(h, Math.max(1, o.hemRows | 0));
  const d = ctxOf(cut).getImageData(0, h - hemH, w, hemH).data;

  const hem = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let m = 0;
    for (let y = 0; y < hemH; y++) m = Math.max(m, d[(y * w + x) * 4 + 3]);
    hem[x] = m / 255;
  }
  // Drop columns the body doesn't really occupy, then soften the two edges by a
  // pixel so the extruded silhouette isn't a hard-cut rectangle.
  const keep = new Float32Array(w);
  for (let x = 0; x < w; x++) keep[x] = hem[x] >= o.hemAlpha ? hem[x] : 0;

  // Keep only runs wide enough to be a body part. Thin slivers at the hem — a strand
  // of hair, the gap between crossed legs — extrude into streaks that read as damage.
  const minRun = Math.max(2, Math.round(w * o.minRunFrac));
  for (let x = 0; x < w; ) {
    if (!keep[x]) { x++; continue; }
    let end = x;
    while (end < w && keep[end]) end++;
    if (end - x < minRun) for (let i = x; i < end; i++) keep[i] = 0;
    x = end;
  }
  const smooth = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    smooth[x] = (keep[Math.max(0, x - 1)] + keep[x] + keep[Math.min(w - 1, x + 1)]) / 3;
  }

  const region = new Uint8ClampedArray(w * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < w; x++) region[y * w + x] = Math.round(smooth[x] * 255);
  }
  return region;
}

/** How much of the hem is actually body — a sanity check that the photo is cropped
 *  through the torso rather than showing the whole person with space to spare. */
function hemCoverage(cut, userOpts) {
  const o = Object.assign({}, CB_EXTEND_DEFAULTS, userOpts || {});
  const w = cut.width, h = cut.height;
  const d = ctxOf(cut).getImageData(0, h - 1, w, 1).data;
  let n = 0;
  for (let x = 0; x < w; x++) if (d[x * 4 + 3] >= 128) n++;
  return n / w;
}

/** Mean |laplacian| over a set of pixels — a cheap stand-in for "how much texture is
 *  in here". Used to compare the fill against the fabric it was supposed to copy. */
function textureEnergy(buf, w, h, y0, y1, mask, maskY0) {
  let sum = 0, n = 0;
  for (let y = Math.max(1, y0); y < Math.min(h - 1, y1); y++) {
    for (let x = 1; x < w - 1; x++) {
      if (mask && !mask[(y - maskY0) * w + x]) continue;
      const i = (y * w + x) * 4;
      const lap = 4 * buf[i] - buf[i - 4] - buf[i + 4] - buf[i - w * 4] - buf[i + w * 4];
      sum += Math.abs(lap); n++;
    }
  }
  return n ? sum / n : 0;
}

/** Bilinear RGB resample straight out of the solver's buffer.
 *  Deliberately not canvas drawImage: the filled pixels carry alpha 0 (they are a hole,
 *  not an image), and a canvas composites premultiplied — routing them through drawImage
 *  multiplies the new texture by zero and lands a black slab in the frame. */
function upscaleRGB(buf, sw, sy0, srows, dw, drows) {
  const out = new Uint8ClampedArray(dw * drows * 4);
  const xr = srows > 0 ? sw / dw : 1, yr = srows / drows;
  for (let y = 0; y < drows; y++) {
    const fy = Math.min(srows - 1, Math.max(0, (y + 0.5) * yr - 0.5));
    const y0 = fy | 0, y1 = Math.min(srows - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * xr - 0.5));
      const x0 = fx | 0, x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const a = ((sy0 + y0) * sw + x0) * 4, b = ((sy0 + y0) * sw + x1) * 4;
      const c = ((sy0 + y1) * sw + x0) * 4, d = ((sy0 + y1) * sw + x1) * 4;
      const o = (y * dw + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = buf[a + ch] + (buf[b + ch] - buf[a + ch]) * tx;
        const bot = buf[c + ch] + (buf[d + ch] - buf[c + ch]) * tx;
        out[o + ch] = top + (bot - top) * ty;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Soften the silhouette's outer edge. The top rows are left alone: that edge butts
 *  against the real body and has to stay opaque or the join shows as a seam. */
function featherRegion(region, w, rows, o) {
  const r = o.featherPx > 0 ? o.featherPx : Math.max(1, Math.round(w / 400));
  if (r < 1 || !global.CBCutout) return region;
  const f = new Float32Array(w * rows);
  for (let i = 0; i < f.length; i++) f[i] = region[i];
  const blurred = global.CBCutout.boxBlur(f, w, rows, r, new Float32Array(w * rows));
  const out = new Uint8ClampedArray(w * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // near the join, keep whatever the caller drew; further down, the softened edge
      out[i] = y < r ? region[i] : Math.min(region[i], Math.round(blurred[i]));
    }
  }
  return out;
}

/** Extend `cut` downward by `rows`, filling the given region with body texture.
 *  Returns { canvas, ok, method, reason, ms }. */
function extend(cut, region, rows, userOpts) {
  const o = Object.assign({}, CB_EXTEND_DEFAULTS, userOpts || {});
  const t0 = (global.performance || Date).now();
  const w = cut.width, h = cut.height;
  rows = Math.max(1, rows | 0);

  const srcRows = Math.min(h, Math.max(o.minSourceRows, Math.round(h * o.maxSourceFrac)));
  const bandTop = h - srcRows;
  const bandH   = srcRows + rows;
  const blend   = Math.min(o.blendRows | 0, srcRows - 1);

  const cctx = ctxOf(cut);
  const srcFull = cctx.getImageData(0, bandTop, w, srcRows);

  // Solve at a reduced width. PatchMatch cost goes with hole area, and this is cloth:
  // the shape has to be sharp (it comes from the full-resolution region below), the
  // texture does not. A 3000px portrait drops from ~45s to a couple of seconds.
  // …but not so reduced that the source band stops being taller than a few patches:
  // a 13px patch needs room above and below it or the solver has nothing to match.
  const minSrcRowsAtWork = o.patch * 4;
  const k = Math.min(1, Math.max(o.workWidth / w, Math.min(1, minSrcRowsAtWork / srcRows)));
  const ww       = Math.max(32, Math.round(w * k));
  const wSrcRows = Math.max(8, Math.round(srcRows * k));
  const wRows    = Math.max(1, Math.round(rows * k));
  const wBandH   = wSrcRows + wRows;
  const wBlend   = Math.min(Math.max(1, Math.round(blend * k)), wSrcRows - 1);

  const workCv = document.createElement('canvas');
  workCv.width = ww; workCv.height = wBandH;
  const wctx = ctxOf(workCv);
  wctx.imageSmoothingQuality = 'high';
  wctx.drawImage(cut, 0, bandTop, w, srcRows, 0, 0, ww, wSrcRows);
  const work = wctx.getImageData(0, 0, ww, wBandH);
  const buf  = work.data;

  // Region at work resolution, for the hole only — the alpha written into the output
  // still comes from the caller's full-resolution region.
  const regionCv = document.createElement('canvas');
  regionCv.width = w; regionCv.height = rows;
  const rctx = ctxOf(regionCv);
  const rImg = rctx.createImageData(w, rows);
  for (let i = 0; i < w * rows; i++) { rImg.data[i*4+3] = region[i]; }
  rctx.putImageData(rImg, 0, 0);
  const rSmall = document.createElement('canvas');
  rSmall.width = ww; rSmall.height = wRows;
  const rsctx = ctxOf(rSmall);
  rsctx.imageSmoothingQuality = 'high';
  rsctx.drawImage(regionCv, 0, 0, ww, wRows);
  const rSmallData = rsctx.getImageData(0, 0, ww, wRows).data;

  const hole   = new Uint8Array(ww * wBandH);
  const source = new Uint8Array(ww * wBandH);
  for (let y = 0; y < wSrcRows; y++) {
    for (let x = 0; x < ww; x++) {
      const i = y * ww + x;
      if (y >= wSrcRows - wBlend) hole[i] = 1;                  // rebuild the seam too
      else if (buf[i * 4 + 3] >= o.sourceAlpha) source[i] = 1;
    }
  }
  let holePx = 0;
  for (let y = 0; y < wRows; y++) {
    for (let x = 0; x < ww; x++) {
      if (rSmallData[(y * ww + x) * 4 + 3] > 8) { hole[(wSrcRows + y) * ww + x] = 1; holePx++; }
    }
  }
  let sourcePx = 0;
  for (let i = 0; i < source.length; i++) if (source[i]) sourcePx++;

  let ok = false, method = 'nothing to fill', reason = '';
  if (!holePx) {
    reason = 'the fill region is empty';
  } else if (sourcePx < holePx) {          // both counted at work resolution
    // Not enough real body to copy from. Run it anyway — the operator asked — but
    // say plainly that the answer is invented rather than sourced.
    reason = 'thin source: the extension is large next to the body it copies from';
  }

  if (holePx) {
    const res = global.CBInpaint.fill(buf, ww, wBandH, hole, {
      method: 'patchmatch',
      patch:  o.patch,
      iters:  o.iters,
      outer:  o.outer,
      source,
      seed_mode: 'random',          // context on one side only — see cb-inpaint
      vote_sharpness: o.vote_sharpness,
    });
    ok = res.ok;
    method = res.method;
    if (!ok && !reason) reason = 'not enough source texture — fell back to diffusion';
  }

  // Did it actually copy texture, or average it into a smear? Patterned fabric with
  // context on only one side comes back smooth, and a smooth fill is worse than an
  // honest "this one needs the generative path".
  let textureRatio = 1;
  if (holePx) {
    const srcE  = textureEnergy(buf, ww, wBandH, 1, wSrcRows - wBlend - 1, source, 0);
    const fillE = textureEnergy(buf, ww, wBandH, wSrcRows + 1, wBandH - 1, null, 0);
    textureRatio = srcE > 1 ? fillE / srcE : 1;
    if (textureRatio < o.minTextureRatio) {
      ok = false;
      method = 'smoothed';
      reason = `the fill came back ${Math.round((1 - textureRatio) * 100)}% flatter than the `
             + 'fabric it copied from — this garment has too much pattern for the offline fill';
    }
  }

  // Compose: original on top, filled strip underneath. The fill is upscaled back to
  // full width; the alpha comes from the caller's full-resolution region, so the
  // silhouette stays as sharp as it was drawn.
  const out = document.createElement('canvas');
  out.width = w; out.height = h + rows;
  const octx = ctxOf(out);
  octx.drawImage(cut, 0, 0);

  const fillCv = document.createElement('canvas');
  fillCv.width = w; fillCv.height = rows;
  const fctx = ctxOf(fillCv);
  const up = fctx.createImageData(w, rows);
  up.data.set(upscaleRGB(buf, ww, wSrcRows, wRows, w, rows));
  const alpha = featherRegion(region, w, rows, o);
  for (let i = 0; i < w * rows; i++) up.data[i * 4 + 3] = alpha[i];
  fctx.putImageData(up, 0, 0);
  octx.drawImage(fillCv, 0, h);

  // The seam rows were rebuilt as part of the hole; blend them back over the join so
  // it doesn't show a step, keeping the original alpha.
  if (blend > 0) {
    const seamCv = document.createElement('canvas');
    seamCv.width = w; seamCv.height = blend;
    const sctx2 = ctxOf(seamCv);
    const seam = sctx2.createImageData(w, blend);
    seam.data.set(upscaleRGB(buf, ww, wSrcRows - wBlend, wBlend, w, blend));
    for (let y = 0; y < blend; y++) {
      for (let x = 0; x < w; x++) {
        seam.data[(y * w + x) * 4 + 3] = srcFull.data[((srcRows - blend + y) * w + x) * 4 + 3];
      }
    }
    sctx2.putImageData(seam, 0, 0);
    octx.drawImage(seamCv, 0, h - blend);
  }

  return {
    canvas: out, ok, method, reason,
    holePx, sourcePx, textureRatio: +textureRatio.toFixed(2),
    ms: Math.round((global.performance || Date).now() - t0),
  };
}

/** Put an already-generated fill under the cutout. Same silhouette treatment the
 *  offline path gets, so a server-generated strip and a PatchMatch strip are composited
 *  identically — only where the pixels came from differs. */
function compose(cut, fillImage, region, rows, userOpts) {
  const o = Object.assign({}, CB_EXTEND_DEFAULTS, userOpts || {});
  const w = cut.width, h = cut.height;
  const out = document.createElement('canvas');
  out.width = w; out.height = h + rows;
  const octx = ctxOf(out);
  octx.drawImage(cut, 0, 0);

  const strip = document.createElement('canvas');
  strip.width = w; strip.height = rows;
  const sctx = ctxOf(strip);
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(fillImage, 0, 0, w, rows);
  const img = sctx.getImageData(0, 0, w, rows);
  const alpha = featherRegion(region, w, rows, o);
  for (let i = 0; i < w * rows; i++) img.data[i * 4 + 3] = alpha[i];
  sctx.putImageData(img, 0, 0);
  octx.drawImage(strip, 0, h);
  return out;
}

global.CBExtend = { defaults: CB_EXTEND_DEFAULTS, autoRegion, hemCoverage, extend, compose, featherRegion };
})(typeof window !== 'undefined' ? window : globalThis);
