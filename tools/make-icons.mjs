#!/usr/bin/env node
/**
 * Generates the app icons with zero dependencies: a tiny software rasteriser
 * plus a hand-rolled PNG encoder (Node's zlib does the deflate).
 *   node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------- PNG */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                       // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- rasteriser */
const SHIP = [[0.82, 0], [-0.45, 0.56], [-0.22, 0], [-0.45, -0.56]];
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(size, pad = 0.16) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3;                                    // supersampling
  const R = size / 2;
  const shipScale = R * (1 - pad) * 0.52;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          const nx = (px - R) / R, ny = (py - R) / R;
          const d = Math.hypot(nx, ny);

          // rounded-square backdrop
          const q = Math.max(Math.abs(nx), Math.abs(ny));
          const corner = Math.hypot(Math.max(0, Math.abs(nx) - 0.72), Math.max(0, Math.abs(ny) - 0.72));
          const inBg = q <= 1 && corner <= 0.28;
          if (!inBg) continue;

          let r = 5 + 16 * (1 - d), g = 8 + 20 * (1 - d), b = 20 + 44 * (1 - d);
          // core glow
          const glow = Math.exp(-(d * d) / 0.09);
          r += 30 * glow; g += 190 * glow; b += 220 * glow;

          // orbit arcs
          const ringR = 0.74, ringW = 0.055;
          const ang = Math.atan2(ny, nx);
          const seg = ((ang + Math.PI * 2) % ((Math.PI * 2) / 3)) / ((Math.PI * 2) / 3);
          if (Math.abs(d - ringR) < ringW && seg < 0.66) {
            const k = 1 - Math.abs(d - ringR) / ringW;
            r += 60 * k; g += 230 * k; b += 255 * k;
          }
          // ship
          const sxx = (px - R) / shipScale, syy = (py - R) / shipScale;
          if (inPoly(-syy, sxx, SHIP)) { r = 240; g = 253; b = 255; }

          rr += Math.min(255, r); gg += Math.min(255, g); bb += Math.min(255, b); aa += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(rr / n); buf[i + 1] = Math.round(gg / n);
      buf[i + 2] = Math.round(bb / n); buf[i + 3] = Math.round(aa / n);
    }
  }
  return buf;
}

for (const size of [192, 512, 180]) {
  const png = encodePng(size, size, render(size, size === 180 ? 0.0 : 0.1));
  writeFileSync(join(OUT, `icon-${size}.png`), png);
  console.log(`assets/icon-${size}.png  ${(png.length / 1024).toFixed(1)} KB`);
}

// Maskable variant: extra safe-zone padding so platform masks never clip the mark.
writeFileSync(join(OUT, 'icon-maskable-512.png'), encodePng(512, 512, render(512, 0.34)));
console.log('assets/icon-maskable-512.png');
