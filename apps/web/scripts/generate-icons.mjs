// Generates placeholder PWA icons (a white die on the brand purple) into public/.
// Dependency-free: writes PNGs by hand with node:zlib. Run: `bun run icons`.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const BG = [0x6c, 0x3c, 0xf4];
const DIE = [0xff, 0xff, 0xff];
const PIP = [0x2b, 0x17, 0x6b];

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
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// dieScale: die size relative to the canvas (smaller for maskable safe zone).
function icon(size, dieScale) {
  const die = size * dieScale;
  const x0 = (size - die) / 2;
  const radius = die * 0.2;
  const pipR = die * 0.09;
  const pips = [
    [0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73],
  ].map(([px, py]) => [x0 + px * die, x0 + py * die]);

  const inRoundedRect = (x, y) => {
    const lx = x - x0, ly = y - x0;
    if (lx < 0 || ly < 0 || lx > die || ly > die) return false;
    const cx = Math.min(Math.max(lx, radius), die - radius);
    const cy = Math.min(Math.max(ly, radius), die - radius);
    return (lx - cx) ** 2 + (ly - cy) ** 2 <= radius ** 2;
  };

  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      let color = BG;
      if (inRoundedRect(px, py)) {
        color = pips.some(([cx, cy]) => (px - cx) ** 2 + (py - cy) ** 2 <= pipR ** 2) ? PIP : DIE;
      }
      raw.set(color, y * (size * 3 + 1) + 1 + x * 3);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const icons = {
  "pwa-192x192.png": icon(192, 0.62),
  "pwa-512x512.png": icon(512, 0.62),
  "maskable-512x512.png": icon(512, 0.5),
  "apple-touch-icon.png": icon(180, 0.62),
  "favicon.png": icon(64, 0.75),
};
for (const [name, png] of Object.entries(icons)) {
  writeFileSync(out(name), png);
  console.log(`wrote public/${name}`);
}
