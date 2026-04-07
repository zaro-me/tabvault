/**
 * Generates PNG icons for the TabVault extension using only Node.js built-ins.
 * Run: node scripts/generate-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';

// ── CRC32 ──────────────────────────────────────────────────────────────────

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG chunk helper ───────────────────────────────────────────────────────

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf  = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf  = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── PNG builder ────────────────────────────────────────────────────────────

function makePNG(size, drawPixel) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = ihdr[11] = ihdr[12] = 0;

  const stride = 1 + size * 3;
  const raw = Buffer.allocUnsafe(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const [r, g, b] = drawPixel(x, y, size);
      const i = y * stride + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }

  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Icon design ────────────────────────────────────────────────────────────
// Indigo background (#4f46e5 → #312e81 gradient) with a white vault door.

function drawTabVaultIcon(x, y, size) {
  const s = size;
  const cx = s / 2, cy = s / 2;

  // Background gradient: indigo top → deep indigo bottom
  const t = y / s;
  const bg = [
    Math.round(79  + t * (49  - 79)),
    Math.round(70  + t * (46  - 70)),
    Math.round(229 + t * (129 - 229)),
  ];

  // Rounded square outline (vault door) — occupies 60% of icon
  const margin = s * 0.18;
  const r = s * 0.12; // corner radius
  const inSquare =
    x > margin + r && x < s - margin - r && y > margin && y < s - margin ||
    x > margin     && x < s - margin     && y > margin + r && y < s - margin - r ||
    // corners
    Math.hypot(x - (margin + r),     y - (margin + r))     < r ||
    Math.hypot(x - (s - margin - r), y - (margin + r))     < r ||
    Math.hypot(x - (margin + r),     y - (s - margin - r)) < r ||
    Math.hypot(x - (s - margin - r), y - (s - margin - r)) < r;

  const thick = Math.max(1, Math.round(s * 0.065));
  const innerMargin = margin + thick;
  const innerR = r - thick / 2;
  const onBorder =
    inSquare && !(
      x > innerMargin + innerR && x < s - innerMargin - innerR && y > innerMargin && y < s - innerMargin ||
      x > innerMargin           && x < s - innerMargin           && y > innerMargin + innerR && y < s - innerMargin - innerR ||
      Math.hypot(x - (innerMargin + innerR),     y - (innerMargin + innerR))     < innerR ||
      Math.hypot(x - (s - innerMargin - innerR), y - (innerMargin + innerR))     < innerR ||
      Math.hypot(x - (innerMargin + innerR),     y - (s - innerMargin - innerR)) < innerR ||
      Math.hypot(x - (s - innerMargin - innerR), y - (s - innerMargin - innerR)) < innerR
    );

  // Central circle (lock dial)
  const dialR   = s * 0.14;
  const dialRim = s * 0.09;
  const onDial  = Math.hypot(x - cx, y - cy) < dialR && Math.hypot(x - cx, y - cy) > dialRim;
  const onDot   = Math.hypot(x - cx, y - (cy - dialR * 0.55)) < s * 0.04;

  if (onBorder || onDial || onDot) return [255, 255, 255];

  return bg;
}

// ── Generate ───────────────────────────────────────────────────────────────

mkdirSync('public/icons', { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const png = makePNG(size, drawTabVaultIcon);
  writeFileSync(`public/icons/icon${size}.png`, png);
  console.log(`✓ public/icons/icon${size}.png`);
}
