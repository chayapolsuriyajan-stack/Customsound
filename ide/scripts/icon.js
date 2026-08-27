/**
 * Generates the app icon from the design tokens, so the icon cannot drift from
 * the palette. A hand-rolled PNG encoder is ~50 lines and avoids adding an
 * image library to devDependencies for one 512x512 file.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 512;
const BG = [0x00, 0x00, 0x00];
const SURFACE = [0x52, 0x11, 0x11];
const PRIMARY = [0xff, 0xb9, 0x00];
const ACCENT = [0xf7, 0x82, 0x00];
const BORDER = [0xa3, 0xa3, 0xa3];

const px = new Uint8Array(S * S * 4);
const set = ([r, g, b], x, y, a = 255) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
};

// Ground, then a maroon plate inset with a 2px bezel -- the same nested-surface
// idea the app chrome uses, at icon scale.
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) set(BG, x, y);
const M = 56;
for (let y = M; y < S - M; y++) {
  for (let x = M; x < S - M; x++) {
    const edge = y === M || y === S - M - 1 || x === M || x === S - M - 1;
    set(edge ? BORDER : SURFACE, x, y);
  }
}
// Lit top edge.
for (let x = M + 1; x < S - M - 1; x++) set([0x7a, 0x33, 0x33], x, M + 1);

/** Thick line, used to draw the chevron and the bar. */
const line = (colour, x0, y0, x1, y1, w) => {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps);
    const y = Math.round(y0 + ((y1 - y0) * s) / steps);
    for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) {
      if (dx * dx + dy * dy <= w * w) set(colour, x + dx, y + dy);
    }
  }
};

// "</>" reduced to its essentials: a chevron and a slash.
line(PRIMARY, 200, 180, 130, 256, 13);
line(PRIMARY, 130, 256, 200, 332, 13);
line(ACCENT, 312, 180, 382, 256, 13);
line(ACCENT, 382, 256, 312, 332, 13);
line(PRIMARY, 290, 160, 222, 352, 9);

/* --- minimal PNG encoder ------------------------------------------------- */

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;    // bit depth
ihdr[9] = 6;    // RGBA
// Each scanline is prefixed with a filter byte; 0 means "none".
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'icons', 'icon.png');
writeFileSync(out, png);
console.log(`icon.png  ${(png.length / 1024).toFixed(1)} KB`);
