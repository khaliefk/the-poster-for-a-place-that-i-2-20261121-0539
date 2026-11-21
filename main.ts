// Velmara — a travel poster for a place that does not exist.
//
// main.ts draws one PNG travel poster (768 x 1024, portrait) and writes it
// to /output/entry.png. Pure Node 22, no dependencies, no network: every
// pixel is computed here with a small software rasterizer (2x supersampled,
// then box-downsampled), a hand-built geometric sans for the place name,
// and a deterministic seeded PRNG so repeated runs produce the same file.
//
// The place: VELMARA, isle of the hanging tide — one sea-stack island with
// a lighthouse, under a low amber sun, on a calm violet-teal sea at dusk.
// The image carries only the place name as text: no quotes, no ratings,
// no other copy.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 768;
const H = 1024;
const SS = 2; // supersample factor
const SW = W * SS;
const SH = H * SS;

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — the picture must be identical every run.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261121);

// ---------------------------------------------------------------------------
// Canvas: RGB bytes at 2x, drawn in 1x coordinates.
// ---------------------------------------------------------------------------
const px = new Uint8Array(SW * SH * 3);

type RGB = [number, number, number];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Blend src over dst at alpha (0..1), in place on the 2x buffer.
function blend(ix: number, iy: number, c: RGB, alpha: number): void {
  if (ix < 0 || iy < 0 || ix >= SW || iy >= SH) return;
  const o = (iy * SW + ix) * 3;
  px[o] = px[o] + (c[0] - px[o]) * alpha;
  px[o + 1] = px[o + 1] + (c[1] - px[o + 1]) * alpha;
  px[o + 2] = px[o + 2] + (c[2] - px[o + 2]) * alpha;
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB, alpha = 1): void {
  const x0 = Math.max(0, Math.floor(x * SS));
  const y0 = Math.max(0, Math.floor(y * SS));
  const x1 = Math.min(SW, Math.ceil((x + w) * SS));
  const y1 = Math.min(SH, Math.ceil((y + h) * SS));
  for (let iy = y0; iy < y1; iy++) {
    for (let ix = x0; ix < x1; ix++) blend(ix, iy, c, alpha);
  }
}

// Vertical gradient over a horizontal band (1x coords).
function vgrad(y0: number, y1: number, stops: Array<[number, RGB]>): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
    const t = (y - y0) / (y1 - y0);
    let c: RGB = stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        const lt = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0] || 1);
        c = mix(stops[i][1], stops[i + 1][1], lt);
        break;
      }
    }
    fillRect(0, y, W, 1, c);
  }
}

function circle(cx: number, cy: number, r: number, c: RGB, alpha = 1): void {
  const x0 = Math.max(0, Math.floor((cx - r) * SS));
  const y0 = Math.max(0, Math.floor((cy - r) * SS));
  const x1 = Math.min(SW, Math.ceil((cx + r) * SS));
  const y1 = Math.min(SH, Math.ceil((cy + r) * SS));
  for (let iy = y0; iy < y1; iy++) {
    const dy = (iy + 0.5) / SS - cy;
    for (let ix = x0; ix < x1; ix++) {
      const dx = (ix + 0.5) / SS - cx;
      if (dx * dx + dy * dy <= r * r) blend(ix, iy, c, alpha);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, alpha = 1): void {
  const x0 = Math.max(0, Math.floor((cx - rx) * SS));
  const y0 = Math.max(0, Math.floor((cy - ry) * SS));
  const x1 = Math.min(SW, Math.ceil((cx + rx) * SS));
  const y1 = Math.min(SH, Math.ceil((cy + ry) * SS));
  for (let iy = y0; iy < y1; iy++) {
    const dy = ((iy + 0.5) / SS - cy) / ry;
    for (let ix = x0; ix < x1; ix++) {
      const dx = ((ix + 0.5) / SS - cx) / rx;
      if (dx * dx + dy * dy <= 1) blend(ix, iy, c, alpha);
    }
  }
}

// Scanline polygon fill (1x coords).
function polygon(pts: Array<[number, number]>, c: RGB, alpha = 1): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.max(0, Math.floor(minY)); y < Math.min(H, Math.ceil(maxY)); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) {
        xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      fillRect(xs[i], y, xs[i + 1] - xs[i], 1, c, alpha);
    }
  }
}

// Thick line segment as a quad (1x coords).
function stroke(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB, alpha = 1): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  polygon(
    [
      [x1 + nx, y1 + ny],
      [x2 + nx, y2 + ny],
      [x2 - nx, y2 - ny],
      [x1 - nx, y1 - ny],
    ],
    c,
    alpha,
  );
}

// ---------------------------------------------------------------------------
// Geometric sans: glyphs as filled rectangles on a 5 x 7 grid, stroke 1 unit.
// Only the letters of VELMARA are needed.
// ---------------------------------------------------------------------------
type Rect = [number, number, number, number]; // x, y, w, h in grid units
const FONT: Record<string, Rect[]> = {
  V: [
    [0, 0, 1, 3],
    [1, 3, 1, 2],
    [2, 5, 1, 2],
    [3, 3, 1, 2],
    [4, 0, 1, 3],
  ],
  E: [
    [0, 0, 1, 7],
    [1, 0, 4, 1],
    [1, 3, 3, 1],
    [1, 6, 4, 1],
  ],
  L: [
    [0, 0, 1, 7],
    [1, 6, 4, 1],
  ],
  M: [
    [0, 0, 1, 7],
    [4, 0, 1, 7],
    [1, 1, 1, 1],
    [2, 2, 1, 1],
    [3, 1, 1, 1],
  ],
  A: [
    [2, 0, 1, 1],
    [1, 1, 1, 2],
    [3, 1, 1, 2],
    [0, 3, 1, 4],
    [4, 3, 1, 4],
    [1, 4, 3, 1],
  ],
  R: [
    [0, 0, 1, 7],
    [1, 0, 3, 1],
    [4, 1, 1, 2],
    [1, 3, 3, 1],
    [2, 4, 1, 1],
    [3, 5, 1, 1],
    [4, 6, 1, 1],
  ],
};

function drawText(text: string, x: number, y: number, unit: number, c: RGB, alpha = 1): void {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (!glyph) {
      cx += 6 * unit;
      continue;
    }
    for (const [gx, gy, gw, gh] of glyph) {
      fillRect(cx + gx * unit, y + gy * unit, gw * unit, gh * unit, c, alpha);
    }
    cx += 6 * unit;
  }
}

function textWidth(text: string, unit: number): number {
  return text.length * 6 * unit - unit;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const INDIGO: RGB = [27, 35, 64];
const VIOLET: RGB = [107, 74, 138];
const CORAL: RGB = [232, 115, 90];
const AMBER: RGB = [247, 178, 103];
const SUN: RGB = [255, 217, 160];
const CREAM: RGB = [255, 243, 212];
const SEA_TOP: RGB = [24, 74, 96];
const SEA_DEEP: RGB = [9, 32, 49];
const ISLAND: RGB = [13, 25, 44];
const ROCK: RGB = [10, 22, 38];
const MAUVE: RGB = [201, 138, 158];

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------
vgrad(0, 640, [
  [0, INDIGO],
  [0.42, VIOLET],
  [0.72, CORAL],
  [1, AMBER],
]);

// Early stars in the upper sky.
for (let i = 0; i < 46; i++) {
  const sx = rand() * W;
  const sy = rand() * 170;
  const sr = 0.8 + rand() * 1.4;
  circle(sx, sy, sr, CREAM, 0.25 + rand() * 0.45);
}

// Soft cloud bands.
ellipse(180, 240, 150, 16, MAUVE, 0.22);
ellipse(260, 252, 120, 13, MAUVE, 0.18);
ellipse(590, 300, 170, 15, MAUVE, 0.2);
ellipse(520, 312, 110, 12, MAUVE, 0.16);
ellipse(360, 480, 190, 14, [240, 170, 140], 0.18);

// Sun glow, then the disc: a warm vertical gradient, drawn strip by strip.
for (let i = 24; i >= 1; i--) {
  circle(470, 380, 80 + i * 7, [255, 190, 120], 0.02);
}
for (let y = 300; y < 460; y++) {
  const dy = y + 0.5 - 380;
  const half = Math.sqrt(Math.max(0, 80 * 80 - dy * dy));
  const t = (y - 300) / 160;
  const c = mix([255, 233, 190], [255, 179, 71], t);
  fillRect(470 - half, y, half * 2, 1, c);
}

// ---------------------------------------------------------------------------
// Sea
// ---------------------------------------------------------------------------
vgrad(620, H, [
  [0, SEA_TOP],
  [0.5, [16, 52, 74]],
  [1, SEA_DEEP],
]);
// Horizon glow where the sun meets the water.
fillRect(0, 616, W, 5, [255, 205, 140], 0.55);
fillRect(0, 621, W, 3, [255, 225, 170], 0.35);

// Sun reflection: shimmering dashes under the sun, fading with depth.
for (let y = 640; y < 990; y += 8) {
  const depth = (y - 640) / 350;
  const spread = 26 + depth * 105;
  const wdt = spread * (0.35 + rand() * 0.75);
  const cx = 470 + (rand() - 0.5) * spread * 0.5;
  const a = (0.14 + rand() * 0.28) * (1 - depth * 0.55);
  fillRect(cx - wdt / 2, y, wdt, 3, [255, 196, 130], a);
}
// Faint wave lines across the sea.
for (let i = 0; i < 34; i++) {
  const wy = 650 + rand() * 350;
  const wx = rand() * W;
  const wl = 30 + rand() * 90;
  fillRect(wx, wy, wl, 2, [120, 180, 200], 0.08 + rand() * 0.12);
}

// ---------------------------------------------------------------------------
// The landmark: one sea-stack island with a lighthouse, left of the sun.
// ---------------------------------------------------------------------------
// Lighthouse beam (drawn first so the island covers its base).
polygon(
  [
    [346, 548],
    [150, 500],
    [150, 590],
  ],
  [255, 235, 180],
  0.08,
);
polygon(
  [
    [346, 548],
    [120, 512],
    [120, 578],
  ],
  [255, 235, 180],
  0.05,
);

const island: Array<[number, number]> = [
  [252, 908],
  [272, 822],
  [283, 762],
  [294, 702],
  [308, 656],
  [330, 630],
  [360, 628],
  [374, 660],
  [384, 722],
  [398, 792],
  [408, 862],
  [414, 908],
];
polygon(island, ISLAND);

// Warm rim light on the sun-facing (right) edge of the stack: thin, soft.
polygon(
  [
    [360, 628],
    [364, 630],
    [376, 668],
    [386, 726],
    [398, 796],
    [408, 864],
    [411, 908],
    [406, 908],
    [402, 860],
    [392, 790],
    [380, 720],
    [370, 658],
  ],
  [255, 190, 120],
  0.32,
);

// Lighthouse tower on the flat top of the stack.
fillRect(338, 566, 16, 64, [22, 34, 58]);
fillRect(334, 556, 24, 10, [22, 34, 58]);
fillRect(338, 544, 16, 12, [30, 46, 74]);
fillRect(338, 560, 16, 2, CREAM, 0.85); // gallery rail, catches the sun
circle(346, 540, 7, [255, 240, 190]);
circle(346, 540, 13, [255, 220, 150], 0.5);
circle(346, 540, 22, [255, 210, 130], 0.22);

// Birds, kept clear of the name and its rule.
const birds: Array<[number, number, number]> = [
  [580, 300, 1],
  [624, 330, 0.8],
  [540, 356, 0.9],
  [664, 286, 0.7],
];
for (const [bx, by, s] of birds) {
  stroke(bx - 11 * s, by - 6 * s, bx, by, 3, INDIGO, 0.85);
  stroke(bx, by, bx + 11 * s, by - 6 * s, 3, INDIGO, 0.85);
}

// Foreground rocks framing the bottom corners.
polygon(
  [
    [0, H],
    [0, 986],
    [92, 966],
    [182, 986],
    [232, H],
  ],
  ROCK,
);
polygon(
  [
    [W, H],
    [W, 978],
    [688, 960],
    [618, 980],
    [556, H],
  ],
  ROCK,
);

// ---------------------------------------------------------------------------
// Type: the place name, big and centered, with a thin rule beneath it.
// ---------------------------------------------------------------------------
const NAME = "VELMARA";
const unit = 16;
const nameW = textWidth(NAME, unit);
const nameX = (W - nameW) / 2;
const nameY = 104;
// Soft shadow, then the cream face.
drawText(NAME, nameX + 5, nameY + 7, unit, [16, 22, 46], 0.55);
drawText(NAME, nameX, nameY, unit, CREAM);
// Rule under the name, with a small diamond at its centre.
fillRect(nameX + 8, nameY + 7 * unit + 26, nameW - 16, 3, CREAM, 0.9);
polygon(
  [
    [W / 2, nameY + 7 * unit + 20],
    [W / 2 + 8, nameY + 7 * unit + 27.5],
    [W / 2, nameY + 7 * unit + 35],
    [W / 2 - 8, nameY + 7 * unit + 27.5],
  ],
  CREAM,
);

// Thin cream frame, poster style.
fillRect(20, 20, W - 40, 3, CREAM, 0.85);
fillRect(20, H - 23, W - 40, 3, CREAM, 0.85);
fillRect(20, 20, 3, H - 40, CREAM, 0.85);
fillRect(W - 23, 20, 3, H - 40, CREAM, 0.85);

// ---------------------------------------------------------------------------
// Downsample 2x -> 1x (box average) and write the PNG.
// ---------------------------------------------------------------------------
const out = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) {
      const s =
        px[((2 * y * SW + 2 * x) * 3) + c] +
        px[((2 * y * SW + 2 * x + 1) * 3) + c] +
        px[(((2 * y + 1) * SW + 2 * x) * 3) + c] +
        px[(((2 * y + 1) * SW + 2 * x + 1) * 3) + c];
      out[o + c] = Math.round(s / 4);
    }
  }
}

function crc32(buf: Buffer): number {
  let table = (crc32 as unknown as { t?: Int32Array }).t;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as unknown as { t: Int32Array }).t = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0; // filter: none
  out.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = process.env.OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "entry.png");
writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
