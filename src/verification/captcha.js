// Image captcha generator — pure JavaScript, no native packages or fonts needed.
// Characters are drawn from a hand-made stroke font, then warped, rotated, recoloured
// and buried in decoy strokes + noise so simple OCR bots can't read them.

import crypto from 'node:crypto';
import zlib from 'node:zlib';

// No look-alikes (0/O, 1/I/L, 2/Z, 5/S, 8/B, G/6 ...).
export const CHARSET = 'ACDEFHJKMNPRTUVWXY34679';

// Stroke font on a 4 × 6 grid (x right, y down). Each glyph = list of polylines.
const P = [[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]];
const GLYPHS = {
  A: [[[0, 6], [2, 0], [4, 6]], [[0.9, 3.6], [3.1, 3.6]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.6]], [[1.4, 2.4], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3.2], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  P: [P],
  R: [P, [[2, 3], [4, 6]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 2.5], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  3: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1.5, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  4: [[[3, 6], [3, 0], [0, 4.2], [4, 4.2]]],
  6: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 4]]],
  7: [[[0, 0], [4, 0], [1.5, 6]]],
  9: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 2]]],
};

const rand = (min, max) => min + (crypto.randomInt(0, 1_000_000) / 1_000_000) * (max - min);

export function randomCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) code += CHARSET[crypto.randomInt(CHARSET.length)];
  return code;
}

// ── Tiny raster canvas ───────────────────────────────────────────────────────

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Float32Array(w * h * 3);
  }

  blend(x, y, [r, g, b], a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 3;
    this.px[i] += (r - this.px[i]) * a;
    this.px[i + 1] += (g - this.px[i + 1]) * a;
    this.px[i + 2] += (b - this.px[i + 2]) * a;
  }

  /** Anti-aliased thick line segment. */
  line(x1, y1, x2, y2, width, color, alpha = 1) {
    const r = width / 2;
    const minX = Math.floor(Math.min(x1, x2) - r - 1);
    const maxX = Math.ceil(Math.max(x1, x2) + r + 1);
    const minY = Math.floor(Math.min(y1, y2) - r - 1);
    const maxY = Math.ceil(Math.max(y1, y2) + r + 1);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
        const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
        const cover = Math.max(0, Math.min(1, r - d + 0.5));
        if (cover > 0) this.blend(x, y, color, cover * alpha);
      }
    }
  }

  polyline(points, width, color, alpha) {
    for (let i = 1; i < points.length; i++) this.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], width, color, alpha);
  }

  toPNG() {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 3 + 1)] = 0; // filter: none
      for (let x = 0; x < this.w * 3; x++) {
        raw[y * (this.w * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(this.px[y * this.w * 3 + x])));
      }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // RGB
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const hsl = (h, s, l) => {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
};

/** Splits polylines into small steps so the wave warp bends straight strokes. */
function subdivide(points, step = 0.35) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let s = 1; s <= n; s++) out.push([ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n]);
  }
  return out;
}

/**
 * Renders a captcha image for `code`. Returns a PNG buffer.
 * `difficulty` 0..2 adds more noise and distortion (used for risky accounts).
 */
export function renderCaptcha(code, { difficulty = 0 } = {}) {
  const W = 360;
  const H = 130;
  const c = new Canvas(W, H);
  const hue = rand(0, 360);

  // Background: soft diagonal gradient.
  const bgA = hsl(hue, 0.35, 0.93);
  const bgB = hsl((hue + 60) % 360, 0.35, 0.85);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x / W + y / H) / 2;
      const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) c.px[i + k] = bgA[k] + (bgB[k] - bgA[k]) * t;
    }
  }

  // Background noise: speckles + faint curves.
  for (let i = 0; i < 900 + difficulty * 500; i++) {
    c.blend(Math.floor(rand(0, W)), Math.floor(rand(0, H)), hsl(rand(0, 360), 0.5, rand(0.3, 0.7)), rand(0.2, 0.6));
  }
  for (let i = 0; i < 6; i++) {
    const pts = [];
    const y0 = rand(10, H - 10);
    const amp = rand(5, 25);
    const freq = rand(0.01, 0.04);
    const ph = rand(0, 6.28);
    for (let x = -5; x <= W + 5; x += 6) pts.push([x, y0 + Math.sin(x * freq + ph) * amp]);
    c.polyline(pts, rand(1, 2), hsl(rand(0, 360), 0.4, 0.6), 0.35);
  }

  // Global wave warp shared by all characters.
  const waveAmp = 3 + difficulty;
  const waveFreq = rand(0.03, 0.06);
  const wavePh = rand(0, 6.28);
  const warp = ([x, y]) => [x + Math.sin(y * 0.09 + wavePh) * 2, y + Math.sin(x * waveFreq + wavePh) * waveAmp];

  // Characters.
  const slot = (W - 40) / code.length;
  const strokeColors = [];
  [...code].forEach((ch, idx) => {
    const glyph = GLYPHS[ch];
    const size = Math.min(rand(10, 12.5), slot / 4.6); // pixels per grid unit
    const angle = rand(-0.35, 0.35);
    const skew = rand(-0.25, 0.25);
    const cx = 20 + slot * (idx + 0.5) + rand(-5, 5);
    const cy = H / 2 + rand(-8, 8);
    const color = hsl((hue + 180 + rand(-70, 70)) % 360, rand(0.55, 0.8), rand(0.22, 0.4));
    strokeColors.push(color);
    const width = rand(3.6, 4.6);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const line of glyph) {
      const pts = subdivide(line).map(([gx, gy]) => {
        let x = (gx - 2 + (gy - 3) * skew) * size * 0.85;
        const y = (gy - 3) * size;
        x += rand(-0.6, 0.6);
        return warp([cx + x * cos - y * sin, cy + x * sin + y * cos]);
      });
      c.polyline(pts, width, color, 1);
    }
  });

  // Decoy strokes in the same colours as the text, crossing the characters.
  for (let i = 0; i < 2 + difficulty; i++) {
    const color = strokeColors[crypto.randomInt(strokeColors.length)];
    const pts = [];
    const y0 = rand(H * 0.3, H * 0.7);
    const amp = rand(8, 20);
    const freq = rand(0.015, 0.035);
    const ph = rand(0, 6.28);
    const from = rand(0, W * 0.3);
    const to = rand(W * 0.7, W);
    for (let x = from; x <= to; x += 4) pts.push([x, y0 + Math.sin(x * freq + ph) * amp]);
    c.polyline(pts, rand(1.4, 2), color, 0.8);
  }

  // Foreground speckles over everything.
  for (let i = 0; i < 250 + difficulty * 250; i++) {
    c.blend(Math.floor(rand(0, W)), Math.floor(rand(0, H)), hsl(rand(0, 360), 0.6, rand(0.2, 0.8)), rand(0.4, 0.9));
  }

  return c.toPNG();
}
