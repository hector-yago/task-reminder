// Genera el logo (SVG) y los iconos PNG de la PWA sin dependencias: un check dentro de una flecha circular
// (tareas que se renuevan cada periodo) sobre degradado azul→turquesa.
// Uso: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const C1 = [0x1d, 0x4e, 0xd8];
const C2 = [0x0e, 0x9f, 0x9a];
const WHITE = [255, 255, 255];
const RING = { cx: 0.5, cy: 0.5, r: 0.3, w: 0.075 };
const A0 = (-20 * Math.PI) / 180; // inicio del arco
const A1 = (285 * Math.PI) / 180; // fin del arco (deja un hueco arriba a la derecha)
const CHECK = [[0.355, 0.51], [0.455, 0.615], [0.645, 0.4]];
const CHECK_W = 0.085;

const P = (a) => [RING.cx + RING.r * Math.cos(a), RING.cy + RING.r * Math.sin(a)];
const tip = P(A1);
const tan = [-Math.sin(A1), Math.cos(A1)];
const nor = [Math.cos(A1), Math.sin(A1)];
const HEAD = [
  [tip[0] + tan[0] * 0.115, tip[1] + tan[1] * 0.115],
  [tip[0] + nor[0] * 0.105, tip[1] + nor[1] * 0.105],
  [tip[0] - nor[0] * 0.105, tip[1] - nor[1] * 0.105],
];

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inArc(x, y) {
  const d = Math.hypot(x - RING.cx, y - RING.cy);
  if (Math.abs(d - RING.r) > RING.w / 2) return false;
  let a = Math.atan2(y - RING.cy, x - RING.cx);
  if (a < A0) a += 2 * Math.PI;
  return a >= A0 && a <= A1 + (a > A1 ? 0 : 0) && a <= A1;
}
const isWhite = (x, y) =>
  inArc(x, y) ||
  inPoly(x, y, HEAD) ||
  segDist(x, y, CHECK[0], CHECK[1]) <= CHECK_W / 2 ||
  segDist(x, y, CHECK[1], CHECK[2]) <= CHECK_W / 2;

function inRoundRect(x, y, r) {
  if (r <= 0) return true;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
const bg = (u, v) => {
  const t = (u + v) / 2;
  return C1.map((c, i) => c + (C2[i] - c) * t);
};

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
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, { radius, scale }) {
  const ss = 3;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          if (!inRoundRect(u, v, radius)) continue;
          const bu = (u - 0.5) / scale + 0.5;
          const bv = (v - 0.5) / scale + 0.5;
          const col = isWhite(bu, bv) ? WHITE : bg(u, v);
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
      const n = ss * ss;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const cov = a / 255;
      raw[o] = cov ? Math.round(r / cov) : 0;
      raw[o + 1] = cov ? Math.round(g / cov) : 0;
      raw[o + 2] = cov ? Math.round(b / cov) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const files = {
  'icon-192.png': png(192, { radius: 0.2, scale: 1 }),
  'icon-512.png': png(512, { radius: 0.2, scale: 1 }),
  'icon-maskable-512.png': png(512, { radius: 0, scale: 0.72 }),
  'apple-touch-icon.png': png(180, { radius: 0, scale: 0.9 }),
};
for (const [name, buf] of Object.entries(files)) writeFileSync(new URL(name, outDir), buf);

const S = 512;
const f = (n) => (n * S).toFixed(1);
const [sx, sy] = P(A0);
const [ex, ey] = P(A1);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#0e9f9a"/></linearGradient></defs>
<rect width="${S}" height="${S}" rx="${0.2 * S}" fill="url(#g)"/>
<path d="M${f(sx)} ${f(sy)} A${f(RING.r)} ${f(RING.r)} 0 1 1 ${f(ex)} ${f(ey)}" fill="none" stroke="#fff" stroke-width="${f(RING.w)}"/>
<polygon points="${HEAD.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="#fff"/>
<polyline points="${CHECK.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="none" stroke="#fff" stroke-width="${f(CHECK_W)}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
writeFileSync(new URL('icon.svg', outDir), svg);
console.log('Iconos generados:', Object.keys(files).join(', '), 'icon.svg');
