/* Casa Blanca Studio — QR encoder (ISO/IEC 18004).
   Zero dependencies so the tool keeps working offline, like every other studio tool.

   Usage:
     var qr = QRCore.encode('https://casa-blanca.com', { ecl: 'H' });
     qr.size            // module count per side (21..177)
     qr.isDark(r, c)    // true when the module at row r / column c is dark
     qr.version         // 1..40
     qr.ecl             // 'L' | 'M' | 'Q' | 'H'  (may be boosted above what was asked for)
     qr.mask            // 0..7

   Throws a RangeError when the text does not fit at the requested correction level. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QRCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ECL_ORDER = ['L', 'M', 'Q', 'H'];
  var ECL_FORMAT_BITS = [1, 0, 3, 2]; // the format-info value for L, M, Q, H

  var MODE = {
    NUMERIC:      { bits: 0x1, cc: [10, 12, 14] },
    ALPHANUMERIC: { bits: 0x2, cc: [9, 11, 13] },
    BYTE:         { bits: 0x4, cc: [8, 16, 16] }
  };

  var ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

  /* Error-correction codewords per block, indexed [ecl][version]. Index 0 is unused
     so a version number can be used directly as the index. */
  var ECC_PER_BLOCK = [
    [-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];

  /* Number of error-correction blocks, indexed [ecl][version]. */
  var NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2,  4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5,  5,  5,  8,  9,  9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8,  8,  8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8,  8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];

  /* ── Galois field GF(256), primitive polynomial 0x11D ── */

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  /* Coefficients of the generator polynomial for `degree` EC codewords,
     highest power first, with the implicit leading 1 omitted. */
  function rsDivisor(degree) {
    var result = new Uint8Array(degree);
    result[degree - 1] = 1;
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < degree; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    var result = new Uint8Array(divisor.length);
    for (var k = 0; k < data.length; k++) {
      var factor = data[k] ^ result[0];
      result.copyWithin(0, 1);
      result[result.length - 1] = 0;
      for (var i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
    }
    return result;
  }

  /* ── Capacity math ── */

  /* Total modules available to data + EC (in bits) for a version. */
  function rawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function numDataCodewords(ver, ecl) {
    return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
  }

  function numCharCountBits(mode, ver) {
    return mode.cc[Math.floor((ver + 7) / 17)];
  }

  /* ── Segments ── */

  function isNumeric(text) { return /^[0-9]*$/.test(text); }
  function isAlnum(text) { return /^[0-9A-Z $%*+.\/:-]*$/.test(text); }

  function toUtf8(text) {
    var out = [];
    var esc = encodeURI(text);
    for (var i = 0; i < esc.length; i++) {
      if (esc.charAt(i) !== '%') out.push(esc.charCodeAt(i));
      else { out.push(parseInt(esc.substr(i + 1, 2), 16)); i += 2; }
    }
    return out;
  }

  function pushBits(bits, val, len) {
    for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  }

  function makeSegment(text) {
    var bits = [];
    var i;
    if (isNumeric(text)) {
      for (i = 0; i < text.length; ) {
        var n = Math.min(text.length - i, 3);
        pushBits(bits, parseInt(text.substr(i, n), 10), n * 3 + 1);
        i += n;
      }
      return { mode: MODE.NUMERIC, numChars: text.length, bits: bits };
    }
    if (isAlnum(text)) {
      for (i = 0; i + 2 <= text.length; i += 2) {
        pushBits(bits, ALNUM.indexOf(text.charAt(i)) * 45 + ALNUM.indexOf(text.charAt(i + 1)), 11);
      }
      if (i < text.length) pushBits(bits, ALNUM.indexOf(text.charAt(i)), 6);
      return { mode: MODE.ALPHANUMERIC, numChars: text.length, bits: bits };
    }
    var bytes = toUtf8(text);
    for (i = 0; i < bytes.length; i++) pushBits(bits, bytes[i], 8);
    return { mode: MODE.BYTE, numChars: bytes.length, bits: bits };
  }

  function segmentBits(seg, ver) {
    var cc = numCharCountBits(seg.mode, ver);
    if (seg.numChars >= (1 << cc)) return Infinity;
    return 4 + cc + seg.bits.length;
  }

  /* ── The code itself ── */

  function QrCode(version, eclIndex, dataCodewords, mask) {
    this.version = version;
    this.ecl = ECL_ORDER[eclIndex];
    this.size = version * 4 + 17;

    var size = this.size, r, c;
    this.modules = [];
    this.isFunction = [];
    for (r = 0; r < size; r++) {
      this.modules.push(new Array(size).fill(false));
      this.isFunction.push(new Array(size).fill(false));
    }

    this.eclIndex = eclIndex;
    this.drawFunctionPatterns();
    this.drawCodewords(this.addEccAndInterleave(dataCodewords));

    if (mask < 0) { // pick the mask with the lowest penalty, as the spec prescribes
      var minPenalty = Infinity;
      for (var i = 0; i < 8; i++) {
        this.applyMask(i);
        this.drawFormatBits(i);
        var penalty = this.penaltyScore();
        if (penalty < minPenalty) { mask = i; minPenalty = penalty; }
        this.applyMask(i); // undo (XOR is its own inverse)
      }
    }
    this.mask = mask;
    this.applyMask(mask);
    this.drawFormatBits(mask);
    this.isFunction = null;
  }

  QrCode.prototype.isDark = function (r, c) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size && this.modules[r][c];
  };

  QrCode.prototype.setFn = function (r, c, dark) {
    this.modules[r][c] = dark;
    this.isFunction[r][c] = true;
  };

  QrCode.prototype.drawFunctionPatterns = function () {
    var size = this.size, i, j;

    for (i = 0; i < size; i++) { // timing patterns
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }

    this.drawFinder(3, 3);
    this.drawFinder(3, size - 4);
    this.drawFinder(size - 4, 3);

    var align = this.alignmentPositions();
    for (i = 0; i < align.length; i++) {
      for (j = 0; j < align.length; j++) {
        var skip = (i === 0 && j === 0) ||
                   (i === 0 && j === align.length - 1) ||
                   (i === align.length - 1 && j === 0);
        if (!skip) this.drawAlignment(align[i], align[j]);
      }
    }

    this.drawFormatBits(0); // reserved now, overwritten once the mask is known
    this.drawVersionBits();
  };

  QrCode.prototype.drawFinder = function (r, c) {
    for (var dr = -4; dr <= 4; dr++) {
      for (var dc = -4; dc <= 4; dc++) {
        var dist = Math.max(Math.abs(dr), Math.abs(dc));
        var rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < this.size && cc >= 0 && cc < this.size) {
          this.setFn(rr, cc, dist !== 2 && dist !== 4);
        }
      }
    }
  };

  QrCode.prototype.drawAlignment = function (r, c) {
    for (var dr = -2; dr <= 2; dr++) {
      for (var dc = -2; dc <= 2; dc++) {
        this.setFn(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }
  };

  QrCode.prototype.alignmentPositions = function () {
    if (this.version === 1) return [];
    var num = Math.floor(this.version / 7) + 2;
    var step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (num * 2 - 2)) * 2;
    var result = [6];
    for (var pos = this.size - 7; result.length < num; pos -= step) result.splice(1, 0, pos);
    return result;
  };

  QrCode.prototype.drawFormatBits = function (mask) {
    var data = ECL_FORMAT_BITS[this.eclIndex] << 3 | mask;
    var rem = data;
    for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    var size = this.size, i;

    function bit(n) { return ((bits >>> n) & 1) !== 0; }

    for (i = 0; i <= 5; i++) this.setFn(i, 8, bit(i));
    this.setFn(7, 8, bit(6));
    this.setFn(8, 8, bit(7));
    this.setFn(8, 7, bit(8));
    for (i = 9; i < 15; i++) this.setFn(8, 14 - i, bit(i));

    for (i = 0; i < 8; i++) this.setFn(8, size - 1 - i, bit(i));
    for (i = 8; i < 15; i++) this.setFn(size - 15 + i, 8, bit(i));
    this.setFn(size - 8, 8, true); // the always-dark module
  };

  QrCode.prototype.drawVersionBits = function () {
    if (this.version < 7) return;
    var rem = this.version;
    for (var k = 0; k < 12; k++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = this.version << 12 | rem;
    for (var i = 0; i < 18; i++) {
      var dark = ((bits >>> i) & 1) !== 0;
      var a = this.size - 11 + (i % 3);
      var b = Math.floor(i / 3);
      this.setFn(b, a, dark);
      this.setFn(a, b, dark);
    }
  };

  /* Splits the data into blocks, appends Reed-Solomon codewords, and interleaves
     both halves the way the spec lays them out on the symbol. */
  QrCode.prototype.addEccAndInterleave = function (data) {
    var ver = this.version, ecl = this.eclIndex;
    var numBlocks = NUM_BLOCKS[ecl][ver];
    var blockEccLen = ECC_PER_BLOCK[ecl][ver];
    var rawCodewords = Math.floor(rawDataModules(ver) / 8);
    var numShort = numBlocks - rawCodewords % numBlocks;
    var shortLen = Math.floor(rawCodewords / numBlocks);

    var blocks = [];
    var divisor = rsDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortLen - blockEccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, divisor);
      if (i < numShort) dat.push(0); // keeps every block the same length while interleaving
      for (var e = 0; e < ecc.length; e++) dat.push(ecc[e]);
      blocks.push(dat);
    }

    var result = [];
    for (var b = 0; b < blocks[0].length; b++) {
      for (var j = 0; j < blocks.length; j++) {
        if (b !== shortLen - blockEccLen || j >= numShort) result.push(blocks[j][b]);
      }
    }
    return result;
  };

  /* Zig-zags up and down the two-module-wide columns, right to left. */
  QrCode.prototype.drawCodewords = function (data) {
    var size = this.size, i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // the vertical timing pattern is not a data column
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var c = right - j;
          var upward = ((right + 1) & 2) === 0;
          var r = upward ? size - 1 - vert : vert;
          if (!this.isFunction[r][c] && i < data.length * 8) {
            this.modules[r][c] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
          // any leftover remainder modules stay light, per the spec
        }
      }
    }
  };

  QrCode.prototype.applyMask = function (mask) {
    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) {
        if (this.isFunction[r][c]) continue;
        var invert;
        switch (mask) {
          case 0: invert = (r + c) % 2 === 0; break;
          case 1: invert = r % 2 === 0; break;
          case 2: invert = c % 3 === 0; break;
          case 3: invert = (r + c) % 3 === 0; break;
          case 4: invert = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
          case 5: invert = r * c % 2 + r * c % 3 === 0; break;
          case 6: invert = (r * c % 2 + r * c % 3) % 2 === 0; break;
          case 7: invert = ((r + c) % 2 + r * c % 3) % 2 === 0; break;
          default: throw new Error('bad mask');
        }
        this.modules[r][c] = this.modules[r][c] !== invert;
      }
    }
  };

  QrCode.prototype.penaltyScore = function () {
    var size = this.size, result = 0, r, c;
    var N1 = 3, N2 = 3, N3 = 40, N4 = 10;

    // Rule 1 — runs of five or more same-coloured modules in a row or column.
    // Rule 3 is folded in here via the finder-like 1:1:3:1:1 run detector.
    for (r = 0; r < size; r++) {
      var runColor = false, runLen = 0, history = [0, 0, 0, 0, 0, 0, 0];
      for (c = 0; c < size; c++) {
        if (this.modules[r][c] === runColor) {
          runLen++;
          if (runLen === 5) result += N1;
          else if (runLen > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runLen, history);
          if (!runColor) result += this.finderPenaltyCountPatterns(history) * N3;
          runColor = this.modules[r][c];
          runLen = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runLen, history) * N3;
    }
    for (c = 0; c < size; c++) {
      var runColorV = false, runLenV = 0, historyV = [0, 0, 0, 0, 0, 0, 0];
      for (r = 0; r < size; r++) {
        if (this.modules[r][c] === runColorV) {
          runLenV++;
          if (runLenV === 5) result += N1;
          else if (runLenV > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runLenV, historyV);
          if (!runColorV) result += this.finderPenaltyCountPatterns(historyV) * N3;
          runColorV = this.modules[r][c];
          runLenV = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColorV, runLenV, historyV) * N3;
    }

    // Rule 2 — 2x2 blocks of one colour.
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var col = this.modules[r][c];
        if (col === this.modules[r][c + 1] && col === this.modules[r + 1][c] && col === this.modules[r + 1][c + 1]) {
          result += N2;
        }
      }
    }

    // Rule 4 — deviation from a 50/50 balance of dark and light.
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (this.modules[r][c]) dark++;
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * N4;
    return result;
  };

  QrCode.prototype.finderPenaltyCountPatterns = function (history) {
    var n = history[1];
    var core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
    return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) +
           (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
  };

  QrCode.prototype.finderPenaltyTerminateAndCount = function (currentRunColor, currentRunLength, history) {
    if (currentRunColor) { // dark runs end the line; count the light margin as the terminator
      this.finderPenaltyAddHistory(currentRunLength, history);
      currentRunLength = 0;
    }
    currentRunLength += this.size;
    this.finderPenaltyAddHistory(currentRunLength, history);
    return this.finderPenaltyCountPatterns(history);
  };

  QrCode.prototype.finderPenaltyAddHistory = function (currentRunLength, history) {
    if (history[0] === 0) currentRunLength += this.size; // the quiet zone counts as light
    history.pop();
    history.unshift(currentRunLength);
  };

  /* ── Public entry point ── */

  function encode(text, opts) {
    opts = opts || {};
    var wantEcl = ECL_ORDER.indexOf((opts.ecl || 'M').toUpperCase());
    if (wantEcl < 0) throw new RangeError('Unknown error-correction level');
    var boost = opts.boost !== false;
    var minVersion = Math.max(1, Math.min(40, opts.minVersion || 1));
    var mask = typeof opts.mask === 'number' ? opts.mask : -1;

    var seg = String(text).length ? makeSegment(String(text)) : null;

    var version, dataUsedBits;
    for (version = minVersion; ; version++) {
      if (version > 40) {
        throw new RangeError('Too much data for one QR code — shorten the content or lower the error correction.');
      }
      var capacityBits = numDataCodewords(version, wantEcl) * 8;
      var usedBits = seg ? segmentBits(seg, version) : 0;
      if (usedBits <= capacityBits) { dataUsedBits = usedBits; break; }
    }

    var ecl = wantEcl;
    if (boost) { // spend any spare room on stronger error correction, free of charge
      for (var i = wantEcl + 1; i < 4; i++) {
        if (dataUsedBits <= numDataCodewords(version, i) * 8) ecl = i;
      }
    }

    var bits = [];
    if (seg) {
      pushBits(bits, seg.mode.bits, 4);
      pushBits(bits, seg.numChars, numCharCountBits(seg.mode, version));
      for (var b = 0; b < seg.bits.length; b++) bits.push(seg.bits[b]);
    }

    var dataCapacityBits = numDataCodewords(version, ecl) * 8;
    var t = Math.min(4, dataCapacityBits - bits.length);
    for (var z = 0; z < t; z++) bits.push(0);              // terminator
    while (bits.length % 8 !== 0) bits.push(0);            // pad to a whole codeword
    for (var pad = 0xEC; bits.length < dataCapacityBits; pad ^= 0xEC ^ 0x11) {
      pushBits(bits, pad, 8);                              // alternating pad codewords
    }

    var codewords = [];
    for (var k = 0; k < bits.length; k += 8) {
      var byte = 0;
      for (var j = 0; j < 8; j++) byte = (byte << 1) | bits[k + j];
      codewords.push(byte);
    }

    return new QrCode(version, ecl, codewords, mask);
  }

  /* Largest number of characters that still fits, for the UI's counter. */
  function capacity(text, ecl) {
    var eclIndex = ECL_ORDER.indexOf((ecl || 'M').toUpperCase());
    var bitsPerChar;
    if (isNumeric(text)) bitsPerChar = 10 / 3;
    else if (isAlnum(text)) bitsPerChar = 11 / 2;
    else bitsPerChar = 8;
    var maxBits = numDataCodewords(40, eclIndex) * 8 - 4 - 16;
    return Math.floor(maxBits / bitsPerChar);
  }

  return { encode: encode, capacity: capacity, LEVELS: ECL_ORDER.slice() };
});
