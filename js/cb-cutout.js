/* cb-cutout.js — shared cutout pipeline for Casa Blanca tools.
 *
 * Turns a raw RMBG-1.4 mask into an RGBA cutout: soft alpha preserved, speckles
 * removed by connected component (not by blur), alpha refined against the image
 * with a guided filter, edge colour decontaminated by unmultiplying the locally
 * estimated background out of the RGB.
 *
 * Plain script, no build step:  <script src="../../js/cb-cutout.js"></script>
 * Then:  CBCutout.cutout(img, mask, mW, mH, { ...overrides })  ->  canvas
 *
 * Every knob is a parameter. Nothing here assumes a canvas size, a background
 * colour, or what the cutout is going to be composited onto — the profile-pic
 * generator and anything else that wants a cutout pass their own tuning.
 */
(function (global) {
'use strict';

const CB_CUTOUT_DEFAULTS = {
  maxEdge:          2048,   // working resolution cap (long edge); output is 1080
  normalize:        false,  // RMBG already emits [0,1]; stretching amplifies the
                            // model's weak *background* response as well as the subject
  floor:            0.02,   // below this alpha -> 0   (was 0.30)
  gamma:            1.4,    // >1 suppresses the weak tail (background veil) while
                            // leaving hair wisps visible — shapes, does not window
  ceil:             0.98,   // above this alpha -> 1   (was 0.80)
  despeckle:        true,
  coreThresh:       0.85,   // "the model is sure this is the subject"
  weakThresh:       0.15,   // hysteresis: grow from the core down to here
  minCorePx:        6,      // a blob with no confident core is not the subject
  minBlobFrac:      0.01,   // drop blobs smaller than this fraction of the biggest
  holeFillFrac:     0.0015, // fill enclosed holes smaller than this fraction of subject
  keepDilate:       6,      // mask px of slack kept around surviving blobs
  refine:           true,   // guided-filter the alpha against the image
  refineRadius:     0,      // 0 = auto from image size
  refineEps:        1e-4,
  decontaminate:    true,
  decontamRadius:   0,      // 0 = auto
  decontamMinAlpha: 0.05,   // below this, trust the neighbourhood foreground colour
  decontamRamp:     0.25,   // alpha range over which unmultiply fades in
  bleed:            true,   // paint foreground colour under the transparent edge
};

// ── separable box blur with clamped edges ──
function cbBoxBlur(src, w, h, r, dst) {
  if (r < 1) { dst.set(src); return dst; }
  const tmp = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[o + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = sum * inv;
      sum += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum * inv;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return dst;
}

// ── 4-connected labelling; returns {labels, areas} with labels 1..n ──
function cbLabel(bin, w, h) {
  const labels = new Int32Array(w * h);
  const stack  = new Int32Array(w * h);
  const areas  = [0];
  let next = 0;
  for (let i = 0; i < w * h; i++) {
    if (!bin[i] || labels[i]) continue;
    next++;
    let sp = 0, area = 0;
    stack[sp++] = i; labels[i] = next;
    while (sp > 0) {
      const p = stack[--sp]; area++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0     && bin[p - 1] && !labels[p - 1]) { labels[p - 1] = next; stack[sp++] = p - 1; }
      if (x < w - 1 && bin[p + 1] && !labels[p + 1]) { labels[p + 1] = next; stack[sp++] = p + 1; }
      if (y > 0     && bin[p - w] && !labels[p - w]) { labels[p - w] = next; stack[sp++] = p - w; }
      if (y < h - 1 && bin[p + w] && !labels[p + w]) { labels[p + w] = next; stack[sp++] = p + w; }
    }
    areas.push(area);
  }
  return { labels, areas, count: next };
}

// ── despeckle + hole fill, in mask space, on the binarised silhouette ──
function cbCleanMask(mask, w, h, o) {
  const n = w * h;
  const bin = new Uint8Array(n);
  let fg = 0, coreTotal = 0;
  for (let i = 0; i < n; i++) {
    if (mask[i] >= o.weakThresh) { bin[i] = 1; fg++; }
    if (mask[i] >= o.coreThresh) coreTotal++;
  }
  if (fg < 16 || coreTotal < o.minCorePx) return;   // nothing to clean, don't wipe the frame

  // Hysteresis: a blob only counts as subject if it contains pixels the model is
  // confident about. A speck, or a half-sure smear of background the model liked,
  // never reaches the core threshold and is dropped whole.
  const { labels, areas, count } = cbLabel(bin, w, h);
  const cores = new Int32Array(count + 1);
  for (let i = 0; i < n; i++) if (labels[i] && mask[i] >= o.coreThresh) cores[labels[i]]++;
  let biggest = 0;
  for (let l = 1; l <= count; l++) {
    if (cores[l] < o.minCorePx) continue;
    if (biggest === 0 || areas[l] > areas[biggest]) biggest = l;
  }
  if (!biggest) return;
  const minArea = Math.max(areas[biggest] * o.minBlobFrac, 32);
  const keep = new Float32Array(n);
  let keptArea = 0;
  for (let i = 0; i < n; i++) {
    const l = labels[i];
    if (l && cores[l] >= o.minCorePx && areas[l] >= minArea) { keep[i] = 1; keptArea++; }
  }

  // fill small enclosed holes (a punched-out gap inside the subject), but leave
  // real gaps — anything touching the frame edge is background by definition
  const inv = new Uint8Array(n);
  for (let i = 0; i < n; i++) inv[i] = keep[i] ? 0 : 1;
  const holes = cbLabel(inv, w, h);
  const touches = new Uint8Array(holes.count + 1);
  for (let x = 0; x < w; x++) { touches[holes.labels[x]] = 1; touches[holes.labels[(h - 1) * w + x]] = 1; }
  for (let y = 0; y < h; y++) { touches[holes.labels[y * w]] = 1; touches[holes.labels[y * w + w - 1]] = 1; }
  const maxHole = keptArea * o.holeFillFrac;
  for (let i = 0; i < n; i++) {
    const l = holes.labels[i];
    if (l && !touches[l] && holes.areas[l] <= maxHole) { keep[i] = 1; mask[i] = 1; }
  }

  // keep the soft halo around surviving blobs, kill fog everywhere else
  const grown = new Float32Array(n);
  cbBoxBlur(keep, w, h, Math.max(1, o.keepDilate | 0), grown);
  for (let i = 0; i < n; i++) if (grown[i] <= 0) mask[i] = 0;
}

// ── guided filter: aligns the soft alpha to real image edges ──
// q = a·I + b, solved over local windows with the image as guide.
function cbGuidedFilter(guide, p, w, h, r, eps, out) {
  const n = w * h;
  const meanI = new Float32Array(n), meanP = new Float32Array(n);
  const corrI = new Float32Array(n), corrIP = new Float32Array(n);
  const t = new Float32Array(n);
  cbBoxBlur(guide, w, h, r, meanI);
  cbBoxBlur(p,     w, h, r, meanP);
  for (let i = 0; i < n; i++) t[i] = guide[i] * guide[i];
  cbBoxBlur(t, w, h, r, corrI);
  for (let i = 0; i < n; i++) t[i] = guide[i] * p[i];
  cbBoxBlur(t, w, h, r, corrIP);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = corrI[i] - meanI[i] * meanI[i];
    const cov  = corrIP[i] - meanI[i] * meanP[i];
    a[i] = cov / (varI + eps);
    b[i] = meanP[i] - a[i] * meanI[i];
  }
  const ma = new Float32Array(n), mb = new Float32Array(n);
  cbBoxBlur(a, w, h, r, ma);
  cbBoxBlur(b, w, h, r, mb);
  for (let i = 0; i < n; i++) out[i] = ma[i] * guide[i] + mb[i];
  return out;
}

// ── weighted local colour average: mean of pixels whose weight is 1 ──
// Returns {r,g,b,support} planes. Two radii: tight first, wide as fallback.
function cbLocalColour(rgb, weight, w, h, r1, r2) {
  const n = w * h;
  const acc = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const tmp = new Float32Array(n);
  const out = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const outW = new Float32Array(n);
  const wide = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const wideW = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) tmp[i] = rgb[i * 4 + c] * weight[i];
    cbBoxBlur(tmp, w, h, r1, acc[c]);
    cbBoxBlur(tmp, w, h, r2, wide[c]);
  }
  cbBoxBlur(weight, w, h, r1, outW);
  cbBoxBlur(weight, w, h, r2, wideW);
  let gr = 0, gg = 0, gb = 0, gw = 0;
  for (let i = 0; i < n; i++) if (weight[i] > 0) { gr += rgb[i*4]; gg += rgb[i*4+1]; gb += rgb[i*4+2]; gw++; }
  if (gw > 0) { gr /= gw; gg /= gw; gb /= gw; } else { gr = gg = gb = 128; }
  for (let i = 0; i < n; i++) {
    if (outW[i] > 1e-3) {
      const iw = 1 / outW[i];
      out[0][i] = acc[0][i] * iw; out[1][i] = acc[1][i] * iw; out[2][i] = acc[2][i] * iw;
    } else if (wideW[i] > 1e-4) {
      const iw = 1 / wideW[i];
      out[0][i] = wide[0][i] * iw; out[1][i] = wide[1][i] * iw; out[2][i] = wide[2][i] * iw;
    } else {
      out[0][i] = gr; out[1][i] = gg; out[2][i] = gb;
    }
  }
  return out;
}

function cbCutout(img, maskData, mW, mH, userOpts) {
  const o = Object.assign({}, CB_CUTOUT_DEFAULTS, userOpts || {});
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const scale = Math.min(1, o.maxEdge / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale)), h = Math.max(1, Math.round(ih * scale));

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const id  = ctx.getImageData(0, 0, w, h);
  const px  = id.data;

  // 1 ── normalise the raw mask the way BRIA's own post-process does
  const mask = Float32Array.from(maskData);
  if (o.normalize) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < mask.length; i++) { if (mask[i] < mn) mn = mask[i]; if (mask[i] > mx) mx = mask[i]; }
    const range = mx - mn;
    if (range > 0.2) { const inv = 1 / range; for (let i = 0; i < mask.length; i++) mask[i] = (mask[i] - mn) * inv; }
  }
  for (let i = 0; i < mask.length; i++) mask[i] = mask[i] < 0 ? 0 : mask[i] > 1 ? 1 : mask[i];

  // 2 ── despeckle by connected component, not by blurring the whole mask
  if (o.despeckle) cbCleanMask(mask, mW, mH, o);

  // 3 ── bilinear upsample to working resolution (nearest leaves stair-steps)
  const alpha = new Float32Array(w * h);
  const sx = mW / w, sy = mH / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(mH - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = fy | 0, y1 = Math.min(mH - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(mW - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = fx | 0, x1 = Math.min(mW - 1, x0 + 1), tx = fx - x0;
      const a = mask[y0 * mW + x0], b = mask[y0 * mW + x1];
      const c = mask[y1 * mW + x0], d = mask[y1 * mW + x1];
      alpha[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }

  // 4 ── refine against the image, inside the transition band only
  if (o.refine) {
    const guide = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      guide[i] = (0.2126 * px[i*4] + 0.7152 * px[i*4+1] + 0.0722 * px[i*4+2]) / 255;
    }
    const r = o.refineRadius > 0 ? o.refineRadius
            : Math.max(2, Math.round(Math.min(w, h) / 400));
    const q = new Float32Array(w * h);
    cbGuidedFilter(guide, alpha, w, h, r, o.refineEps, q);
    const band = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) band[i] = (alpha[i] > 0.001 && alpha[i] < 0.999) ? 1 : 0;
    const bandW = new Float32Array(w * h);
    cbBoxBlur(band, w, h, r * 2, bandW);
    for (let i = 0; i < w * h; i++) {
      const t = Math.min(1, bandW[i] * 4);
      const v = alpha[i] * (1 - t) + q[i] * t;
      alpha[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }

  // 5 ── shape: gentle floor/ceiling instead of a 0.30–0.80 window, plus a
  // gamma that leans on the weak tail. A broad low-alpha veil of leftover
  // background collapses; a hair wisp at 0.4 stays clearly visible.
  const lo = o.floor, hi = o.ceil, span = Math.max(1e-6, hi - lo), g = o.gamma;
  for (let i = 0; i < w * h; i++) {
    const v = alpha[i];
    const t = v <= lo ? 0 : v >= hi ? 1 : (v - lo) / span;
    alpha[i] = g === 1 ? t : Math.pow(t, g);
  }

  // 6 ── colour decontamination: unmultiply the local background out of the band
  if (o.decontaminate) {
    const n = w * h;
    const wB = new Float32Array(n), wF = new Float32Array(n);
    let bandCount = 0;
    for (let i = 0; i < n; i++) {
      if (alpha[i] <= 0.03) wB[i] = 1;
      else if (alpha[i] >= 0.97) wF[i] = 1;
      if (alpha[i] > 0.001 && alpha[i] < 0.999) bandCount++;
    }
    if (bandCount > 0) {
      const r1 = o.decontamRadius > 0 ? o.decontamRadius
               : Math.max(3, Math.round(Math.min(w, h) / 250));
      const r2 = r1 * 5;
      const bg = cbLocalColour(px, wB, w, h, r1, r2);
      const fg = cbLocalColour(px, wF, w, h, r1, r2);
      // bleed the foreground colour into the transparent side of the edge so a
      // downscaling resampler can never drag old background colour back in
      if (o.bleed) {
        const near = new Float32Array(n), band = new Float32Array(n);
        for (let i = 0; i < n; i++) band[i] = (alpha[i] > 0.001) ? 1 : 0;
        cbBoxBlur(band, w, h, Math.max(2, r1), near);
        for (let i = 0; i < n; i++) {
          if (alpha[i] > 0.001 || near[i] <= 0) continue;
          px[i*4] = fg[0][i]; px[i*4+1] = fg[1][i]; px[i*4+2] = fg[2][i];
        }
      }
      const minA = o.decontamMinAlpha, ramp = Math.max(1e-6, o.decontamRamp);
      for (let i = 0; i < n; i++) {
        const a = alpha[i];
        if (a <= 0.001 || a >= 0.999) continue;
        const conf = Math.min(1, Math.max(0, (a - minA) / ramp));
        const ia = 1 / Math.max(a, 1e-3);
        for (let c = 0; c < 3; c++) {
          const C = px[i * 4 + c];
          const un = (C - (1 - a) * bg[c][i]) * ia;
          const v  = fg[c][i] + (un - fg[c][i]) * conf;
          px[i * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
    }
  }

  for (let i = 0; i < w * h; i++) px[i * 4 + 3] = Math.round(alpha[i] * 255);
  ctx.putImageData(id, 0, 0);
  return cv;
}

global.CBCutout = {
  defaults: CB_CUTOUT_DEFAULTS,
  cutout:   cbCutout,
  // building blocks, exposed because the inpainting side wants them too
  boxBlur:      cbBoxBlur,
  label:        cbLabel,
  guidedFilter: cbGuidedFilter,
};
})(typeof window !== 'undefined' ? window : globalThis);
