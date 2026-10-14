/* cb-inpaint.js — shared exemplar-based inpainting for Casa Blanca tools.
 *
 * Lifted verbatim from the watermarker, where it has been shipping: coarse-to-fine
 * PatchMatch (the algorithm behind Content-Aware Fill), a structure-first Criminisi
 * alternative, and a diffusion fallback for holes with too little source texture.
 *
 * Plain script, no build step:  <script src="../../js/cb-inpaint.js"></script>
 * Then:  CBInpaint.fill(rgbaBuffer, w, h, holeMask, { ...overrides })
 *
 * Parameters in, no hardcoded assumptions about what the hole is. The watermarker
 * fills small rectangular marks inside a photo; the profile-pic generator extends a
 * body silhouette against flat colour. Same math, different tuning — so the caller
 * passes the tuning and nothing in here reaches for a global.
 */
(function (global) {
'use strict';

const CB_INPAINT_DEFAULTS = {
  method:       'patchmatch', // 'patchmatch' | 'criminisi'
  patch:        13,           // PatchMatch patch size (odd)
  iters:        4,            // propagation/random-search passes per pyramid level
  outer:        2,            // solve/vote rounds per level
  criminisiPatch: 11,
  seed:         20240917,     // fixed, so a replay reproduces the same fill
  fallback:     true,         // diffusion + grain when the exemplar fill can't run
  diffuseIters: 260,
  grain:        true,         // match the surrounding film grain on the fallback path
};

function dilate(mask, cw, ch, thr, px){
  let cur = new Uint8Array(cw*ch);
  for (let i=0;i<cur.length;i++) cur[i] = mask[i] > thr ? 1 : 0;
  for (let k=0;k<px;k++){
    const nx = new Uint8Array(cur);
    for (let y=1;y<ch-1;y++) for (let x=1;x<cw-1;x++){
      const i=y*cw+x;
      if (cur[i-1]||cur[i+1]||cur[i-cw]||cur[i+cw]) nx[i]=1;
    }
    cur = nx;
  }
  return cur;
}
// ── PATCHMATCH ────────────────────────────────────────────────────────────────
// The algorithm behind Photoshop's Content-Aware Fill (Barnes et al. 2009). Diffusion
// interpolates colour inward and blurs texture; this instead finds, for every patch
// overlapping the hole, a well-matching patch of REAL texture elsewhere in the image and
// rebuilds the hole from those. The nearest-neighbour field is refined by two moves:
//   propagation   — a good offset usually suits the neighbouring patch too
//   random search — sample offsets at exponentially shrinking radii around the best
//
// Two details separate a passable fill from a seamless one, and both are in here:
//
//   MULTI-SCALE. Solving only at full resolution lets each patch make a locally
//   plausible choice that is globally incoherent — a floorboard line that stops, a rug
//   that changes direction. Solving on a pyramid coarse-to-fine settles the large
//   structure first, then refines detail inside it. This is the piece real Content-Aware
//   Fill has that a single-scale port doesn't.
//
//   WEIGHTED VOTING. Each hole pixel is covered by many patches. Averaging them equally
//   blurs — one bad match drags the result. Weighting each contribution by exp(-d/2σ²)
//   (Wexler et al.) lets confident matches dominate and keeps the texture crisp.
//
// We deliberately do NOT steer any of this with the un-blended estimate: at the ~85%
// opacity these listing photos use, even a heavily blurred estimate is contaminated
// enough to pull the letterforms back into the result.

/** RGBA bytes → planar float RGB, which is what the solver works on. */
function rgbaToF32(buf, n){
  const p = new Float32Array(n*3);
  for (let i=0;i<n;i++){ p[i*3]=buf[i*4]; p[i*3+1]=buf[i*4+1]; p[i*3+2]=buf[i*4+2]; }
  return p;
}
/** Half-size box-filtered copy of a float RGB buffer. */
function halfPix(pix, w, h){
  const w2 = w>>1, h2 = h>>1, out = new Float32Array(w2*h2*3);
  for (let y=0;y<h2;y++) for (let x=0;x<w2;x++){
    const o = (y*w2+x)*3;
    for (let c=0;c<3;c++){
      const a = pix[((2*y)*w + 2*x)*3+c],   b = pix[((2*y)*w + 2*x+1)*3+c];
      const d = pix[((2*y+1)*w + 2*x)*3+c], e = pix[((2*y+1)*w + 2*x+1)*3+c];
      out[o+c] = (a+b+d+e)*0.25;
    }
  }
  return { pix: out, w: w2, h: h2 };
}
/** Half-size hole: a coarse pixel is unknown if ANY of its four children is. */
function halfHole(hole, w, h){
  const w2 = w>>1, h2 = h>>1, out = new Uint8Array(w2*h2);
  for (let y=0;y<h2;y++) for (let x=0;x<w2;x++)
    out[y*w2+x] = (hole[(2*y)*w + 2*x] || hole[(2*y)*w + 2*x+1] ||
                   hole[(2*y+1)*w + 2*x] || hole[(2*y+1)*w + 2*x+1]) ? 1 : 0;
  return out;
}

/** Smooth local-brightness field, built from KNOWN pixels only and extrapolated across
 *  the hole (a box blur of the known pixels divided by a box blur of the known mask).
 *  Matching against mean-shifted patches lets texture come from anywhere in the photo
 *  while the fill still takes the brightness of the neighbourhood it lands in — without
 *  it, a stroke over dark floor happily borrows from a bright wall and reads as a patch. */
function localMean(pix, w, h, hole, radius){
  const N = w*h;
  const sum = new Float64Array((w+1)*(h+1)*3), cnt = new Float64Array((w+1)*(h+1));
  const SW = w+1;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const i = y*w+x, k = (y+1)*SW + (x+1);
    const known = hole[i] ? 0 : 1;
    for (let c=0;c<3;c++)
      sum[k*3+c] = (known ? pix[i*3+c] : 0) + sum[(k-1)*3+c] + sum[(k-SW)*3+c] - sum[(k-SW-1)*3+c];
    cnt[k] = known + cnt[k-1] + cnt[k-SW] - cnt[k-SW-1];
  }
  const M = new Float32Array(N*3);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const x0 = Math.max(0, x-radius), y0 = Math.max(0, y-radius);
    const x1 = Math.min(w-1, x+radius), y1 = Math.min(h-1, y+radius);
    const a = (y1+1)*SW + (x1+1), b = (y0)*SW + (x1+1), c0 = (y1+1)*SW + x0, d = (y0)*SW + x0;
    const n = cnt[a] - cnt[b] - cnt[c0] + cnt[d];
    const i = y*w+x;
    for (let c=0;c<3;c++)
      M[i*3+c] = n > 0 ? (sum[a*3+c] - sum[b*3+c] - sum[c0*3+c] + sum[d*3+c]) / n : pix[i*3+c];
  }
  return M;
}

/** One pyramid level: refine the NNF, then vote. Returns the NNF for the next level. */
function pmLevel(pix, w, h, hole, P, iters, outer, nnfIn, rnd){
  const half = P >> 1, N = w*h;
  // A patch is a valid SOURCE only if it contains no unknown pixels.
  const ok = new Uint8Array(N);
  for (let y=half; y<h-half; y++) for (let x=half; x<w-half; x++){
    let clean = 1;
    for (let j=-half; j<=half && clean; j++){
      const row = (y+j)*w + x;
      for (let i=-half; i<=half; i++) if (hole[row+i]) { clean = 0; break; }
    }
    ok[y*w+x] = clean;
  }
  const srcs = [];
  for (let i=0;i<N;i++) if (ok[i]) srcs.push(i);
  const tgt = [], tIdx = new Int32Array(N).fill(-1);
  for (let y=half; y<h-half; y++) for (let x=half; x<w-half; x++)
    if (hole[y*w+x]) { tIdx[y*w+x] = tgt.length; tgt.push(y*w+x); }
  const n = tgt.length;
  if (srcs.length < 32 || !n) return null;

  // Local brightness, so patches are compared with it removed.
  const M = localMean(pix, w, h, hole, Math.max(6, Math.round(Math.min(w,h)/8)));

  const nnf = new Int32Array(n);
  for (let k=0;k<n;k++){
    let s = nnfIn ? nnfIn[k] : -1;
    if (s < 0 || !ok[s]) s = srcs[(rnd()*srcs.length)|0];
    nnf[k] = s;
  }

  // Compare the WHOLE patch, not just its known pixels. A patch sitting deep inside a
  // thick hole has no known pixels at all, and scoring only those leaves every candidate
  // tied at infinity — which is exactly how a hole ends up filled with flat grey. Unknown
  // pixels carry the current estimate (from the coarser level) at a reduced weight, so
  // known context still dominates while interiors have something to follow.
  const W_UNKNOWN = 0.4;
  function dist(t, s){
    const ty = (t/w)|0, tx = t%w, sy = (s/w)|0, sx = s%w;
    let sum = 0, cnt = 0;
    for (let j=-half; j<=half; j++){
      let ti = (ty+j)*w + tx - half, si = (sy+j)*w + sx - half;
      for (let i=-half; i<=half; i++, ti++, si++){
        const q = hole[ti] ? W_UNKNOWN : 1;
        const a = ti*3, b = si*3;
        const dr = (pix[a]  -M[a])   - (pix[b]  -M[b]);
        const dg = (pix[a+1]-M[a+1]) - (pix[b+1]-M[b+1]);
        const db = (pix[a+2]-M[a+2]) - (pix[b+2]-M[b+2]);
        sum += q*(dr*dr + dg*dg + db*db); cnt += q;
      }
    }
    return cnt ? sum/cnt : Infinity;
  }

  const maxR = Math.max(w, h);
  const best = new Float32Array(n);
  for (let o=0; o<outer; o++){
    for (let it=0; it<iters; it++){
      const fwd = (it & 1) === 0;
      for (let idx=0; idx<n; idx++){
        const k = fwd ? idx : n-1-idx;
        const t = tgt[k];
        let bd = dist(t, nnf[k]);
        const step = fwd ? -1 : 1;
        for (const kk of [k+step, k+step*2]){
          if (kk < 0 || kk >= n) continue;
          const cand = nnf[kk] + (t - tgt[kk]);
          const cy = (cand/w)|0, cx = cand%w;
          if (cy<half || cy>=h-half || cx<half || cx>=w-half || !ok[cand]) continue;
          const d = dist(t, cand);
          if (d < bd){ bd = d; nnf[k] = cand; }
        }
        let r = maxR;
        const by = (nnf[k]/w)|0, bx = nnf[k]%w;
        while (r > 1){
          const yy = by + Math.round((rnd()*2-1)*r), xx = bx + Math.round((rnd()*2-1)*r);
          const cand = yy*w + xx;
          if (yy>=half && yy<h-half && xx>=half && xx<w-half && ok[cand]){
            const d = dist(t, cand);
            if (d < bd){ bd = d; nnf[k] = cand; }
          }
          r >>= 1;
        }
        best[k] = bd;
      }
    }
    // Similarity-weighted vote: confident matches dominate, so texture stays crisp.
    let mean = 0, mc = 0;
    for (let k=0;k<n;k++) if (isFinite(best[k])){ mean += best[k]; mc++; }
    mean = (mc ? mean/mc : 1) + 1e-6;
    const num = new Float32Array(N*3), den = new Float32Array(N);
    for (let k=0;k<n;k++){
      const wgt = isFinite(best[k]) ? Math.exp(-best[k] / (2*mean)) : 0;
      if (!wgt) continue;
      const t = nnf[k];
      const ty = (tgt[k]/w)|0, tx = tgt[k]%w, sy = (t/w)|0, sx = t%w;
      for (let j=-half; j<=half; j++){
        let ti = (ty+j)*w + tx - half, si = (sy+j)*w + sx - half;
        for (let i=-half; i<=half; i++, ti++, si++){
          if (!hole[ti]) continue;
          num[ti*3]   += (pix[si*3]  -M[si*3]  +M[ti*3])  *wgt;
          num[ti*3+1] += (pix[si*3+1]-M[si*3+1]+M[ti*3+1])*wgt;
          num[ti*3+2] += (pix[si*3+2]-M[si*3+2]+M[ti*3+2])*wgt;
          den[ti] += wgt;
        }
      }
    }
    for (let i=0;i<N;i++){
      if (!hole[i] || !den[i]) continue;
      pix[i*3]   = num[i*3]  /den[i];
      pix[i*3+1] = num[i*3+1]/den[i];
      pix[i*3+2] = num[i*3+2]/den[i];
    }
  }
  return { nnf, tIdx, tgt, w, h };
}

/** Coarse-to-fine PatchMatch fill. Returns false if there's too little source texture. */
function patchMatchFill(buf, cw, ch, hole, P, iters, outer){
  const N = cw*ch;
  // Pyramid, coarsest last. Stop before a level gets too small to hold a few patches.
  const pyr = [{ pix: rgbaToF32(buf, N), w: cw, h: ch, hole }];
  while (pyr.length < 4){
    const t = pyr[pyr.length-1];
    if (Math.min(t.w, t.h) < 6*P) break;
    const d = halfPix(t.pix, t.w, t.h);
    pyr.push({ pix: d.pix, w: d.w, h: d.h, hole: halfHole(t.hole, t.w, t.h) });
  }
  let seed = 987654321;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  // Seed the coarsest level's hole with the mean of what's known there.
  const top = pyr[pyr.length-1];
  let mr=0, mg=0, mb=0, cnt=0;
  for (let i=0;i<top.w*top.h;i++) if (!top.hole[i]){ mr+=top.pix[i*3]; mg+=top.pix[i*3+1]; mb+=top.pix[i*3+2]; cnt++; }
  if (!cnt) return false;
  mr/=cnt; mg/=cnt; mb/=cnt;
  for (let i=0;i<top.w*top.h;i++) if (top.hole[i]){ top.pix[i*3]=mr; top.pix[i*3+1]=mg; top.pix[i*3+2]=mb; }

  let prev = null;
  for (let l = pyr.length-1; l >= 0; l--){
    const lv = pyr[l];
    let nnfInit = null;
    if (prev){
      // Carry the coarse solution down: the filled colours as a starting image, and the
      // offsets themselves (doubled) so the fine search begins from the coarse answer.
      const half = P>>1;
      const tgt = [], tIdx = new Int32Array(lv.w*lv.h).fill(-1);
      for (let y=half; y<lv.h-half; y++) for (let x=half; x<lv.w-half; x++)
        if (lv.hole[y*lv.w+x]) { tIdx[y*lv.w+x] = tgt.length; tgt.push(y*lv.w+x); }
      nnfInit = new Int32Array(tgt.length).fill(-1);
      for (let k=0;k<tgt.length;k++){
        const y = (tgt[k]/lv.w)|0, x = tgt[k]%lv.w;
        const cy = y>>1, cx = x>>1;
        if (cy < prev.h && cx < prev.w){
          const ck = prev.tIdx[cy*prev.w+cx];
          if (ck >= 0){
            const cs = prev.nnf[ck];
            const sy = ((cs/prev.w)|0)*2 + (y&1), sx = (cs%prev.w)*2 + (x&1);
            if (sy>=half && sy<lv.h-half && sx>=half && sx<lv.w-half) nnfInit[k] = sy*lv.w+sx;
          }
        }
        // Upsample the coarse colours as this level's starting guess.
        if (cy < prev.h && cx < prev.w){
          const src = (cy*prev.w+cx)*3, dst = tgt[k]*3;
          lv.pix[dst] = prev.pix[src]; lv.pix[dst+1] = prev.pix[src+1]; lv.pix[dst+2] = prev.pix[src+2];
        }
      }
    }
    const res = pmLevel(lv.pix, lv.w, lv.h, lv.hole, P, iters, outer, nnfInit, rnd);
    if (!res) return false;
    prev = { nnf: res.nnf, tIdx: res.tIdx, w: lv.w, h: lv.h, pix: lv.pix };
  }

  const fine = pyr[0];
  for (let i=0;i<N;i++){
    if (!hole[i]) continue;
    buf[i*4]   = Math.min(255, Math.max(0, fine.pix[i*3]));
    buf[i*4+1] = Math.min(255, Math.max(0, fine.pix[i*3+1]));
    buf[i*4+2] = Math.min(255, Math.max(0, fine.pix[i*3+2]));
  }
  return true;
}
// ── CRIMINISI (STRUCTURE-FIRST FILL ORDER) ────────────────────────────────────
// Criminisi et al. 2004, "Region Filling and Object Removal by Exemplar-Based Image
// Inpainting". PatchMatch optimises every patch at once and has no opinion about the
// ORDER things get filled; that's fine for texture but it lets a strong edge — a
// floorboard seam, the line where a rug meets the floor — get averaged away before it
// can propagate. Criminisi fills the hole boundary-inward, and at each step picks the
// patch with the highest priority:
//
//   P(p) = C(p) · D(p)
//     C(p)  confidence — how much of this patch is already known. Fills from the
//           well-supported parts of the front first and decays as we move inward.
//     D(p)  data — how strongly an isophote (an edge running through the image) meets
//           the fill front here. This is the term that makes linear structure continue
//           across the hole instead of dissolving.
//
// The chosen patch is then filled by copying the best-matching known patch, whole, so
// edges arrive intact rather than as an average of candidates.
function criminisiFill(buf, cw, ch, hole, P, rnd){
  const N = cw*ch, half = P >> 1;
  const pix = rgbaToF32(buf, N);
  const M = localMean(pix, cw, ch, hole, Math.max(6, Math.round(Math.min(cw,ch)/8)));
  const unknown = new Uint8Array(hole);           // 1 = still to fill
  const conf = new Float32Array(N);
  for (let i=0;i<N;i++) conf[i] = hole[i] ? 0 : 1;

  // Valid sources: patches with no unknown pixel. Computed once against the ORIGINAL
  // hole — filled-in pixels are never reused as source material, which stops the fill
  // from feeding on itself and smearing.
  const ok = new Uint8Array(N);
  for (let y=half; y<ch-half; y++) for (let x=half; x<cw-half; x++){
    let clean = 1;
    for (let j=-half; j<=half && clean; j++){
      const row = (y+j)*cw + x;
      for (let i=-half; i<=half; i++) if (hole[row+i]) { clean = 0; break; }
    }
    ok[y*cw+x] = clean;
  }
  const srcs = [];
  for (let i=0;i<N;i++) if (ok[i]) srcs.push(i);
  if (srcs.length < 32) return false;

  // Work inside the hole's bounding box (plus a margin) rather than the whole crop.
  let bx0=cw, by0=ch, bx1=0, by1=0;
  for (let y=0;y<ch;y++) for (let x=0;x<cw;x++) if (hole[y*cw+x]){
    if (x<bx0) bx0=x; if (x>bx1) bx1=x; if (y<by0) by0=y; if (y>by1) by1=y;
  }
  bx0=Math.max(half,bx0-2); by0=Math.max(half,by0-2);
  bx1=Math.min(cw-half-1,bx1+2); by1=Math.min(ch-half-1,by1+2);

  const gray = new Float32Array(N);
  for (let i=0;i<N;i++) gray[i] = (pix[i*3]+pix[i*3+1]+pix[i*3+2])/3;

  const lastOffsets = [];   // offsets that recently worked — cheap, strong candidates
  let remaining = 0;
  for (let i=0;i<N;i++) if (unknown[i]) remaining++;
  let guard = 0;

  while (remaining > 0 && guard++ < 20000){
    // 1. Highest-priority patch on the current fill front.
    let bestP = -1, bp = -1, bestC = 0;
    for (let y=by0; y<=by1; y++) for (let x=bx0; x<=bx1; x++){
      const i = y*cw+x;
      if (!unknown[i]) continue;
      // on the front? (has at least one known 4-neighbour)
      if (unknown[i-1] && unknown[i+1] && unknown[i-cw] && unknown[i+cw]) continue;
      // confidence
      let c = 0, n = 0;
      for (let j=-half; j<=half; j++){
        let ti = (y+j)*cw + x - half;
        for (let k=-half; k<=half; k++, ti++){ c += conf[ti]; n++; }
      }
      c /= n;
      // data term: isophote (gradient rotated 90°) against the front normal
      const gx = (unknown[i+1] || unknown[i-1]) ? 0 : gray[i+1]-gray[i-1];
      const gy = (unknown[i+cw] || unknown[i-cw]) ? 0 : gray[i+cw]-gray[i-cw];
      const nx = (unknown[i+1]?1:0) - (unknown[i-1]?1:0);
      const ny = (unknown[i+cw]?1:0) - (unknown[i-cw]?1:0);
      const nl = Math.hypot(nx, ny) || 1;
      // isophote = (-gy, gx); dot with the unit normal
      const d = Math.abs((-gy)*(nx/nl) + gx*(ny/nl)) / 255 + 0.001;
      const pr = c * d;
      if (pr > bestP){ bestP = pr; bp = i; bestC = c; }
    }
    if (bp < 0) break;

    // 2. Best-matching known patch, compared with local brightness removed so a patch
    //    over dark floor doesn't borrow from a bright wall.
    const py = (bp/cw)|0, px = bp%cw;
    let bestD = Infinity, bs = -1;
    const tryCand = (s) => {
      const sy = (s/cw)|0, sx = s%cw;
      if (sy<half || sy>=ch-half || sx<half || sx>=cw-half || !ok[s]) return;
      let sum = 0, cnt = 0;
      for (let j=-half; j<=half; j++){
        let ti = (py+j)*cw + px - half, si = (sy+j)*cw + sx - half;
        for (let k=-half; k<=half; k++, ti++, si++){
          if (unknown[ti]) continue;
          const a = ti*3, b = si*3;
          const dr = (pix[a]  -M[a])   - (pix[b]  -M[b]);
          const dg = (pix[a+1]-M[a+1]) - (pix[b+1]-M[b+1]);
          const db = (pix[a+2]-M[a+2]) - (pix[b+2]-M[b+2]);
          sum += dr*dr + dg*dg + db*db; cnt++;
        }
      }
      if (!cnt) return;
      const d = sum/cnt;
      if (d < bestD){ bestD = d; bs = s; }
    };
    // Offsets that worked for nearby patches, then a random sample. Same trick
    // PatchMatch uses — coherent neighbours plus randomness beats an exhaustive scan.
    for (const off of lastOffsets) tryCand(bp + off);
    for (let t=0; t<450; t++) tryCand(srcs[(rnd()*srcs.length)|0]);
    if (bs < 0){ for (let t=0; t<3000 && bs<0; t++) tryCand(srcs[(rnd()*srcs.length)|0]); }
    if (bs < 0) break;

    // 3. Copy the winner in, whole, and record the new confidence.
    const sy = (bs/cw)|0, sx = bs%cw;
    for (let j=-half; j<=half; j++){
      let ti = (py+j)*cw + px - half, si = (sy+j)*cw + sx - half;
      for (let k=-half; k<=half; k++, ti++, si++){
        if (!unknown[ti]) continue;
        pix[ti*3] = pix[si*3]-M[si*3]+M[ti*3];
        pix[ti*3+1] = pix[si*3+1]-M[si*3+1]+M[ti*3+1];
        pix[ti*3+2] = pix[si*3+2]-M[si*3+2]+M[ti*3+2];
        gray[ti] = (pix[ti*3]+pix[ti*3+1]+pix[ti*3+2])/3;
        // Criminisi: every pixel filled by this patch inherits the patch's confidence,
        // so the front decays as it moves inward and well-supported areas go first.
        unknown[ti] = 0; conf[ti] = bestC;
        remaining--;
      }
    }
    lastOffsets.unshift(bs - bp);
    if (lastOffsets.length > 8) lastOffsets.pop();
  }

  for (let i=0;i<N;i++){
    if (!hole[i]) continue;
    buf[i*4]   = Math.min(255, Math.max(0, pix[i*3]));
    buf[i*4+1] = Math.min(255, Math.max(0, pix[i*3+1]));
    buf[i*4+2] = Math.min(255, Math.max(0, pix[i*3+2]));
  }
  return true;
}

/** Jacobi diffusion — fallback when a hole is so large there isn't enough clean source
 *  texture around it for PatchMatch to draw on. */
function diffuseFill(buf, cw, ch, hole, iters){
  for (let c=0;c<3;c++){
    const f = new Float32Array(cw*ch);
    let sum=0, n=0;
    for (let i=0;i<f.length;i++){ f[i] = buf[i*4+c]; if (!hole[i]){ sum+=f[i]; n++; } }
    const mean = n ? sum/n : 128;
    for (let i=0;i<f.length;i++) if (hole[i]) f[i] = mean;
    const g = new Float32Array(f);
    for (let k=0;k<iters;k++){
      for (let y=1;y<ch-1;y++) for (let x=1;x<cw-1;x++){
        const i=y*cw+x;
        if (!hole[i]) continue;
        g[i] = (f[i-1]+f[i+1]+f[i-cw]+f[i+cw])*0.25;
      }
      f.set(g);
    }
    for (let i=0;i<f.length;i++) if (hole[i]) buf[i*4+c] = f[i];
  }
}
function addGrain(buf, cw, ch, hole, amp){
  if (amp <= 0) return;
  let seed = 12345;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff - 0.5; };
  for (let i=0;i<cw*ch;i++){
    if (!hole[i]) continue;
    const n = rnd()*amp*2;
    for (let c=0;c<3;c++) buf[i*4+c] = Math.min(255, Math.max(0, buf[i*4+c] + n));
  }
}
function ringNoise(buf, cw, ch, hole){
  // Rough high-frequency amplitude just outside the hole, so the fill matches its grain.
  let sum=0, n=0;
  for (let y=2;y<ch-2;y++) for (let x=2;x<cw-2;x++){
    const i=y*cw+x;
    if (hole[i]) continue;
    const v = buf[i*4], lo = (buf[(i-1)*4]+buf[(i+1)*4]+buf[(i-cw)*4]+buf[(i+cw)*4])*0.25;
    sum += Math.abs(v-lo); n++;
  }
  return n ? sum/n : 0;
}

/** Fill `hole` in an RGBA buffer, in place.
 *  Returns { ok, method } — ok is false when it had to fall back to diffusion,
 *  which is the honest signal that the hole was too big for the texture around it. */
function fill(buf, w, h, hole, userOpts) {
  const o = Object.assign({}, CB_INPAINT_DEFAULTS, userOpts || {});
  let seed = o.seed >>> 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const done = o.method === 'criminisi'
    ? criminisiFill(buf, w, h, hole, o.criminisiPatch, rnd)
    : patchMatchFill(buf, w, h, hole, o.patch, o.iters, o.outer);

  if (done) return { ok: true, method: o.method === 'criminisi' ? 'structure-first' : 'texture' };

  if (o.fallback) {
    // Fallback only: the exemplar fills copy real grain and need none of this.
    const amp = o.grain ? ringNoise(buf, w, h, hole) : 0;
    diffuseFill(buf, w, h, hole, o.diffuseIters);
    if (o.grain) addGrain(buf, w, h, hole, amp);
  }
  return { ok: false, method: 'diffusion (not enough source texture)' };
}

global.CBInpaint = {
  defaults: CB_INPAINT_DEFAULTS,
  fill,
  // the pieces, for callers that want to drive them directly
  dilate, patchMatchFill, criminisiFill, diffuseFill, addGrain, ringNoise,
};
})(typeof window !== 'undefined' ? window : globalThis);
